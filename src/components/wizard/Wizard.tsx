'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Skeleton, useToast } from '@/components/ui';
import { CaptureView, type CaptureResult } from '@/components/capture';
import { downloadCalendar } from '@/components/trial';
import { PreventionStep } from '@/components/prevention/PreventionStep';
import { addDays, type BlobRef, type Concern, type Scan, type Trial } from '@/lib/domain';
import { isAbortError, isScanError, SCAN_MESSAGES as MESSAGES, useScan } from '@/lib/scan';
import { newId, putBlob, saveScan, saveTrial } from '@/lib/store';
import { BaselineStep } from './BaselineStep';
import { GoalsStep } from './GoalsStep';
import { PlanStep } from './PlanStep';
import { ProductStep } from './ProductStep';
import {
  clearDraft,
  initialState,
  isPreventionOnly,
  planFor,
  readDraft,
  reducer,
  selectedActives,
  selectedIds,
  stateFromParams,
  weekLabel,
  writeDraft,
  zonesOf,
  type BaselineData,
  type StepId,
  type WizardState,
} from './state';
import { canSimulate, createProjection, type TargetPhase } from './target';
import { WizardSteps, type WizardStep } from './WizardSteps';
import styles from './Wizard.module.css';

const TRIAL_STEPS: WizardStep<StepId>[] = [
  { id: 'product', label: 'Product' },
  { id: 'goals', label: 'Goals' },
  { id: 'baseline', label: 'Baseline photo' },
  { id: 'plan', label: 'Your plan' },
];

const PREVENTION_STEPS: WizardStep<StepId>[] = [
  { id: 'product', label: 'Product' },
  { id: 'goals', label: 'Sun protection' },
];

async function storeOutcomeMasks(masks: Partial<Record<Concern, Blob>>): Promise<Partial<Record<Concern, BlobRef>>> {
  const entries = Object.entries(masks) as [Concern, Blob][];
  const refs = await Promise.all(entries.map(([, b]) => putBlob(b)));
  const out: Partial<Record<Concern, BlobRef>> = {};
  entries.forEach(([c], i) => (out[c] = refs[i]));
  return out;
}

