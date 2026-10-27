import { activeNoun, activesFor } from './actives';
import { concernIsPlural, concernNoun, joinNouns } from './concerns';
import { dayOf, spanText, toTime } from './dates';
import { parseInci } from './inci';
import { computeVerdict } from './verdict';
import type { Active, BuyCheckFinding, BuyCheckInput, BuyCheckResult, Concern, Scan, Trial } from './types';

/** A target this good leaves little to improve. */
export const ALREADY_GOOD = 80;
/** A target this low or lower has room for a visible change. */
export const ROOM_TO_IMPROVE = 65;

function isStrongRetinoid(a: Active): boolean {
  return a.group === 'retinoid' && a.irritation !== 'low';
}

/** Retinoid together with an AHA/BHA, benzoyl peroxide or a second strong retinoid. */
function clashes(a: Active, b: Active): boolean {
  const partner = (x: Active) => x.group === 'exfoliant' || x.id === 'benzoyl_peroxide' || isStrongRetinoid(x);
  return (isStrongRetinoid(a) && partner(b)) || (isStrongRetinoid(b) && partner(a));
}

/** Latest ui score per concern across every scan the user has. */
function latestScores(scansByTrial: Record<string, Scan[]>): Partial<Record<Concern, number>> {
  const best: Partial<Record<Concern, { t: number; ui: number }>> = {};
  for (const scans of Object.values(scansByTrial)) {
    for (const s of scans) {
      const t = toTime(s.takenAt);
      for (const [c, score] of Object.entries(s.scores) as [Concern, { ui: number } | undefined][]) {
        if (!score) continue;
        const cur = best[c];
        if (!cur || t > cur.t) best[c] = { t, ui: score.ui };
      }
    }
  }
  const out: Partial<Record<Concern, number>> = {};
  for (const [c, v] of Object.entries(best) as [Concern, { ui: number }][]) out[c] = v.ui;
  return out;
}

function lastScanDay(trial: Trial, scans: Scan[]): number | undefined {
  if (trial.decidedAt) return dayOf(trial, trial.decidedAt);
  return scans.length ? Math.max(...scans.map((s) => s.day)) : undefined;
}

function trialState(trial: Trial, scans: Scan[], now: Date): string {
  if (trial.status === 'kept') {
    const d = lastScanDay(trial, scans);
    return d === undefined ? 'kept' : `kept after ${d} days`;
  }
  if (trial.status === 'paused') return 'paused';
  return `testing, day ${Math.max(0, dayOf(trial, now))}`;
}

