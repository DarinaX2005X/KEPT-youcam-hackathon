// Mask statistics off the main thread: a 1104 × 1472 mask is 1.6 Mp of pixels to walk.
import type { Concern, MaskStats } from '@/lib/domain/types';
import { maskStatsFromAlpha } from './mask-core';
import { decodeAlpha } from './mask-decode';

export interface MaskJob {
  id: number;
  concern: Concern;
  mask: Blob;
}

export type MaskReply = { id: number; stats: MaskStats } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<MaskJob>) => {
  const { id, concern, mask } = event.data;
  try {
    const { alpha, width, height } = await decodeAlpha(mask);
    scope.postMessage({ id, stats: maskStatsFromAlpha(concern, alpha, width, height) } satisfies MaskReply);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies MaskReply);
  }
};
