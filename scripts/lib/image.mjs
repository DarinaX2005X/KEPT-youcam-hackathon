// Image helpers for the seed scripts (sharp only).
import sharp from 'sharp';

export const W = 1104;
export const H = 1472;

/** Re-encodes any image as the JPEG we send to YouCam (full size, q95). */
export const toUploadJpeg = (input) => sharp(input).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();

/**
 * A repeat photo of the same face: shift (fractions of the frame), scale, brightness, rotation, blur.
 * Edges that move into the frame are filled by mirroring, so no black borders appear.
 */
export async function variant(input, { dx = 0, dy = 0, scale = 1, brightness = 1, rotate = 0, blur = 0 } = {}) {
  let img = sharp(input).resize(W, H, { fit: 'cover' });
  const pad = Math.ceil(Math.max(W, H) * 0.12);
  // Work on a padded canvas so shifts, zoom-out and rotation never expose empty corners.
  let buf = await img.extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'mirror' }).toBuffer();
  let cw = W + 2 * pad;
  let ch = H + 2 * pad;
  if (rotate) {
    const rot = await sharp(buf).rotate(rotate, { background: '#808080' }).toBuffer({ resolveWithObject: true });
    buf = rot.data;
    cw = rot.info.width;
    ch = rot.info.height;
  }
  if (scale !== 1) {
    const sw = Math.round(cw * scale);
    const sh = Math.round(ch * scale);
    buf = await sharp(buf).resize(sw, sh).toBuffer();
    cw = sw;
    ch = sh;
  }
  const left = Math.round((cw - W) / 2 - dx * W);
  const top = Math.round((ch - H) / 2 - dy * H);
  let out = sharp(buf).extract({ left, top, width: W, height: H });
  if (brightness !== 1) out = out.linear(brightness, 0);
  if (blur) out = out.blur(blur);
  return out.jpeg({ quality: 95 }).toBuffer();
}

/** Small deterministic pseudo-random generator so every run produces the same frames. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Natural spread for a check-in frame: shift up to 2 %, brightness ±3 %. */
export function naturalSpread(seed) {
  const r = rng(seed * 7919 + 13);
  const u = () => r() * 2 - 1;
  return { dx: +(u() * 0.02).toFixed(4), dy: +(u() * 0.02).toFixed(4), brightness: +(1 + u() * 0.03).toFixed(4) };
}

/** Mean luma (0..255) of the photo, the same measure CaptureMeta.luminance uses. */
export async function luminance(input) {
  const { data, info } = await sharp(input).removeAlpha().resize(276, 368).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return Math.round((sum / (data.length / info.channels)) * 10) / 10;
}

/**
 * MaskStats as in contract 02.2.
 * acne: 8-connected components of alpha > 40, components under 12 px dropped.
 * redness: share of pixels with alpha > 60, percent of the frame, rounded to 0.1.
 */
// The app counts overlapping rings separately (src/lib/scan/mask-core.ts). After seeding, run
// `node --experimental-strip-types scripts/recount-masks.mjs` so the manifest uses the app's numbers.
export async function maskStats(concern, input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const a = (i) => data[i * channels + 3];
  if (concern === 'redness') {
    let n = 0;
    for (let i = 0; i < w * h; i++) if (a(i) > 60) n++;
    return { areaPct: Math.round((n / (w * h)) * 1000) / 10 };
  }
  if (concern === 'acne') {
    const parent = new Int32Array(w * h).fill(-1);
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (x, y) => {
      const rx = find(x); const ry = find(y);
      if (rx !== ry) parent[rx] = ry;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (a(i) <= 40) continue;
        parent[i] = i;
        if (x > 0 && parent[i - 1] >= 0) union(i, i - 1);
        if (y > 0) {
          const up = i - w;
          if (parent[up] >= 0) union(i, up);
          if (x > 0 && parent[up - 1] >= 0) union(i, up - 1);
          if (x < w - 1 && parent[up + 1] >= 0) union(i, up + 1);
        }
      }
    }
    const size = new Map();
    for (let i = 0; i < w * h; i++) if (parent[i] >= 0) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
    let count = 0;
    for (const s of size.values()) if (s >= 12) count++;
    return { blemishCount: count };
  }
  return {};
}

/** Web photo: JPEG q86 at the analysis resolution. */
export const webPhoto = (input) => sharp(input).jpeg({ quality: 86, mozjpeg: true }).toBuffer();

/** Mask as the smallest PNG sharp can make: palette when it wins, otherwise max compression. */
export async function webMask(input) {
  const pal = await sharp(input).png({ palette: true, quality: 100, dither: 0, colours: 256, effort: 10, compressionLevel: 9 }).toBuffer();
  const full = await sharp(input).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  return pal.length < full.length ? pal : full;
}

/** Side-by-side contact sheet of images with a caption strip. */
export async function contactSheet(paths, captions, out, tileW = 552) {
  const tileH = Math.round((tileW * H) / W);
  const capH = 56;
  const tiles = await Promise.all(paths.map((p) => sharp(p).resize(tileW, tileH).toBuffer()));
  const svg = (t) => Buffer.from(`<svg width="${tileW}" height="${capH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="34" font-family="Arial" font-size="20" fill="#222">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
  await sharp({ create: { width: tileW * paths.length, height: tileH + capH, channels: 3, background: '#ffffff' } })
    .composite(tiles.flatMap((t, i) => [
      { input: t, left: i * tileW, top: 0 },
      { input: svg(captions[i] || ''), left: i * tileW, top: tileH },
    ]))
    .jpeg({ quality: 85 })
    .toFile(out);
}
