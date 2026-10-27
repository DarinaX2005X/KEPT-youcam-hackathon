// One streamed chat completion from OpenRouter (OpenAI-compatible), read chunk by chunk.
import { readSse } from '@/components/coach/sse';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const COACH_MODEL = 'google/gemini-3.8-flash';
export const ANSWER_TOKENS = 400;
export const THINKING_TOKENS = 1200;

export interface ToolCall {
  id: string;
  name: string;
  /** JSON text, joined from the streamed fragments. */
  arguments: string;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
      /** Gemini's thought signatures; must go back with the tool calls they belong to. */
      reasoning_details?: unknown[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface StepResult {
  content: string;
  toolCalls: ToolCall[];
  reasoningDetails: unknown[];
  finishReason?: string;
  usage?: { completion?: number; reasoning?: number };
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

interface DeltaToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface Chunk {
  error?: { message?: string; code?: number | string };
  usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  choices?: {
    delta?: { content?: string | null; tool_calls?: DeltaToolCall[]; reasoning_details?: unknown[] };
    finish_reason?: string | null;
  }[];
}

/**
 * Accumulates a streamed completion. Text deltas go to `onText` as they arrive; tool call
 * fragments are joined by `index` (a new `id` on a used index starts a new call, as some
 * providers number parallel calls 0, 0, 0).
 */
export async function readCompletion(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<StepResult> {
  let content = '';
  const calls: (ToolCall & { index: number })[] = [];
  const reasoningDetails: unknown[] = [];
  let finishReason: string | undefined;
  let current: (ToolCall & { index: number }) | undefined;
  let usage: StepResult['usage'];

  for await (const frame of readSse(body)) {
    const data = frame.data.trim();
    if (!data || data === '[DONE]') continue;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      continue;
    }
    if (chunk.error) throw new UpstreamError(chunk.error.message ?? 'OpenRouter stream error', typeof chunk.error.code === 'number' ? chunk.error.code : undefined);
    if (chunk.usage) usage = { completion: chunk.usage.completion_tokens, reasoning: chunk.usage.completion_tokens_details?.reasoning_tokens };
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) continue;
    if (Array.isArray(delta.reasoning_details)) reasoningDetails.push(...delta.reasoning_details);
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      onText(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const index = tc.index ?? current?.index ?? 0;
      let slot = [...calls].reverse().find((c) => c.index === index);
      if (!slot || (tc.id && slot.id && tc.id !== slot.id)) {
        slot = { index, id: tc.id ?? '', name: '', arguments: '' };
        calls.push(slot);
      }
      if (tc.id && !slot.id) slot.id = tc.id;
      if (tc.function?.name) slot.name += tc.function.name;
      if (tc.function?.arguments) slot.arguments += tc.function.arguments;
      current = slot;
    }
  }

  const toolCalls = calls
    .filter((c) => c.name)
    .map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments }));
  return { content, toolCalls, reasoningDetails, finishReason, ...(usage ? { usage } : {}) };
}

export interface StepOptions {
  apiKey: string;
  referer: string;
  messages: ChatMessage[];
  tools: readonly unknown[];
  /** 'none' forces a text answer. */
  toolChoice: 'auto' | 'none';
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Sends one streamed request and reads it to the end. */
export async function chatStep(opts: StepOptions, onText: (text: string) => void): Promise<StepResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': opts.referer,
      'X-Title': 'Kept',
    },
    body: JSON.stringify({
      model: process.env.COACH_MODEL || COACH_MODEL,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice,
      stream: true,
      // Gemini's thinking counts against max_tokens (384 to 634 tokens on live answers), so the cap is
      // ANSWER_TOKENS plus room to think. The 90-word length comes from the prompt.
      max_tokens: ANSWER_TOKENS + THINKING_TOKENS,
      temperature: 0.3,
      reasoning: { effort: 'minimal' },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    throw new UpstreamError(`OpenRouter ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  return readCompletion(res.body, onText);
}
