import clsx from 'clsx';
import type { TrialPlan } from '@/lib/domain';
import styles from './PlanRuler.module.css';

export interface PlanRulerProps {
  plan: TrialPlan;
  /** Draws the purge window; off when no active purges. */
  showPurge?: boolean;
  className?: string;
}

/** The trial as a line of days: check-ins as dots, the purge window as a band, first changes and full effect marked. */
export function PlanRuler({ plan, showPurge = true, className }: PlanRulerProps) {
  const end = Math.max(plan.fullEffectDay, ...plan.checkinDays, 1);
  const pct = (d: number) => `${(Math.min(Math.max(d, 0), end) / end) * 100}%`;
  const days = [0, ...plan.checkinDays.filter((d) => d > 0)];
  const purge = showPurge ? plan.purge : undefined;
  const label = `Day 0 to day ${end}. Check-ins on days ${plan.checkinDays.join(', ')}.${
    purge ? ` Breakouts may get worse between day ${purge.fromDay} and day ${purge.toDay}.` : ''
  } First changes usually show from day ${plan.onsetDay}.`;

  return (
    <div className={clsx(styles.ruler, className)} role="img" aria-label={label}>
      <div className={styles.notes} aria-hidden>
        <span className={styles.note} style={{ left: pct(plan.onsetDay) }}>
          First changes
        </span>
      </div>
      <div className={styles.track} aria-hidden>
        <span className={styles.effect} style={{ left: pct(plan.onsetDay) }} />
        {purge ? <span className={styles.purge} style={{ left: pct(purge.fromDay), width: `calc(${pct(purge.toDay)} - ${pct(purge.fromDay)})` }} /> : null}
        <span className={styles.onset} style={{ left: pct(plan.onsetDay) }} />
        {days.map((d) => (
          <span key={d} className={clsx(styles.dot, d === 0 && styles.start, d === end && styles.end)} style={{ left: pct(d) }} />
        ))}
      </div>
      <div className={clsx(styles.labels, 'num')} aria-hidden>
        {days.map((d, i) => (
          <span
            key={d}
            className={clsx(styles.day, i === 0 && styles.first, i === days.length - 1 && styles.last)}
            style={{ left: pct(d) }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
