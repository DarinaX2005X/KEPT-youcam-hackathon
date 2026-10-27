'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { Button, StepProgress } from '@/components/ui';
import { CaptureView, type CaptureResult } from '@/components/capture';
import { isAbortError, isScanError, SCAN_MESSAGES as MESSAGES, prepareImage, runAging, type ScanStep } from '@/lib/scan';
import { EmptyPrint } from '@/components/wizard/EmptyPrint';
import { AgingViewer, type AgingFrame } from './AgingViewer';
import styles from './Prevention.module.css';

const AGING_STEPS: { id: Exclude<ScanStep, 'done'>; label: string }[] = [
  { id: 'uploading', label: 'Uploading photo' },
  { id: 'analyzing', label: 'Aging the photo with YouCam' },
  { id: 'downloading', label: 'Saving the frames' },
];

type Run =
  | { status: 'idle' }
  | { status: 'running'; step: ScanStep | null }
  | { status: 'done'; age: number; frames: AgingFrame[] }
  | { status: 'error'; message: string; limit: boolean };

export interface PreventionStepProps {
  productName: string;
  saving: boolean;
  onAddToShelf: () => void;
}

/**
 * Sunscreen has nothing to show in eight weeks, so instead of goals and check-ins Kept shows what it
 * prevents: the person's face across the years with YouCam Aging Simulation (2 units). The frames are
 * not saved.
 */
export function PreventionStep({ productName, saving, onAddToShelf }: PreventionStepProps) {
  const [capturing, setCapturing] = useState(false);
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const [sample, setSample] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      ctrl.current?.abort();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const age = useCallback(async (result: CaptureResult) => {
    setCapturing(false);
    setSample(result.meta.source === 'sample');
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setRun({ status: 'running', step: 'uploading' });
    try {
      const prepared = await prepareImage(result.blob);
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

  const running = run.status === 'running';

  return (
    <div className={styles.split}>
      <div className={styles.visualCol}>
        {run.status === 'done' ? (
          <AgingViewer frames={run.frames} age={run.age} sample={sample} />
        ) : (
          <EmptyPrint label="Today" sublabel="And over the years" tilt={-1} busy={running} className={styles.emptyPrint}>
            {running ? <StepProgress steps={AGING_STEPS} current={run.step === 'done' ? null : run.step} aria-label="Aging progress" /> : null}
          </EmptyPrint>
        )}
      </div>

      <div className={styles.main}>
        <h1 className={styles.title}>Sunscreen works over years, not weeks</h1>
        <p className={styles.lead}>
          A trial can&apos;t show sunscreen working in eight weeks. What it prevents is the sun damage that builds up over years.
        </p>

        {run.status === 'done' ? (
          <p className={styles.caption}>Aging simulation by YouCam. Daily sunscreen is the most reliable way to slow visible sun damage.</p>
        ) : null}

        {run.status === 'error' ? (
          <p className={clsx(styles.error, run.limit && styles.limit)} role="alert">
            {run.message}
          </p>
        ) : null}

        <p className={styles.shelfNote}>
          {productName.trim() || 'This product'} goes on your shelf as kept, with no check-ins to take.
        </p>

        <div className={styles.actions}>
          {run.status === 'idle' ? (
            <Button size="lg" icon={Camera} onClick={() => setCapturing(true)} className={styles.primary}>
              Show me with my photo
            </Button>
          ) : null}
          {run.status === 'error' && !run.limit ? (
            <Button size="lg" icon={RotateCcw} onClick={() => setCapturing(true)} className={styles.primary}>
              Try another photo
            </Button>
          ) : null}
          <Button size="lg" variant={run.status === 'idle' || (run.status === 'error' && !run.limit) ? 'secondary' : 'primary'} onClick={onAddToShelf} loading={saving} disabled={running} className={styles.primary}>
            Add to shelf
          </Button>
        </div>
      </div>

      {capturing ? <CaptureView mode="baseline" title="Photo for the aging simulation" onCapture={age} onCancel={() => setCapturing(false)} /> : null}
    </div>
  );
}
