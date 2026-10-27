'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Trial } from '@/lib/domain';
import { deleteTrial, importSample, listTrials } from '@/lib/store';
import { Button, Segmented, useToast } from '@/components/ui';
import { TrialWorkspace, TrialWorkspaceSkeleton, useTrialData, VERDICT_FIXTURES, VERDICT_KINDS, VerdictCard } from '@/components/trial';
import styles from './dev.module.css';

function shortName(t: Trial): string {
  const n = t.product.name.toLowerCase();
  if (n.includes('niacinamide')) return 'Niacinamide';
  if (n.includes('salicylic')) return 'Salicylic';
  if (n.includes('retinal')) return 'Retinal';
  return t.product.name;
}

export function DevTrial() {
  const toast = useToast();
  const [samples, setSamples] = useState<Trial[] | null>(null);
  const [picked, setPicked] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const all = (await listTrials()).filter((t) => t.sample);
    all.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    setSamples(all);
    const wanted = new URLSearchParams(window.location.search).get('t')?.toLowerCase();
    setPicked((p) => {
      if (p && all.some((t) => t.id === p)) return p;
      const byParam = wanted ? all.find((t) => t.product.name.toLowerCase().includes(wanted)) : undefined;
      return (byParam ?? all.find((t) => t.product.name.toLowerCase().includes('salicylic')) ?? all[0])?.id;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function load() {
    setBusy(true);
    try {
      await importSample();
      await refresh();
    } catch (e) {
      toast.show({ text: e instanceof Error ? e.message : "Couldn't load the sample trials", tone: 'worse' });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      for (const t of samples ?? []) await deleteTrial(t.id);
      setPicked(undefined);
      await importSample();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const data = useTrialData(picked);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        {samples && samples.length ? (
          <>
            <Segmented
              aria-label="Sample trial"
              options={samples.map((t) => ({ value: t.id, label: shortName(t) }))}
              value={picked ?? samples[0].id}
              onChange={setPicked}
            />
            <Button variant="quiet" icon={RotateCcw} onClick={() => void reset()} loading={busy}>
              Reset samples
            </Button>
          </>
        ) : samples ? (
          <div className={styles.empty}>
            <p>No sample trials in this browser yet.</p>
            <Button onClick={() => void load()} loading={busy}>
              Load sample trials
            </Button>
          </div>
        ) : null}
      </div>

      {picked ? (
        data.status === 'ready' ? (
          <TrialWorkspace
            key={data.trial.id}
            data={data}
            onRunCheckin={() => toast.show({ text: 'The camera opens here on /trial/[id]/check-in' })}
            onDecision={() => void refresh()}
          />
        ) : data.status === 'loading' ? (
          <TrialWorkspaceSkeleton />
        ) : data.status === 'missing' ? (
          <p className={styles.note}>This trial isn&apos;t in this browser.</p>
        ) : (
          <p className={styles.note}>{data.status === 'error' ? data.error.message : null}</p>
        )
      ) : null}

      <section className={styles.kinds} aria-labelledby="kinds-title">
        <h2 id="kinds-title" className={styles.kindsTitle}>
          All six verdicts
        </h2>
        <div className={styles.grid}>
          {VERDICT_KINDS.map((k) => (
            <VerdictCard
              key={k}
              verdict={VERDICT_FIXTURES[k]}
              onRunCheckin={() => toast.show({ text: 'Run check-in' })}
              onAddToCalendar={() => toast.show({ text: 'Add to calendar' })}
              onDecide={(d) => toast.show({ text: d === 'kept' ? 'Keep this product' : 'Stop this product' })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
