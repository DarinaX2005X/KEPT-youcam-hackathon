// Questions per IP per UTC day, in memory per server instance (like the YouCam quota).
import { DAILY_QUESTIONS } from '@/components/coach/context';

export const QUESTION_LIMIT_MESSAGE = `You've asked ${DAILY_QUESTIONS} questions today. Ask again tomorrow`;

interface LimitState {
  day: string;
  byIp: Map<string, number>;
}

const KEY = Symbol.for('kept.coach.limit');
type WithState = typeof globalThis & { [KEY]?: LimitState };

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function state(): LimitState {
  const g = globalThis as WithState;
  const today = utcDay();
  let s = g[KEY];
  if (!s) {
    s = { day: today, byIp: new Map() };
    g[KEY] = s;
  }
  if (s.day !== today) {
    s.day = today;
    s.byIp.clear();
  }
  return s;
}

function limit(): number {
  const v = Number.parseInt(process.env.COACH_QUESTIONS_PER_IP_PER_DAY ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : DAILY_QUESTIONS;
}

function unlimited(ip: string): boolean {
  return (process.env.DEMO_UNLIMITED_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ip);
}

/** Books one question for this IP. False when today's questions are used up. */
export function takeQuestion(ip: string): boolean {
  if (unlimited(ip)) return true;
  const s = state();
  const n = s.byIp.get(ip) ?? 0;
  if (n >= limit()) return false;
  s.byIp.set(ip, n + 1);
  return true;
}

/** Gives a question back when the answer failed before any text reached the person. */
export function returnQuestion(ip: string): void {
  const s = state();
  const n = (s.byIp.get(ip) ?? 0) - 1;
  if (n > 0) s.byIp.set(ip, n);
  else s.byIp.delete(ip);
}

/** Test helper. */
export function resetQuestionLimit(): void {
  delete (globalThis as WithState)[KEY];
}
