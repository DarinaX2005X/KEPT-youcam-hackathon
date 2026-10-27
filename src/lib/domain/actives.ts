import type { Active } from './types';

const RETINOID_NOTE_TAIL = 'Expect dryness and a possible breakout in the first weeks';

export const ACTIVES: Active[] = [
  {
    id: 'salicylic',
    name: 'Salicylic acid',
    aliases: ['salicylic acid', 'betaine salicylate', 'willow bark extract', 'salix alba bark extract', 'salix nigra bark extract'],
    searchTerms: ['bha', 'beta hydroxy acid'],
    group: 'exfoliant',
    targets: ['acne', 'pore', 'oiliness'],
    watch: ['redness'],
    onsetDay: 14,
    fullEffectDay: 56,
    purge: { fromDay: 7, toDay: 42 },
    irritation: 'medium',
    simulation: { acne: 1, pores: 0.7, oiliness: 0.7 },
    note: 'Salicylic acid clears inside pores. First changes usually show after two to four weeks',
  },
  {
    id: 'benzoyl_peroxide',
    name: 'Benzoyl peroxide',
    aliases: ['benzoyl peroxide'],
    searchTerms: ['bpo'],
    group: 'anti_acne',
    targets: ['acne'],
    watch: ['redness', 'moisture'],
    onsetDay: 14,
    fullEffectDay: 56,
    irritation: 'high',
    simulation: { acne: 1 },
    note: 'Benzoyl peroxide kills acne bacteria. It can dry and bleach fabric, so start every other day',
  },
  {
    id: 'adapalene',
    name: 'Adapalene',
    aliases: ['adapalene'],
    searchTerms: ['differin', 'retinoid'],
    group: 'retinoid',
    targets: ['acne', 'texture', 'pore'],
    watch: ['redness', 'moisture'],
    onsetDay: 21,
    fullEffectDay: 84,
    purge: { fromDay: 14, toDay: 49 },
    irritation: 'high',
    simulation: { acne: 1, texture: 0.7, pores: 0.5 },
    note: `Adapalene is a retinoid made for acne. ${RETINOID_NOTE_TAIL}`,
  },
  {
    id: 'retinol',
    name: 'Retinol',
    aliases: ['retinol'],
    searchTerms: ['vitamin a', 'retinoid'],
    group: 'retinoid',
    targets: ['texture', 'wrinkle', 'age_spot', 'acne'],
    watch: ['redness', 'moisture'],
    onsetDay: 28,
    fullEffectDay: 84,
    purge: { fromDay: 14, toDay: 42 },
    irritation: 'high',
    simulation: { texture: 0.85, wrinkle: 0.7, spots: 0.5, acne: 0.7 },
    note: `Retinol speeds up skin renewal for smoother texture and fewer fine lines. ${RETINOID_NOTE_TAIL}`,
  },
  {
    id: 'retinal',
    name: 'Retinal',
    aliases: ['retinal', 'retinaldehyde'],
    searchTerms: ['vitamin a', 'retinoid'],
    group: 'retinoid',
    targets: ['texture', 'wrinkle', 'age_spot', 'acne'],
    watch: ['redness', 'moisture'],
    onsetDay: 21,
    fullEffectDay: 84,
    purge: { fromDay: 14, toDay: 42 },
    irritation: 'high',
    simulation: { texture: 0.85, wrinkle: 0.7, spots: 0.5, acne: 0.7 },
    note: `Retinal works one step faster than retinol. ${RETINOID_NOTE_TAIL}`,
  },
  {
    id: 'gentle_retinoid',
    name: 'Gentle retinoids',
    aliases: ['hydroxypinacolone retinoate', 'retinyl palmitate', 'retinyl retinoate', 'bakuchiol'],
    searchTerms: ['granactive', 'hpr'],
    group: 'retinoid',
    targets: ['texture', 'wrinkle'],
    watch: ['redness'],
    onsetDay: 28,
    fullEffectDay: 84,
    irritation: 'low',
    simulation: { texture: 0.5, wrinkle: 0.5 },
    note: 'Gentle retinoids and bakuchiol smooth skin slowly with little irritation',
  },
  {
    id: 'glycolic',
    name: 'Glycolic acid',
    aliases: ['glycolic acid'],
    searchTerms: ['aha', 'alpha hydroxy acid'],
    group: 'exfoliant',
    targets: ['texture', 'radiance', 'age_spot'],
    watch: ['redness'],
    onsetDay: 14,
    fullEffectDay: 42,
    purge: { fromDay: 7, toDay: 28 },
    irritation: 'medium',
    simulation: { texture: 0.7, radiance: 0.7, spots: 0.5 },
    note: 'Glycolic acid loosens dead skin for a smoother, brighter surface',
  },
  {
    id: 'lactic',
    name: 'Lactic and mandelic acids',
    aliases: ['lactic acid', 'mandelic acid', 'gluconolactone', 'lactobionic acid'],
    searchTerms: ['aha', 'pha', 'polyhydroxy acid'],
    group: 'exfoliant',
    targets: ['texture', 'radiance'],
    watch: ['redness', 'moisture'],
    onsetDay: 14,
    fullEffectDay: 42,
    irritation: 'low',
    simulation: { texture: 0.5, radiance: 0.5 },
    note: 'Lactic and mandelic acids exfoliate gently and suit sensitive skin',
  },
  {
    id: 'azelaic',
    name: 'Azelaic acid',
    aliases: ['azelaic acid', 'potassium azeloyl diglycinate'],
    group: 'anti_acne',
    targets: ['redness', 'acne', 'age_spot'],
    watch: ['moisture'],
    onsetDay: 28,
    fullEffectDay: 84,
    irritation: 'low',
    simulation: { redness: 0.4, acne: 0.7, spots: 0.5 },
    note: 'Azelaic acid calms redness and breakouts and fades marks over a few months',
  },
  {
    id: 'niacinamide',
    name: 'Niacinamide',
    aliases: ['niacinamide'],
    searchTerms: ['vitamin b3', 'nicotinamide'],
    group: 'brightening',
    targets: ['pore', 'oiliness', 'redness', 'age_spot'],
    watch: ['moisture'],
    onsetDay: 28,
    fullEffectDay: 56,
    irritation: 'low',
    simulation: { pores: 0.7, oiliness: 0.7, redness: 0.3 },
    note: 'Niacinamide helps with oil, pores and uneven tone. Changes usually take about a month',
  },
  {
    id: 'vitamin_c',
    name: 'Vitamin C',
    aliases: [
      'ascorbic acid',
      'sodium ascorbyl phosphate',
      'magnesium ascorbyl phosphate',
      'ascorbyl glucoside',
      '3-o-ethyl ascorbic acid',
      'ethyl ascorbic acid',
      'tetrahexyldecyl ascorbate',
    ],
    searchTerms: ['vitamin c', 'l-ascorbic'],
    group: 'brightening',
    targets: ['radiance', 'age_spot'],
    watch: ['redness'],
    onsetDay: 28,
    fullEffectDay: 84,
    irritation: 'medium',
    simulation: { radiance: 0.7, spots: 0.7 },
    note: 'Vitamin C brightens dull skin and fades dark spots over two to three months',
  },
  {
    id: 'tranexamic',
    name: 'Tranexamic acid and arbutin',
    aliases: ['tranexamic acid', 'alpha-arbutin', 'arbutin', 'kojic acid'],
    searchTerms: ['brightening', 'pigmentation'],
    group: 'brightening',
    targets: ['age_spot', 'radiance'],
    watch: [],
    onsetDay: 42,
    fullEffectDay: 84,
    irritation: 'low',
    simulation: { spots: 0.85, radiance: 0.5 },
    note: 'Tranexamic acid, arbutin and kojic acid fade dark spots slowly and gently',
  },
  {
    id: 'barrier',
    name: 'Ceramides and hydrators',
    aliases: [
      'ceramide np',
      'ceramide ap',
      'ceramide eop',
      'sodium hyaluronate',
      'hyaluronic acid',
      'hydrolyzed hyaluronic acid',
      'squalane',
      'panthenol',
      'glycerin',
    ],
    leadingOnly: ['glycerin'],
    searchTerms: ['barrier', 'hydration', 'ceramides'],
    group: 'barrier',
    targets: ['moisture', 'texture', 'redness'],
    watch: [],
    onsetDay: 7,
    fullEffectDay: 28,
    irritation: 'low',
    simulation: { texture: 0.5, redness: 0.2 },
    note: 'Ceramides and humectants hold water in the skin. Hydration often changes within a week',
  },
  {
    id: 'soothing',
    name: 'Soothing extracts',
    aliases: ['centella asiatica extract', 'centella asiatica leaf extract', 'madecassoside', 'asiaticoside', 'allantoin', 'bisabolol'],
    searchTerms: ['cica', 'centella'],
    group: 'soothing',
    targets: ['redness'],
    watch: [],
    onsetDay: 7,
    fullEffectDay: 28,
    irritation: 'low',
    simulation: { redness: 0.4 },
    note: 'Centella and allantoin calm irritated skin and can soften redness in a few weeks',
  },
  {
    id: 'peptides',
    name: 'Peptides',
    aliases: [
      'palmitoyl tripeptide-1',
      'palmitoyl tetrapeptide-7',
      'acetyl hexapeptide-8',
      'copper tripeptide-1',
      'matrixyl',
      'palmitoyl pentapeptide-4',
    ],
    searchTerms: ['argireline', 'copper peptide'],
    group: 'peptide',
    targets: ['wrinkle', 'firmness'],
    watch: [],
    onsetDay: 56,
    fullEffectDay: 84,
    irritation: 'low',
    simulation: { wrinkle: 0.5 },
    note: 'Peptides support firmness slowly. Give them at least two months',
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    aliases: ['caffeine'],
    searchTerms: ['eye cream'],
    group: 'eye',
    targets: ['eye_bag', 'dark_circle_v2'],
    watch: [],
    onsetDay: 14,
    fullEffectDay: 56,
    irritation: 'low',
    simulation: { eye_bags: 0.5, dark_circle: 0.5 },
    note: 'Caffeine can reduce puffiness under the eyes for a few hours after use',
  },
  {
    id: 'sunscreen',
    name: 'Sunscreen filters',
    aliases: [
      'zinc oxide',
      'titanium dioxide',
      'avobenzone',
      'butyl methoxydibenzoylmethane',
      'octocrylene',
      'homosalate',
      'ethylhexyl salicylate',
      'octisalate',
      'bis-ethylhexyloxyphenol methoxyphenyl triazine',
      'diethylamino hydroxybenzoyl hexyl benzoate',
      'ethylhexyl triazone',
      'drometrizole trisiloxane',
      'terephthalylidene dicamphor sulfonic acid',
      'methylene bis-benzotriazolyl tetramethylbutylphenol',
      'tris-biphenyl triazine',
    ],
    searchTerms: ['spf', 'sunscreen', 'uv filter'],
    group: 'sunscreen',
    targets: [],
    watch: [],
    onsetDay: 28,
    fullEffectDay: 56,
    irritation: 'low',
    prevention: true,
    simulation: {},
    note: 'Sunscreen prevents damage rather than changing skin in weeks, so its effect shows over years',
  },
];

