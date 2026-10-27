import { activeNoun, activesFor } from './actives';
import { concernLabel, concernNoun, joinNouns } from './concerns';
import { addDays, dayOf, formatShortDate, sameLocalDay, spanText, toTime } from './dates';
import { expectedScore } from './expectation';
import { NOISE } from './noise';
import { nextCheckin } from './schedule';
import type { Active, Concern, Reason, Scan, Trial, Verdict, VerdictKind } from './types';

export const HEADLINES: Record<VerdictKind, string> = {
  too_early: 'Too early to tell',
  on_track: 'On track',
  working: 'Working',
  purging: 'Likely purging',
  reacting: 'Your skin is reacting',
  not_enough: 'Not doing enough',
};

/** Check-in photos further apart than this are not averaged. */
export const SMOOTHING_GAP_DAYS = 10;
/** Relative luminance change from day 0 that lowers confidence to medium / low. */
export const LIGHT_MEDIUM = 0.1;
export const LIGHT_LOW = 0.18;
/** Mean anchor distance (in interpupillary units) above which framing counts as off. */
export const ALIGNMENT_LIMIT = 0.08;
export const MAX_REASONS = 4;

const GUARDS: Concern[] = ['redness', 'moisture'];

export interface VerdictOptions {
  /** Override the calibrated noise (ui points). */
  noise?: number;
}

interface Change {
  concern: Concern;
  base: number;
  /** Latest value, averaged with the previous check-in when they are close in time. */
  current: number;
  delta: number;
  /** Latest check-in alone against day 0. */
  latestDelta: number;
}

const whole = (n: number) => String(Math.round(n));
const round1 = (n: number) => Math.round(n * 10) / 10;
function points(n: number): string {
  const r = Math.round(Math.abs(n));
  return r === 1 ? '1 point' : `${r} points`;
}

function byTime(a: Scan, b: Scan): number {
  return a.day - b.day || toTime(a.takenAt) - toTime(b.takenAt);
}

/** The active the timeline talks about: the one that sets the plan's onset, preferring ones with targets. */
function leadActive(actives: Active[], onsetDay: number): Active | undefined {
  const withTargets = actives.filter((a) => a.targets.length);
  const pool = withTargets.length ? withTargets : actives;
  return pool.find((a) => a.onsetDay === onsetDay) ?? pool[0];
}

function weekOf(day: number): number {
  return Math.max(1, Math.round(day / 7));
}

