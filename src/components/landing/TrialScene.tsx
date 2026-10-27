'use client';

import clsx from 'clsx';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { stagger, useAnimate, useMotionValue, useTransform, motion, type AnimationSequence, type MotionValue } from 'motion/react';
import { MaskLayer } from '@/components/ui';
import { VerdictCard } from '@/components/trial';
import type { HeroData } from './data';
import styles from './TrialScene.module.css';

/* ------------------------------------------------------------------ geometry */

/** Print columns: three equal columns with a gap of GAP × row width. Must match .prints in the CSS. */
const GAP = 0.045;
const COL = (1 - 2 * GAP) / 3;
const CENTER = [COL / 2, COL * 1.5 + GAP, COL * 2.5 + 2 * GAP];

interface Geometry {
  width: number;
  height: number;
  wide: boolean;
  x: (day: number) => number;
  y: (value: number) => number;
  top: number;
  bottom: number;
}

function geometry(width: number, wide: boolean, data: HeroData): Geometry {
  const height = wide ? 156 : 132;
  const x0 = wide ? CENTER[0] * width : 0.08 * width;
  const x1 = wide ? ((CENTER[1] + CENTER[2]) / 2) * width : 0.7 * width;
  const top = wide ? 38 : 26;
  const bottom = height - 40;
  const vals = [...data.expected.flatMap((v) => [v - data.noise, v + data.noise]), ...data.history.map((p) => p.value), data.latest.acne ?? 0];
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  return {
    width,
    height,
    wide,
    top,
    bottom,
    x: (d) => x0 + (d / data.fullEffectDay) * (x1 - x0),
    y: (v) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top),
  };
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ------------------------------------------------------------------ parts */

function ScenePrint({
  id,
  src,
  mask,
  label,
  target,
  tilt,
  priority,
  aside,
  className,
}: {
  id: string;
  src: string;
  mask?: string;
  label: ReactNode;
  target?: boolean;
  tilt: number;
  priority?: boolean;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={clsx(styles.print, target && styles.target, className)} style={{ rotate: `${tilt}deg` }} data-print={id}>
      <div className={styles.photo}>
        <div className={styles.zoom}>
          <Image
            src={src}
            alt=""
            fill
            preload={priority}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            sizes="(max-width: 767px) 80vw, 380px"
            className={styles.img}
            draggable={false}
          />
        </div>
        {mask ? (
          <div className={clsx(styles.maskClip)} data-mask={id}>
            <div className={styles.zoom}>
              <MaskLayer mask={mask} opacity={0.95} />
            </div>
          </div>
        ) : null}
        {mask ? <span className={styles.scan} data-scan={id} aria-hidden /> : null}
        {target ? <span className={styles.simTag}>Simulated with YouCam</span> : null}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.label}>{label}</span>
        {aside}
      </figcaption>
    </figure>
  );
}

function Counter({ id, value, tone }: { id: string; value: MotionValue<string>; tone: 'base' | 'better' }) {
  return (
    <span className={clsx(styles.count, styles[tone])} data-count={id}>
      <motion.span className="num">{value}</motion.span>
    </span>
  );
}

