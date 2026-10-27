import { describe, expect, it } from 'vitest';
import { expectedScore, NOISE } from '@/lib/domain';
import { executeTool, resolveConcern, TOOL_DEFS } from '@/app/api/coach/tools';
import { trialSummary } from '@/app/api/coach/prompt';
import { SUGGESTED_QUESTIONS } from '@/components/coach/context';
import { sample } from './fixtures';

type Obj = Record<string, any>;
const run = (name: string, args: Obj | string, s = sample('retinal')) => executeTool(name, args, s.context);

describe('trial context', () => {
  it('carries scores, map counts and the verdict without photos', () => {
    const { context, verdict } = sample('retinal');
    expect(verdict.kind).toBe('purging');
    expect(context.today).toBe(21);
    expect(context.scans.map((s) => s.day)).toEqual([0, 7, 18]);
    expect(context.scans[2]).toMatchObject({ scores: { acne: 66 }, blemishes: 34 });
    expect(context.projection?.acne).toBe(74);
    expect(JSON.stringify(context)).not.toContain('/demo/');
    expect(context.verdict.headline).toBe('Likely purging');
  });

  it('uses the last photo day for decided trials', () => {
    expect(sample('salicylic').context.today).toBe(56);
  });

  it('has three suggestions for every verdict kind', () => {
    for (const qs of Object.values(SUGGESTED_QUESTIONS)) expect(qs).toHaveLength(3);
    expect(SUGGESTED_QUESTIONS.purging[0]).toBe('Why is my acne worse?');
  });

  it('puts the verdict and the active ids in the summary', () => {
    const text = trialSummary(sample('retinal').context);
    expect(text).toContain('Likely purging');
    expect(text).toContain('retinal (Retinal)');
    expect(text).toContain('possible purging between day 14 and day 42');
  });
});

describe('tool definitions', () => {
  it('declares the four tools', () => {
    expect(TOOL_DEFS.map((t) => t.function.name)).toEqual(['get_scores', 'compare_days', 'active_timeline', 'expected_at']);
  });
});

describe('get_scores', () => {
  it('lists the area on every photo day with change and judgement', () => {
    const out = run('get_scores', { concern: 'acne' });
    expect(out.label).toBe('Checking acne scores');
    const r = out.result as Obj;
    expect(r.role).toBe('target');
    expect(r.noisePoints).toBe(NOISE);
    expect(r.byDay).toEqual([
      { day: 0, score: 72, blemishesOnAcneMap: 16 },
      { day: 7, score: 71, changeFromDay0: -1, judgement: 'no real change', blemishesOnAcneMap: 17 },
      { day: 18, score: 66, changeFromDay0: -6, judgement: 'worse', blemishesOnAcneMap: 34 },
    ]);
    expect(r.simulatedTarget).toBe(74);
  });

  it('accepts labels and plurals', () => {
    expect(resolveConcern('Pores')).toBe('pore');
    expect(resolveConcern('hydration')).toBe('moisture');
    expect(resolveConcern('fine lines')).toBe('wrinkle');
    expect(resolveConcern('dark-spots')).toBe('age_spot');
    expect(resolveConcern('breakouts')).toBe('acne');
    expect(resolveConcern('elbows')).toBeUndefined();
  });

  it('reports the red area for redness', () => {
    const r = run('get_scores', { concern: 'redness' }, sample('salicylic')).result as Obj;
    expect(r.role).toBe('watched for irritation');
    expect(r.byDay.at(-1)).toMatchObject({ day: 56, score: 83, changeFromDay0: 19, judgement: 'better', redAreaPct: 0.5 });
  });

  it('returns an error with the tracked areas for an unknown or missing area', () => {
    expect((run('get_scores', { concern: 'elbows' }).result as Obj).trackedAreas).toEqual(['acne', 'texture', 'redness', 'moisture']);
    expect((run('get_scores', { concern: 'wrinkle' }).result as Obj).error).toMatch(/no scores/);
  });
});

describe('compare_days', () => {
  it('compares all tracked areas and uses the nearest photo', () => {
    const out = run('compare_days', { dayA: 0, dayB: 21 });
    expect(out.label).toBe('Comparing day 0 and day 18');
    const r = out.result as Obj;
    expect(r.notes).toEqual(['No photo on day 21; used day 18']);
    expect(r.areas).toContainEqual({ concern: 'acne', label: 'Acne', role: 'target', from: 72, to: 66, change: -6, judgement: 'worse' });
    expect(r.blemishesOnAcneMap).toEqual({ from: 16, to: 34 });
  });

  it('orders the days and accepts numeric strings', () => {
    const r = run('compare_days', '{"dayA":"56","dayB":0}', sample('niacinamide')).result as Obj;
    expect([r.dayA, r.dayB]).toEqual([0, 56]);
    expect(r.areas.every((a: Obj) => a.judgement === 'no real change')).toBe(true);
  });

  it('rejects days that are not numbers', () => {
    expect((run('compare_days', { dayA: 'first', dayB: 18 }).result as Obj).error).toBeDefined();
  });
});

describe('active_timeline', () => {
  it('places the trial on the active timeline', () => {
    const out = run('active_timeline', { activeId: 'retinal' });
    expect(out.label).toBe('Reading the retinal timeline');
    const r = out.result as Obj;
    expect(r).toMatchObject({ firstChangesDay: 21, fullEffectDay: 84, purgingWindow: { fromDay: 14, toDay: 42 }, inThisTrial: true });
    expect(r.trial).toMatchObject({ today: 21, phase: 'inside the purging window', daysUntilPurgeWindowEnds: 21, daysUntilFullEffect: 63 });
  });

  it('finds an active by name', () => {
    expect((run('active_timeline', { activeId: 'Salicylic acid' }).result as Obj).id).toBe('salicylic');
  });

  it('names the trial actives for an unknown id', () => {
    expect((run('active_timeline', { activeId: 'unicorn' }).result as Obj).trialActives).toEqual(['retinal']);
  });
});

describe('expected_at', () => {
  it('uses the domain curve and compares with the nearest photo', () => {
    const s = sample('retinal');
    const out = run('expected_at', { concern: 'acne', day: 18 }, s);
    expect(out.label).toBe('Checking the expected acne score on day 18');
    const r = out.result as Obj;
    const baseline = s.scans.find((x) => x.day === 0)!;
    const want = expectedScore(s.trial, baseline, 'acne', 18)!;
    expect(r.expected).toBeCloseTo(want, 1);
    expect(r.measured).toMatchObject({ day: 18, score: 66 });
    expect(r.judgement).toBe('behind the expected curve');
  });

  it('says there is no curve without a simulated target', () => {
    const r = run('expected_at', { concern: 'pore', day: 28 }, sample('niacinamide')).result as Obj;
    expect(r.expected).toBeNull();
  });
});

describe('executeTool', () => {
  it('never throws on bad input', () => {
    expect((run('get_scores', '{not json').result as Obj).error).toBeDefined();
    expect((run('delete_everything', {}).result as Obj).error).toMatch(/Unknown tool/);
  });
});
