// Server-only YouCam client. The API key comes from env and never leaves this module.
// Do not import from client components (src/server is server code only).
import type { TaskKind } from './types';

export const YOUCAM_BASE = 'https://yce-api-01.makeupar.com';
export const REQUEST_TIMEOUT_MS = 15_000;

/** YouCam task paths under /s2s/v2.0/task/. */
export const TASK_PATH: Record<TaskKind, string> = {
  analysis: 'skin-analysis',
  simulation: 'skin-simulation',
  aging: 'aging',
};

export class YouCamError extends Error {
  readonly httpStatus: number;
  /** YouCam `error_code` (e.g. CreditInsufficiency, InvalidParameters) or a local one: Timeout, Network, BadResponse, NoKey. */
  readonly code: string;
  constructor(httpStatus: number, code: string, message: string) {
    super(message);
    this.name = 'YouCamError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

export interface RawTaskStatus {
  task_status: 'running' | 'success' | 'error' | string;
  error?: string | null;
  error_message?: string | null;
  results?: unknown;
}

function apiKey(): string {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError(500, 'NoKey', 'YouCam API key is not configured');
  return key;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new YouCamError(504, 'Timeout', 'YouCam did not answer in time');
    }
    throw new YouCamError(502, 'Network', 'Could not reach YouCam');
  }
}

async function api<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const res = await send(YOUCAM_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new YouCamError(res.status || 502, 'BadResponse', `YouCam answered ${res.status} without JSON`);
  }
  if (!res.ok || json.status !== 200) {
    const status = typeof json.status === 'number' ? json.status : res.status;
    const code = typeof json.error_code === 'string' ? json.error_code : `HTTP${status}`;
    const message = typeof json.error === 'string' ? json.error : `YouCam request failed with ${status}`;
    throw new YouCamError(status, code, message);
  }
  return json as T;
}

interface FileCreateResponse {
  data: {
    files: {
      file_id: string;
      requests: { url: string; method?: string; headers?: Record<string, string | number> }[];
    }[];
  };
}

/** Registers a file with YouCam, PUTs the bytes to the presigned URL and returns `file_id`. */
export async function uploadFile(buf: Buffer, contentType: string, fileName: string): Promise<string> {
  const json = await api<FileCreateResponse>('POST', '/s2s/v2.0/file', {
    files: [{ content_type: contentType, file_name: fileName, file_size: buf.length }],
  });
  const file = json.data?.files?.[0];
  const req = file?.requests?.[0];
  if (!file?.file_id || !req?.url) throw new YouCamError(502, 'BadResponse', 'YouCam did not return an upload URL');

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k] = String(v);
  const put = await send(req.url, { method: req.method || 'PUT', headers, body: new Uint8Array(buf) });
  if (!put.ok) throw new YouCamError(put.status, 'UploadFailed', `Photo upload to YouCam storage failed with ${put.status}`);
  return file.file_id;
}

/** Starts a task under /s2s/v2.0/task/<path> and returns its id. */
export async function createTask(path: string, body: object): Promise<string> {
  const json = await api<{ data?: { task_id?: string } }>('POST', `/s2s/v2.0/task/${path}`, body);
  const id = json.data?.task_id;
  if (!id) throw new YouCamError(502, 'BadResponse', 'YouCam did not return a task id');
  return id;
}

export async function getTask(path: string, taskId: string): Promise<RawTaskStatus> {
  const json = await api<{ data?: RawTaskStatus }>('GET', `/s2s/v2.0/task/${path}/${encodeURIComponent(taskId)}`);
  if (!json.data || typeof json.data.task_status !== 'string') {
    throw new YouCamError(502, 'BadResponse', 'YouCam returned a task without status');
  }
  return json.data;
}

/** Remaining units: sum of `results[].amount`. */
export async function getCredit(): Promise<number> {
  const json = await api<{ results?: { amount?: number }[] }>('GET', '/s2s/v1.0/client/credit');
  return (json.results ?? []).reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0);
}
