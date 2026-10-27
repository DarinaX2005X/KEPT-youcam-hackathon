import { toSimConcern } from './concerns';
import { addDays, dayOf } from './dates';
import type { Active, CheckinSlot, Concern, Scan, SimConcern, Trial, TrialPlan } from './types';

export const BASE_CHECKIN_DAYS = [7, 14, 21, 28, 42, 56] as const;
export const MAX_TARGETS = 3;
export const MAX_ZONES = 4;

/** Used when a product has no known active: a typical 8-week trial. */
const DEFAULT_ONSET = 28;
const DEFAULT_FULL = 56;

/**
 * onset = earliest onset, full = latest full effect, purge = one window covering every active's
 * purge window. Check-ins: 7, 14, 21, 28, 42, 56 up to `full`, plus `full` itself (e.g. 84).
 */
export function buildPlan(actives: readonly Active[]): TrialPlan {
  const list = actives.length ? actives : [];
  const onsetDay = list.length ? Math.min(...list.map((a) => a.onsetDay)) : DEFAULT_ONSET;
  const fullEffectDay = list.length ? Math.max(...list.map((a) => a.fullEffectDay)) : DEFAULT_FULL;
  const purges = list.flatMap((a) => (a.purge ? [a.purge] : []));
  const checkinDays: number[] = BASE_CHECKIN_DAYS.filter((d) => d <= fullEffectDay);
  if (!checkinDays.includes(fullEffectDay)) checkinDays.push(fullEffectDay);
  const plan: TrialPlan = { checkinDays, onsetDay, fullEffectDay };
  if (purges.length) {
    plan.purge = {
      fromDay: Math.min(...purges.map((p) => p.fromDay)),
      toDay: Math.max(...purges.map((p) => p.toDay)),
    };
  }
  return plan;
}

function pushUnique<T>(list: T[], item: T): void {
  if (!list.includes(item)) list.push(item);
}

/**
 * Targets: the user's choice when given, otherwise the actives' targets taken by priority
 * (each active's first target, then each active's second, ...), at most 3.
 * Watch: the actives' watch areas not already targeted, filling up to 4 areas in total.
 * Redness is always watched when it is not a target and any active irritates (medium or high),
 * even if that takes the total past 4.
 */
export function pickConcerns(
  actives: readonly Active[],
  chosenTargets?: readonly Concern[],
): { targets: Concern[]; watch: Concern[] } {
  const targets: Concern[] = [];
  if (chosenTargets && chosenTargets.length) {
    for (const c of chosenTargets) pushUnique(targets, c);
  } else {
    const depth = Math.max(0, ...actives.map((a) => a.targets.length));
    for (let i = 0; i < depth && targets.length < MAX_TARGETS; i++) {
      for (const a of actives) {
        const t = a.targets[i];
        if (t && targets.length < MAX_TARGETS) pushUnique(targets, t);
      }
    }
  }

  const needsRedness = !targets.includes('redness') && actives.some((a) => a.irritation !== 'low');
  const candidates: Concern[] = [];
  if (needsRedness) candidates.push('redness');
  for (const a of actives) for (const w of a.watch) if (!targets.includes(w)) pushUnique(candidates, w);

  const room = Math.max(MAX_ZONES - targets.length, needsRedness ? 1 : 0);
  return { targets, watch: candidates.slice(0, room) };
}

/** Skin Simulation intensities for the targets: the strongest value any active gives each one. */
export function simulationFor(
  actives: readonly Active[],
  targets: readonly Concern[],
): Partial<Record<SimConcern, number>> {
  const out: Partial<Record<SimConcern, number>> = {};
  for (const t of targets) {
    const sim = toSimConcern(t);
    if (!sim) continue;
    const value = Math.max(0, ...actives.map((a) => a.simulation[sim] ?? 0));
    if (value > 0) out[sim] = value;
  }
  return out;
}

/** Every planned check-in with its date. */
export function plannedCheckins(trial: Pick<Trial, 'startedAt' | 'plan'>): CheckinSlot[] {
  return trial.plan.checkinDays.map((day) => ({ day, date: addDays(trial.startedAt, day) }));
}

/**
 * The next check-in to take. Planned days after the last scan; if some of them are already due,
 * the latest due one (no point catching up on a missed day 14 on day 30), otherwise the first
 * upcoming. Null when the plan is done or the trial is decided.
 */
export function nextCheckin(
  trial: Pick<Trial, 'startedAt' | 'plan' | 'status'>,
  scans: readonly Pick<Scan, 'day'>[],
  now: Date,
): CheckinSlot | null {
  if (trial.status === 'kept' || trial.status === 'stopped') return null;
  const lastDay = scans.length ? Math.max(...scans.map((s) => s.day)) : -1;
  const nowDay = dayOf(trial, now);
  const open = trial.plan.checkinDays.filter((d) => d > lastDay);
  if (!open.length) return null;
  const due = open.filter((d) => d <= nowDay);
  const day = due.length ? due[due.length - 1] : open[0];
  return { day, date: addDays(trial.startedAt, day) };
}
