import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS, FILE_ID, installApi, json, networkDown, TASK_ID } from './fakeApi';

vi.mock('@/lib/scan/maskStats', () => ({
  maskStats: vi.fn(async (concern: string) => (concern === 'acne' ? { blemishCount: 21 } : concern === 'redness' ? { areaPct: 12.3 } : {})),
}));

import { maskStats } from '@/lib/scan/maskStats';
import { resumeAnalysis, runAging, runAnalysis, runSimulation, resumeSimulation, type ScanStep } from '@/lib/scan/pipeline';
import { ScanError } from '@/lib/scan/errors';

const photo = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
const FAST = { intervalMs: 1, timeoutMs: 2000 };
const CONCERNS = ['acne', 'redness', 'pore', 'texture'] as const;

async function failure(p: Promise<unknown>): Promise<ScanError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ScanError);
    return e as ScanError;
  }
  throw new Error('expected a ScanError');
}

beforeEach(() => vi.mocked(maskStats).mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runAnalysis', () => {
  it('uploads, analyzes, polls, downloads image and masks in parallel, counts acne and redness', async () => {
    const api = installApi();
    const steps: ScanStep[] = [];
    const out = await runAnalysis(photo(), [...CONCERNS], (s) => steps.push(s), FAST);

    expect(steps).toEqual(['uploading', 'analyzing', 'downloading', 'done']);
    expect(api.uploads()).toBe(1);
    const upload = api.calls[0].body as FormData;
    expect(upload).toBeInstanceOf(FormData);
    expect((upload.get('file') as File).type).toBe('image/jpeg');

    expect(api.tasks()).toHaveLength(1);
    expect(api.tasks()[0].body).toEqual({ kind: 'analysis', fileId: FILE_ID, concerns: [...CONCERNS] });
    expect(api.polls()).toHaveLength(3);
    expect(api.polls()[0].url).toBe(`/api/youcam/task/analysis/${encodeURIComponent(TASK_ID)}`);
    expect(api.assets()).toHaveLength(5);

    expect(out.fileId).toBe(FILE_ID);
    expect(out.scores).toEqual(ANALYSIS.scores);
    expect(out.overall).toBe(68.25);
    expect(out.skinAge).toBe(37);
    expect(await out.image.text()).toBe(ANALYSIS.image);
    expect(Object.keys(out.masks).sort()).toEqual(['acne', 'pore', 'redness', 'texture']);
    expect(await out.masks.acne!.text()).toBe(ANALYSIS.masks.acne);
    expect(out.maskStats).toEqual({ acne: { blemishCount: 21 }, redness: { areaPct: 12.3 } });
    expect(vi.mocked(maskStats).mock.calls.map((c) => c[0]).sort()).toEqual(['acne', 'redness']);
  });

  it('polls every 1.5 s and gives up after 45 s with the task to resume, without a second task', async () => {
    vi.useFakeTimers();
    const api = installApi({ poll: () => json({ status: 'running' }) });
    const run = failure(runAnalysis(photo(), ['acne']));
    await vi.advanceTimersByTimeAsync(46_000);
    const err = await run;

    expect(err.code).toBe('timeout');
    expect(err.message).toBe('YouCam is taking longer than usual. Check again in a moment');
    expect(err.retryTaskId).toBe(TASK_ID);
    expect(err.retryKind).toBe('analysis');
    expect(err.fileId).toBe(FILE_ID);
    expect(api.polls().length).toBeGreaterThanOrEqual(29);
    expect(api.polls().length).toBeLessThanOrEqual(30);
    expect(api.tasks()).toHaveLength(1);

    // Resuming polls the same task: no upload, no new task, no new units.
    const before = { uploads: api.uploads(), tasks: api.tasks().length };
    installApi(); // the task has finished meanwhile
    const resumed = resumeAnalysis(err.retryTaskId!, err.fileId!, undefined);
    await vi.advanceTimersByTimeAsync(5000);
    const out = await resumed;
    expect(out.fileId).toBe(FILE_ID);
    expect(out.maskStats.acne).toEqual({ blemishCount: 21 });
    expect(before).toEqual({ uploads: 1, tasks: 1 });
  });

  it('resumeAnalysis never uploads or creates a task', async () => {
    const api = installApi();
    const steps: ScanStep[] = [];
    await resumeAnalysis(TASK_ID, FILE_ID, (s) => steps.push(s), FAST);
    expect(api.uploads()).toBe(0);
    expect(api.tasks()).toHaveLength(0);
    expect(steps).toEqual(['analyzing', 'downloading', 'done']);
  });

  it('stops at an engine error with its message and does not retry the task', async () => {
    const api = installApi({
      poll: () => json({ status: 'error', code: 'face', message: 'Your face is too small in the photo. Move closer so it fills the oval' }),
    });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err.code).toBe('face');
    expect(err.message).toBe('Your face is too small in the photo. Move closer so it fills the oval');
    expect(err.retryTaskId).toBeUndefined();
    expect(api.tasks()).toHaveLength(1);
    expect(api.polls()).toHaveLength(1);
  });

  it('passes the light code through', async () => {
    installApi({ poll: () => json({ status: 'error', code: 'light', message: 'The photo is too dark. Face a window or a lamp' }) });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err.code).toBe('light');
  });

  it('maps 429 and 402 to limit with the server text', async () => {
    installApi({ task: () => json({ error: 'limit', message: 'Per-IP text' }, 429) });
    let err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'limit', message: 'Per-IP text', status: 429 });

    installApi({ task: () => json({ error: 'limit', message: "Today's free scans on this demo are used up. The sample trial shows the full flow" }, 402) });
    err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'limit', status: 402 });
    expect(err.message).toMatch(/used up/);

    installApi({ upload: () => json({ error: 'limit' }, 429) });
    err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err.code).toBe('limit');
    expect(err.message).toMatch(/used up/);
  });

  it('maps bad_image to face and 502 to upstream with the server text', async () => {
    installApi({ upload: () => json({ error: 'bad_image', message: 'Use a JPEG or PNG photo' }, 400) });
    expect(await failure(runAnalysis(photo(), ['acne'], undefined, FAST))).toMatchObject({ code: 'face', message: 'Use a JPEG or PNG photo' });

    const api = installApi({ task: () => json({ error: 'upstream', message: 'YouCam is not responding right now. Try again in a minute' }, 502) });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'upstream', status: 502 });
    expect(err.retryTaskId).toBeUndefined();
    expect(api.tasks()).toHaveLength(1); // a failed task call is never repeated
  });

  it('reports a dropped connection as network', async () => {
    installApi({ upload: () => networkDown() });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'network', message: 'Check your connection and try again' });
  });

  it('rides out one failed poll, gives up after three in a row with the task to resume', async () => {
    installApi({ poll: (_k, _t, n) => (n === 1 ? json({ error: 'upstream', message: 'x' }, 502) : n === 2 ? networkDown() : json({ status: 'success', result: ANALYSIS })) });
    await expect(runAnalysis(photo(), ['acne'], undefined, FAST)).resolves.toMatchObject({ fileId: FILE_ID });

    const api = installApi({ poll: () => networkDown() });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'network', retryTaskId: TASK_ID, retryKind: 'analysis', fileId: FILE_ID });
    expect(api.polls()).toHaveLength(3);
    expect(api.tasks()).toHaveLength(1);
  });

  it('retries a download once and, if it still fails, offers to resume the finished task', async () => {
    let api = installApi({ asset: (url, n) => (url === ANALYSIS.masks.acne && n === 1 ? json({ error: 'upstream', message: 'x' }, 502) : new Response('ok')) });
    await expect(runAnalysis(photo(), ['acne'], undefined, FAST)).resolves.toBeTruthy();
    expect(api.assets()).toHaveLength(6);

    api = installApi({ asset: () => json({ error: 'upstream', message: 'YouCam is not responding right now. Try again in a minute' }, 502) });
    const err = await failure(runAnalysis(photo(), ['acne'], undefined, FAST));
    expect(err).toMatchObject({ code: 'upstream', retryTaskId: TASK_ID, retryKind: 'analysis', fileId: FILE_ID });
    expect(api.tasks()).toHaveLength(1);
  });

  it('keeps the outcome when a mask cannot be counted', async () => {
    vi.mocked(maskStats).mockRejectedValueOnce(new Error('decode failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installApi();
    const out = await runAnalysis(photo(), ['acne'], undefined, FAST);
    expect(out.scores.acne).toBeTruthy();
    expect(Object.keys(out.maskStats)).toHaveLength(1);
    warn.mockRestore();
  });

  it('cancels polling on abort without touching the task', async () => {
    const ctrl = new AbortController();
    const api = installApi({
      poll: (_k, _t, n) => {
        if (n === 2) ctrl.abort();
        return json({ status: 'running' });
      },
    });
    await expect(runAnalysis(photo(), ['acne'], undefined, { ...FAST, signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const polls = api.polls().length;
    await new Promise((r) => setTimeout(r, 20));
    expect(api.polls().length).toBe(polls);
    expect(api.count((c) => c.method === 'DELETE')).toBe(0);
  });
});

describe('runSimulation', () => {
  it('rejects an empty or all-zero intensities object without calling the API', async () => {
    const api = installApi();
    for (const intensities of [{}, { acne: 0 }, { acne: Number.NaN }]) {
      const err = await failure(runSimulation(FILE_ID, intensities, undefined, FAST));
      expect(err.code).toBe('upstream');
    }
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('runs on the uploaded file without a new upload and returns the image', async () => {
    const api = installApi();
    const steps: ScanStep[] = [];
    const blob = await runSimulation(FILE_ID, { acne: 0.6, pores: 0.4, oiliness: 0 }, (s) => steps.push(s), FAST);
    expect(api.uploads()).toBe(0);
    expect(api.tasks()[0].body).toEqual({ kind: 'simulation', fileId: FILE_ID, intensities: { acne: 0.6, pores: 0.4 } });
    expect(api.polls()[0].url).toContain('/api/youcam/task/simulation/');
    expect(await blob.text()).toBe('/api/youcam/asset?u=sim');
    expect(steps).toEqual(['analyzing', 'downloading', 'done']);
  });

  it('times out with the task to resume', async () => {
    installApi({ poll: () => json({ status: 'running' }) });
    const err = await failure(runSimulation(FILE_ID, { acne: 0.6 }, undefined, { intervalMs: 1, timeoutMs: 15 }));
    expect(err).toMatchObject({ code: 'timeout', retryTaskId: TASK_ID, retryKind: 'simulation', fileId: FILE_ID });
    const api = installApi();
    await expect(resumeSimulation(err.retryTaskId!, FILE_ID, undefined, FAST)).resolves.toBeInstanceOf(Blob);
    expect(api.tasks()).toHaveLength(0);
  });
});

describe('runAging', () => {
  it('uploads, runs aging and downloads every frame', async () => {
    const api = installApi();
    const out = await runAging(photo(), undefined, FAST);
    expect(api.uploads()).toBe(1);
    expect(api.tasks()[0].body).toEqual({ kind: 'aging', fileId: FILE_ID });
    expect(out.age).toBe(37);
    expect(out.frames.map((f) => f.age)).toEqual([47, 57]);
    expect(await out.frames[1].image.text()).toBe('/api/youcam/asset?u=age57');
  });
});