function Ruler({ data, g }: { data: HeroData; g: Geometry }) {
  const { x, y } = g;
  const full = data.fullEffectDay;
  const latest = data.latest;
  const lastHistory = data.history[data.history.length - 1];
  const bandTop = data.expected.map((v, d) => `${x(d).toFixed(1)},${y(v + data.noise).toFixed(1)}`);
  const bandBottom = data.expected.map((v, d) => `${x(d).toFixed(1)},${y(v - data.noise).toFixed(1)}`).reverse();
  const mid = data.expected.map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const fact = [{ day: 0, value: data.base.acne ?? 0 }, ...data.history.filter((p) => p.day > 0)];
  const factPath = fact.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const lx = x(latest.day);
  const ly = y(latest.acne ?? 0);
  const tx = x(full);
  const ty = y(data.target.acne);
  const axisY = g.height - 22;
  // The latest point starts at the bottom edge of its print and slides down the connector.
  const startX = g.wide ? CENTER[1] * g.width : lx;
  const startY = g.wide ? 0 : -48;

  return (
    <svg width={g.width} height={g.height} className={styles.ruler} role="img" aria-label={`Acne score ${data.base.acne} on day 0 and ${latest.acne} on day ${latest.day}, inside the range expected for salicylic acid. Target ${data.target.acne}`}>
      {g.wide ? (
        <g className={styles.connectors}>
          <line x1={CENTER[0] * g.width} y1={0} x2={x(0)} y2={y(data.base.acne ?? 0)} />
          <line x1={CENTER[1] * g.width} y1={0} x2={lx} y2={ly} />
          <line x1={CENTER[2] * g.width} y1={0} x2={tx} y2={ty} className={styles.targetConnector} />
        </g>
      ) : null}

      <polygon points={[...bandTop, ...bandBottom].join(' ')} className={styles.band} />
      <path d={mid} className={styles.expected} />
      <path d={factPath} className={styles.fact} />
      {lastHistory ? (
        <path
          d={`M${x(lastHistory.day).toFixed(1)},${y(lastHistory.value).toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)}`}
          className={clsx(styles.fact)}
          pathLength={1}
          strokeDasharray="1 1"
          data-segment
        />
      ) : null}

      {fact.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.value)} r={p.day === 0 ? 4.5 : 3.5} className={styles.dot} />
      ))}

      <circle cx={tx} cy={ty} r={5} className={styles.targetDot} />
      <text x={tx + 12} y={ty + 18} className={styles.targetLabel}>
        Target {data.target.acne}
      </text>

      <circle data-ring cx={lx} cy={ly} r={12} className={styles.ring} />
      <g data-point data-dx={startX - lx} data-dy={startY - ly}>
        <circle cx={lx} cy={ly} r={7} className={styles.point} />
        <text x={lx + 12} y={ly - 8} className={clsx(styles.pointLabel, 'num')}>
          Acne {latest.acne}
        </text>
      </g>

      <line x1={x(0)} x2={x(full)} y1={axisY} y2={axisY} className={styles.axis} />
      {[0, ...data.checkinDays].map((d) => (
        <line key={d} x1={x(d)} x2={x(d)} y1={axisY - 4} y2={axisY + 4} className={styles.tick} />
      ))}
      <text x={x(0)} y={axisY + 18} textAnchor="middle" className={styles.dayLabel}>
        Day 0
      </text>
      <text x={x(28)} y={axisY + 18} textAnchor="middle" className={styles.dayLabel}>
        28
      </text>
      <text x={x(full)} y={axisY + 18} textAnchor="middle" className={styles.dayLabel}>
        Day {full}
      </text>
      <text x={x(0) + 10} y={y((data.expected[0] ?? 0) + data.noise) - 8} className={styles.chartLabel}>
        Expected acne score
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ scene */

/**
 * The hero scene: day 0, day 56 and the simulated target as prints over the trial's timeline.
 * A 9 s loop: the scan line reveals the acne map on day 0 while blemishes are counted, then on day 56,
 * where the count drops; the day 56 score slides down to the timeline and lands in the expected range;
 * then the verdict forms. Paused off screen. Reduced motion shows the finished state.
 */
