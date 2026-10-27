import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BlobRef, Concern, Scan, Trial } from '@/lib/domain/types';

export const DB_NAME = 'kept';
export const DB_VERSION = 1;

interface BlobRecord {
  id: string;
  blob: Blob;
}

interface KeptDB extends DBSchema {
  trials: { key: string; value: Trial };
  scans: { key: string; value: Scan; indexes: { trialId: string } };
  blobs: { key: string; value: BlobRecord };
}

let dbPromise: Promise<IDBPDatabase<KeptDB>> | null = null;
const urlCache = new Map<string, string>();

export function getDb(): Promise<IDBPDatabase<KeptDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KeptDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trials')) db.createObjectStore('trials', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('scans')) {
          const scans = db.createObjectStore('scans', { keyPath: 'id' });
          scans.createIndex('trialId', 'trialId');
        }
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      },
      blocking() {
        // Another tab wants a newer version: let it.
        void closeDb();
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Closes the connection and drops cached object URLs. Tests use it between cases. */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  for (const url of urlCache.values()) revoke(url);
  urlCache.clear();
  if (p) (await p.catch(() => null))?.close();
}

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Trials, newest start first. */
export async function listTrials(): Promise<Trial[]> {
  const all = await (await getDb()).getAll('trials');
  return all.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export async function getTrial(id: string): Promise<Trial | undefined> {
  return (await getDb()).get('trials', id);
}

export async function saveTrial(trial: Trial): Promise<void> {
  await (await getDb()).put('trials', trial);
}

function blobIdsOf(ref: BlobRef | undefined): string[] {
  return ref && 'id' in ref ? [ref.id] : [];
}

function scanBlobIds(scan: Scan): string[] {
  const ids = blobIdsOf(scan.photo);
  for (const ref of Object.values(scan.masks ?? {}) as (BlobRef | undefined)[]) ids.push(...blobIdsOf(ref));
  return ids;
}

/** Deletes the trial, its scans and every blob they point to (photos, masks, projection). */
export async function deleteTrial(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['trials', 'scans', 'blobs'], 'readwrite');
  const trial = await tx.objectStore('trials').get(id);
  const scans = await tx.objectStore('scans').index('trialId').getAll(id);
  const blobIds = new Set<string>(blobIdsOf(trial?.projection?.photo));
  for (const s of scans) for (const b of scanBlobIds(s)) blobIds.add(b);
  await Promise.all([
    tx.objectStore('trials').delete(id),
    ...scans.map((s) => tx.objectStore('scans').delete(s.id)),
    ...[...blobIds].map((b) => tx.objectStore('blobs').delete(b)),
  ]);
  await tx.done;
  for (const b of blobIds) dropUrl(b);
}

/** Scans of a trial ordered by day, then by time taken. */
export async function listScans(trialId: string): Promise<Scan[]> {
  const scans = await (await getDb()).getAllFromIndex('scans', 'trialId', trialId);
  return scans.sort((a, b) => a.day - b.day || Date.parse(a.takenAt) - Date.parse(b.takenAt));
}

/** Every scan grouped by trial id, the shape `buyCheck` takes. */
export async function listScansByTrial(): Promise<Record<string, Scan[]>> {
  const all = await (await getDb()).getAll('scans');
  const out: Record<string, Scan[]> = {};
  for (const s of all) (out[s.trialId] ??= []).push(s);
  for (const list of Object.values(out)) list.sort((a, b) => a.day - b.day);
  return out;
}

export async function saveScan(scan: Scan): Promise<void> {
  await (await getDb()).put('scans', scan);
}

/** Deletes one scan and its blobs. */
export async function deleteScan(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['scans', 'blobs'], 'readwrite');
  const scan = await tx.objectStore('scans').get(id);
  const blobIds = scan ? scanBlobIds(scan) : [];
  await Promise.all([tx.objectStore('scans').delete(id), ...blobIds.map((b) => tx.objectStore('blobs').delete(b))]);
  await tx.done;
  for (const b of blobIds) dropUrl(b);
}

export async function putBlob(blob: Blob): Promise<BlobRef> {
  const id = newId();
  await (await getDb()).put('blobs', { id, blob });
  return { id };
}

export async function getBlob(ref: BlobRef): Promise<Blob | undefined> {
  if ('url' in ref) return undefined;
  return (await (await getDb()).get('blobs', ref.id))?.blob;
}

/** Counts stored blobs. Handy for checks and tests. */
export async function countBlobs(): Promise<number> {
  return (await getDb()).count('blobs');
}

function revoke(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

function dropUrl(blobId: string): void {
  const url = urlCache.get(blobId);
  if (url) revoke(url);
  urlCache.delete(blobId);
}

/**
 * A URL an <img> can use. `{ url }` comes back as is; `{ id }` becomes a cached object URL.
 * Rejects when the blob is missing.
 */
export async function blobUrl(ref: BlobRef): Promise<string> {
  if ('url' in ref) return ref.url;
  const cached = urlCache.get(ref.id);
  if (cached) return cached;
  const blob = await getBlob(ref);
  if (!blob) throw new Error(`Missing image ${ref.id}`);
  const again = urlCache.get(ref.id);
  if (again) return again;
  const url = URL.createObjectURL(blob);
  urlCache.set(ref.id, url);
  return url;
}

/** Mask refs present on a scan, typed. */
export function maskEntries(scan: Scan): [Concern, BlobRef][] {
  return Object.entries(scan.masks ?? {}).filter((e): e is [Concern, BlobRef] => Boolean(e[1]));
}
