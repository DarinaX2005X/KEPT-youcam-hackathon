// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_ID, installApi, json, TASK_ID } from './fakeApi';

vi.mock('@/lib/scan/maskStats', () => ({ maskStats: vi.fn(async () => ({ blemishCount: 5 })) }));
vi.mock('@/lib/scan/prepare', () => ({
  prepareImage: vi.fn(async (b: Blob) => ({ blob: b, width: 900, height: 1200, luminance: 120 })),
}));

import { prepareImage } from '@/lib/scan/prepare';
import { SCAN_STEPS, useScan, type UseScan } from '@/lib/scan/useScan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let hook: UseScan;
const seen: (string | null)[] = [];

function Probe() {
  hook = useScan();
  if (seen[seen.length - 1] !== hook.step) seen.push(hook.step);
  return null;
}

const photo = () => new Blob(['jpeg'], { type: 'image/jpeg' });
const FAST = { intervalMs: 1, timeoutMs: 2000 };

beforeEach(async () => {
  seen.length = 0;
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe('useScan', () => {
  it('labels the three visible steps', () => {
    expect(SCAN_STEPS).toEqual([
      { id: 'uploading', label: 'Uploading photo' },
      { id: 'analyzing', label: 'Analyzing skin with YouCam' },
      { id: 'downloading', label: 'Saving skin maps' },
    ]);
  });

  it('walks through the steps and ends with the outcome', async () => {
    installApi();
    let result: unknown;
    await act(async () => {
      result = await hook.run(photo(), ['acne', 'redness'], { poll: FAST });
    });
    expect(vi.mocked(prepareImage)).toHaveBeenCalledTimes(1);
    expect(seen[0]).toBeNull();
    expect(hook.step).toBe('done');
    expect(hook.status).toBe('done');
    expect(hook.outcome).toBe(result);
    expect(hook.outcome?.fileId).toBe(FILE_ID);
    expect(Object.keys(hook.timings)).toEqual(['uploading', 'analyzing', 'downloading', 'done']);
    const t = hook.timings;
    expect(t.uploading! <= t.analyzing! && t.analyzing! <= t.downloading! && t.downloading! <= t.done!).toBe(true);
    expect(hook.error).toBeNull();
  });

  it('can skip preparation', async () => {
    vi.mocked(prepareImage).mockClear();
    installApi();
    await act(async () => {
      await hook.run(photo(), ['acne'], { prepare: false, poll: FAST });
    });
    expect(vi.mocked(prepareImage)).not.toHaveBeenCalled();
    expect(hook.status).toBe('done');
  });

  it('shows the error and resumes the same task after a timeout', async () => {
    let api = installApi({ poll: () => json({ status: 'running' }) });
    await act(async () => {
      await hook.run(photo(), ['acne'], { prepare: false, poll: { intervalMs: 1, timeoutMs: 10 } });
    });
    expect(hook.status).toBe('error');
    expect(hook.error).toMatchObject({ code: 'timeout', retryTaskId: TASK_ID, fileId: FILE_ID });
    expect(hook.canResume).toBe(true);
    expect(api.tasks()).toHaveLength(1);

    api = installApi();
    await act(async () => {
      await hook.resume({ poll: FAST });
    });
    expect(hook.status).toBe('done');
    expect(hook.error).toBeNull();
    expect(api.uploads()).toBe(0);
    expect(api.tasks()).toHaveLength(0);
  });

  it('cancel stops polling and returns to idle without an error', async () => {
    const api = installApi({ poll: () => json({ status: 'running' }) });
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.run(photo(), ['acne'], { prepare: false, poll: { intervalMs: 5, timeoutMs: 10_000 } });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(hook.step).toBe('analyzing');
    await act(async () => {
      hook.cancel();
      await pending;
    });
    expect(hook.status).toBe('idle');
    expect(hook.step).toBeNull();
    expect(hook.error).toBeNull();
    const polls = api.polls().length;
    await new Promise((r) => setTimeout(r, 30));
    expect(api.polls().length).toBe(polls);
  });

  it('reset clears a finished scan', async () => {
    installApi({ upload: () => json({ error: 'limit', message: 'Limit text' }, 429) });
    await act(async () => {
      await hook.run(photo(), ['acne'], { prepare: false });
    });
    expect(hook.error).toMatchObject({ code: 'limit', message: 'Limit text' });
    expect(hook.canResume).toBe(false);
    await act(async () => hook.reset());
    expect([hook.status, hook.step, hook.error, hook.outcome]).toEqual(['idle', null, null, null]);
  });
});
