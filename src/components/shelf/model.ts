import { activesFor, concernLabel, dayOf, type Concern, type Scan, type Trial, type VerdictKind } from '@/lib/domain';
import { deltaTone, formatDelta } from '@/components/trial';

export type ShelfTab = 'testing' | 'kept' | 'stopped';

export const TABS: { value: ShelfTab; label: string }[] = [
  { value: 'testing', label: 'Testing' },
  { value: 'kept', label: 'Kept' },
  { value: 'stopped', label: 'Stopped' },
];

/** Paused trials stay with the ones in progress. */
export function tabOf(trial: Trial): ShelfTab {
  if (trial.status === 'kept') return 'kept';
  if (trial.status === 'stopped') return 'stopped';
  return 'testing';
}

export function isShelfTab(value: string | null): value is ShelfTab {
  return value === 'testing' || value === 'kept' || value === 'stopped';
}

/** A sunscreen-only product: kept for prevention, without check-ins. */
export function isPrevention(trial: Trial): boolean {
  const actives = activesFor(trial.product.actives);
  return actives.length > 0 && actives.every((a) => a.prevention);
}

export function activeNames(trial: Trial): string {
  const actives = activesFor(trial.product.actives);
  return actives.length ? actives.map((a) => a.name).join(', ') : trial.product.actives.join(', ');
}

export interface Progress {
  /** Day the bar is filled to. */
  day: number;
  /** Length of the trial in days. */
  total: number;
  /** Days with a photo. */
  done: number[];
  /** Planned check-in days still to come. */
  planned: number[];
  purge?: { fromDay: number; toDay: number };
}

function lastDay(scans: readonly Scan[]): number | undefined {
  return scans.length ? Math.max(...scans.map((s) => s.day)) : undefined;
}

export function progressOf(trial: Trial, scans: readonly Scan[], now: Date): Progress {
  const plan = trial.plan;
  const done = [...new Set(scans.map((s) => s.day))].sort((a, b) => a - b);
  const decided = trial.status === 'kept' || trial.status === 'stopped';
  const total = Math.max(plan.fullEffectDay, ...plan.checkinDays, 1);
  const day = decided
    ? (lastDay(scans) ?? (trial.decidedAt ? dayOf(trial, trial.decidedAt) : 0))
    : Math.max(0, dayOf(trial, now));
  const last = lastDay(scans) ?? -1;
  const planned = decided ? [] : plan.checkinDays.filter((d) => d > last);
  return { day, total: Math.max(total, day), done, planned, purge: decided ? undefined : plan.purge };
}

export interface MainChange {
  concern: Concern;
  delta: number;
  days: number;
  tone: ReturnType<typeof deltaTone>;
  text: string;
}

/**
 * The change a decided trial is remembered by: the target that moved most between day 0 and the
 * last photo. A stopped trial also looks at the areas it watched, since a reaction is why it stopped.
 * When the product did not do enough, its main goal is what matters, even if it barely moved.
 */
export function mainChange(trial: Trial, scans: readonly Scan[], kind?: VerdictKind): MainChange | undefined {
  const sorted = [...scans].sort((a, b) => a.day - b.day);
  const base = sorted.find((s) => s.kind === 'baseline') ?? sorted[0];
  const latest = sorted[sorted.length - 1];
  if (!base || !latest || latest === base) return undefined;
  const pool =
    kind === 'not_enough' && trial.targets.length
      ? trial.targets.slice(0, 1)
      : trial.status === 'stopped'
        ? [...trial.targets, ...trial.watch]
        : trial.targets;
  let best: { concern: Concern; delta: number } | undefined;
  for (const c of pool) {
    const a = base.scores[c]?.ui;
    const b = latest.scores[c]?.ui;
    if (a === undefined || b === undefined) continue;
    const delta = b - a;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { concern: c, delta };
  }
  if (!best) return undefined;
  const days = latest.day;
  return {
    ...best,
    days,
    tone: deltaTone(best.delta),
    text: `${concernLabel(best.concern)} ${formatDelta(best.delta)} in ${days} ${days === 1 ? 'day' : 'days'}`,
  };
}

/** The newest scan, the one whose photo stands for the trial on the shelf. */
export function latestScan(scans: readonly Scan[]): Scan | undefined {
  let pick: Scan | undefined;
  for (const s of scans) if (!pick || s.day > pick.day || (s.day === pick.day && Date.parse(s.takenAt) > Date.parse(pick.takenAt))) pick = s;
  return pick;
}
