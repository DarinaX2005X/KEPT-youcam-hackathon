'use client';

import clsx from 'clsx';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  concernLabel,
  dayOf,
  expectedScore,
  formatShortDate,
  NOISE,
  type Concern,
  type Scan,
  type Trial,
} from '@/lib/domain';
import { Chip } from '@/components/ui';
import { baselineOf, sortScans } from './model';
import styles from './TrendChart.module.css';

export interface TrendChartProps {
  trial: Trial;
  scans: Scan[];
  concern: Concern;
  onConcernChange?: (concern: Concern) => void;
  /** Areas offered above the chart; defaults to the trial's goals. */
  concerns?: Concern[];
  now?: Date;
  noise?: number;
  /** Scan id of the frame on the stage; its point is ringed. */
  selectedId?: string;
  onPointSelect?: (scanId: string) => void;
  /** No hover, no entrance animation (report, print). */
  staticMode?: boolean;
  className?: string;
}

interface Pt {
  id: string;
  day: number;
  value: number;
  date: string;
}

const M = { top: 28, right: 64, bottom: 30, left: 34 };
const EASE = [0.2, 0.8, 0.2, 1] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function linePath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/**
 * Expected against actual for one area. The band is where the score should be on each day if the
 * product works (expected ± the noise between repeat photos); without a target it is day 0 ± noise.
 */
