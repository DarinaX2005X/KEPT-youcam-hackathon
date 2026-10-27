import { describe, expect, it } from 'vitest';
import { addDays, buyCheck } from '@/lib/domain';
import type { BuyCheckResult, Scan, Trial } from '@/lib/domain';
import { makeScan, makeTrial } from './fixtures';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

interface Shelf {
  trials: Trial[];
  scans: Record<string, Scan[]>;
}

function shelf(...entries: [Trial, Scan[]][]): Shelf {
  return {
    trials: entries.map(([t]) => t),
    scans: Object.fromEntries(entries.map(([t, s]) => [t.id, s])),
  };
}

const check = (s: Shelf, input: { inci?: string; activeIds?: string[] }) => buyCheck(input, s.trials, s.scans, NOW);
const texts = (r: BuyCheckResult) => r.findings.map((f) => f.text);

/** Shelf 1: the demo shelf. Niacinamide stopped with no change, salicylic kept, retinal on day 21. */
function demoShelf(): Shelf {
  const niaStart = daysAgo(160);
  const nia = makeTrial(['niacinamide'], {
    id: 'nia',
    name: '10% niacinamide toner',
    targets: ['pore', 'oiliness'],
    watch: ['redness', 'moisture'],
    startedAt: niaStart,
    status: 'stopped',
    decidedAt: addDays(niaStart, 56),
  });
  const salStart = daysAgo(100);
  const sal = makeTrial(['salicylic'], {
    id: 'sal',
    name: '2% salicylic acid serum',
    startedAt: salStart,
    status: 'kept',
    decidedAt: addDays(salStart, 56),
  });
  const ret = makeTrial(['retinal'], {
    id: 'ret',
    name: '0.05% retinal cream',
    targets: ['acne', 'texture'],
    watch: ['redness', 'moisture'],
    startedAt: daysAgo(21),
  });
  return shelf(
    [
      nia,
      [0, 14, 28, 42, 56].map((d, i) =>
        makeScan(nia, d, { pore: 62 + (i % 2), oiliness: 60 - (i % 2), redness: 66, moisture: 58 }),
      ),
    ],
    [
      sal,
      [
        makeScan(sal, 0, { acne: 58, pore: 62, oiliness: 60, redness: 66 }),
        makeScan(sal, 56, { acne: 76, pore: 70, oiliness: 67, redness: 68 }),
      ],
    ],
    [
      ret,
      [
        makeScan(ret, 0, { acne: 74, texture: 62, redness: 68, moisture: 58 }),
        makeScan(ret, 18, { acne: 68, texture: 63, redness: 67, moisture: 57 }),
      ],
    ],
  );
}

/** Shelf 2: one azelaic acid trial in progress, acne and pores low on the last scan. */
function roomShelf(): Shelf {
  const aze = makeTrial(['azelaic'], { id: 'aze', name: 'Azelaic acid gel', startedAt: daysAgo(10) });
  return shelf([
    aze,
    [
      makeScan(aze, 0, { acne: 55, pore: 61, redness: 70, age_spot: 72 }),
      makeScan(aze, 7, { acne: 58, pore: 61, redness: 71, age_spot: 72 }),
    ],
  ]);
}

/** Shelf 3: a caffeine eye cream kept, pores already score 84. */
function goodPoresShelf(): Shelf {
  const start = daysAgo(80);
  const eye = makeTrial(['caffeine'], {
    id: 'eye',
    name: 'Caffeine eye serum',
    startedAt: start,
    status: 'kept',
    decidedAt: addDays(start, 56),
  });
  return shelf([
    eye,
    [
      makeScan(eye, 0, { eye_bag: 60, dark_circle_v2: 58, pore: 83 }),
      makeScan(eye, 56, { eye_bag: 68, dark_circle_v2: 64, pore: 84 }),
    ],
  ]);
}

