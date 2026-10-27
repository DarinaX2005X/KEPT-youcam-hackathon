// Allow-list and content type for the YouCam asset proxy.

/** Only https YouCam S3 objects: host `*.amazonaws.com` and bucket `yce-…` (virtual-hosted or path style). */
export function allowedAssetUrl(raw: string | null): URL | null {
  if (!raw || raw.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.amazonaws.com')) return null;
  const bucketInHost = host.startsWith('yce-') || host.startsWith('yce.');
  const bucketInPath = /^\/yce-[^/]+\//.test(url.pathname);
  return bucketInHost || bucketInPath ? url : null;
}

const BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Upstream content type unless it is missing or generic, then by file extension. */
export function assetContentType(url: URL, upstream: string | null): string {
  const ct = upstream?.split(';')[0].trim().toLowerCase();
  if (ct && ct !== 'application/octet-stream' && ct !== 'binary/octet-stream') return upstream!;
  const ext = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? 'application/octet-stream';
}
