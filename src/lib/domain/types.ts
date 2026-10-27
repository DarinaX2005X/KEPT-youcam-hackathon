// Shared domain contract for Kept. See PLAN «Контракты». Change names only with MAIN.

export type Concern =
  | 'acne'
  | 'redness'
  | 'pore'
  | 'texture'
  | 'wrinkle'
  | 'moisture'
  | 'oiliness'
  | 'radiance'
  | 'age_spot'
  | 'dark_circle_v2'
  | 'eye_bag'
  | 'firmness';

export type SimConcern =
  | 'acne'
  | 'redness'
  | 'pores'
  | 'texture'
  | 'wrinkle'
  | 'oiliness'
  | 'radiance'
  | 'spots'
  | 'dark_circle'
  | 'eye_bags';

export interface ConcernScore {
  ui: number;
  raw: number;
}

export interface MaskStats {
  blemishCount?: number;
  areaPct?: number;
}

/** id: key in the IndexedDB blob store; url: static demo asset. */
export type BlobRef = { id: string } | { url: string };

export interface Active {
  id: string;
  name: string;
  /** Spellings that appear in INCI lists, lower case. */
  aliases: string[];
  group: 'exfoliant' | 'retinoid' | 'brightening' | 'barrier' | 'soothing' | 'anti_acne' | 'peptide' | 'eye' | 'sunscreen';
  targets: Concern[];
  watch: Concern[];
  onsetDay: number;
  fullEffectDay: number;
  purge?: { fromDay: number; toDay: number };
  irritation: 'low' | 'medium' | 'high';
  prevention?: boolean;
  /** Target intensities for YouCam Skin Simulation, 0..1. */
  simulation: Partial<Record<SimConcern, number>>;
  /** One sentence for the interface. */
  note: string;
}

export interface Product {
  name: string;
  actives: string[];
  inci?: string;
}

export interface TrialPlan {
  checkinDays: number[];
  onsetDay: number;
  fullEffectDay: number;
  purge?: { fromDay: number; toDay: number };
}

export interface CaptureMeta {
  source: 'camera' | 'upload' | 'sample';
  luminance: number;
  faceWidthRatio?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  sharpness?: number;
  alignment?: number;
  /** 12 anchor points [x, y, ...] as fractions of the 3:4 crop, used for the day-0 outline. */
  anchors?: number[];
}

export interface DiaryEntry {
  newProduct?: boolean;
  period?: boolean;
  sun?: boolean;
  poorSleep?: boolean;
  note?: string;
}

export interface Scan {
  id: string;
  trialId: string;
  kind: 'baseline' | 'checkin';
  day: number;
  takenAt: string;
  photo: BlobRef;
  masks: Partial<Record<Concern, BlobRef>>;
  scores: Partial<Record<Concern, ConcernScore>>;
  overall: number;
  skinAge: number;
  maskStats: Partial<Record<Concern, MaskStats>>;
  capture: CaptureMeta;
  diary?: DiaryEntry;
}

export interface Projection {
  photo: BlobRef;
  scores: Partial<Record<Concern, ConcernScore>>;
  intensities: Partial<Record<SimConcern, number>>;
}

export interface Trial {
  id: string;
  product: Product;
  targets: Concern[];
  watch: Concern[];
  startedAt: string;
  plan: TrialPlan;
  projection?: Projection;
  status: 'testing' | 'kept' | 'stopped' | 'paused';
  decidedAt?: string;
  sample?: boolean;
}

export type VerdictKind = 'too_early' | 'on_track' | 'working' | 'purging' | 'reacting' | 'not_enough';

export interface Reason {
  text: string;
  tone: 'better' | 'worse' | 'flat' | 'info';
  concern?: Concern;
  delta?: number;
}

export interface Verdict {
  kind: VerdictKind;
  headline: string;
  summary: string;
  reasons: Reason[];
  confidence: 'high' | 'medium' | 'low';
  next: {
    action: 'keep_going' | 'reduce_use' | 'decide_keep' | 'decide_stop' | 'checkin';
    label: string;
    date?: string;
  };
}
