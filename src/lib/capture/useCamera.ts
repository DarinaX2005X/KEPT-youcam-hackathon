'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'nocamera' | 'busy' | 'error' | 'timeout';

/** How long the camera may take to give a first frame, permission prompt included, before the view offers the other sources. */
export const CAMERA_TIMEOUT_MS = 8000;

export interface CameraState {
  status: CameraStatus;
  /** Frame size once live. */
  width: number;
  height: number;
}

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

function classify(err: unknown): CameraStatus {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'error';
}

/**
 * Front camera into a <video>. Stops every track when `enabled` turns false, on unmount and on pagehide.
 * `retry()` asks again after a refusal. Status `timeout` means no frame came within CAMERA_TIMEOUT_MS.
 */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ status: 'idle', width: 0, height: 0 });
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      setState((s) => (s.status === 'live' || s.status === 'starting' ? { status: 'idle', width: 0, height: 0 } : s));
      return;
    }
    let cancelled = false;
    setState({ status: 'starting', width: 0, height: 0 });
    // Some browsers never settle getUserMedia or never deliver a frame. After the timeout the view
    // offers Upload and the sample face; a camera that does answer later still goes live.
    const timer = window.setTimeout(() => {
      if (!cancelled) setState((s) => (s.status === 'starting' ? { status: 'timeout', width: 0, height: 0 } : s));
    }, CAMERA_TIMEOUT_MS);

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setState({ status: 'nocamera', width: 0, height: 0 });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await new Promise<void>((resolve) => {
          if (v.readyState >= 2 && v.videoWidth) resolve();
          else v.addEventListener('loadeddata', () => resolve(), { once: true });
        });
        await v.play().catch(() => undefined);
        if (cancelled) return;
        window.clearTimeout(timer);
        setState({ status: 'live', width: v.videoWidth, height: v.videoHeight });
      } catch (err) {
        window.clearTimeout(timer);
        if (!cancelled) setState({ status: classify(err), width: 0, height: 0 });
      }
    })();

    const onHide = () => stop();
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', onHide);
      stop();
    };
  }, [enabled, attempt, stop]);

  // Phones rotate the stream; keep the frame size current.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || state.status !== 'live') return;
    const onResize = () => {
      if (v.videoWidth && (v.videoWidth !== state.width || v.videoHeight !== state.height)) {
        setState({ status: 'live', width: v.videoWidth, height: v.videoHeight });
      }
    };
    v.addEventListener('resize', onResize);
    return () => v.removeEventListener('resize', onResize);
  }, [state]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { videoRef, state, retry, stop };
}
