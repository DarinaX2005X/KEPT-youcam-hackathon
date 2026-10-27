import type { Concern, SimConcern } from './types';

export interface ConcernInfo {
  label: string;
  /** Name of the same area in YouCam Skin Simulation, when it can be simulated. */
  simName?: SimConcern;
  /** YouCam ui_score: higher always means better skin. */
  better: 'higher';
}

export const CONCERNS: Record<Concern, ConcernInfo> = {
  acne: { label: 'Acne', simName: 'acne', better: 'higher' },
  redness: { label: 'Redness', simName: 'redness', better: 'higher' },
  pore: { label: 'Pores', simName: 'pores', better: 'higher' },
  texture: { label: 'Texture', simName: 'texture', better: 'higher' },
  wrinkle: { label: 'Fine lines', simName: 'wrinkle', better: 'higher' },
  moisture: { label: 'Hydration', better: 'higher' },
  oiliness: { label: 'Oiliness', simName: 'oiliness', better: 'higher' },
  radiance: { label: 'Radiance', simName: 'radiance', better: 'higher' },
  age_spot: { label: 'Dark spots', simName: 'spots', better: 'higher' },
  dark_circle_v2: { label: 'Dark circles', simName: 'dark_circle', better: 'higher' },
  eye_bag: { label: 'Eye bags', simName: 'eye_bags', better: 'higher' },
  firmness: { label: 'Firmness', better: 'higher' },
};

export const CONCERN_IDS = Object.keys(CONCERNS) as Concern[];

export function isConcern(value: string): value is Concern {
  return Object.prototype.hasOwnProperty.call(CONCERNS, value);
}

export function concernLabel(c: Concern): string {
  return CONCERNS[c].label;
}

/** Label for the middle of a sentence: "pores", "fine lines". */
export function concernNoun(c: Concern): string {
  return CONCERNS[c].label.toLowerCase();
}

/** Plural-looking labels take "are" / "score": "your pores score 84". */
export function concernIsPlural(c: Concern): boolean {
  return /s$/.test(CONCERNS[c].label) && c !== 'redness' && c !== 'oiliness' && c !== 'firmness';
}

export function toSimConcern(c: Concern): SimConcern | undefined {
  return CONCERNS[c].simName;
}

/** "pores", "pores and oiliness", "acne, pores and oiliness". */
export function joinNouns(items: string[], conj: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}
