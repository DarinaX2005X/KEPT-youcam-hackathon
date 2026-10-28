'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Info,
  Minus,
  MinusCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { Reason, VerdictKind } from '@/lib/domain';
import type { VerdictRow } from './data';
import styles from './VerdictStrip.module.css';

type Tone = 'better' | 'worse' | 'reacting' | 'flat';

/** Same icons and tones as VerdictCard. */
const LOOK: Record<VerdictKind, { icon: LucideIcon; tone: Tone }> = {
  too_early: { icon: Hourglass, tone: 'flat' },
  on_track: { icon: TrendingUp, tone: 'better' },
  working: { icon: CheckCircle2, tone: 'better' },
  purging: { icon: RefreshCw, tone: 'reacting' },
  reacting: { icon: AlertTriangle, tone: 'worse' },
  not_enough: { icon: MinusCircle, tone: 'flat' },
};

const REASON_ICON: Record<Reason['tone'], LucideIcon> = { better: TrendingUp, worse: TrendingDown, flat: Minus, info: Info };
const REASON_WORD: Record<Reason['tone'], string> = { better: 'Better', worse: 'Worse', flat: 'No real change', info: 'Note' };
const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * The six verdicts as a switch and one large example. Tabs follow the WAI-ARIA tabs pattern:
 * arrows move and select, Home and End jump to the ends.
 */
export function VerdictStrip({ rows, initial = 'working' }: { rows: VerdictRow[]; initial?: VerdictKind }) {
  const [kind, setKind] = useState<VerdictKind>(initial);
  const reduce = useReducedMotion();
  const uid = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // On a phone the switch scrolls sideways; keep the selected verdict in view without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabs.current[rows.findIndex((r) => r.kind === kind)];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  }, [kind, rows, reduce]);
  const row = rows.find((r) => r.kind === kind) ?? rows[0];
  const look = LOOK[row.kind];
  const Icon = look.icon;

  function select(i: number) {
    const n = rows.length;
    const next = rows[(i + n) % n];
    setKind(next.kind);
    tabs.current[(i + n) % n]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 };
    if (e.key in map) {
      e.preventDefault();
      select(map[e.key]);
    }
  }

  return (
    <div className={styles.strip}>
      <div ref={listRef} role="tablist" aria-label="Verdicts" className={styles.tabs}>
        {rows.map((r, i) => {
          const L = LOOK[r.kind];
          const TabIcon = L.icon;
          const selected = r.kind === kind;
          return (
            <button
              key={r.kind}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${r.kind}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel`}
              tabIndex={selected ? 0 : -1}
              className={clsx(styles.tab, selected && styles.tabOn, styles[`t_${L.tone}`])}
              onClick={() => setKind(r.kind)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {selected ? (
                <motion.span
                  layoutId={`${uid}-thumb`}
                  className={styles.thumb}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
                />
              ) : null}
              <span className={styles.tabIcon}>
                <TabIcon size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className={styles.tabLabel}>{r.headline}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${kind}`} className={clsx(styles.panel, styles[`p_${look.tone}`])} tabIndex={0}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={row.kind}
            className={styles.panelInner}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduce ? 0.12 : 0.26, ease: EASE }}
          >
            <div className={styles.head}>
              <span className={styles.bigIcon}>
                <Icon size={30} strokeWidth={2} aria-hidden />
              </span>
              <h3 className={styles.headline}>{row.headline}</h3>
              <p className={styles.summary}>{row.summary}</p>
              <p className={styles.source}>{row.product ? `Real verdict of the sample ${row.product}` : 'How Kept words it'}</p>
            </div>
            <div className={styles.body}>
              <ul className={styles.reasons}>
                {row.reasons.map((r) => {
                  const RIcon = REASON_ICON[r.tone];
                  return (
                    <li key={r.text} className={clsx(styles.reason, 'num')}>
                      <span className={clsx(styles.dot, styles[`r_${r.tone}`])}>
                        <RIcon size={13} strokeWidth={2.5} aria-hidden />
                      </span>
                      <span>
                        <span className="visually-hidden">{REASON_WORD[r.tone]}: </span>
                        {r.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.next}>
                <CalendarClock size={20} strokeWidth={1.75} aria-hidden />
                <span>{row.next}</span>
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
