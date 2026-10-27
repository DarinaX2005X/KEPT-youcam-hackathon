'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { QualityCheck } from '@/lib/capture';
import styles from './ChecksList.module.css';

export interface ChecksListProps {
  checks: QualityCheck[];
  className?: string;
  /** Replaces the rows, e.g. when the face guide could not load. */
  children?: React.ReactNode;
}

/** The photo checks as rows: name on the left, «Good» in Better with a tick or the advice in Ink with a Reacting dot. */
export function ChecksList({ checks, className, children }: ChecksListProps) {
  return (
    <div className={clsx(styles.plate, className)}>
      {children ?? (
        <ul className={styles.list} aria-live="polite" aria-label="Photo checks">
          {checks.map((c) => (
            <li key={c.id} className={clsx(styles.row, styles[c.state])}>
              <span className={styles.label}>{c.label}</span>
              <span className={styles.status}>
                {c.state === 'good' ? <Check size={16} strokeWidth={2.5} aria-hidden className={styles.tick} /> : <span className={styles.dot} aria-hidden />}
                <span className={styles.text}>{c.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
