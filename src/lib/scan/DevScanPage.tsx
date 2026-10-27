'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Concern, MaskStats, SimConcern } from '@/lib/domain/types';
import { Button, Chip, MaskLayer, PhotoPrint, StepProgress } from '@/components/ui';
import { ScanError } from './errors';
import { maskStats } from './maskStats';
import { resumeSimulation, runAging, runSimulation, type AgingOutcome, type ScanStep } from './pipeline';
import { prepareImage, type PreparedImage } from './prepare';
import { SCAN_STEPS, useScan } from './useScan';
import styles from './DevScanPage.module.css';

const SAMPLE = '/demo/sample/baseline.jpg';
const ALL: Concern[] = ['acne', 'redness', 'pore', 'texture', 'wrinkle', 'moisture', 'oiliness', 'radiance', 'age_spot', 'dark_circle_v2', 'eye_bag', 'firmness'];
const DEFAULT_CONCERNS: Concern[] = ['acne', 'redness', 'pore', 'oiliness'];
const DEFAULT_SIM: Partial<Record<SimConcern, number>> = { acne: 0.6, pores: 0.4, oiliness: 0.4 };
const DEMO_MASKS = [
  { scan: 'sample-salicylic-day-0', dir: '/demo/salicylic-serum/day-0' },
  { scan: 'sample-salicylic-day-56', dir: '/demo/salicylic-serum/day-56' },
  { scan: 'sample-retinal-day-0', dir: '/demo/retinal-cream/day-0' },
];

const unitsFor = (n: number) => (n <= 4 ? 9 : 12);
const kb = (b: Blob) => `${Math.round(b.size / 1024)} KB`;
const ms = (a?: number, b?: number) => (a !== undefined && b !== undefined ? `${((b - a) / 1000).toFixed(1)} s` : '…');

/** Object URL for a blob, revoked when the blob changes or the component unmounts. */
function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function MaskUrls({ masks, children }: { masks: Partial<Record<Concern, Blob>>; children: (urls: Partial<Record<Concern, string>>) => ReactNode }) {
  const [urls, setUrls] = useState<Partial<Record<Concern, string>>>({});
  useEffect(() => {
    const next: Partial<Record<Concern, string>> = {};
    for (const [c, b] of Object.entries(masks) as [Concern, Blob][]) next[c] = URL.createObjectURL(b);
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u!));
  }, [masks]);
  return <>{children(urls)}</>;
}

function ErrorBox({ error, onResume }: { error: ScanError; onResume?: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <p>{error.message}</p>
      <p className={styles.meta}>
        code <b>{error.code}</b>
        {error.status ? ` · HTTP ${error.status}` : ''}
        {error.retryTaskId ? ` · task ${error.retryTaskId.slice(0, 12)}…` : ''}
      </p>
      {onResume ? (
        <Button variant="secondary" onClick={onResume}>
          Check again
        </Button>
      ) : null}
    </div>
  );
}

