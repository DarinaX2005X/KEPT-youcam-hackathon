import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayOf, materializeManifest, resolveOffset } from '@/lib/domain';
import type { DemoManifest, Scan, Trial } from '@/lib/domain';
import {
  blobUrl,
  closeDb,
  countBlobs,
  DB_NAME,
  deleteTrial,
  getBlob,
  getTrial,
  importSample,
  listScans,
  listScansByTrial,
  listTrials,
  newId,
  putBlob,
  resetSamples,
  samplesDrifted,
  saveScan,
  saveTrial,
} from '@/lib/store';
import { makeScan, makeTrial } from './fixtures';

const NOW = new Date('2026-10-27T09:30:00.000Z');

function manifestScan(trialId: string, day: number, acne: number): Scan {
  return {
    id: `${trialId}-d${day}`,
    trialId,
    kind: day === 0 ? 'baseline' : 'checkin',
    day,
    takenAt: '2020-01-01T00:00:00.000Z',
    photo: { url: `/demo/${trialId}/${day}/photo.jpg` },
    masks: { acne: { url: `/demo/${trialId}/${day}/mask-acne.png` } },
    scores: { acne: { ui: acne, raw: 50 } },
    overall: 70,
    skinAge: 31,
    maskStats: { acne: { blemishCount: 20 } },
    capture: { source: 'sample', luminance: 140 },
  };
}

function manifestTrial(id: string, actives: string[], startedAt: string, extra: Partial<Trial> = {}): Trial {
  return {
    id,
    product: { name: `${id} product`, actives },
    targets: ['acne'],
    watch: ['redness'],
    startedAt,
    plan: { checkinDays: [7, 14, 21, 28, 42, 56], onsetDay: 14, fullEffectDay: 56 },
    status: 'testing',
    ...extra,
  };
}

const MANIFEST: DemoManifest = {
  generatedAt: '2026-10-20T00:00:00.000Z',
  noise: 4,
  face: { credit: 'Face generated with YouCam AI Image Generator' },
  trials: [
    {
      trial: manifestTrial('salicylic-demo', ['salicylic'], '-100d', { status: 'kept', decidedAt: '+56d' }),
      scans: [manifestScan('salicylic-demo', 0, 60), manifestScan('salicylic-demo', 28, 66), manifestScan('salicylic-demo', 56, 75)],
    },
    {
      trial: manifestTrial('retinal-demo', ['retinal'], '-21d'),
      scans: [manifestScan('retinal-demo', 0, 74), manifestScan('retinal-demo', 7, 73), manifestScan('retinal-demo', 18, 68)],
    },
  ],
  samplePhotos: { baseline: '/demo/sample/baseline.jpg', checkin: '/demo/sample/week6.jpg' },
  hero: { trialId: 'salicylic-demo', frames: ['salicylic-demo-d0', 'salicylic-demo-d28'], verdict: null },
};

function fakeFetch() {
  return vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(MANIFEST)) as unknown,
  }));
}

