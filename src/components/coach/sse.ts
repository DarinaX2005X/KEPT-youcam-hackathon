// Server-sent events framing, shared by the server (reading OpenRouter) and the panel (reading /api/coach).
// Pure: no DOM, no Node APIs.

export interface SseFrame {
  /** `event:` field; "message" when the frame has none. */
  event: string;
  /** `data:` lines joined with "\n". */
  data: string;
}

/**
 * Incremental parser. Feed it decoded text in any chunking; it returns the frames completed so far
 * and keeps the unfinished tail. Comment lines (": keep-alive") are skipped.
 */
export function createSseParser() {
  let buffer = '';

  function parseBlock(block: string): SseFrame | null {
    let event = 'message';
    const data: string[] = [];
    for (const raw of block.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    return data.length ? { event, data: data.join('\n') } : null;
  }

  return {
    push(text: string): SseFrame[] {
      buffer += text.replace(/\r\n/g, '\n');
      const frames: SseFrame[] = [];
      let cut = buffer.indexOf('\n\n');
      while (cut !== -1) {
        const frame = parseBlock(buffer.slice(0, cut));
        if (frame) frames.push(frame);
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf('\n\n');
      }
      return frames;
    },
    /** Frames left when the stream ends without a final blank line. */
    flush(): SseFrame[] {
      const rest = buffer;
      buffer = '';
      const frame = rest.trim() ? parseBlock(rest) : null;
      return frame ? [frame] : [];
    },
  };
}

/** Reads a byte stream as SSE frames. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
    yield* parser.flush();
  } finally {
    reader.releaseLock();
  }
}

/** One SSE frame as text. Data with line breaks is split over several `data:` lines. */
export function formatSse(event: string, data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\n${text
    .split('\n')
    .map((l) => `data: ${l}`)
    .join('\n')}\n\n`;
}
