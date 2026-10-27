import fs from 'node:fs';
import path from 'node:path';
import { computeVerdict, materializeManifest, type DemoManifest, type Scan, type Trial, type Verdict } from '@/lib/domain';
import { buildTrialContext, type TrialContext } from '@/components/coach/context';

const manifest: DemoManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/demo/manifest.json'), 'utf8'));

export const NOW = new Date('2026-10-27T12:00:00.000Z');

export interface Sample {
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
  context: TrialContext;
}

export function sample(match: 'retinal' | 'salicylic' | 'niacinamide'): Sample {
  let n = 0;
  const shelf = materializeManifest(manifest, NOW, () => `id${++n}`);
  const trial = shelf.trials.find((t) => t.product.name.toLowerCase().includes(match));
  if (!trial) throw new Error(`No ${match} sample`);
  const scans = shelf.scans.filter((s) => s.trialId === trial.id);
  const verdict = computeVerdict(trial, scans, NOW);
  return { trial, scans, verdict, context: buildTrialContext(trial, scans, verdict, NOW) };
}

/** A Response whose body streams these text pieces as separate chunks. */
export function streamResponse(pieces: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

export const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
