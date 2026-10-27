import { clientIp } from '@/server/youcam/quota';
import { formatSse } from '@/components/coach/sse';
import { ANSWER_FAILED, type CoachEvent } from '@/components/coach/context';
import { runAgent } from './agent';
import { QUESTION_LIMIT_MESSAGE, returnQuestion, takeQuestion } from './limit';
import { parseCoachRequest } from './validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 25_000;
const NO_STORE = { 'Cache-Control': 'no-store' };

const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || '';

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: NO_STORE });
}

// GET /api/coach → { enabled }: the panel hides itself when the key is missing.
export function GET() {
  return Response.json({ enabled: Boolean(apiKey()) }, { headers: NO_STORE });
}

// POST /api/coach { question, context, photos? } → text/event-stream of CoachEvent
export async function POST(req: Request) {
  const key = apiKey();
  if (!key) return fail(503, 'disabled', 'The assistant is not available');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Send the question as JSON');
  }
  const parsed = parseCoachRequest(body);
  if (!parsed.ok) return fail(400, 'bad_request', parsed.message);

  const ip = clientIp(req.headers);
  if (!takeQuestion(ip)) return fail(429, 'limit', QUESTION_LIMIT_MESSAGE);

  const referer = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('timeout')), TIMEOUT_MS);
  const onClientGone = () => abort.abort(new Error('client closed'));
  req.signal.addEventListener('abort', onClientGone);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      let answered = false;
      const emit = (e: CoachEvent) => {
        if (!open) return;
        if (e.type === 'text') answered = true;
        const { type, ...data } = e;
        try {
          controller.enqueue(encoder.encode(formatSse(type, data)));
        } catch {
          open = false;
        }
      };
      try {
        await runAgent({ request: parsed.value, apiKey: key, referer, emit, signal: abort.signal });
        emit({ type: 'done' });
      } catch (err) {
        console.warn(`[coach] ${err instanceof Error ? err.message : String(err)}`);
        if (!answered) returnQuestion(ip);
        emit({ type: 'error', message: ANSWER_FAILED });
      } finally {
        clearTimeout(timer);
        req.signal.removeEventListener('abort', onClientGone);
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      abort.abort(new Error('client closed'));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