export function TrialScene({ data, credit }: { data: HeroData; credit: string }) {
  const [scope, animateIn] = useAnimate<HTMLDivElement>();
  const [rulerRef, rulerWidth] = useBox<HTMLDivElement>();
  const [wide, setWide] = useState(true);
  const base = data.base.blemishes ?? 0;
  const last = data.latest.blemishes ?? 0;
  const count0 = useMotionValue(base);
  const count1 = useMotionValue(last);
  const blemishes = (v: number) => {
    const n = Math.round(v);
    return `${n} ${n === 1 ? 'blemish' : 'blemishes'}`;
  };
  const text0 = useTransform(count0, blemishes);
  const text1 = useTransform(count1, blemishes);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const g = rulerWidth ? geometry(rulerWidth, wide, data) : null;

  useEffect(() => {
    const root = scope.current;
    if (!root || !g) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const point = root.querySelector<SVGGElement>('[data-point]');
    const dx = Number(point?.dataset.dx ?? 0);
    const dy = Number(point?.dataset.dy ?? 0);

    if (reduce) {
      document.getElementById('kept-scene-start')?.remove();
      return;
    }

    const ease = [0.2, 0.8, 0.2, 1] as const;
    const scan = 1.2;
    const hide = { opacity: 0 };
    const seq: AnimationSequence = [
      // Reset to the empty state.
      ['[data-mask]', { clipPath: 'inset(0% 0% 100% 0%)', opacity: 1 }, { duration: 0, at: 0 }],
      ['[data-scan]', { y: '0%', opacity: 0 }, { duration: 0, at: 0 }],
      ['[data-count]', { opacity: 0, y: 4 }, { duration: 0, at: 0 }],
      ['[data-point]', { x: dx, y: dy, opacity: 0 }, { duration: 0, at: 0 }],
      ['[data-ring]', { r: 7, opacity: 0 }, { duration: 0, at: 0 }],
      ['[data-segment]', { strokeDashoffset: 1 }, { duration: 0, at: 0 }],
      ['[data-verdict]', { opacity: 0, y: 12 }, { duration: 0, at: 0 }],
      ['[data-verdict] li', { opacity: 0, y: 6 }, { duration: 0, at: 0 }],
      [count0, 0, { duration: 0, at: 0 }],
      [count1, base, { duration: 0, at: 0 }],

      // 0.2 to 1.4: day 0 is scanned, the acne map appears behind the line, blemishes are counted.
      ['[data-scan="base"]', { opacity: 1 }, { duration: 0.12, at: 0.2 }],
      ['[data-scan="base"]', { y: '100%' }, { duration: scan, ease: 'easeInOut', at: 0.2 }],
      ['[data-mask="base"]', { clipPath: 'inset(0% 0% 0% 0%)' }, { duration: scan, ease: 'easeInOut', at: 0.2 }],
      ['[data-count="base"]', { opacity: 1, y: 0 }, { duration: 0.25, at: 0.3 }],
      [count0, base, { duration: scan, ease: 'easeInOut', at: 0.2 }],
      ['[data-scan="base"]', hide, { duration: 0.2, at: 1.4 }],

      // 2.4 to 3.8: day 56, the same scan; the count starts at day 0's number and falls.
      ['[data-scan="latest"]', { opacity: 1 }, { duration: 0.12, at: 2.4 }],
      ['[data-scan="latest"]', { y: '100%' }, { duration: scan, ease: 'easeInOut', at: 2.4 }],
      ['[data-mask="latest"]', { clipPath: 'inset(0% 0% 0% 0%)' }, { duration: scan, ease: 'easeInOut', at: 2.4 }],
      ['[data-count="latest"]', { opacity: 1, y: 0 }, { duration: 0.25, at: 2.45 }],
      [count1, last, { duration: scan, ease: 'easeInOut', at: 2.4 }],
      ['[data-scan="latest"]', hide, { duration: 0.2, at: 3.6 }],

      // 3.8 to 5: the day 56 score leaves the print and lands in the expected range.
      ['[data-point]', { opacity: 1 }, { duration: 0.15, at: 3.8 }],
      ['[data-point]', { x: 0, y: 0 }, { type: 'spring', stiffness: 300, damping: 22, at: 3.8 }],
      ['[data-ring]', { r: [7, 22], opacity: [0.8, 0] }, { duration: 0.6, ease: 'easeOut', at: 4.3 }],
      ['[data-segment]', { strokeDashoffset: 0 }, { duration: 0.4, ease, at: 4.3 }],

      // 5 to 6: the verdict forms, one reason at a time.
      ['[data-verdict]', { opacity: 1, y: 0 }, { duration: 0.36, ease, at: 5 }],
      ['[data-verdict] li', { opacity: 1, y: 0 }, { duration: 0.3, ease, delay: stagger(0.07), at: 5.2 }],

      // 8.4 to 9: soft reset.
      ['[data-mask]', hide, { duration: 0.5, ease: 'easeIn', at: 8.4 }],
      ['[data-count]', hide, { duration: 0.4, at: 8.45 }],
      ['[data-point]', hide, { duration: 0.4, at: 8.45 }],
      ['[data-segment]', { strokeDashoffset: 1 }, { duration: 0.4, at: 8.45 }],
      ['[data-verdict]', { opacity: 0, y: 6 }, { duration: 0.45, at: 8.5 }],
      ['[data-verdict]', { opacity: 0 }, { duration: 0.05, at: 8.95 }],
    ];

    const controls = animateIn(seq, { repeat: Infinity });
    // Development hook for frame-by-frame review of the loop.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __scene?: typeof controls }).__scene = controls;

    let visible = true;
    const sync = () => {
      if (visible && document.visibilityState === 'visible') controls.play();
      else controls.pause();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(root);
    document.addEventListener('visibilitychange', sync);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      controls.stop();
    };
    // Geometry changes only move the point's start; restart the loop when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.width, g?.wide]);

  return (
    <div ref={scope} className={styles.scene} data-scene>
      <div className={styles.field}>
        <div className={styles.stage}>
          <div className={styles.prints}>
            <ScenePrint
              id="base"
              src={data.base.photo}
              mask={data.base.mask}
              label="Day 0"
              tilt={-2}
              priority
              className={styles.p0}
              aside={<Counter id="base" value={text0} tone="base" />}
            />
            <ScenePrint
              id="latest"
              src={data.latest.photo}
              mask={data.latest.mask}
              label={`Day ${data.latest.day}`}
              tilt={0}
              priority
              className={styles.p1}
              aside={<Counter id="latest" value={text1} tone="better" />}
            />
            <ScenePrint id="target" src={data.target.photo} label={`Target for day ${data.target.day}`} target tilt={1.5} className={styles.p2} />
          </div>
          <div ref={rulerRef} className={styles.rulerBox}>
            {g ? <Ruler data={data} g={g} /> : null}
          </div>
        </div>

        <div className={styles.side}>
          <p className={styles.product}>
            <span className={styles.productName}>2% salicylic acid serum</span>
            <span className="num">
              {data.photos} photos over {data.latest.day} days
            </span>
          </p>
          <div className={clsx(styles.verdict)} data-verdict>
            <VerdictCard verdict={data.verdict} actions={false} />
          </div>
        </div>
      </div>
      <p className={styles.credit}>Sample trial. {credit}</p>
    </div>
  );
}
