'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { concernLabel, joinNouns, type DiaryEntry, type Scan, type Trial } from '@/lib/domain';
import { blobUrl, getTrial, listScans } from '@/lib/store';
import { SCAN_STEPS, useScan, type ScanErrorCode } from '@/lib/scan';
import { CaptureView, type CaptureResult } from '@/components/capture';
import { Button, IconButton, PhotoPrint, Skeleton, StepProgress, type Step } from '@/components/ui';
import { baselineOf } from '@/components/trial/model';
import { DiaryPanel } from './DiaryPanel';
import { TrialMissing } from './TrialMissing';
import { FROM_TRIAL_KEY, checkinConcerns, cleanDiary, photoDifference, saveCheckin, slotFor } from './checkinModel';
import styles from './CheckinFlow.module.css';

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; trial: Trial; scans: Scan[]; baseline: Scan | undefined; baseUrl?: string; now: Date };

type Phase = 'camera' | 'diary' | 'scan';

const STEPS: Step[] = [...SCAN_STEPS, { id: 'saving', label: 'Saving the check-in' }];

const ERROR_TITLE: Record<ScanErrorCode, string> = {
  face: "YouCam couldn't read your face in this photo",
  light: 'The light was too dim for a fair reading',
  limit: 'No free scans left today',
  network: 'The connection dropped',
  timeout: 'YouCam is taking longer than usual',
  upstream: "YouCam didn't finish this scan",
};

export interface CheckinFlowProps {
  trialId: string;
}

