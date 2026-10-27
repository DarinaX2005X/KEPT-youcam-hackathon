'use client';

import clsx from 'clsx';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { formatShortDate, sameLocalDay, type CheckinSlot } from '@/lib/domain';
import type { Frame } from './model';
import styles from './CheckinStrip.module.css';

export interface CheckinStripProps {
  /** Day 0, check-ins and the target, as built by `buildFrames`. */
  frames: Frame[];
  /** Planned check-ins not taken yet; drawn as empty frames with their date. */
  upcoming?: CheckinSlot[];
  /** How many planned check-ins to show before the target; the schedule lists the rest. */
  maxUpcoming?: number;
  now?: Date;
  value: string;
  onChange: (frameId: string) => void;
  className?: string;
}

function title(f: Frame): string {
  return f.kind === 'target' ? 'Target' : `Day ${f.day}`;
}

/** The trial as a row of small prints. Picking one puts it on the right of the stage. ←/→ move between taken frames. */
export function CheckinStrip({ frames, upcoming = [], maxUpcoming = 2, now, value, onChange, className }: CheckinStripProps) {
  const taken = frames.filter((f) => f.kind !== 'target');
  const target = frames.find((f) => f.kind === 'target');
  const order = target ? [...taken, target] : taken;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the selected print in view when the selection changes from elsewhere.
  useEffect(() => {
    const el = refs.current[value];
    const box = scroller.current;
    if (!el || !box) return;
    const e = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const pad = 16;
    if (e.right > b.right - pad) box.scrollTo({ left: box.scrollLeft + e.right - b.right + pad, behavior: 'smooth' });
    else if (e.left < b.left + pad) box.scrollTo({ left: box.scrollLeft + e.left - b.left - pad, behavior: 'smooth' });
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const i = order.findIndex((f) => f.id === id);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(order.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(order[next].id);
    refs.current[order[next].id]?.focus();
  }

  function print(f: Frame) {
    const selected = f.id === value;
    return (
      <li key={f.id} className={styles.item}>
        <button
          ref={(el) => {
            refs.current[f.id] = el;
          }}
          type="button"
          aria-pressed={selected}
          tabIndex={selected ? 0 : -1}
          aria-label={f.kind === 'target' ? 'Target, simulated by YouCam' : `Day ${f.day}, ${formatShortDate(f.date)}`}
          className={clsx(styles.print, selected && styles.selected, f.kind === 'target' && styles.target)}
          onClick={() => onChange(f.id)}
          onKeyDown={(e) => onKeyDown(e, f.id)}
        >
          <span className={styles.photo}>
            {f.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photo} alt="" loading="lazy" decoding="async" draggable={false} />
            ) : null}
          </span>
        </button>
        <span className={clsx(styles.label, selected && styles.labelSelected)} aria-hidden>
          {title(f)}
        </span>
      </li>
    );
  }

  return (
    <div className={clsx(styles.root, className)}>
      <div ref={scroller} className={styles.scroller}>
        <ul className={styles.list} aria-label="Trial photos">
          {taken.map(print)}
          {upcoming.slice(0, maxUpcoming).map((slot) => {
            const today = now ? sameLocalDay(slot.date, now) : false;
            return (
            <li key={`slot-${slot.day}`} className={styles.item}>
              <span className={clsx(styles.print, styles.future, today && styles.futureToday)}>
                <span className={clsx(styles.futureDate, 'num')}>{today ? 'Today' : formatShortDate(slot.date)}</span>
              </span>
              <span className={styles.label}>
                Day {slot.day}
                <span className="visually-hidden">, planned for {formatShortDate(slot.date)}</span>
              </span>
            </li>
            );
          })}
          {target ? print(target) : null}
        </ul>
      </div>
    </div>
  );
}