/** Manual check of the client scan pipeline against the real API (see stage 02.2). */
export function DevScanPage() {
  const scan = useScan();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [prepareError, setPrepareError] = useState<ScanError | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>(DEFAULT_CONCERNS);
  const [maskOn, setMaskOn] = useState<Concern | null>('acne');

  const photoUrl = useObjectUrl(photo);
  const imageUrl = useObjectUrl(scan.outcome?.image);

  const { reset } = scan;
  const pickPhoto = useCallback(async (blob: Blob, name: string) => {
    setPhoto(blob);
    setPhotoName(name);
    setPrepared(null);
    setPrepareError(null);
    reset();
    try {
      setPrepared(await prepareImage(blob));
    } catch (err) {
      setPrepareError(err instanceof ScanError ? err : new ScanError('face', String(err)));
    }
  }, [reset]);

  useEffect(() => {
    fetch(SAMPLE)
      .then((r) => r.blob())
      .then((b) => pickPhoto(b, 'Sample face (baseline.jpg)'))
      .catch(() => undefined);
  }, [pickPhoto]);

  const toggle = (c: Concern) =>
    setConcerns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : prev.length >= 8 ? prev : [...prev, c]));

  // ---- Simulation and aging
  const [simSteps, setSimSteps] = useState<Partial<Record<ScanStep, number>>>({});
  const [simBlob, setSimBlob] = useState<Blob | null>(null);
  const [simError, setSimError] = useState<ScanError | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const simUrl = useObjectUrl(simBlob);
  const fileId = scan.outcome?.fileId;

  const simulate = async (resume?: ScanError) => {
    if (!fileId) return;
    setSimBusy(true);
    setSimError(null);
    setSimBlob(null);
    setSimSteps({});
    const onStep = (s: ScanStep) => setSimSteps((p) => ({ ...p, [s]: performance.now() }));
    try {
      const blob = resume?.retryTaskId
        ? await resumeSimulation(resume.retryTaskId, fileId, onStep)
        : await runSimulation(fileId, DEFAULT_SIM, onStep);
      setSimBlob(blob);
    } catch (err) {
      setSimError(err instanceof ScanError ? err : new ScanError('upstream', String(err)));
    } finally {
      setSimBusy(false);
    }
  };

  const [aging, setAging] = useState<AgingOutcome | null>(null);
  const [agingError, setAgingError] = useState<ScanError | null>(null);
  const [agingBusy, setAgingBusy] = useState(false);
  const age = async () => {
    if (!prepared) return;
    setAgingBusy(true);
    setAgingError(null);
    try {
      setAging(await runAging(prepared.blob));
    } catch (err) {
      setAgingError(err instanceof ScanError ? err : new ScanError('upstream', String(err)));
    } finally {
      setAgingBusy(false);
    }
  };

  // ---- Mask stats on demo masks (free, no API)
  const [maskRows, setMaskRows] = useState<{ name: string; concern: Concern; ours: MaskStats; seeded?: MaskStats; ms: number }[]>([]);
  const [maskBusy, setMaskBusy] = useState(false);
  const checkMasks = async () => {
    setMaskBusy(true);
    const manifest = await fetch('/demo/manifest.json').then((r) => r.json());
    const seeded = new Map<string, Record<string, MaskStats>>();
    for (const t of manifest.trials) for (const s of t.scans) seeded.set(s.id, s.maskStats);
    const rows: typeof maskRows = [];
    for (const m of DEMO_MASKS) {
      for (const concern of ['acne', 'redness'] as Concern[]) {
        const blob = await fetch(`${m.dir}/mask-${concern}.png`).then((r) => r.blob());
        const t0 = performance.now();
        const ours = await maskStats(concern, blob);
        rows.push({ name: m.scan.replace('sample-', ''), concern, ours, seeded: seeded.get(m.scan)?.[concern], ms: performance.now() - t0 });
      }
    }
    setMaskRows(rows);
    setMaskBusy(false);
  };

  const running = scan.status === 'running';
  const t = scan.timings;
  const outcome = scan.outcome;

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.h1}>Scan pipeline</h1>
        <p className={styles.lead}>
          Uploads a photo to YouCam, analyzes it, downloads the aligned photo and masks, and counts blemishes and redness. Every analysis spends real
          YouCam units.
        </p>
      </header>

      <section className={styles.grid}>
        <div className={styles.col}>
          <h2 className={styles.h2}>Photo</h2>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.preview} src={photoUrl} alt="Photo to analyze" />
          ) : (
            <div className={styles.preview} />
          )}
          <p className={styles.meta}>{photoName}</p>
          {prepared ? (
            <p className={styles.meta}>
              Prepared: {prepared.width} × {prepared.height}, {kb(prepared.blob)}, luminance {prepared.luminance}
            </p>
          ) : null}
          {prepareError ? <ErrorBox error={prepareError} /> : null}
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => fetch(SAMPLE).then((r) => r.blob()).then((b) => pickPhoto(b, 'Sample face (baseline.jpg)'))}>
              Sample face
            </Button>
            <label className={styles.file}>
              Choose a photo
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickPhoto(f, f.name);
                }}
              />
            </label>
          </div>
        </div>

        <div className={styles.col}>
          <h2 className={styles.h2}>Analysis</h2>
          <div className={styles.chips}>
            {ALL.map((c) => (
              <Chip key={c} selected={concerns.includes(c)} onClick={() => toggle(c)} disabled={running}>
                {c}
              </Chip>
            ))}
          </div>
          <p className={styles.meta}>
            {concerns.length} areas, about {unitsFor(concerns.length)} units
          </p>
          <div className={styles.row}>
            <Button onClick={() => photo && scan.run(photo, concerns)} disabled={!photo || !concerns.length || running || !!prepareError} loading={running}>
              Analyze
            </Button>
            {running ? (
              <Button variant="quiet" onClick={scan.cancel}>
                Cancel
              </Button>
            ) : null}
          </div>
          <StepProgress
            steps={SCAN_STEPS}
            current={scan.step === 'done' ? null : scan.step}
            status={scan.status === 'done' ? 'done' : scan.status === 'error' ? 'error' : 'running'}
            aria-label="Scan progress"
          />
          <dl className={styles.timings}>
            <dt>Uploading</dt>
            <dd className="num">{ms(t.uploading, t.analyzing)}</dd>
            <dt>YouCam</dt>
            <dd className="num">{ms(t.analyzing, t.downloading)}</dd>
            <dt>Downloading and counting</dt>
            <dd className="num">{ms(t.downloading, t.done)}</dd>
            <dt>Total</dt>
            <dd className="num">{ms(t.uploading, t.done)}</dd>
          </dl>
          {scan.error ? <ErrorBox error={scan.error} onResume={scan.canResume ? () => scan.resume() : undefined} /> : null}
        </div>
      </section>

      {outcome && imageUrl ? (
        <section className={styles.grid}>
          <div className={styles.col}>
            <MaskUrls masks={outcome.masks}>
              {(urls) => (
                <PhotoPrint src={imageUrl} label="YouCam aligned photo" sublabel={`${outcome.image.size ? kb(outcome.image) : ''}`}>
                  {Object.entries(urls).map(([c, u]) => (
                    <MaskLayer key={c} mask={u!} visible={maskOn === c} />
                  ))}
                </PhotoPrint>
              )}
            </MaskUrls>
            <div className={styles.chips}>
              {(Object.keys(outcome.masks) as Concern[]).map((c) => (
                <Chip key={c} selected={maskOn === c} onClick={() => setMaskOn(maskOn === c ? null : c)}>
                  {c} mask
                </Chip>
              ))}
            </div>
          </div>
          <div className={styles.col}>
            <h2 className={styles.h2}>Result</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>ui</th>
                  <th>raw</th>
                  <th>Mask</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(outcome.scores) as Concern[]).map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className="num">{outcome.scores[c]!.ui}</td>
                    <td className="num">{outcome.scores[c]!.raw.toFixed(1)}</td>
                    <td className="num">
                      {outcome.maskStats[c]?.blemishCount !== undefined ? `${outcome.maskStats[c]!.blemishCount} blemishes` : ''}
                      {outcome.maskStats[c]?.areaPct !== undefined ? `${outcome.maskStats[c]!.areaPct}% of frame` : ''}
                      {outcome.masks[c] ? ` · ${kb(outcome.masks[c]!)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.meta}>
              Overall {outcome.overall} · skin age {outcome.skinAge} · file {outcome.fileId.slice(0, 16)}…
            </p>

            <h2 className={styles.h2}>Simulation</h2>
            <p className={styles.meta}>
              Same file, no new upload. Intensities {JSON.stringify(DEFAULT_SIM)}, about 4 units.
            </p>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => simulate()} loading={simBusy} disabled={simBusy}>
                Simulate target
              </Button>
            </div>
            <p className={styles.meta}>
              YouCam {ms(simSteps.analyzing, simSteps.downloading)} · download {ms(simSteps.downloading, simSteps.done)}
            </p>
            {simError ? <ErrorBox error={simError} onResume={simError.retryTaskId ? () => simulate(simError) : undefined} /> : null}
            {simUrl ? <PhotoPrint src={simUrl} label="Target" variant="target" sublabel={simBlob ? kb(simBlob) : ''} /> : null}

            <h2 className={styles.h2}>Aging</h2>
            <p className={styles.meta}>Uploads the prepared photo again and runs aging, about 2 units.</p>
            <Button variant="secondary" onClick={age} loading={agingBusy} disabled={agingBusy || !prepared}>
              Run aging
            </Button>
            {agingError ? <ErrorBox error={agingError} /> : null}
            {aging ? <AgingFrames aging={aging} /> : null}
          </div>
        </section>
      ) : null}

      <section className={styles.block}>
        <h2 className={styles.h2}>Mask counting on demo masks</h2>
        <p className={styles.meta}>Free: decodes the demo PNGs in this browser and compares with the numbers stored in the demo manifest.</p>
        <Button variant="secondary" onClick={checkMasks} loading={maskBusy} disabled={maskBusy}>
          Count demo masks
        </Button>
        {maskRows.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Scan</th>
                <th>Mask</th>
                <th>Here</th>
                <th>Manifest</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {maskRows.map((r) => (
                <tr key={r.name + r.concern}>
                  <td>{r.name}</td>
                  <td>{r.concern}</td>
                  <td className="num">{r.ours.blemishCount ?? r.ours.areaPct}</td>
                  <td className="num">{r.seeded?.blemishCount ?? r.seeded?.areaPct ?? '—'}</td>
                  <td className="num">{Math.round(r.ms)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}

function AgingFrames({ aging }: { aging: AgingOutcome }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = aging.frames.map((f) => URL.createObjectURL(f.image));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [aging]);
  return (
    <div className={styles.frames}>
      {aging.frames.map((f, i) => (urls[i] ? <PhotoPrint key={f.age} src={urls[i]} label={`Age ${f.age}`} /> : null))}
    </div>
  );
}
