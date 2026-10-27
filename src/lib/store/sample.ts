import { materializeManifest } from '@/lib/domain/manifest';
import type { DemoManifest } from '@/lib/domain/types';
import { getDb, newId } from './db';

export const MANIFEST_URL = '/demo/manifest.json';

export interface ImportOptions {
  /** Defaults to global fetch. Tests pass their own. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  now?: Date;
  url?: string;
}

let inFlight: Promise<string[]> | null = null;

async function existingSampleIds(): Promise<string[]> {
  const all = await (await getDb()).getAll('trials');
  return all
    .filter((t) => t.sample)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((t) => t.id);
}

export async function loadManifest(options: ImportOptions = {}): Promise<DemoManifest> {
  const doFetch = options.fetch ?? ((u: string) => fetch(u));
  const res = await doFetch(options.url ?? MANIFEST_URL);
  if (!res.ok) throw new Error(`Couldn't load the sample trials (${res.status})`);
  return (await res.json()) as DemoManifest;
}

/**
 * Copies the demo shelf into this browser. Returns the sample trial ids in manifest order.
 * If sample trials already exist, returns their ids (oldest start first) and imports nothing.
 * Concurrent calls share one import.
 */
export function importSample(options: ImportOptions = {}): Promise<string[]> {
  if (!inFlight) {
    inFlight = (async () => {
      const existing = await existingSampleIds();
      if (existing.length) return existing;
      const manifest = await loadManifest(options);
      const { trials, scans, trialIds } = materializeManifest(manifest, options.now ?? new Date(), newId);
      const db = await getDb();
      const tx = db.transaction(['trials', 'scans'], 'readwrite');
      await Promise.all([
        ...trials.map((t) => tx.objectStore('trials').put(t)),
        ...scans.map((s) => tx.objectStore('scans').put(s)),
      ]);
      await tx.done;
      return trialIds;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
