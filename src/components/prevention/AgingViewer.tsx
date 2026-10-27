'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './Prevention.module.css';

export interface AgingFrame {
  age: number;
  url: string;
}

export interface AgingViewerProps {
  frames: AgingFrame[];
  /** Age YouCam estimated for the photo; the viewer opens on the closest frame. */
  age: number;
  sample?: boolean;
}

function closest(frames: AgingFrame[], age: number): number {
  let best = 0;
  frames.forEach((f, i) => {
    if (Math.abs(f.age - age) < Math.abs(frames[best].age - age)) best = i;
  });
  return best;
}

/** One face across the years: a large print of the chosen age, the frames as a strip, and a slider by age. */
export function AgingViewer({ frames, age, sample }: AgingViewerProps) {
  const [index, setIndex] = useState(() => closest(frames, age));
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const current = frames[Math.min(index, frames.length - 1)];

  useEffect(() => {
    setIndex(closest(frames, age));
  }, [frames, age]);

  const minAge = frames[0]?.age ?? 0;
  const maxAge = frames[frames.length - 1]?.age ?? 0;
  const span = Math.max(maxAge - minAge, 1);
  const positions = useMemo(() => frames.map((f) => ((f.age - minAge) / span) * 100), [frames, minAge, span]);

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    positions.forEach((p, i) => {
      if (Math.abs(p - x) < Math.abs(positions[best] - x)) best = i;
    });
    setIndex(best);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(index + 1, frames.length - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(index - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = frames.length - 1;
    if (next !== null) {
      e.preventDefault();
      setIndex(next);
    }
  }

  if (!current) return null;

  return (
    <div className={styles.viewer}>
      <figure className={styles.bigPrint}>
        <div className={styles.bigPhoto}>
          {frames.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.age}
              src={f.url}
              alt={i === index ? `Your face simulated at age ${f.age}` : ''}
              aria-hidden={i !== index || undefined}
              className={clsx(styles.ageImg, i === index && styles.shown)}
              draggable={false}
            />
          ))}
          <span className={styles.simTag}>Simulated with YouCam</span>
        </div>
        <figcaption className={styles.bigCaption}>
          <span className={clsx(styles.ageLabel, 'num')} aria-live="polite">
            Age {current.age}
          </span>
          {sample ? <span className={styles.credit}>Face generated with YouCam AI</span> : null}
        </figcaption>
      </figure>

      <div className={styles.controls}>
        <ul className={styles.strip} aria-label="Ages">
          {frames.map((f, i) => (
            <li key={f.age}>
              <button type="button" className={clsx(styles.thumb, i === index && styles.thumbOn)} aria-pressed={i === index} onClick={() => setIndex(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" draggable={false} />
                <span className="num">{f.age}</span>
                <span className="visually-hidden"> years</span>
              </button>
            </li>
          ))}
        </ul>

        <div
          ref={trackRef}
          className={styles.track}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            handleRef.current?.focus({ preventScroll: true });
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <span className={styles.rail} aria-hidden />
          <span className={styles.fill} style={{ width: `${positions[index]}%` }} aria-hidden />
          {positions.map((p, i) => (
            <span key={frames[i].age} className={clsx(styles.stop, i <= index && styles.stopOn)} style={{ left: `${p}%` }} aria-hidden />
          ))}
          <div
            ref={handleRef}
            role="slider"
            tabIndex={0}
            aria-label="Age"
            aria-valuemin={minAge}
            aria-valuemax={maxAge}
            aria-valuenow={current.age}
            aria-valuetext={`Age ${current.age}`}
            className={styles.handle}
            style={{ left: `${positions[index]}%` }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
