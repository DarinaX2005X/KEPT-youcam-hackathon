'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { CameraOff, X } from 'lucide-react';
import { Button, IconButton, PhotoPrint, Segmented, Sheet, Skeleton, StepProgress } from '@/components/ui';
import {
  COUNTDOWN_MS,
  STILL_MESSAGES,
  StillError,
  allGood,
  analyzeStill,
  decodeImage,
  isAcceptedFile,
  loadBitmap,
  useCamera,
  useFaceGuide,
  useGhost,
  type CaptureResult,
  type GhostInput,
  type QualityCheck,
  type StillAnalysis,
} from '@/lib/capture';
import { loadManifest } from '@/lib/store';
import { CameraStage } from './CameraStage';
import { ChecksList } from './ChecksList';
import { DropZone } from './DropZone';
import { Shutter } from './Shutter';
import styles from './CaptureView.module.css';
import still from './StillPane.module.css';

export type CaptureTab = 'camera' | 'upload' | 'sample';

export interface CaptureViewProps {
  mode: 'baseline' | 'checkin';
  /** Day 0 photo for check-ins. Without `anchors` they are read from the photo before the outline shows. */
  ghost?: GhostInput;
  /** Check-in day for the label «Check-in · Day 28». */
  day?: number;
  /** Overrides the label at the top. */
  title?: string;
  initialTab?: CaptureTab;
  onCapture: (result: CaptureResult) => void;
  onCancel: () => void;
}

type Still =
  | { status: 'empty' }
  | { status: 'reading' }
  | { status: 'ready'; analysis: StillAnalysis }
  | { status: 'error'; message: string };

const TABS: { value: CaptureTab; label: string }[] = [
  { value: 'camera', label: 'Camera' },
  { value: 'upload', label: 'Upload' },
  { value: 'sample', label: 'Sample face' },
];

const FLASH_MS = 120;

/**
 * Full-screen capture: live camera with the face guide, upload, or the sample face.
 * Every path ends in `onCapture({ blob, meta })` with a 3:4 crop around the face.
 */
