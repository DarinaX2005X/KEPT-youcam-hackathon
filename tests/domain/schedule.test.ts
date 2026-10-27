import { describe, expect, it } from 'vitest';
import {
  activesFor,
  addDays,
  buildPlan,
  dayOf,
  expectedScore,
  nextCheckin,
  pickConcerns,
  plannedCheckins,
  progressAt,
  simulationFor,
  toIcs,
} from '@/lib/domain';
import { START, at, makeScan, makeTrial } from './fixtures';

describe('buildPlan', () => {
  it('salicylic acid: 8 weeks, purge 7 to 42', () => {
    expect(buildPlan(activesFor(['salicylic']))).toEqual({
      checkinDays: [7, 14, 21, 28, 42, 56],
      onsetDay: 14,
      fullEffectDay: 56,
      purge: { fromDay: 7, toDay: 42 },
    });
  });

  it('retinal adds day 84; mixed actives take min onset, max full, one purge window', () => {
    expect(buildPlan(activesFor(['retinal'])).checkinDays).toEqual([7, 14, 21, 28, 42, 56, 84]);
    const mix = buildPlan(activesFor(['niacinamide', 'salicylic', 'adapalene']));
    expect(mix.onsetDay).toBe(14);
    expect(mix.fullEffectDay).toBe(84);
    expect(mix.purge).toEqual({ fromDay: 7, toDay: 49 });
  });

  it('short plans stop at full effect, no purge when no active purges', () => {
    const p = buildPlan(activesFor(['barrier']));
    expect(p.checkinDays).toEqual([7, 14, 21, 28]);
    expect(p.purge).toBeUndefined();
  });
});

describe('pickConcerns', () => {
  it('salicylic acid: three targets, redness watched', () => {
    expect(pickConcerns(activesFor(['salicylic']))).toEqual({
      targets: ['acne', 'pore', 'oiliness'],
      watch: ['redness'],
    });
  });

  it('takes targets by priority across actives and never more than 4 zones', () => {
    const r = pickConcerns(activesFor(['niacinamide', 'salicylic']));
    expect(r.targets).toEqual(['pore', 'acne', 'oiliness']);
    expect(r.watch).toEqual(['redness']);
    expect(r.targets.length + r.watch.length).toBeLessThanOrEqual(4);
  });

  it('low irritation actives do not force redness', () => {
    expect(pickConcerns(activesFor(['niacinamide']))).toEqual({
      targets: ['pore', 'oiliness', 'redness'],
      watch: ['moisture'],
    });
  });

  it('respects the user choice and still watches redness for irritating actives', () => {
    expect(pickConcerns(activesFor(['retinal']), ['acne', 'texture'])).toEqual({
      targets: ['acne', 'texture'],
      watch: ['redness', 'moisture'],
    });
    const four = pickConcerns(activesFor(['retinal']), ['acne', 'texture', 'wrinkle', 'age_spot']);
    expect(four.watch).toEqual(['redness']);
  });
});

describe('simulationFor', () => {
  it('takes the strongest intensity per target and skips areas with no simulation', () => {
    const actives = activesFor(['salicylic', 'niacinamide']);
    expect(simulationFor(actives, ['acne', 'pore', 'oiliness', 'moisture'])).toEqual({
      acne: 0.6,
      pores: 0.4,
      oiliness: 0.4,
    });
    expect(simulationFor(activesFor(['niacinamide']), ['redness'])).toEqual({ redness: 0.3 });
  });
});

describe('expectation', () => {
  it('is flat until half the onset, reaches the projection at full effect', () => {
    const trial = makeTrial(['salicylic'], {
      projection: { photo: { url: '/x.jpg' }, scores: { acne: { ui: 80, raw: 0 } }, intensities: { acne: 0.6 } },
    });
    const base = makeScan(trial, 0, { acne: 60 });
    expect(expectedScore(trial, base, 'acne', 0)).toBe(60);
    expect(expectedScore(trial, base, 'acne', 7)).toBe(60);
    expect(expectedScore(trial, base, 'acne', 56)).toBe(80);
    expect(expectedScore(trial, base, 'acne', 90)).toBe(80);
    const mid = expectedScore(trial, base, 'acne', 31.5)!;
    expect(mid).toBeCloseTo(70, 5);
    expect(expectedScore(trial, base, 'pore', 30)).toBeNull();
    expect(progressAt(trial.plan, 21)).toBeGreaterThan(0);
    expect(progressAt(trial.plan, 21)).toBeLessThan(0.5);
  });
});

describe('dates and check-ins', () => {
  it('dayOf floors whole days', () => {
    const trial = makeTrial(['salicylic']);
    expect(dayOf(trial, START)).toBe(0);
    expect(dayOf(trial, '2026-09-02T11:59:59.000Z')).toBe(0);
    expect(dayOf(trial, '2026-09-02T12:00:00.000Z')).toBe(1);
    expect(dayOf(trial, addDays(START, 21))).toBe(21);
  });

  it('nextCheckin gives the next planned day, the latest due one when late, null when done', () => {
    const trial = makeTrial(['salicylic']);
    const base = makeScan(trial, 0, { acne: 60 });
    expect(nextCheckin(trial, [base], at(trial, 3))).toEqual({ day: 7, date: addDays(START, 7) });
    expect(nextCheckin(trial, [base, makeScan(trial, 7, {})], at(trial, 8))?.day).toBe(14);
    expect(nextCheckin(trial, [base, makeScan(trial, 7, {})], at(trial, 30))?.day).toBe(28);
    expect(nextCheckin(trial, [base, makeScan(trial, 56, {})], at(trial, 57))).toBeNull();
    expect(nextCheckin({ ...trial, status: 'kept' }, [base], at(trial, 3))).toBeNull();
    expect(plannedCheckins(trial).map((s) => s.day)).toEqual([7, 14, 21, 28, 42, 56]);
  });

  it('toIcs writes one 9:00 event per date', () => {
    const trial = makeTrial(['salicylic'], { id: 't1', name: '2% salicylic acid serum, travel size' });
    const ics = toIcs(trial, plannedCheckins(trial).map((s) => s.date));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    expect(ics).toContain('SUMMARY:Kept check-in: 2% salicylic acid serum\\, travel size');
    expect(ics).toContain('DESCRIPTION:Take your check-in photo in the same spot as day 0');
    expect(ics).toContain('UID:t1-0@kept');
    const starts = lines.filter((l) => l.startsWith('DTSTART:'));
    expect(starts.every((l) => /T090000$/.test(l))).toBe(true);
    expect(lines.filter((l) => l.startsWith('DTEND:')).every((l) => /T091500$/.test(l))).toBe(true);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(toIcs(trial, [START])).toBe(toIcs(trial, [START]));
  });
});