function scoreText(c: Concern, ui: number, already: boolean): string {
  const verb = concernIsPlural(c) ? 'score' : 'scores';
  return `your ${concernNoun(c)} ${already ? 'already ' : ''}${verb} ${Math.round(ui)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Checks a product before buying it against the user's shelf and latest scores. Rules:
 * 1) an active already in a testing, paused or kept trial: already covered;
 * 2) an active from a stopped trial that ended "not doing enough" or "reacting": think twice;
 * 3) every scored target of an active at 80 or more: think twice, not a problem for you;
 * 4) a scored target at 65 or less with no conflicts: worth trying;
 * 5) a strong retinoid together with an AHA/BHA, benzoyl peroxide or another retinoid being tested: think twice;
 * 6) only sunscreen filters: worth trying, prevention.
 * Without scans it decides by ingredients and trials only. `now` is used for "day N" of running trials.
 */
export function buyCheck(
  input: BuyCheckInput,
  trials: Trial[],
  scansByTrial: Record<string, Scan[]>,
  now: Date = new Date(),
): BuyCheckResult {
  const ids = [...(input.activeIds ?? [])];
  if (input.inci) for (const id of parseInci(input.inci).actives) if (!ids.includes(id)) ids.push(id);
  const actives = activesFor(ids);
  const findings: BuyCheckFinding[] = [];
  const scansOf = (t: Trial) => scansByTrial[t.id] ?? [];

  if (!actives.length) {
    return {
      actives,
      findings: [
        {
          tone: 'info',
          title: 'No known actives',
          text: "We didn't find an ingredient we can track in this list. Check the spelling or pick the active by hand",
        },
      ],
      verdict: 'think_twice',
    };
  }

  const scores = latestScores(scansByTrial);
  const covered = new Set<string>();
  let doubt = false;
  let promising = false;

  for (const a of actives) {
    // 1) already on the shelf
    const owner = trials.find(
      (t) => (t.status === 'testing' || t.status === 'kept' || t.status === 'paused') && t.product.actives.includes(a.id),
    );
    if (owner) {
      covered.add(a.id);
      findings.push({
        tone: 'info',
        title: 'Already on your shelf',
        text: `You already use ${activeNoun(a)} in ${owner.product.name} (${trialState(owner, scansOf(owner), now)})`,
        trialId: owner.id,
      });
      continue;
    }

    // 2) tried and stopped
    let failedBefore = false;
    for (const t of trials) {
      if (t.status !== 'stopped' || !t.product.actives.includes(a.id)) continue;
      const scans = scansOf(t);
      if (!scans.length) continue;
      const at = t.decidedAt ?? scans.reduce((m, s) => (toTime(s.takenAt) > toTime(m) ? s.takenAt : m), scans[0].takenAt);
      const v = computeVerdict(t, scans, new Date(toTime(at)));
      const days = Math.max(...scans.map((s) => s.day));
      if (v.kind === 'not_enough') {
        failedBefore = true;
        findings.push({
          tone: 'worse',
          title: "Didn't work for you before",
          text: `${a.name} didn't change your ${joinNouns(t.targets.map(concernNoun), 'or')} in ${days} days`,
          trialId: t.id,
        });
        break;
      }
      if (v.kind === 'reacting') {
        failedBefore = true;
        findings.push({
          tone: 'worse',
          title: 'Your skin reacted before',
          text: `Your skin reacted to ${t.product.name}, which also had ${activeNoun(a)}`,
          trialId: t.id,
        });
        break;
      }
    }
    if (failedBefore) doubt = true;

    if (a.prevention) continue;

    // 3) and 4) by the latest scores
    const scored = a.targets.filter((c) => scores[c] !== undefined);
    if (scored.length && scored.every((c) => (scores[c] as number) >= ALREADY_GOOD)) {
      doubt = true;
      const parts = scored.map((c) => scoreText(c, scores[c] as number, false));
      const first = scoreText(scored[0], scores[scored[0]] as number, true);
      findings.push({
        tone: 'flat',
        title: 'Not a problem for you',
        text:
          scored.length === 1
            ? `${cap(first)}. This product targets something that isn't a problem for you`
            : `${cap(joinNouns(parts))}. This product targets things that aren't a problem for you`,
      });
    } else if (!failedBefore) {
      const low = scored.filter((c) => (scores[c] as number) <= ROOM_TO_IMPROVE).sort((x, y) => (scores[x] as number) - (scores[y] as number));
      if (low.length) {
        promising = true;
        findings.push({
          tone: 'better',
          title: 'Room to improve',
          text: `${cap(scoreText(low[0], scores[low[0]] as number, false))} on your last scan, so there is room for a visible change. ${a.name} usually shows first changes after ${spanText(a.onsetDay)}`,
        });
      }
    }
  }

  // 5) clashes with a trial in progress
  for (const t of trials) {
    if (t.status !== 'testing' && t.status !== 'paused') continue;
    const theirs = activesFor(t.product.actives);
    if (actives.some((a) => !covered.has(a.id) && theirs.some((b) => b.id !== a.id && clashes(a, b)))) {
      doubt = true;
      findings.push({
        tone: 'worse',
        title: 'May irritate together',
        text: `Using this with ${t.product.name} at the same time can irritate. Start it after that trial ends`,
        trialId: t.id,
      });
    }
  }

  // 6) sunscreen only
  if (actives.every((a) => a.prevention) && !covered.size) {
    promising = true;
    findings.push({
      tone: 'info',
      title: 'Protection, not a quick change',
      text: "Sunscreen prevents damage rather than changing your skin in weeks. Kept shows its long term effect with an aging preview instead of a trial",
    });
  }

  let verdict: BuyCheckResult['verdict'];
  if (actives.every((a) => covered.has(a.id))) verdict = 'already_covered';
  else if (doubt) verdict = 'think_twice';
  else verdict = 'worth_trying';

  if (verdict === 'worth_trying' && !promising) {
    const lead = actives.find((a) => !a.prevention && !covered.has(a.id));
    if (lead) {
      findings.push({
        tone: 'info',
        title: 'New for your skin',
        text: `${lead.name} usually shows first changes after ${spanText(lead.onsetDay)}. A trial will show if it works for you`,
      });
    }
  }

  return { actives, findings, verdict };
}
