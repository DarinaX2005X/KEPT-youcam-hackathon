import type { BlobRef, CaptureMeta } from '@/lib/domain/types';
import { blobUrl } from '@/lib/store';
import { alignment, anchorsIn, faceCrop, ovalFromAnchors, ovalIn, outputSize, referenceRect, toPixels, type Pt, type Rect } from './geometry';
import { detectImage } from './landmarker';
import { evaluate, photoLuminance, readFace, sharpness, type FaceReading, type QualityCheck, type QualityMetrics } from './quality';

/** What every capture path returns. `width`/`height`/`lowResolution` are extras on top of the PLAN contract. */
export interface CaptureResult {
  blob: Blob;
  meta: CaptureMeta;
  width: number;
  height: number;
  /** The crop had fewer than 720 px across: the camera or photo is small. */
  lowResolution: boolean;
}

export const JPEG_QUALITY = 0.92;

/** Draws the crop unmirrored at its output size. */
export function renderCrop(source: CanvasImageSource, crop: Rect): { canvas: HTMLCanvasElement; lowResolution: boolean } {
  const { width, height, lowResolution } = outputSize(crop);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  return { canvas, lowResolution };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', quality);
  });
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Crops, encodes and describes one capture. `metrics` are the values to record (smoothed for the camera);
 * anchors and alignment are measured on the saved crop itself.
 */
export async function buildResult(
  source: CanvasImageSource,
  width: number,
  height: number,
  reading: FaceReading | null,
  metrics: QualityMetrics | null,
  kind: CaptureMeta['source'],
  baseAnchors?: number[] | null,
): Promise<CaptureResult> {
  const crop = faceCrop(reading?.points ?? null, width, height);
  const { canvas, lowResolution } = renderCrop(source, crop);
  const blob = await canvasToJpeg(canvas);
  const meta: CaptureMeta = { source: kind, luminance: photoLuminance(canvas, canvas.width, canvas.height) };
  if (metrics) {
    meta.faceWidthRatio = r3(metrics.faceWidthRatio);
    meta.yaw = r1(metrics.yaw);
    meta.pitch = r1(metrics.pitch);
    meta.roll = r1(metrics.roll);
    if (metrics.sharpness !== undefined) meta.sharpness = metrics.sharpness;
  }
  if (reading) {
    meta.anchors = anchorsIn(reading.points, crop);
    if (baseAnchors && baseAnchors.length >= 24) meta.alignment = r3(alignment(meta.anchors, baseAnchors));
  }
  return { blob, meta, width: canvas.width, height: canvas.height, lowResolution };
}

/* ---------- Stills: upload and sample face ---------- */

export type StillProblem = 'type' | 'decode' | 'noface' | 'model';

export class StillError extends Error {
  constructor(
    public code: StillProblem,
    message: string,
  ) {
    super(message);
  }
}

export const STILL_MESSAGES: Record<StillProblem, string> = {
  type: 'Kept reads JPEG and PNG photos. Choose a .jpg or .png file',
  decode: "This photo couldn't be opened. Try another JPEG or PNG",
  noface: "We couldn't find a face in this photo. Use one where your whole face looks straight at the camera",
  model: "The face guide couldn't load. Check your connection and try again",
};

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return !file.type && /\.(jpe?g|png)$/i.test(file.name);
}

/** Decodes with EXIF orientation applied. */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      throw new StillError('decode', STILL_MESSAGES.decode);
    }
  }
}

export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new StillError('decode', STILL_MESSAGES.decode);
  return decodeImage(await res.blob());
}

export interface StillAnalysis {
  result: CaptureResult;
  checks: QualityCheck[];
  metrics: QualityMetrics;
  /** Object URL of the saved crop. Revoke when done. */
  previewUrl: string;
}

async function detectOrExplain(bitmap: ImageBitmap) {
  try {
    return await detectImage(bitmap);
  } catch {
    throw new StillError('model', STILL_MESSAGES.model);
  }
}

/** Same detector in IMAGE mode, same checks and crop as the camera, plus sharpness. Throws StillError. */
export async function analyzeStill(bitmap: ImageBitmap, kind: 'upload' | 'sample', baseAnchors?: number[] | null): Promise<StillAnalysis> {
  const { width, height } = bitmap;
  const detection = await detectOrExplain(bitmap);
  const reading = readFace(detection, bitmap, width, height, null);
  if (!reading) throw new StillError('noface', STILL_MESSAGES.noface);
  const crop = faceCrop(reading.points, width, height);
  const edge = Math.max(2, width * 0.005);
  const metrics: QualityMetrics = {
    ...reading.metrics,
    sharpness: sharpness(bitmap, reading.box),
    cropSide: Math.min(crop.w, crop.h),
    clipped: reading.box.x < edge || reading.box.y < edge || reading.box.x + reading.box.w > width - edge || reading.box.y + reading.box.h > height - edge,
  };
  const result = await buildResult(bitmap, width, height, reading, metrics, kind, baseAnchors);
  if (result.meta.alignment !== undefined) metrics.alignment = result.meta.alignment;
  const checks = evaluate(metrics, { still: true, sharp: true, align: Boolean(baseAnchors && baseAnchors.length >= 24) });
  if (process.env.NODE_ENV !== 'production') (globalThis as { __keptStillMetrics?: QualityMetrics }).__keptStillMetrics = metrics;
  return { result, checks, metrics, previewUrl: URL.createObjectURL(result.blob) };
}

/* ---------- Day 0 outline ---------- */

export interface GhostInput {
  photo: BlobRef;
  /** Saved with the day 0 capture. Demo scans have none; then they are read from the photo. */
  anchors?: number[] | null;
}

export interface GhostGuide {
  url: string;
  /** Face outline as fractions of the photo's 3:4 frame, or null when no face could be read. */
  oval: Pt[] | null;
  /** 12 anchors as fractions of the photo's 3:4 frame. */
  anchors: number[] | null;
}

/** Loads the day 0 photo and reads its outline (and anchors, when missing) with the IMAGE-mode detector. */
export async function prepareGhost(ghost: GhostInput): Promise<GhostGuide> {
  const url = await blobUrl(ghost.photo);
  const given = ghost.anchors && ghost.anchors.length >= 24 ? ghost.anchors : null;
  let oval: Pt[] | null = null;
  let anchors = given;
  try {
    const bitmap = await loadBitmap(url);
    const frame = referenceRect(bitmap.width, bitmap.height);
    const detection = await detectImage(bitmap);
    const lm = detection.faceLandmarks?.[0];
    if (lm && lm.length >= 468) {
      const points = toPixels(lm, bitmap.width, bitmap.height);
      oval = ovalIn(points, frame);
      if (!anchors) anchors = anchorsIn(points, frame);
    }
    bitmap.close();
  } catch {
    // Keep whatever the anchors give us.
  }
  if (!oval && anchors) oval = ovalFromAnchors(anchors);
  return { url, oval, anchors };
}

/** Anchors for any photo, e.g. to backfill a scan saved without them. Null when no face is found. */
export async function anchorsFromPhoto(photo: BlobRef): Promise<number[] | null> {
  const bitmap = await loadBitmap(await blobUrl(photo));
  try {
    const detection = await detectImage(bitmap);
    const lm = detection.faceLandmarks?.[0];
    if (!lm || lm.length < 468) return null;
    return anchorsIn(toPixels(lm, bitmap.width, bitmap.height), referenceRect(bitmap.width, bitmap.height));
  } finally {
    bitmap.close();
  }
}
