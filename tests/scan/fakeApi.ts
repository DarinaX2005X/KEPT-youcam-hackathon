// A scripted stand-in for the Kept server API, installed as global fetch.
import { vi } from 'vitest';
import analysis from './fixtures/analysis.json';
import type { AnalysisResult, TaskPoll } from '@/server/youcam/types';

export const ANALYSIS: AnalysisResult = {
  scores: analysis.scores,
  overall: analysis.overall,
  skinAge: analysis.skinAge,
  masks: analysis.masks,
  image: analysis.image,
};

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const png = (label: string) => new Response(label, { status: 200, headers: { 'Content-Type': 'image/png' } });

type Reply = Response | Error | Promise<Response>;

export interface Script {
  upload?: () => Reply;
  task?: (body: Record<string, unknown>) => Reply;
  /** n counts polls of this task from 1. */
  poll?: (kind: string, taskId: string, n: number) => Reply;
  asset?: (url: string, n: number) => Reply;
}

export const FILE_ID = 'file-7f3a';
export const TASK_ID = 'task/9+x=='; // characters that must be URL-encoded

export function installApi(script: Script = {}) {
  const calls: Call[] = [];
  const polls = new Map<string, number>();
  const assets = new Map<string, number>();

  const handler = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let body: unknown = init.body;
    if (typeof body === 'string') body = JSON.parse(body);
    calls.push({ method, url, body });

    let reply: Reply;
    if (url === '/api/youcam/upload' && method === 'POST') {
      reply = script.upload?.() ?? json({ fileId: FILE_ID });
    } else if (url === '/api/youcam/task' && method === 'POST') {
      const b = body as Record<string, unknown>;
      reply = script.task?.(b) ?? json({ taskId: TASK_ID, kind: b.kind });
    } else if (url.startsWith('/api/youcam/task/')) {
      const [, , , , kind, raw] = url.split('/');
      const taskId = decodeURIComponent(raw);
      const n = (polls.get(taskId) ?? 0) + 1;
      polls.set(taskId, n);
      reply = script.poll?.(kind, taskId, n) ?? defaultPoll(kind, n);
    } else if (url.startsWith('/api/youcam/asset')) {
      const n = (assets.get(url) ?? 0) + 1;
      assets.set(url, n);
      reply = script.asset?.(url, n) ?? png(url);
    } else {
      reply = json({ error: 'bad_request', message: 'unknown route' }, 404);
    }
    const r = await reply;
    if (r instanceof Error) throw r;
    return r;
  };

  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    count: (pred: (c: Call) => boolean) => calls.filter(pred).length,
    uploads: () => calls.filter((c) => c.url === '/api/youcam/upload').length,
    tasks: () => calls.filter((c) => c.url === '/api/youcam/task'),
    polls: () => calls.filter((c) => c.url.startsWith('/api/youcam/task/')),
    assets: () => calls.filter((c) => c.url.startsWith('/api/youcam/asset')),
  };
}

/** Running twice, then success with the fixture of the kind. */
export function defaultPoll(kind: string, n: number): Response {
  if (n < 3) return json({ status: 'running' } satisfies TaskPoll);
  if (kind === 'analysis') return json({ status: 'success', result: ANALYSIS } satisfies TaskPoll<'analysis'>);
  if (kind === 'simulation') return json({ status: 'success', result: { image: '/api/youcam/asset?u=sim' } } satisfies TaskPoll<'simulation'>);
  return json({
    status: 'success',
    result: { age: 37, frames: [{ age: 47, image: '/api/youcam/asset?u=age47' }, { age: 57, image: '/api/youcam/asset?u=age57' }] },
  } satisfies TaskPoll<'aging'>);
}

export const networkDown = () => new TypeError('Failed to fetch');
