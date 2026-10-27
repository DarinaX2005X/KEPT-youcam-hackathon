'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Concern } from '@/lib/domain/types';
import { isAbortError, MESSAGES, ScanError } from './errors';
import { resumeAnalysis, runAnalysis, type AnalysisOutcome, type RunOptions, type ScanStep } from './pipeline';
import { prepareImage } from './prepare';

/** Steps for <StepProgress steps={SCAN_STEPS} current={step} />. `done` is the finished state, not a row. */
export const SCAN_STEPS: { id: Exclude<ScanStep, 'done'>; label: string }[] = [
  { id: 'uploading', label: 'Uploading photo' },
  { id: 'analyzing', label: 'Analyzing skin with YouCam' },
  { id: 'downloading', label: 'Saving skin maps' },
];

export type ScanStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseScanRunOptions {
  /** Scale and re-encode the photo with prepareImage first (default true). */
  prepare?: boolean;
  poll?: Pick<RunOptions, 'intervalMs' | 'timeoutMs'>;
}

export interface UseScan {
  /** Analyzes the photo. Resolves with the outcome, or null when it failed (see `error`) or was cancelled. */
  run(photo: Blob, concerns: Concern[], options?: UseScanRunOptions): Promise<AnalysisOutcome | null>;
  /** After a timeout or dropped connection: polls the same YouCam task again. No new task, no new units. */
  resume(options?: Pick<UseScanRunOptions, 'poll'>): Promise<AnalysisOutcome | null>;
  /** Stops polling and downloads. The task on YouCam is not cancelled. */
  cancel(): void;
  /** Back to idle; also cancels a running scan. */
  reset(): void;
  step: ScanStep | null;
  status: ScanStatus;
  error: ScanError | null;
  outcome: AnalysisOutcome | null;
  /** True when `resume()` can continue the failed task. */
  canResume: boolean;
  /** performance.now() when each step started, for timing displays. */
  timings: Partial<Record<ScanStep, number>>;
}

function toScanError(err: unknown): ScanError {
  if (err instanceof ScanError) return err;
  console.warn('[scan] unexpected failure', err);
  return new ScanError('upstream', MESSAGES.upstream);
}

export function useScan(): UseScan {
  const [step, setStep] = useState<ScanStep | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [error, setError] = useState<ScanError | null>(null);
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [timings, setTimings] = useState<Partial<Record<ScanStep, number>>>({});
  const controller = useRef<AbortController | null>(null);
  const pollRef = useRef<UseScanRunOptions['poll']>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (work: (onStep: (s: ScanStep) => void, opts: RunOptions) => Promise<AnalysisOutcome>) => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const live = () => mounted.current && controller.current === ctrl;
      const onStep = (s: ScanStep) => {
        if (!live()) return;
        setStep(s);
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setTimings((prev) => (prev[s] === undefined ? { ...prev, [s]: t } : prev));
      };
      setStatus('running');
      setError(null);
      setOutcome(null);
      setTimings({});
      try {
        const result = await work(onStep, { ...pollRef.current, signal: ctrl.signal });
        if (!live()) return null;
        setOutcome(result);
        setStatus('done');
        return result;
      } catch (err) {
        if (!live()) return null;
        if (isAbortError(err)) {
          setStatus('idle');
          setStep(null);
          return null;
        }
        setError(toScanError(err));
        setStatus('error');
        return null;
      } finally {
        if (controller.current === ctrl) controller.current = null;
      }
    },
    [],
  );

  const run = useCallback<UseScan['run']>(
    (photo, concerns, options = {}) => {
      pollRef.current = options.poll;
      return execute(async (onStep, opts) => {
        let blob = photo;
        if (options.prepare !== false) {
          onStep('uploading');
          blob = (await prepareImage(photo)).blob;
          opts.signal?.throwIfAborted();
        }
        return runAnalysis(blob, concerns, onStep, opts);
      });
    },
    [execute],
  );

  const resume = useCallback<UseScan['resume']>(async (options = {}) => {
    const e = error;
    if (!e?.retryTaskId || e.retryKind !== 'analysis' || !e.fileId) return null;
    if (options.poll) pollRef.current = options.poll;
    return execute((onStep, opts) => resumeAnalysis(e.retryTaskId!, e.fileId!, onStep, opts));
  }, [error, execute]);

  const cancel = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStep(null);
    setStatus('idle');
    setError(null);
    setOutcome(null);
    setTimings({});
  }, []);

  const canResume = !!(error?.retryTaskId && error.retryKind === 'analysis' && error.fileId);
  return { run, resume, cancel, reset, step, status, error, outcome, canResume, timings };
}
