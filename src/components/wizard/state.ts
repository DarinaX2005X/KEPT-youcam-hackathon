import {
  activesFor,
  buildPlan,
  CONCERN_IDS,
  getActive,
  parseInci,
  pickConcerns,
  type Active,
  type BlobRef,
  type CaptureMeta,
  type Concern,
  type ConcernScore,
  type MaskStats,
  type SimConcern,
  type TrialPlan,
} from '@/lib/domain';

export type StepId = 'product' | 'goals' | 'baseline' | 'plan';
export type EntryMode = 'pick' | 'paste';

/** The analysed day 0 photo. Blobs already sit in IndexedDB, so a refresh keeps what YouCam was paid for. */
export interface BaselineData {
  photo: BlobRef;
  masks: Partial<Record<Concern, BlobRef>>;
  scores: Partial<Record<Concern, ConcernScore>>;
  overall: number;
  skinAge: number;
  maskStats: Partial<Record<Concern, MaskStats>>;
  capture: CaptureMeta;
  /** YouCam file of the uploaded photo; Skin Simulation runs on it. */
  fileId: string;
  zones: Concern[];
  takenAt: string;
}

export interface TargetData {
  photo: BlobRef;
  scores: Partial<Record<Concern, ConcernScore>>;
  intensities: Partial<Record<SimConcern, number>>;
}

export type TargetState =
  | { status: 'idle' }
  | { status: 'running' }
  /** None of the targets can be simulated. */
  | { status: 'skipped' }
  | { status: 'done'; data: TargetData }
  | { status: 'error'; message: string; limit: boolean };

export interface WizardState {
  v: 1;
  trialId: string;
  step: StepId;
  name: string;
  mode: EntryMode;
  picked: string[];
  inci: string;
  /** Actives found in the pasted list that the person removed. */
  excluded: string[];
  targets: Concern[];
  watch: Concern[];
  /** Actives key the goals were picked for; a different set of actives picks them again. */
  goalsFor: string;
  baseline: BaselineData | null;
  target: TargetState;
}

export const MAX_DEFAULT_ZONES = 4;
export const MAX_ZONES_HARD = 8;

export function initialState(trialId: string): WizardState {
  return {
    v: 1,
    trialId,
    step: 'product',
    name: '',
    mode: 'pick',
    picked: [],
    inci: '',
    excluded: [],
    targets: [],
    watch: [],
    goalsFor: '',
    baseline: null,
    target: { status: 'idle' },
  };
}

export type Action =
  | { type: 'restore'; state: WizardState }
  | { type: 'name'; value: string }
  | { type: 'mode'; value: EntryMode }
  | { type: 'picked'; value: string[] }
  | { type: 'inci'; value: string }
  | { type: 'exclude'; id: string }
  | { type: 'goto'; step: StepId }
  | { type: 'enterGoals' }
  | { type: 'toggleTarget'; concern: Concern }
  | { type: 'toggleWatch'; concern: Concern }
  | { type: 'baseline'; data: BaselineData | null }
  | { type: 'target'; value: TargetState };

/** The actives the trial is about, in the order they were found or picked. */
export function selectedIds(s: Pick<WizardState, 'mode' | 'picked' | 'inci' | 'excluded'>): string[] {
  if (s.mode === 'pick') return s.picked;
  return parseInci(s.inci).actives.filter((id) => !s.excluded.includes(id));
}

export function selectedActives(s: Pick<WizardState, 'mode' | 'picked' | 'inci' | 'excluded'>): Active[] {
  return activesFor(selectedIds(s));
}

export function isPreventionOnly(actives: readonly Active[]): boolean {
  return actives.length > 0 && actives.every((a) => a.prevention);
}

export function zonesOf(s: Pick<WizardState, 'targets' | 'watch'>): Concern[] {
  return [...s.targets, ...s.watch];
}

export function planFor(actives: readonly Active[]): TrialPlan {
  return buildPlan(actives.filter((a) => !a.prevention));
}

