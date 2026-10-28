'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from 'motion/react';
import { FileText } from 'lucide-react';
import { computeVerdict } from '@/lib/domain';
import { Button, useDocumentTitle, useToast } from '@/components/ui';
import { TrialWorkspace, TrialWorkspaceSkeleton, useTrialData, type ReadyTrialData } from '@/components/trial';
import { FROM_TRIAL_KEY, TrialMissing } from '@/components/checkin';
import { CoachPanel } from '@/components/coach';
import { PreventionTrial } from '@/components/prevention';
import { isPrevention } from '@/components/shelf/model';
import { TrialMenu } from './TrialMenu';
import { CreateTarget } from './CreateTarget';
import styles from './trialPage.module.css';

export interface TrialPageProps {
  trialId: string;
  /** `?new=<scanId>` after a check-in: the page first shows the trial without it, then lets it arrive. */
  newScanId?: string;
}

/** How long the page holds the previous state before the new check-in lands. */
const REVEAL_DELAY_MS = 900;

export function TrialPage({ trialId, newScanId }: TrialPageProps) {
  const router = useRouter();
  const toast = useToast();
  const reduced = useReducedMotion();
  const data = useTrialData(trialId);
  const ready = data.status === 'ready' ? data : null;

  // The new check-in, captured once: the address loses ?new after the reveal.
  const [fresh] = useState(newScanId);
  const [phase, setPhase] = useState<'before' | 'after'>(newScanId ? 'before' : 'after');
  const freshScan = ready && fresh ? ready.scans.find((s) => s.id === fresh) : undefined;

  const shown = useMemo<ReadyTrialData | null>(() => {
    if (!ready) return null;
    if (phase === 'before' && freshScan) {
      const scans = ready.scans.filter((s) => s.id !== freshScan.id);
      return { ...ready, scans, verdict: computeVerdict(ready.trial, scans, ready.now) };
    }
    return ready;
  }, [ready, phase, freshScan]);

  useEffect(() => {
    if (phase !== 'before' || !ready) return;
    if (!freshScan) {
      setPhase('after');
      return;
    }
    const t = window.setTimeout(() => setPhase('after'), reduced ? 0 : REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase, ready, freshScan, reduced]);

  const announced = useRef(false);
  useEffect(() => {
    if (phase !== 'after' || !fresh || announced.current || !ready) return;
    announced.current = true;
    if (freshScan) toast.show({ text: `Day ${freshScan.day} check-in saved`, tone: 'better' });
    // Native replaceState keeps the router in sync without a server round trip that would reset the title.
    window.history.replaceState(window.history.state, '', `/trial/${encodeURIComponent(trialId)}`);
  }, [phase, fresh, freshScan, ready, toast, trialId]);

  const name = ready?.trial.product.name;
  useDocumentTitle(name ? `${name} | Kept` : undefined);

  function runCheckin() {
    try {
      sessionStorage.setItem(FROM_TRIAL_KEY, trialId);
    } catch {
      // Without storage, closing the camera navigates instead of going back.
    }
    router.push(`/trial/${encodeURIComponent(trialId)}/check-in`);
  }

  if (data.status === 'missing' || data.status === 'error') {
    return (
      <main className={styles.main}>
        <TrialMissing error={data.status === 'error'} onRetry={() => void data.reload()} />
      </main>
    );
  }

  if (shown && isPrevention(shown.trial)) {
    return (
      <main className={styles.main}>
        <PreventionTrial key={shown.trial.id} trial={shown.trial} scans={shown.scans} headerAside={<TrialMenu data={shown} report={false} />} />
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {shown ? (
        <TrialWorkspace
          key={shown.trial.id}
          data={shown}
          onRunCheckin={runCheckin}
          headerAside={
            <>
              <Button variant="quiet" icon={FileText} href={`/trial/${encodeURIComponent(shown.trial.id)}/report`} className={styles.reportButton}>
                Download report
              </Button>
              <TrialMenu data={shown} />
            </>
          }
          belowVerdict={
            <>
              <CreateTarget trial={shown.trial} scans={shown.scans} onCreated={() => void data.reload()} />
              <CoachPanel trial={shown.trial} scans={shown.scans} verdict={shown.verdict} now={shown.now} />
            </>
          }
        />
      ) : (
        <TrialWorkspaceSkeleton />
      )}
    </main>
  );
}
