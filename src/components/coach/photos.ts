'use client';

import type { BlobRef, Scan } from '@/lib/domain';
import { blobUrl } from '@/lib/store';
import type { CoachPhotos } from './context';

export const PHOTO_SIDE = 512;

async function shrink(ref: BlobRef): Promise<string> {
  const url = await blobUrl(ref);
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

/** The day-0 photo and the latest one, or null when the trial has only one photo. */
export function photoPair(scans: readonly Scan[]): { first: Scan; latest: Scan } | null {
  const sorted = [...scans].sort((a, b) => a.day - b.day || Date.parse(a.takenAt) - Date.parse(b.takenAt));
  const first = sorted.find((s) => s.kind === 'baseline') ?? sorted[0];
  const latest = sorted[sorted.length - 1];
  return first && latest && first !== latest ? { first, latest } : null;
}

/** Day 0 and the latest photo as 512 px JPEG data URLs. */
export async function coachPhotos(scans: readonly Scan[]): Promise<CoachPhotos | undefined> {
  const pair = photoPair(scans);
  if (!pair) return undefined;
  const [a, b] = await Promise.all([shrink(pair.first.photo), shrink(pair.latest.photo)]);
  return { first: { day: pair.first.day, url: a }, latest: { day: pair.latest.day, url: b } };
}
