'use client';

import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import styles from './StepProgress.module.css';

export interface Step {
  id: string;
  label: string;
}

export interface StepProgressProps {
  steps: Step[];
  /** Id of the step in progress. Pass `null` before the first step starts. */
  current: string | null;
  /** `done` marks every step complete; `error` marks the current step failed. */
  status?: 'running' | 'done' | 'error';
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  'aria-label'?: string;
}

/** Real stages of an operation. Past steps get a check, the current one pulses, future ones wait. No invented percentages. */
export function StepProgress({ steps, current, status = 'running', orientation = 'vertical', className, ...aria }: StepProgressProps) {
  const currentIndex = status === 'done' ? steps.length : current === null ? -1 : steps.findIndex((s) => s.id === current);
  return (
    <ol className={clsx(styles.root, styles[orientation], className)} aria-label={aria['aria-label'] ?? 'Progress'}>
      {steps.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? (status === 'error' ? 'error' : 'current') : 'todo';
        return (
          <li key={step.id} className={clsx(styles.step, styles[state])} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.marker} aria-hidden>
              {state === 'done' ? <Check size={14} strokeWidth={2.5} /> : null}
              {state === 'error' ? <X size={14} strokeWidth={2.5} /> : null}
              {state === 'current' ? <span className={styles.pulse} /> : null}
            </span>
            <span className={styles.label}>
              {step.label}
              <span className="visually-hidden">{state === 'done' ? ', done' : state === 'current' ? ', in progress' : state === 'error' ? ', failed' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
