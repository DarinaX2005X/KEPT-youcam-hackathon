// Analysis, simulation and aging runs: upload → task → poll → download (PLAN «Архитектура», steps 3–6).
import type { Concern, ConcernScore, MaskStats, SimConcern } from '@/lib/domain/types';
import type { AnalysisResult, TaskKind } from '@/server/youcam/types';
import { createTask, fetchAsset, pollTask, uploadPhoto, type PollOptions } from './api';
import { MESSAGES, ScanError } from './errors';
import { STATS_CONCERNS } from './mask-core';
import { maskStats } from './maskStats';

export type ScanStep = 'uploading' | 'analyzing' | 'downloading' | 'done';

export interface AnalysisOutcome {
  scores: Partial<Record<Concern, ConcernScore>>;
  overall: number;
  skinAge: number;
  /** The photo as YouCam aligned and resized it; the masks are drawn for this frame. */
  image: Blob;
  masks: Partial<Record<Concern, Blob>>;
  maskStats: Partial<Record<Concern, MaskStats>>;
  /** YouCam file of the uploaded photo, reused by runSimulation. */
  fileId: string;
}

export interface AgingOutcome {
  age: number;
  frames: { age: number; image: Blob }[];
}

/** Abort signal and polling overrides. Aborting stops polling; the task on YouCam keeps running. */
export type RunOptions = PollOptions;

type OnStep = (step: ScanStep) => void;

/** Runs `fn`, attaching the task to resume to any failure that is not final for the task. */
async function forTask<T>(kind: TaskKind, taskId: string, fileId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Timeouts and dropped polls already carry the task. Download failures after success do not,
    // but polling the same task again returns fresh links. Engine errors (status 200) are final.
    const resumable =
      err instanceof ScanError && (!!err.retryTaskId || ((err.code === 'network' || err.code === 'upstream') && err.status !== 200));
    if (resumable) throw err.withTask(kind, taskId, fileId);
    throw err;
  }
}

async function downloadAnalysis(result: AnalysisResult, fileId: string, opts: RunOptions): Promise<AnalysisOutcome> {
  const entries = Object.entries(result.masks) as [Concern, string][];
  const [image, ...maskBlobs] = await Promise.all([
    fetchAsset(result.image, opts),
    ...entries.map(([, url]) => fetchAsset(url, opts)),
  ]);
  const masks: Partial<Record<Concern, Blob>> = {};
  entries.forEach(([c], i) => (masks[c] = maskBlobs[i]));

  const stats: Partial<Record<Concern, MaskStats>> = {};
  await Promise.all(
    STATS_CONCERNS.filter((c) => masks[c]).map(async (c) => {
      try {
        stats[c] = await maskStats(c, masks[c]!);
      } catch (err) {
        // The scores still stand without the count; the verdict skips a missing stat.
        console.warn(`[scan] ${c} mask could not be counted: ${(err as Error).message}`);
      }
    }),
  );
  opts.signal?.throwIfAborted();
  return { scores: result.scores, overall: result.overall, skinAge: result.skinAge, image, masks, maskStats: stats, fileId };
}

async function analysisFromTask(taskId: string, fileId: string, onStep: OnStep | undefined, opts: RunOptions) {
  return forTask('analysis', taskId, fileId, async () => {
    const result = await pollTask('analysis', taskId, opts);
    onStep?.('downloading');
    const outcome = await downloadAnalysis(result, fileId, opts);
    onStep?.('done');
    return outcome;
  });
}

/** Uploads the photo, analyzes `concerns` (1–8), downloads the aligned photo and masks, counts acne and redness masks. */
export async function runAnalysis(photo: Blob, concerns: Concern[], onStep?: OnStep, opts: RunOptions = {}): Promise<AnalysisOutcome> {
  onStep?.('uploading');
  const fileId = await uploadPhoto(photo, opts);
  onStep?.('analyzing');
  const taskId = await createTask({ kind: 'analysis', fileId, concerns }, opts);
  return analysisFromTask(taskId, fileId, onStep, opts);
}

/** Continues an analysis after a timeout or a dropped connection: polls the same task, never creates a new one. */
export async function resumeAnalysis(taskId: string, fileId: string, onStep?: OnStep, opts: RunOptions = {}): Promise<AnalysisOutcome> {
  onStep?.('analyzing');
  return analysisFromTask(taskId, fileId, onStep, opts);
}

/** True when at least one intensity is a number above 0 — the only kind of request YouCam accepts. */
export function hasIntensity(intensities: Partial<Record<SimConcern, number>>): boolean {
  return Object.values(intensities).some((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

async function simulationFromTask(taskId: string, fileId: string, onStep: OnStep | undefined, opts: RunOptions): Promise<Blob> {
  return forTask('simulation', taskId, fileId, async () => {
    const result = await pollTask('simulation', taskId, opts);
    onStep?.('downloading');
    const image = await fetchAsset(result.image, opts);
    onStep?.('done');
    return image;
  });
}

/**
 * Simulates the target look on a file that is already uploaded (the baseline's `fileId`).
 * Rejects without calling the API when no intensity is above 0 (`simulationFor` returns `{}`
 * when none of the targets can be simulated).
 */
export async function runSimulation(
  fileId: string,
  intensities: Partial<Record<SimConcern, number>>,
  onStep?: OnStep,
  opts: RunOptions = {},
): Promise<Blob> {
  if (!hasIntensity(intensities)) throw new ScanError('upstream', MESSAGES.nothingToSimulate);
  const clean = Object.fromEntries(Object.entries(intensities).filter(([, v]) => typeof v === 'number' && v > 0)) as Partial<
    Record<SimConcern, number>
  >;
  onStep?.('analyzing');
  const taskId = await createTask({ kind: 'simulation', fileId, intensities: clean }, opts);
  return simulationFromTask(taskId, fileId, onStep, opts);
}

export async function resumeSimulation(taskId: string, fileId: string, onStep?: OnStep, opts: RunOptions = {}): Promise<Blob> {
  onStep?.('analyzing');
  return simulationFromTask(taskId, fileId, onStep, opts);
}

async function agingFromTask(taskId: string, fileId: string, onStep: OnStep | undefined, opts: RunOptions): Promise<AgingOutcome> {
  return forTask('aging', taskId, fileId, async () => {
    const result = await pollTask('aging', taskId, opts);
    onStep?.('downloading');
    const images = await Promise.all(result.frames.map((f) => fetchAsset(f.image, opts)));
    onStep?.('done');
    return { age: result.age, frames: result.frames.map((f, i) => ({ age: f.age, image: images[i] })) };
  });
}

/** Uploads the photo and runs YouCam aging: the face at other ages. */
export async function runAging(photo: Blob, onStep?: OnStep, opts: RunOptions = {}): Promise<AgingOutcome> {
  onStep?.('uploading');
  const fileId = await uploadPhoto(photo, opts);
  onStep?.('analyzing');
  const taskId = await createTask({ kind: 'aging', fileId }, opts);
  return agingFromTask(taskId, fileId, onStep, opts);
}

export async function resumeAging(taskId: string, fileId: string, onStep?: OnStep, opts: RunOptions = {}): Promise<AgingOutcome> {
  onStep?.('analyzing');
  return agingFromTask(taskId, fileId, onStep, opts);
}