const BY_ID = new Map(ACTIVES.map((a) => [a.id, a]));

export function getActive(id: string): Active | undefined {
  return BY_ID.get(id);
}

/** Known actives for these ids, unknown ids skipped, order kept. */
export function activesFor(ids: readonly string[]): Active[] {
  const out: Active[] = [];
  for (const id of ids) {
    const a = BY_ID.get(id);
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

/** "Salicylic acid" → "salicylic acid", "Vitamin C" → "vitamin C" for the middle of a sentence. */
export function activeNoun(a: Active): string {
  return a.name.charAt(0).toLowerCase() + a.name.slice(1);
}

function wordStarts(text: string, q: string): boolean {
  return text.split(/[\s\-()/]+/).some((w) => w.startsWith(q));
}

/**
 * Case-insensitive search over name, aliases and search terms.
 * Rank: name starts with query, a name word starts with it, an alias or term starts with it,
 * an alias word starts with it, then plain substring.
 */
export function searchActives(query: string): Active[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [...ACTIVES];
  const ranked: { a: Active; rank: number; i: number }[] = [];
  ACTIVES.forEach((a, i) => {
    const name = a.name.toLowerCase();
    const words = [...a.aliases, ...(a.searchTerms ?? [])];
    let rank: number;
    if (name.startsWith(q)) rank = 0;
    else if (wordStarts(name, q)) rank = 1;
    else if (words.some((w) => w.startsWith(q))) rank = 2;
    else if (words.some((w) => wordStarts(w, q))) rank = 3;
    else if (name.includes(q) || words.some((w) => w.includes(q))) rank = 4;
    else return;
    ranked.push({ a, rank, i });
  });
  return ranked.sort((x, y) => x.rank - y.rank || x.i - y.i).map((r) => r.a);
}

/**
 * Verb agreeing with an active's name: «Salicylic acid (BHA) shows», «Ceramides and hydrators show».
 * `base` is the plural form, e.g. 'show', 'need', 'reach'.
 */
export function verb(active: Pick<Active, 'name'>, base: string): string {
  const bare = active.name.replace(/\s*\(.*\)\s*$/, '').trim();
  const plural = /and/i.test(bare) || /s$/i.test(bare);
  return plural ? base : base.endsWith('s') || base.endsWith('sh') || base.endsWith('ch') ? `${base}es` : `${base}s`;
}
