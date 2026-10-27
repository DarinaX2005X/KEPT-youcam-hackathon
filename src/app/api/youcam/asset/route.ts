import type { NextRequest } from 'next/server';
import { allowedAssetUrl, assetContentType } from '@/server/youcam/asset';
import { fail } from '@/server/youcam/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streams a YouCam result file (masks, aligned photo, simulations). Their S3 links have no CORS and live 2 hours.
export async function GET(req: NextRequest) {
  const url = allowedAssetUrl(req.nextUrl.searchParams.get('u'));
  if (!url) return fail(400, 'bad_request', 'Only YouCam result links can be loaded here');

  let upstream: Response;
  try {
    upstream = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  } catch {
    return fail(502, 'upstream', 'Could not load this image from YouCam');
  }
  if (!upstream.ok || !upstream.body) {
    return fail(502, 'upstream', 'This YouCam image link has expired or is unavailable');
  }

  const headers = new Headers({
    'Content-Type': assetContentType(url, upstream.headers.get('content-type')),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);
  return new Response(upstream.body, { status: 200, headers });
}
