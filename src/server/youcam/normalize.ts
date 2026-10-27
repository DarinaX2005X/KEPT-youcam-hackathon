// Turns raw YouCam task payloads into the Kept API shapes (PLAN «Серверный API»).
import type { Concern, ConcernScore } from '@/lib/domain/types';
import type { RawTaskStatus } from './client';
import type { AgingResult, AnalysisResult, EngineErrorCode, SimulationResult } from './types';

export const CONCERNS: readonly Concern[] = [
  'acne', 'redness', 'pore', 'texture', 'wrinkle', 'moisture', 'oiliness',
  'radiance', 'age_spot', 'dark_circle_v2', 'eye_bag', 'firmness',
];
const CONCERN_SET = new Set<string>(CONCERNS);

export const assetUrl = (url: string) => `/api/youcam/asset?u=${encodeURIComponent(url)}`;

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function resultsOf(data: RawTaskStatus): Record<string, unknown> {
  const r = data.results;
  if (!r || typeof r !== 'object') throw new NormalizeError('YouCam result has no results');
  return r as Record<string, unknown>;
}

interface RawOutputItem {
  type?: string;
  ui_score?: number;
  raw_score?: number;
  score?: number;
  mask_urls?: string[];
  url?: string | null;
  res_age?: number;
}

export function normalizeAnalysis(data: RawTaskStatus): AnalysisResult {
  const output = resultsOf(data).output;
  if (!Array.isArray(output)) throw new NormalizeError('Analysis result has no output');

  const scores: Partial<Record<Concern, ConcernScore>> = {};
  const masks: Partial<Record<Concern, string>> = {};
  let overall: number | undefined;
  let skinAge: number | undefined;
  let image: string | undefined;

  for (const item of output as RawOutputItem[]) {
    if (!item || typeof item.type !== 'string') continue;
    if (item.type === 'all') {
      if (isNum(item.score)) overall = item.score;
    } else if (item.type === 'skin_age') {
      if (isNum(item.score)) skinAge = item.score;
    } else if (item.type === 'resize_image') {
      const u = item.mask_urls?.[0];
      if (u) image = assetUrl(u);
    } else if (CONCERN_SET.has(item.type)) {
      const c = item.type as Concern;
      if (isNum(item.ui_score)) scores[c] = { ui: item.ui_score, raw: isNum(item.raw_score) ? item.raw_score : item.ui_score };
      const m = item.mask_urls?.[0];
      if (m) masks[c] = assetUrl(m);
    }
  }

  if (Object.keys(scores).length === 0) throw new NormalizeError('Analysis result has no concern scores');
  if (!image) throw new NormalizeError('Analysis result has no aligned image');
  if (overall === undefined) {
    const vals = Object.values(scores).map((s) => s!.ui);
    overall = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return { scores, overall, skinAge: skinAge ?? 0, masks, image };
}

export function normalizeSimulation(data: RawTaskStatus): SimulationResult {
  const url = resultsOf(data).url;
  if (typeof url !== 'string' || !url) throw new NormalizeError('Simulation result has no image');
  return { image: assetUrl(url) };
}

export function normalizeAging(data: RawTaskStatus): AgingResult {
  const results = resultsOf(data);
  const output = results.output;
  if (!Array.isArray(output)) throw new NormalizeError('Aging result has no output');
  const frames = (output as RawOutputItem[])
    .filter((o) => o && typeof o.url === 'string' && o.url && isNum(o.res_age))
    .map((o) => ({ age: o.res_age as number, image: assetUrl(o.url as string) }))
    .sort((a, b) => a.age - b.age);
  if (frames.length === 0) throw new NormalizeError('Aging result has no frames');
  return { age: isNum(results.age) ? results.age : 0, frames };
}

export const ENGINE_MESSAGES = {
  tooSmall: 'Your face is too small in the photo. Move closer so it fills the oval',
  dark: 'The photo is too dark. Face a window or a lamp',
  noFace: "We couldn't find a face. Look straight at the camera",
  outOfBound: 'Part of your face is outside the frame',
  smallImage: 'This photo is too small. Use one at least 480 px wide',
  angle: 'Turn your head straight to the camera',
  generic: "YouCam couldn't analyze this photo. Try another one",
} as const;

const ENGINE_ERRORS: Record<string, { code: EngineErrorCode; message: string }> = {
  error_src_face_too_small: { code: 'face', message: ENGINE_MESSAGES.tooSmall },
  error_face_position_too_small: { code: 'face', message: ENGINE_MESSAGES.tooSmall },
  error_lighting_dark: { code: 'light', message: ENGINE_MESSAGES.dark },
  error_no_face: { code: 'face', message: ENGINE_MESSAGES.noFace },
  error_src_face_out_of_bound: { code: 'face', message: ENGINE_MESSAGES.outOfBound },
  error_face_position_out_of_boundary: { code: 'face', message: ENGINE_MESSAGES.outOfBound },
  error_below_min_image_size: { code: 'face', message: ENGINE_MESSAGES.smallImage },
  error_face_not_forward_facing: { code: 'face', message: ENGINE_MESSAGES.angle },
};

/** Maps a YouCam engine error (`data.error`) to a coarse code and a human message. */
export function engineError(error: string | null | undefined): { code: EngineErrorCode; message: string } {
  if (error) {
    const known = ENGINE_ERRORS[error];
    if (known) return known;
    if (error.startsWith('error_face_angle_')) return { code: 'face', message: ENGINE_MESSAGES.angle };
  }
  return { code: 'upstream', message: ENGINE_MESSAGES.generic };
}
