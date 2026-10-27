import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  ALIGN_OK,
  LIGHT_IDS,
  alignment as alignmentOf,
  anchorsIn,
  bbox,
  eulerFromMatrix,
  referenceRect,
  toPixels,
  type Pt,
  type Rect,
} from './geometry';

/** Ranges from the capture spec. */
export const LIMITS = {
  faceWidth: { min: 0.55, max: 0.8 },
  yaw: 10,
  pitch: 10,
  roll: 8,
  light: { min: 90, max: 200, sideGap: 35 },
  align: ALIGN_OK,
  /** Variance of the Laplacian on the face scaled to 256 px wide. Tuned on the sample faces: sharp ≈ 170–230, 2 px blur ≈ 25–35. */
  sharpness: 60,
  /** A still photo must give at least this many pixels across the crop. */
  stillCropSide: 720,
} as const;

export const SMOOTH_FRAMES = 8;

export type CheckId = 'size' | 'angle' | 'light' | 'align' | 'sharp';
export type CheckState = 'good' | 'fix' | 'waiting';

export interface QualityCheck {
  id: CheckId;
  label: string;
  state: CheckState;
  /** «Good» when the check passes, otherwise the advice. */
  text: string;
}

export const CHECK_LABEL: Record<CheckId, string> = {
  size: 'Face size',
  angle: 'Angle',
  light: 'Light',
  align: 'Line up',
  sharp: 'Sharpness',
};

export const ADVICE = {
  good: 'Good',
  closer: 'Move closer',
  back: 'Move back',
  straight: 'Look straight at the camera',
  chinDown: 'Tilt your chin down a little',
  dark: 'Find more light',
  bright: 'Too bright, step away from the window',
  side: 'Light is coming from one side',
  align: 'Match the outline from day 0',
  blur: 'Hold still or use a sharper photo',
  noFace: 'Bring your face into the oval',
  waiting: 'Waiting for your face',
} as const;

export interface LightReading {
  forehead: number;
  left: number;
  right: number;
}

/** Everything the checks look at, for one frame or one still. */
export interface QualityMetrics {
  faceWidthRatio: number;
  yaw: number;
  pitch: number;
  roll: number;
  light: LightReading;
  alignment?: number;
  sharpness?: number;
  /** Stills only: crop width in source pixels. */
  cropSide?: number;
  /** Stills only: the face touches the edge of the photo. */
  clipped?: boolean;
}

export interface FaceReading {
  /** 478 landmarks in source pixels. */
  points: Pt[];
  box: Rect;
  /** The guide frame in source pixels. */
  ref: Rect;
  /** 12 anchors relative to the guide frame. */
  anchorsInRef: number[];
  metrics: QualityMetrics;
}

/**
 * Reads one detection: face size against the guide frame, head angles, light on forehead and cheeks,
 * and alignment with day 0 when `baseAnchors` is given. `source` must be the same pixels the detector saw.
 */
export function readFace(
  result: FaceLandmarkerResult,
  source: CanvasImageSource,
  width: number,
  height: number,
  baseAnchors?: number[] | null,
): FaceReading | null {
  const lm = result.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const points = toPixels(lm, width, height);
  const box = bbox(points);
  const ref = referenceRect(width, height);
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  const angles = matrix ? eulerFromMatrix(matrix) : { yaw: 0, pitch: 0, roll: rollFromEyes(points) };
  const patch = Math.max(24, Math.round(box.w / 16));
  const [forehead, left, right] = patchLuma(source, [points[LIGHT_IDS.forehead], points[LIGHT_IDS.left], points[LIGHT_IDS.right]], patch, width, height);
  const anchorsInRef = anchorsIn(points, ref);
  const metrics: QualityMetrics = {
    faceWidthRatio: box.w / ref.w,
    ...angles,
    light: { forehead, left, right },
  };
  if (baseAnchors && baseAnchors.length >= 24) metrics.alignment = alignmentOf(anchorsInRef, baseAnchors);
  return { points, box, ref, anchorsInRef, metrics };
}

