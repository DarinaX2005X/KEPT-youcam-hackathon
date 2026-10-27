// Allow-list and content type for the YouCam asset proxy.

/**
 * Exact YouCam result buckets only. A prefix rule (`yce-*`) is not enough: anyone can create a
 * bucket with that prefix and have this domain serve their file.
 */
export const YOUCAM_ASSET_HOSTS = new Set([
  'yce-us.s3-accelerate.amazonaws.com',
  'yce-us.s3.amazonaws.com',
  'yce-us.s3.us-west-2.amazonaws.com',
]);

/** Only https links to YouCam's own result buckets, virtual-hosted style. */
export function allowedAssetUrl(raw: string | null): URL | null {
  if (!raw || raw.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return YOUCAM_ASSET_HOSTS.has(url.hostname.toLowerCase()) ? url : null;
}

const BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Always an image type: by upstream header if it is an image, else by extension, else null (refused). */
export function assetContentType(url: URL, upstream: string | null): string | null {
  const ct = upstream?.split(';')[0].trim().toLowerCase();
  if (ct && Object.values(BY_EXT).includes(ct)) return ct;
  const ext = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? null;
}
