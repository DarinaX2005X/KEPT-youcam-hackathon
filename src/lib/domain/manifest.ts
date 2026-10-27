import { addDays, DAY_MS } from './dates';
import type { DemoManifest, Scan, Trial } from './types';

const OFFSET = /^([+-])(\d+(?:\.\d+)?)d$/;

/**
 * Reads a manifest date. "-21d" means 21 days before `now`; "+56d" means 56 days after `anchor`
 * (the trial start); anything else is taken as an ISO date.
 */
export function resolveOffset(value: string, now: Date, anchor?: string): string {
  const m = OFFSET.exec(value.trim());
  if (!m) {
    const t = Date.parse(value);
    if (Number.isNaN(t)) throw new Error(`Bad date in demo manifest: ${value}`);
    return new Date(t).toISOString();
  }
  const days = Number(m[2]);
  if (m[1] === '-') return new Date(now.getTime() - days * DAY_MS).toISOString();
  if (!anchor) throw new Error(`"+${days}d" needs a start date`);
  return addDays(anchor, days);
}

export interface MaterializedSample {
  trials: Trial[];
  scans: Scan[];
  /** New trial ids in manifest order. */
  trialIds: string[];
  /** Manifest id → new id, for trials and scans (lets callers remap `hero`). */
  idMap: Record<string, string>;
}

/**
 * Turns the demo manifest into fresh records: new ids, `sample: true`, start dates counted back
 * from `now`, and each scan's takenAt = startedAt + day.
 */
export function materializeManifest(manifest: DemoManifest, now: Date, newId: () => string): MaterializedSample {
  const idMap: Record<string, string> = {};
  const trials: Trial[] = [];
  const scans: Scan[] = [];
  for (const entry of manifest.trials) {
    const source = JSON.parse(JSON.stringify(entry.trial)) as Trial;
    const id = newId();
    idMap[source.id] = id;
    const startedAt = resolveOffset(source.startedAt, now);
    const trial: Trial = { ...source, id, startedAt, sample: true };
    if (source.decidedAt) trial.decidedAt = resolveOffset(source.decidedAt, now, startedAt);
    else delete trial.decidedAt;
    trials.push(trial);
    for (const raw of entry.scans) {
      const s = JSON.parse(JSON.stringify(raw)) as Scan;
      const scanId = newId();
      idMap[s.id] = scanId;
      scans.push({ ...s, id: scanId, trialId: id, takenAt: addDays(startedAt, s.day) });
    }
  }
  return { trials, scans, trialIds: trials.map((t) => t.id), idMap };
}
