import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredit = vi.fn<() => Promise<number>>();
vi.mock('@/server/youcam/client', () => ({ getCredit: () => getCredit() }));

const quota = await import('@/server/youcam/quota');
const { checkAndReserve, clientIp, costOf, hasDailyRoom, LIMIT_MESSAGE, quotaSnapshot, release, releaseTask, resetQuota, settleTask, trackTask } = quota;

const scan = { kind: 'analysis', concerns: 4 } as const;

describe('quota', () => {
  beforeEach(() => {
    resetQuota();
    getCredit.mockReset().mockResolvedValue(10_000);
    vi.stubEnv('DAILY_UNIT_CAP', '150');
    vi.stubEnv('SCANS_PER_IP_PER_DAY', '6');
    vi.stubEnv('UNIT_RESERVE', '60');
    vi.stubEnv('DEMO_UNLIMITED_IPS', '');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('prices tasks by the unit table', () => {
    expect(costOf({ kind: 'analysis', concerns: 1 })).toBe(9);
    expect(costOf({ kind: 'analysis', concerns: 4 })).toBe(9);
    expect(costOf({ kind: 'analysis', concerns: 5 })).toBe(12);
    expect(costOf({ kind: 'analysis', concerns: 8 })).toBe(12);
    expect(costOf({ kind: 'simulation', concerns: 4 })).toBe(4);
    expect(costOf({ kind: 'simulation', concerns: 5 })).toBe(6);
    expect(costOf({ kind: 'aging' })).toBe(2);
  });

  it('refuses the seventh analysis from one IP, but not other IPs or simulations', async () => {
    vi.stubEnv('DAILY_UNIT_CAP', '1000');
    for (let i = 0; i < 6; i++) expect(await checkAndReserve('1.2.3.4', scan)).toEqual({ ok: true, cost: 9 });
    expect(await checkAndReserve('1.2.3.4', scan)).toEqual({ ok: false, reason: 'ip', message: LIMIT_MESSAGE });
    expect((await checkAndReserve('5.6.7.8', scan)).ok).toBe(true);
    expect((await checkAndReserve('1.2.3.4', { kind: 'simulation', concerns: 3 })).ok).toBe(true);
  });

  it('lets DEMO_UNLIMITED_IPS past the per-IP limit', async () => {
    vi.stubEnv('DAILY_UNIT_CAP', '1000');
    vi.stubEnv('DEMO_UNLIMITED_IPS', 'local, ::1');
    for (let i = 0; i < 8; i++) expect((await checkAndReserve('::1', scan)).ok).toBe(true);
  });

  it('refuses when the daily unit cap would be exceeded', async () => {
    vi.stubEnv('DAILY_UNIT_CAP', '30');
    expect((await checkAndReserve('a', scan)).ok).toBe(true); // 9
    expect((await checkAndReserve('b', scan)).ok).toBe(true); // 18
    expect((await checkAndReserve('c', scan)).ok).toBe(true); // 27
    expect(await checkAndReserve('d', scan)).toEqual({ ok: false, reason: 'daily', message: LIMIT_MESSAGE });
    expect((await checkAndReserve('d', { kind: 'aging' })).ok).toBe(true); // 29
    expect(hasDailyRoom()).toBe(false);
  });

  it('keeps the balance reserve and caches credit for 60 s', async () => {
    getCredit.mockResolvedValue(75);
    expect((await checkAndReserve('a', scan)).ok).toBe(true); // 75 - 9 = 66 ≥ 60
    expect(await checkAndReserve('a', scan)).toMatchObject({ ok: false, reason: 'balance' }); // cached 66 - 9 < 60
    expect(getCredit).toHaveBeenCalledTimes(1);
  });

  it('skips the balance check when YouCam cannot be asked', async () => {
    getCredit.mockRejectedValue(new Error('down'));
    expect((await checkAndReserve('a', scan)).ok).toBe(true);
  });

  it('resets counters at midnight UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T23:59:00Z'));
    for (let i = 0; i < 6; i++) await checkAndReserve('ip', scan);
    expect((await checkAndReserve('ip', scan)).ok).toBe(false);
    vi.setSystemTime(new Date('2026-10-28T00:00:01Z'));
    expect((await checkAndReserve('ip', scan)).ok).toBe(true);
    expect(quotaSnapshot()).toMatchObject({ day: '2026-10-28', units: 9, scansByIp: { ip: 1 } });
  });

  it('release gives back units and the analysis', async () => {
    await checkAndReserve('ip', scan);
    release('ip', scan);
    expect(quotaSnapshot()).toMatchObject({ units: 0, scansByIp: {} });
  });

  it('releases a tracked task once on error and forgets settled ones', async () => {
    await checkAndReserve('ip', scan);
    trackTask('analysis', 't1', 'ip', scan);
    releaseTask('analysis', 't1');
    releaseTask('analysis', 't1');
    expect(quotaSnapshot().units).toBe(0);

    await checkAndReserve('ip', scan);
    trackTask('analysis', 't2', 'ip', scan);
    settleTask('analysis', 't2');
    releaseTask('analysis', 't2');
    expect(quotaSnapshot().units).toBe(9);
  });

  it('reads the client IP from headers the client cannot forge', () => {
    expect(clientIp(new Headers({ 'x-vercel-forwarded-for': '7.7.7.7', 'x-forwarded-for': '1.1.1.1' }))).toBe('7.7.7.7');
    // A spoofed left-most x-forwarded-for entry is ignored; only our proxy's right-most hop counts.
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('10.0.0.1');
    expect(clientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(new Headers())).toBe('local');
  });
});
