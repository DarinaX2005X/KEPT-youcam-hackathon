'use client';

import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button, PhotoPrint, Segmented } from '@/components/ui';
import type { CaptureResult, GhostInput } from '@/lib/capture';
import { loadManifest } from '@/lib/store';
import { CaptureView, type CaptureTab } from './CaptureView';
import styles from './DevCapturePage.module.css';

type Mode = 'baseline' | 'checkin';
type GhostSource = 'demo' | 'mine';

interface Shot {
  result: CaptureResult;
  url: string;
  mode: Mode;
}

const f = (v: number | undefined, digits = 1, unit = '') => (v === undefined ? 'not measured' : `${v.toFixed(digits)}${unit}`);

/** /dev/capture: open CaptureView in either mode and inspect what it returns. */
export function DevCapturePage() {
  const [mode, setMode] = useState<Mode>('baseline');
  const [tab, setTab] = useState<CaptureTab>('camera');
  const [ghostSource, setGhostSource] = useState<GhostSource>('demo');
  const [open, setOpen] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [demoBaseline, setDemoBaseline] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then((m) => setDemoBaseline(m.samplePhotos.baseline))
      .catch(() => undefined);
  }, []);

  const myBaseline = shots.find((s) => s.mode === 'baseline');
  const ghost: GhostInput | undefined =
    mode !== 'checkin'
      ? undefined
      : ghostSource === 'mine' && myBaseline
        ? { photo: { url: myBaseline.url }, anchors: myBaseline.result.meta.anchors }
        : demoBaseline
          ? { photo: { url: demoBaseline } }
          : undefined;

  function onCapture(result: CaptureResult) {
    const shot = { result, url: URL.createObjectURL(result.blob), mode };
    setShots((s) => [shot, ...s]);
    setOpen(false);
    (window as unknown as { __keptCapture?: CaptureResult }).__keptCapture = result;
  }

  const latest = shots[0];

  return (
    <main className={styles.page}>
      <section className={styles.controls}>
        <h1 className={styles.h1}>Capture</h1>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Photo</span>
          <Segmented
            aria-label="Photo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'baseline', label: 'Baseline' },
              { value: 'checkin', label: 'Check-in' },
            ]}
          />
        </div>
        {mode === 'checkin' ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Day 0 outline from</span>
            <Segmented
              aria-label="Day 0 outline from"
              value={ghostSource}
              onChange={setGhostSource}
              options={[
                { value: 'demo', label: 'Demo day 0' },
                { value: 'mine', label: 'My baseline', disabled: !myBaseline },
              ]}
            />
          </div>
        ) : null}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Opens on</span>
          <Segmented
            aria-label="Opens on"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'camera', label: 'Camera' },
              { value: 'upload', label: 'Upload' },
              { value: 'sample', label: 'Sample face' },
            ]}
          />
        </div>
        <Button size="lg" icon={Camera} onClick={() => setOpen(true)}>
          {mode === 'baseline' ? 'Take baseline photo' : 'Run check-in'}
        </Button>
      </section>

      <section className={styles.result} aria-live="polite">
        {latest ? (
          <>
            <PhotoPrint src={latest.url} label={latest.mode === 'baseline' ? 'Baseline' : 'Check-in'} sublabel={`${latest.result.width} × ${latest.result.height} px`} className={styles.print} priority>
              {latest.result.meta.anchors ? (
                <svg className={styles.anchors} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
                  {Array.from({ length: latest.result.meta.anchors.length / 2 }, (_, i) => (
                    <circle key={i} cx={latest.result.meta.anchors![2 * i]} cy={latest.result.meta.anchors![2 * i + 1]} r="0.008" />
                  ))}
                </svg>
              ) : null}
            </PhotoPrint>
            <dl className={styles.meta} data-testid="capture-meta">
              <dt>Source</dt>
              <dd>{latest.result.meta.source}</dd>
              <dt>Luminance</dt>
              <dd>{f(latest.result.meta.luminance)}</dd>
              <dt>Face width</dt>
              <dd>{f(latest.result.meta.faceWidthRatio, 3)}</dd>
              <dt>Yaw, pitch, roll</dt>
              <dd>
                {f(latest.result.meta.yaw, 1, '°')}, {f(latest.result.meta.pitch, 1, '°')}, {f(latest.result.meta.roll, 1, '°')}
              </dd>
              <dt>Sharpness</dt>
              <dd>{f(latest.result.meta.sharpness)}</dd>
              <dt>Alignment</dt>
              <dd>{f(latest.result.meta.alignment, 3)}</dd>
              <dt>Anchors</dt>
              <dd>{latest.result.meta.anchors ? `${latest.result.meta.anchors.length / 2} points` : 'none'}</dd>
              <dt>File</dt>
              <dd>
                {Math.round(latest.result.blob.size / 1024)} KB JPEG{latest.result.lowResolution ? ', under 720 px' : ''}
              </dd>
            </dl>
          </>
        ) : (
          <p className={styles.empty}>The photo and what Kept measured on it appear here.</p>
        )}
      </section>

      {open ? <CaptureView mode={mode} ghost={ghost} day={mode === 'checkin' ? 28 : undefined} initialTab={tab} onCapture={onCapture} onCancel={() => setOpen(false)} /> : null}
    </main>
  );
}
