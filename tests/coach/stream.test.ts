import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSseParser, formatSse } from '@/components/coach/sse';
import { readCompletion, UpstreamError, OPENROUTER_URL } from '@/app/api/coach/openrouter';
import { runAgent, MAX_TOOL_STEPS } from '@/app/api/coach/agent';
import { parseCoachRequest } from '@/app/api/coach/validate';
import { resetQuestionLimit, returnQuestion, takeQuestion } from '@/app/api/coach/limit';
import type { CoachEvent } from '@/components/coach/context';
import { chunk, sample, streamResponse } from './fixtures';

describe('SSE parser', () => {
  it('joins frames split across chunks and skips comments', () => {
    const p = createSseParser();
    expect(p.push(': OPENROUTER PROCESSING\n\nevent: to')).toEqual([]);
    expect(p.push('ol\ndata: {"a":1}\r\n\r\ndata: x\ndata: y\n\n')).toEqual([
      { event: 'tool', data: '{"a":1}' },
      { event: 'message', data: 'x\ny' },
    ]);
    expect(p.push('data: tail')).toEqual([]);
    expect(p.flush()).toEqual([{ event: 'message', data: 'tail' }]);
  });

  it('round-trips formatted events', () => {
    const p = createSseParser();
    expect(p.push(formatSse('text', { text: 'two\nlines' }))).toEqual([{ event: 'text', data: '{"text":"two\\nlines"}' }]);
  });
});

