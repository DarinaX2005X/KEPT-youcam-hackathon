// Spending guards for the public demo: daily unit cap, analyses per IP, balance reserve.
// State is in memory per server instance and resets at midnight UTC.
import { getCredit } from './client';
import type { TaskKind } from './types';

export type QuotaTask =
  | { kind: 'analysis'; concerns: number }
  | { kind: 'simulation'; concerns: number }
  | { kind: 'aging' };

export type QuotaCheck = { ok: true; cost: number } | { ok: false; reason: 'ip' | 'daily' | 'balance'; message: string };

export const LIMIT_MESSAGE = "Today's free scans on this demo are used up. The sample trial shows the full flow";
const CREDIT_TTL_MS = 60_000;

/** Unit cost by `.vibemachina/research/youcam-unit-costs.tsv` (Skin Analysis V2.0 SD, Skin Simulation, Aging). */
export function costOf(task: QuotaTask): number {
  switch (task.kind) {
    case 'analysis':
      if (task.concerns <= 4) return 9;
      if (task.concerns <= 8) return 12;
      if (task.concerns <= 12) return 14;
      return 16;
    case 'simulation':
      return task.concerns <= 4 ? 4 : 6;
    case 'aging':
      return 2;
  }
}

interface Reservation {
  ip: string;
  task: QuotaTask;
  day: string;
}

interface QuotaState {
  day: string;
  units: number;
  scansByIp: Map<string, number>;
  credit?: { value: number; at: number };
  tasks: Map<string, Reservation>;
}

// globalThis so every route bundle and hot reload share one counter.
const KEY = Symbol.for('kept.youcam.quota');
type WithState = typeof globalThis & { [KEY]?: QuotaState };

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function state(): QuotaState {
  const g = globalThis as WithState;
  const today = utcDay();
  let s = g[KEY];
  if (!s) {
    s = { day: today, units: 0, scansByIp: new Map(), tasks: new Map() };
    g[KEY] = s;
  }
  if (s.day !== today) {
    s.day = today;
    s.units = 0;
    s.scansByIp.clear();
    s.tasks.clear();
  }
  return s;
}

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

const limits = () => ({
  dailyCap: envInt('DAILY_UNIT_CAP', 150),
  scansPerIp: envInt('SCANS_PER_IP_PER_DAY', 6),
  reserve: envInt('UNIT_RESERVE', 60),
});

function isUnlimited(ip: string): boolean {
  const list = (process.env.DEMO_UNLIMITED_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(ip);
}

/** Balance from YouCam, cached 60 s. `undefined` when YouCam can't be asked: the check is skipped. */
async function balance(s: QuotaState): Promise<number | undefined> {
  const now = Date.now();
  if (s.credit && now - s.credit.at < CREDIT_TTL_MS) return s.credit.value;
  try {
    const value = await getCredit();
    s.credit = { value, at: now };
    return value;
  } catch {
    return undefined;
  }
}

/** Checks all guards and, if they pass, books the task's units (and the IP's analysis). */
export async function checkAndReserve(ip: string, task: QuotaTask): Promise<QuotaCheck> {
  const s = state();
  const { dailyCap, scansPerIp, reserve } = limits();
  const cost = costOf(task);

  if (s.units + cost > dailyCap) return { ok: false, reason: 'daily', message: LIMIT_MESSAGE };
  if (task.kind === 'analysis' && !isUnlimited(ip) && (s.scansByIp.get(ip) ?? 0) >= scansPerIp) {
    return { ok: false, reason: 'ip', message: LIMIT_MESSAGE };
  }
  const credit = await balance(s);
  if (credit !== undefined && credit - cost < reserve) return { ok: false, reason: 'balance', message: LIMIT_MESSAGE };

  // Re-read after the await: another request may have booked units meanwhile.
  const now = state();
  if (now.units + cost > dailyCap) return { ok: false, reason: 'daily', message: LIMIT_MESSAGE };
  now.units += cost;
  if (task.kind === 'analysis') now.scansByIp.set(ip, (now.scansByIp.get(ip) ?? 0) + 1);
  if (now.credit) now.credit.value -= cost;
  return { ok: true, cost };
}

/** Gives back the units (and the IP's analysis) of a task that ended in an error. YouCam doesn't charge for those. */
export function release(ip: string, task: QuotaTask): void {
  const s = state();
  const cost = costOf(task);
  s.units = Math.max(0, s.units - cost);
  if (task.kind === 'analysis') {
    const n = (s.scansByIp.get(ip) ?? 0) - 1;
    if (n > 0) s.scansByIp.set(ip, n);
    else s.scansByIp.delete(ip);
  }
  if (s.credit) s.credit.value += cost;
}

const taskKey = (kind: TaskKind, taskId: string) => `${kind}:${taskId}`;

/** Remembers who booked a started task, so the poll route can release it on error. */
export function trackTask(kind: TaskKind, taskId: string, ip: string, task: QuotaTask): void {
  const s = state();
  s.tasks.set(taskKey(kind, taskId), { ip, task, day: s.day });
}

/** Releases a tracked task once; no-op for unknown tasks or ones booked on a previous day. */
export function releaseTask(kind: TaskKind, taskId: string): void {
  const s = state();
  const key = taskKey(kind, taskId);
  const r = s.tasks.get(key);
  if (!r) return;
  s.tasks.delete(key);
  if (r.day === s.day) release(r.ip, r.task);
}

/** Forgets a tracked task that finished successfully. */
export function settleTask(kind: TaskKind, taskId: string): void {
  state().tasks.delete(taskKey(kind, taskId));
}

/** True when the instance can still afford the cheapest task today. Used to fail uploads early. */
export function hasDailyRoom(): boolean {
  return state().units + costOf({ kind: 'aging' }) <= limits().dailyCap;
}

/**
 * Client IP from headers the client cannot forge. On Vercel the edge sets
 * `x-vercel-forwarded-for` and `x-real-ip` itself. Elsewhere only the right-most
 * `x-forwarded-for` hop (added by our own proxy) is trusted, never the left-most.
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const last = headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean).at(-1);
  return last || 'local';
}

/** Test helper: drops all counters and the credit cache. */
export function resetQuota(): void {
  delete (globalThis as WithState)[KEY];
}

/** Read-only snapshot for tests and diagnostics. */
export function quotaSnapshot(): { day: string; units: number; scansByIp: Record<string, number> } {
  const s = state();
  return { day: s.day, units: s.units, scansByIp: Object.fromEntries(s.scansByIp) };
}