/** /start: Product → Goals → Baseline photo → Your plan, or Product → Sun protection for sunscreen. */
export function Wizard() {
  const router = useRouter();
  const toast = useToast();
  const scan = useScan();
  const [hydrated, setHydrated] = useState(false);
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(''));
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  const [phase, setPhase] = useState<TargetPhase | null>(null);
  const [saving, setSaving] = useState(false);
  const targetCtrl = useRef<AbortController | null>(null);
  const firstStep = useRef(true);

  // Restore: a link from Before you buy wins over the draft; otherwise the draft from this tab.
  const restored = useRef<WizardState | null>(null);
  useEffect(() => {
    // Read once: the URL is cleaned right after, and a second effect run must not fall back to the draft.
    if (!restored.current) {
      const fromUrl = stateFromParams(new URLSearchParams(window.location.search), newId());
      restored.current = fromUrl ?? readDraft() ?? initialState(newId());
      if (fromUrl) window.history.replaceState(window.history.state, '', '/start');
    }
    dispatch({ type: 'restore', state: restored.current });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !saving) writeDraft(state);
  }, [state, hydrated, saving]);

  useEffect(() => () => targetCtrl.current?.abort(), []);

  useEffect(() => {
    if (!hydrated) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [state.step, hydrated]);

  const ids = selectedIds(state);
  const idsKey = ids.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actives = useMemo(() => selectedActives(state), [idsKey]);
  const prevention = isPreventionOnly(actives);
  const plan = useMemo(() => planFor(actives), [actives]);
  const zones = zonesOf(state);
  const steps = prevention ? PREVENTION_STEPS : TRIAL_STEPS;
  const step: StepId = prevention && (state.step === 'baseline' || state.step === 'plan') ? 'goals' : state.step;
  const busy = scan.status === 'running';
  const sample = (state.baseline?.capture.source ?? captured?.meta.source) === 'sample';

  const startTarget = useCallback(
    async (baseline: BaselineData, wizard: Pick<WizardState, 'targets'>) => {
      targetCtrl.current?.abort();
      if (!canSimulate(actives, wizard.targets)) {
        dispatch({ type: 'target', value: { status: 'skipped' } });
        return;
      }
      const ctrl = new AbortController();
      targetCtrl.current = ctrl;
      dispatch({ type: 'target', value: { status: 'running' } });
      setPhase('simulating');
      try {
        const data = await createProjection({
          actives,
          targets: wizard.targets,
          zones: baseline.zones,
          fileId: baseline.fileId,
          onPhase: (p) => !ctrl.signal.aborted && setPhase(p),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        dispatch({ type: 'target', value: data ? { status: 'done', data } : { status: 'skipped' } });
      } catch (err) {
        if (ctrl.signal.aborted || isAbortError(err)) return;
        if (!isScanError(err)) console.warn('[wizard] target failed', err);
        dispatch({
          type: 'target',
          value: {
            status: 'error',
            message: isScanError(err) ? err.message : MESSAGES.upstream,
            limit: isScanError(err) && err.code === 'limit',
          },
        });
      } finally {
        if (targetCtrl.current === ctrl) {
          targetCtrl.current = null;
          setPhase(null);
        }
      }
    },
    [actives],
  );

  async function onCapture(result: CaptureResult) {
    setCapturing(false);
    setCaptured(result);
    targetCtrl.current?.abort();
    dispatch({ type: 'baseline', data: null });
    const measured = [...zones];
    const out = await scan.run(result.blob, measured);
    if (!out) return;
    try {
      const [photo, masks] = await Promise.all([putBlob(out.image), storeOutcomeMasks(out.masks)]);
      const data: BaselineData = {
        photo,
        masks,
        scores: out.scores,
        overall: out.overall,
        skinAge: out.skinAge,
        maskStats: out.maskStats,
        capture: result.meta,
        fileId: out.fileId,
        zones: measured,
        takenAt: new Date().toISOString(),
      };
      dispatch({ type: 'baseline', data });
      void startTarget(data, state);
    } catch {
      toast.show({ text: "Kept couldn't store the photo in this browser. Check that it isn't in private mode", tone: 'worse' });
    }
  }

  function draftTrial(startedAt: string): Trial {
    const product = { name: state.name.trim(), actives: ids, ...(state.mode === 'paste' && state.inci.trim() ? { inci: state.inci.trim() } : {}) };
    return { id: state.trialId, product, targets: state.targets, watch: state.watch, startedAt, plan, status: 'testing' };
  }

  function addToCalendar() {
    const now = new Date().toISOString();
    const slots = plan.checkinDays.map((day) => ({ day, date: addDays(now, day) }));
    if (downloadCalendar(draftTrial(now), slots)) {
      toast.show({ text: `Saved ${slots.length} check-ins to a calendar file`, tone: 'better' });
    }
  }

  async function saveTrialAndOpen() {
    const b = state.baseline;
    if (!b || saving) return;
    setSaving(true);
    targetCtrl.current?.abort();
    try {
      const now = new Date().toISOString();
      const trial = draftTrial(now);
      if (state.target.status === 'done') trial.projection = state.target.data;
      const baselineScan: Scan = {
        id: newId(),
        trialId: trial.id,
        kind: 'baseline',
        day: 0,
        takenAt: now,
        photo: b.photo,
        masks: b.masks,
        scores: b.scores,
        overall: b.overall,
        skinAge: b.skinAge,
        maskStats: b.maskStats,
        capture: b.capture,
      };
      await saveTrial(trial);
      await saveScan(baselineScan);
      clearDraft();
      router.push(`/trial/${trial.id}`);
    } catch {
      setSaving(false);
      toast.show({ text: "Kept couldn't save the trial in this browser. Try again", tone: 'worse' });
    }
  }

  async function addToShelf() {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const trial = draftTrial(now);
      trial.targets = [];
      trial.watch = [];
      trial.plan = { ...plan, checkinDays: [] };
      trial.status = 'kept';
      trial.decidedAt = now;
      await saveTrial(trial);
      clearDraft();
      toast.show({ text: `${trial.product.name} is on your shelf`, tone: 'better' });
      router.push('/shelf');
    } catch {
      setSaving(false);
      toast.show({ text: "Kept couldn't save it in this browser. Try again", tone: 'worse' });
    }
  }

  function canOpen(id: StepId): boolean {
    if (busy) return false;
    if (id === 'product' || id === 'goals') return !state.baseline;
    return true;
  }

  if (!hydrated) {
    return (
      <main className={styles.page} aria-busy>
        <Skeleton height={40} width="min(100%, 720px)" />
        <div className={styles.loading}>
          <Skeleton height={48} width="min(100%, 520px)" />
          <Skeleton height={52} width="min(100%, 620px)" radius="control" />
          <Skeleton height={44} width="min(100%, 620px)" radius="control" />
        </div>
      </main>
    );
  }

  let content;
  if (step === 'product') {
    content = <ProductStep state={state} dispatch={dispatch} onContinue={() => dispatch({ type: 'enterGoals' })} />;
  } else if (step === 'goals' && prevention) {
    content = <PreventionStep productName={state.name} saving={saving} onAddToShelf={addToShelf} />;
  } else if (step === 'goals') {
    content = <GoalsStep state={state} actives={actives} dispatch={dispatch} onContinue={() => dispatch({ type: 'goto', step: 'baseline' })} />;
  } else if (step === 'baseline' || !state.baseline) {
    content = (
      <BaselineStep
        zones={zones}
        baseline={state.baseline}
        scan={scan}
        captured={captured?.blob ?? null}
        sample={sample}
        targetStatus={state.target.status}
        targetLabel={weekLabel(plan.fullEffectDay).toLowerCase()}
        onTakePhoto={() => setCapturing(true)}
        onContinue={() => dispatch({ type: 'goto', step: 'plan' })}
      />
    );
  } else {
    content = (
      <PlanStep
        baseline={state.baseline}
        target={state.target}
        phase={phase}
        actives={actives}
        targets={state.targets}
        watch={state.watch}
        plan={plan}
        sample={sample}
        saving={saving}
        onRetryTarget={() => state.baseline && void startTarget(state.baseline, state)}
        onAddToCalendar={addToCalendar}
        onSave={saveTrialAndOpen}
      />
    );
  }

  return (
    <main className={styles.page}>
      <WizardSteps steps={steps} current={step} canOpen={canOpen} onOpen={(id) => dispatch({ type: 'goto', step: id })} className={styles.steps} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${step}-${prevention}`}
          className={styles.stage}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
          transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
      {capturing ? <CaptureView mode="baseline" onCapture={(r) => void onCapture(r)} onCancel={() => setCapturing(false)} /> : null}
    </main>
  );
}
