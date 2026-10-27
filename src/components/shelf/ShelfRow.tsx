'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import { Tag } from '@/components/ui';
import { VERDICT_LOOK } from '@/components/trial';
import { activeNames } from './model';
import { MiniPrint } from './MiniPrint';
import type { ShelfItem } from './useShelf';
import styles from './ShelfRow.module.css';

const pct = (day: number, total: number) => `${Math.min(100, Math.max(0, (day / total) * 100))}%`;

/** Centre distance in px below which two photo dots read as one blob; they merge into a capsule. */
const MERGE_PX = 12;

/** Groups sorted days whose dots would touch at this ruler width. */
function clusters(days: number[], total: number, width: number): number[][] {
  const out: number[][] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && width > 0 && ((d - last[last.length - 1]) / total) * width < MERGE_PX) last.push(d);
    else out.push([d]);
  }
  return out;
}

function Ruler({ item }: { item: ShelfItem }) {
  const { day, total, done, planned, purge } = item.progress;
  const decided = item.tab !== 'testing';
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const groups = clusters(done, total, width);
  const lastDone = done[done.length - 1];
  // A planned day that would sit on the last photo's dot is left out; the photo already marks that spot.
  const plannedShown = clusters(planned, total, width)
    .map((g) => g[0])
    .filter((d) => lastDone === undefined || width === 0 || ((d - lastDone) / total) * width >= MERGE_PX);
  const label = decided
    ? `${done.length} ${done.length === 1 ? 'photo' : 'photos'} over ${day} days`
    : `${done.length} ${done.length === 1 ? 'photo' : 'photos'} so far, ${planned.length} check-ins to go`;
  return (
    <span ref={ref} className={clsx(styles.ruler, decided && styles.rulerDecided)} role="img" aria-label={label}>
      <span className={styles.track} />
      {purge ? <span className={styles.purge} style={{ left: pct(purge.fromDay, total), width: pct(purge.toDay - purge.fromDay, total) }} /> : null}
      <span className={styles.fill} style={{ width: pct(day, total) }} />
      {plannedShown.map((d) => (
        <span key={`p${d}`} className={styles.planned} style={{ left: pct(d, total) }} />
      ))}
      {groups.map((g) => (
        <span
          key={`d${g[0]}`}
          className={styles.done}
          style={g.length > 1 ? { left: pct(g[0], total), width: `calc(${pct(g[g.length - 1] - g[0], total)} + 10px)` } : { left: pct(g[0], total) }}
        />
      ))}
    </span>
  );
}

function Verdict({ item }: { item: ShelfItem }) {
  if (item.prevention) {
    return (
      <span className={styles.verdict}>
        <span className={clsx(styles.vIcon, styles.better)}>
          <ShieldCheck size={16} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.vText}>Daily protection</span>
      </span>
    );
  }
  if (!item.verdict) {
    return (
      <span className={styles.verdict}>
        <span className={clsx(styles.vIcon, styles.flat)}>
          <Camera size={16} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.vText}>No photos yet</span>
      </span>
    );
  }
  const look = VERDICT_LOOK[item.verdict.kind];
  const Icon = look.icon;
  return (
    <span className={styles.verdict}>
      <span className={clsx(styles.vIcon, styles[look.tone])}>
        <Icon size={16} strokeWidth={2} aria-hidden />
      </span>
      <span className={styles.vText}>{item.verdict.headline}</span>
    </span>
  );
}

function ProgressLine({ item }: { item: ShelfItem }) {
  if (item.prevention) return <span className={styles.progressText}>Every morning, no check-ins needed</span>;
  const { day, total } = item.progress;
  if (item.tab !== 'testing') {
    return item.change ? (
      <span className={clsx(styles.progressText, styles.change)}>
        <span className={clsx(styles.changeNum, styles[`c_${item.change.tone}`], 'num')}>{item.change.text}</span>
      </span>
    ) : (
      <span className={clsx(styles.progressText, 'num')}>Decided on day {day}</span>
    );
  }
  return (
    <span className={clsx(styles.progressText, 'num')}>
      Day {day} of {total}
    </span>
  );
}

export interface ShelfRowProps {
  item: ShelfItem;
  index: number;
}

export function ShelfRow({ item, index }: ShelfRowProps) {
  const { trial } = item;
  const status = trial.status;
  return (
    <Link href={`/trial/${trial.id}`} className={styles.row}>
      <MiniPrint
        src={item.thumb}
        alt={item.thumbDay !== undefined ? `Your photo from day ${item.thumbDay}` : ''}
        tilt={index % 2 ? 1.5 : -1.5}
        className={styles.thumb}
      />
      <span className={styles.name}>
        <h2 className={styles.title}>{trial.product.name}</h2>
        <span className={styles.actives}>{activeNames(trial)}</span>
      </span>
      <span className={styles.progress}>
        <ProgressLine item={item} />
        {item.prevention ? null : <Ruler item={item} />}
      </span>
      <span className={styles.verdictCell}>
        <Verdict item={item} />
      </span>
      <span className={styles.tags}>
        <Tag status={status} />
        {trial.sample ? <Tag status="sample" /> : null}
      </span>
    </Link>
  );
}