export function CaptureView({ mode, ghost, day, title, initialTab = 'camera', onCapture, onCancel }: CaptureViewProps) {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<CaptureTab>(initialTab);
  const [taken, setTaken] = useState<{ result: CaptureResult; url: string } | null>(null);
  const [flash, setFlash] = useState(0);
  const [confirm, setConfirm] = useState<null | 'camera' | 'upload'>(null);
  const [noCamera, setNoCamera] = useState(false);
  const [upload, setUpload] = useState<Still>({ status: 'empty' });
  const [sample, setSample] = useState<Still>({ status: 'empty' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const uploadToken = useRef(0);
  const onCaptureRef = useRef(onCapture);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCaptureRef.current = onCapture;
    onCancelRef.current = onCancel;
  });

  const checkin = mode === 'checkin';
  const ghostState = useGhost(checkin ? ghost : undefined);
  const baseAnchors = ghostState.guide?.anchors ?? null;
  const withAlign = checkin && Boolean(ghost) && ghostState.status !== 'error';

  const camera = useCamera(tab === 'camera' && !taken);
  const live = camera.state.status === 'live';

  const handleCaptured = useCallback(
    (result: CaptureResult) => {
      const url = URL.createObjectURL(result.blob);
      setTaken({ result, url });
      setFlash((n) => n + 1);
      window.setTimeout(() => onCaptureRef.current(result), reduced ? 0 : FLASH_MS + 40);
    },
    [reduced],
  );

  const guide = useFaceGuide({
    videoRef: camera.videoRef,
    live: live && !taken,
    baseAnchors,
    withAlign,
    autoCapture: tab === 'camera' && !confirm,
    onCaptured: handleCaptured,
    onError: () => setCameraError("The photo couldn't be saved. Try again"),
  });

  // No camera at all: go straight to upload.
  useEffect(() => {
    if (camera.state.status === 'nocamera') {
      setNoCamera(true);
      setTab((t) => (t === 'camera' ? 'upload' : t));
    }
  }, [camera.state.status]);

  // Full-screen layer: lock the page behind it, Escape closes.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => () => (taken ? URL.revokeObjectURL(taken.url) : undefined), [taken]);
  const uploadUrl = upload.status === 'ready' ? upload.analysis.previewUrl : null;
  useEffect(() => () => (uploadUrl ? URL.revokeObjectURL(uploadUrl) : undefined), [uploadUrl]);
  const sampleUrl = sample.status === 'ready' ? sample.analysis.previewUrl : null;
  useEffect(() => () => (sampleUrl ? URL.revokeObjectURL(sampleUrl) : undefined), [sampleUrl]);

  const ghostAnchors = useCallback(async () => {
    if (!checkin) return null;
    const g = await ghostState.promise.current;
    return g?.anchors ?? null;
  }, [checkin, ghostState.promise]);

  async function handleFile(file: File) {
    const token = ++uploadToken.current;
    if (!isAcceptedFile(file)) {
      setUpload({ status: 'error', message: STILL_MESSAGES.type });
      return;
    }
    setUpload({ status: 'reading' });
    try {
      const bitmap = await decodeImage(file);
      try {
        const analysis = await analyzeStill(bitmap, 'upload', await ghostAnchors());
        if (token !== uploadToken.current) URL.revokeObjectURL(analysis.previewUrl);
        else setUpload({ status: 'ready', analysis });
      } finally {
        bitmap.close();
      }
    } catch (err) {
      if (token === uploadToken.current) setUpload({ status: 'error', message: err instanceof StillError ? err.message : STILL_MESSAGES.decode });
    }
  }

  // Sample face: read it the first time the tab opens. Unmount discards a late result.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const sampleStatus = sample.status;
  useEffect(() => {
    if (tab !== 'sample' || sampleStatus !== 'empty') return;
    setSample({ status: 'reading' });
    (async () => {
      try {
        const manifest = await loadManifest();
        const url = checkin ? manifest.samplePhotos.checkin : manifest.samplePhotos.baseline;
        const bitmap = await loadBitmap(url);
        try {
          const analysis = await analyzeStill(bitmap, 'sample', await ghostAnchors());
          if (!alive.current) URL.revokeObjectURL(analysis.previewUrl);
          else setSample({ status: 'ready', analysis });
        } finally {
          bitmap.close();
        }
      } catch (err) {
        if (alive.current) setSample({ status: 'error', message: err instanceof StillError ? err.message : "The sample face couldn't load. Check your connection and try again" });
      }
    })();
  }, [tab, sampleStatus, checkin, ghostAnchors]);

  function pressShutter() {
    setCameraError(null);
    if (guide.state.model === 'ready' && !guide.state.ready) setConfirm('camera');
    else guide.capture();
  }

  function submitUpload() {
    if (upload.status !== 'ready') return;
    if (!allGood(upload.analysis.checks)) setConfirm('upload');
    else onCapture(upload.analysis.result);
  }

  function acceptConfirm() {
    const which = confirm;
    setConfirm(null);
    if (which === 'camera') guide.capture();
    else if (which === 'upload' && upload.status === 'ready') onCapture(upload.analysis.result);
  }

  const label = title ?? (checkin ? (day !== undefined ? `Check-in · Day ${day}` : 'Check-in photo') : 'Baseline photo');
  const status = camera.state.status;
  const cameraMode = tab === 'camera';
  const blocked = status === 'denied' || status === 'busy' || status === 'error';
  const loading = !taken && !blocked && (status === 'starting' || status === 'idle' || (live && guide.state.model === 'loading'));
  const ghostGuide = checkin && ghostState.guide?.oval ? ghostState.guide : null;
  const match = guide.state.alignment === undefined ? 0 : (0.3 - guide.state.alignment) / (0.3 - 0.08);
  const failing: QualityCheck[] =
    confirm === 'camera' ? guide.state.checks.filter((c) => c.state !== 'good') : upload.status === 'ready' ? upload.analysis.checks.filter((c) => c.state !== 'good') : [];
  const counting = guide.state.countdownStart !== null;

  /* ---------- Stage ---------- */

  let stage: React.ReactNode;
  if (cameraMode) {
    stage = (
      <CameraStage
        videoRef={camera.videoRef}
        frame={live ? { width: camera.state.width, height: camera.state.height } : null}
        ghost={ghostGuide}
        match={match}
        ready={guide.state.ready}
        dimmed={loading || Boolean(taken)}
        className={styles.camera}
      >
        {loading ? (
          <div className={styles.loading}>
            <Skeleton className={styles.loadingBone} radius="0" />
            <div className={styles.loadingPlate}>
              <StepProgress
                aria-label="Getting the camera ready"
                steps={[
                  { id: 'camera', label: 'Starting the camera' },
                  { id: 'model', label: 'Loading the face guide' },
                ]}
                current={live ? 'model' : 'camera'}
              />
              {status === 'starting' ? <p className={styles.loadingHint}>If your browser asks, allow the camera.</p> : null}
            </div>
          </div>
        ) : null}
        {blocked ? (
          <div className={styles.blocked} role="alert">
            <span className={styles.blockedWell} aria-hidden>
              <CameraOff size={26} strokeWidth={1.75} />
            </span>
            <h2 className={styles.blockedTitle}>
              {status === 'denied'
                ? checkin
                  ? 'Kept needs your camera to take a check-in photo'
                  : 'Kept needs your camera to take your baseline photo'
                : status === 'busy'
                  ? 'Another app is using your camera'
                  : "The camera didn't start"}
            </h2>
            <p className={styles.blockedText}>
              {status === 'denied'
                ? 'Allow the camera for this site in your browser settings, then try again.'
                : status === 'busy'
                  ? 'Close the other app or tab that uses it, then try again.'
                  : 'Try again, or use a photo you already took.'}
            </p>
            <div className={styles.blockedActions}>
              <Button size="lg" onClick={camera.retry}>
                Try again
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setTab('upload')}>
                Upload a photo instead
              </Button>
            </div>
          </div>
        ) : null}
        {taken ? (
          <div className={styles.taken}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={taken.url} alt="The photo you just took" className={styles.takenImg} />
            <p className={styles.takenPlate}>Photo taken</p>
          </div>
        ) : null}
      </CameraStage>
    );
  } else {
    const s = tab === 'upload' ? upload : sample;
    if (s.status === 'ready') {
      stage = (
        <div className={still.fit}>
          <PhotoPrint
            src={s.analysis.previewUrl}
            alt={tab === 'sample' ? 'Sample face' : 'Your photo, cropped around your face'}
            label={tab === 'sample' ? 'Sample face' : 'Your photo'}
            sublabel={tab === 'sample' ? 'Face generated with YouCam AI' : `${s.analysis.result.width} × ${s.analysis.result.height} px`}
            priority
            className={still.print}
          />
        </div>
      );
    } else if (s.status === 'reading') {
      stage = (
        <div className={still.reading}>
          <Skeleton className={still.readingBone} radius="panel" />
          <p className={still.readingPlate} role="status">
            {tab === 'sample' ? 'Loading the sample face' : 'Finding your face'}
          </p>
        </div>
      );
    } else if (tab === 'upload') {
      stage = (
        <DropZone
          onFile={handleFile}
          error={upload.status === 'error' ? upload.message : null}
          note={noCamera ? 'No camera found on this device. Upload a photo or use the sample face.' : null}
        />
      );
    } else {
      stage = (
        <div className={clsx(still.zone, still.zoneError)} role="alert">
          <p className={still.zoneTitle}>{s.status === 'error' ? s.message : ''}</p>
          <Button size="lg" onClick={() => setSample({ status: 'empty' })}>
            Try again
          </Button>
        </div>
      );
    }
  }

  /* ---------- Side: checks and the action ---------- */

  let side: React.ReactNode = null;
  if (cameraMode && (live || taken) && !loading) {
    side = (
      <>
        {guide.state.model === 'error' ? (
          <ChecksList checks={[]}>
            <div className={styles.modelError}>
              <p>The face guide couldn&apos;t load, so the checks are off. You can still take the photo.</p>
              <Button variant="quiet" onClick={guide.retryModel}>
                Load the guide again
              </Button>
            </div>
          </ChecksList>
        ) : (
          <ChecksList checks={guide.state.checks} />
        )}
        <div className={styles.shutterRow}>
          <Shutter onPress={pressShutter} countdownStart={guide.state.countdownStart} countdownMs={COUNTDOWN_MS} busy={guide.state.capturing || Boolean(taken)} disabled={!live || Boolean(taken)} />
          <p className={clsx(styles.shutterHint, (counting || guide.state.ready) && styles.shutterHintLive)} aria-live="polite">
            {taken ? 'Photo taken' : counting || guide.state.ready ? 'Hold still' : cameraError ?? 'The photo takes itself when every check is Good'}
          </p>
        </div>
      </>
    );
  } else if (tab === 'upload' && upload.status === 'ready') {
    side = (
      <>
        <ChecksList checks={upload.analysis.checks} />
        <div className={styles.actions}>
          <Button size="lg" block onClick={submitUpload}>
            Use this photo
          </Button>
          <Button size="lg" variant="quiet" block onClick={() => setUpload({ status: 'empty' })}>
            Choose another
          </Button>
        </div>
        {upload.analysis.result.lowResolution ? <p className={styles.sideNote}>This photo is small, so fine detail may not show in the scan.</p> : null}
      </>
    );
  } else if (tab === 'sample' && sample.status === 'ready') {
    side = (
      <>
        <ChecksList checks={sample.analysis.checks} />
        <div className={styles.actions}>
          <Button size="lg" block onClick={() => onCapture(sample.analysis.result)}>
            Use the sample face
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className={clsx(styles.root, cameraMode && styles.cameraMode)} role="dialog" aria-modal="true" aria-label={label}>
      <header className={styles.top}>
        <IconButton icon={X} label="Close" variant="secondary" onClick={onCancel} />
        <p className={styles.title}>{label}</p>
      </header>

      <aside className={styles.intro}>
        <h2 className={styles.introTitle}>{checkin ? 'Match day 0' : 'Same spot, same light'}</h2>
        <ul className={styles.introList}>
          {(checkin
            ? ['Stand where you took your first photo, facing the same light.', 'Line your face up with the outline from day 0.', 'Keep your hair back and skip makeup, like last time.']
            : ['Face a window or soft lamp so light falls evenly on both cheeks.', 'Pull your hair back, no makeup or filters.', 'Remember this spot. Every check-in starts here.']
          ).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </aside>

      <main className={styles.stage}>
        <div className={styles.stageBox}>{stage}</div>
      </main>

      {side ? <section className={styles.side}>{side}</section> : null}

      <nav className={styles.tabs}>
        <Segmented
          aria-label="Photo source"
          size="lg"
          value={tab}
          onChange={(v) => {
            setConfirm(null);
            setTab(v);
          }}
          options={TABS.map((t) => ({ ...t, disabled: t.value === 'camera' && noCamera }))}
          block
        />
      </nav>

      {flash > 0 && !reduced ? <span key={flash} className={styles.flash} aria-hidden /> : null}

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={checkin ? 'The photo may not compare well with day 0' : 'This photo may not compare well later'}
        description={confirm === 'upload' ? 'Use it anyway?' : 'Take it anyway?'}
        footer={
          <div className={styles.sheetActions}>
            <Button variant="secondary" size="lg" onClick={acceptConfirm}>
              {confirm === 'upload' ? 'Use it anyway' : 'Take it anyway'}
            </Button>
            <Button
              size="lg"
              onClick={() => {
                if (confirm === 'upload') setUpload({ status: 'empty' });
                setConfirm(null);
              }}
            >
              {confirm === 'upload' ? 'Choose another' : 'Keep adjusting'}
            </Button>
          </div>
        }
      >
        <ChecksList checks={failing} className={styles.sheetChecks} />
      </Sheet>
    </div>
  );
}
