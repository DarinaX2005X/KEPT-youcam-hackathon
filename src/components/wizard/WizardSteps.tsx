'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import styles from './WizardSteps.module.css';

export interface WizardStep<T extends string> {
  id: T;
  label: string;
}

export interface WizardStepsProps<T extends string> {
  steps: WizardStep<T>[];
  current: T;
  /** Steps the person can go back to. */
  canOpen: (id: T) => boolean;
  onOpen: (id: T) => void;
  className?: string;
}

/** The wizard's own steps. Finished steps get a check and open again on click while their input can still change. */
export function WizardSteps<T extends string>({ steps, current, canOpen, onOpen, className }: WizardStepsProps<T>) {
  const index = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Trial setup" className={clsx(styles.root, className)}>
      <ol className={styles.list} style={{ ['--count' as string]: steps.length }}>
        {steps.map((step, i) => {
          const state = i < index ? 'done' : i === index ? 'current' : 'todo';
          const open = state === 'done' && canOpen(step.id);
          const body = (
            <>
              <span className={styles.marker} aria-hidden>
                {state === 'done' ? <Check size={13} strokeWidth={2.75} /> : <span className="num">{i + 1}</span>}
              </span>
              <span className={styles.label}>{step.label}</span>
            </>
          );
          return (
            <li key={step.id} className={clsx(styles.step, styles[state])} aria-current={state === 'current' ? 'step' : undefined}>
              {open ? (
                <button type="button" className={styles.hit} onClick={() => onOpen(step.id)}>
                  {body}
                  <span className="visually-hidden">, done. Change</span>
                </button>
              ) : (
                <span className={styles.hit}>
                  {body}
                  {state === 'done' ? <span className="visually-hidden">, done</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className={styles.mobileCount} aria-hidden>
        <span className="num">
          {index + 1} of {steps.length}
        </span>
      </p>
    </nav>
  );
}
