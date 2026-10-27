'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { detectVideoFrame, prepareVideo } from './landmarker';
import { MetricSmoother, allGood, evaluate, readFace, type FaceReading, type QualityCheck, type QualityMetrics } from './quality';
import { buildResult, type CaptureResult } from './snapshot';

/** All checks must hold this long before the countdown starts. */
export const STEADY_MS = 800;
/** Countdown ring around the shutter before the automatic photo. */
export const COUNTDOWN_MS = 1200;
const PUBLISH_MS = 80;

export type ModelState = 'loading' | 'ready' | 'error';

export interface FaceGuideState {
  model: ModelState;
  checks: QualityCheck[];
  ready: boolean;
  /** Smoothed alignment with day 0 (lower is better), when an outline is shown. */
  alignment?: number;
  /** performance.now() when the countdown began, or null. */
  countdownStart: number | null;
  capturing: boolean;
}

export interface FaceGuideOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  live: boolean;
  baseAnchors: number[] | null;
  withAlign: boolean;
  /** Set false while a dialog is open so the photo is not taken behind it. */
  autoCapture: boolean;
  onCaptured: (result: CaptureResult) => void;
  onError?: (err: unknown) => void;
}

/**
 * Runs Face Landmarker on every video frame, smooths the readings over 8 frames, turns them into checks,
 * and takes the photo automatically after 0.8 s of all-good plus a 1.2 s countdown.
 */
export function useFaceGuide({ videoRef, live, baseAnchors, withAlign, autoCapture, onCaptured, onError }: FaceGuideOptions) {
  const [lm, setLm] = useState<FaceLandmarker | null>(null);
  const [model, setModel] = useState<ModelState>('loading');
  const [modelAttempt, setModelAttempt] = useState(0);
  const [run, setRun] = useState(0);
  const [ui, setUi] = useState<Omit<FaceGuideState, 'model'>>(() => ({
    checks: evaluate(null, { align: withAlign }),
    ready: false,
    countdownStart: null,
    capturing: false,
  }));

  const autoRef = useRef(autoCapture);
  const anchorsRef = useRef(baseAnchors);
  const capturedRef = useRef(onCaptured);
  const errorRef = useRef(onError);
  const requestRef = useRef(false);
  const busyRef = useRef(false);
  useEffect(() => {
    autoRef.current = autoCapture;
    anchorsRef.current = baseAnchors;
    capturedRef.current = onCaptured;
    errorRef.current = onError;
  });

  // Load the model as soon as the camera view opens.
  useEffect(() => {
    let cancelled = false;
    setModel('loading');
    prepareVideo()
      .then((l) => {
        if (cancelled) return;
        setLm(l);
        setModel('ready');
      })
      .catch(() => {
        if (!cancelled) setModel('error');
      });
    return () => {
      cancelled = true;
    };
  }, [modelAttempt]);

  const shoot = useCallback(async (video: HTMLVideoElement, reading: FaceReading | null, metrics: QualityMetrics | null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setUi((u) => ({ ...u, capturing: true, countdownStart: null }));
    try {
      const result = await buildResult(video, video.videoWidth, video.videoHeight, reading, metrics, 'camera', anchorsRef.current);
      capturedRef.current(result);
    } catch (err) {
      busyRef.current = false;
      setUi((u) => ({ ...u, capturing: false }));
      errorRef.current?.(err);
    }
  }, []);

  useEffect(() => {
    if (!live || !lm) return;
    const video = videoRef.current;
    if (!video) return;
    const smoother = new MetricSmoother();
    let stopped = false;
    let goodSince: number | null = null;
    let countdownStart: number | null = null;
    let lastPublish = 0;
    let lastKey = '';
    let handle = 0;
    const rvfc = 'requestVideoFrameCallback' in video;

    const schedule = () => {
      if (stopped) return;
      handle = rvfc ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };

    const tick = () => {
      if (stopped || busyRef.current) return;
      if (video.readyState < 2 || !video.videoWidth) return schedule();
      let reading: FaceReading | null = null;
      let result;
      try {
        result = detectVideoFrame(lm, video);
      } catch (err) {
        errorRef.current?.(err);
        return schedule();
      }
      if (!result) return schedule();
      reading = readFace(result, video, video.videoWidth, video.videoHeight, anchorsRef.current);
      let smoothed: QualityMetrics | null = null;
      if (reading) smoothed = smoother.push(reading.metrics);
      else smoother.reset();
      const checks = evaluate(smoothed, { align: withAlign });
      const ready = Boolean(reading) && allGood(checks);
      const now = performance.now();

      if (ready) goodSince ??= now;
      else {
        goodSince = null;
        countdownStart = null;
      }
      if (ready && autoRef.current && countdownStart === null && goodSince !== null && now - goodSince >= STEADY_MS) countdownStart = now;
      if (!autoRef.current) countdownStart = null;

      if (requestRef.current || (countdownStart !== null && now - countdownStart >= COUNTDOWN_MS)) {
        requestRef.current = false;
        void shoot(video, reading, smoothed);
        return;
      }

      const key = `${checks.map((c) => c.text).join('|')}|${ready}|${countdownStart}`;
      if (key !== lastKey || now - lastPublish > PUBLISH_MS) {
        lastKey = key;
        lastPublish = now;
        setUi({ checks, ready, alignment: smoothed?.alignment, countdownStart, capturing: false });
      }
      schedule();
    };

    schedule();
    return () => {
      stopped = true;
      if (rvfc) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [live, lm, videoRef, withAlign, shoot, run]);

  /** Take the photo now. Uses the next analysed frame, or the raw frame when the guide is not running. */
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || busyRef.current) return;
    if (model === 'ready' && lm) requestRef.current = true;
    else void shoot(video, null, null);
  }, [videoRef, model, lm, shoot]);

  /** Let the guide take another photo (after the parent rejected one). */
  const reset = useCallback(() => {
    busyRef.current = false;
    requestRef.current = false;
    setUi((u) => ({ ...u, capturing: false, countdownStart: null }));
    setRun((n) => n + 1);
  }, []);

  const retryModel = useCallback(() => setModelAttempt((n) => n + 1), []);

  const state: FaceGuideState = { model, ...ui };
  return { state, capture, reset, retryModel };
}
