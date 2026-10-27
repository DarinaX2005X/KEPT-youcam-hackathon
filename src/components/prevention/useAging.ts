'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, isScanError, SCAN_MESSAGES as MESSAGES, prepareImage, runAging, type ScanStep } from '@/lib/scan';
import type { AgingFrame } from './AgingViewer';

export const AGING_STEPS: { id: Exclude<ScanStep, 'done'>; label: string }[] = [
  { id: 'uploading', label: 'Uploading photo' },
  { id: 'analyzing', label: 'Aging the photo with YouCam' },
  { id: 'downloading', label: 'Saving the frames' },
];

export type AgingRun =
  | { status: 'idle' }
  | { status: 'running'; step: ScanStep | null }
  | { status: 'done'; age: number; frames: AgingFrame[] }
  | { status: 'error'; message: string; limit: boolean };

/**
 * One YouCam Aging Simulation (2 units) per call of `start`, never by itself.
 * The frames live as object URLs for the life of the component and are not saved.
 */
export function useAging() {
  const [run, setRun] = useState<AgingRun>({ status: 'idle' });
  const ctrl = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      ctrl.current?.abort();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const start = useCallback(async (photo: Blob) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setRun({ status: 'running', step: 'uploading' });
    try {
      const prepared = await prepareImage(photo);
      const out = await runAging(prepared.blob, (step) => !c.signal.aborted && setRun({ status: 'running', step }), { signal: c.signal });
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      const frames = out.frames.map((f) => ({ age: f.age, url: URL.createObjectURL(f.image) }));
      urls.current = frames.map((f) => f.url);
      setRun({ status: 'done', age: out.age, frames });
    } catch (err) {
      if (isAbortError(err)) return;
      const message = isScanError(err) ? err.message : MESSAGES.upstream;
      setRun({ status: 'error', message, limit: isScanError(err) && err.code === 'limit' });
    }
  }, []);

  /** Marks the run as failed before it reached YouCam, e.g. when the stored photo is missing. */
  const fail = useCallback((message: string) => setRun({ status: 'error', message, limit: false }), []);

  return { run, start, fail };
}
