// Shapes of the Kept server API (PLAN «Серверный API»). Type-only: safe to import from client code.
import type { Concern, ConcernScore, SimConcern } from '@/lib/domain/types';

export type TaskKind = 'analysis' | 'simulation' | 'aging';

export interface AnalysisResult {
  scores: Partial<Record<Concern, ConcernScore>>;
  overall: number;
  skinAge: number;
  /** `/api/youcam/asset?u=…` links to the YouCam mask PNGs. */
  masks: Partial<Record<Concern, string>>;
  /** `/api/youcam/asset?u=…` link to the photo YouCam aligned and resized. */
  image: string;
}

export interface SimulationResult {
  image: string;
}

export interface AgingResult {
  age: number;
  frames: { age: number; image: string }[];
}

export interface TaskResultByKind {
  analysis: AnalysisResult;
  simulation: SimulationResult;
  aging: AgingResult;
}

/** Coarse error class for the UI: `face` and `light` send the user back to the camera. */
export type EngineErrorCode = 'face' | 'light' | 'upstream';

export type TaskPoll<K extends TaskKind = TaskKind> =
  | { status: 'running' }
  | { status: 'error'; code: EngineErrorCode; message: string }
  | { status: 'success'; result: TaskResultByKind[K] };

export type TaskRequest =
  | { kind: 'analysis'; fileId: string; concerns: Concern[] }
  | { kind: 'simulation'; fileId: string; intensities: Partial<Record<SimConcern, number>> }
  | { kind: 'aging'; fileId: string };

export interface ApiError {
  error: 'bad_image' | 'bad_request' | 'limit' | 'upstream';
  message: string;
}
