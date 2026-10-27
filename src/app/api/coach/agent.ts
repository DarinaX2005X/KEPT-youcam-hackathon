// The agent loop: up to four rounds of tool calls, then the answer streamed as text.
import type { CoachEvent, CoachRequest } from '@/components/coach/context';
import { chatStep, UpstreamError, type ChatMessage } from './openrouter';
import { buildMessages } from './prompt';
import { executeTool, TOOL_DEFS } from './tools';

export const MAX_TOOL_STEPS = 4;
/** A cut-off answer shorter than this after trimming to whole sentences counts as a failure. */
const MIN_ANSWER_CHARS = 80;

/** Text up to the last sentence end. */
export function completeSentences(text: string): string {
  const m = text.match(/^[\s\S]*[.?!](?=\s|$)/);
  return m ? m[0].trim() : '';
}

export interface AgentOptions {
  request: CoachRequest;
  apiKey: string;
  referer: string;
  emit: (event: CoachEvent) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Runs the conversation to a final answer. Throws on upstream failure or an empty answer. */
export async function runAgent({ request, apiKey, referer, emit, signal, fetchImpl }: AgentOptions): Promise<{ answer: string; tools: string[] }> {
  const messages: ChatMessage[] = buildMessages(request);
  const used: string[] = [];

  for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
    const lastRound = step === MAX_TOOL_STEPS;
    let streamed = false;
    const result = await chatStep(
      { apiKey, referer, messages, tools: TOOL_DEFS, toolChoice: lastRound ? 'none' : 'auto', signal, fetchImpl },
      (text) => {
        streamed = true;
        emit({ type: 'text', text });
      },
    );

    if (result.toolCalls.length && !lastRound) {
      // Text before a tool call is a preamble ("Let me check"), not the answer.
      if (streamed) emit({ type: 'reset' });
      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
        ...(result.reasoningDetails.length ? { reasoning_details: result.reasoningDetails } : {}),
      });
      for (const call of result.toolCalls) {
        const outcome = executeTool(call.name, call.arguments, request.context);
        used.push(call.name);
        emit({ type: 'tool', name: call.name, label: outcome.label });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.result) });
      }
      continue;
    }

    console.info(`[coach] answer finish=${result.finishReason ?? '?'} tokens=${result.usage?.completion ?? '?'} reasoning=${result.usage?.reasoning ?? '?'} tools=${used.join(',') || 'none'}`);
    let answer = result.content.trim();
    if (result.finishReason === 'length') {
      // Out of tokens mid-sentence: keep the complete sentences, or fail if too little is left.
      const cut = completeSentences(answer);
      if (cut.length < MIN_ANSWER_CHARS) throw new UpstreamError('The answer was cut off');
      if (cut !== answer) {
        emit({ type: 'reset' });
        emit({ type: 'text', text: cut });
      }
      answer = cut;
    }
    if (!answer) throw new UpstreamError('The model returned an empty answer');
    return { answer, tools: used };
  }
  throw new UpstreamError('No answer after the tool rounds');
}
