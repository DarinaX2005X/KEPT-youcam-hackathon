'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { CalendarPlus, Columns2, RotateCcw, SplitSquareHorizontal } from 'lucide-react';
import { Button, CompareSlider, PhotoPrint, StepProgress } from '@/components/ui';
import { addDays, concernLabel, concernNoun, formatShortDate, joinNouns, type Active, type Concern, type TrialPlan } from '@/lib/domain';
import { EmptyPrint } from './EmptyPrint';
import { PlanRuler } from './PlanRuler';
import { canSimulate, TARGET_STEPS, type TargetPhase } from './target';
import { weekLabel, type BaselineData, type TargetState } from './state';
import { useBlobUrls } from './useBlobUrls';
import layout from './Wizard.module.css';
import photoStyles from './PhotoStep.module.css';
import styles from './PlanStep.module.css';

export interface PlanStepProps {
  baseline: BaselineData;
  target: TargetState;
  phase: TargetPhase | null;
  actives: Active[];
  targets: Concern[];
  watch: Concern[];
  plan: TrialPlan;
  sample: boolean;
  saving: boolean;
  onRetryTarget: () => void;
  onAddToCalendar: () => void;
  onSave: () => void;
}

function GoalRow({ c, base, proj }: { c: Concern; base?: number; proj?: number }) {
  const b = base !== undefined ? Math.round(base) : undefined;
  const p = proj !== undefined ? Math.round(proj) : undefined;
  return (
    <li className={styles.goal}>
      <span className={styles.goalName}>{concernLabel(c)}</span>
      <span className={clsx(styles.goalNums, 'num')}>
        {b ?? '–'}
        {p !== undefined ? (
          <>
            <span className={styles.goalArrow} aria-label="to">
              {' → '}
            </span>
            <span className={styles.goalTarget}>{p}</span>
            <span className={styles.goalIf}> if it works</span>
          </>
        ) : (
          <span className={styles.goalIf}> today</span>
        )}
      </span>
    </li>
  );
}

