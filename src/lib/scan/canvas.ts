// Browser image plumbing shared by prepareImage and mask decoding: decode, draw, read pixels, encode.
// Works on the main thread and in a Worker (OffscreenCanvas); falls back to <canvas> and <img>.

export type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface Surface {
  ctx: Canvas2D;
  width: number;
  height: number;
  toBlob(type: string, quality?: number): Promise<Blob>;
}

export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) return { ctx, width, height, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) };
  }
  if (typeof document === 'undefined') throw new Error('No canvas is available here');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  return {
    ctx,
    width,
    height,
    toBlob: (type, quality) =>
      new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas could not be encoded'))), type, quality),
      ),
  };
}

export interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

/**
 * Decodes an image with EXIF orientation applied. `raw` keeps alpha unpremultiplied and skips
 * colour conversion, which mask decoding needs to read alpha exactly.
 */
export async function decodeImage(blob: Blob, { raw = false }: { raw?: boolean } = {}): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const options: ImageBitmapOptions = raw
      ? { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }
      : { imageOrientation: 'from-image' };
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob, options);
    } catch {
      // Older Safari rejects some options; the plain call still decodes.
      bmp = await createImageBitmap(blob);
    }
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  if (typeof Image === 'undefined') throw new Error('No image decoder is available here');
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws the decoded image scaled into a new surface. */
export function drawScaled(img: Decoded, width: number, height: number): Surface {
  const s = createSurface(width, height);
  s.ctx.imageSmoothingEnabled = true;
  s.ctx.imageSmoothingQuality = 'high';
  s.ctx.drawImage(img.source, 0, 0, width, height);
  return s;
}
