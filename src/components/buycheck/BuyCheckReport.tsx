'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, CircleAlert, CopyCheck, Info, Minus, Plus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import type { BuyCheckFinding, BuyCheckResult } from '@/lib/domain';
import { MiniPrint, type ShelfItem } from '@/components/shelf';
import styles from './BuyCheck.module.css';

type HeadTone = 'better' | 'reacting' | 'flat';

export const BUY_VERDICT: Record<BuyCheckResult['verdict'], { headline: string; icon: LucideIcon; tone: HeadTone }> = {
  worth_trying: { headline: 'Worth trying', icon: CheckCircle2, tone: 'better' },
  think_twice: { headline: 'Think twice', icon: CircleAlert, tone: 'reacting' },
  already_covered: { headline: 'You already have this covered', icon: CopyCheck, tone: 'flat' },
};

const FINDING_ICON: Record<BuyCheckFinding['tone'], LucideIcon> = {
  better: TrendingUp,
  worse: TrendingDown,
  flat: Minus,
  info: Info,
};

const FINDING_WORD: Record<BuyCheckFinding['tone'], string> = {
  better: 'In favour',
  worse: 'Against',
  flat: 'Neutral',
  info: 'Note',
};

const EASE = [0.2, 0.8, 0.2, 1] as const;

export interface BuyCheckReportProps {
  result: BuyCheckResult;
  /** Product name as typed, may be empty. */
  name: string;
  /** "Salicylic Acid" → salicylic, for actives found in a pasted list. */
  tokens: Record<string, string>;
  shelf: ShelfItem[];
}

export function startHref(name: string, activeIds: string[]): string {
  const p = new URLSearchParams();
  if (name.trim()) p.set('name', name.trim());
  if (activeIds.length) p.set('actives', activeIds.join(','));
  // Commas stay readable in the address bar.
  return `/start?${p.toString().replace(/%2C/g, ',')}`;
}

export const BuyCheckReport = forwardRef<HTMLElement, BuyCheckReportProps>(function BuyCheckReport({ result, name, tokens, shelf }, ref) {
  const reduce = useReducedMotion();
  const look = BUY_VERDICT[result.verdict];
  const Icon = look.icon;
  const byId = new Map(shelf.map((it) => [it.trial.id, it]));
  const ids = result.actives.map((a) => a.id);
  const enter = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.36, ease: EASE, delay: 0.08 + i * 0.05 } };

  return (
    <section ref={ref} className={styles.report} aria-labelledby="buy-verdict" tabIndex={-1}>
      <header className={clsx(styles.reportHead, styles[look.tone])}>
        <span className={styles.reportIcon}>
          <Icon size={26} strokeWidth={2} aria-hidden />
        </span>
        <h2 id="buy-verdict" className={styles.reportHeadline}>
          {look.headline}
        </h2>
      </header>

      <div className={styles.reportBody}>
        {result.actives.length ? (
          <div className={styles.found}>
            <h3 className={styles.smallHead}>{name.trim() ? `Actives in ${name.trim()}` : 'Actives in this product'}</h3>
            <ul className={styles.pickedList}>
              {result.actives.map((a) => (
                <li key={a.id} className={styles.activeChip} title={tokens[a.id] ? `Found as “${tokens[a.id]}”` : undefined}>
                  {a.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className={styles.findings}>
          {result.findings.map((f, i) => {
            const FIcon = FINDING_ICON[f.tone];
            const trial = f.trialId ? byId.get(f.trialId) : undefined;
            return (
              <motion.li key={`${f.title}-${i}`} className={styles.finding} {...enter(i)}>
                <span className={clsx(styles.dot, styles[`r_${f.tone}`])} title={FINDING_WORD[f.tone]}>
                  <FIcon size={12} strokeWidth={2.5} aria-hidden />
                </span>
                <div className={styles.findingText}>
                  <p className={styles.findingTitle}>
                    <span className="visually-hidden">{FINDING_WORD[f.tone]}: </span>
                    {f.title}
                  </p>
                  <p className={clsx(styles.findingBody, 'num')}>{f.text}</p>
                </div>
                {f.trialId ? (
                  <Link href={`/trial/${f.trialId}`} className={styles.trialLink}>
                    {trial ? <MiniPrint src={trial.thumb} size="sm" tilt={-2} /> : null}
                    <span className={styles.trialLinkText}>
                      <span className={styles.trialLinkLabel}>See trial</span>
                      {trial ? <span className={styles.trialLinkName}>{trial.trial.product.name}</span> : null}
                    </span>
                  </Link>
                ) : null}
              </motion.li>
            );
          })}
        </ul>

        {ids.length ? (
          <div className={styles.reportActions}>
            {shelf.length === 0 ? <p className={styles.reportNote}>Start a trial when you buy it, and check-ins will show what it does for your skin.</p> : null}
            <Button href={startHref(name, ids)} icon={Plus} variant={result.verdict === 'worth_trying' ? 'primary' : 'secondary'}>
              Start a trial with this product
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
});
