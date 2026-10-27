'use client';

import clsx from 'clsx';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { CircleAlert, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import styles from './Chip.module.css';

export type Tone = 'better' | 'worse' | 'flat' | 'reacting';

export const TONE_WORD: Record<Tone, string> = {
  better: 'Better',
  worse: 'Worse',
  flat: 'No change',
  reacting: 'Reacting',
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  better: TrendingUp,
  worse: TrendingDown,
  flat: Minus,
  reacting: CircleAlert,
};

export interface ChipProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  selected?: boolean;
  tone?: Tone;
  count?: number;
  children: ReactNode;
}

/** Toggle chip. The tone adds a coloured badge with its own glyph and a spoken word, so colour is never the only signal. */
export function Chip({ selected = false, tone, count, children, className, type = 'button', ...rest }: ChipProps) {
  const ToneIcon = tone ? TONE_ICON[tone] : null;
  return (
    <button {...rest} type={type} aria-pressed={selected} className={clsx(styles.chip, selected && styles.selected, className)}>
      {tone && ToneIcon ? (
        <span className={clsx(styles.tone, styles[tone])} title={TONE_WORD[tone]}>
          <ToneIcon size={12} strokeWidth={2.25} aria-hidden />
        </span>
      ) : null}
      <span>{children}</span>
      {tone ? <span className="visually-hidden">, {TONE_WORD[tone]}</span> : null}
      {typeof count === 'number' ? <span className={clsx(styles.count, 'num')}>{count}</span> : null}
    </button>
  );
}
