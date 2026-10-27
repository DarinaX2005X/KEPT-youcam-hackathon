'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dayOf, formatShortDate, type Concern, type Trial } from '@/lib/domain';
import { saveTrial } from '@/lib/store';
import { Skeleton, Tag, useToast } from '@/components/ui';
import { CheckinStrip } from './CheckinStrip';
import { CompareStage } from './CompareStage';
import { ConcernChips } from './ConcernChips';
import type { Decision } from './DecisionBar';
import { buildFrames, defaultFrameId, downloadCalendar, upcomingSlots } from './model';
import { ScheduleCard } from './ScheduleCard';
import { TrendChart } from './TrendChart';
import type { ReadyTrialData } from './useTrialData';
import { VerdictCard } from './VerdictCard';
import styles from './TrialWorkspace.module.css';

export interface TrialWorkspaceProps {
  data: ReadyTrialData;
  /** «Run check-in». The workspace does not route; the page decides where the camera opens. */
  onRunCheckin?: (trial: Trial) => void;
  /** Called after a decision (or its undo) is saved, with the updated trial. */
  onDecision?: (trial: Trial) => void;
  /** Right end of the trial header, e.g. the trial menu button. */
  headerAside?: ReactNode;
  /** Rendered right under the verdict card, e.g. the «Ask about this trial» panel. */
  belowVerdict?: ReactNode;
  className?: string;
}

function metaLine(trial: Trial, now: Date): string {
  const start = formatShortDate(trial.startedAt);
  const full = trial.plan.fullEffectDay;
  if ((trial.status === 'kept' || trial.status === 'stopped') && trial.decidedAt) {
    const days = Math.max(0, dayOf(trial, trial.decidedAt));
    return `${days}-day trial, ${start} to ${formatShortDate(trial.decidedAt)}`;
  }
  const day = Math.max(0, dayOf(trial, now));
  if (trial.status === 'paused') return `Paused on day ${day} of ${full}, started ${start}`;
  return `Day ${day} of ${full}, started ${start}`;
}

function firstConcern(trial: Trial): Concern {
  return trial.targets[0] ?? trial.watch[0] ?? 'acne';
}

/**
 * The trial page body: the face comparison with its controls on the left, the verdict, chart and
 * schedule on the right. Stage 03 mounts it on /trial/[id] with the data from `useTrialData`.
 * Toasts go to the nearest ToastProvider (the app's viewport region from the root layout).
 */
