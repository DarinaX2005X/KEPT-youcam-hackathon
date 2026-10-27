'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { Camera, ShieldCheck } from 'lucide-react';
import { Tag } from '@/components/ui';
import { VERDICT_LOOK } from '@/components/trial';
import { activeNames } from './model';
import { MiniPrint } from './MiniPrint';
import type { ShelfItem } from './useShelf';
import styles from './ShelfRow.module.css';

const pct = (day: number, total: number) => `${Math.min(100, Math.max(0, (day / total) * 100))}%`;

function Ruler({ item }: { item: ShelfItem }) {
  const { day, total, done, planned, purge } = item.progress;
  const decided = item.tab !== 'testing';
  const label = decided
    ? `${done.length} ${done.length === 1 ? 'photo' : 'photos'} over ${day} days`
    : `${done.length} ${done.length === 1 ? 'photo' : 'photos'} so far, ${planned.length} check-ins to go`;
  return (
    <span className={clsx(styles.ruler, decided && styles.rulerDecided)} role="img" aria-label={label}>
      <span className={styles.track} />
      {purge ? <span className={styles.purge} style={{ left: pct(purge.fromDay, total), width: pct(purge.toDay - purge.fromDay, total) }} /> : null}
      <span className={styles.fill} style={{ width: pct(day, total) }} />
      {planned.map((d) => (
        <span key={`p${d}`} className={styles.planned} style={{ left: pct(d, total) }} />
      ))}
      {done.map((d) => (
        <span key={`d${d}`} className={styles.done} style={{ left: pct(d, total) }} />
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
