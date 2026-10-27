'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeVerdict, type Scan, type Trial, type Verdict } from '@/lib/domain';
import { blobUrl, getTrial, listScans, maskEntries } from '@/lib/store';
import type { TrialUrls } from './model';

export interface ReadyTrialData {
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
  urls: TrialUrls;
  /** The moment the verdict was computed for. */
  now: Date;
  /** Reloads from IndexedDB without clearing what is on screen. */
  reload: () => Promise<void>;
}

export type TrialDataState =
  | ({ status: 'ready' } & ReadyTrialData)
  | { status: 'loading'; reload: () => Promise<void> }
  | { status: 'missing'; reload: () => Promise<void> }
  | { status: 'error'; error: Error; reload: () => Promise<void> };

async function resolveUrls(trial: Trial, scans: Scan[]): Promise<TrialUrls> {
  const urls: TrialUrls = { photo: {}, masks: {} };
  const jobs: Promise<void>[] = [];
  for (const scan of scans) {
    jobs.push(
      blobUrl(scan.photo).then(
        (u) => void (urls.photo[scan.id] = u),
        () => undefined,
      ),
    );
    const masks: TrialUrls['masks'][string] = {};
    urls.masks[scan.id] = masks;
    for (const [concern, ref] of maskEntries(scan)) {
      jobs.push(
        blobUrl(ref).then(
          (u) => void (masks[concern] = u),
          () => undefined,
        ),
      );
    }
  }
  if (trial.projection) {
    jobs.push(
      blobUrl(trial.projection.photo).then(
        (u) => void (urls.target = u),
        () => undefined,
      ),
    );
  }
  await Promise.all(jobs);
  return urls;
}

/**
 * Loads a trial with its scans, image URLs and verdict from this browser.
 * A missing image leaves its URL out instead of failing the page.
 */
export function useTrialData(trialId: string | undefined): TrialDataState {
  const [state, setState] = useState<TrialDataState>({ status: 'loading', reload: async () => {} });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!trialId) return;
    try {
      const trial = await getTrial(trialId);
      if (mine !== seq.current) return;
      if (!trial) {
        setState({ status: 'missing', reload: load });
        return;
      }
      const scans = await listScans(trialId);
      const urls = await resolveUrls(trial, scans);
      if (mine !== seq.current) return;
      const now = new Date();
      setState({ status: 'ready', trial, scans, urls, now, verdict: computeVerdict(trial, scans, now), reload: load });
    } catch (e) {
      if (mine !== seq.current) return;
      setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)), reload: load });
    }
  }, [trialId]);

  useEffect(() => {
    setState({ status: 'loading', reload: load });
    void load();
  }, [load]);

  return state;
}