export function TrialWorkspace({ data, onRunCheckin, onDecision, headerAside, belowVerdict, className }: TrialWorkspaceProps) {
  const { trial, scans, verdict, urls, now, reload } = data;
  const toast = useToast();
  const frames = useMemo(() => buildFrames(trial, scans, urls), [trial, scans, urls]);
  const baseline = frames.find((f) => f.kind === 'baseline') ?? frames[0];
  const upcoming = useMemo(() => upcomingSlots(trial, scans), [trial, scans]);

  // Frame on the right of the stage. A new check-in becomes the selection when it arrives.
  const latestId = defaultFrameId(frames);
  const [frameId, setFrameId] = useState<string | undefined>(latestId);
  const [lastLatest, setLastLatest] = useState(latestId);
  if (latestId !== lastLatest) {
    setLastLatest(latestId);
    setFrameId(latestId);
  }
  const frame = frames.find((f) => f.id === frameId) ?? frames.find((f) => f.id === latestId) ?? baseline;

  const [concern, setConcern] = useState<Concern>(() => firstConcern(trial));
  const [chartConcern, setChartConcern] = useState<Concern>(() => trial.targets[0] ?? firstConcern(trial));
  const [showMask, setShowMask] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  // Reasons that are new since the previous verdict glow once.
  const prevReasons = useRef<string[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    const texts = verdict.reasons.map((r) => r.text);
    if (prevReasons.current) setFresh(texts.filter((t) => !prevReasons.current!.includes(t)));
    prevReasons.current = texts;
  }, [verdict]);

  function selectConcern(c: Concern) {
    setConcern(c);
    if (trial.targets.includes(c)) setChartConcern(c);
  }

  function showOnPhoto(c: Concern) {
    selectConcern(c);
    setShowMask(true);
    const el = stageRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 80 || r.top > window.innerHeight - 120) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function decide(status: Decision | 'testing') {
    const before = trial;
    const updated: Trial = { ...trial, status, decidedAt: status === 'testing' ? undefined : new Date().toISOString() };
    if (status === 'testing') delete updated.decidedAt;
    try {
      await saveTrial(updated);
      await reload();
      onDecision?.(updated);
    } catch {
      toast.show({ text: "Couldn't save your decision. Try again", tone: 'worse' });
      return;
    }
    const text =
      status === 'kept' ? 'Moved to Kept on your shelf' : status === 'stopped' ? 'Moved to Stopped on your shelf' : 'Back to testing';
    toast.show({
      text,
      tone: status === 'kept' ? 'better' : 'neutral',
      action: {
        onAction: async () => {
          await saveTrial(before);
          await reload();
          onDecision?.(before);
        },
      },
      duration: 6000,
    });
  }

  function addToCalendar() {
    if (downloadCalendar(trial, upcoming)) {
      toast.show({
        text: `Saved ${upcoming.length} check-in${upcoming.length === 1 ? '' : 's'} to a calendar file`,
        tone: 'better',
      });
    }
  }

  const decided = trial.status === 'kept' || trial.status === 'stopped';
  const decision = decided ? { status: trial.status as Decision, at: trial.decidedAt } : undefined;
  const selectedScanId = frame && frame.kind !== 'target' ? frame.id : undefined;

  return (
    <div className={clsx(styles.root, className)}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <div className={styles.tags}>
            <Tag status={trial.status} />
            {trial.sample ? <Tag status="sample" /> : null}
          </div>
          {headerAside ? <div className={styles.aside}>{headerAside}</div> : null}
        </div>
        <h1 className={styles.title}>{trial.product.name}</h1>
        <p className={clsx(styles.meta, 'num')}>{metaLine(trial, now)}</p>
      </header>

      <div className={styles.left}>
        <div ref={stageRef} className={styles.stageWrap}>
          {baseline && frame ? (
            <CompareStage
              baseline={baseline}
              frame={frame}
              concern={concern}
              showMask={showMask}
              onShowMaskChange={setShowMask}
              verdict={verdict}
              sample={trial.sample}
            />
          ) : null}
        </div>
        {baseline && frame ? (
          <ConcernChips
            targets={trial.targets}
            watch={trial.watch}
            baseline={baseline}
            frame={frame}
            value={concern}
            onChange={selectConcern}
            verdict={verdict}
          />
        ) : null}
        <CheckinStrip frames={frames} upcoming={upcoming} now={now} value={frame?.id ?? ''} onChange={setFrameId} className={styles.strip} />
      </div>

      <div className={styles.right}>
        <VerdictCard
          verdict={verdict}
          decision={decision}
          onRunCheckin={() => onRunCheckin?.(trial)}
          onAddToCalendar={addToCalendar}
          canAddToCalendar={upcoming.length > 0}
          onDecide={(d) => void decide(d)}
          onReopen={() => void decide('testing')}
          onReasonSelect={showOnPhoto}
          highlight={fresh}
        />
        {belowVerdict}
        <TrendChart
          trial={trial}
          scans={scans}
          concern={chartConcern}
          onConcernChange={setChartConcern}
          now={now}
          selectedId={selectedScanId}
          onPointSelect={setFrameId}
        />
        <ScheduleCard trial={trial} scans={scans} now={now} onAddToCalendar={addToCalendar} />
      </div>
    </div>
  );
}

/** Loading state shaped like the workspace. */
export function TrialWorkspaceSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx(styles.root, className)} aria-busy="true" aria-label="Loading trial">
      <div className={styles.head}>
        <Skeleton width={120} height={24} radius="tag" />
        <Skeleton width="80%" height={44} radius="control" />
        <Skeleton width={220} height={18} radius="tag" />
      </div>
      <div className={styles.left}>
        <Skeleton aspect="3 / 4" radius="card" width="100%" />
        <Skeleton width="70%" height={44} radius="chip" />
      </div>
      <div className={styles.right}>
        <Skeleton width="100%" height={360} radius="card" />
        <Skeleton width="100%" height={300} radius="card" />
      </div>
    </div>
  );
}