export function PlanStep({ baseline, target, phase, actives, targets, watch, plan, sample, saving, onRetryTarget, onAddToCalendar, onSave }: PlanStepProps) {
  const urls = useBlobUrls<'base' | 'target'>(target.status === 'done' ? { base: baseline.photo, target: target.data.photo } : { base: baseline.photo });
  const [compare, setCompare] = useState(false);
  const [now] = useState(() => new Date());
  const week = weekLabel(plan.fullEffectDay);
  const done = target.status === 'done';
  const proj = done ? target.data.scores : {};
  const simulatable = canSimulate(actives, targets);

  let targetFrame;
  if (done && urls.target) {
    targetFrame = <PhotoPrint src={urls.target} alt={`Simulated look of your skin at ${week.toLowerCase()}`} label={week} sublabel="Target" variant="target" tilt={1.5} className={styles.print} />;
  } else if (target.status === 'running' || (done && !urls.target)) {
    targetFrame = (
      <EmptyPrint label={week} sublabel="Target" variant="target" tilt={1.5} busy className={styles.print}>
        <StepProgress steps={TARGET_STEPS} current={phase} aria-label="Target progress" className={styles.steps} />
      </EmptyPrint>
    );
  } else if (target.status === 'error') {
    targetFrame = (
      <EmptyPrint label={week} sublabel="Target" variant="target" tilt={1.5} className={styles.print}>
        <p className={styles.frameText}>{target.message}</p>
        {!target.limit ? (
          <Button variant="secondary" icon={RotateCcw} onClick={onRetryTarget} className={styles.frameButton}>
            Try again
          </Button>
        ) : null}
      </EmptyPrint>
    );
  } else if (target.status === 'skipped' || !simulatable) {
    targetFrame = (
      <EmptyPrint label={week} sublabel="No target photo" tilt={1.5} className={styles.print}>
        <p className={styles.frameText}>
          YouCam can&apos;t simulate {joinNouns(targets.map(concernNoun))}, so this trial compares every check-in with day 0.
        </p>
      </EmptyPrint>
    );
  } else {
    targetFrame = (
      <EmptyPrint label={week} sublabel="Target" variant="target" tilt={1.5} className={styles.print}>
        <Button variant="secondary" onClick={onRetryTarget} className={styles.frameButton}>
          Create target
        </Button>
      </EmptyPrint>
    );
  }

  const slots = plan.checkinDays.map((day) => ({ day, date: addDays(now, day) }));

  return (
    <div className={clsx(photoStyles.split, styles.planSplit)}>
      <div className={styles.visual}>
        {compare && done && urls.base && urls.target ? (
          <figure className={styles.compare}>
            <CompareSlider
              labels={['Day 0', `${week} target`]}
              left={<img src={urls.base} alt="" className={styles.compareImg} draggable={false} />}
              right={<img src={urls.target} alt="" className={styles.compareImg} draggable={false} />}
              aria-label="Compare day 0 with the target"
            />
            <figcaption className={styles.compareCaption}>
              <span>
                Drag to compare day 0 with the {week.toLowerCase()} target <span className={styles.simNote}>simulated with YouCam</span>
              </span>
            </figcaption>
          </figure>
        ) : (
          <div className={styles.pair}>
            {urls.base ? (
              <PhotoPrint src={urls.base} alt="Your day 0 photo" label="Day 0" sublabel={sample ? 'Face generated with YouCam AI' : formatShortDate(now)} tilt={-1.5} priority className={styles.print} />
            ) : (
              <EmptyPrint label="Day 0" tilt={-1.5} className={styles.print} />
            )}
            {targetFrame}
          </div>
        )}
        {!compare ? <PlanRuler plan={plan} className={styles.ruler} /> : null}
        {done ? (
          <Button variant="secondary" icon={compare ? Columns2 : SplitSquareHorizontal} onClick={() => setCompare((v) => !v)} className={styles.compareToggle} aria-pressed={compare}>
            {compare ? 'Side by side' : 'Compare'}
          </Button>
        ) : null}
      </div>

      <div className={layout.main}>
        <h1 className={layout.title}>Your plan</h1>

        <section className={styles.block} aria-labelledby="goals-head">
          <h2 id="goals-head" className={layout.smallHead}>
            What to expect by {week.toLowerCase()}
          </h2>
          <ul className={styles.goals}>
            {targets.map((c) => (
              <GoalRow key={c} c={c} base={baseline.scores[c]?.ui} proj={proj[c]?.ui} />
            ))}
          </ul>
          {watch.length ? (
            <p className={styles.watchNote}>
              Also watching {joinNouns(watch.map(concernNoun))}
              <span className="num">
                {' '}
                ({watch.map((c) => `${Math.round(baseline.scores[c]?.ui ?? 0)}`).join(', ')} today)
              </span>{' '}
              for irritation.
            </p>
          ) : null}
        </section>

        <section className={styles.block} aria-labelledby="schedule-head">
          <h2 id="schedule-head" className={layout.smallHead}>
            Check-ins
          </h2>
          <ol className={styles.schedule}>
            {slots.map((s) => (
              <li key={s.day} className={clsx(styles.slot, s.day === plan.fullEffectDay && styles.final)}>
                <span className={clsx(styles.slotDay, 'num')}>Day {s.day}</span>
                <span className={clsx(styles.slotDate, 'num')}>{formatShortDate(s.date)}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className={layout.actions}>
          <Button size="lg" onClick={onSave} loading={saving} className={layout.primary}>
            Save trial
          </Button>
          <Button size="lg" variant="secondary" icon={CalendarPlus} onClick={onAddToCalendar}>
            Add to calendar
          </Button>
          {target.status === 'running' ? <p className={layout.actionNote}>Saving now starts the trial without the target photo</p> : null}
          {target.status === 'error' ? <p className={layout.actionNote}>You can save now and create the target later from the trial page</p> : null}
        </div>
      </div>
    </div>
  );
}
