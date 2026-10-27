import { createTask } from '@/server/youcam/client';
import { fail, json, upstreamFailure } from '@/server/youcam/http';
import { checkAndReserve, clientIp, release, trackTask } from '@/server/youcam/quota';
import { parseTaskRequest, quotaTaskOf, youcamTaskOf } from '@/server/youcam/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { kind, fileId, concerns | intensities } → { taskId, kind }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Send a JSON body');
  }
  const parsed = parseTaskRequest(body);
  if (!parsed.ok) return fail(400, 'bad_request', parsed.message);
  const request = parsed.request;

  const ip = clientIp(req.headers);
  const quotaTask = quotaTaskOf(request);
  const quota = await checkAndReserve(ip, quotaTask);
  if (!quota.ok) return fail(quota.reason === 'ip' ? 429 : 402, 'limit', quota.message);

  const { path, body: ycBody } = youcamTaskOf(request);
  try {
    const taskId = await createTask(path, ycBody);
    trackTask(request.kind, taskId, ip, quotaTask);
    return json({ taskId, kind: request.kind });
  } catch (err) {
    release(ip, quotaTask);
    return upstreamFailure(err);
  }
}
