// maskStats(concern, blob): numbers from a YouCam mask, in a Worker when the mask is large.
import type { Concern, MaskStats } from '@/lib/domain/types';
import { maskStatsFromAlpha, pngSize, STATS_CONCERNS } from './mask-core';
import { decodeAlpha } from './mask-decode';
import type { MaskJob, MaskReply } from './mask.worker';

/** Masks above this many pixels are counted in a Worker. */
export const WORKER_MIN_PIXELS = 1_000_000;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (s: MaskStats) => void; reject: (e: Error) => void }>();

function dropWorker(reason: string) {
  worker?.terminate();
  worker = null; // do not try again in this page load
  for (const p of pending.values()) p.reject(new Error(reason));
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./mask.worker.ts', import.meta.url), { type: 'module', name: 'kept-mask-stats' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = (event: MessageEvent<MaskReply>) => {
    const reply = event.data;
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    if ('error' in reply) p.reject(new Error(reply.error));
    else p.resolve(reply.stats);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    dropWorker(event.message || 'The mask worker failed');
  };
  return worker;
}

function inWorker(w: Worker, concern: Concern, mask: Blob): Promise<MaskStats> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, concern, mask } satisfies MaskJob);
  });
}

async function onMainThread(concern: Concern, mask: Blob): Promise<MaskStats> {
  const { alpha, width, height } = await decodeAlpha(mask);
  return maskStatsFromAlpha(concern, alpha, width, height);
}

/**
 * acne → `{ blemishCount }` (rings on the mask), redness → `{ areaPct }`, other concerns → `{}`.
 * Decodes in a Worker when the mask is over 1 Mp; falls back to the main thread if the Worker fails.
 */
export async function maskStats(concern: Concern, mask: Blob): Promise<MaskStats> {
  if (!STATS_CONCERNS.includes(concern)) return {};
  const size = pngSize(new Uint8Array(await mask.slice(0, 24).arrayBuffer()));
  const large = !size || size.width * size.height > WORKER_MIN_PIXELS;
  const w = large ? getWorker() : null;
  if (w) {
    try {
      return await inWorker(w, concern, mask);
    } catch {
      // Worker could not load or decode: try once more here.
    }
  }
  return onMainThread(concern, mask);
}
