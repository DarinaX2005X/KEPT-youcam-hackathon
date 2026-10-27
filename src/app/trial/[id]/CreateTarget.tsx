'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import { activesFor, type Scan, type Trial } from '@/lib/domain';
import { getBlob, saveTrial } from '@/lib/store';
import { isScanError } from '@/lib/scan';
import { Button, StepProgress } from '@/components/ui';
import { canSimulate, createProjection, TARGET_STEPS, type TargetPhase } from '@/components/wizard';
import styles from './trialPage.module.css';

interface CreateTargetProps {
  trial: Trial;
  scans: Scan[];
  onCreated: () => void;
}

/**
 * Shown when a trial was saved without its target (the simulation failed or the page reloaded).
 * Runs Skin Simulation on the day 0 photo once, on request. Never retries by itself.
 */
export function CreateTarget({ trial, scans, onCreated }: CreateTargetProps) {
  const [phase, setPhase] = useState<TargetPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseline = scans.find((s) => s.kind === 'baseline');
  const actives = activesFor(trial.product.actives);
  if (trial.projection || trial.sample || trial.status !== 'testing' || !baseline) return null;
  if (!canSimulate(actives, trial.targets)) return null;

  async function create() {
    if (!baseline) return;
    setError(null);
    setPhase('simulating');
    try {
      const photo = await getBlob(baseline.photo);
      if (!photo) throw new Error('missing photo');
      const target = await createProjection({
        actives,
        targets: trial.targets,
        zones: [...trial.targets, ...trial.watch],
        photo,
        onPhase: setPhase,
      });
      if (target) await saveTrial({ ...trial, projection: target });
      onCreated();
    } catch (err) {
      setError(isScanError(err) ? err.message : "Couldn't create the target. Try again in a minute.");
    } finally {
      setPhase(null);
    }
  }

  return (
    <section className={styles.targetPanel} aria-live="polite">
      <h2 className={styles.targetTitle}>This trial has no target yet</h2>
      <p className={styles.targetText}>
        The target shows how your day 0 photo could look if the product works, and gives the chart its expected range.
      </p>
      {phase ? (
        <StepProgress steps={TARGET_STEPS} current={phase} />
      ) : (
        <Button variant="secondary" icon={Target} onClick={() => void create()}>
          Create target
        </Button>
      )}
      {error ? <p className={styles.targetError}>{error}</p> : null}
    </section>
  );
}
