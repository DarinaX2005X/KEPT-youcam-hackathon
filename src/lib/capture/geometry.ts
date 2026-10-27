/**
 * Pure geometry for the capture guide: anchors, the 3:4 crop, head angles, alignment and the face outline.
 * Points are in source pixels unless a name says "fraction".
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** MediaPipe landmark ids saved as `CaptureMeta.anchors`, in this order. */
export const ANCHOR_IDS = [33, 263, 1, 61, 291, 199, 10, 152, 234, 454, 168, 6] as const;

/** Index pairs inside ANCHOR_IDS for the outer eye corners (33, 263): the distance that normalises alignment. */
const EYE_L = 0;
const EYE_R = 1;

/** Landmarks the light check samples: forehead, left cheek, right cheek. */
export const LIGHT_IDS = { forehead: 151, left: 50, right: 280 } as const;

/** Nose bridge: the crop centres here. */
export const BRIDGE_ID = 168;

/** MediaPipe FACE_OVAL as a closed loop, starting at the top of the forehead and going clockwise in the image. */
export const FACE_OVAL_IDS = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109,
] as const;

/** Crop width as a multiple of the landmark bounding box width. */
export const CROP_EXPAND = 1.9;
/** Shortest side we want for a crop; smaller crops are kept and flagged. */
export const MIN_CROP_SIDE = 720;
/** Longest side of a saved photo. Larger crops are scaled down. */
export const MAX_OUTPUT_SIDE = 2048;

export function toPixels(landmarks: { x: number; y: number }[], width: number, height: number): Pt[] {
  return landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));
}

export function bbox(points: Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The guide frame: the largest 3:4 rectangle centred in the source. The on-screen oval and the day 0 outline
 * are drawn inside it, and face size and alignment are measured against it.
 */
export function referenceRect(width: number, height: number): Rect {
  if (width / height > 3 / 4) {
    const w = (height * 3) / 4;
    return { x: (width - w) / 2, y: 0, w, h: height };
  }
  const h = (width * 4) / 3;
  return { x: 0, y: (height - h) / 2, w: width, h };
}

/**
 * The saved 3:4 crop: 1.9 × the landmark box width, centred on the nose bridge, shrunk to fit and then
 * shifted inside the source. Without a face it falls back to the guide frame.
 */
export function faceCrop(points: Pt[] | null, width: number, height: number): Rect {
  if (!points || points.length < 468) return referenceRect(width, height);
  const box = bbox(points);
  const c = points[BRIDGE_ID];
  let w = box.w * CROP_EXPAND;
  let h = (w * 4) / 3;
  const fit = Math.min(1, width / w, height / h);
  w *= fit;
  h *= fit;
  const x = clamp(c.x - w / 2, 0, width - w);
  const y = clamp(c.y - h / 2, 0, height - h);
  return { x, y, w, h };
}

/** Output size for a crop: source pixels, never upscaled, longest side capped. */
export function outputSize(crop: Rect): { width: number; height: number; lowResolution: boolean } {
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(crop.w, crop.h));
  const width = Math.max(1, Math.round(crop.w * scale));
  const height = Math.max(1, Math.round((width * 4) / 3));
  return { width, height, lowResolution: Math.min(crop.w, crop.h) < MIN_CROP_SIDE };
}

/** 12 anchors as [x, y, ...] fractions of `frame`. */
export function anchorsIn(points: Pt[], frame: Rect): number[] {
  const out: number[] = [];
  for (const id of ANCHOR_IDS) {
    const p = points[id];
    out.push(round4((p.x - frame.x) / frame.w), round4((p.y - frame.y) / frame.h));
  }
  return out;
}

/** Face outline as fractions of `frame`. */
export function ovalIn(points: Pt[], frame: Rect): Pt[] {
  return FACE_OVAL_IDS.map((id) => ({ x: (points[id].x - frame.x) / frame.w, y: (points[id].y - frame.y) / frame.h }));
}

/**
 * Mean distance between matching anchors divided by the day 0 eye-corner distance.
 * Both sets are fractions of a 3:4 frame; y is scaled by 4/3 so x and y share units.
 * 0 is a perfect match; the guide accepts ≤ ALIGN_OK.
 */
export function alignment(current: number[], base: number[]): number {
  const n = Math.min(current.length, base.length) / 2;
  if (n < 2) return Infinity;
  const px = (a: number[], i: number): Pt => ({ x: a[2 * i], y: (a[2 * i + 1] * 4) / 3 });
  const eye = dist(px(base, EYE_L), px(base, EYE_R));
  if (!(eye > 0)) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += dist(px(current, i), px(base, i));
  return sum / n / eye;
}

export const ALIGN_OK = 0.08;

/**
 * Head angles in degrees from MediaPipe's facial transformation matrix (column-major 4 × 4).
 * Metric space is right-handed with y up and the camera looking down −z, so
 * pitch > 0 means the chin is down, pitch < 0 the chin is up; yaw and roll signs only matter as magnitudes here.
 */
export function eulerFromMatrix(data: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => data[col * 4 + row];
  const deg = 180 / Math.PI;
  const pitch = Math.atan2(r(2, 1), r(2, 2)) * deg;
  const yaw = Math.asin(clamp(-r(2, 0), -1, 1)) * deg;
  const roll = Math.atan2(r(1, 0), r(0, 0)) * deg;
  return { yaw, pitch, roll };
}

/** Rough outline through the four extreme anchors when the full landmark set is not available. */
export function ovalFromAnchors(anchors: number[]): Pt[] {
  const at = (id: number): Pt => {
    const i = ANCHOR_IDS.indexOf(id as (typeof ANCHOR_IDS)[number]);
    return { x: anchors[2 * i], y: anchors[2 * i + 1] };
  };
  const top = at(10);
  const right = at(454);
  const bottom = at(152);
  const left = at(234);
  const cx = (left.x + right.x) / 2;
  const cy = (top.y + bottom.y) / 2;
  const rx = (right.x - left.x) / 2;
  const ryTop = cy - top.y;
  const ryBottom = bottom.y - cy;
  const pts: Pt[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const ry = Math.sin(a) < 0 ? ryTop : ryBottom;
    // Narrow the jaw a little so the shape reads as a face, not an egg.
    const jaw = Math.sin(a) > 0 ? 1 - 0.18 * Math.sin(a) ** 2 : 1;
    pts.push({ x: cx + Math.cos(a) * rx * jaw, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** Closed Catmull-Rom spline through `pts` as an SVG path, mapped by `map`. */
export function smoothPath(pts: Pt[], map: (p: Pt) => Pt = (p) => p): string {
  const n = pts.length;
  if (n < 3) return '';
  const q = pts.map(map);
  let d = `M${f(q[0].x)} ${f(q[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = q[(i - 1 + n) % n];
    const p1 = q[i];
    const p2 = q[(i + 1) % n];
    const p3 = q[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${d}Z`;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function f(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}
