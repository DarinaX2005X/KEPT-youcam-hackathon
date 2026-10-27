'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeVerdict, type Scan, type Trial, type Verdict } from '@/lib/domain';
import { blobUrl, listScansByTrial, listTrials } from '@/lib/store';
import { isPrevention, latestScan, mainChange, progressOf, tabOf, type MainChange, type Progress, type ShelfTab } from './model';

export interface ShelfItem {
  trial: Trial;
  scans: Scan[];
  tab: ShelfTab;
  /** Null for sunscreen kept for prevention and for trials without a photo yet. */
  verdict: Verdict | null;
  prevention: boolean;
  progress: Progress;
  change?: MainChange;
  /** The user's latest photo of this trial. */
  thumb?: string;
  thumbDay?: number;
}

export type ShelfState =
  | { status: 'loading' }
  | { status: 'ready'; items: ShelfItem[]; scansByTrial: Record<string, Scan[]> }
  | { status: 'error'; error: Error };

async function toItem(trial: Trial, scans: Scan[], now: Date): Promise<ShelfItem> {
  const prevention = isPrevention(trial);
  const last = latestScan(scans);
  const thumb = last ? await blobUrl(last.photo).catch(() => undefined) : undefined;
  return {
    trial,
    scans,
    tab: tabOf(trial),
    verdict: prevention || !scans.length ? null : computeVerdict(trial, scans, now),
    prevention,
    progress: progressOf(trial, scans, now),
    change: trial.status === 'kept' || trial.status === 'stopped' ? mainChange(trial, scans) : undefined,
    thumb,
    thumbDay: last?.day,
  };
}

/** Every trial in this browser with what the shelf shows for it. Newest start first. */
export function useShelf(): ShelfState & { reload: () => Promise<void> } {
  const [state, setState] = useState<ShelfState>({ status: 'loading' });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [trials, scansByTrial] = await Promise.all([listTrials(), listScansByTrial()]);
      const now = new Date();
      const items = await Promise.all(trials.map((t) => toItem(t, scansByTrial[t.id] ?? [], now)));
      if (mine === seq.current) setState({ status: 'ready', items, scansByTrial });
    } catch (e) {
      if (mine === seq.current) setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
