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

const STRIP_MAX = 5;

function closestTo(frames: AgingFrame[], age: number): number {
  let best = 0;
  frames.forEach((f, i) => {
    if (Math.abs(f.age - age) < Math.abs(frames[best].age - age)) best = i;
  });
  return best;
}

/**
 * Frames for the strip. YouCam returns about 16 ages; the strip keeps up to five, starting at the
 * person's own age and stepping about a decade each (30, 40, 50, 60).
 */
function stripIndices(frames: AgingFrame[], startIndex: number): number[] {
  if (frames.length <= STRIP_MAX + 1) return frames.map((_, i) => i);
  const start = frames[startIndex].age;
  const last = frames[frames.length - 1].age;
  const step = (last - start) / (STRIP_MAX - 1) > 12 ? 15 : 10;
  const out: number[] = [];
  for (let a = start; out.length < STRIP_MAX && a <= last + step / 2; a += step) {
    const i = closestTo(frames, a);
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

/** One face across the years: a large print of the chosen age, a strip of decades, and a slider over every age YouCam made. */
export function AgingViewer({ frames, age, sample }: AgingViewerProps) {
  const start = useMemo(() => closestTo(frames, age), [frames, age]);
  const [index, setIndex] = useState(start);
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const current = frames[Math.min(index, frames.length - 1)];
  const strip = useMemo(() => stripIndices(frames, start), [frames, start]);

  useEffect(() => {
    setIndex(start);
  }, [start]);

  const last = Math.max(frames.length - 1, 1);
  const pos = (i: number) => (frames.length > 1 ? (i / last) * 100 : 50);
  const dense = frames.length > 8;

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setIndex(Math.round(x * last));
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
              key={`${f.age}-${i}`}
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
          {strip.map((i) => {
            const f = frames[i];
            return (
              <li key={`${f.age}-${i}`}>
                <button type="button" className={clsx(styles.thumb, i === index && styles.thumbOn)} aria-pressed={i === index} onClick={() => setIndex(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" draggable={false} />
                  <span className="num">{f.age}</span>
                  <span className="visually-hidden"> years</span>
                </button>
              </li>
            );
          })}
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
          <span className={styles.fill} style={{ width: `${pos(index)}%` }} aria-hidden />
          {!dense
            ? frames.map((f, i) => <span key={`${f.age}-${i}`} className={clsx(styles.stop, i <= index && styles.stopOn)} style={{ left: `${pos(i)}%` }} aria-hidden />)
            : null}
          <div
            ref={handleRef}
            role="slider"
            tabIndex={0}
            aria-label="Age"
            aria-valuemin={frames[0].age}
            aria-valuemax={frames[frames.length - 1].age}
            aria-valuenow={current.age}
            aria-valuetext={`Age ${current.age}`}
            className={styles.handle}
            style={{ left: `${pos(index)}%` }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className={clsx(styles.trackEnds, 'num')} aria-hidden>
          <span>{frames[0].age}</span>
          <span>{frames[frames.length - 1].age}</span>
        </div>
      </div>
    </div>
  );
}
