'use client';

import clsx from 'clsx';
import { useId, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  Hourglass,
  Info,
  Minus,
  MinusCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { formatShortDate, type Concern, type Reason, type Verdict, type VerdictKind } from '@/lib/domain';
import { Button } from '@/components/ui';
import { DecisionBar, type Decision } from './DecisionBar';
import { splitReasons } from './model';
import styles from './VerdictCard.module.css';

type CardTone = 'better' | 'worse' | 'reacting' | 'flat';

export const VERDICT_LOOK: Record<VerdictKind, { icon: LucideIcon; tone: CardTone }> = {
  too_early: { icon: Hourglass, tone: 'flat' },
  on_track: { icon: TrendingUp, tone: 'better' },
  working: { icon: CheckCircle2, tone: 'better' },
  purging: { icon: RefreshCw, tone: 'reacting' },
  reacting: { icon: AlertTriangle, tone: 'worse' },
  not_enough: { icon: MinusCircle, tone: 'flat' },
};

const REASON_ICON: Record<Reason['tone'], LucideIcon> = {
  better: TrendingUp,
  worse: TrendingDown,
  flat: Minus,
  info: Info,
};

const REASON_WORD: Record<Reason['tone'], string> = {
  better: 'Better',
  worse: 'Worse',
  flat: 'No real change',
  info: 'Note',
};

export interface VerdictCardProps {
  verdict: Verdict;
  /** A decision already taken on this trial replaces the suggestion buttons. */
  decision?: { status: Decision; at?: string };
  /** False draws the compact card without buttons (landing scene). */
  actions?: boolean;
  onRunCheckin?: () => void;
  onAddToCalendar?: () => void;
  canAddToCalendar?: boolean;
  onDecide?: (decision: Decision) => void;
  /** Reopens a decided trial. */
  onReopen?: () => void;
  /** Makes reasons about an area clickable, to show that area on the photo. */
  onReasonSelect?: (concern: Concern) => void;
  /** Reasons whose text changed since the last render glow briefly. */
  highlight?: string[];
  className?: string;
}

/** The trial's conclusion: what it means, the numbers behind it and what to do next. */
export function VerdictCard({
  verdict,
  decision,
  actions = true,
  onRunCheckin,
  onAddToCalendar,
  canAddToCalendar,
  onDecide,
  onReopen,
  onReasonSelect,
  highlight = [],
  className,
}: VerdictCardProps) {
  const look = VERDICT_LOOK[verdict.kind];
  const Icon = look.icon;
  const { reasons, caveats } = splitReasons(verdict);
  const [deferred, setDeferred] = useState(false);
  const headId = useId();
  const suggestion = deferred && verdict.next.action !== 'checkin' && verdict.next.action !== 'keep_going' ? 'checkin' : verdict.next.action;

  // The keep and stop suggestions are said by the buttons themselves.
  const showStep = !deferred && verdict.next.action !== 'decide_keep' && verdict.next.action !== 'decide_stop';

  return (
    <section className={clsx(styles.card, className)} aria-labelledby={headId}>
      <header className={clsx(styles.head, styles[look.tone])}>
        <span className={styles.icon}>
          <Icon size={26} strokeWidth={2} aria-hidden />
        </span>
        <h2 id={headId} className={styles.headline}>
          {verdict.headline}
        </h2>
      </header>

      <div className={styles.body}>
        <p className={styles.summary}>{verdict.summary}</p>

        <ul className={styles.reasons}>
          {reasons.map((r) => {
            const RIcon = REASON_ICON[r.tone];
            const clickable = Boolean(r.concern && onReasonSelect);
            const content = (
              <>
                <span className={clsx(styles.dot, styles[`r_${r.tone}`])} title={REASON_WORD[r.tone]}>
                  <RIcon size={12} strokeWidth={2.5} aria-hidden />
                </span>
                <span className={clsx(styles.reasonText, 'num')}>
                  <span className="visually-hidden">{REASON_WORD[r.tone]}: </span>
                  {r.text}
                </span>
              </>
            );
            return (
              <li key={r.text} className={clsx(styles.reason, highlight.includes(r.text) && styles.fresh)}>
                {clickable ? (
                  <button type="button" className={styles.reasonButton} onClick={() => r.concern && onReasonSelect?.(r.concern)}>
                    {content}
                  </button>
                ) : (
                  <div className={styles.reasonRow}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>

        {verdict.confidence !== 'high' ? (
          <div className={styles.confidence}>
            <CircleAlert size={18} strokeWidth={1.75} aria-hidden className={styles.confIcon} />
            <p>
              <strong>{verdict.confidence === 'low' ? 'Low confidence. ' : 'Less certain. '}</strong>
              {caveats.length ? caveats.map((c) => c.text).join('. ') : 'This photo differs from day 0, so small changes are less certain'}
            </p>
          </div>
        ) : null}

        {actions ? (
          <div className={styles.next}>
            {decision ? (
              <div className={styles.decided}>
                <span className={clsx(styles.decidedIcon, decision.status === 'kept' ? styles.better : styles.worse)}>
                  {decision.status === 'kept' ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <CircleSlash size={16} strokeWidth={2.25} aria-hidden />}
                </span>
                <p className={styles.decidedText}>
                  {decision.status === 'kept' ? 'You kept this product' : 'You stopped this product'}
                  {decision.at ? ` on ${formatShortDate(decision.at)}` : ''}
                </p>
                {onReopen ? (
                  <Button variant="quiet" onClick={onReopen}>
                    Change decision
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {showStep ? (
                  <p className={styles.step}>
                    <CalendarClock size={18} strokeWidth={1.75} aria-hidden />
                    <span>{verdict.next.label}</span>
                  </p>
                ) : null}
                <DecisionBar
                  action={suggestion}
                  onRunCheckin={onRunCheckin}
                  onAddToCalendar={onAddToCalendar}
                  canAddToCalendar={canAddToCalendar}
                  onDecide={onDecide}
                  onDefer={() => setDeferred(true)}
                />
              </>
            )}
          </div>
        ) : null}

        <p className={styles.disclaimer}>Kept compares photos of your skin. It is not a medical diagnosis.</p>
      </div>
    </section>
  );
}
