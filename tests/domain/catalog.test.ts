import { describe, expect, it } from 'vitest';
import {
  ACTIVES,
  CONCERNS,
  CONCERN_IDS,
  concernLabel,
  getActive,
  isConcern,
  parseInci,
  searchActives,
  toSimConcern,
} from '@/lib/domain';

describe('concerns', () => {
  it('labels and simulation names follow the contract', () => {
    expect(CONCERN_IDS).toHaveLength(12);
    expect(concernLabel('pore')).toBe('Pores');
    expect(concernLabel('moisture')).toBe('Hydration');
    expect(concernLabel('dark_circle_v2')).toBe('Dark circles');
    expect(toSimConcern('pore')).toBe('pores');
    expect(toSimConcern('age_spot')).toBe('spots');
    expect(toSimConcern('dark_circle_v2')).toBe('dark_circle');
    expect(toSimConcern('eye_bag')).toBe('eye_bags');
    expect(toSimConcern('moisture')).toBeUndefined();
    expect(toSimConcern('firmness')).toBeUndefined();
    expect(Object.values(CONCERNS).every((c) => c.better === 'higher')).toBe(true);
    expect(isConcern('acne')).toBe(true);
    expect(isConcern('pores')).toBe(false);
  });
});

describe('actives', () => {
  it('has at least 16 well formed actives', () => {
    expect(ACTIVES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(ACTIVES.map((a) => a.id)).size).toBe(ACTIVES.length);
    for (const a of ACTIVES) {
      expect(a.onsetDay, a.id).toBeLessThan(a.fullEffectDay);
      if (a.purge) expect(a.purge.fromDay, a.id).toBeLessThan(a.purge.toDay);
      for (const alias of a.aliases) expect(alias, a.id).toBe(alias.toLowerCase());
      for (const v of Object.values(a.simulation)) expect(v).toBeGreaterThan(0);
      expect(a.note.length).toBeGreaterThan(10);
      expect(a.note).not.toMatch(/[!—–]|\.$/);
      for (const t of a.watch) expect(a.targets, a.id).not.toContain(t);
    }
  });

  it('keeps the demo ids and their parameters', () => {
    const s = getActive('salicylic')!;
    expect(s.targets).toEqual(['acne', 'pore', 'oiliness']);
    expect([s.onsetDay, s.fullEffectDay]).toEqual([14, 56]);
    expect(s.purge).toEqual({ fromDay: 7, toDay: 42 });
    expect(s.simulation).toEqual({ acne: 0.6, pores: 0.4, oiliness: 0.4 });
    const r = getActive('retinal')!;
    expect(r.onsetDay).toBe(21);
    expect(r.purge).toEqual(getActive('retinol')!.purge);
    expect(getActive('niacinamide')!.fullEffectDay).toBe(56);
    expect(getActive('sunscreen')!.prevention).toBe(true);
    expect(getActive('sunscreen')!.targets).toEqual([]);
  });

  it("searchActives('sal') puts salicylic acid first", () => {
    const found = searchActives('sal');
    expect(found[0].id).toBe('salicylic');
    expect(found.map((a) => a.id)).toContain('sunscreen'); // ethylhexyl salicylate, later
  });

  it('search is case insensitive and finds aliases and plain words', () => {
    expect(searchActives('NIACIN')[0].id).toBe('niacinamide');
    expect(searchActives('bakuchiol')[0].id).toBe('gentle_retinoid');
    expect(searchActives('vitamin c')[0].id).toBe('vitamin_c');
    expect(searchActives('bha')[0].id).toBe('salicylic');
    expect(searchActives('  ')).toHaveLength(ACTIVES.length);
    expect(searchActives('zzzz')).toEqual([]);
  });
});

describe('parseInci', () => {
  it('reads a real serum list without mistaking ethylhexyl salicylate for sunscreen', () => {
    const r = parseInci(
      'Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Salicylic Acid, Sodium Hyaluronate, Ethylhexyl Salicylate',
    );
    expect(r.actives).toEqual(['niacinamide', 'salicylic', 'barrier']);
    expect(r.actives).not.toContain('sunscreen');
    expect(r.matched).toEqual([
      { activeId: 'niacinamide', token: 'niacinamide' },
      { activeId: 'salicylic', token: 'salicylic acid' },
      { activeId: 'barrier', token: 'sodium hyaluronate' },
    ]);
  });

  it('strips percentages, brackets and (and), splits on bullets and new lines', () => {
    const r = parseInci(
      'Water (Aqua) • Glycolic Acid 7%\nHydroxypinacolone Retinoate (and) Dimethyl Isosorbide; Centella Asiatica (Gotu Kola) Extract, Alpha Arbutin',
    );
    expect(r.actives).toEqual(['glycolic', 'gentle_retinoid', 'soothing', 'tranexamic']);
  });

  it('counts glycerin only near the top of the list', () => {
    expect(parseInci('Aqua, Glycerin, Niacinamide').actives).toEqual(['barrier', 'niacinamide']);
    expect(parseInci('Aqua, Niacinamide, Butylene Glycol, Propanediol, Dimethicone, Glycerin').actives).toEqual([
      'niacinamide',
    ]);
  });

  it('recognises a real sunscreen and a mineral one', () => {
    expect(
      parseInci('Aqua, Homosalate, Octocrylene, Butyl Methoxydibenzoylmethane, Glycerin, Tocopherol').actives,
    ).toEqual(['sunscreen', 'barrier']);
    expect(parseInci('Zinc Oxide 20%, Caprylic/Capric Triglyceride, Squalane').actives).toEqual([
      'sunscreen',
      'barrier',
    ]);
    // titanium dioxide written only as a colorant in brackets near the end is not an SPF
    expect(parseInci('Aqua, Glycerin, Mica, Silica, Dimethicone, Talc, CI 77891 (Titanium Dioxide)').actives).toEqual([
      'barrier',
    ]);
  });

  it('tells retinal, retinaldehyde and retinol apart, longest alias wins', () => {
    expect(parseInci('Retinaldehyde, Retinol').actives).toEqual(['retinal', 'retinol']);
    expect(parseInci('3-O-Ethyl Ascorbic Acid').matched).toEqual([
      { activeId: 'vitamin_c', token: '3-o-ethyl ascorbic acid' },
    ]);
    expect(parseInci('Salicylic Acidic Thing').actives).toEqual([]);
    expect(parseInci('').actives).toEqual([]);
  });
});
