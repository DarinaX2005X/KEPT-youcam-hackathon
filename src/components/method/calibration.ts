// Repeat-photo calibration, read from the file the calibration script wrote (scripts/calibration.json).
import raw from '../../../scripts/calibration.json';
import type { Concern } from '@/lib/domain';

interface PhotoParams {
  dx?: number;
  dy?: number;
  scale?: number;
  brightness?: number;
  rotate?: number;
  blur?: number;
}

interface ZoneStats {
  values: number[];
  mean: number;
  range: number;
  sd: number;
  twoSigma: number;
}

interface CalibrationFile {
  generatedAt: string;
  photos: { id: string; label: string; params?: PhotoParams }[];
  scores: Record<string, Record<string, number>>;
  zones: Record<string, ZoneStats>;
  noise: number;
  extra?: {
    scores: Record<string, Record<string, number>>;
    zones: Record<string, ZoneStats>;
    noiseAllSixZones?: number;
  };
}

const file = raw as CalibrationFile;

export interface CalibrationArea extends ZoneStats {
  concern: Concern;
  /** True for areas that define NOISE; the extra ones were measured on the same photos for reference. */
  defining: boolean;
}

export interface CalibrationPhoto {
  id: string;
  description: string;
  scores: Partial<Record<Concern, number>>;
}

const pct = (n: number) => `${Math.round(Math.abs(n) * 1000) / 10}%`;

/** "Moved 3% across and 1% down, scaled to 97%" from the variant's parameters. */
function describe(params: PhotoParams | undefined): string {
  if (!params) return 'Original photo';
  const parts: string[] = [];
  if (params.dx !== undefined || params.dy !== undefined) {
    const moves: string[] = [];
    if (params.dx) moves.push(`${pct(params.dx)} across`);
    if (params.dy) moves.push(`${pct(params.dy)} ${params.dy > 0 ? 'down' : 'up'}`);
    if (moves.length) parts.push(`moved ${moves.join(' and ')}`);
  }
  if (params.scale !== undefined && params.scale !== 1) parts.push(`scaled to ${pct(params.scale)}`);
  if (params.brightness !== undefined && params.brightness !== 1) {
    parts.push(`${pct(params.brightness - 1)} ${params.brightness > 1 ? 'brighter' : 'darker'}`);
  }
  if (params.rotate) parts.push(`rotated ${Math.abs(params.rotate)}°`);
  if (params.blur) parts.push(`blurred by ${params.blur} px`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const definingIds = Object.keys(file.zones) as Concern[];
const extraIds = Object.keys(file.extra?.zones ?? {}) as Concern[];

export const CALIBRATION = {
  generatedAt: file.generatedAt,
  noise: file.noise,
  noiseAllAreas: file.extra?.noiseAllSixZones ?? file.noise,
  photos: file.photos.map<CalibrationPhoto>((p) => ({
    id: p.id,
    description: describe(p.params),
    scores: { ...file.scores[p.id], ...file.extra?.scores[p.id] } as Partial<Record<Concern, number>>,
  })),
  areas: [
    ...definingIds.map<CalibrationArea>((c) => ({ ...file.zones[c], concern: c, defining: true })),
    ...extraIds.map<CalibrationArea>((c) => ({ ...file.extra!.zones[c], concern: c, defining: false })),
  ],
};

/** Largest two-sigma among the areas that define NOISE, and among all measured areas. */
export const LARGEST_TWO_SIGMA = Math.max(...CALIBRATION.areas.filter((a) => a.defining).map((a) => a.twoSigma));
export const LARGEST_EXTRA_TWO_SIGMA = Math.max(0, ...CALIBRATION.areas.filter((a) => !a.defining).map((a) => a.twoSigma));
