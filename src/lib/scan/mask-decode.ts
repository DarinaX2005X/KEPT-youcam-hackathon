// Decodes a mask PNG (RGBA or palette) into its alpha channel in the browser or a Worker.
import { createSurface, decodeImage } from './canvas';
import { alphaOf } from './mask-core';

export interface DecodedAlpha {
  alpha: Uint8Array;
  width: number;
  height: number;
}

export async function decodeAlpha(mask: Blob): Promise<DecodedAlpha> {
  const img = await decodeImage(mask, { raw: true });
  try {
    const { width, height } = img;
    const s = createSurface(width, height);
    s.ctx.clearRect(0, 0, width, height);
    s.ctx.drawImage(img.source, 0, 0);
    return { alpha: alphaOf(s.ctx.getImageData(0, 0, width, height).data), width, height };
  } finally {
    img.close();
  }
}
