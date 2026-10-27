// Errors of the client scan pipeline (PLAN «Клиентский конвейер»).
import type { TaskKind } from '@/server/youcam/types';

export type ScanErrorCode = 'face' | 'light' | 'limit' | 'network' | 'timeout' | 'upstream';

export const MESSAGES = {
  network: 'Check your connection and try again',
  timeout: 'YouCam is taking longer than usual. Check again in a moment',
  upstream: 'YouCam is not responding right now. Try again in a minute',
  limit: "Today's free scans on this demo are used up. The sample trial shows the full flow",
  tooSmall: 'This photo is too small. Use one at least 480 px wide',
  unreadable: 'Kept could not open this file. Use a JPEG or PNG photo',
  nothingToSimulate: 'YouCam has no simulation for the areas this product targets',
} as const;

export interface ScanErrorInit {
  /** Set when the task already exists on YouCam: resume polling it instead of starting a new one. */
  retryTaskId?: string;
  /** Kind of the task in `retryTaskId`. */
  retryKind?: TaskKind;
  /** File the task was created for, so a resumed analysis can still report it. */
  fileId?: string;
  /** HTTP status of the failed request, when there was one. */
  status?: number;
}

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly retryTaskId?: string;
  readonly retryKind?: TaskKind;
  readonly fileId?: string;
  readonly status?: number;

  constructor(code: ScanErrorCode, message: string, init: ScanErrorInit = {}) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.retryTaskId = init.retryTaskId;
    this.retryKind = init.retryKind;
    this.fileId = init.fileId;
    this.status = init.status;
  }

  /** Same error with the task to resume attached. */
  withTask(kind: TaskKind, taskId: string, fileId?: string): ScanError {
    return new ScanError(this.code, this.message, {
      retryTaskId: taskId,
      retryKind: kind,
      fileId: fileId ?? this.fileId,
      status: this.status,
    });
  }
}

export const isScanError = (e: unknown): e is ScanError => e instanceof ScanError;

/** True for the rejection an AbortSignal causes; cancellation is not an error to show. */
export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

export function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The scan was cancelled', 'AbortError');
  const e = new Error('The scan was cancelled');
  e.name = 'AbortError';
  return e;
}
