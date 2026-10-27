import manifestJson from '../../../public/demo/manifest.json';
import {
  buyCheck,
  computeVerdict,
  expectedScore,
  HEADLINES,
  materializeManifest,
  type BuyCheckResult,
  type Concern,
  type DemoManifest,
  type Reason,
  type Scan,
  type Trial,
  type Verdict,
  type VerdictKind,
} from '@/lib/domain';
import { latestScan, mainChange, progressOf, tabOf } from '@/components/shelf/model';
import type { ShelfItem } from '@/components/shelf';
import type { TrialUrls } from '@/components/trial';
import { VERDICT_FIXTURES } from '@/components/trial/fixtures';

const manifest = manifestJson as unknown as DemoManifest;

/**
 * Everything the landing shows comes from the demo manifest, turned into trial records in memory.
 * Nothing is written to IndexedDB. `now` is the moment the demo was generated, so the server render
 * and the browser render agree and the page can be static.
 */
const NOW = new Date(manifest.generatedAt);

function refUrl(ref: unknown): string {
  return ref && typeof ref === 'object' && 'url' in ref ? String((ref as { url: string }).url) : '';
}

function materialize() {
  let n = 0;
  const sample = materializeManifest(manifest, NOW, () => `landing-${n++}`);
  const byManifestId = (id: string) => sample.trials.find((t) => t.id === sample.idMap[id]);
  const scansOf = (t: Trial) => sample.scans.filter((s) => s.trialId === t.id).sort((a, b) => a.day - b.day);
  return { sample, byManifestId, scansOf };
}

export interface ScenePoint {
  day: number;
  value: number;
}

export interface SceneFrame {
  day: number;
  photo: string;
  mask?: string;
  blemishes?: number;
  acne?: number;
}

export interface HeroData {
  base: SceneFrame;
  latest: SceneFrame;
  target: { day: number; photo: string; acne: number };
  /** Acne score at every check-in before the latest one. */
  history: ScenePoint[];
  /** Expected acne score for each day 0..fullEffectDay. */
  expected: number[];
  noise: number;
  fullEffectDay: number;
  checkinDays: number[];
  /** Photos in the trial, day 0 included. */
  photos: number;
  verdict: Verdict;
}

export interface WorkspaceData {
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
  urls: TrialUrls;
  now: string;
}

export interface VerdictRow {
  kind: VerdictKind;
  headline: string;
  summary: string;
  reasons: Reason[];
  next: string;
  /** Set when the example is a real verdict of a demo trial; otherwise it is the engine's example wording. */
  product?: string;
}

export interface BuyCheckData {
  name: string;
  inci: string;
  result: BuyCheckResult;
  shelf: ShelfItem[];
}

export interface MechanismData {
  /** Day of the check-in the camera and map fragments show. */
  day: number;
  photo: string;
  ghost: string;
  maskPhoto: string;
  mask: string;
  scores: { concern: Concern; label: string; value: number }[];
  blemishes: number;
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
}

export interface LandingData {
  hero: HeroData;
  workspace: WorkspaceData;
  mechanism: MechanismData;
  verdicts: VerdictRow[];
  buy: BuyCheckData;
  faceCredit: string;
}

function urlsFor(trial: Trial, scans: Scan[]): TrialUrls {
  const urls: TrialUrls = { photo: {}, masks: {} };
  for (const s of scans) {
    urls.photo[s.id] = refUrl(s.photo);
    const masks: TrialUrls['masks'][string] = {};
    for (const [c, ref] of Object.entries(s.masks) as [Concern, unknown][]) masks[c] = refUrl(ref);
    urls.masks[s.id] = masks;
  }
  if (trial.projection) urls.target = refUrl(trial.projection.photo);
  return urls;
}

/** The hero tells the acne story, so its reasons are the acne ones first. Texts are the engine's own. */
function heroReasons(verdict: Verdict): Reason[] {
  const rank = (r: Reason) => (r.text.startsWith('Blemishes') ? 0 : r.concern === 'acne' ? 1 : 2);
  return [...verdict.reasons].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}

/** Next steps without calendar dates, which would be relative to the demo's own clock. */
const FALLBACK_NEXT: Record<VerdictKind, string> = {
  too_early: 'Keep using it and check in on the next planned day',
  on_track: 'Keep going, the next check-in will tell more',
  working: 'Keep it on your shelf',
  purging: 'Keep going, a purge usually settles within weeks',
  reacting: 'Use it every other night and check in a week later',
  not_enough: 'Stop it and spend the money on something else',
};

const NEXT_WORDS: Partial<Record<Verdict['next']['action'], string>> = {
  decide_keep: 'Keep it on your shelf',
  decide_stop: 'Stop it and spend the money on something else',
  keep_going: 'Keep going, a purge usually settles within weeks',
};

const ORDER: VerdictKind[] = ['too_early', 'on_track', 'working', 'purging', 'reacting', 'not_enough'];

export const EXAMPLE_NAME = 'Niacinamide serum';
export const EXAMPLE_INCI = 'Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Tamarindus Indica Seed Gum, Sodium Hyaluronate, Phenoxyethanol';