export function computeVerdict(trial: Trial, scans: Scan[], now: Date, options: VerdictOptions = {}): Verdict {
  const noise = options.noise ?? NOISE;
  const plan = trial.plan;
  const sorted = [...scans].sort(byTime);
  const baseline = sorted.find((s) => s.kind === 'baseline') ?? sorted[0];
  const actives = activesFor(trial.product.actives);
  const lead = leadActive(actives, plan.onsetDay);
  const checkins = baseline ? sorted.filter((s) => s !== baseline && s.day > baseline.day) : [];
  const latest = checkins[checkins.length - 1];
  const previous = checkins[checkins.length - 2];
  const smooth = latest && previous && latest.day - previous.day <= SMOOTHING_GAP_DAYS ? previous : undefined;
  const decided = trial.status === 'kept' || trial.status === 'stopped';
  const nowDay = Math.max(0, dayOf(trial, now));
  const evidenceDay = latest ? latest.day : 0;
  const displayDay = decided && latest ? evidenceDay : nowDay;

  // ---------- helpers bound to this trial ----------

  function changeFor(c: Concern): Change | undefined {
    if (!baseline || !latest) return undefined;
    const base = baseline.scores[c]?.ui;
    const last = latest.scores[c]?.ui;
    if (base === undefined || last === undefined) return undefined;
    const prev = smooth?.scores[c]?.ui;
    const current = prev === undefined ? last : (last + prev) / 2;
    return { concern: c, base, current, delta: current - base, latestDelta: last - base };
  }

  function changeReason(ch: Change, style: 'lead' | 'plain'): Reason {
    const label = concernLabel(ch.concern);
    const from = whole(ch.base);
    const to = whole(ch.current);
    const base = { concern: ch.concern, delta: round1(ch.delta) };
    if (ch.delta > noise) {
      const text =
        style === 'lead'
          ? `${label} ${from} → ${to}. That's more than the ±${noise} points we see between repeat photos`
          : `${label} ${from} → ${to}, ${points(ch.delta)} better than day 0`;
      return { ...base, text, tone: 'better' };
    }
    if (ch.delta < -noise) {
      return { ...base, text: `${label} ${from} → ${to}, ${points(ch.delta)} worse than day 0`, tone: 'worse' };
    }
    return {
      ...base,
      text: `${label} stayed within ±${noise} points (${from} → ${to}) after ${evidenceDay} days`,
      tone: 'flat',
    };
  }

  function blemishReason(): Reason | undefined {
    const a = baseline?.maskStats?.acne?.blemishCount;
    const b = latest?.maskStats?.acne?.blemishCount;
    if (a === undefined || b === undefined) return undefined;
    return {
      text: `Blemishes ${a} → ${b} on the acne map`,
      tone: b < a ? 'better' : b > a ? 'worse' : 'flat',
      concern: 'acne',
    };
  }

  function redAreaReason(): Reason | undefined {
    const a = baseline?.maskStats?.redness?.areaPct;
    const b = latest?.maskStats?.redness?.areaPct;
    if (a === undefined || b === undefined || Math.abs(a - b) < 1) return undefined;
    return {
      text: `Red area ${whole(a)}% → ${whole(b)}% on the redness map`,
      tone: b < a ? 'better' : 'worse',
      concern: 'redness',
    };
  }

  function maskReasons(): Reason[] {
    const out: Reason[] = [];
    const tracked = [...trial.targets, ...trial.watch];
    if (tracked.includes('acne')) {
      const r = blemishReason();
      if (r) out.push(r);
    }
    if (tracked.includes('redness')) {
      const r = redAreaReason();
      if (r) out.push(r);
    }
    return out;
  }

  function dayInfo(): Reason {
    const d = displayDay;
    const full = plan.fullEffectDay;
    let text: string;
    if (!lead) text = d > full ? `Day ${d}. The plan covered ${full} days` : `Day ${d} of ${full}`;
    else if (d < plan.onsetDay)
      text = `Day ${d} of ${full}. ${lead.name} usually shows first changes after ${spanText(plan.onsetDay)}`;
    else if (d < full) text = `Day ${d} of ${full}. ${lead.name} usually reaches its full effect by ${spanText(full)}`;
    else if (d === full) text = `Day ${d} of ${full}. That's the full course for ${activeNoun(lead)}`;
    else text = `Day ${d}. The full course for ${activeNoun(lead)} is ${full} days`;
    return { text, tone: 'info' };
  }

  function checkinStep(): Verdict['next'] {
    const slot = nextCheckin(trial, sorted, now);
    if (!slot) return { action: 'checkin', label: 'Check in when you are ready' };
    const due = toTime(slot.date) <= now.getTime() || sameLocalDay(slot.date, now);
    return {
      action: 'checkin',
      label: due ? 'Check in today' : `Next check-in on ${formatShortDate(slot.date)}`,
      date: slot.date,
    };
  }

  // ---------- confidence ----------

  let confidence: Verdict['confidence'] = 'high';
  const caveats: Reason[] = [];
  const lower = (to: 'medium' | 'low') => {
    if (to === 'low' || confidence === 'high') confidence = to;
  };

  const confounder = checkins.find((s) => s.diary?.newProduct);
  if (confounder) {
    lower('low');
    caveats.push({
      text: `You started another product on day ${confounder.day}. Changes after that may not be from this one`,
      tone: 'info',
    });
  }

  const baseLum = baseline?.capture?.luminance;
  const used = [latest, smooth].filter((s): s is Scan => Boolean(s));
  if (baseLum && baseLum > 0) {
    let worst: { scan: Scan; dev: number } | undefined;
    for (const s of used) {
      const lum = s.capture?.luminance;
      if (!lum || lum <= 0) continue;
      const dev = (lum - baseLum) / baseLum;
      if (!worst || Math.abs(dev) > Math.abs(worst.dev)) worst = { scan: s, dev };
    }
    if (worst && Math.abs(worst.dev) >= LIGHT_MEDIUM) {
      lower(Math.abs(worst.dev) > LIGHT_LOW ? 'low' : 'medium');
      const pct = Math.round(Math.abs(worst.dev) * 100);
      caveats.push({
        text: `The light in your day ${worst.scan.day} photo is ${pct}% ${worst.dev > 0 ? 'brighter' : 'darker'} than on day 0, so scores may shift`,
        tone: 'info',
      });
    }
  }

  const misaligned = used.find((s) => s.capture?.alignment !== undefined && s.capture.alignment > ALIGNMENT_LIMIT);
  if (misaligned) {
    lower('medium');
    caveats.push({
      text: `Your day ${misaligned.day} photo is framed differently from day 0, so compare it with care`,
      tone: 'info',
    });
  }

  function finish(kind: VerdictKind, summary: string, primary: Reason[], next: Verdict['next']): Verdict {
    const room = Math.max(1, MAX_REASONS - caveats.length);
    const seen = new Set<string>();
    const reasons: Reason[] = [];
    for (const r of [...primary.slice(0, room), ...caveats]) {
      if (reasons.length >= MAX_REASONS || seen.has(r.text)) continue;
      seen.add(r.text);
      reasons.push(r);
    }
    if (reasons.length < 2) {
      const info = dayInfo();
      if (!seen.has(info.text)) reasons.push(info);
    }
    return { kind, headline: HEADLINES[kind], summary, reasons, confidence, next };
  }

  // ---------- no evidence yet ----------

  if (!baseline) {
    return finish(
      'too_early',
      'Take your day 0 photo so there is something to compare with.',
      [{ text: 'Every check-in is compared with your day 0 photo', tone: 'info' }],
      { action: 'checkin', label: 'Take baseline photo' },
    );
  }

  const targetChanges = trial.targets.map(changeFor).filter((c): c is Change => Boolean(c));
  const meanDelta = targetChanges.length
    ? targetChanges.reduce((s, c) => s + c.delta, 0) / targetChanges.length
    : 0;
  const improved = targetChanges.filter((c) => c.delta > noise).sort((a, b) => b.delta - a.delta);
  const inPurgeWindow =
    Boolean(latest) && plan.purge !== undefined && evidenceDay >= plan.purge.fromDay && evidenceDay <= plan.purge.toDay;

  // ---------- reacting ----------

  if (latest) {
    const reactions = GUARDS.filter((c) => trial.watch.includes(c))
      .map(changeFor)
      .filter((ch): ch is Change => Boolean(ch))
      .filter((ch) => (ch.delta < -noise && !inPurgeWindow) || ch.latestDelta < -2 * noise)
      .sort((a, b) => Math.min(a.delta, a.latestDelta) - Math.min(b.delta, b.latestDelta));

    if (reactions.length) {
      const primary: Reason[] = reactions.map((ch) => {
        const drop = Math.min(ch.delta, ch.latestDelta);
        const text =
          ch.concern === 'moisture'
            ? `Hydration dropped ${points(drop)} since day 0. That often means the product is drying your skin`
            : `${concernLabel(ch.concern)} got ${points(drop)} worse since day 0. That often means the product is irritating your skin`;
        return { text, tone: 'worse', concern: ch.concern, delta: round1(drop) };
      });
      primary.push(...maskReasons().filter((r) => r.tone === 'worse'));
      primary.push(...targetChanges.map((c) => changeReason(c, 'plain')));

      const twiceInARow =
        previous !== undefined &&
        reactions.some((ch) => {
          const b = baseline.scores[ch.concern]?.ui;
          const p = previous.scores[ch.concern]?.ui;
          return b !== undefined && p !== undefined && p - b < -noise;
        });
      const retry = addDays(now, 7);
      const next: Verdict['next'] = twiceInARow
        ? { action: 'decide_stop', label: 'Time to stop this product' }
        : {
            action: 'reduce_use',
            label: `Use it every other night and check in on ${formatShortDate(retry)}`,
            date: retry,
          };
      const nouns = joinNouns(reactions.map((c) => concernNoun(c.concern)));
      return finish('reacting', `Your ${nouns} got worse since day 0, which often points to irritation.`, primary, next);
    }
  }

  // ---------- purging ----------

  const acne = changeFor('acne');
  const redness = changeFor('redness');
  if (inPurgeWindow && plan.purge && acne && acne.delta < -noise && !(redness && redness.delta < -2 * noise)) {
    const culprit = actives.find((a) => a.purge && evidenceDay >= a.purge.fromDay && evidenceDay <= a.purge.toDay);
    const window = culprit?.purge ?? plan.purge;
    const who = culprit ? culprit.name : 'This kind of product';
    const primary: Reason[] = [
      {
        text: `Acne is up on day ${evidenceDay}. ${who} often causes a short purge in weeks ${weekOf(window.fromDay)} to ${Math.max(weekOf(window.fromDay), weekOf(window.toDay))}`,
        tone: 'worse',
        concern: 'acne',
        delta: round1(acne.delta),
      },
    ];
    const blem = blemishReason();
    if (blem) primary.push(blem);
    primary.push(...targetChanges.filter((c) => c.concern !== 'acne').map((c) => changeReason(c, 'plain')));
    primary.push(dayInfo());

    const resumeDay = Math.min(plan.purge.toDay + 7, plan.fullEffectDay);
    const next: Verdict['next'] =
      resumeDay > nowDay
        ? {
            action: 'keep_going',
            label: `Keep going and check in on day ${resumeDay}`,
            date: addDays(trial.startedAt, resumeDay),
          }
        : checkinStep();
    return finish(
      'purging',
      'A short breakout is common at this stage and usually settles as your skin adjusts.',
      primary,
      next,
    );
  }

  // ---------- too early ----------

  if (!latest || evidenceDay < plan.onsetDay) {
    const primary: Reason[] = [dayInfo()];
    if (!latest) primary.push({ text: 'Every check-in is compared with your day 0 photo', tone: 'info' });
    primary.push(...[...targetChanges].sort((a, b) => b.delta - a.delta).map((c) => changeReason(c, 'plain')));
    const summary = lead
      ? `It's day ${displayDay}, and ${activeNoun(lead)} usually needs about ${spanText(plan.onsetDay)} before skin changes.`
      : 'Skin needs a few weeks to change, so keep using it as usual.';
    return finish('too_early', summary, primary, checkinStep());
  }

  // ---------- working ----------

  if (targetChanges.length && meanDelta >= noise && improved.length) {
    const rest = targetChanges.filter((c) => !improved.includes(c));
    const watchWorse = trial.watch
      .map(changeFor)
      .filter((c): c is Change => Boolean(c) && (c as Change).delta < -noise);
    const primary: Reason[] = [
      ...improved.map((c, i) => changeReason(c, i === 0 ? 'lead' : 'plain')),
      ...maskReasons(),
      ...rest.map((c) => changeReason(c, 'plain')),
      ...watchWorse.map((c) => changeReason(c, 'plain')),
    ];
    const atFull = evidenceDay >= plan.fullEffectDay;
    let next: Verdict['next'] = { action: 'decide_keep', label: 'Keep this product' };
    if (!atFull && !decided) {
      const step = checkinStep();
      if (step.date) next = step;
    }
    const nouns = joinNouns(improved.map((c) => concernNoun(c.concern)));
    return finish(
      'working',
      `Your ${nouns} improved by more than the difference between repeat photos.`,
      primary,
      next,
    );
  }

  // ---------- not enough ----------

  if (evidenceDay >= plan.fullEffectDay) {
    const primary: Reason[] = [
      ...[...targetChanges].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((c) => changeReason(c, 'plain')),
      ...maskReasons(),
      dayInfo(),
    ];
    const nouns = joinNouns(trial.targets.map(concernNoun));
    return finish(
      'not_enough',
      `After ${evidenceDay} days your ${nouns || 'skin'} changed no more than repeat photos do.`,
      primary,
      { action: 'decide_stop', label: 'Time to stop this product' },
    );
  }

  // ---------- on track ----------

  const primary: Reason[] = [];
  for (const c of trial.targets) {
    const ch = changeFor(c);
    const expected = expectedScore(trial, baseline, c, evidenceDay);
    if (!ch || expected === null) continue;
    const diff = ch.current - expected;
    const label = concernLabel(c);
    if (Math.abs(diff) < 1) {
      primary.push({ text: `${label} is right on the expected curve for day ${evidenceDay}`, tone: 'flat', concern: c, delta: round1(diff) });
    } else {
      primary.push({
        text: `${label} is ${points(diff)} ${diff > 0 ? 'ahead of' : 'behind'} the expected curve for day ${evidenceDay}`,
        tone: diff > 0 ? 'better' : 'info',
        concern: c,
        delta: round1(diff),
      });
    }
    break;
  }
  primary.push(...[...targetChanges].sort((a, b) => b.delta - a.delta).map((c) => changeReason(c, 'plain')));
  primary.push(...maskReasons());
  primary.push(dayInfo());
  const summary =
    meanDelta > 0
      ? 'Your skin is moving the right way, though not yet past the difference between repeat photos.'
      : `No clear change yet, which is normal before day ${plan.fullEffectDay}.`;
  return finish('on_track', summary, primary, checkinStep());
}
