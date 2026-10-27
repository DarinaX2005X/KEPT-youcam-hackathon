'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef } from 'react';
import type { ReadyTrialData } from '@/components/trial';
import type { WorkspaceData } from './data';
import styles from './Sections.module.css';

// The workspace is below the fold; its code loads after the hero is interactive.
const TrialWorkspace = dynamic(() => import('@/components/trial/TrialWorkspace').then((m) => m.TrialWorkspace), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading} aria-hidden />,
});

/**
 * Makes everything in `root` inert except the path down to the comparison handle, so the divider
 * can be dragged here while decisions, chips and the chart stay a picture of the real page.
 */
function keepOnlySlider(root: HTMLElement) {
  const handle = root.querySelector<HTMLElement>('[role="slider"]');
  if (!handle) {
    for (const child of Array.from(root.children)) (child as HTMLElement).inert = true;
    return;
  }
  // The slider root is the element with the pointer handlers: the handle's parent.
  let node: HTMLElement | null = handle.parentElement;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) if (sib !== node) (sib as HTMLElement).inert = true;
    node = parent;
  }
  // Inside the slider only the handle takes focus.
  const sliderRoot = handle.parentElement;
  sliderRoot?.querySelectorAll<HTMLElement>('button, a, [tabindex]').forEach((el) => {
    if (el !== handle) el.tabIndex = -1;
  });
}

export function WorkspacePreview({ data }: { data: WorkspaceData }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useMemo<ReadyTrialData>(
    () => ({ trial: data.trial, scans: data.scans, verdict: data.verdict, urls: data.urls, now: new Date(data.now), reload: async () => {} }),
    [data],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    keepOnlySlider(root);
    const mo = new MutationObserver(() => keepOnlySlider(root));
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div className={styles.workspaceFrame}>
      <div ref={ref} className={styles.workspaceInner}>
        <TrialWorkspace data={ready} />
      </div>
      <div className={styles.workspaceFade} aria-hidden />
    </div>
  );
}
