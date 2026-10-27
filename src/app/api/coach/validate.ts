// Checks and trims the client's request. The context comes from the browser, so every field is bounded.
import { isConcern, type Concern, type DiaryEntry, type VerdictKind } from '@/lib/domain';
import { QUESTION_MAX, type CoachPhotos, type CoachRequest, type ContextScan, type TrialContext } from '@/components/coach/context';

const KINDS: VerdictKind[] = ['too_early', 'on_track', 'working', 'purging', 'reacting', 'not_enough'];
const STATUSES = ['testing', 'kept', 'stopped', 'paused'] as const;
const CONFIDENCE = ['high', 'medium', 'low'] as const;
const MAX_SCANS = 40;
const MAX_DAY = 400;
/** 512 px JPEG at quality 0.85 is ~40–90 KB; base64 adds a third. */
const MAX_PHOTO_CHARS = 400_000;

type Result = { ok: true; value: CoachRequest } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

function concerns(v: unknown): Concern[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((c): c is Concern => typeof c === 'string' && isConcern(c)))];
}

function scoreMap(v: unknown): Partial<Record<Concern, number>> {
  const out: Partial<Record<Concern, number>> = {};
  if (!isObj(v)) return out;
  for (const [k, s] of Object.entries(v)) {
    const n = num(s, 0, 100);
    if (isConcern(k) && n !== undefined) out[k] = n;
  }
  return out;
}

function diary(v: unknown): DiaryEntry | undefined {
  if (!isObj(v)) return undefined;
  const out: DiaryEntry = {};
  if (v.newProduct === true) out.newProduct = true;
  if (v.period === true) out.period = true;
  if (v.sun === true) out.sun = true;
  if (v.poorSleep === true) out.poorSleep = true;
  const note = str(v.note, 200);
  if (note) out.note = note;
  return Object.keys(out).length ? out : undefined;
}

function scan(v: unknown): ContextScan | undefined {
  if (!isObj(v)) return undefined;
  const day = num(v.day, 0, MAX_DAY);
  if (day === undefined) return undefined;
  const out: ContextScan = { day: Math.round(day), kind: v.kind === 'baseline' ? 'baseline' : 'checkin', scores: scoreMap(v.scores) };
  const blemishes = num(v.blemishes, 0, 10_000);
  const red = num(v.redAreaPct, 0, 100);
  if (blemishes !== undefined) out.blemishes = Math.round(blemishes);
  if (red !== undefined) out.redAreaPct = red;
  const d = diary(v.diary);
  if (d) out.diary = d;
  return out;
}

function days(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((d) => num(d, 0, MAX_DAY)).filter((d): d is number => d !== undefined).slice(0, 30);
}

function context(v: unknown): TrialContext | undefined {
  if (!isObj(v) || !isObj(v.product) || !isObj(v.plan) || !isObj(v.verdict)) return undefined;
  const name = str(v.product.name, 120);
  const actives = Array.isArray(v.product.actives)
    ? v.product.actives.filter((a): a is string => typeof a === 'string').map((a) => a.slice(0, 40)).slice(0, 10)
    : [];
  const status = STATUSES.find((s) => s === v.status);
  const today = num(v.today, 0, MAX_DAY);
  const onsetDay = num(v.plan.onsetDay, 0, MAX_DAY);
  const fullEffectDay = num(v.plan.fullEffectDay, 0, MAX_DAY);
  const kind = KINDS.find((k) => k === (v.verdict as Record<string, unknown>).kind);
  if (!name || !status || today === undefined || onsetDay === undefined || fullEffectDay === undefined || !kind) return undefined;

  let purge: TrialContext['plan']['purge'];
  if (isObj(v.plan.purge)) {
    const fromDay = num(v.plan.purge.fromDay, 0, MAX_DAY);
    const toDay = num(v.plan.purge.toDay, 0, MAX_DAY);
    if (fromDay !== undefined && toDay !== undefined) purge = { fromDay, toDay };
  }
  const scans = Array.isArray(v.scans) ? v.scans.slice(0, MAX_SCANS).map(scan).filter((s): s is ContextScan => !!s) : [];
  if (!scans.length) return undefined;
  scans.sort((a, b) => a.day - b.day);

  const verdict = v.verdict;
  const projection = isObj(v.projection) ? scoreMap(v.projection) : undefined;
  return {
    product: { name, actives },
    status,
    today: Math.round(today),
    targets: concerns(v.targets),
    watch: concerns(v.watch),
    plan: { checkinDays: days(v.plan.checkinDays), onsetDay, fullEffectDay, ...(purge ? { purge } : {}) },
    ...(projection && Object.keys(projection).length ? { projection } : {}),
    scans,
    verdict: {
      kind,
      headline: str(verdict.headline, 80) ?? '',
      summary: str(verdict.summary, 400) ?? '',
      reasons: Array.isArray(verdict.reasons)
        ? verdict.reasons.filter((r): r is string => typeof r === 'string').map((r) => r.slice(0, 300)).slice(0, 6)
        : [],
      confidence: CONFIDENCE.find((c) => c === verdict.confidence) ?? 'high',
      next: str(verdict.next, 200) ?? '',
    },
  };
}

function photo(v: unknown): { day: number; url: string } | undefined {
  if (!isObj(v)) return undefined;
  const day = num(v.day, 0, MAX_DAY);
  const url = typeof v.url === 'string' ? v.url : '';
  if (day === undefined || url.length > MAX_PHOTO_CHARS || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(url)) return undefined;
  return { day: Math.round(day), url };
}

function photos(v: unknown): CoachPhotos | undefined {
  if (!isObj(v)) return undefined;
  const first = photo(v.first);
  const latest = photo(v.latest);
  return first && latest ? { first, latest } : undefined;
}

export function parseCoachRequest(body: unknown): Result {
  if (!isObj(body)) return { ok: false, message: 'Send a question and the trial' };
  const question = str(body.question, QUESTION_MAX + 1);
  if (!question) return { ok: false, message: 'Type a question first' };
  if (question.length > QUESTION_MAX) return { ok: false, message: `Keep the question under ${QUESTION_MAX} characters` };
  const ctx = context(body.context);
  if (!ctx) return { ok: false, message: "This trial's data didn't come through" };
  const p = body.photos === undefined ? undefined : photos(body.photos);
  if (body.photos !== undefined && !p) return { ok: false, message: "The photos didn't come through" };
  return { ok: true, value: { question, context: ctx, ...(p ? { photos: p } : {}) } };
}
