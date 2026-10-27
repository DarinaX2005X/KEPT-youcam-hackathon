import type { Trial } from './types';

export const DAY_MS = 86_400_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toTime(date: string | Date): number {
  return typeof date === 'string' ? Date.parse(date) : date.getTime();
}

/** Whole days since the trial started: floor((date − startedAt) / 1 day). */
export function dayOf(trial: Pick<Trial, 'startedAt'>, date: string | Date): number {
  return Math.floor((toTime(date) - toTime(trial.startedAt)) / DAY_MS);
}

/** ISO string `days` whole days after `date`. */
export function addDays(date: string | Date, days: number): string {
  return new Date(toTime(date) + days * DAY_MS).toISOString();
}

/** "Nov 12" in the viewer's local time zone. */
export function formatShortDate(date: string | Date): string {
  const d = new Date(toTime(date));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Same local calendar day. */
export function sameLocalDay(a: string | Date, b: string | Date): boolean {
  const x = new Date(toTime(a));
  const y = new Date(toTime(b));
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "2 weeks", "1 week", "10 days". */
export function spanText(days: number): string {
  if (days >= 7 && days % 7 === 0) {
    const w = days / 7;
    return w === 1 ? '1 week' : `${w} weeks`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}