export function buildLandingData(): LandingData {
  const { sample, byManifestId, scansOf } = materialize();
  const sal = byManifestId('sample-salicylic');
  if (!sal) throw new Error('Demo manifest has no salicylic trial');
  const salScans = scansOf(sal);
  const verdict = computeVerdict(sal, salScans, NOW);
  const base = salScans.find((s) => s.kind === 'baseline') ?? salScans[0];
  const latest = salScans[salScans.length - 1];
  const full = sal.plan.fullEffectDay;

  const frame = (s: Scan): SceneFrame => ({
    day: s.day,
    photo: refUrl(s.photo),
    mask: refUrl(s.masks.acne),
    blemishes: s.maskStats.acne?.blemishCount,
    acne: s.scores.acne?.ui,
  });

  const expected: number[] = [];
  for (let d = 0; d <= full; d += 1) expected.push(expectedScore(sal, base, 'acne', d) ?? base.scores.acne?.ui ?? 0);

  const hero: HeroData = {
    base: frame(base),
    latest: frame(latest),
    target: { day: full, photo: refUrl(sal.projection?.photo), acne: sal.projection?.scores.acne?.ui ?? expected[full] },
    history: salScans
      .filter((s) => s !== latest && s.scores.acne)
      .map((s) => ({ day: s.day, value: s.scores.acne!.ui })),
    expected,
    noise: manifest.noise,
    fullEffectDay: full,
    checkinDays: sal.plan.checkinDays.filter((d) => d <= full),
    photos: salScans.length,
    verdict: { ...verdict, reasons: heroReasons(verdict) },
  };

  const workspace: WorkspaceData = {
    trial: sal,
    scans: salScans,
    verdict,
    urls: urlsFor(sal, salScans),
    now: NOW.toISOString(),
  };

  // The mechanism is told on the retinal trial, so the page does not repeat the salicylic story a third time.
  const ret = byManifestId('sample-retinal') ?? sal;
  const retScans = scansOf(ret);
  const retBase = retScans.find((s) => s.kind === 'baseline') ?? retScans[0];
  const retLast = retScans[retScans.length - 1];
  const label = (c: Concern) => ({ acne: 'Acne', texture: 'Texture', redness: 'Redness', pore: 'Pores', oiliness: 'Oiliness', moisture: 'Hydration' })[c as string] ?? c;
  const mechanism: MechanismData = {
    day: retLast.day,
    photo: refUrl(retLast.photo),
    ghost: refUrl(retBase.photo),
    maskPhoto: refUrl(retLast.photo),
    mask: refUrl(retLast.masks.acne),
    scores: (['acne', 'texture', 'redness'] as Concern[])
      .filter((c) => retLast.scores[c])
      .map((c) => ({ concern: c, label: label(c), value: retLast.scores[c]!.ui })),
    blemishes: retLast.maskStats.acne?.blemishCount ?? 0,
    trial: ret,
    scans: retScans,
    verdict: computeVerdict(ret, retScans, NOW),
  };

  // Verdict examples: real verdicts of the three demo trials, the engine's example wording for the other three.
  const real: Partial<Record<VerdictKind, VerdictRow>> = {};
  for (const t of sample.trials) {
    const scans = scansOf(t);
    if (!scans.length) continue;
    const v = computeVerdict(t, scans, NOW);
    real[v.kind] = {
      kind: v.kind,
      headline: v.headline,
      summary: v.summary,
      reasons: v.reasons.slice(0, 3),
      next: NEXT_WORDS[v.next.action] ?? FALLBACK_NEXT[v.kind],
      product: t.product.name,
    };
  }
  const verdicts = ORDER.map((kind): VerdictRow => {
    const r = real[kind];
    if (r) return r;
    const f = VERDICT_FIXTURES[kind];
    return { kind, headline: HEADLINES[kind], summary: f.summary, reasons: f.reasons.slice(0, 3), next: FALLBACK_NEXT[kind] };
  });

  // Before you buy, against the demo shelf.
  const scansByTrial: Record<string, Scan[]> = {};
  for (const t of sample.trials) scansByTrial[t.id] = scansOf(t);
  const result = buyCheck({ inci: EXAMPLE_INCI }, sample.trials, scansByTrial, NOW);
  const shelf: ShelfItem[] = sample.trials.map((t) => {
    const scans = scansByTrial[t.id];
    const v = scans.length ? computeVerdict(t, scans, NOW) : null;
    const last = latestScan(scans);
    return {
      trial: t,
      scans,
      tab: tabOf(t),
      verdict: v,
      prevention: false,
      progress: progressOf(t, scans, NOW),
      change: t.status === 'kept' || t.status === 'stopped' ? mainChange(t, scans, v?.kind) : undefined,
      thumb: last ? refUrl(last.photo) : undefined,
      thumbDay: last?.day,
    };
  });

  return {
    hero,
    workspace,
    mechanism,
    verdicts,
    buy: { name: EXAMPLE_NAME, inci: EXAMPLE_INCI, result, shelf },
    faceCredit: 'Face generated with YouCam AI',
  };
}
