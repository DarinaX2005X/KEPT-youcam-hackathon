// What the panel sends to /api/coach and what comes back. Shared by the panel and the route.
import { dayOf, type Concern, type DiaryEntry, type Scan, type Trial, type TrialPlan, type Verdict, type VerdictKind } from '@/lib/domain';

/** One photo of the trial without the photo: ui scores (1–100, higher is better) and map counts. */
export interface ContextScan {
  day: number;
  kind: 'baseline' | 'checkin';
  scores: Partial<Record<Concern, number>>;
  /** Blemishes counted on the acne map. */
  blemishes?: number;
  /** Share of the face flagged on the redness map, %. */
  redAreaPct?: number;
  diary?: DiaryEntry;
}

/** Trial data the assistant may use. Built on the client; never contains photos. */
export interface TrialContext {
  product: { name: string; actives: string[] };
  status: Trial['status'];
  /** Trial day the verdict talks about: today for running trials, the last photo for decided ones. */
  today: number;
  targets: Concern[];
  watch: Concern[];
  plan: TrialPlan;
  /** Projected ui scores from YouCam Skin Simulation (the trial's target), when the trial has one. */
  projection?: Partial<Record<Concern, number>>;
  scans: ContextScan[];
  verdict: {
    kind: VerdictKind;
    headline: string;
    summary: string;
    reasons: string[];
    confidence: Verdict['confidence'];
    next: string;
  };
}

/** Day 0 and latest photo, 512 px JPEG data URLs. Only sent when the person turned photos on. */
export interface CoachPhotos {
  first: { day: number; url: string };
  latest: { day: number; url: string };
}

export interface CoachRequest {
  question: string;
  context: TrialContext;
  photos?: CoachPhotos;
}

/** Stream events from POST /api/coach (SSE `event:` name → JSON `data:`). */
export type CoachEvent =
  | { type: 'tool'; name: string; label: string }
  | { type: 'text'; text: string }
  /** Text streamed so far was a preamble before a tool call; the panel clears it. */
  | { type: 'reset' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const QUESTION_MAX = 300;
export const DAILY_QUESTIONS = 10;

function scoresOf(scan: Scan): Partial<Record<Concern, number>> {
  const out: Partial<Record<Concern, number>> = {};
  for (const [c, s] of Object.entries(scan.scores) as [Concern, Scan['scores'][Concern]][]) {
    if (s && Number.isFinite(s.ui)) out[c] = s.ui;
  }
  return out;
}

function cleanDiary(d: DiaryEntry | undefined): DiaryEntry | undefined {
  if (!d) return undefined;
  const out: DiaryEntry = {};
  if (d.newProduct) out.newProduct = true;
  if (d.period) out.period = true;
  if (d.sun) out.sun = true;
  if (d.poorSleep) out.poorSleep = true;
  if (d.note?.trim()) out.note = d.note.trim().slice(0, 200);
  return Object.keys(out).length ? out : undefined;
}

/** The trial as the assistant sees it. */
export function buildTrialContext(trial: Trial, scans: readonly Scan[], verdict: Verdict, now: Date = new Date()): TrialContext {
  const sorted = [...scans].sort((a, b) => a.day - b.day || Date.parse(a.takenAt) - Date.parse(b.takenAt));
  const decided = trial.status === 'kept' || trial.status === 'stopped';
  const lastDay = sorted.length ? sorted[sorted.length - 1].day : 0;
  const today = decided ? lastDay : Math.max(0, dayOf(trial, now));
  const projection = trial.projection
    ? Object.fromEntries(
        Object.entries(trial.projection.scores)
          .filter(([, s]) => s && Number.isFinite(s.ui))
          .map(([c, s]) => [c, s!.ui]),
      )
    : undefined;

  return {
    product: { name: trial.product.name, actives: [...trial.product.actives] },
    status: trial.status,
    today,
    targets: [...trial.targets],
    watch: [...trial.watch],
    plan: { ...trial.plan, checkinDays: [...trial.plan.checkinDays] },
    projection,
    scans: sorted.map((s) => {
      const out: ContextScan = { day: s.day, kind: s.kind, scores: scoresOf(s) };
      const blemishes = s.maskStats?.acne?.blemishCount;
      const red = s.maskStats?.redness?.areaPct;
      if (typeof blemishes === 'number') out.blemishes = blemishes;
      if (typeof red === 'number') out.redAreaPct = red;
      const diary = cleanDiary(s.diary);
      if (diary) out.diary = diary;
      return out;
    }),
    verdict: {
      kind: verdict.kind,
      headline: verdict.headline,
      summary: verdict.summary,
      reasons: verdict.reasons.map((r) => r.text),
      confidence: verdict.confidence,
      next: verdict.next.label,
    },
  };
}

/** Three ready questions for the verdict the person is looking at. */
export const SUGGESTED_QUESTIONS: Record<VerdictKind, [string, string, string]> = {
  purging: ['Why is my acne worse?', 'When will I see results?', 'Is it safe to keep going?'],
  working: ['What changed the most?', 'Should I keep this product?', 'How sure is this verdict?'],
  not_enough: ['Did anything change at all?', 'Should I stop this product?', 'Was the trial long enough?'],
  on_track: ['Am I on track?', 'When will I see results?', 'What should I watch for?'],
  too_early: ['When will I see results?', 'Is anything changing yet?', 'What should I watch for?'],
  reacting: ['Why is my skin reacting?', 'Is it safe to keep going?', 'How do I use it more gently?'],
};

/** The one failure line the panel shows; details stay in the server log. */
export const ANSWER_FAILED = "Couldn't get an answer right now";