describe('readCompletion', () => {
  it('streams text and joins tool call arguments by index', async () => {
    const texts: string[] = [];
    const res = streamResponse([
      chunk({ content: '', reasoning_details: [{ type: 'reasoning.encrypted', data: 'sig', id: 'call_1' }] }),
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_scores', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"conc' } }] }).slice(0, 30),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"conc' } }] }).slice(30),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'ern":"acne"}' } }] }),
      chunk({ tool_calls: [{ index: 1, id: 'call_2', function: { name: 'active_timeline', arguments: '{"activeId":"retinal"}' } }] }),
      chunk({ content: '' }, 'tool_calls'),
      'data: [DONE]\n\n',
    ]);
    const out = await readCompletion(res.body!, (t) => texts.push(t));
    expect(texts).toEqual([]);
    expect(out.finishReason).toBe('tool_calls');
    expect(out.toolCalls).toEqual([
      { id: 'call_1', name: 'get_scores', arguments: '{"concern":"acne"}' },
      { id: 'call_2', name: 'active_timeline', arguments: '{"activeId":"retinal"}' },
    ]);
    expect(out.reasoningDetails).toEqual([{ type: 'reasoning.encrypted', data: 'sig', id: 'call_1' }]);
  });

  it('treats a new id on a reused index as a separate call', async () => {
    const res = streamResponse([
      chunk({ tool_calls: [{ index: 0, id: 'a', function: { name: 'get_scores', arguments: '{"concern":"acne"}' } }] }),
      chunk({ tool_calls: [{ index: 0, id: 'b', function: { name: 'get_scores', arguments: '{"concern":"texture"}' } }] }),
    ]);
    const out = await readCompletion(res.body!, () => {});
    expect(out.toolCalls.map((c) => c.arguments)).toEqual(['{"concern":"acne"}', '{"concern":"texture"}']);
  });

  it('passes text deltas through in order', async () => {
    const texts: string[] = [];
    const out = await readCompletion(streamResponse([chunk({ content: 'Acne ' }), chunk({ content: '72 → 66.' }, 'stop')]).body!, (t) => texts.push(t));
    expect(texts).toEqual(['Acne ', '72 → 66.']);
    expect(out.content).toBe('Acne 72 → 66.');
    expect(out.toolCalls).toEqual([]);
  });

  it('throws on an error inside the stream', async () => {
    const res = streamResponse([`data: ${JSON.stringify({ error: { message: 'Provider down', code: 502 } })}\n\n`]);
    await expect(readCompletion(res.body!, () => {})).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('runAgent', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const request = { question: 'Why is my acne worse?', context: sample('retinal').context };

  beforeEach(() => fetchMock.mockReset());

  function bodies(): any[] {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  }

  it('runs a tool round, then streams the answer', async () => {
    fetchMock
      .mockResolvedValueOnce(
        streamResponse([
          chunk({ content: 'Let me check. ' }),
          chunk({ reasoning_details: [{ type: 'reasoning.encrypted', data: 'sig', id: 'c1' }] }),
          chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_scores', arguments: '{"concern":"acne"}' } }] }, 'tool_calls'),
        ]),
      )
      .mockResolvedValueOnce(streamResponse([chunk({ content: 'Acne went 72 → 66 by day 18' }), chunk({ content: ', inside the purging window.' }, 'stop')]));
    const events: CoachEvent[] = [];
    const out = await runAgent({ request, apiKey: 'k', referer: 'https://kept.test', emit: (e) => events.push(e), fetchImpl: fetchMock });

    expect(events).toEqual([
      { type: 'text', text: 'Let me check. ' },
      { type: 'reset' },
      { type: 'tool', name: 'get_scores', label: 'Checking acne scores' },
      { type: 'text', text: 'Acne went 72 → 66 by day 18' },
      { type: 'text', text: ', inside the purging window.' },
    ]);
    expect(out).toEqual({ answer: 'Acne went 72 → 66 by day 18, inside the purging window.', tools: ['get_scores'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer k', 'HTTP-Referer': 'https://kept.test', 'X-Title': 'Kept' });
    const [first, second] = bodies();
    expect(first).toMatchObject({ model: 'google/gemini-3.8-flash', stream: true, max_tokens: 1600, temperature: 0.3, tool_choice: 'auto' });
    expect(first.messages[0].role).toBe('system');
    expect(first.messages[1]).toEqual({ role: 'user', content: 'Why is my acne worse?' });
    const assistant = second.messages[2];
    expect(assistant.tool_calls[0]).toEqual({ id: 'c1', type: 'function', function: { name: 'get_scores', arguments: '{"concern":"acne"}' } });
    expect(assistant.reasoning_details).toEqual([{ type: 'reasoning.encrypted', data: 'sig', id: 'c1' }]);
    const tool = second.messages[3];
    expect(tool.role).toBe('tool');
    expect(tool.tool_call_id).toBe('c1');
    expect(JSON.parse(tool.content).byDay.at(-1)).toMatchObject({ day: 18, score: 66 });
  });

  it('forces a text answer after four tool rounds', async () => {
    const toolTurn = () => streamResponse([chunk({ tool_calls: [{ index: 0, id: 'x', function: { name: 'get_scores', arguments: '{"concern":"acne"}' } }] })]);
    for (let i = 0; i < MAX_TOOL_STEPS; i++) fetchMock.mockResolvedValueOnce(toolTurn());
    fetchMock.mockResolvedValueOnce(streamResponse([chunk({ content: 'Done.' })]));
    await runAgent({ request, apiKey: 'k', referer: 'r', emit: () => {}, fetchImpl: fetchMock });
    const all = bodies();
    expect(all).toHaveLength(MAX_TOOL_STEPS + 1);
    expect(all.at(-1).tool_choice).toBe('none');
  });

  it('adds the photos as image parts when they are sent', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse([chunk({ content: 'Fine.' })]));
    const url = 'data:image/jpeg;base64,AAAA';
    await runAgent({
      request: { ...request, photos: { first: { day: 0, url }, latest: { day: 18, url } } },
      apiKey: 'k',
      referer: 'r',
      emit: () => {},
      fetchImpl: fetchMock,
    });
    const content = bodies()[0].messages[1].content;
    expect(content.filter((p: any) => p.type === 'image_url')).toHaveLength(2);
    expect(content).toContainEqual({ type: 'text', text: 'Photo 2: day 18' });
  });

  it('keeps whole sentences of an answer cut off by the token limit', async () => {
    const full = 'Pores went 69 → 69 and oiliness 77 → 76 over 56 days, both inside the ±4 point range. Nothing moved beyond';
    fetchMock.mockResolvedValueOnce(streamResponse([chunk({ content: full }, 'length')]));
    const events: CoachEvent[] = [];
    const out = await runAgent({ request, apiKey: 'k', referer: 'r', emit: (e) => events.push(e), fetchImpl: fetchMock });
    expect(out.answer).toBe('Pores went 69 → 69 and oiliness 77 → 76 over 56 days, both inside the ±4 point range.');
    expect(events.slice(-2)).toEqual([{ type: 'reset' }, { type: 'text', text: out.answer }]);

    fetchMock.mockResolvedValueOnce(streamResponse([chunk({ content: 'Across your entire 56-day trial, none of your tracked' }, 'length')]));
    await expect(runAgent({ request, apiKey: 'k', referer: 'r', emit: () => {}, fetchImpl: fetchMock })).rejects.toThrow(/cut off/);
  });

  it('fails on an upstream error and on an empty answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(runAgent({ request, apiKey: 'k', referer: 'r', emit: () => {}, fetchImpl: fetchMock })).rejects.toBeInstanceOf(UpstreamError);
    fetchMock.mockResolvedValueOnce(streamResponse([chunk({ content: '' }, 'stop')]));
    await expect(runAgent({ request, apiKey: 'k', referer: 'r', emit: () => {}, fetchImpl: fetchMock })).rejects.toThrow(/empty/);
  });
});

describe('parseCoachRequest', () => {
  const context = sample('retinal').context;

  it('accepts a valid request and drops unknown concerns', () => {
    const r = parseCoachRequest({ question: '  When will I see results? ', context: { ...context, targets: ['acne', 'elbows'] } });
    expect(r.ok && r.value.question).toBe('When will I see results?');
    expect(r.ok && r.value.context.targets).toEqual(['acne']);
  });

  it('rejects empty or long questions, broken context and non-JPEG photos', () => {
    expect(parseCoachRequest({ question: ' ', context }).ok).toBe(false);
    expect(parseCoachRequest({ question: 'x'.repeat(301), context }).ok).toBe(false);
    expect(parseCoachRequest({ question: 'Hi', context: { ...context, scans: [] } }).ok).toBe(false);
    const photo = { day: 0, url: 'https://evil.example/x.jpg' };
    expect(parseCoachRequest({ question: 'Hi', context, photos: { first: photo, latest: photo } }).ok).toBe(false);
  });
});

describe('question limit', () => {
  beforeEach(() => {
    resetQuestionLimit();
    vi.stubEnv('DEMO_UNLIMITED_IPS', '');
    vi.stubEnv('COACH_QUESTIONS_PER_IP_PER_DAY', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('allows 10 questions per IP a day and gives back failed ones', () => {
    for (let i = 0; i < 10; i++) expect(takeQuestion('1.2.3.4')).toBe(true);
    expect(takeQuestion('1.2.3.4')).toBe(false);
    expect(takeQuestion('5.6.7.8')).toBe(true);
    returnQuestion('1.2.3.4');
    expect(takeQuestion('1.2.3.4')).toBe(true);
  });
});
