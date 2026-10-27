import type { Verdict, VerdictKind } from '@/lib/domain';

/** One verdict of each kind, worded the way the engine words them. For /dev/trial and visual checks. */
export const VERDICT_FIXTURES: Record<VerdictKind, Verdict> = {
  too_early: {
    kind: 'too_early',
    headline: 'Too early to tell',
    summary: "It's day 9, and salicylic acid usually needs about 2 weeks before skin changes.",
    reasons: [
      { text: 'Day 9 of 56. Salicylic acid usually shows first changes after 2 weeks', tone: 'info' },
      { text: 'Acne 66 → 68, 2 points better than day 0', tone: 'flat', concern: 'acne', delta: 2 },
      { text: 'Pores stayed within ±4 points (69 → 69) after 7 days', tone: 'flat', concern: 'pore', delta: 0 },
    ],
    confidence: 'high',
    next: { action: 'checkin', label: 'Next check-in on Nov 2', date: '2026-11-02T09:00:00.000Z' },
  },
  on_track: {
    kind: 'on_track',
    headline: 'On track',
    summary: 'Your skin is moving the right way, though not yet past the difference between repeat photos.',
    reasons: [
      { text: 'Acne is 2 points ahead of the expected curve for day 28', tone: 'better', concern: 'acne', delta: 2 },
      { text: 'Pores 69 → 72, 3 points better than day 0', tone: 'flat', concern: 'pore', delta: 3 },
      { text: 'Blemishes 23 → 17 on the acne map', tone: 'better', concern: 'acne' },
      { text: 'Day 28 of 56. Salicylic acid usually reaches its full effect by 8 weeks', tone: 'info' },
    ],
    confidence: 'medium',
    next: { action: 'checkin', label: 'Check in today', date: '2026-10-27T09:00:00.000Z' },
  },
  working: {
    kind: 'working',
    headline: 'Working',
    summary: 'Your acne and pores improved by more than the difference between repeat photos.',
    reasons: [
      { text: "Acne 66 → 73. That's more than the ±4 points we see between repeat photos", tone: 'better', concern: 'acne', delta: 7 },
      { text: 'Pores 69 → 79, 10 points better than day 0', tone: 'better', concern: 'pore', delta: 10 },
      { text: 'Blemishes 42 → 11 on the acne map', tone: 'better', concern: 'acne' },
      { text: 'Oiliness 76 → 81, 5 points better than day 0', tone: 'better', concern: 'oiliness', delta: 5 },
    ],
    confidence: 'high',
    next: { action: 'decide_keep', label: 'Keep this product' },
  },
  purging: {
    kind: 'purging',
    headline: 'Likely purging',
    summary: 'A short breakout is common at this stage and usually settles as your skin adjusts.',
    reasons: [
      { text: 'Acne is up on day 18. Retinal often causes a short purge in weeks 2 to 6', tone: 'worse', concern: 'acne', delta: -6 },
      { text: 'Blemishes 16 → 37 on the acne map', tone: 'worse', concern: 'acne' },
      { text: 'Texture stayed within ±4 points (82 → 80) after 18 days', tone: 'flat', concern: 'texture', delta: -2 },
      { text: 'Day 21 of 84. Retinal usually reaches its full effect by 12 weeks', tone: 'info' },
    ],
    confidence: 'high',
    next: { action: 'keep_going', label: 'Keep going and check in on day 49', date: '2026-11-24T09:00:00.000Z' },
  },
  reacting: {
    kind: 'reacting',
    headline: 'Your skin is reacting',
    summary: 'Your redness got worse since day 0, which often points to irritation.',
    reasons: [
      { text: 'Redness got 9 points worse since day 0. That often means the product is irritating your skin', tone: 'worse', concern: 'redness', delta: -9 },
      { text: 'Red area 1% → 4% on the redness map', tone: 'worse', concern: 'redness' },
      { text: 'Texture stayed within ±4 points (82 → 83) after 14 days', tone: 'flat', concern: 'texture', delta: 1 },
      { text: 'The light in your day 14 photo is 14% brighter than on day 0, so scores may shift', tone: 'info' },
    ],
    confidence: 'medium',
    next: { action: 'reduce_use', label: 'Use it every other night and check in on Nov 3', date: '2026-11-03T09:00:00.000Z' },
  },
  not_enough: {
    kind: 'not_enough',
    headline: 'Not doing enough',
    summary: 'After 56 days your pores and oiliness changed no more than repeat photos do.',
    reasons: [
      { text: 'Oiliness stayed within ±4 points (77 → 77) after 56 days', tone: 'flat', concern: 'oiliness', delta: 0 },
      { text: 'Pores stayed within ±4 points (69 → 70) after 56 days', tone: 'flat', concern: 'pore', delta: 1 },
      { text: "Day 56 of 56. That's the full course for niacinamide", tone: 'info' },
    ],
    confidence: 'high',
    next: { action: 'decide_stop', label: 'Time to stop this product' },
  },
};

export const VERDICT_KINDS = Object.keys(VERDICT_FIXTURES) as VerdictKind[];
