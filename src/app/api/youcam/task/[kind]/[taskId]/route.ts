import { getTask, TASK_PATH } from '@/server/youcam/client';
import { fail, json, upstreamFailure } from '@/server/youcam/http';
import { engineError, ENGINE_MESSAGES, normalizeAging, normalizeAnalysis, normalizeSimulation } from '@/server/youcam/normalize';
import { settleTask } from '@/server/youcam/quota';
import type { TaskPoll } from '@/server/youcam/types';
import { isOpaqueId, isTaskKind } from '@/server/youcam/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NORMALIZE = { analysis: normalizeAnalysis, simulation: normalizeSimulation, aging: normalizeAging };

// → { status: 'running' } | { status: 'error', code, message } | { status: 'success', result }
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; taskId: string }> }) {
  // Next already decodes params: the client sends encodeURIComponent(taskId).
  const { kind, taskId } = await ctx.params;
  if (!isTaskKind(kind)) return fail(400, 'bad_request', 'kind must be analysis, simulation or aging');
  if (!isOpaqueId(taskId)) return fail(400, 'bad_request', 'taskId is not valid');

  let data;
  try {
    data = await getTask(TASK_PATH[kind], taskId);
  } catch (err) {
    return upstreamFailure(err);
  }

  if (data.task_status === 'error') {
    // YouCam still charges for engine errors such as error_src_face_too_small, so the units stay spent.
    settleTask(kind, taskId);
    const { code, message } = engineError(data.error);
    if (data.error) console.warn(`[youcam] ${kind} task error: ${data.error}`);
    return json({ status: 'error', code, message } satisfies TaskPoll);
  }
  if (data.task_status !== 'success') return json({ status: 'running' } satisfies TaskPoll);

  settleTask(kind, taskId);
  try {
    const result = NORMALIZE[kind](data);
    return json({ status: 'success', result } satisfies TaskPoll);
  } catch (err) {
    console.warn(`[youcam] ${kind} result could not be read: ${(err as Error).message}`);
    return json({ status: 'error', code: 'upstream', message: ENGINE_MESSAGES.generic } satisfies TaskPoll);
  }
}
