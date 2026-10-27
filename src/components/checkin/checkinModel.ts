import {
  ALIGNMENT_LIMIT,
  LIGHT_MEDIUM,
  dayOf,
  nextCheckin,
  type BlobRef,
  type CaptureMeta,
  type Concern,
  type DiaryEntry,
  type Scan,
  type Trial,
} from '@/lib/domain';
import { newId, putBlob, saveScan } from '@/lib/store';
import type { AnalysisOutcome } from '@/lib/scan';

/** YouCam takes at most 8 areas per analysis. */
const MAX_AREAS = 8;

/** The same areas as day 0: goals first, then the areas watched for irritation. */
export function checkinConcerns(trial: Pick<Trial, 'targets' | 'watch'>): Concern[] {
  const out: Concern[] = [];
  for (const c of [...trial.targets, ...trial.watch]) if (!out.includes(c)) out.push(c);
  return out.slice(0, MAX_AREAS);
}

export interface CheckinSlotInfo {
  day: number;
  /** Before the next planned day, or a second photo on the same day. */
  extra: boolean;
  /** Day of the last photo, for «Anything new since day 14?». */
  sinceDay: number;
}

export function slotFor(trial: Trial, scans: readonly Scan[], now: Date): CheckinSlotInfo {
  const day = Math.max(0, dayOf(trial, now));
  const planned = nextCheckin(trial, scans, now);
  const sameDay = scans.some((s) => s.day === day);
  const extra = sameDay || !planned || planned.day > day;
  const sinceDay = scans.length ? Math.max(...scans.map((s) => s.day)) : 0;
  return { day, extra, sinceDay };
}

export interface PhotoDifference {
  /** Relative change of mean brightness against day 0, e.g. −0.22. */
  light?: number;
  /** Framed further from the day 0 outline than the verdict accepts. */
  framing: boolean;
}

/**
 * How this photo differs from day 0 in the ways the verdict's confidence reads
 * (`capture.luminance` against the baseline's, and `capture.alignment`).
 */
export function photoDifference(baseline: Scan | undefined, meta: CaptureMeta): PhotoDifference {
  const base = baseline?.capture?.luminance;
  const light = base && base > 0 && meta.luminance > 0 ? (meta.luminance - base) / base : undefined;
  return {
    light: light !== undefined && Math.abs(light) >= LIGHT_MEDIUM ? light : undefined,
    framing: meta.alignment !== undefined && meta.alignment > ALIGNMENT_LIMIT,
  };
}

/** Drops empty diary fields so a check-in with nothing to report stores no diary. */
export function cleanDiary(d: DiaryEntry): DiaryEntry | undefined {
  const out: DiaryEntry = {};
  if (d.newProduct) out.newProduct = true;
  if (d.period) out.period = true;
  if (d.sun) out.sun = true;
  if (d.poorSleep) out.poorSleep = true;
  const note = d.note?.trim();
  if (note) out.note = note.slice(0, 500);
  return Object.keys(out).length ? out : undefined;
}

export interface SaveCheckinInput {
  trial: Trial;
  outcome: AnalysisOutcome;
  capture: CaptureMeta;
  diary?: DiaryEntry;
  day: number;
  takenAt: Date;
}

/** Stores the aligned photo and masks as blobs and saves the check-in scan. */
export async function saveCheckin({ trial, outcome, capture, diary, day, takenAt }: SaveCheckinInput): Promise<Scan> {
  const maskEntries = Object.entries(outcome.masks).filter((e): e is [Concern, Blob] => Boolean(e[1]));
  const [photo, ...maskRefs] = await Promise.all([putBlob(outcome.image), ...maskEntries.map(([, b]) => putBlob(b))]);
  const masks: Partial<Record<Concern, BlobRef>> = {};
  maskEntries.forEach(([c], i) => (masks[c] = maskRefs[i]));

  const scan: Scan = {
    id: newId(),
    trialId: trial.id,
    kind: 'checkin',
    day,
    takenAt: takenAt.toISOString(),
    photo,
    masks,
    scores: outcome.scores,
    overall: outcome.overall,
    skinAge: outcome.skinAge,
    maskStats: outcome.maskStats,
    capture,
  };
  if (diary) scan.diary = diary;
  await saveScan(scan);
  return scan;
}

/** The trial page reads this to know the camera was opened from it, so closing goes back in history. */
export const FROM_TRIAL_KEY = 'kept:checkin-from';
