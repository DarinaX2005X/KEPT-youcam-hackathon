import {
  activesFor,
  concernLabel,
  dayOf,
  expectedScore,
  NOISE,
  type Concern,
  type Scan,
  type Trial,
  type Verdict,
} from '@/lib/domain';
import type { Tone } from '@/components/ui';
import { baselineOf, concernTone, formatDelta, sortScans } from '@/components/trial/model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 6, 2026": a printed report outlives the current year. */
export function formatLongDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export interface ReportFrames {
  baseline?: Scan;
  /** The last check-in, when there is one. */
  latest?: Scan;
}

export function reportFrames(scans: readonly Scan[]): ReportFrames {
  const baseline = baselineOf(scans);
  const checkins = sortScans(scans).filter((s) => s !== baseline && s.kind === 'checkin');
  return { baseline, latest: checkins[checkins.length - 1] };
}

export interface ZoneRow {
  concern: Concern;
  label: string;
  group: 'goal' | 'watch';
  base?: number;
  last?: number;
  delta?: number;
  tone?: Tone;
  /** Expected score on the latest day for a goal with a target. */
  expected?: number;
  /** Mask detail under the label: «Blemishes 16 → 34», «Red area 1% → 3%». */
  detail?: string;
}

export function zoneRows(trial: Trial, scans: readonly Scan[], verdict: Verdict): ZoneRow[] {
  const { baseline, latest } = reportFrames(scans);
  const rows: ZoneRow[] = [];
  const seen = new Set<Concern>();
  const add = (c: Concern, group: ZoneRow['group']) => {
    if (seen.has(c)) return;
    seen.add(c);
    const base = baseline?.scores[c]?.ui;
    const last = latest?.scores[c]?.ui;
    const row: ZoneRow = { concern: c, label: concernLabel(c), group, base, last };
    if (base !== undefined && last !== undefined) {
      row.delta = last - base;
      row.tone = concernTone(row.delta, c, verdict);
    }
    if (group === 'goal' && baseline) {
      const e = expectedScore(trial, baseline, c, latest?.day ?? trial.plan.fullEffectDay);
      if (e !== null) row.expected = Math.round(e);
    }
    if (c === 'acne') {
      const a = baseline?.maskStats?.acne?.blemishCount;
      const b = latest?.maskStats?.acne?.blemishCount;
      if (a !== undefined && b !== undefined) row.detail = `Blemishes ${a} → ${b}`;
    }
    if (c === 'redness') {
      const a = baseline?.maskStats?.redness?.areaPct;
      const b = latest?.maskStats?.redness?.areaPct;
      if (a !== undefined && b !== undefined) row.detail = `Red area ${a.toFixed(1)}% → ${b.toFixed(1)}%`;
    }
    rows.push(row);
  };
  trial.targets.forEach((c) => add(c, 'goal'));
  trial.watch.forEach((c) => add(c, 'watch'));
  return rows;
}

/** «Day 21 of 84», or «56-day trial» once decided. */
export function progressText(trial: Trial, now: Date): string {
  if ((trial.status === 'kept' || trial.status === 'stopped') && trial.decidedAt) {
    return `${Math.max(0, dayOf(trial, trial.decidedAt))}-day trial`;
  }
  return `Day ${Math.max(0, dayOf(trial, now))} of ${trial.plan.fullEffectDay}`;
}

export function decisionText(trial: Trial, verdict: Verdict): string {
  if (trial.status === 'kept' || trial.status === 'stopped') {
    const word = trial.status === 'kept' ? 'Kept' : 'Stopped';
    return trial.decidedAt ? `${word} on ${formatLongDate(trial.decidedAt)}` : word;
  }
  if (trial.status === 'paused') return 'Paused';
  if (verdict.next.date && verdict.next.action === 'checkin') return `Next check-in on ${formatLongDate(verdict.next.date)}`;
  return verdict.next.label;
}

function change(rows: ZoneRow[]): string {
  return rows
    .map((r) =>
      r.base !== undefined && r.last !== undefined && r.delta !== undefined
        ? `${r.label} ${r.base} → ${r.last} (${formatDelta(r.delta)})`
        : r.base !== undefined
          ? `${r.label} ${r.base} on day 0`
          : r.label,
    )
    .join(', ');
}

/** Five lines for «Copy summary». */
export function summaryText(trial: Trial, scans: readonly Scan[], verdict: Verdict, now: Date): string {
  const rows = zoneRows(trial, scans, verdict);
  const actives = activesFor(trial.product.actives).map((a) => a.name);
  const { latest } = reportFrames(scans);
  const goals = rows.filter((r) => r.group === 'goal');
  const watch = rows.filter((r) => r.group === 'watch');
  const lines = [
    `${trial.product.name}: ${verdict.headline}, ${progressText(trial, now).replace(/^D/, 'd')}`,
    `${actives.length ? `Actives: ${actives.join(', ')}. ` : ''}Started ${formatLongDate(trial.startedAt)}`,
    latest ? `Goals on day ${latest.day}: ${change(goals)}` : `Goals: ${goals.map((g) => g.label).join(', ')}. No check-ins yet`,
    watch.length ? `Watched for irritation: ${change(watch)}` : `Measured with YouCam AI Skin Analysis, ±${NOISE} points between repeat photos`,
    trial.status === 'kept' || trial.status === 'stopped' ? `Decision: ${decisionText(trial, verdict)}` : `Next: ${decisionText(trial, verdict)}`,
  ];
  return lines.join('\n');
}
