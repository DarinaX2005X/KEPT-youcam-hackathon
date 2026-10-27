import { activesFor, addDays, buildPlan, pickConcerns } from '@/lib/domain';
import type { Concern, ConcernScore, DiaryEntry, MaskStats, Scan, Trial } from '@/lib/domain';

export const START = '2026-09-01T12:00:00.000Z';

let seq = 0;

export function makeTrial(
  activeIds: string[],
  opts: Partial<Trial> & { targets?: Concern[]; watch?: Concern[]; name?: string } = {},
): Trial {
  const actives = activesFor(activeIds);
  const picked = pickConcerns(actives, opts.targets);
  return {
    id: opts.id ?? `trial-${++seq}`,
    product: { name: opts.name ?? `${activeIds.join(' + ')} product`, actives: activeIds },
    targets: opts.targets ?? picked.targets,
    watch: opts.watch ?? picked.watch,
    startedAt: opts.startedAt ?? START,
    plan: opts.plan ?? buildPlan(actives),
    status: opts.status ?? 'testing',
    ...(opts.projection ? { projection: opts.projection } : {}),
    ...(opts.decidedAt ? { decidedAt: opts.decidedAt } : {}),
  };
}

export function scores(values: Partial<Record<Concern, number>>): Partial<Record<Concern, ConcernScore>> {
  const out: Partial<Record<Concern, ConcernScore>> = {};
  for (const [c, ui] of Object.entries(values) as [Concern, number][]) out[c] = { ui, raw: ui / 2 };
  return out;
}

export function makeScan(
  trial: Trial,
  day: number,
  values: Partial<Record<Concern, number>>,
  extra: { luminance?: number; alignment?: number; diary?: DiaryEntry; maskStats?: Partial<Record<Concern, MaskStats>> } = {},
): Scan {
  return {
    id: `${trial.id}-scan-${day}`,
    trialId: trial.id,
    kind: day === 0 ? 'baseline' : 'checkin',
    day,
    takenAt: addDays(trial.startedAt, day),
    photo: { url: `/demo/${trial.id}/${day}/photo.jpg` },
    masks: {},
    scores: scores(values),
    overall: 70,
    skinAge: 30,
    maskStats: extra.maskStats ?? {},
    capture: {
      source: 'sample',
      luminance: extra.luminance ?? 140,
      ...(extra.alignment !== undefined ? { alignment: extra.alignment } : {}),
    },
    ...(extra.diary ? { diary: extra.diary } : {}),
  };
}

/** `now` as a Date `day` days after the trial started, plus a few hours. */
export function at(trial: Trial, day: number): Date {
  return new Date(Date.parse(addDays(trial.startedAt, day)) + 3 * 3600_000);
}
