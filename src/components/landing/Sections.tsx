import clsx from 'clsx';
import { Button, Tag } from '@/components/ui';
import { AlertTriangle, CheckCircle2, Hourglass, MinusCircle, RefreshCw, TrendingUp, type LucideIcon } from 'lucide-react';
import type { VerdictKind } from '@/lib/domain';
import { BuyReportPreview } from './BuyReportPreview';
import { MiniPrint } from '@/components/shelf/MiniPrint';
import type { BuyCheckData, VerdictRow, WorkspaceData } from './data';
import { Reveal } from './Reveal';
import { WorkspacePreview } from './WorkspacePreview';
import styles from './Sections.module.css';

/** Same icons and tones as VerdictCard (VERDICT_LOOK lives in a client module, so this server list repeats it). */
const VERDICT_LOOK: Record<VerdictKind, { icon: LucideIcon; tone: 'better' | 'worse' | 'reacting' | 'flat' }> = {
  too_early: { icon: Hourglass, tone: 'flat' },
  on_track: { icon: TrendingUp, tone: 'better' },
  working: { icon: CheckCircle2, tone: 'better' },
  purging: { icon: RefreshCw, tone: 'reacting' },
  reacting: { icon: AlertTriangle, tone: 'worse' },
  not_enough: { icon: MinusCircle, tone: 'flat' },
};

export function TrialSection({ data }: { data: WorkspaceData }) {
  return (
    <section className={clsx(styles.section, styles.trialSection)} aria-labelledby="trial-title">
      <div className={styles.wrap}>
        <Reveal className={styles.sectionHead}>
          <div className={styles.headText}>
            <h2 id="trial-title" className={styles.h2}>
              What a trial looks like
            </h2>
            <p className={styles.lead}>
              This is the trial page for the {data.trial.product.name} above, with all {data.scans.length} photos. Drag the divider on the face to compare day 0
              with day {data.scans[data.scans.length - 1]?.day}.
            </p>
          </div>
          <Button href="/demo" variant="secondary" size="lg">
            Open this trial
          </Button>
        </Reveal>
        <Reveal>
          <WorkspacePreview data={data} />
        </Reveal>
      </div>
    </section>
  );
}

export function VerdictsSection({ rows }: { rows: VerdictRow[] }) {
  return (
    <section className={styles.section} aria-labelledby="verdicts-title">
      <div className={styles.wrap}>
        <Reveal>
          <h2 id="verdicts-title" className={styles.h2}>
            Verdicts you can act on
          </h2>
        </Reveal>
        <ul className={styles.verdictList}>
          {rows.map((r, i) => {
            const look = VERDICT_LOOK[r.kind];
            const Icon = look.icon;
            return (
              <li key={r.kind}>
                <Reveal delay={Math.min(i, 5) * 0.05} className={styles.verdictRow}>
                  <div className={styles.verdictName}>
                    <span className={clsx(styles.verdictIcon, styles[`tone_${look.tone}`])}>
                      <Icon size={22} strokeWidth={2} aria-hidden />
                    </span>
                    <h3 className={styles.verdictHeadline}>{r.headline}</h3>
                  </div>
                  <p className={clsx(styles.verdictExample, 'num')}>{r.example}</p>
                  <p className={styles.verdictNext}>{r.next}</p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function BuySection({ data }: { data: BuyCheckData }) {
  return (
    <section className={clsx(styles.section, styles.buySection)} aria-labelledby="buy-title">
      <div className={clsx(styles.wrap, styles.buyGrid)}>
        <Reveal className={styles.buyText}>
          <h2 id="buy-title" className={styles.h2}>
            Before you buy
          </h2>
          <p className={styles.lead}>
            Paste the ingredient list of a product you are about to buy. Kept compares its actives with what you already tested and with your latest scores, so
            you don&apos;t pay twice for something that never worked for you.
          </p>
          <Button href="/buy-check" variant="secondary" size="lg">
            Check a product
          </Button>
        </Reveal>
        <Reveal className={styles.buyDesk} delay={0.08}>
          <div className={styles.inciSlip} aria-hidden>
            <span className={styles.inciName}>{data.name}</span>
            <span className={styles.inciText}>{data.inci}</span>
          </div>
          <div className={styles.buyReport} inert>
            <BuyReportPreview result={data.result} name={data.name} tokens={{}} shelf={data.shelf} />
          </div>
          <div className={styles.buyFade} aria-hidden />
        </Reveal>
      </div>
    </section>
  );
}

export function Closing({ shelf }: { shelf: BuyCheckData['shelf'] }) {
  const items = [...shelf].sort((a, b) => order(a.trial.status) - order(b.trial.status));
  return (
    <section className={clsx(styles.section, styles.closing)} aria-labelledby="closing-title">
      <Reveal className={clsx(styles.wrap, styles.closingInner)}>
        <ul className={styles.closingShelf} aria-label="Sample shelf">
          {items.map((it, i) => (
            <li key={it.trial.id} style={{ rotate: `${[-3, 1.5, -1][i % 3]}deg` }}>
              <MiniPrint src={it.thumb} size="md" />
              <Tag status={it.trial.status} />
            </li>
          ))}
        </ul>
        <h2 id="closing-title" className={styles.closingTitle}>
          Your shelf, proven on your skin
        </h2>
        <Button href="/start" variant="primary" size="lg">
          Start a trial
        </Button>
      </Reveal>
    </section>
  );
}

function order(status: string) {
  return status === 'kept' ? 0 : status === 'testing' ? 1 : 2;
}
