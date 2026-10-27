import { ADVICE, type StillAnalysis } from '@/lib/capture';

/**
 * Side light allowed on uploads and the sample face, in luma points between the cheeks. The live camera
 * keeps the stricter 35: there the person can still turn to the light, a finished photo can't change.
 */
export const STILL_SIDE_GAP = 60;

/**
 * The still's checks with the side-light rule relaxed for photos that already exist. The sample faces
 * are Kept's own known photos (lit from a window on one side), so side light never counts against them.
 */
export function relaxStill(analysis: StillAnalysis): StillAnalysis {
  const { left, right } = analysis.metrics.light;
  const sideOk = analysis.result.meta.source === 'sample' || Math.abs(left - right) <= STILL_SIDE_GAP;
  const checks = analysis.checks.map((c) => (c.id === 'light' && c.state === 'fix' && c.text === ADVICE.side && sideOk ? { ...c, state: 'good' as const, text: ADVICE.good } : c));
  return { ...analysis, checks };
}

/** Resolves once the preview can paint, so the photo and its checks appear together. */
export async function decoded(url: string): Promise<void> {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    // A failed decode still shows the print with its empty background.
  }
}
