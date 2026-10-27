// Photo preparation before upload: orientation, size, JPEG weight, luminance.
import { decodeImage, drawScaled, type Surface } from './canvas';
import { MESSAGES, ScanError } from './errors';

export const MAX_SIDE = 2048;
export const MIN_SHORT_SIDE = 480;
/** The server takes up to 4 MB; stay under it with room for the multipart envelope. */
export const MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024;
export const JPEG_QUALITIES = [0.92, 0.85] as const;
/** Long side of the thumbnail luminance is measured on. */
const LUMA_SIDE = 256;
/** Times the photo may shrink by 15 % when even quality 0.85 is too heavy (noise-like photos). */
const MAX_SHRINKS = 4;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Mean luma Y (0..255, Rec. 709) of the central 40 % of the frame. */
  luminance: number;
}

/** A decoded photo that can be drawn at any size. The browser codec uses canvas; tests use sharp. */
export interface DecodedPhoto {
  width: number;
  height: number;
  /** JPEG of the photo scaled to width × height. */
  encode(width: number, height: number, quality: number): Promise<Blob>;
  /** RGBA pixels of the photo scaled to width × height. */
  pixels(width: number, height: number): Promise<Uint8ClampedArray | Uint8Array>;
  close(): void;
}

export interface ImageCodec {
  decode(file: Blob): Promise<DecodedPhoto>;
}

export const browserCodec: ImageCodec = {
  async decode(file) {
    const img = await decodeImage(file);
    const surfaces = new Map<string, Surface>();
    const surface = (w: number, h: number) => {
      const key = `${w}x${h}`;
      let s = surfaces.get(key);
      if (!s) {
        s = drawScaled(img, w, h);
        surfaces.set(key, s);
      }
      return s;
    };
    return {
      width: img.width,
      height: img.height,
      encode: (w, h, q) => surface(w, h).toBlob('image/jpeg', q),
      pixels: async (w, h) => surface(w, h).ctx.getImageData(0, 0, w, h).data,
      close: () => {
        surfaces.clear();
        img.close();
      },
    };
  },
};

/** Mean luma (Rec. 709) of the centred box covering `share` of the width and of the height. */
export function centerLuminance(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, share = 0.4): number {
  const x0 = Math.floor((width * (1 - share)) / 2);
  const y0 = Math.floor((height * (1 - share)) / 2);
  const x1 = Math.max(x0 + 1, Math.ceil((width * (1 + share)) / 2));
  const y1 = Math.max(y0 + 1, Math.ceil((height * (1 + share)) / 2));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      n++;
    }
  }
  return Math.round((sum / n) * 10) / 10;
}

/** Size that fits `maxSide` on the long side, never upscaled. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Decodes the photo with its EXIF orientation, scales the long side to `maxSide` and encodes JPEG
 * 0.92, or 0.85 when that is over 3.8 MB. Rejects photos under 480 px on the short side.
 */
export async function prepareImage(file: Blob, maxSide = MAX_SIDE, codec: ImageCodec = browserCodec): Promise<PreparedImage> {
  let photo: DecodedPhoto;
  try {
    photo = await codec.decode(file);
  } catch {
    throw new ScanError('face', MESSAGES.unreadable);
  }
  try {
    if (Math.min(photo.width, photo.height) < MIN_SHORT_SIDE) throw new ScanError('face', MESSAGES.tooSmall);

    const thumb = fitSize(photo.width, photo.height, LUMA_SIDE);
    const luminance = centerLuminance(await photo.pixels(thumb.width, thumb.height), thumb.width, thumb.height);

    let side = maxSide;
    let last: { blob: Blob; width: number; height: number } | undefined;
    for (let shrink = 0; shrink <= MAX_SHRINKS; shrink++) {
      const size = fitSize(photo.width, photo.height, side);
      for (const q of JPEG_QUALITIES) {
        const blob = await photo.encode(size.width, size.height, q);
        last = { blob, ...size };
        if (blob.size <= MAX_UPLOAD_BYTES) return { ...last, luminance };
      }
      if (Math.min(size.width, size.height) * 0.85 < MIN_SHORT_SIDE) break;
      side = Math.round(Math.max(size.width, size.height) * 0.85);
    }
    // Still heavy: hand it over anyway, the server answers with its own size message.
    return { ...last!, luminance };
  } finally {
    photo.close();
  }
}
