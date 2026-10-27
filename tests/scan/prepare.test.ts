import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { centerLuminance, fitSize, MAX_UPLOAD_BYTES, prepareImage, type ImageCodec } from '@/lib/scan/prepare';
import { ScanError } from '@/lib/scan/errors';

/** The browser codec draws on canvas; this one does the same steps with sharp so node can run them. */
function sharpCodec(log: number[] = []): ImageCodec {
  return {
    async decode(file) {
      const buf = Buffer.from(await file.arrayBuffer());
      const meta = await sharp(buf).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      const width = rotated ? meta.height! : meta.width!;
      const height = rotated ? meta.width! : meta.height!;
      const oriented = () => sharp(buf).rotate(); // applies EXIF orientation like imageOrientation: 'from-image'
      return {
        width,
        height,
        async encode(w, h, q) {
          log.push(q);
          const out = await oriented().resize(w, h, { fit: 'fill' }).jpeg({ quality: Math.round(q * 100) }).toBuffer();
          return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
        },
        async pixels(w, h) {
          const out = await oriented().resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
          return new Uint8Array(out);
        },
        close() {},
      };
    },
  };
}

const toBlob = (buf: Buffer, type = 'image/jpeg') => new Blob([new Uint8Array(buf)], { type });

async function noisePhoto(width: number, height: number) {
  const buf = await sharp({ create: { width, height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 70 } } })
    .jpeg({ quality: 98 })
    .toBuffer();
  return toBlob(buf);
}

describe('prepareImage', () => {
  it('brings a 4000 × 3000 photo to 2048 on the long side and under 3.8 MB', async () => {
    const log: number[] = [];
    const input = await noisePhoto(4000, 3000);
    expect(input.size).toBeGreaterThan(MAX_UPLOAD_BYTES); // a heavy source
    const out = await prepareImage(input, undefined, sharpCodec(log));
    expect(out.width).toBe(2048);
    expect(out.height).toBe(1536);
    expect(out.blob.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(out.blob.type).toBe('image/jpeg');
    expect(log[0]).toBe(0.92);
    const meta = await sharp(Buffer.from(await out.blob.arrayBuffer())).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([out.width, out.height, 'jpeg']);
    expect(out.luminance).toBeGreaterThan(100);
    expect(out.luminance).toBeLessThan(160);
  }, 30_000);

  it('keeps a small enough photo at its own size', async () => {
    const input = toBlob(await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#a0a0a0' } }).jpeg().toBuffer());
    const out = await prepareImage(input, undefined, sharpCodec());
    expect([out.width, out.height]).toEqual([900, 1200]);
  });

  it('applies EXIF orientation before measuring', async () => {
    const buf = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#a0a0a0' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await prepareImage(toBlob(buf), undefined, sharpCodec());
    expect([out.width, out.height]).toEqual([900, 1200]);
  });

  it('falls back to 0.85, then shrinks, when the JPEG is still too heavy', async () => {
    const log: string[] = [];
    const heavy = (w: number, h: number, q: number) => {
      log.push(`${w}x${h}@${q}`);
      // 0.92 is always too heavy; 0.85 fits from 1741 px on the long side down.
      const big = q > 0.9 || Math.max(w, h) > 1800;
      return new Blob([new Uint8Array(big ? MAX_UPLOAD_BYTES + 1 : 1000)], { type: 'image/jpeg' });
    };
    const codec: ImageCodec = {
      decode: async () => ({ width: 3000, height: 4000, encode: async (w, h, q) => heavy(w, h, q), pixels: async (w, h) => new Uint8Array(w * h * 4).fill(128), close() {} }),
    };
    const out = await prepareImage(new Blob(['x']), 2048, codec);
    expect(log).toEqual(['1536x2048@0.92', '1536x2048@0.85', '1306x1741@0.92', '1306x1741@0.85']);
    expect([out.width, out.height]).toEqual([1306, 1741]);
    expect(out.blob.size).toBe(1000);
    expect(out.luminance).toBe(128);
  });

  it('refuses a photo under 480 px on the short side', async () => {
    const input = toBlob(await sharp({ create: { width: 470, height: 640, channels: 3, background: '#a0a0a0' } }).jpeg().toBuffer());
    const err = await prepareImage(input, undefined, sharpCodec()).catch((e) => e);
    expect(err).toBeInstanceOf(ScanError);
    expect(err).toMatchObject({ code: 'face', message: 'This photo is too small. Use one at least 480 px wide' });
  });

  it('refuses a file that is not an image', async () => {
    const err = await prepareImage(new Blob(['not an image'], { type: 'text/plain' }), undefined, sharpCodec()).catch((e) => e);
    expect(err).toMatchObject({ code: 'face', message: 'Kept could not open this file. Use a JPEG or PNG photo' });
  });
});

describe('centerLuminance', () => {
  it('reads only the central 40 % of the frame', () => {
    const w = 100;
    const h = 100;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x >= 30 && x < 70 && y >= 30 && y < 70 ? 200 : 10;
        rgba.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    expect(centerLuminance(rgba, w, h)).toBe(200);
  });

  it('weights channels as Rec. 709', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
    expect(centerLuminance(rgba, 2, 2)).toBe(54.2);
  });
});

describe('fitSize', () => {
  it('scales the long side down and never up', () => {
    expect(fitSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitSize(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});
