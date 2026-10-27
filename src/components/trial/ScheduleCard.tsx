'use client';

import clsx from 'clsx';
import { CalendarPlus, Check } from 'lucide-react';
import { formatShortDate, nextCheckin, sameLocalDay, type Scan, type Trial } from '@/lib/domain';
import { Button } from '@/components/ui';
import { sortScans, upcomingSlots } from './model';
import styles from './ScheduleCard.module.css';

export interface ScheduleCardProps {
  trial: Trial;
  scans: Scan[];
  now: Date;
  /** Defaults to saving an .ics with the remaining check-ins. */
  onAddToCalendar?: () => void;
  className?: string;
}

/** Photos taken so far and the check-ins still planned, with the next one marked. */
export function ScheduleCard({ trial, scans, now, onAddToCalendar, className }: ScheduleCardProps) {
  const taken = sortScans(scans);
  const upcoming = upcomingSlots(trial, scans);
  const next = nextCheckin(trial, scans, now);
  const decided = trial.status === 'kept' || trial.status === 'stopped';

  function nextWord(date: string): string {
    if (sameLocalDay(date, now)) return 'Today';
    if (Date.parse(date) < now.getTime()) return 'Due now';
    return 'Next';
  }

  return (
    <section className={clsx(styles.panel, className)} aria-label="Check-ins">
      <div className={styles.head}>
        <h3 className={styles.title}>Check-ins</h3>
        {!decided && upcoming.length ? (
          <Button variant="secondary" icon={CalendarPlus} onClick={onAddToCalendar}>
            Add to calendar
          </Button>
        ) : null}
      </div>

      <ol className={styles.list}>
        {taken.map((s) => (
          <li key={s.id} className={clsx(styles.row, styles.done)}>
            <span className={styles.check} aria-hidden>
              <Check size={14} strokeWidth={2.5} />
            </span>
            <span className={clsx(styles.day, 'num')}>Day {s.day}</span>
            <span className={clsx(styles.date, 'num')}>{formatShortDate(s.takenAt)}</span>
            <span className={styles.status}>{s.kind === 'baseline' ? 'Starting photo' : 'Photo taken'}</span>
          </li>
        ))}
        {upcoming.map((slot) => {
          const isNext = next?.day === slot.day;
          return (
            <li key={slot.day} className={clsx(styles.row, isNext && styles.next)}>
              <span className={clsx(styles.check, styles.open)} aria-hidden />
              <span className={clsx(styles.day, 'num')}>Day {slot.day}</span>
              <span className={clsx(styles.date, 'num')}>{formatShortDate(slot.date)}</span>
              <span className={styles.status}>{isNext ? nextWord(slot.date) : slot.day === trial.plan.fullEffectDay ? 'Final check-in' : ''}</span>
            </li>
          );
        })}
      </ol>

      {decided && trial.decidedAt ? (
        <p className={styles.note}>
          {trial.status === 'kept' ? 'Kept' : 'Stopped'} on {formatShortDate(trial.decidedAt)}. No more check-ins are planned.
        </p>
      ) : null}
    </section>
  );
}