async function wipe() {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(wipe);
afterEach(wipe);

describe('manifest dates', () => {
  it('resolves -Nd from now, +Nd from the start, ISO as is', () => {
    expect(resolveOffset('-21d', NOW)).toBe('2026-10-06T09:30:00.000Z');
    expect(resolveOffset('+56d', NOW, '2026-07-19T09:30:00.000Z')).toBe('2026-09-13T09:30:00.000Z');
    expect(resolveOffset('2026-01-02T03:04:05.000Z', NOW)).toBe('2026-01-02T03:04:05.000Z');
    expect(() => resolveOffset('soon', NOW)).toThrow();
  });

  it('materializes fresh ids and dates without touching the manifest', () => {
    let n = 0;
    const m = materializeManifest(MANIFEST, NOW, () => `id${++n}`);
    expect(m.trialIds).toEqual(['id1', 'id5']);
    expect(m.idMap['salicylic-demo']).toBe('id1');
    expect(m.idMap['salicylic-demo-d28']).toBe('id3');
    expect(MANIFEST.trials[0].trial.id).toBe('salicylic-demo');
  });
});

describe('store', () => {
  it('saves and lists trials and scans', async () => {
    const a = makeTrial(['salicylic'], { id: 'a', startedAt: '2026-09-01T12:00:00.000Z' });
    const b = makeTrial(['retinal'], { id: 'b', startedAt: '2026-10-01T12:00:00.000Z' });
    await saveTrial(a);
    await saveTrial(b);
    await saveScan(makeScan(a, 14, { acne: 63 }));
    await saveScan(makeScan(a, 0, { acne: 60 }));
    await saveScan(makeScan(b, 0, { acne: 70 }));
    expect((await listTrials()).map((t) => t.id)).toEqual(['b', 'a']);
    expect((await getTrial('a'))?.product.actives).toEqual(['salicylic']);
    expect(await getTrial('nope')).toBeUndefined();
    expect((await listScans('a')).map((s) => s.day)).toEqual([0, 14]);
    const grouped = await listScansByTrial();
    expect(Object.keys(grouped).sort()).toEqual(['a', 'b']);
    expect(newId()).not.toBe(newId());
  });

  it('stores blobs and hands out object URLs; static refs pass through', async () => {
    const ref = await putBlob(new Blob(['jpeg bytes'], { type: 'image/jpeg' }));
    expect('id' in ref).toBe(true);
    const blob = await getBlob(ref);
    expect(await blob?.text()).toBe('jpeg bytes');
    expect(blob?.type).toBe('image/jpeg');
    const url = await blobUrl(ref);
    expect(url.startsWith('blob:')).toBe(true);
    expect(await blobUrl(ref)).toBe(url);
    expect(await blobUrl({ url: '/demo/x.jpg' })).toBe('/demo/x.jpg');
    await expect(blobUrl({ id: 'missing' })).rejects.toThrow();
  });

  it('deleteTrial removes the trial, its scans and their blobs, and nothing else', async () => {
    const keep = makeTrial(['salicylic'], { id: 'keep' });
    const gone = makeTrial(['retinal'], { id: 'gone' });
    const keepPhoto = await putBlob(new Blob(['k']));
    const photo0 = await putBlob(new Blob(['p0']));
    const mask0 = await putBlob(new Blob(['m0']));
    const photo1 = await putBlob(new Blob(['p1']));
    const projection = await putBlob(new Blob(['proj']));
    await saveTrial(keep);
    await saveTrial({ ...gone, projection: { photo: projection, scores: {}, intensities: {} } });
    await saveScan({ ...makeScan(keep, 0, { acne: 60 }), photo: keepPhoto });
    await saveScan({ ...makeScan(gone, 0, { acne: 60 }), photo: photo0, masks: { acne: mask0 } });
    await saveScan({ ...makeScan(gone, 7, { acne: 61 }), photo: photo1 });
    expect(await countBlobs()).toBe(5);

    await deleteTrial('gone');

    expect(await getTrial('gone')).toBeUndefined();
    expect(await listScans('gone')).toEqual([]);
    expect(await countBlobs()).toBe(1);
    expect(await getBlob(keepPhoto)).toBeDefined();
    expect(await getBlob(mask0)).toBeUndefined();
    expect(await listScans('keep')).toHaveLength(1);
  });
});

describe('importSample', () => {
  it('imports the manifest with new ids and dates counted back from now', async () => {
    const fetch = fakeFetch();
    const ids = await importSample({ fetch, now: NOW });
    expect(fetch).toHaveBeenCalledWith('/demo/manifest.json');
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain('salicylic-demo');

    const [sal, ret] = (await Promise.all(ids.map(getTrial))) as Trial[];
    expect(sal.sample).toBe(true);
    expect(sal.status).toBe('kept');
    expect(dayOf(sal, NOW)).toBe(100);
    expect(dayOf(sal, sal.decidedAt!)).toBe(56);
    expect(dayOf(ret, NOW)).toBe(21);

    const scans = await listScans(ret.id);
    expect(scans.map((s) => s.day)).toEqual([0, 7, 18]);
    for (const s of scans) {
      expect(s.trialId).toBe(ret.id);
      expect(dayOf(ret, s.takenAt)).toBe(s.day);
      expect(s.id).not.toMatch(/retinal-demo/);
    }
    expect(scans[2].masks.acne).toEqual({ url: '/demo/retinal-demo/18/mask-acne.png' });
  });

  it('a second import returns the same ids and adds nothing', async () => {
    const fetch = fakeFetch();
    const first = await importSample({ fetch, now: NOW });
    const second = await importSample({ fetch, now: NOW });
    expect(new Set(second)).toEqual(new Set(first));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await listTrials()).toHaveLength(2);
    const all = await listScansByTrial();
    expect(Object.values(all).flat()).toHaveLength(6);
  });

  it('parallel imports do not duplicate', async () => {
    const fetch = fakeFetch();
    const [a, b] = await Promise.all([importSample({ fetch, now: NOW }), importSample({ fetch, now: NOW })]);
    expect(a).toEqual(b);
    expect(await listTrials()).toHaveLength(2);
  });

  it('deleting an imported trial cascades to its scans', async () => {
    const ids = await importSample({ fetch: fakeFetch(), now: NOW });
    await deleteTrial(ids[1]);
    expect(await listScans(ids[1])).toEqual([]);
    expect(await listScans(ids[0])).toHaveLength(3);
  });

  it('reports a failed manifest load', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) as unknown }));
    await expect(importSample({ fetch, now: NOW })).rejects.toThrow(/404/);
    expect(await listTrials()).toEqual([]);
  });
});

