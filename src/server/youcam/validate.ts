// Validation of POST /api/youcam/task bodies and of the YouCam request built from them.
import type { Concern, SimConcern } from '@/lib/domain/types';
import { CONCERNS } from './normalize';
import type { QuotaTask } from './quota';
import { TASK_PATH } from './client';
import type { TaskKind, TaskRequest } from './types';

export const SIM_CONCERNS: readonly SimConcern[] = [
  'acne', 'redness', 'pores', 'texture', 'wrinkle', 'oiliness', 'radiance', 'spots', 'dark_circle', 'eye_bags',
];
const SIM_SET = new Set<string>(SIM_CONCERNS);
const CONCERN_SET = new Set<string>(CONCERNS);
export const TASK_KINDS: readonly TaskKind[] = ['analysis', 'simulation', 'aging'];

export const isTaskKind = (v: unknown): v is TaskKind => typeof v === 'string' && (TASK_KINDS as string[]).includes(v);

/** YouCam ids are opaque; accept a bounded printable token. */
export const isOpaqueId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[\x21-\x7e]+$/.test(v);

export type Parsed = { ok: true; request: TaskRequest } | { ok: false; message: string };

export function parseTaskRequest(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Send a JSON object' };
  const b = body as Record<string, unknown>;
  if (!isTaskKind(b.kind)) return { ok: false, message: 'kind must be analysis, simulation or aging' };
  if (!isOpaqueId(b.fileId)) return { ok: false, message: 'fileId must be a string of up to 200 characters' };
  const fileId = b.fileId;

  if (b.kind === 'analysis') {
    const c = b.concerns;
    if (!Array.isArray(c) || c.length < 1 || c.length > 8) return { ok: false, message: 'concerns must list 1 to 8 areas' };
    if (!c.every((x) => typeof x === 'string' && CONCERN_SET.has(x))) return { ok: false, message: 'concerns has an unknown area' };
    const concerns = [...new Set(c as Concern[])];
    return { ok: true, request: { kind: 'analysis', fileId, concerns } };
  }

  if (b.kind === 'simulation') {
    const raw = b.intensities;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'intensities must be an object' };
    const intensities: Partial<Record<SimConcern, number>> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!SIM_SET.has(k)) return { ok: false, message: `intensities has an unknown area: ${k.slice(0, 40)}` };
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        return { ok: false, message: 'intensities values must be between 0 and 1' };
      }
      if (v > 0) intensities[k as SimConcern] = v;
    }
    if (Object.keys(intensities).length === 0) return { ok: false, message: 'At least one intensity must be above 0' };
    return { ok: true, request: { kind: 'simulation', fileId, intensities } };
  }

  return { ok: true, request: { kind: 'aging', fileId } };
}

export function quotaTaskOf(req: TaskRequest): QuotaTask {
  switch (req.kind) {
    case 'analysis':
      return { kind: 'analysis', concerns: req.concerns.length };
    case 'simulation':
      return { kind: 'simulation', concerns: Object.keys(req.intensities).length };
    case 'aging':
      return { kind: 'aging' };
  }
}

/** Path and body for the YouCam task call. */
export function youcamTaskOf(req: TaskRequest): { path: string; body: object } {
  const path = TASK_PATH[req.kind];
  switch (req.kind) {
    case 'analysis':
      return { path, body: { src_file_id: req.fileId, dst_actions: req.concerns, format: 'json' } };
    case 'simulation':
      return { path, body: { src_file_id: req.fileId, ...req.intensities } };
    case 'aging':
      return { path, body: { src_file_id: req.fileId } };
  }
}
