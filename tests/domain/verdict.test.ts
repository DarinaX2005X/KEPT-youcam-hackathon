import { describe, expect, it } from 'vitest';
import { addDays, computeVerdict, formatShortDate, NOISE } from '@/lib/domain';
import type { Verdict } from '@/lib/domain';
import { START, at, makeScan, makeTrial } from './fixtures';

function expectCopyRules(v: Verdict) {
  expect(v.headline).not.toMatch(/[.!]$/);
  expect(v.summary).not.toMatch(/!|—|–| - /);
  expect(v.reasons.length).toBeGreaterThanOrEqual(2);
  expect(v.reasons.length).toBeLessThanOrEqual(4);
  for (const r of v.reasons) expect(r.text).not.toMatch(/!|—|–| - |\.$/);
}

describe('computeVerdict', () => {
  it('uses NOISE = 4 for now', () => {
    expect(NOISE).toBe(4);
  });

  it('too_early: before the onset day', () => {
    const trial = makeTrial(['salicylic']);
    const scans = [
      makeScan(trial, 0, { acne: 60, pore: 60, oiliness: 60, redness: 70 }),
      makeScan(trial, 7, { acne: 62, pore: 61, oiliness: 59, redness: 70 }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 8));
    expect(v.kind).toBe('too_early');
    expect(v.headline).toBe('Too early to tell');
    expect(v.reasons[0].text).toBe('Day 8 of 56. Salicylic acid usually shows first changes after 2 weeks');
    expect(v.next).toEqual({
      action: 'checkin',
      label: `Next check-in on ${formatShortDate(addDays(START, 14))}`,
      date: addDays(START, 14),
    });
    expect(v.confidence).toBe('high');
    expectCopyRules(v);
  });

  it('too_early with only a baseline, and with nothing at all', () => {
    const trial = makeTrial(['salicylic']);
    const only = computeVerdict(trial, [makeScan(trial, 0, { acne: 60 })], at(trial, 2));
    expect(only.kind).toBe('too_early');
    expectCopyRules(only);
    const none = computeVerdict(trial, [], at(trial, 0));
    expect(none.kind).toBe('too_early');
    expect(none.next.label).toBe('Take baseline photo');
  });

  it('on_track: between onset and full, compared with the expected curve', () => {
    const trial = makeTrial(['salicylic'], {
      projection: {
        photo: { url: '/p.jpg' },
        scores: { acne: { ui: 80, raw: 0 }, pore: { ui: 70, raw: 0 }, oiliness: { ui: 70, raw: 0 } },
        intensities: { acne: 0.6, pores: 0.4, oiliness: 0.4 },
      },
    });
    const scans = [
      makeScan(trial, 0, { acne: 60, pore: 60, oiliness: 60, redness: 70 }),
      makeScan(trial, 21, { acne: 66, pore: 61, oiliness: 61, redness: 70 }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 21));
    expect(v.kind).toBe('on_track');
    expect(v.headline).toBe('On track');
    expect(v.reasons[0]).toMatchObject({
      text: 'Acne is 2 points ahead of the expected curve for day 21',
      tone: 'better',
      concern: 'acne',
    });
    expect(v.next.action).toBe('checkin');
    expect(v.next.label).toBe(`Next check-in on ${formatShortDate(addDays(START, 28))}`);
    expectCopyRules(v);
  });

  it('working: day 30, acne +7 and redness +5', () => {
    const trial = makeTrial(['azelaic'], { targets: ['acne', 'redness'], watch: ['moisture'] });
    const scans = [
      makeScan(trial, 0, { acne: 60, redness: 65, moisture: 70 }, { maskStats: { acne: { blemishCount: 23 } } }),
      makeScan(trial, 14, { acne: 61, redness: 66, moisture: 70 }),
      makeScan(trial, 30, { acne: 67, redness: 70, moisture: 69 }, { maskStats: { acne: { blemishCount: 11 } } }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 30));
    expect(v.kind).toBe('working');
    expect(v.headline).toBe('Working');
    expect(v.reasons[0]).toEqual({
      text: "Acne 60 → 67. That's more than the ±4 points we see between repeat photos",
      tone: 'better',
      concern: 'acne',
      delta: 7,
    });
    expect(v.reasons.map((r) => r.text)).toContain('Redness 65 → 70, 5 points better than day 0');
    expect(v.reasons.map((r) => r.text)).toContain('Blemishes 23 → 11 on the acne map');
    expect(v.summary).toBe('Your acne and redness improved by more than the difference between repeat photos.');
    expect(v.next.action).toBe('checkin');
    expect(v.next.date).toBe(addDays(START, 42));
    expectCopyRules(v);
  });

  it('working at the full effect day asks to keep the product', () => {
    const trial = makeTrial(['salicylic']);
    const scans = [
      makeScan(trial, 0, { acne: 60, pore: 60, oiliness: 60, redness: 70 }),
      makeScan(trial, 56, { acne: 75, pore: 66, oiliness: 64, redness: 71 }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 60));
    expect(v.kind).toBe('working');
    expect(v.next).toEqual({ action: 'decide_keep', label: 'Keep this product' });
  });

  it('purging: retinal, day 18, acne down 6', () => {
    const trial = makeTrial(['retinal'], {
      name: '0.05% retinal cream',
      targets: ['acne', 'texture'],
      watch: ['redness', 'moisture'],
    });
    const scans = [
      makeScan(trial, 0, { acne: 70, texture: 60, redness: 70, moisture: 60 }),
      makeScan(trial, 7, { acne: 69, texture: 60, redness: 70, moisture: 60 }),
      makeScan(trial, 18, { acne: 64, texture: 61, redness: 69, moisture: 59 }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 21));
    expect(v.kind).toBe('purging');
    expect(v.headline).toBe('Likely purging');
    expect(v.reasons[0]).toMatchObject({
      text: 'Acne is up on day 18. Retinal often causes a short purge in weeks 2 to 6',
      tone: 'worse',
      concern: 'acne',
      delta: -6,
    });
    // A purge keeps the regular schedule; the day 21 slot is due on the test date.
    expect(v.next.action).toBe('keep_going');
    expect(v.next.label).toBe('Keep going. Check in today');
    expect(v.next.date).toBe(addDays(START, 21));
    expectCopyRules(v);
  });

  it('purge vs reacting: a strong redness drop is a reaction even inside the purge window', () => {
    const trial = makeTrial(['retinal'], { targets: ['acne', 'texture'], watch: ['redness', 'moisture'] });
    const base = makeScan(trial, 0, { acne: 70, texture: 60, redness: 70, moisture: 60 });
    const v = computeVerdict(
      trial,
      [base, makeScan(trial, 18, { acne: 64, texture: 61, redness: 60, moisture: 59 })],
      at(trial, 18),
    );
    expect(v.kind).toBe('reacting');
    expect(v.reasons[0].text).toBe(
      'Redness got 10 points worse since day 0. That often means the product is irritating your skin',
    );
  });

  it('purge vs reacting: a mild hydration drop counts only outside the purge window', () => {
    const trial = makeTrial(['retinal'], { targets: ['acne', 'texture'], watch: ['redness', 'moisture'] });
    const base = makeScan(trial, 0, { acne: 70, texture: 60, redness: 70, moisture: 60 });
    const inside = computeVerdict(
      trial,
      [base, makeScan(trial, 18, { acne: 64, texture: 61, redness: 69, moisture: 55 })],
      at(trial, 18),
    );
    expect(inside.kind).toBe('purging');
    const outside = computeVerdict(
      trial,
      [base, makeScan(trial, 50, { acne: 72, texture: 63, redness: 69, moisture: 55 })],
      at(trial, 50),
    );
    expect(outside.kind).toBe('reacting');
    expect(outside.next.action).toBe('reduce_use');
  });

  it('reacting: hydration down 9 on day 10, then twice in a row means stop', () => {
    const trial = makeTrial(['benzoyl_peroxide']);
    expect(trial.watch).toEqual(['redness', 'moisture']);
    const base = makeScan(trial, 0, { acne: 60, redness: 70, moisture: 60 });
    const now = at(trial, 10);
    const v = computeVerdict(trial, [base, makeScan(trial, 10, { acne: 61, redness: 69, moisture: 51 })], now);
    expect(v.kind).toBe('reacting');
    expect(v.headline).toBe('Your skin is reacting');
    expect(v.reasons[0]).toMatchObject({
      text: 'Hydration dropped 9 points since day 0. That often means the product is drying your skin',
      tone: 'worse',
      concern: 'moisture',
      delta: -9,
    });
    const retry = addDays(now, 7);
    expect(v.next).toEqual({
      action: 'reduce_use',
      label: `Use it every other night and check in on ${formatShortDate(retry)}`,
      date: retry,
    });
    expectCopyRules(v);

    const twice = computeVerdict(
      trial,
      [
        base,
        makeScan(trial, 7, { acne: 60, redness: 69, moisture: 54 }),
        makeScan(trial, 10, { acne: 61, redness: 69, moisture: 51 }),
      ],
      now,
    );
    expect(twice.kind).toBe('reacting');
    expect(twice.next).toEqual({ action: 'decide_stop', label: 'Time to stop this product' });
  });

  it('reacting beats too_early', () => {
    const trial = makeTrial(['benzoyl_peroxide']);
    const v = computeVerdict(
      trial,
      [makeScan(trial, 0, { acne: 60, redness: 70, moisture: 60 }), makeScan(trial, 7, { acne: 60, redness: 60, moisture: 60 })],
      at(trial, 7),
    );
    expect(v.kind).toBe('reacting');
  });

  it('not_enough: day 56 with targets within ±2', () => {
    const trial = makeTrial(['niacinamide'], { targets: ['pore', 'oiliness'], watch: ['redness', 'moisture'] });
    const scans = [
      makeScan(trial, 0, { pore: 70, oiliness: 65, redness: 72, moisture: 60 }),
      makeScan(trial, 42, { pore: 69, oiliness: 66, redness: 72, moisture: 61 }),
      makeScan(trial, 56, { pore: 71, oiliness: 63, redness: 71, moisture: 60 }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 56));
    expect(v.kind).toBe('not_enough');
    expect(v.headline).toBe('Not doing enough');
    expect(v.reasons.map((r) => r.text)).toContain('Pores stayed within ±4 points after 56 days (70 → 71)');
    expect(v.reasons.every((r) => r.tone === 'flat' || r.tone === 'info')).toBe(true);
    expect(v.summary).toBe('After 56 days your pores and oiliness changed no more than repeat photos do.');
    expect(v.next).toEqual({ action: 'decide_stop', label: 'Time to stop this product' });
    expectCopyRules(v);
  });

  it('judges by the latest check-in only, so every screen shows the same number', () => {
    const trial = makeTrial(['niacinamide'], { targets: ['pore', 'oiliness'], watch: ['moisture'] });
    const base = makeScan(trial, 0, { pore: 70, oiliness: 65, moisture: 60 });
    const lucky = makeScan(trial, 56, { pore: 77, oiliness: 72, moisture: 60 });
    const v = computeVerdict(trial, [base, makeScan(trial, 50, { pore: 70, oiliness: 65 }), lucky], at(trial, 56));
    expect(v.kind).toBe('working');
    expect(v.reasons.some((r) => r.text.includes('70 → 77'))).toBe(true);
    expect(v.reasons.some((r) => r.text.includes('averaged'))).toBe(false);
  });

  it('confounded: a new product in the diary lowers confidence and says why', () => {
    const trial = makeTrial(['azelaic'], { targets: ['acne', 'redness'], watch: ['moisture'] });
    const scans = [
      makeScan(trial, 0, { acne: 60, redness: 65, moisture: 70 }),
      makeScan(trial, 30, { acne: 67, redness: 70, moisture: 69 }, { diary: { newProduct: true } }),
    ];
    const v = computeVerdict(trial, scans, at(trial, 30));
    expect(v.kind).toBe('working');
    expect(v.confidence).toBe('low');
    expect(v.reasons.map((r) => r.text)).toContain(
      'You started another product on day 30. Changes after that may not be from this one',
    );
    expectCopyRules(v);
  });

  it('confidence follows the light difference from day 0 and the framing', () => {
    const trial = makeTrial(['azelaic'], { targets: ['acne', 'redness'], watch: ['moisture'] });
    const base = makeScan(trial, 0, { acne: 60, redness: 65 }, { luminance: 140 });
    const run = (extra: { luminance?: number; alignment?: number }) =>
      computeVerdict(trial, [base, makeScan(trial, 30, { acne: 67, redness: 70 }, extra)], at(trial, 30));

    expect(run({ luminance: 150 }).confidence).toBe('high');
    const medium = run({ luminance: 160 });
    expect(medium.confidence).toBe('medium');
    expect(medium.reasons.map((r) => r.text)).toContain(
      'The light in your day 30 photo is 14% brighter than on day 0, so scores may shift',
    );
    expect(run({ luminance: 112 }).confidence).toBe('low');
    expect(run({ luminance: 170 }).confidence).toBe('low');
    expect(run({ luminance: 140, alignment: 0.12 }).confidence).toBe('medium');
    expect(run({ luminance: 140, alignment: 0.05 }).confidence).toBe('high');
  });

  it('is deterministic for the same input and now', () => {
    const trial = makeTrial(['salicylic']);
    const scans = [makeScan(trial, 0, { acne: 60 }), makeScan(trial, 21, { acne: 62 })];
    expect(computeVerdict(trial, scans, at(trial, 22))).toEqual(computeVerdict(trial, scans, at(trial, 22)));
  });
});
