'use client';

import clsx from 'clsx';
import styles from './Shutter.module.css';

export interface ShutterProps {
  onPress: () => void;
  /** performance.now() when the automatic countdown began; the ring fills over `countdownMs`. */
  countdownStart: number | null;
  countdownMs: number;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  className?: string;
}

const R = 40;
const C = 2 * Math.PI * R;

/** 72 px shutter: Surface ring, Brand centre. A Better ring fills around it during the automatic countdown. */
export function Shutter({ onPress, countdownStart, countdownMs, disabled, busy, label = 'Take photo', className }: ShutterProps) {
  const counting = countdownStart !== null;
  return (
    <button
      type="button"
      className={clsx(styles.shutter, counting && styles.counting, busy && styles.busy, className)}
      onClick={onPress}
      disabled={disabled}
      aria-label={counting ? `${label}, taking it automatically` : label}
      aria-busy={busy || undefined}
    >
      <svg className={styles.ring} viewBox="0 0 88 88" aria-hidden>
        <circle cx="44" cy="44" r={R} className={styles.track} />
        {counting ? (
          <circle
            key={countdownStart}
            cx="44"
            cy="44"
            r={R}
            className={styles.progress}
            style={{ strokeDasharray: C, strokeDashoffset: C, animationDuration: `${countdownMs}ms` }}
          />
        ) : null}
      </svg>
      <span className={styles.core} aria-hidden />
    </button>
  );
}
