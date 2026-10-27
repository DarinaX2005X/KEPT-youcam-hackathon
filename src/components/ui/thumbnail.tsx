'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { BlobRef } from '@/lib/domain';
import { blobUrl, getBlob } from '@/lib/store';

/** Thumbnails are drawn at this width: a 64–80 px print on a 2× screen with room to spare. */
export const THUMB_WIDTH = 200;

/** One downscaled object URL per stored blob (by id) or per object URL, for the life of the page. */
const cache = new Map<string, Promise<string>>();

/** Static files from /public go through next/image; object and data URLs are ours to shrink. */
export function isStaticSrc(src: string): boolean {
  return !src.startsWith('blob:') && !src.startsWith('data:');
}

async function shrink(blob: Blob, width = THUMB_WIDTH): Promise<Blob> {
  const probe = await createImageBitmap(blob);
  const scale = Math.min(1, width / probe.width);
  const w = Math.max(1, Math.round(probe.width * scale));
  const h = Math.max(1, Math.round(probe.height * scale));
  probe.close();
  const bitmap = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.86));
  } finally {
    bitmap.close();
  }
}

function cached(key: string, load: () => Promise<Blob | undefined>, fallback: () => Promise<string>): Promise<string> {
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      const blob = await load();
      if (!blob) throw new Error(`Missing image ${key}`);
      return URL.createObjectURL(await shrink(blob));
    })().catch(() => {
      cache.delete(key);
      return fallback();
    });
    cache.set(key, hit);
  }
  return hit;
}

/**
 * A small URL for a stored photo. `{ url }` comes back as is (render it with <ThumbImage> so next/image
 * resizes it); `{ id }` becomes a ~200 px JPEG made once per blob. Falls back to the full photo.
 */
export async function thumbUrl(ref: BlobRef): Promise<string> {
  if ('url' in ref) return ref.url;
  return cached(`id:${ref.id}`, () => getBlob(ref), () => blobUrl(ref));
}

/** The same for a URL already on the page, such as an object URL of a full photo. */
export function thumbFromSrc(src: string): Promise<string> {
  if (isStaticSrc(src)) return Promise.resolve(src);
  return cached(`src:${src}`, () => fetch(src).then((r) => (r.ok ? r.blob() : undefined)), () => Promise.resolve(src));
}

/** Small version of `src`; undefined until it is ready (a few milliseconds for a cached one). */
export function useThumbSrc(src: string | undefined): string | undefined {
  const [state, setState] = useState<{ from?: string; url?: string }>({});
  useEffect(() => {
    if (!src || isStaticSrc(src)) return;
    let live = true;
    void thumbFromSrc(src).then((url) => live && setState({ from: src, url }));
    return () => {
      live = false;
    };
  }, [src]);
  if (!src) return undefined;
  if (isStaticSrc(src)) return src;
  return state.from === src ? state.url : undefined;
}

export interface ThumbImageProps {
  src: string;
  alt?: string;
  /** CSS width of the slot, e.g. "64px"; tells next/image which size to send. */
  sizes: string;
  className?: string;
  priority?: boolean;
}

/**
 * A photo in a small slot. Demo files are resized by next/image; the person's own photos are shrunk
 * in the browser once. Fills its positioned parent.
 */
export function ThumbImage({ src, alt = '', sizes, className, priority }: ThumbImageProps) {
  const small = useThumbSrc(src);
  if (isStaticSrc(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} className={className} priority={priority} draggable={false} />;
  }
  if (!small) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={small} alt={alt} className={className} decoding="async" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
