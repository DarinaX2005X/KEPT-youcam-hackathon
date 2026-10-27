import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagStatus = 'testing' | 'kept' | 'stopped' | 'paused' | 'sample';
export type TagTone = 'brand' | 'better' | 'worse' | 'reacting' | 'flat' | 'neutral';

const STATUS: Record<TagStatus, { label: string; tone: TagTone }> = {
  testing: { label: 'Testing', tone: 'brand' },
  kept: { label: 'Kept', tone: 'better' },
  stopped: { label: 'Stopped', tone: 'worse' },
  paused: { label: 'Paused', tone: 'flat' },
  sample: { label: 'Sample', tone: 'neutral' },
};

export interface TagProps {
  /** Trial status; sets the label and colour. */
  status?: TagStatus;
  /** Free colour when no status applies. */
  tone?: TagTone;
  /** Overrides the status label. */
  children?: ReactNode;
  className?: string;
}

export function Tag({ status, tone, children, className }: TagProps) {
  const preset = status ? STATUS[status] : undefined;
  const t = tone ?? preset?.tone ?? 'neutral';
  return <span className={clsx(styles.tag, styles[t], className)}>{children ?? preset?.label}</span>;
}
