'use client';

import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { Button, StepProgress } from '@/components/ui';
import { CaptureView, type CaptureResult } from '@/components/capture';
import { EmptyPrint } from '@/components/wizard/EmptyPrint';
import { AgingViewer } from './AgingViewer';
import { AGING_STEPS, useAging } from './useAging';
import styles from './Prevention.module.css';

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
  const [sample, setSample] = useState(false);
  const { run, start } = useAging();

  const age = useCallback(
    (result: CaptureResult) => {
      setCapturing(false);
      setSample(result.meta.source === 'sample');
      void start(result.blob);
    },
    [start],
  );

  const running = run.status === 'running';

  return (
    <div className={clsx(styles.split, run.status !== 'done' && styles.textFirst)}>
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