export function TrendChart({
  trial,
  scans,
  concern,
  onConcernChange,
  concerns,
  now,
  noise = NOISE,
  selectedId,
  onPointSelect,
  staticMode = false,
  className,
}: TrendChartProps) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const clipId = useId();
  const [hover, setHover] = useState<string | null>(null);
  const options = concerns ?? trial.targets;
  const label = concernLabel(concern);
  const baseline = baselineOf(scans);
  const plan = trial.plan;
  const decided = trial.status === 'kept' || trial.status === 'stopped';

  const points: Pt[] = useMemo(
    () =>
      sortScans(scans)
        .filter((s) => s.scores[concern]?.ui !== undefined)
        .map((s) => ({ id: s.id, day: s.day, value: s.scores[concern]!.ui, date: s.takenAt })),
    [scans, concern],
  );

  const lastDay = points.length ? points[points.length - 1].day : 0;
  const xMax = Math.max(plan.fullEffectDay, lastDay);
  const hasTarget = Boolean(baseline && expectedScore(trial, baseline, concern, plan.fullEffectDay) !== null);
  const baseValue = baseline?.scores[concern]?.ui;

  const band = useMemo(() => {
    if (!baseline || baseValue === undefined) return [] as { d: number; mid: number }[];
    const out: { d: number; mid: number }[] = [];
    for (let d = 0; d <= xMax; d += 1) {
      const mid = hasTarget ? (expectedScore(trial, baseline, concern, Math.min(d, plan.fullEffectDay)) ?? baseValue) : baseValue;
      out.push({ d, mid });
    }
    return out;
  }, [baseline, baseValue, xMax, hasTarget, trial, concern, plan.fullEffectDay]);

  const values = [...points.map((p) => p.value), ...band.flatMap((b) => [b.mid - noise, b.mid + noise])];
  const lo = values.length ? Math.min(...values) : 50;
  const hi = values.length ? Math.max(...values) : 80;
  const yMin = Math.max(0, Math.floor((lo - 2) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((hi + 2) / 5) * 5);
  const yStep = yMax - yMin > 30 ? 10 : 5;

  const height = width && width < 420 ? 220 : 248;
  const iw = Math.max(0, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x = (d: number) => M.left + (d / xMax) * iw;
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;

  const nowDay = now ? dayOf(trial, now) : undefined;
  const showToday = !decided && nowDay !== undefined && nowDay >= 0 && nowDay <= xMax;
  const target = hasTarget && baseline ? expectedScore(trial, baseline, concern, plan.fullEffectDay) : null;

  // Ticks on the planned days, skipping labels that would collide.
  const xTicks: number[] = [];
  for (const d of [0, ...plan.checkinDays, ...(xMax > plan.fullEffectDay ? [xMax] : [])]) {
    if (d > xMax || xTicks.includes(d)) continue;
    // "Day 0" is start-anchored and about 36 px wide; the other labels are centred and short.
    if (xTicks.length && x(d) - x(xTicks[xTicks.length - 1]) < (xTicks.length === 1 ? 48 : 26)) continue;
    xTicks.push(d);
  }
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

  // Entrance: the first render draws the line; later new points drop in.
  const seen = useRef<Set<string> | null>(null);
  const firstRender = seen.current === null;
  const fresh = new Set(firstRender ? [] : points.map((p) => p.id).filter((id) => !seen.current!.has(id)));
  const prevLastX = useRef<number | null>(null);
  useEffect(() => {
    seen.current = new Set(points.map((p) => p.id));
    prevLastX.current = points.length ? points[points.length - 1].day : null;
  });
  const startFraction =
    !firstRender && fresh.size && prevLastX.current !== null && lastDay > 0 ? Math.min(1, prevLastX.current / lastDay) : firstRender ? 0 : 1;

  const fact = points.map((p) => ({ x: x(p.day), y: y(p.value) }));
  const bandTop = band.map((b) => ({ x: x(b.d), y: y(Math.min(yMax, b.mid + noise)) }));
  const bandBottom = band.map((b) => ({ x: x(b.d), y: y(Math.max(yMin, b.mid - noise)) })).reverse();
  const bandPath = band.length ? `${linePath(bandTop)} ${linePath(bandBottom).replace(/^M/, 'L')} Z` : '';
  const midPath = hasTarget ? linePath(band.filter((b) => b.d <= plan.fullEffectDay).map((b) => ({ x: x(b.d), y: y(b.mid) }))) : '';

  const hovered = points.find((p) => p.id === hover);
  const last = points[points.length - 1];
  const summary = last
    ? `${label} score from ${baseValue ?? last.value} on day 0 to ${last.value} on day ${last.day}` +
      (target !== null ? `, target ${Math.round(target)} by day ${plan.fullEffectDay}` : '')
    : `${label} score chart`;

  return (
    <section className={clsx(styles.panel, className)} aria-label={`${label} score by day`}>
      <div className={styles.head}>
        <h3 className={styles.title}>{label} score by day</h3>
        {options.length > 1 && onConcernChange ? (
          <div className={styles.switch} role="group" aria-label="Area on the chart">
            {options.map((c) => (
              <Chip key={c} selected={c === concern} onClick={() => onConcernChange(c)} className={styles.chip}>
                {concernLabel(c)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={boxRef} className={styles.plot} style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={summary} className={styles.svg}>
            <defs>
              <clipPath id={clipId}>
                <rect x={M.left} y={M.top} width={iw} height={ih} />
              </clipPath>
            </defs>

            {/* Purge window */}
            {plan.purge ? (
              <g>
                <rect
                  x={x(plan.purge.fromDay)}
                  y={M.top}
                  width={Math.max(0, x(Math.min(plan.purge.toDay, xMax)) - x(plan.purge.fromDay))}
                  height={ih}
                  className={styles.purge}
                />
                <text x={x(plan.purge.fromDay) + 6} y={M.top + ih - 8} className={styles.purgeLabel}>
                  Purge window
                </text>
              </g>
            ) : null}

            {/* Grid */}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} className={styles.grid} />
                <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className={styles.tick}>
                  {v}
                </text>
              </g>
            ))}
            <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} className={styles.axis} />
            {xTicks.map((d, i) => (
              <text key={d} x={x(d)} y={M.top + ih + 20} textAnchor={i === 0 ? 'start' : 'middle'} className={styles.tick}>
                {i === 0 ? 'Day 0' : d}
              </text>
            ))}

            {/* Expected band */}
            <g clipPath={`url(#${clipId})`}>
              <path d={bandPath} className={hasTarget ? styles.band : styles.noiseBand} />
              {hasTarget ? <path d={midPath} className={styles.expected} /> : null}
            </g>
            {target !== null ? (
              <text x={x(plan.fullEffectDay) + 8} y={y(target)} dy="0.32em" className={styles.targetLabel}>
                Target {Math.round(target)}
              </text>
            ) : null}

            {/* Today */}
            {showToday ? (
              <g>
                <line x1={x(nowDay!)} x2={x(nowDay!)} y1={M.top - 6} y2={M.top + ih} className={styles.today} />
                <text x={x(nowDay!)} y={M.top - 12} textAnchor="middle" className={styles.todayLabel}>
                  Today
                </text>
              </g>
            ) : null}

            {/* Actual */}
            {fact.length > 1 ? (
              <motion.path
                key={`${concern}-${points.length}`}
                d={linePath(fact)}
                className={styles.fact}
                initial={staticMode ? false : { pathLength: startFraction }}
                animate={{ pathLength: 1 }}
                transition={{ duration: firstRender ? 0.7 : 0.45, ease: EASE, delay: fresh.size ? 0.25 : 0 }}
              />
            ) : null}
            {points.map((p, i) => {
              const isLast = i === points.length - 1;
              const isFresh = fresh.has(p.id);
              const cx = x(p.day);
              const cy = y(p.value);
              const ringed = p.id === selectedId;
              return (
                <motion.g
                  key={`${concern}-${p.id}`}
                  initial={staticMode ? false : isFresh ? { y: -56, opacity: 0 } : firstRender ? { opacity: 0, scale: 0.6 } : false}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={
                    isFresh
                      ? { type: 'spring', stiffness: 380, damping: 18, mass: 0.9 }
                      : { duration: 0.3, ease: EASE, delay: firstRender ? 0.1 + i * 0.06 : 0 }
                  }
                  style={{ transformOrigin: `${cx}px ${cy}px` }}
                >
                  {ringed ? <circle cx={cx} cy={cy} r={isLast ? 11 : 9} className={styles.ring} /> : null}
                  <circle cx={cx} cy={cy} r={isLast ? 6 : 4} className={clsx(styles.point, isLast && styles.lastPoint)} />
                  {isLast ? (
                    <text x={cx} y={cy - 12} textAnchor="middle" className={styles.lastLabel}>
                      {p.value}
                    </text>
                  ) : null}
                  {!staticMode ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={14}
                      className={styles.hit}
                      tabIndex={0}
                      role="button"
                      aria-label={`Day ${p.day}, ${formatShortDate(p.date)}: ${label} ${p.value}`}
                      onPointerEnter={() => setHover(p.id)}
                      onPointerLeave={() => setHover((h) => (h === p.id ? null : h))}
                      onFocus={() => setHover(p.id)}
                      onBlur={() => setHover((h) => (h === p.id ? null : h))}
                      onClick={() => onPointSelect?.(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPointSelect?.(p.id);
                        }
                      }}
                    />
                  ) : null}
                </motion.g>
              );
            })}
          </svg>
        ) : null}

        {hovered && width > 0 ? (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(Math.max(x(hovered.day), 70), width - 70),
              top: y(hovered.value) - 14,
            }}
            role="presentation"
          >
            <span className={styles.ttDate}>
              Day {hovered.day}, {formatShortDate(hovered.date)}
            </span>
            <span className={clsx(styles.ttValue, 'num')}>
              {label} {hovered.value}
            </span>
          </div>
        ) : null}

        {points.length <= 1 ? <p className={styles.empty}>Your first check-in is on day {plan.checkinDays[0] ?? 7}</p> : null}
      </div>

      <ul className={styles.legend}>
        <li>
          <span className={clsx(styles.swatch, styles.swFact)} aria-hidden />
          Your score
        </li>
        {hasTarget ? (
          <li>
            <span className={clsx(styles.swatch, styles.swBand)} aria-hidden />
            Expected if it works, ±{noise}
          </li>
        ) : (
          <li>
            <span className={clsx(styles.swatch, styles.swNoise)} aria-hidden />
            Day 0 ±{noise}, the normal photo-to-photo spread
          </li>
        )}
        <li className={styles.legendNote}>Higher scores mean better skin</li>
      </ul>
    </section>
  );
}
