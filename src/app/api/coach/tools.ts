// The assistant's tools. They run on the server over the trial context, deterministically,
// reusing the domain functions the verdict engine uses.
import {
  ACTIVES,
  activeNoun,
  activesFor,
  CONCERNS,
  concernLabel,
  concernNoun,
  expectedScore,
  getActive,
  isConcern,
  NOISE,
  type Active,
  type Concern,
} from '@/lib/domain';
import type { ContextScan, TrialContext } from '@/components/coach/context';

export type ToolName = 'get_scores' | 'compare_days' | 'active_timeline' | 'expected_at';

/** OpenAI-style function definitions sent to the model. */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_scores',
      description:
        'YouCam scores (1 to 100, higher is better skin) for one skin area on every photo day of this trial, with the change from day 0, the acne map blemish count or redness map area when tracked, and whether the change is beyond the noise between repeat photos.',
      parameters: {
        type: 'object',
        properties: { concern: { type: 'string', description: 'Skin area id, for example acne, redness, pore, texture, moisture, oiliness' } },
        required: ['concern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_days',
      description:
        'Compares every tracked skin area between two photo days of this trial. Uses the nearest photo when there is none on that exact day. Also returns diary notes for those days.',
      parameters: {
        type: 'object',
        properties: {
          dayA: { type: 'integer', description: 'Earlier trial day, 0 is the first photo' },
          dayB: { type: 'integer', description: 'Later trial day' },
        },
        required: ['dayA', 'dayB'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'active_timeline',
      description:
        'Timeline of an active ingredient: when first changes usually show, when the full effect is expected, the possible purging window, irritation risk, and where this trial is on that timeline today.',
      parameters: {
        type: 'object',
        properties: { activeId: { type: 'string', description: "Active id from the trial's product, for example retinal, salicylic, niacinamide" } },
        required: ['activeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'expected_at',
      description:
        "Score this trial expects for a skin area on a given day if the product works as planned (curve from day 0 to the YouCam Skin Simulation target), compared with the measured score on the nearest photo.",
      parameters: {
        type: 'object',
        properties: {
          concern: { type: 'string', description: 'Skin area id, for example acne' },
          day: { type: 'integer', description: 'Trial day' },
        },
        required: ['concern', 'day'],
      },
    },
  },
] as const;

export interface ToolOutcome {
  /** Short line the panel shows while the tool runs, e.g. "Checking acne scores". */
  label: string;
  /** JSON-serialisable result handed back to the model. */
  result: unknown;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "acne", "Acne", "pores", "Hydration", "fine lines" → Concern. */
export function resolveConcern(input: unknown): Concern | undefined {
  if (typeof input !== 'string') return undefined;
  const q = input.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isConcern(q)) return q;
  const spaced = q.replace(/_/g, ' ');
  for (const [id, info] of Object.entries(CONCERNS) as [Concern, (typeof CONCERNS)[Concern]][]) {
    const label = info.label.toLowerCase();
    if (label === spaced || label.replace(/s$/, '') === spaced || info.simName === q) return id;
  }
  if (spaced === 'blemishes' || spaced === 'breakouts' || spaced === 'pimples') return 'acne';
  if (spaced === 'dryness') return 'moisture';
  return undefined;
}

function resolveActive(input: unknown, ctx: TrialContext): Active | undefined {
  if (typeof input !== 'string') return undefined;
  const q = input.trim().toLowerCase();
  const byId = getActive(q) ?? getActive(q.replace(/[\s-]+/g, '_'));
  if (byId) return byId;
  const pool = [...activesFor(ctx.product.actives), ...ACTIVES];
  return pool.find((a) => a.name.toLowerCase() === q || a.aliases.includes(q) || (a.searchTerms ?? []).includes(q));
}

function toInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
}

function baselineOf(ctx: TrialContext): ContextScan | undefined {
  return ctx.scans.find((s) => s.kind === 'baseline') ?? ctx.scans[0];
}

function nearestScan(ctx: TrialContext, day: number): ContextScan | undefined {
  let best: ContextScan | undefined;
  for (const s of ctx.scans) {
    if (!best || Math.abs(s.day - day) < Math.abs(best.day - day) || (Math.abs(s.day - day) === Math.abs(best.day - day) && s.day < best.day)) {
      best = s;
    }
  }
  return best;
}

function tracked(ctx: TrialContext): Concern[] {
  return [...new Set([...ctx.targets, ...ctx.watch])];
}

function role(ctx: TrialContext, c: Concern): 'target' | 'watched for irritation' | 'not tracked' {
  if (ctx.targets.includes(c)) return 'target';
  if (ctx.watch.includes(c)) return 'watched for irritation';
  return 'not tracked';
}

function judge(delta: number): 'better' | 'worse' | 'no real change' {
  if (delta > NOISE) return 'better';
  if (delta < -NOISE) return 'worse';
  return 'no real change';
}

function unknownConcern(ctx: TrialContext, input: unknown) {
  return { error: `Unknown skin area "${String(input)}"`, trackedAreas: tracked(ctx) };
}

function getScores(ctx: TrialContext, args: Record<string, unknown>): ToolOutcome {
  const c = resolveConcern(args.concern);
  if (!c) return { label: 'Checking scores', result: unknownConcern(ctx, args.concern) };
  const label = `Checking ${concernNoun(c)} scores`;
  const base = baselineOf(ctx);
  const baseScore = base?.scores[c];
  const rows = ctx.scans
    .filter((s) => s.scores[c] !== undefined)
    .map((s) => {
      const row: Record<string, unknown> = { day: s.day, score: s.scores[c] };
      if (baseScore !== undefined && s !== base) {
        const d = s.scores[c]! - baseScore;
        row.changeFromDay0 = round1(d);
        row.judgement = judge(d);
      }
      if (c === 'acne' && s.blemishes !== undefined) row.blemishesOnAcneMap = s.blemishes;
      if (c === 'redness' && s.redAreaPct !== undefined) row.redAreaPct = round1(s.redAreaPct);
      return row;
    });
  if (!rows.length) {
    return { label, result: { concern: c, label: concernLabel(c), role: role(ctx, c), error: 'This trial has no scores for this area', trackedAreas: tracked(ctx) } };
  }
  return {
    label,
    result: {
      concern: c,
      label: concernLabel(c),
      role: role(ctx, c),
      higherIsBetter: true,
      noisePoints: NOISE,
      note: `Changes within ±${NOISE} points are the normal spread between repeat photos and do not count as change`,
      byDay: rows,
      ...(ctx.projection?.[c] !== undefined ? { simulatedTarget: ctx.projection[c] } : {}),
    },
  };
}

function compareDays(ctx: TrialContext, args: Record<string, unknown>): ToolOutcome {
  const a = toInt(args.dayA);
  const b = toInt(args.dayB);
  if (a === undefined || b === undefined) return { label: 'Comparing photo days', result: { error: 'dayA and dayB must be whole numbers', photoDays: ctx.scans.map((s) => s.day) } };
  const sa = nearestScan(ctx, Math.min(a, b));
  const sb = nearestScan(ctx, Math.max(a, b));
  if (!sa || !sb) return { label: 'Comparing photo days', result: { error: 'This trial has no photos' } };
  const label = `Comparing day ${sa.day} and day ${sb.day}`;
  const notes: string[] = [];
  for (const [asked, got] of [
    [Math.min(a, b), sa],
    [Math.max(a, b), sb],
  ] as const) {
    if (asked !== got.day) notes.push(`No photo on day ${asked}; used day ${got.day}`);
  }
  if (sa === sb) notes.push('Both days map to the same photo');
  const areas = tracked(ctx)
    .filter((c) => sa.scores[c] !== undefined && sb.scores[c] !== undefined)
    .map((c) => {
      const d = sb.scores[c]! - sa.scores[c]!;
      return { concern: c, label: concernLabel(c), role: role(ctx, c), from: sa.scores[c], to: sb.scores[c], change: round1(d), judgement: judge(d) };
    });
  const result: Record<string, unknown> = {
    dayA: sa.day,
    dayB: sb.day,
    noisePoints: NOISE,
    areas,
  };
  if (sa.blemishes !== undefined && sb.blemishes !== undefined) result.blemishesOnAcneMap = { from: sa.blemishes, to: sb.blemishes };
  if (sa.redAreaPct !== undefined && sb.redAreaPct !== undefined) result.redAreaPct = { from: round1(sa.redAreaPct), to: round1(sb.redAreaPct) };
  const diary = [sa, sb].filter((s) => s.diary).map((s) => ({ day: s.day, ...s.diary }));
  if (diary.length) result.diary = diary;
  if (notes.length) result.notes = notes;
  return { label, result };
}

function activeTimeline(ctx: TrialContext, args: Record<string, unknown>): ToolOutcome {
  const active = resolveActive(args.activeId, ctx);
  if (!active) {
    return { label: 'Reading the ingredient timeline', result: { error: `Unknown active "${String(args.activeId)}"`, trialActives: ctx.product.actives } };
  }
  const day = ctx.today;
  const purge = active.purge;
  const phase =
    purge && day >= purge.fromDay && day <= purge.toDay
      ? 'inside the purging window'
      : day < active.onsetDay
        ? 'before first changes are expected'
        : day < active.fullEffectDay
          ? 'between first changes and full effect'
          : 'past the full effect day';
  return {
    label: `Reading the ${activeNoun(active)} timeline`,
    result: {
      id: active.id,
      name: active.name,
      inThisTrial: ctx.product.actives.includes(active.id),
      firstChangesDay: active.onsetDay,
      fullEffectDay: active.fullEffectDay,
      purgingWindow: purge ? { fromDay: purge.fromDay, toDay: purge.toDay } : null,
      irritationRisk: active.irritation,
      targets: active.targets.map(concernLabel),
      watchedForIrritation: active.watch.map(concernLabel),
      note: active.note,
      trial: {
        today: day,
        phase,
        daysUntilFirstChanges: Math.max(0, active.onsetDay - day),
        daysUntilFullEffect: Math.max(0, active.fullEffectDay - day),
        ...(purge && day <= purge.toDay ? { daysUntilPurgeWindowEnds: Math.max(0, purge.toDay - day) } : {}),
        plannedCheckinDays: ctx.plan.checkinDays,
      },
    },
  };
}

function expectedAt(ctx: TrialContext, args: Record<string, unknown>): ToolOutcome {
  const c = resolveConcern(args.concern);
  const day = toInt(args.day);
  if (!c) return { label: 'Checking the expected curve', result: unknownConcern(ctx, args.concern) };
  if (day === undefined || day < 0) return { label: 'Checking the expected curve', result: { error: 'day must be a whole number from 0' } };
  const label = `Checking the expected ${concernNoun(c)} score on day ${day}`;
  const base = baselineOf(ctx);
  const baseScore = base?.scores[c];
  const target = ctx.projection?.[c];
  const expected =
    base && baseScore !== undefined && target !== undefined
      ? expectedScore(
          { plan: ctx.plan, projection: { photo: { url: '' }, intensities: {}, scores: { [c]: { ui: target, raw: target } } } },
          { scores: { [c]: { ui: baseScore, raw: baseScore } } },
          c,
          day,
        )
      : null;
  if (expected === null) {
    return {
      label,
      result: { concern: c, day, expected: null, reason: 'This trial has no simulated target for this area, so there is no expected curve' },
    };
  }
  const near = nearestScan(ctx, day);
  const measured = near?.scores[c];
  const result: Record<string, unknown> = {
    concern: c,
    label: concernLabel(c),
    day,
    day0Score: baseScore,
    simulatedTarget: target,
    targetByDay: ctx.plan.fullEffectDay,
    expected: round1(expected),
    noisePoints: NOISE,
  };
  if (near && measured !== undefined) {
    const gap = measured - expected;
    result.measured = { day: near.day, score: measured, versusExpected: round1(gap) };
    result.judgement = Math.abs(gap) <= NOISE ? 'within the expected range' : gap > 0 ? 'ahead of the expected curve' : 'behind the expected curve';
    if (near.day !== day) result.note = `No photo on day ${day}; compared with day ${near.day}`;
  }
  return { label, result };
}

const EXECUTORS: Record<ToolName, (ctx: TrialContext, args: Record<string, unknown>) => ToolOutcome> = {
  get_scores: getScores,
  compare_days: compareDays,
  active_timeline: activeTimeline,
  expected_at: expectedAt,
};

/** Parses the model's JSON arguments and runs the tool. Never throws: bad input becomes an `error` result. */
export function executeTool(name: string, rawArgs: string | Record<string, unknown>, ctx: TrialContext): ToolOutcome {
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === 'string') {
    try {
      const parsed: unknown = rawArgs.trim() ? JSON.parse(rawArgs) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      return { label: 'Checking the trial', result: { error: 'Arguments were not valid JSON' } };
    }
  } else {
    args = rawArgs;
  }
  const run = (EXECUTORS as Record<string, (typeof EXECUTORS)[ToolName] | undefined>)[name];
  if (!run) return { label: 'Checking the trial', result: { error: `Unknown tool ${name}` } };
  return run(ctx, args);
}
