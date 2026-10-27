import clsx from 'clsx';
import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Any CSS radius or a token name: panel, card, control, chip, tag, photo, round. */
  radius?: 'panel' | 'card' | 'control' | 'chip' | 'tag' | 'photo' | 'round' | (string & {});
  /** Lines of text placeholder; the last line is shorter. */
  lines?: number;
  /** Aspect ratio for photo placeholders, e.g. "3 / 4". */
  aspect?: string;
  className?: string;
  style?: CSSProperties;
}

const TOKENS = new Set(['panel', 'card', 'control', 'chip', 'tag', 'photo']);

function radiusValue(r: SkeletonProps['radius']) {
  if (!r) return 'var(--r-chip)';
  if (r === 'round') return '999px';
  return TOKENS.has(r) ? `var(--r-${r})` : r;
}

/** Placeholder shaped like the content it stands in for, with a soft sheen moving across Sunk. */
export function Skeleton({ width, height, radius, lines, aspect, className, style }: SkeletonProps) {
  if (lines && lines > 0) {
    return (
      <span className={clsx(styles.lines, className)} style={{ width, ...style }} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={styles.bone} style={{ height: height ?? '0.9em', width: i === lines - 1 && lines > 1 ? '62%' : '100%', borderRadius: radiusValue(radius ?? 'tag') }} />
        ))}
      </span>
    );
  }
  return <span className={clsx(styles.bone, className)} style={{ width, height, aspectRatio: aspect, borderRadius: radiusValue(radius), ...style }} aria-hidden />;
}