/** Zones the actives aim at, in priority order. */
export function activeTargets(actives: readonly Active[]): Concern[] {
  const out: Concern[] = [];
  for (const a of actives) for (const t of a.targets) if (!out.includes(t)) out.push(t);
  return out;
}

/** Zones worth watching for irritation with these actives. */
export function watchCandidates(actives: readonly Active[]): Concern[] {
  const out: Concern[] = [];
  if (actives.some((a) => a.irritation !== 'low')) out.push('redness');
  for (const a of actives) for (const w of a.watch) if (!out.includes(w)) out.push(w);
  return out;
}

export function moreAreas(actives: readonly Active[]): Concern[] {
  const main = activeTargets(actives);
  return CONCERN_IDS.filter((c) => !main.includes(c));
}

function without<T>(list: T[], item: T): T[] {
  return list.filter((x) => x !== item);
}

export function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'restore':
      return action.state;
    case 'name':
      return { ...state, name: action.value };
    case 'mode': {
      if (action.value === state.mode) return state;
      // Moving from the pasted list to picking by hand keeps what the list found.
      if (action.value === 'pick') {
        const found = selectedIds(state);
        const picked = [...state.picked];
        for (const id of found) if (!picked.includes(id)) picked.push(id);
        return { ...state, mode: 'pick', picked };
      }
      return { ...state, mode: 'paste' };
    }
    case 'picked':
      return { ...state, picked: action.value };
    case 'inci':
      return { ...state, inci: action.value };
    case 'exclude':
      return { ...state, excluded: [...state.excluded, action.id] };
    case 'goto':
      return { ...state, step: action.step };
    case 'enterGoals': {
      const ids = selectedIds(state);
      const key = ids.join(',');
      if (key === state.goalsFor && state.targets.length) return { ...state, step: 'goals' };
      const picked = pickConcerns(activesFor(ids));
      return { ...state, step: 'goals', goalsFor: key, targets: picked.targets, watch: picked.watch };
    }
    case 'toggleTarget': {
      const c = action.concern;
      if (state.targets.includes(c)) return { ...state, targets: without(state.targets, c) };
      const watch = without(state.watch, c);
      if (state.targets.length + watch.length >= MAX_ZONES_HARD) return state;
      return { ...state, targets: [...state.targets, c], watch };
    }
    case 'toggleWatch': {
      const c = action.concern;
      if (state.watch.includes(c)) return { ...state, watch: without(state.watch, c) };
      if (state.targets.includes(c) || zonesOf(state).length >= MAX_ZONES_HARD) return state;
      return { ...state, watch: [...state.watch, c] };
    }
    case 'baseline':
      return { ...state, baseline: action.data, target: { status: 'idle' } };
    case 'target':
      return { ...state, target: action.value };
  }
}

/* Draft in sessionStorage: a refresh keeps the input and the paid-for scans. */

const DRAFT_KEY = 'kept:start-draft';

export function readDraft(): WizardState | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WizardState;
    if (s?.v !== 1 || typeof s.trialId !== 'string') return null;
    const restored = { ...initialState(s.trialId), ...s };
    // A target that was being made when the page closed is lost. It is offered again by hand,
    // never restarted on its own: YouCam already charged for the first try.
    if (restored.target.status === 'running') {
      restored.target = { status: 'error', message: 'Making the target stopped when the page reloaded', limit: false };
    }
    return restored;
  } catch {
    return null;
  }
}

export function writeDraft(s: WizardState): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(s));
  } catch {
    // Private mode or a full quota: the wizard still works, a refresh just starts over.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** `/start?name=…&actives=id1,id2` from Before you buy. */
export function stateFromParams(params: URLSearchParams, trialId: string): WizardState | null {
  const name = params.get('name')?.trim() ?? '';
  const ids = (params.get('actives') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((id) => id && getActive(id));
  if (!name && !ids.length) return null;
  return { ...initialState(trialId), name, mode: 'pick', picked: [...new Set(ids)] };
}

/** "Week 8" for day 56, "Week 12" for day 84. */
export function weekLabel(day: number): string {
  return `Week ${Math.round(day / 7)}`;
}
