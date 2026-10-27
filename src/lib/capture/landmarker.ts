import type { FaceLandmarker, FaceLandmarkerResult, ImageSource } from '@mediapipe/tasks-vision';

/** Keep in step with `@mediapipe/tasks-vision` in package.json so the WASM matches the JS. */
export const TASKS_VISION_VERSION = '1.1.1';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

type Mode = 'IMAGE' | 'VIDEO';

let instance: Promise<FaceLandmarker> | null = null;
let mode: Mode = 'VIDEO';
let busy = 0;
let chain: Promise<unknown> = Promise.resolve();
let lastVideoTs = 0;
let switching = false;

/**
 * One Face Landmarker for the whole app, loaded on first use (WASM from jsDelivr, model from Google Storage).
 * Tries the GPU delegate and falls back to CPU. A failed load can be retried.
 */
export function loadLandmarker(): Promise<FaceLandmarker> {
  if (!instance) {
    instance = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const options = { runningMode: mode, numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: false };
      try {
        return await FaceLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' } });
      } catch {
        return await FaceLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } });
      }
    })();
    instance.catch(() => {
      instance = null;
    });
  }
  return instance;
}

/** Runs `fn` after every earlier queued call, so mode switches never interleave. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    busy++;
    try {
      return await fn();
    } finally {
      busy--;
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

async function ensureMode(lm: FaceLandmarker, m: Mode) {
  if (mode === m) return;
  await lm.setOptions({ runningMode: m });
  mode = m;
}

/** Landmarks for a still image (IMAGE mode). */
export function detectImage(source: ImageSource): Promise<FaceLandmarkerResult> {
  return serial(async () => {
    const lm = await loadLandmarker();
    await ensureMode(lm, 'IMAGE');
    return lm.detect(source);
  });
}

/** Loads the model and switches it to VIDEO mode. Resolve before calling `detectVideoFrame`. */
export function prepareVideo(): Promise<FaceLandmarker> {
  return serial(async () => {
    const lm = await loadLandmarker();
    await ensureMode(lm, 'VIDEO');
    return lm;
  });
}

/**
 * Landmarks for the current video frame, or `null` while a still image is being read
 * (the shared model is in IMAGE mode then).
 */
export function detectVideoFrame(lm: FaceLandmarker, video: HTMLVideoElement): FaceLandmarkerResult | null {
  if (busy > 0) return null;
  if (mode !== 'VIDEO') {
    if (!switching) {
      switching = true;
      void prepareVideo()
        .catch(() => undefined)
        .finally(() => {
          switching = false;
        });
    }
    return null;
  }
  const now = performance.now();
  const ts = now > lastVideoTs ? now : lastVideoTs + 1;
  lastVideoTs = ts;
  return lm.detectForVideo(video, ts);
}
