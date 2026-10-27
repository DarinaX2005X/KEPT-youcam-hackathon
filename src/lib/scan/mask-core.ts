// Pure counting over the alpha channel of a YouCam mask. No browser APIs: runs in a Worker, on the main thread and in node tests.
import type { Concern, MaskStats } from '@/lib/domain/types';

export type Alpha = Uint8ClampedArray | Uint8Array;

/** Acne marks: alpha above this is part of a mark. */
export const ACNE_ALPHA = 40;
/** Redness area: alpha above this counts as red skin. */
export const REDNESS_ALPHA = 60;
/** Components smaller than this are specks, not marks. */
export const MIN_MARK_PX = 12;
/**
 * Share of the bounding box a component fills. A YouCam ring (28 px wide, ~4 px stroke on a
 * 1104 × 1472 mask) fills about 0.38; the small filled dots YouCam also draws on the acne mask
 * fill about 0.77. Anything below this is a ring.
 */
export const RING_FILL_MAX = 0.6;

/** Concerns whose masks Kept turns into numbers. */
export const STATS_CONCERNS: readonly Concern[] = ['acne', 'redness'];

export interface MaskComponent {
  /** Pixel count. */
  size: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'ring' | 'dot';
  /** Rings in this component: overlapping rings join into one component. 0 for dots. */
  rings: number;
}

export interface MarkCount {
  /** Ring marks around blemishes, with overlapping rings counted one by one. */
  rings: number;
  /** Filled dots, which YouCam draws besides the rings. Not counted as blemishes. */
  dots: number;
  /** Area of one ring the split was based on, in pixels. */
  ringArea: number;
  components: MaskComponent[];
}

/** Alpha channel of interleaved pixels (RGBA by default). */
export function alphaOf(pixels: Alpha, channels = 4): Uint8Array {
  const n = Math.floor(pixels.length / channels);
  const out = new Uint8Array(n);
  for (let i = 0, j = channels - 1; i < n; i++, j += channels) out[i] = pixels[j];
  return out;
}

function checkSize(alpha: Alpha, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Mask size ${width} × ${height} is not valid`);
  }
  if (alpha.length < width * height) throw new RangeError(`Mask has ${alpha.length} pixels, expected ${width * height}`);
}

/**
 * 8-connected components of `alpha > threshold`, union-find row by row.
 * Returns a label per pixel (the root index, -1 for background).
 */
function label(alpha: Alpha, width: number, height: number, threshold: number): Int32Array {
  const parent = new Int32Array(width * height).fill(-1);
  const find = (i: number) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
  };

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      if (alpha[i] <= threshold) continue;
      parent[i] = i;
      if (x > 0 && parent[i - 1] >= 0) union(i, i - 1);
      if (y > 0) {
        const up = i - width;
        if (parent[up] >= 0) union(i, up);
        if (x > 0 && parent[up - 1] >= 0) union(i, up - 1);
        if (x < width - 1 && parent[up + 1] >= 0) union(i, up + 1);
      }
    }
  }
  for (let i = 0; i < parent.length; i++) if (parent[i] >= 0) parent[i] = find(i);
  return parent;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Finds the marks YouCam drew on an acne mask. YouCam circles every blemish with a ring, so one
 * ring is one blemish; rings that overlap form one component and are split by area, using the
 * area of a single ring measured on the same mask.
 */
export function findMarks(
  alpha: Alpha,
  width: number,
  height: number,
  { threshold = ACNE_ALPHA, minSize = MIN_MARK_PX }: { threshold?: number; minSize?: number } = {},
): MarkCount {
  checkSize(alpha, width, height);
  const labels = label(alpha, width, height, threshold);

  const boxes = new Map<number, { size: number; x0: number; y0: number; x1: number; y1: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = labels[y * width + x];
      if (r < 0) continue;
      const b = boxes.get(r);
      if (!b) boxes.set(r, { size: 1, x0: x, y0: y, x1: x, y1: y });
      else {
        b.size++;
        if (x < b.x0) b.x0 = x;
        if (x > b.x1) b.x1 = x;
        if (y > b.y1) b.y1 = y;
      }
    }
  }

  const components: MaskComponent[] = [];
  for (const b of boxes.values()) {
    if (b.size < minSize) continue;
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    const kind = b.size / (w * h) < RING_FILL_MAX ? 'ring' : 'dot';
    components.push({ size: b.size, x: b.x0, y: b.y0, width: w, height: h, kind, rings: 0 });
  }

  const rings = components.filter((c) => c.kind === 'ring');
  // A lone ring has a square box; joined rings (or a ring with a dot on it) do not.
  const singles = rings.filter((c) => Math.abs(c.width - c.height) <= Math.max(2, 0.1 * Math.max(c.width, c.height)));
  const ringArea = singles.length ? median(singles.map((c) => c.size)) : rings.length ? Math.min(...rings.map((c) => c.size)) : 0;
  let total = 0;
  for (const c of rings) {
    c.rings = Math.max(1, Math.round(c.size / ringArea));
    total += c.rings;
  }
  return { rings: total, dots: components.length - rings.length, ringArea, components };
}

/** Blemishes on an acne mask: the number of rings. */
export function countBlemishes(alpha: Alpha, width: number, height: number): number {
  return findMarks(alpha, width, height).rings;
}

/** Percent of the frame with alpha above REDNESS_ALPHA, rounded to 0.1. */
export function rednessAreaPct(alpha: Alpha, width: number, height: number): number {
  checkSize(alpha, width, height);
  const n = width * height;
  let red = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > REDNESS_ALPHA) red++;
  return Math.round((red / n) * 1000) / 10;
}

/** MaskStats for one concern from its alpha channel; `{}` for concerns without stats. */
export function maskStatsFromAlpha(concern: Concern, alpha: Alpha, width: number, height: number): MaskStats {
  if (concern === 'acne') return { blemishCount: countBlemishes(alpha, width, height) };
  if (concern === 'redness') return { areaPct: rednessAreaPct(alpha, width, height) };
  return {};
}

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function pngSize(head: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 24 || sig.some((b, i) => head[i] !== b)) return null;
  const u32 = (o: number) => ((head[o] << 24) | (head[o + 1] << 16) | (head[o + 2] << 8) | head[o + 3]) >>> 0;
  return { width: u32(16), height: u32(20) };
}
