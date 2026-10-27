'use client';

import clsx from 'clsx';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  size?: 'md' | 'lg';
  block?: boolean;
  className?: string;
}

/** 2 to 4 mutually exclusive options. The thumb travels to the selected option. Arrow keys move the selection. */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', block = false, className, ...aria }: SegmentedProps<T>) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, dir: 1 | -1) {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      if (!options[i].disabled) {
        onChange(options[i].value);
        refs.current[i]?.focus();
        return;
      }
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  }

  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className={clsx(styles.root, styles[size], block && styles.block, className)}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            className={clsx(styles.option, selected && styles.selected)}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {selected ? (
              <motion.span layoutId={layoutId} className={styles.thumb} transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }} />
            ) : null}
            <span className={styles.label}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
