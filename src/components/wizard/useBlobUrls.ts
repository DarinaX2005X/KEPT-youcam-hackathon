'use client';

import { useEffect, useState } from 'react';
import type { BlobRef } from '@/lib/domain';
import { blobUrl } from '@/lib/store';

const keyOf = (ref: BlobRef) => ('id' in ref ? `id:${ref.id}` : `url:${ref.url}`);

/** Object URLs for stored blobs, by the caller's own keys. Missing until loaded. */
export function useBlobUrls<K extends string>(refs: Partial<Record<K, BlobRef>> | null | undefined): Partial<Record<K, string>> {
  const signature = refs
    ? Object.entries(refs)
        .map(([k, r]) => `${k}=${keyOf(r as BlobRef)}`)
        .sort()
        .join('|')
    : '';
  const [urls, setUrls] = useState<{ sig: string; map: Partial<Record<K, string>> }>({ sig: '', map: {} });

  useEffect(() => {
    if (!refs || !signature) return;
    let live = true;
    const entries = Object.entries(refs) as [K, BlobRef][];
    Promise.all(entries.map(async ([k, r]) => [k, await blobUrl(r).catch(() => undefined)] as const)).then((pairs) => {
      if (!live) return;
      const map: Partial<Record<K, string>> = {};
      for (const [k, u] of pairs) if (u) map[k] = u;
      setUrls({ sig: signature, map });
    });
    return () => {
      live = false;
    };
    // `signature` stands for `refs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls.sig === signature ? urls.map : {};
}

/** Object URL for a blob held in memory; revoked when the blob changes. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
