import {
  addDays,
  NOISE,
  plannedCheckins,
  toIcs,
  type CheckinSlot,
  type Concern,
  type ConcernScore,
  type MaskStats,
  type Scan,
  type Trial,
  type Verdict,
} from '@/lib/domain';
import type { Tone } from '@/components/ui';

/** Object URLs for everything the trial page draws, keyed by scan id. */
export interface TrialUrls {
  photo: Record<string, string>;
  masks: Record<string, Partial<Record<Concern, string>>>;
  /** Skin Simulation frame, when the trial has a projection. */
  target?: string;
}

export const TARGET_ID = 'target';

/** One frame of the trial as the stage and the strip see it: a scan or the simulated target. */
export interface Frame {
  id: string;
  kind: 'baseline' | 'checkin' | 'target';
  day: number;
  date: string;
  photo?: string;
  masks: Partial<Record<Concern, string>>;
  scores: Partial<Record<Concern, ConcernScore>>;
  stats: Partial<Record<Concern, MaskStats>>;
}

export function sortScans(scans: readonly Scan[]): Scan[] {
  return [...scans].sort((a, b) => a.day - b.day || Date.parse(a.takenAt) - Date.parse(b.takenAt));
}

export function baselineOf(scans: readonly Scan[]): Scan | undefined {
  const sorted = sortScans(scans);
  return sorted.find((s) => s.kind === 'baseline') ?? sorted[0];
}

/** Day 0, every check-in in order, then the target. */
export function buildFrames(trial: Trial, scans: readonly Scan[], urls: TrialUrls): Frame[] {
  const frames: Frame[] = sortScans(scans).map((s) => ({
    id: s.id,
    kind: s.kind,
    day: s.day,
    date: s.takenAt,
    photo: urls.photo[s.id],
    masks: urls.masks[s.id] ?? {},
    scores: s.scores,
    stats: s.maskStats ?? {},
  }));
  if (trial.projection) {
    frames.push({
      id: TARGET_ID,
      kind: 'target',
      day: trial.plan.fullEffectDay,
      date: addDays(trial.startedAt, trial.plan.fullEffectDay),
      photo: urls.target,
      masks: {},
      scores: trial.projection.scores,
      stats: {},
    });
  }
  return frames;
}

/** The frame the stage opens on: the latest check-in, else the target, else day 0. */
export function defaultFrameId(frames: readonly Frame[]): string | undefined {
  const checkins = frames.filter((f) => f.kind === 'checkin');
  if (checkins.length) return checkins[checkins.length - 1].id;
  return frames.find((f) => f.kind === 'target')?.id ?? frames[0]?.id;
}

/** Planned check-ins after the last photo, still to come. Empty once the trial is decided. */
export function upcomingSlots(trial: Trial, scans: readonly Scan[]): CheckinSlot[] {
  if (trial.status === 'kept' || trial.status === 'stopped') return [];
  const last = scans.length ? Math.max(...scans.map((s) => s.day)) : -1;
  return plannedCheckins(trial).filter((slot) => slot.day > last);
}

/** Better above the noise, worse below it, no change inside it. */
export function deltaTone(delta: number, noise = NOISE): Exclude<Tone, 'reacting'> {
  if (delta > noise) return 'better';
  if (delta < -noise) return 'worse';
  return 'flat';
}

/** Like deltaTone, but an acne drop during a likely purge reads as Reacting, not Worse. */
export function concernTone(delta: number, concern: Concern, verdict?: Pick<Verdict, 'kind'>): Tone {
  const t = deltaTone(delta);
  if (t === 'worse' && concern === 'acne' && verdict?.kind === 'purging') return 'reacting';
  return t;
}

/** "+8", "−6", "±0" with a true minus sign. */
export function formatDelta(delta: number): string {
  const r = Math.round(delta);
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '±0';
}

/** Short tone word for screen readers next to a coloured number. */
export const TONE_SR: Record<Tone, string> = {
  better: 'better',
  worse: 'worse',
  flat: 'no real change',
  reacting: 'expected during a purge',
};

/** Reasons that explain lowered confidence rather than the verdict itself. */
const CAVEAT = /light in your day|framed differently|started another product/i;

export function splitReasons(verdict: Verdict) {
  const caveats = verdict.reasons.filter((r) => r.tone === 'info' && CAVEAT.test(r.text));
  const reasons = verdict.reasons.filter((r) => !caveats.includes(r));
  return { reasons, caveats };
}

/** Saves an .ics with one event per remaining check-in. Returns false when there is nothing to add. */
export function downloadCalendar(trial: Trial, slots: readonly CheckinSlot[]): boolean {
  if (!slots.length || typeof document === 'undefined') return false;
  const ics = toIcs(trial, slots.map((s) => s.date));
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kept-${trial.product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trial'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
