import { DAY_MS } from '@/lib/domain/dates';
import { materializeManifest, resolveOffset } from '@/lib/domain/manifest';
import type { DemoManifest, Trial } from '@/lib/domain/types';
import { deleteTrial, getDb, newId } from './db';

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

async function writeSample(manifest: DemoManifest, now: Date): Promise<string[]> {
  const { trials, scans, trialIds } = materializeManifest(manifest, now, newId);
  const db = await getDb();
  const tx = db.transaction(['trials', 'scans'], 'readwrite');
  await Promise.all([...trials.map((t) => tx.objectStore('trials').put(t)), ...scans.map((s) => tx.objectStore('scans').put(s))]);
  await tx.done;
  return trialIds;
}

/** Puts `job` in the shared slot until it settles. Imports and resets never write the shelf at the same time. */
function occupy(job: Promise<string[]>): Promise<string[]> {
  const slot: Promise<string[]> = job.finally(() => {
    if (inFlight === slot) inFlight = null;
  });
  slot.catch(() => undefined);
  inFlight = slot;
  return job;
}

/**
 * Copies the demo shelf into this browser. Returns the sample trial ids in manifest order.
 * If sample trials already exist, returns their ids (oldest start first) and imports nothing.
 * Concurrent calls share one import.
 */
export function importSample(options: ImportOptions = {}): Promise<string[]> {
  if (inFlight) return inFlight;
  return occupy(
    (async () => {
      const existing = await existingSampleIds();
      if (existing.length) return existing;
      return writeSample(await loadManifest(options), options.now ?? new Date());
    })(),
  );
}

/**
 * Deletes every sample trial with its scans and stored images, then imports the demo shelf again
 * with dates counted from now. The manifest is fetched first, so a failed fetch leaves the old
 * samples in place. Returns the new ids in manifest order.
 */
export function resetSamples(options: ImportOptions = {}): Promise<string[]> {
  const before = inFlight;
  return occupy(
    (async () => {
      if (before) await before.catch(() => undefined);
      const manifest = await loadManifest(options);
      for (const id of await existingSampleIds()) await deleteTrial(id);
      return writeSample(manifest, options.now ?? new Date());
    })(),
  );
}

/** Days a sample may drift from its manifest dates before /demo imports it again. */
export const SAMPLE_DRIFT_DAYS = 2;

/**
 * True when the sample trials in this browser were imported long enough ago that their days no
 * longer match the manifest (the retinal sample should be on day 21, not day 40). Only trials whose
 * start is written relative to now ("-21d") are compared; they are matched by product name.
 */
export function samplesDrifted(manifest: DemoManifest, trials: readonly Trial[], now = new Date(), toleranceDays = SAMPLE_DRIFT_DAYS): boolean {
  const samples = trials.filter((t) => t.sample);
  for (const entry of manifest.trials) {
    if (!/^-/.test(entry.trial.startedAt.trim())) continue;
    const found = samples.find((t) => t.product.name === entry.trial.product.name);
    if (!found) continue;
    const expected = Date.parse(resolveOffset(entry.trial.startedAt, now));
    if (Math.abs(Date.parse(found.startedAt) - expected) > toleranceDays * DAY_MS) return true;
  }
  return false;
}