function rollFromEyes(points: Pt[]): number {
  const a = points[33];
  const b = points[263];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Turns metrics into the rows under the video. Order: size, angle, light, then line up, then sharpness. */
export function evaluate(m: QualityMetrics | null, opts: { still?: boolean; align?: boolean; sharp?: boolean } = {}): QualityCheck[] {
  const rows: QualityCheck[] = [];
  const row = (id: CheckId, state: CheckState, text: string) => rows.push({ id, label: CHECK_LABEL[id], state, text });

  if (!m) {
    row('size', 'fix', ADVICE.noFace);
    row('angle', 'waiting', ADVICE.waiting);
    row('light', 'waiting', ADVICE.waiting);
    if (opts.align) row('align', 'waiting', ADVICE.waiting);
    if (opts.sharp) row('sharp', 'waiting', ADVICE.waiting);
    return rows;
  }

  if (opts.still) {
    if (m.clipped) row('size', 'fix', ADVICE.back);
    else if ((m.cropSide ?? 0) < LIMITS.stillCropSide) row('size', 'fix', ADVICE.closer);
    else row('size', 'good', ADVICE.good);
  } else if (m.faceWidthRatio < LIMITS.faceWidth.min) row('size', 'fix', ADVICE.closer);
  else if (m.faceWidthRatio > LIMITS.faceWidth.max) row('size', 'fix', ADVICE.back);
  else row('size', 'good', ADVICE.good);

  const angleOk = Math.abs(m.yaw) <= LIMITS.yaw && Math.abs(m.pitch) <= LIMITS.pitch && Math.abs(m.roll) <= LIMITS.roll;
  if (angleOk) row('angle', 'good', ADVICE.good);
  else {
    const pitchWorst = Math.abs(m.pitch) - LIMITS.pitch >= Math.max(Math.abs(m.yaw) - LIMITS.yaw, Math.abs(m.roll) - LIMITS.roll);
    row('angle', 'fix', pitchWorst && m.pitch < 0 ? ADVICE.chinDown : ADVICE.straight);
  }

  const { forehead, left, right } = m.light;
  const mean = (forehead + left + right) / 3;
  if (mean < LIMITS.light.min) row('light', 'fix', ADVICE.dark);
  else if (mean > LIMITS.light.max) row('light', 'fix', ADVICE.bright);
  else if (Math.abs(left - right) > LIMITS.light.sideGap) row('light', 'fix', ADVICE.side);
  else row('light', 'good', ADVICE.good);

  if (opts.align) {
    if (m.alignment === undefined || !Number.isFinite(m.alignment)) row('align', 'waiting', ADVICE.waiting);
    else row('align', m.alignment <= LIMITS.align ? 'good' : 'fix', m.alignment <= LIMITS.align ? ADVICE.good : ADVICE.align);
  }

  if (opts.sharp) {
    if (m.sharpness === undefined) row('sharp', 'waiting', ADVICE.waiting);
    else row('sharp', m.sharpness >= LIMITS.sharpness ? 'good' : 'fix', m.sharpness >= LIMITS.sharpness ? ADVICE.good : ADVICE.blur);
  }
  return rows;
}

export function allGood(checks: QualityCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.state === 'good');
}

/** Mean of the last 8 readings, so one noisy frame does not flip a check. */
export class MetricSmoother {
  private buf: QualityMetrics[] = [];
  constructor(private size = SMOOTH_FRAMES) {}

  push(m: QualityMetrics): QualityMetrics {
    this.buf.push(m);
    if (this.buf.length > this.size) this.buf.shift();
    const n = this.buf.length;
    const avg = (pick: (x: QualityMetrics) => number) => this.buf.reduce((s, x) => s + pick(x), 0) / n;
    const aligned = this.buf.filter((x) => x.alignment !== undefined && Number.isFinite(x.alignment));
    return {
      faceWidthRatio: avg((x) => x.faceWidthRatio),
      yaw: avg((x) => x.yaw),
      pitch: avg((x) => x.pitch),
      roll: avg((x) => x.roll),
      light: { forehead: avg((x) => x.light.forehead), left: avg((x) => x.light.left), right: avg((x) => x.light.right) },
      alignment: aligned.length ? aligned.reduce((s, x) => s + (x.alignment as number), 0) / aligned.length : undefined,
    };
  }

  reset() {
    this.buf = [];
  }
}

/* ---------- Pixel measurements ---------- */

let patchCanvas: HTMLCanvasElement | null = null;

function scratch(w: number, h: number): CanvasRenderingContext2D {
  if (!patchCanvas) patchCanvas = document.createElement('canvas');
  if (patchCanvas.width !== w) patchCanvas.width = w;
  if (patchCanvas.height !== h) patchCanvas.height = h;
  const ctx = patchCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

/** Mean Y (0.2126 R + 0.7152 G + 0.0722 B, 0–255) of square patches centred on each point. */
export function patchLuma(source: CanvasImageSource, centers: Pt[], size: number, width: number, height: number): number[] {
  const s = Math.max(4, Math.round(size));
  const ctx = scratch(s * centers.length, s);
  ctx.clearRect(0, 0, s * centers.length, s);
  centers.forEach((c, i) => {
    const sx = Math.max(0, Math.min(width - s, Math.round(c.x - s / 2)));
    const sy = Math.max(0, Math.min(height - s, Math.round(c.y - s / 2)));
    ctx.drawImage(source, sx, sy, s, s, i * s, 0, s, s);
  });
  const data = ctx.getImageData(0, 0, s * centers.length, s).data;
  const sums = new Array<number>(centers.length).fill(0);
  const rowW = s * centers.length;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < rowW; x++) {
      const k = (y * rowW + x) * 4;
      sums[Math.floor(x / s)] += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
    }
  }
  return sums.map((v) => Math.round((v / (s * s)) * 10) / 10);
}

/**
 * Variance of the 4-neighbour Laplacian over the central face (eyes to mouth, cheek to cheek, inset 15 %),
 * scaled to 256 px wide so the number does not depend on photo resolution.
 */
export function sharpness(source: CanvasImageSource, box: Rect): number {
  const inset = 0.15;
  const sx = box.x + box.w * inset;
  const sy = box.y + box.h * inset;
  const sw = box.w * (1 - inset * 2);
  const sh = box.h * (1 - inset * 2);
  const w = 256;
  const h = Math.max(8, Math.round((sh / sw) * w));
  const ctx = scratch(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return Math.round((sum2 / n - mean * mean) * 10) / 10;
}

/**
 * Mean luma (Rec. 601, 0–255) of a whole photo at 276 × 368, the measure `CaptureMeta.luminance`
 * uses everywhere (the demo seeding script computes it the same way).
 */
export function photoLuminance(source: CanvasImageSource, width: number, height: number): number {
  const w = 276;
  const h = 368;
  const ctx = scratch(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return Math.round((sum / (w * h)) * 10) / 10;
}
