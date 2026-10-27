'use client';

import clsx from 'clsx';
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './CompareSlider.module.css';

export interface CompareSliderProps {
  /** Shown on the left of the divider, e.g. Day 0. */
  left: ReactNode;
  /** Shown on the right of the divider; also sets the box size. */
  right: ReactNode;
  labels: [string, string];
  /** Divider position 0..100. Omit to let the slider keep its own state. */
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Accessible name of the handle. */
  'aria-label'?: string;
  className?: string;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Before and after on one frame. The divider follows the pointer directly; arrows move it by 5 %, Home and End jump to the edges. */
export function CompareSlider({ left, right, labels, value, defaultValue = 50, onChange, className, ...aria }: CompareSliderProps) {
  const [inner, setInner] = useState(defaultValue);
  const pos = clamp(value ?? inner);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  const set = useCallback(
    (v: number) => {
      const next = Math.round(clamp(v) * 10) / 10;
      if (value === undefined) setInner(next);
      onChange?.(next);
    },
    [onChange, value],
  );

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    set(((e.clientX - rect.left) / rect.width) * 100);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    dragging.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    handleRef.current?.focus({ preventScroll: true });
    fromPointer(e);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current) fromPointer(e);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    setActive(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 5;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pos - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pos + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    else if (e.key === 'PageDown') next = pos - 20;
    else if (e.key === 'PageUp') next = pos + 20;
    if (next !== null) {
      e.preventDefault();
      set(next);
    }
  }

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, active && styles.active, className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ ['--pos' as string]: `${pos}%` }}
    >
      <div className={styles.right}>{right}</div>
      <div className={styles.left} aria-hidden={pos === 0 || undefined}>
        {left}
      </div>

      <span className={clsx(styles.corner, styles.cornerLeft)} style={{ opacity: pos < 12 ? 0 : 1 }}>
        {labels[0]}
      </span>
      <span className={clsx(styles.corner, styles.cornerRight)} style={{ opacity: pos > 88 ? 0 : 1 }}>
        {labels[1]}
      </span>

      <div className={styles.divider} aria-hidden />
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={aria['aria-label'] ?? `Compare ${labels[0]} and ${labels[1]}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% ${labels[0]}`}
        aria-orientation="horizontal"
        className={styles.handle}
        onKeyDown={onKeyDown}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        <ChevronRight size={16} strokeWidth={2} aria-hidden />
      </div>
    </div>
  );
}
