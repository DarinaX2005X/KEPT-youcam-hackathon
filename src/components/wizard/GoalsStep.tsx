'use client';

import clsx from 'clsx';
import type { Dispatch } from 'react';
import { Eye } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { activeNoun, concernLabel, joinNouns, spanText, type Active, type Concern, type TrialPlan } from '@/lib/domain';
import { PlanRuler } from './PlanRuler';
import {
  activeTargets,
  MAX_DEFAULT_ZONES,
  MAX_ZONES_HARD,
  moreAreas,
  planFor,
  watchCandidates,
  zonesOf,
  type Action,
  type WizardState,
} from './state';
import layout from './Wizard.module.css';
import styles from './GoalsStep.module.css';

function weekOrDay(day: number): string {
  return day % 7 === 0 ? `week ${day / 7}` : `day ${day}`;
}

function timingLine(actives: readonly Active[], plan: TrialPlan): string {
  const list = actives.filter((a) => !a.prevention);
  if (!list.length) return `Most products show first changes after ${spanText(plan.onsetDay)} and full effect by ${weekOrDay(plan.fullEffectDay)}`;
  const fastest = list.find((a) => a.onsetDay === plan.onsetDay) ?? list[0];
  const slowest = [...list].reverse().find((a) => a.fullEffectDay === plan.fullEffectDay) ?? list[0];
  if (fastest === slowest) {
    return `${fastest.name} usually shows first changes after ${spanText(plan.onsetDay)} and full effect by ${weekOrDay(plan.fullEffectDay)}`;
  }
  const later = activeNoun(slowest);
  return `${fastest.name} can show first changes after ${spanText(plan.onsetDay)}. Full effect of ${later} takes until ${weekOrDay(plan.fullEffectDay)}`;
}

function purgeLine(plan: TrialPlan): string | null {
  if (!plan.purge) return null;
  const from = Math.max(1, Math.round(plan.purge.fromDay / 7));
  const to = Math.max(from, Math.round(plan.purge.toDay / 7));
  return `Breakouts can get worse between week ${from} and week ${to}. Kept will tell you if that's a purge`;
}

function watchLine(watch: Concern[]): string {
  const nouns = watch.map((c, i) => (i === 0 ? concernLabel(c) : concernLabel(c).toLowerCase()));
  return `${joinNouns(nouns)} ${watch.length === 1 ? 'shows' : 'show'} early if a product irritates your skin`;
}

export function TimingCard({ actives, plan, className }: { actives: readonly Active[]; plan: TrialPlan; className?: string }) {
  const purge = purgeLine(plan);
  return (
    <section className={clsx(styles.timing, className)} aria-label="How long it takes">
      <p className={styles.timingText}>{timingLine(actives, plan)}</p>
      <PlanRuler plan={plan} />
      {purge ? <p className={styles.purge}>{purge}</p> : null}
      <p className={clsx(styles.count, 'num')}>
        {plan.checkinDays.length} check-ins over {spanText(plan.fullEffectDay)}
      </p>
    </section>
  );
}

export interface GoalsStepProps {
  state: WizardState;
  actives: Active[];
  dispatch: Dispatch<Action>;
  onContinue: () => void;
}

export function GoalsStep({ state, actives, dispatch, onContinue }: GoalsStepProps) {
  const plan = planFor(actives);
  const candidates = [...watchCandidates(actives), ...state.watch].filter((c, i, all) => all.indexOf(c) === i && !state.targets.includes(c));
  // Each area shows once: what is under «We'll also watch» is left out of the lists above and below.
  const main = activeTargets(actives).filter((c) => !state.watch.includes(c));
  const more = moreAreas(actives).filter((c) => !candidates.includes(c));
  const zones = zonesOf(state);
  const full = zones.length >= MAX_ZONES_HARD;
  const ready = state.targets.length > 0;

  function target(c: Concern, i: number) {
    const selected = state.targets.includes(c);
    return (
      <Chip
        key={c}
        selected={selected}
        disabled={!selected && full}
        onClick={() => dispatch({ type: 'toggleTarget', concern: c })}
        style={{ animationDelay: `${i * 40}ms` }}
        className={styles.chip}
      >
        {concernLabel(c)}
      </Chip>
    );
  }

  return (
    <div className={layout.split}>
      <form
        className={layout.main}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onContinue();
        }}
        noValidate
      >
        <h1 className={layout.title}>What should it change?</h1>

        <fieldset className={styles.group}>
          <legend className={layout.smallHead}>What {actives.length === 1 ? activeNoun(actives[0]) : 'these actives'} can change</legend>
          <div className={styles.chips}>{main.map(target)}</div>
        </fieldset>

        {candidates.length ? (
          <fieldset className={clsx(styles.group, styles.watch)}>
            <legend className={styles.watchHead}>
              <Eye size={18} strokeWidth={1.75} aria-hidden />
              <span className={layout.smallHead}>We&apos;ll also watch</span>
            </legend>
            <p className={styles.watchText}>{watchLine(candidates)}</p>
            <div className={styles.chips}>
              {candidates.map((c) => {
                const selected = state.watch.includes(c);
                return (
                  <Chip key={c} selected={selected} disabled={!selected && full} onClick={() => dispatch({ type: 'toggleWatch', concern: c })}>
                    {concernLabel(c)}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <fieldset className={styles.group}>
          <legend className={layout.smallHead}>More areas</legend>
          <div className={styles.chips}>{more.map((c, i) => target(c, i + main.length))}</div>
        </fieldset>

        <p className={clsx(styles.zones, zones.length > MAX_DEFAULT_ZONES && styles.slow)} aria-live="polite">
          <span className="num">
            {zones.length} {zones.length === 1 ? 'area' : 'areas'} in each scan
          </span>
          {zones.length > MAX_DEFAULT_ZONES ? <span>. Checking more areas makes each scan slower</span> : null}
          {full ? <span>. That&apos;s the most one scan can check</span> : null}
        </p>

        <TimingCard actives={actives} plan={plan} className={layout.onlyMobile} />

        <div className={layout.actions}>
          <Button type="submit" size="lg" disabled={!ready} className={layout.primary}>
            Continue
          </Button>
          {!ready ? <p className={layout.actionNote}>Pick at least one area to track</p> : null}
        </div>
      </form>

      <aside className={clsx(layout.aside, layout.hideMobile)}>
        <TimingCard actives={actives} plan={plan} />
      </aside>
    </div>
  );
}
