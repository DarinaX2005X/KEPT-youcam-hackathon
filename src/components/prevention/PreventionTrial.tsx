'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Hourglass, RotateCcw, ShieldCheck } from 'lucide-react';
import { activesFor, formatShortDate, type BlobRef, type Scan, type Trial } from '@/lib/domain';
import { blobUrl, getBlob } from '@/lib/store';
import { Button, PhotoPrint, StepProgress, Tag } from '@/components/ui';
import { CaptureView, type CaptureResult } from '@/components/capture';
import { EmptyPrint } from '@/components/wizard/EmptyPrint';
import { AgingViewer } from './AgingViewer';
import { AGING_STEPS, useAging } from './useAging';
import styles from './PreventionTrial.module.css';

export interface PreventionTrialProps {
  trial: Trial;
  scans: Scan[];
  /** Right end of the header, e.g. the trial menu. */
  headerAside?: ReactNode;
}

async function readPhoto(ref: BlobRef): Promise<Blob> {
  if ('url' in ref) {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`Photo ${res.status}`);
    return res.blob();
  }
  const blob = await getBlob(ref);
  if (!blob) throw new Error('Missing photo');
  return blob;
}

/**
 * A sunscreen kept for prevention. No verdict, chart or check-ins: what it does shows over years, so
 * the page offers YouCam Aging Simulation (2 units) on the saved day 0 photo, only when asked.
 */
export function PreventionTrial({ trial, scans, headerAside }: PreventionTrialProps) {
  const baseline = scans.find((s) => s.kind === 'baseline') ?? [...scans].sort((a, b) => a.day - b.day)[0];
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const storedSample = Boolean(trial.sample) || baseline?.capture.source === 'sample';
  const [sample, setSample] = useState(storedSample);
  const { run, start } = useAging();
  const actives = activesFor(trial.product.actives);

  useEffect(() => {
    let live = true;
    if (!baseline) return;
    blobUrl(baseline.photo).then(
      (u) => live && setPhotoUrl(u),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [baseline]);

  async function ageStored() {
    if (!baseline) {
      setCapturing(true);
      return;
    }
    let blob: Blob;
    try {
      blob = await readPhoto(baseline.photo);
    } catch {
      // The stored photo is gone: take a new one instead.
      setCapturing(true);
      return;
    }
    void start(blob);
  }

  function ageCaptured(result: CaptureResult) {
    setCapturing(false);
    setSample(result.meta.source === 'sample');
    void start(result.blob);
  }

  const running = run.status === 'running';
  const since = trial.decidedAt ?? trial.startedAt;

  let visual: ReactNode;
  if (run.status === 'done') {
    visual = <AgingViewer frames={run.frames} age={run.age} sample={sample} />;
  } else if (photoUrl) {
    visual = (
      <PhotoPrint
        src={photoUrl}
        alt="Your day 0 photo"
        label="Day 0"
        sublabel={storedSample ? 'Face generated with YouCam AI' : formatShortDate(baseline?.takenAt ?? trial.startedAt)}
        tilt={-1}
        priority
        className={clsx(styles.print, running && styles.printBusy)}
      >
        {running ? (
          <span className={styles.progressPlate}>
            <StepProgress steps={AGING_STEPS} current={run.step === 'done' ? null : run.step} aria-label="Aging progress" />
          </span>
        ) : null}
      </PhotoPrint>
    );
  } else {
    visual = (
      <EmptyPrint label="Today" sublabel="And over the years" tilt={-1} busy={running} className={styles.print}>
        {running ? <StepProgress steps={AGING_STEPS} current={run.step === 'done' ? null : run.step} aria-label="Aging progress" /> : null}
      </EmptyPrint>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <div className={styles.tags}>
            <Tag status="kept" />
            {trial.sample ? <Tag status="sample" /> : null}
          </div>
          {headerAside ? <div className={styles.aside}>{headerAside}</div> : null}
        </div>
        <h1 className={styles.title}>{trial.product.name}</h1>
        <p className={styles.protection}>
          <span className={styles.shield} aria-hidden>
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <span>
            Daily protection
            <span className={clsx(styles.since, 'num')}> since {formatShortDate(since)}</span>
          </span>
        </p>
        {actives.length ? <p className={styles.actives}>{actives.map((a) => a.name).join(', ')}</p> : null}
      </header>

      <div className={styles.visual}>{visual}</div>

      <div className={styles.body}>
        <section className={styles.explain} aria-labelledby="prevention-why">
          <h2 id="prevention-why" className={styles.explainTitle}>
            <Hourglass size={20} strokeWidth={1.75} aria-hidden />
            Sunscreen works over years, not weeks
          </h2>
          <p>
            Photos a few weeks apart can&apos;t show it working, so there are no check-ins for this product. What it prevents is the sun damage
            that builds up year after year.
          </p>
          <p className={styles.soft}>
            {run.status === 'done'
              ? 'Aging simulation by YouCam. Drag along the years to see your face at each age.'
              : baseline
                ? 'The aging simulation shows your day 0 photo across the years with YouCam.'
                : 'The aging simulation shows your face across the years with YouCam. It needs one photo.'}
          </p>
        </section>

        {run.status === 'error' ? (
          <p className={clsx(styles.error, run.limit && styles.limit)} role="alert">
            {run.message}
          </p>
        ) : null}

        {run.status !== 'done' ? (
          <div className={styles.actions}>
            {run.status === 'error' && !run.limit ? (
              <Button size="lg" icon={RotateCcw} onClick={() => void ageStored()} className={styles.primary}>
                Try again
              </Button>
            ) : run.status !== 'error' ? (
              <Button size="lg" onClick={() => void ageStored()} loading={running} className={styles.primary}>
                Show the aging simulation
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {capturing ? <CaptureView mode="baseline" title="Photo for the aging simulation" onCapture={ageCaptured} onCancel={() => setCapturing(false)} /> : null}
    </div>
  );
}
