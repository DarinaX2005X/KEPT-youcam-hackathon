import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { alphaOf, countBlemishes, findMarks, maskStatsFromAlpha, pngSize, rednessAreaPct } from '@/lib/scan/mask-core';

const FIX = path.join(__dirname, 'fixtures');
const DEMO = path.join(__dirname, '..', '..', 'public', 'demo');

async function alphaOfPng(file: string | Buffer) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { alpha: alphaOf(new Uint8Array(data.buffer, data.byteOffset, data.length), info.channels), width: info.width, height: info.height };
}

/** Draws YouCam-like rings (and optional filled dots) on a transparent canvas. */
function canvas(width: number, height: number) {
  const alpha = new Uint8Array(width * height);
  return {
    alpha,
    ring(cx: number, cy: number, r = 12.5, stroke = 4, a = 255) {
      for (let y = Math.floor(cy - r - stroke); y <= cy + r + stroke; y++) {
        for (let x = Math.floor(cx - r - stroke); x <= cx + r + stroke; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (x >= 0 && y >= 0 && x < width && y < height && Math.abs(d - r) <= stroke / 2) alpha[y * width + x] = a;
        }
      }
      return this;
    },
    dot(cx: number, cy: number, r = 6, a = 154) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) alpha[y * width + x] = a;
      }
      return this;
    },
    speck(x: number, y: number, n = 5) {
      for (let i = 0; i < n; i++) alpha[y * width + x + i] = 255;
      return this;
    },
  };
}

describe('acne mask: rings are blemishes', () => {
  it('counts the 21 rings on the real YouCam mask (m_acne.png)', async () => {
    // Counted by eye on the picture: 21 blue rings. Three groups overlap (2, 3 and 2 rings) and
    // two small filled dots (alpha 128 and 154) are not rings.
    const { alpha, width, height } = await alphaOfPng(path.join(FIX, 'm_acne.png'));
    expect([width, height]).toEqual([1104, 1472]);
    const marks = findMarks(alpha, width, height);
    expect(marks.rings).toBe(21);
    expect(marks.dots).toBe(2);
    expect(marks.components.filter((c) => c.rings > 1).map((c) => c.rings).sort()).toEqual([2, 2, 3]);
    expect(marks.ringArea).toBeGreaterThan(280);
    expect(marks.ringArea).toBeLessThan(320);
    expect(maskStatsFromAlpha('acne', alpha, width, height)).toEqual({ blemishCount: 21 });
  });

  it('a synthetic mask with 7 rings gives 7', () => {
    const c = canvas(400, 300);
    [
      [40, 40], [120, 60], [200, 40], [300, 80], [60, 200], [180, 220], [320, 240],
    ].forEach(([x, y]) => c.ring(x, y));
    expect(countBlemishes(c.alpha, 400, 300)).toBe(7);
  });

  it('splits overlapping rings, ignores dots and specks', () => {
    const c = canvas(400, 300)
      .ring(50, 50).ring(66, 58) // two overlapping
      .ring(200, 100).ring(220, 100).ring(240, 104) // three in a chain
      .ring(100, 200)
      .dot(300, 200).dot(330, 60, 6, 128) // dots alone
      .ring(300, 250).dot(300, 268) // a dot on a ring's edge
      .speck(10, 290, 5); // under 12 px
    const marks = findMarks(c.alpha, 400, 300);
    expect(marks.rings).toBe(2 + 3 + 1 + 1);
    expect(marks.dots).toBe(2);
  });

  it('works at other mask sizes because the ring area is measured on the mask itself', () => {
    const c = canvas(200, 150);
    for (let i = 0; i < 9; i++) c.ring(15 + (i % 3) * 30, 15 + Math.floor(i / 3) * 30, 6, 2);
    c.ring(150, 100, 6, 2).ring(158, 104, 6, 2);
    expect(countBlemishes(c.alpha, 200, 150)).toBe(11);
  });

  it('counts anti-aliased ring edges as part of the ring (alpha > 40)', () => {
    const c = canvas(200, 200);
    for (const [x, y] of [[40, 40], [120, 40], [80, 140]]) c.ring(x, y, 12.5, 6, 30).ring(x, y, 12.5, 4, 200);
    expect(countBlemishes(c.alpha, 200, 200)).toBe(3);
  });

  it('gives 0 on an empty mask', () => {
    expect(countBlemishes(new Uint8Array(100 * 80), 100, 80)).toBe(0);
  });

  it('reads demo palette PNGs the same as RGBA ones', async () => {
    const file = path.join(DEMO, 'salicylic-serum', 'day-0', 'mask-acne.png');
    const meta = await sharp(file).metadata();
    const { alpha, width, height } = await alphaOfPng(file);
    const viaRgba = await sharp(file).ensureAlpha().png({ palette: false }).toBuffer();
    const again = await alphaOfPng(viaRgba);
    expect(meta.width).toBe(1104);
    expect(countBlemishes(alpha, width, height)).toBe(countBlemishes(again.alpha, again.width, again.height));
    expect(countBlemishes(alpha, width, height)).toBeGreaterThan(20);
  });

  it('rejects a buffer that does not match the size', () => {
    expect(() => countBlemishes(new Uint8Array(10), 10, 10)).toThrow(RangeError);
  });
});

describe('redness mask: area share', () => {
  it('is the share of pixels with alpha > 60, rounded to 0.1', async () => {
    const { alpha, width, height } = await alphaOfPng(path.join(FIX, 'm_redness.png'));
    let n = 0;
    for (const a of alpha) if (a > 60) n++;
    const expected = Math.round((n / (width * height)) * 1000) / 10;
    expect(rednessAreaPct(alpha, width, height)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(maskStatsFromAlpha('redness', alpha, width, height)).toEqual({ areaPct: expected });
  });

  it('treats alpha 60 as outside and 61 as inside', () => {
    const alpha = new Uint8Array(1000);
    alpha.fill(60, 0, 500);
    alpha.fill(61, 500, 750);
    expect(rednessAreaPct(alpha, 100, 10)).toBe(25);
  });

  it('has no stats for other concerns', () => {
    expect(maskStatsFromAlpha('pore', new Uint8Array(4), 2, 2)).toEqual({});
  });
});

describe('pngSize', () => {
  it('reads width and height from the header', () => {
    expect(pngSize(new Uint8Array(readFileSync(path.join(FIX, 'm_acne.png')).subarray(0, 24)))).toEqual({ width: 1104, height: 1472 });
  });
  it('returns null for other bytes', () => {
    expect(pngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)]))).toBeNull();
  });
});
