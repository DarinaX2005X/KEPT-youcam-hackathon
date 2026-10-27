import type { Concern, Scan, Trial } from './types';

/**
 * Share of the projected change expected by `day`: 0 until half of the onset day,
 * 1 from the full effect day, a smooth S-curve (smoothstep) in between.
 */
export function progressAt(plan: Pick<Trial['plan'], 'onsetDay' | 'fullEffectDay'>, day: number): number {
  const start = plan.onsetDay * 0.5;
  const end = plan.fullEffectDay;
  if (day <= start) return 0;
  if (day >= end || end <= start) return 1;
  const t = (day - start) / (end - start);
  return t * t * (3 - 2 * t);
}

/**
 * expected(day) = base + (projection − base) × s(day).
 * Null when the trial has no projection or either side has no score for the concern.
 */
export function expectedScore(
  trial: Pick<Trial, 'plan' | 'projection'>,
  baseline: Pick<Scan, 'scores'>,
  concern: Concern,
  day: number,
): number | null {
  const base = baseline.scores[concern]?.ui;
  const proj = trial.projection?.scores[concern]?.ui;
  if (base === undefined || proj === undefined) return null;
  return base + (proj - base) * progressAt(trial.plan, day);
}
