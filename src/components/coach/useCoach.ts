'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ANSWER_FAILED, type CoachEvent, type CoachPhotos, type TrialContext } from './context';
import { readSse } from './sse';

export interface CoachAnswer {
  question: string;
  status: 'working' | 'done' | 'error';
  /** Tool labels in the order they ran ("Checking acne scores"). */
  tools: string[];
  text: string;
  error?: string;
  /** False when trying again can't help (today's questions are used up). */
  retryable?: boolean;
}

let enabledPromise: Promise<boolean> | undefined;

/** GET /api/coach once per page load. */
export function fetchCoachEnabled(): Promise<boolean> {
  enabledPromise ??= fetch('/api/coach', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : { enabled: false }))
    .then((b) => b.enabled === true)
    .catch(() => {
      enabledPromise = undefined;
      return false;
    });
  return enabledPromise;
}

export function useCoachEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void fetchCoachEnabled().then((v) => live && setEnabled(v));
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}

function toEvent(event: string, data: string): CoachEvent | null {
  let body: Record<string, unknown> = {};
  try {
    body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
  switch (event) {
    case 'tool':
      return { type: 'tool', name: String(body.name ?? ''), label: String(body.label ?? '') };
    case 'text':
      return { type: 'text', text: String(body.text ?? '') };
    case 'reset':
      return { type: 'reset' };
    case 'done':
      return { type: 'done' };
    case 'error':
      return { type: 'error', message: String(body.message ?? ANSWER_FAILED) };
    default:
      return null;
  }
}

/** Asks /api/coach and follows the stream. One answer at a time; a new question cancels the previous one. */
export function useCoach() {
  const [answer, setAnswer] = useState<CoachAnswer | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(async (question: string, context: TrialContext, getPhotos?: () => Promise<CoachPhotos | undefined>) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const update = (fn: (a: CoachAnswer) => CoachAnswer) => {
      if (abortRef.current === abort) setAnswer((a) => (a ? fn(a) : a));
    };
    // A half-streamed answer is dropped: the person sees the failure, not a broken sentence.
    const failWith = (error: string, retryable = true) => update((a) => ({ ...a, status: 'error', text: '', error, retryable }));

    setAnswer({ question, status: 'working', tools: [], text: '' });
    try {
      const photos = getPhotos ? await getPhotos() : undefined;
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, ...(photos ? { photos } : {}) }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        let message = ANSWER_FAILED;
        if (res.status === 429 || res.status === 400) {
          try {
            message = ((await res.json()) as { message?: string }).message || ANSWER_FAILED;
          } catch {
            // keep the generic line
          }
        }
        failWith(message, res.status !== 429);
        return;
      }
      let finished = false;
      for await (const frame of readSse(res.body)) {
        const e = toEvent(frame.event, frame.data);
        if (!e) continue;
        if (e.type === 'tool') update((a) => ({ ...a, tools: [...a.tools, e.label] }));
        else if (e.type === 'text') update((a) => ({ ...a, text: a.text + e.text }));
        else if (e.type === 'reset') update((a) => ({ ...a, text: '' }));
        else if (e.type === 'done') {
          finished = true;
          update((a) => ({ ...a, status: 'done' }));
        } else if (e.type === 'error') {
          finished = true;
          failWith(e.message);
        }
      }
      if (!finished) failWith(ANSWER_FAILED);
    } catch {
      if (!abort.signal.aborted) failWith(ANSWER_FAILED);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnswer(null);
  }, []);

  return { answer, ask, clear };
}
