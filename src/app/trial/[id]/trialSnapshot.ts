import type { BlobRef, Scan, Trial } from '@/lib/domain';
import { deleteTrial, getDb } from '@/lib/store';

/** Everything `deleteTrial` removes, held in memory so Undo can put it back with the same ids. */
export interface TrialSnapshot {
  trial: Trial;
  scans: Scan[];
  blobs: { id: string; blob: Blob }[];
}

function ids(ref: BlobRef | undefined): string[] {
  return ref && 'id' in ref ? [ref.id] : [];
}

/** Deletes the trial and returns what it removed. Blobs are copied first: IndexedDB-backed blobs may not survive their record. */
export async function deleteWithSnapshot(trialId: string): Promise<TrialSnapshot | null> {
  const db = await getDb();
  const trial = await db.get('trials', trialId);
  if (!trial) return null;
  const scans = await db.getAllFromIndex('scans', 'trialId', trialId);
  const blobIds = new Set<string>(ids(trial.projection?.photo));
  for (const s of scans) {
    for (const id of ids(s.photo)) blobIds.add(id);
    for (const ref of Object.values(s.masks ?? {}) as (BlobRef | undefined)[]) for (const id of ids(ref)) blobIds.add(id);
  }
  const blobs: TrialSnapshot['blobs'] = [];
  for (const id of blobIds) {
    const rec = await db.get('blobs', id);
    if (!rec) continue;
    blobs.push({ id, blob: new Blob([await rec.blob.arrayBuffer()], { type: rec.blob.type }) });
  }
  await deleteTrial(trialId);
  return { trial, scans, blobs };
}

export async function restoreSnapshot(snap: TrialSnapshot): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['trials', 'scans', 'blobs'], 'readwrite');
  await Promise.all([
    ...snap.blobs.map((b) => tx.objectStore('blobs').put(b)),
    ...snap.scans.map((s) => tx.objectStore('scans').put(s)),
    tx.objectStore('trials').put(snap.trial),
  ]);
  await tx.done;
}
