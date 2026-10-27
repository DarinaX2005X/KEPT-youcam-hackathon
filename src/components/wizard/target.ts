// The trial's target: Skin Simulation on the baseline photo, then the same analysis on the result.
import { simulationFor, type Active, type Concern } from '@/lib/domain';
import { hasIntensity, prepareImage, runAnalysis, runSimulation } from '@/lib/scan';
import { uploadPhoto } from '@/lib/scan/api';
import { putBlob } from '@/lib/store';
import type { TargetData } from './state';

export type TargetPhase = 'simulating' | 'measuring';

export const TARGET_STEPS: { id: TargetPhase; label: string }[] = [
  { id: 'simulating', label: 'Simulating your target' },
  { id: 'measuring', label: 'Measuring the target' },
];

export interface CreateProjectionInput {
  actives: readonly Active[];
  targets: readonly Concern[];
  /** Areas measured on the target: the trial's targets and watch, same as the baseline. */
  zones: readonly Concern[];
  /** YouCam file of the baseline photo. Without it, `photo` is uploaded first. */
  fileId?: string;
  photo?: Blob;
  onPhase?: (phase: TargetPhase) => void;
  signal?: AbortSignal;
}

/** True when at least one target has a Skin Simulation counterpart. */
export function canSimulate(actives: readonly Active[], targets: readonly Concern[]): boolean {
  return hasIntensity(simulationFor(actives, targets));
}

/**
 * Builds `Trial.projection` data: simulate (4–6 units), then analyse the simulated face (9–12 units).
 * Returns null when nothing can be simulated. Rejects with a ScanError; callers must not retry on
 * their own, YouCam charges for failed tasks too. Usable from the trial page («Create target»):
 * pass the saved baseline photo as `photo` and leave out `fileId`.
 */
export async function createProjection(input: CreateProjectionInput): Promise<TargetData | null> {
  const intensities = simulationFor(input.actives, [...input.targets]);
  if (!hasIntensity(intensities)) return null;
  const opts = { signal: input.signal };

  input.onPhase?.('simulating');
  let fileId = input.fileId;
  if (!fileId) {
    if (!input.photo) throw new Error('createProjection needs a fileId or a photo');
    const prepared = await prepareImage(input.photo);
    fileId = await uploadPhoto(prepared.blob, opts);
  }
  const simulated = await runSimulation(fileId, intensities, undefined, opts);

  input.onPhase?.('measuring');
  const prepared = await prepareImage(simulated);
  input.signal?.throwIfAborted();
  const outcome = await runAnalysis(prepared.blob, [...input.zones], undefined, opts);
  const photo = await putBlob(outcome.image);
  return { photo, scores: outcome.scores, intensities };
}
