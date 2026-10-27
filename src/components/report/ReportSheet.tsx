'use client';

import clsx from 'clsx';
import { Info, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { activesFor, NOISE, type Reason, type Scan, type Trial, type Verdict } from '@/lib/domain';
import { Logo } from '@/components/shell';
import { PhotoPrint, Tag, TONE_WORD } from '@/components/ui';
import { TrendChart, VERDICT_LOOK, formatDelta, type TrialUrls } from '@/components/trial';
import { splitReasons } from '@/components/trial/model';
import { decisionText, formatLongDate, progressText, reportFrames, zoneRows } from './reportModel';
import styles from './Report.module.css';

const REASON_ICON: Record<Reason['tone'], LucideIcon> = {
  better: TrendingUp,
  worse: TrendingDown,
  flat: Minus,
  info: Info,
};

export interface ReportSheetProps {
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
  urls: TrialUrls;
  now: Date;
  className?: string;
}

/** One A4 page: the trial's photos, numbers, chart and verdict. Same layout on screen and on paper. */
export function ReportSheet({ trial, scans, verdict, urls, now, className }: ReportSheetProps) {
  const { baseline, latest } = reportFrames(scans);
  const rows = zoneRows(trial, scans, verdict);
  const actives = activesFor(trial.product.actives);
  const look = VERDICT_LOOK[verdict.kind];
  const Icon = look.icon;
  const { reasons, caveats } = splitReasons(verdict);
  const decided = trial.status === 'kept' || trial.status === 'stopped';
  const lastDay = latest?.day;
  const chartConcern = trial.targets[0] ?? trial.watch[0];
  const goals = rows.filter((r) => r.group === 'goal');
  const watch = rows.filter((r) => r.group === 'watch');

  const basePhoto = baseline ? urls.photo[baseline.id] : undefined;
  const lastPhoto = latest ? urls.photo[latest.id] : undefined;

  function rowView(r: (typeof rows)[number]) {
    return (
      <tr key={r.concern}>
        <th scope="row">
          <span className={styles.area}>{r.label}</span>
          {r.detail ? <span className={styles.detail}>{r.detail}</span> : null}
        </th>
        <td>{r.base ?? ''}</td>
        {latest ? <td>{r.last ?? ''}</td> : null}
        {latest ? (
          <td>
            {r.delta !== undefined && r.tone ? (
              <span className={clsx(styles.delta, styles[`d_${r.tone}`])}>
                {formatDelta(r.delta)}
                <span className="visually-hidden">, {TONE_WORD[r.tone]}</span>
              </span>
            ) : null}
          </td>
        ) : null}
        <td className={styles.expected}>
          {r.group === 'watch' ? `Within ±${NOISE}` : r.expected !== undefined ? r.expected : 'No target'}
        </td>
      </tr>
    );
  }

  return (
    <article className={clsx(styles.sheet, className)} aria-label={`Trial report for ${trial.product.name}`}>
      <header className={styles.sheetHead}>
        <Logo size={26} />
        <p className={styles.made}>
          <span className={styles.madeTitle}>Trial report</span>
          <span className="num">Made on {formatLongDate(now)}</span>
        </p>
      </header>

      <h1 className={styles.product}>{trial.product.name}</h1>

      <div className={styles.top}>
        <div className={styles.prints}>
          {basePhoto ? (
            <PhotoPrint src={basePhoto} alt="Day 0 photo" label="Day 0" sublabel={formatLongDate(trial.startedAt)} priority className={styles.print} />
          ) : null}
          {lastPhoto && latest ? (
            <PhotoPrint
              src={lastPhoto}
              alt={`Day ${latest.day} photo`}
              label={`Day ${latest.day}`}
              sublabel={formatLongDate(latest.takenAt)}
              priority
              className={styles.print}
            />
          ) : null}
          {urls.target ? (
            <PhotoPrint
              src={urls.target}
              alt="Simulated target"
              label="Target"
              sublabel={`Day ${trial.plan.fullEffectDay} if it works`}
              variant="target"
              priority
              className={styles.print}
            />
          ) : null}
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Actives</dt>
            <dd>{actives.length ? actives.map((a) => a.name).join(', ') : 'Not listed'}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd className="num">{formatLongDate(trial.startedAt)}</dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd className="num">{progressText(trial, now)}</dd>
          </div>
          <div>
            <dt>Check-ins</dt>
            <dd className="num">{scans.filter((s) => s.kind === 'checkin').length}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Tag status={trial.status} />
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.middle}>
        <section className={styles.verdict} aria-label="Verdict">
          <div className={clsx(styles.verdictHead, styles[`v_${look.tone}`])}>
            <span className={styles.verdictIcon}>
              <Icon size={20} strokeWidth={2} aria-hidden />
            </span>
            <h2 className={styles.verdictTitle}>{verdict.headline}</h2>
          </div>
          <p className={styles.verdictSummary}>{verdict.summary}</p>
          <ul className={styles.reasons}>
            {reasons.map((r) => {
              const RIcon = REASON_ICON[r.tone];
              return (
                <li key={r.text}>
                  <span className={clsx(styles.dot, styles[`r_${r.tone}`])} aria-hidden>
                    <RIcon size={11} strokeWidth={2.5} />
                  </span>
                  <span className="num">{r.text}</span>
                </li>
              );
            })}
          </ul>
          {verdict.confidence !== 'high' ? (
            <p className={styles.caveat}>
              <strong>{verdict.confidence === 'low' ? 'Low confidence. ' : 'Less certain. '}</strong>
              {caveats.length ? caveats.map((c) => c.text).join('. ') : 'This photo differs from day 0, so small changes are less certain'}
            </p>
          ) : null}
          <p className={styles.decision}>
            <span>{decided ? 'Decision' : 'Next'}</span>
            {decisionText(trial, verdict)}
          </p>
        </section>

        {chartConcern ? (
          <TrendChart trial={trial} scans={scans} concern={chartConcern} now={decided ? undefined : now} staticMode className={styles.chart} />
        ) : null}
      </div>

      <table className={clsx(styles.table, 'num')}>
        <caption className="visually-hidden">Scores by area, day 0 against the latest check-in</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Day 0</th>
            {latest ? <th scope="col">Day {lastDay}</th> : null}
            {latest ? <th scope="col">Change</th> : null}
            <th scope="col">Expected{latest ? ` on day ${lastDay}` : ` by day ${trial.plan.fullEffectDay}`}</th>
          </tr>
        </thead>
        <tbody>
          {goals.length ? (
            <tr className={styles.group}>
              <th scope="rowgroup" colSpan={latest ? 5 : 3}>
                Goals
              </th>
            </tr>
          ) : null}
          {goals.map(rowView)}
          {watch.length ? (
            <tr className={styles.group}>
              <th scope="rowgroup" colSpan={latest ? 5 : 3}>
                Watched for irritation
              </th>
            </tr>
          ) : null}
          {watch.map(rowView)}
        </tbody>
      </table>

      <footer className={styles.sheetFoot}>
        <p>
          Measured with YouCam AI Skin Analysis. Photos taken with Kept&apos;s capture guide; repeat photos vary by ±{NOISE} points. Scores run
          from 0 to 100, higher is better.
        </p>
        <p>
          Kept compares photos of your skin. It is not a medical diagnosis.
          {trial.sample ? ' Sample trial. Face generated with YouCam AI.' : ''}
        </p>
      </footer>
    </article>
  );
}
