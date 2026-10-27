'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Camera, Check, RotateCcw } from 'lucide-react';
import { Button, Chip, MaskLayer, PhotoPrint, Spinner, StepProgress } from '@/components/ui';
import { concernLabel, concernNoun, joinNouns, type Concern } from '@/lib/domain';
import { SCAN_STEPS, type UseScan } from '@/lib/scan';
import { EmptyPrint } from './EmptyPrint';
import type { BaselineData, TargetState } from './state';
import { useBlobUrls, useObjectUrl } from './useBlobUrls';
import layout from './Wizard.module.css';
import styles from './PhotoStep.module.css';

export interface BaselineStepProps {
  zones: Concern[];
  baseline: BaselineData | null;
  scan: UseScan;
  /** Photo being analysed right now, before YouCam returns its aligned frame. */
  captured: Blob | null;
  sample: boolean;
  /** The target made in the background right after this analysis. */
  targetStatus: TargetState['status'];
  targetLabel: string;
  onTakePhoto: () => void;
  onContinue: () => void;
}

function statLine(concern: Concern, b: BaselineData): string | null {
  const stats = b.maskStats[concern];
  if (concern === 'acne' && stats?.blemishCount !== undefined) return `${stats.blemishCount} blemishes on the acne map`;
  if (concern === 'redness' && stats?.areaPct !== undefined) return `Red areas cover ${stats.areaPct}% of the photo`;
  return null;
}

export function BaselineStep({ zones, baseline, scan, captured, sample, targetStatus, targetLabel, onTakePhoto, onContinue }: BaselineStepProps) {
  const urls = useBlobUrls<string>(baseline ? { photo: baseline.photo, ...baseline.masks } : null);
  const capturedUrl = useObjectUrl(captured);
  const [selected, setSelected] = useState<Concern | null>(zones[0] ?? null);

  const phase = baseline ? 'done' : scan.status === 'running' ? 'running' : scan.status === 'error' ? 'error' : 'intro';
  const error = scan.error;
  const limit = error?.code === 'limit';
  const zoneText = joinNouns(zones.map(concernNoun));
  const shownZones = baseline ? baseline.zones : zones;
  const active = selected && shownZones.includes(selected) ? selected : null;

  const title =
    phase === 'done' ? 'Your skin on day 0' : phase === 'running' ? 'Measuring your skin' : phase === 'error' ? (limit ? 'No free scans left today' : "This photo didn't work") : 'Take your day 0 photo';

  let photo;
  if (phase === 'done' && urls.photo) {
    photo = (
      <PhotoPrint src={urls.photo} alt="Your day 0 photo with the selected skin map" label="Day 0" sublabel={sample ? 'Face generated with YouCam AI' : 'Baseline photo'} tilt={-1} priority className={styles.print}>
        {shownZones.map((c) =>
          urls[c] ? <MaskLayer key={c} mask={urls[c]!} visible={c === active} /> : null,
        )}
      </PhotoPrint>
    );
  } else if ((phase === 'running' || phase === 'error') && capturedUrl) {
    photo = (
      <PhotoPrint src={capturedUrl} alt="The photo being measured" label="Day 0" sublabel={sample ? 'Face generated with YouCam AI' : 'Baseline photo'} tilt={-1} priority className={clsx(styles.print, phase === 'error' && styles.failed)}>
        {phase === 'running' ? <span className={styles.scanLine} aria-hidden /> : null}
      </PhotoPrint>
    );
  } else {
    photo = <EmptyPrint label="Day 0" sublabel="Baseline photo" tilt={-1} className={clsx(styles.print, phase === 'intro' && styles.printWaiting)} busy={phase === 'done'} />;
  }

  return (
    <div className={clsx(styles.split, phase === 'intro' && styles.textFirst)}>
      <div className={styles.photoCol}>{photo}</div>

      <div className={layout.main}>
        <h1 className={layout.title}>{title}</h1>

        {phase === 'intro' ? (
          <div className={clsx(layout.panel, styles.memo)}>
            <p className={styles.memoText}>
              Take it where you&apos;ll take every check-in: same room, same time of day, no makeup, hair off your forehead.
            </p>
            <p className={styles.memoSoft}>YouCam will measure {zoneText} on this photo. Every check-in is compared with it.</p>
          </div>
        ) : null}

        {phase === 'running' ? (
          <div className={styles.progress}>
            <StepProgress steps={SCAN_STEPS} current={scan.step === 'done' ? null : scan.step} aria-label="Analysis progress" />
            <p className={styles.memoSoft}>Measuring {zoneText}. This usually takes about 15 seconds.</p>
          </div>
        ) : null}

        {phase === 'error' && error ? (
          <div className={clsx(styles.error, limit && styles.limit)} role="alert">
            <p>{error.message}</p>
          </div>
        ) : null}

        {phase === 'done' && baseline ? (
          <div className={styles.result}>
            <div className={styles.chips} role="group" aria-label="Skin maps">
              {baseline.zones.map((c, i) => {
                const score = baseline.scores[c]?.ui;
                return (
                  <Chip
                    key={c}
                    selected={c === active}
                    count={score !== undefined ? Math.round(score) : undefined}
                    onClick={() => setSelected(c === active ? null : c)}
                    className={styles.chip}
                    style={{ animationDelay: `${i * 70}ms` }}
                    aria-label={`${concernLabel(c)}${score !== undefined ? `, score ${Math.round(score)}` : ''}. Show the map`}
                  >
                    {concernLabel(c)}
                  </Chip>
                );
              })}
            </div>
            <p className={styles.memoSoft}>
              {active && statLine(active, baseline) ? `${statLine(active, baseline)}. ` : ''}
              Scores run from 0 to 100; higher means healthier skin in that area.
            </p>
            {targetStatus === 'running' ? (
              <p className={styles.next} role="status">
                <Spinner size={16} />
                Making your {targetLabel} target with YouCam Skin Simulation
              </p>
            ) : targetStatus === 'done' ? (
              <p className={styles.next} role="status">
                <Check size={16} strokeWidth={2.5} aria-hidden className={styles.nextDone} />
                Your {targetLabel} target is ready
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={layout.actions}>
          {phase === 'intro' ? (
            <Button size="lg" icon={Camera} onClick={onTakePhoto} className={layout.primary}>
              Take baseline photo
            </Button>
          ) : null}
          {phase === 'error' && limit ? (
            <Button size="lg" href="/demo" className={layout.primary}>
              Open the sample trial
            </Button>
          ) : null}
          {phase === 'error' && !limit && scan.canResume ? (
            <Button size="lg" onClick={() => void scan.resume()} className={layout.primary}>
              Check again
            </Button>
          ) : null}
          {phase === 'error' && !limit ? (
            <Button size="lg" variant={scan.canResume ? 'secondary' : 'primary'} icon={RotateCcw} onClick={onTakePhoto} className={layout.primary}>
              Retake photo
            </Button>
          ) : null}
          {phase === 'done' ? (
            <>
              <Button size="lg" onClick={onContinue} className={layout.primary}>
                See your plan
              </Button>
              <Button size="lg" variant="quiet" icon={RotateCcw} onClick={onTakePhoto}>
                Retake photo
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