/** /trial/[id]/check-in: camera with the day 0 outline, a short diary, the scan, then back to the trial. */
export function CheckinFlow({ trialId }: CheckinFlowProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const scan = useScan();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [phase, setPhase] = useState<Phase>('camera');
  const [shot, setShot] = useState<{ result: CaptureResult; url: string } | null>(null);
  const [diary, setDiary] = useState<DiaryEntry>({});
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoaded({ status: 'loading' });
    try {
      const trial = await getTrial(trialId);
      if (!trial) return setLoaded({ status: 'missing' });
      const scans = await listScans(trialId);
      const baseline = baselineOf(scans);
      const baseUrl = baseline ? await blobUrl(baseline.photo).catch(() => undefined) : undefined;
      setLoaded({ status: 'ready', trial, scans, baseline, baseUrl, now: new Date() });
    } catch {
      setLoaded({ status: 'error' });
    }
  }, [trialId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trial = loaded.status === 'ready' ? loaded.trial : undefined;
  useEffect(() => {
    if (trial) document.title = `${trial.product.name} check-in · Kept`;
  }, [trial]);

  useEffect(() => () => (shot ? URL.revokeObjectURL(shot.url) : undefined), [shot]);

  const slot = useMemo(() => (loaded.status === 'ready' ? slotFor(loaded.trial, loaded.scans, loaded.now) : null), [loaded]);
  const concerns = useMemo(() => (trial ? checkinConcerns(trial) : []), [trial]);

  function leave() {
    let fromTrial = false;
    try {
      fromTrial = sessionStorage.getItem(FROM_TRIAL_KEY) === trialId;
      sessionStorage.removeItem(FROM_TRIAL_KEY);
    } catch {
      // Storage blocked: fall through to a plain navigation.
    }
    if (fromTrial && window.history.length > 1) router.back();
    else router.replace(`/trial/${trialId}`);
  }

  function onCapture(result: CaptureResult) {
    setShot({ result, url: URL.createObjectURL(result.blob) });
    setPhase('diary');
    window.scrollTo(0, 0);
  }

  function retake() {
    scan.reset();
    setSaving('idle');
    setPhase('camera');
  }

  async function finish(outcome: NonNullable<typeof scan.outcome>) {
    if (loaded.status !== 'ready' || !shot || !slot) return;
    setSaving('saving');
    try {
      const saved = await saveCheckin({
        trial: loaded.trial,
        outcome,
        capture: shot.result.meta,
        diary: cleanDiary(diary),
        day: slot.day,
        takenAt: new Date(),
      });
      try {
        sessionStorage.removeItem(FROM_TRIAL_KEY);
      } catch {
        // Not needed for the redirect.
      }
      router.replace(`/trial/${trialId}?new=${encodeURIComponent(saved.id)}`, { scroll: true });
    } catch {
      setSaving('error');
    } finally {
      busy.current = false;
    }
  }

  async function runCheckin() {
    if (busy.current || !shot) return;
    busy.current = true;
    setPhase('scan');
    setSaving('idle');
    const outcome = await scan.run(shot.result.blob, concerns);
    if (outcome) await finish(outcome);
    else busy.current = false;
  }

  async function resume() {
    if (busy.current) return;
    busy.current = true;
    const outcome = await scan.resume();
    if (outcome) await finish(outcome);
    else busy.current = false;
  }

  async function retrySave() {
    if (busy.current || !scan.outcome) return;
    busy.current = true;
    await finish(scan.outcome);
  }

  /* ---------- states without a trial ---------- */

  if (loaded.status === 'missing' || loaded.status === 'error') {
    return (
      <div className={styles.page}>
        <TrialMissing error={loaded.status === 'error'} onRetry={() => void load()} />
      </div>
    );
  }

  if (loaded.status === 'loading' || !slot) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Opening the camera">
        <div className={styles.loading}>
          <Skeleton width="min(420px, 80vw)" aspect="3 / 4" radius="card" />
        </div>
      </div>
    );
  }

  const { baseline } = loaded;
  const dayLabel = `${slot.extra ? 'Extra check-in' : 'Check-in'} · Day ${slot.day}`;

  if (phase === 'camera' || !shot) {
    return (
      <CaptureView
        mode="checkin"
        ghost={baseline ? { photo: baseline.photo, anchors: baseline.capture?.anchors } : undefined}
        day={slot.day}
        title={dayLabel}
        onCapture={onCapture}
        onCancel={leave}
      />
    );
  }

  /* ---------- diary and scan share the frame ---------- */

  const scanning = phase === 'scan';
  const running = scan.status === 'running' || saving === 'saving' || scan.status === 'done';
  const failed = scanning && (scan.status === 'error' || saving === 'error');
  const areas = joinNouns(concerns.map(concernLabel));
  const progressCurrent = saving !== 'idle' || scan.status === 'done' ? 'saving' : (scan.step ?? 'uploading');

  let panel: React.ReactNode;
  if (!scanning) {
    panel = (
      <DiaryPanel
        sinceDay={slot.sinceDay}
        value={diary}
        onChange={setDiary}
        difference={photoDifference(baseline, shot.result.meta)}
        areas={areas}
        onRun={() => void runCheckin()}
        onRetake={retake}
      />
    );
  } else {
    const err = scan.error;
    panel = (
      <section className={styles.scanPanel} aria-labelledby="scan-title" aria-live="polite">
        <h1 id="scan-title" className={styles.title}>
          {failed
            ? saving === 'error'
              ? "This check-in couldn't be saved"
              : err
                ? ERROR_TITLE[err.code]
                : "YouCam didn't finish this scan"
            : progressCurrent === 'saving'
              ? 'Saving your check-in'
              : 'Measuring your skin'}
        </h1>
        <p className={styles.lead}>
          {failed
            ? saving === 'error'
              ? 'The scan finished, but your browser refused to store it. Free some space or allow this site to store data, then save again.'
              : (err?.message ?? 'Try again in a minute.')
            : `YouCam AI Skin Analysis reads ${areas.toLowerCase()} on this photo, the same areas as day 0.`}
        </p>
        <StepProgress
          steps={STEPS}
          current={progressCurrent}
          status={failed ? 'error' : 'running'}
          aria-label="Check-in progress"
          className={styles.steps}
        />
        {failed ? (
          <div className={styles.actions}>
            {saving === 'error' ? (
              <Button size="lg" onClick={() => void retrySave()}>
                Save again
              </Button>
            ) : err?.code === 'face' || err?.code === 'light' ? (
              <>
                <Button size="lg" onClick={retake}>
                  Retake photo
                </Button>
                <Button size="lg" variant="quiet" onClick={leave}>
                  Back to the trial
                </Button>
              </>
            ) : err?.code === 'limit' ? (
              <>
                <Button size="lg" onClick={leave}>
                  Back to the trial
                </Button>
                <Button size="lg" variant="secondary" href="/demo">
                  Open the sample trial
                </Button>
              </>
            ) : scan.canResume ? (
              <>
                <Button size="lg" onClick={() => void resume()}>
                  Check again
                </Button>
                <Button size="lg" variant="quiet" onClick={leave}>
                  Back to the trial
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" onClick={() => void runCheckin()}>
                  Try again
                </Button>
                <Button size="lg" variant="quiet" onClick={retake}>
                  Retake photo
                </Button>
              </>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <IconButton icon={X} label={scanning && running ? 'Leave the check-in' : 'Close the check-in'} variant="secondary" onClick={leave} />
        <div className={styles.barText}>
          <span className={clsx(styles.barTitle, 'num')}>{dayLabel}</span>
          <span className={styles.barSub}>{loaded.trial.product.name}</span>
        </div>
      </header>

      <main className={styles.body}>
        <div className={styles.photos}>
          {loaded.baseUrl ? (
            <PhotoPrint src={loaded.baseUrl} alt="" label="Day 0" tilt={-4} className={styles.basePrint} />
          ) : null}
          <motion.div
            className={styles.todayWrap}
            initial={reduced ? false : { opacity: 0, y: 16, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: 1.5 }}
            transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <PhotoPrint
              src={shot.url}
              alt={`Your check-in photo for day ${slot.day}`}
              label={`Day ${slot.day}`}
              sublabel={shot.result.meta.source === 'sample' ? 'Face generated with YouCam AI' : slot.extra ? 'Extra check-in' : 'Today'}
              priority
              className={styles.todayPrint}
            >
              {scanning && running && !reduced ? <span className={styles.scanLine} aria-hidden /> : null}
            </PhotoPrint>
          </motion.div>
        </div>
        <div className={styles.panelCol}>{panel}</div>
      </main>
    </div>
  );
}
