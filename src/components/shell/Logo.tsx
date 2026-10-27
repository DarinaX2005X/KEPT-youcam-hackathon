'use client';

import clsx from 'clsx';
import { useId } from 'react';
import styles from './Logo.module.css';

/** The Kept mark: day-one outline, today's glass oval, sheen where they overlap. */
export function Mark({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  const raw = useId();
  const id = `k${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-2 1 64 64"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}s`} x1="10" y1="10" x2="44" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F4CDB8" />
          <stop offset="0.55" stopColor="#C9E6D6" />
          <stop offset="1" stopColor="#D6D9F0" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="22" y1="6" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2E755B" />
          <stop offset="1" stopColor="#163C30" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <rect x="20" y="6" width="34" height="48" rx="17" />
        </clipPath>
      </defs>
      <rect x="6" y="12" width="34" height="48" rx="17" stroke="#1F5A47" strokeOpacity="0.42" strokeWidth="3.5" />
      <rect x="20" y="6" width="34" height="48" rx="17" fill={`url(#${id}g)`} />
      <rect x="6" y="12" width="34" height="48" rx="17" fill={`url(#${id}s)`} clipPath={`url(#${id}c)`} />
    </svg>
  );
}

/** Mark plus the lower-case wordmark set in Onest 700. */
export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx(styles.logo, className)} style={{ ['--logo-size' as string]: `${size}px` }}>
      <Mark size={size} />
      <span className={styles.word}>kept</span>
    </span>
  );
}