describe('resetSamples', () => {
  const LATER = new Date(NOW.getTime() + 19 * 86_400_000);

  it('replaces the samples, their scans and blobs with a fresh import and keeps own trials', async () => {
    const fetch = fakeFetch();
    const old = await importSample({ fetch, now: NOW });
    const own = makeTrial(['salicylic'], { id: 'own' });
    await saveTrial(own);
    await saveScan(makeScan(own, 0, { acne: 60 }));
    // A check-in run on a sample stores its own photo; the reset must remove it too.
    const extraPhoto = await putBlob(new Blob(['extra']));
    const ret = (await getTrial(old[1]))!;
    await saveScan({ ...makeScan(ret, 21, { acne: 70 }), photo: extraPhoto });
    expect(await countBlobs()).toBe(1);

    const fresh = await resetSamples({ fetch, now: LATER });

    expect(fresh).toHaveLength(2);
    for (const id of old) {
      expect(fresh).not.toContain(id);
      expect(await getTrial(id)).toBeUndefined();
      expect(await listScans(id)).toEqual([]);
    }
    expect(await countBlobs()).toBe(0);
    expect(await getTrial('own')).toBeDefined();
    expect(await listScans('own')).toHaveLength(1);
    expect((await listTrials()).filter((t) => t.sample)).toHaveLength(2);
    const newRet = (await getTrial(fresh[1]))!;
    expect(dayOf(newRet, LATER)).toBe(21);
    expect((await listScans(newRet.id)).map((s) => s.day)).toEqual([0, 7, 18]);
  });

  it('leaves the old samples in place when the manifest fails to load', async () => {
    const old = await importSample({ fetch: fakeFetch(), now: NOW });
    const broken = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) as unknown }));
    await expect(resetSamples({ fetch: broken, now: LATER })).rejects.toThrow(/500/);
    expect((await listTrials()).map((t) => t.id).sort()).toEqual([...old].sort());
  });

  it('waits for an import in flight instead of racing it', async () => {
    const fetch = fakeFetch();
    const [, reset] = await Promise.all([importSample({ fetch, now: NOW }), resetSamples({ fetch, now: LATER })]);
    const samples = (await listTrials()).filter((t) => t.sample);
    expect(samples.map((t) => t.id).sort()).toEqual([...reset].sort());
  });

  it('samplesDrifted spots samples whose relative start no longer matches now', async () => {
    await importSample({ fetch: fakeFetch(), now: NOW });
    const trials = await listTrials();
    expect(samplesDrifted(MANIFEST, trials, new Date(NOW.getTime() + 86_400_000))).toBe(false);
    expect(samplesDrifted(MANIFEST, trials, LATER)).toBe(true);
    expect(samplesDrifted(MANIFEST, trials.filter((t) => !t.sample), LATER)).toBe(false);
  });
});
