// Thin client for the Kept server API (/api/youcam/*). Maps every failure to a ScanError.
import type { ApiError, TaskKind, TaskPoll, TaskRequest, TaskResultByKind } from '@/server/youcam/types';
import { abortError, isAbortError, MESSAGES, ScanError } from './errors';

export const POLL_INTERVAL_MS = 1500;
export const POLL_TIMEOUT_MS = 45_000;
/** Poll requests that may fail in a row (network or 5xx) before polling gives up. Polls are free. */
const POLL_FAILURES_ALLOWED = 3;

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface PollOptions extends RequestOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

async function send(input: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) throw abortError();
    throw new ScanError('network', MESSAGES.network);
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Turns a non-2xx API response into a ScanError with the server's own words. */
export async function errorFromResponse(res: Response): Promise<ScanError> {
  const body = (await readJson(res)) as Partial<ApiError> | null;
  const message = typeof body?.message === 'string' && body.message ? body.message : undefined;
  const status = res.status;
  if (status === 429 || status === 402 || body?.error === 'limit') {
    return new ScanError('limit', message ?? MESSAGES.limit, { status });
  }
  if (body?.error === 'bad_image') return new ScanError('face', message ?? MESSAGES.unreadable, { status });
  return new ScanError('upstream', message ?? MESSAGES.upstream, { status });
}

/** POST /api/youcam/upload → fileId. */
export async function uploadPhoto(photo: Blob, opts: RequestOptions = {}): Promise<string> {
  const form = new FormData();
  const type = photo.type === 'image/png' ? 'png' : 'jpg';
  form.append('file', photo, `photo.${type}`);
  const res = await send('/api/youcam/upload', { method: 'POST', body: form }, opts.signal);
  if (!res.ok) throw await errorFromResponse(res);
  const body = (await readJson(res)) as { fileId?: unknown } | null;
  if (typeof body?.fileId !== 'string' || !body.fileId) throw new ScanError('upstream', MESSAGES.upstream, { status: res.status });
  return body.fileId;
}

/** POST /api/youcam/task → taskId. Every call spends YouCam units, so callers never retry it on their own. */
export async function createTask(request: TaskRequest, opts: RequestOptions = {}): Promise<string> {
  const res = await send(
    '/api/youcam/task',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) },
    opts.signal,
  );
  if (!res.ok) throw await errorFromResponse(res);
  const body = (await readJson(res)) as { taskId?: unknown } | null;
  if (typeof body?.taskId !== 'string' || !body.taskId) throw new ScanError('upstream', MESSAGES.upstream, { status: res.status });
  return body.taskId;
}

export const taskUrl = (kind: TaskKind, taskId: string) => `/api/youcam/task/${kind}/${encodeURIComponent(taskId)}`;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** One GET of the task status. */
export async function getTaskStatus<K extends TaskKind>(kind: K, taskId: string, opts: RequestOptions = {}): Promise<TaskPoll<K>> {
  const res = await send(taskUrl(kind, taskId), { method: 'GET', cache: 'no-store' }, opts.signal);
  if (!res.ok) throw await errorFromResponse(res);
  const body = (await readJson(res)) as TaskPoll<K> | null;
  if (!body || typeof body !== 'object' || !('status' in body)) throw new ScanError('upstream', MESSAGES.upstream, { status: res.status });
  return body;
}

/**
 * Polls a task until it succeeds, fails or the time runs out. Waits `intervalMs` before every poll.
 * Engine errors are final (YouCam charged for them; the photo has to change). A timeout or repeated
 * request failures reject with `retryTaskId`, so the same task can be polled again later.
 */
export async function pollTask<K extends TaskKind>(kind: K, taskId: string, opts: PollOptions = {}): Promise<TaskResultByKind[K]> {
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let failures = 0;

  for (;;) {
    await sleep(intervalMs, opts.signal);
    let poll: TaskPoll<K>;
    try {
      poll = await getTaskStatus(kind, taskId, opts);
      failures = 0;
    } catch (err) {
      if (!(err instanceof ScanError)) throw err;
      // A limit or bad request will not fix itself; network and 5xx might.
      const transient = err.code === 'network' || (err.code === 'upstream' && (err.status ?? 500) >= 500);
      failures += 1;
      if (!transient || failures >= POLL_FAILURES_ALLOWED || Date.now() + intervalMs > deadline) {
        throw err.withTask(kind, taskId);
      }
      continue;
    }

    if (poll.status === 'success') return poll.result;
    if (poll.status === 'error') throw new ScanError(poll.code, poll.message, { status: 200 });
    if (Date.now() + intervalMs > deadline) {
      throw new ScanError('timeout', MESSAGES.timeout, { retryTaskId: taskId, retryKind: kind });
    }
  }
}

/** Downloads a result file through the asset proxy. One quiet retry: downloads cost nothing. */
export async function fetchAsset(url: string, opts: RequestOptions = {}): Promise<Blob> {
  let last: ScanError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await send(url, { method: 'GET' }, opts.signal);
      if (!res.ok) throw await errorFromResponse(res);
      return await res.blob();
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw abortError();
      // res.blob() can fail halfway through the body: treat it as a dropped connection.
      last = err instanceof ScanError ? err : new ScanError('network', MESSAGES.network);
      if (last.code !== 'network' && (last.status ?? 500) < 500) break;
    }
  }
  throw last ?? new ScanError('upstream', MESSAGES.upstream);
}
