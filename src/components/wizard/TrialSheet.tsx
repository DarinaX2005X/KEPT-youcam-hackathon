'use client';

import clsx from 'clsx';
import { activesFor } from '@/lib/domain';
import { EmptyPrint } from './EmptyPrint';
import { PlanRuler } from './PlanRuler';
import { isPreventionOnly, planFor, weekLabel } from './state';
import styles from './TrialSheet.module.css';

export interface TrialSheetProps {
  name: string;
  activeIds: string[];
}

/** The trial taking shape while the product is entered: its two frames waiting, its length and check-ins. */
export function TrialSheet({ name, activeIds }: TrialSheetProps) {
  const actives = activesFor(activeIds);
  const prevention = isPreventionOnly(actives);
  const plan = planFor(actives);
  const hasPlan = actives.length > 0 && !prevention;
  const weeks = Math.round(plan.fullEffectDay / 7);

  return (
    <div className={styles.sheet}>
      <div className={styles.prints}>
        {prevention ? (
          <>
            <EmptyPrint label="Years from now" sublabel="Aging simulation" variant="target" tilt={2.5} className={styles.back} />
            <EmptyPrint label="Today" sublabel="Your photo" tilt={-2} className={styles.front} />
          </>
        ) : (
          <>
            {hasPlan ? (
              <EmptyPrint label={weekLabel(plan.fullEffectDay)} sublabel="Target" variant="target" tilt={2.5} className={styles.back} />
            ) : (
              <EmptyPrint label="Target" variant="target" tilt={2.5} className={styles.back} />
            )}
            <EmptyPrint label="Day 0" sublabel="Your photo" tilt={-2} className={styles.front} />
          </>
        )}
      </div>

      <div className={styles.body}>
        <p className={clsx(styles.name, !name.trim() && styles.placeholder)}>{name.trim() || 'Your product'}</p>
        {actives.length ? <p className={styles.actives}>{actives.map((a) => a.name).join(', ')}</p> : null}

        {hasPlan ? (
          <>
            <p className={clsx(styles.length, 'num')}>
              {weeks}-week trial, {plan.checkinDays.length} check-ins
            </p>
            <PlanRuler plan={plan} showPurge={false} className={styles.ruler} />
          </>
        ) : prevention ? (
          <p className={styles.length}>Sunscreen protects over years, so this one goes straight to your shelf</p>
        ) : (
          <p className={styles.hint}>Pick the actives and Kept sets the trial length and check-ins from how fast they work</p>
        )}
      </div>
    </div>
  );
}
