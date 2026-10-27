'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Trial } from '@/lib/domain';
import { deleteTrial, importSample, listTrials } from '@/lib/store';
import { Button, Segmented } from '@/components/ui';
import { useTrialData, VerdictCard } from '@/components/trial';
import { CoachPanel } from './CoachPanel';

function shortName(t: Trial): string {
  const n = t.product.name.toLowerCase();
  if (n.includes('niacinamide')) return 'Niacinamide';
  if (n.includes('salicylic')) return 'Salicylic';
  if (n.includes('retinal')) return 'Retinal';
  return t.product.name;
}

/** Dev page for the assistant panel: a sample trial's verdict with the panel under it, at the right column's width. */
export function DevCoachPage() {
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
      return (all.find((t) => wanted && t.product.name.toLowerCase().includes(wanted)) ?? all[all.length - 1])?.id;
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '32px var(--gutter) 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {samples?.length ? (
          <Segmented aria-label="Sample trial" options={samples.map((t) => ({ value: t.id, label: shortName(t) }))} value={picked ?? samples[0].id} onChange={setPicked} />
        ) : null}
        <Button variant="quiet" icon={RotateCcw} onClick={() => void reset()} loading={busy}>
          {samples?.length ? 'Reset samples' : 'Load samples'}
        </Button>
      </div>
      {data.status === 'ready' ? (
        <>
          <VerdictCard verdict={data.verdict} actions={false} />
          <CoachPanel key={data.trial.id} trial={data.trial} scans={data.scans} verdict={data.verdict} now={data.now} defaultOpen />
        </>
      ) : null}
    </div>
  );
}
