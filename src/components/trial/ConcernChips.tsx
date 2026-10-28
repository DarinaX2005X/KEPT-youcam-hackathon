'use client';

import clsx from 'clsx';
import { useRef, type KeyboardEvent } from 'react';
import { concernLabel, type Concern, type Verdict } from '@/lib/domain';
import { Chip, TONE_WORD } from '@/components/ui';
import { concernTone, formatDelta, type Frame } from './model';
import styles from './ConcernChips.module.css';

export interface ConcernChipsProps {
  targets: Concern[];
  watch: Concern[];
  /** Day 0 frame; deltas are counted from it. */
  baseline: Frame;
  /** The frame on the right of the stage. */
  frame: Frame;
  value: Concern;
  onChange: (concern: Concern) => void;
  verdict?: Pick<Verdict, 'kind'>;
  className?: string;
}

/** One chip per tracked area with its change from day 0 (its day 0 score while there is nothing to compare). The selected chip puts that area's map on the photo. ←/→ move the selection. */
export function ConcernChips({ targets, watch, baseline, frame, value, onChange, verdict, className }: ConcernChipsProps) {
  const all = [...targets, ...watch];
  const refs = useRef<Partial<Record<Concern, HTMLButtonElement | null>>>({});
  const compare = frame.id !== baseline.id;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, c: Concern) {
    const i = all.indexOf(c);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % all.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(all[next]);
    refs.current[all[next]]?.focus();
  }

  // Day 0 itself or the simulated target on the right: nothing has been measured against day 0 yet,
  // so the chips show the day 0 score without a tone and the target stays a neutral hint.
  const projection = frame.kind === 'target';

  function chip(c: Concern) {
    const base = baseline.scores[c]?.ui;
    const now = frame.scores[c]?.ui;
    const delta = compare && !projection && base !== undefined && now !== undefined ? now - base : undefined;
    const tone = delta !== undefined ? concernTone(delta, c, verdict) : undefined;
    const selected = c === value;
    return (
      <Chip
        key={c}
        ref={(el) => {
          refs.current[c] = el;
        }}
        tone={tone}
        selected={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onChange(c)}
        onKeyDown={(e) => onKeyDown(e, c)}
        className={styles.chip}
      >
        {concernLabel(c)}
        {delta !== undefined && tone ? (
          <span className={clsx(styles.delta, 'num', !selected && styles[tone])}>{formatDelta(delta)}</span>
        ) : base !== undefined ? (
          <span className={clsx(styles.score, 'num')}>
            {base}
            <span className="visually-hidden"> on day 0</span>
          </span>
        ) : null}
        {tone === 'reacting' ? (
          <span className={clsx(styles.word, !selected && styles.reacting)} aria-hidden>
            {TONE_WORD.reacting}
          </span>
        ) : null}
      </Chip>
    );
  }

  const selectedBase = baseline.scores[value]?.ui;
  const selectedTarget = projection ? frame.scores[value]?.ui : undefined;
  const hint =
    projection && selectedBase !== undefined && selectedTarget !== undefined
      ? `${concernLabel(value)} target ${formatDelta(selectedTarget - selectedBase)} by day ${frame.day}, simulated by YouCam`
      : null;

  return (
    <div className={clsx(styles.root, className)} role="group" aria-label="Skin area shown on the photo">
      {targets.length ? (
        <div className={styles.group}>
          <span className={styles.label}>Goals</span>
          <div className={styles.row}>{targets.map(chip)}</div>
        </div>
      ) : null}
      {watch.length ? (
        <div className={styles.group}>
          <span className={styles.label}>Watching</span>
          <div className={styles.row}>{watch.map(chip)}</div>
        </div>
      ) : null}
      {hint ? (
        <p className={clsx(styles.hint, 'num')} aria-live="polite">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