describe('buyCheck on the demo shelf', () => {
  it('a new niacinamide toner: you stopped one that did nothing', () => {
    const r = check(demoShelf(), { inci: 'Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Tamarindus Indica Seed Gum' });
    expect(r.actives.map((a) => a.id)).toEqual(['niacinamide']);
    expect(r.verdict).toBe('think_twice');
    expect(r.findings[0]).toEqual({
      tone: 'worse',
      title: "Didn't work for you before",
      text: "Niacinamide didn't change your pores or oiliness in 56 days",
      trialId: 'nia',
    });
  });

  it('another salicylic serum: already covered by the kept trial', () => {
    const r = check(demoShelf(), { inci: 'Water, Salicylic Acid 2%, Butylene Glycol, Allantoin' });
    // allantoin is a second, uncovered active, so ask with salicylic alone too
    expect(texts(r)).toContain('You already use salicylic acid in 2% salicylic acid serum (kept after 56 days)');
    const only = check(demoShelf(), { activeIds: ['salicylic'] });
    expect(only.verdict).toBe('already_covered');
    expect(only.findings[0].trialId).toBe('sal');
  });

  it('a glycolic toner while the retinal trial runs: may irritate', () => {
    const r = check(demoShelf(), { activeIds: ['glycolic'] });
    expect(r.verdict).toBe('think_twice');
    expect(texts(r)).toContain(
      'Using this with 0.05% retinal cream at the same time can irritate. Start it after that trial ends',
    );
  });

  it('retinal itself: already being tested, with the day', () => {
    const r = check(demoShelf(), { activeIds: ['retinal'] });
    expect(r.verdict).toBe('already_covered');
    expect(texts(r)).toContain('You already use retinal in 0.05% retinal cream (testing, day 21)');
  });
});

describe('buyCheck on a shelf with room to improve', () => {
  it('salicylic acid targets low acne and pores with no conflict: worth trying', () => {
    const r = check(roomShelf(), { inci: 'Aqua, Salicylic Acid, Propanediol' });
    expect(r.verdict).toBe('worth_trying');
    expect(r.findings[0]).toMatchObject({ tone: 'better', title: 'Room to improve' });
    expect(r.findings[0].text).toBe(
      'Your acne scores 58 on your last scan, so there is room for a visible change. Salicylic acid usually shows first changes after 2 weeks',
    );
  });

  it('the same salicylic acid next to adapalene being tested: think twice', () => {
    const s = roomShelf();
    s.trials[0] = { ...s.trials[0], product: { name: 'Adapalene gel', actives: ['adapalene'] } };
    expect(check(s, { activeIds: ['salicylic'] }).verdict).toBe('think_twice');
  });
});

describe('buyCheck on a shelf where pores are already good', () => {
  it('a niacinamide serum targets something that is not a problem', () => {
    const r = check(goodPoresShelf(), { activeIds: ['niacinamide'] });
    expect(r.verdict).toBe('think_twice');
    expect(texts(r)).toContain(
      "Your pores already score 84. This product targets something that isn't a problem for you",
    );
  });

  it('a sunscreen is worth it for prevention', () => {
    const r = check(goodPoresShelf(), { inci: 'Aqua, Homosalate, Octocrylene, Avobenzone' });
    expect(r.actives.map((a) => a.id)).toEqual(['sunscreen']);
    expect(r.verdict).toBe('worth_trying');
    expect(r.findings[0].title).toBe('Protection, not a quick change');
  });
});

describe('buyCheck without history', () => {
  it('works from ingredients alone', () => {
    const r = buyCheck({ inci: 'Aqua, Adapalene 0.1%' }, [], {}, NOW);
    expect(r.verdict).toBe('worth_trying');
    expect(r.findings[0].title).toBe('New for your skin');
  });

  it('nothing recognisable: think twice and say so', () => {
    const r = buyCheck({ inci: 'Aqua, Dimethicone, Parfum' }, [], {}, NOW);
    expect(r.actives).toEqual([]);
    expect(r.verdict).toBe('think_twice');
  });

  it('keeps the copy rules', () => {
    for (const r of [
      check(demoShelf(), { activeIds: ['niacinamide', 'glycolic', 'salicylic'] }),
      check(roomShelf(), { activeIds: ['salicylic'] }),
      check(goodPoresShelf(), { activeIds: ['niacinamide', 'sunscreen'] }),
    ]) {
      for (const f of r.findings) {
        expect(f.title).not.toMatch(/[.!]$/);
        expect(f.text).not.toMatch(/!|—|–| - |\.$/);
      }
    }
  });
});
