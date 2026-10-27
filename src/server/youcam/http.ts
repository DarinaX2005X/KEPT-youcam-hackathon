// Small helpers shared by the /api/youcam route handlers.
import { YouCamError } from './client';
import { LIMIT_MESSAGE } from './quota';
import type { ApiError } from './types';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function fail(status: number, error: ApiError['error'], message: string): Response {
  return json({ error, message } satisfies ApiError, status);
}

export const UPSTREAM_MESSAGE = 'YouCam is not responding right now. Try again in a minute';

/** Maps a thrown error to a contract response without leaking upstream details. */
export function upstreamFailure(err: unknown): Response {
  if (err instanceof YouCamError) {
    console.warn(`[youcam] ${err.httpStatus} ${err.code}: ${err.message}`);
    if (err.code === 'CreditInsufficiency') return fail(402, 'limit', LIMIT_MESSAGE);
    if (err.code === 'InvalidParameters') {
      return fail(400, 'bad_request', 'YouCam rejected this photo or request. Upload the photo again');
    }
    if (err.httpStatus === 429) return fail(429, 'limit', 'YouCam is busy. Try again in a few seconds');
  }
  return fail(502, 'upstream', UPSTREAM_MESSAGE);
}
