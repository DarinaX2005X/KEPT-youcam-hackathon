'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, Eye, EyeOff, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { concernLabel, formatShortDate, type Concern, type Verdict } from '@/lib/domain';
import { CompareSlider, IconButton, MaskLayer, type Tone } from '@/components/ui';
import { concernTone, formatDelta, TONE_SR, type Frame } from './model';
import styles from './CompareStage.module.css';

const TONE_ICON: Record<Tone, LucideIcon> = {
  better: TrendingUp,
  worse: TrendingDown,
  flat: Minus,
  reacting: CircleAlert,
};

export interface CompareStageProps {
  /** Day 0, always on the left. */
  baseline: Frame;
  /** Shown on the right: a check-in or the target. When it is day 0 itself, the stage shows one photo. */
  frame: Frame;
  /** Area whose YouCam mask is drawn on both halves. */
  concern: Concern;
  showMask: boolean;
  onShowMaskChange: (show: boolean) => void;
  /** Colours an acne drop as Reacting during a likely purge. */
  verdict?: Pick<Verdict, 'kind'>;
  /** Adds «Face generated with YouCam AI» under the photo. */
  sample?: boolean;
  /** Divider position 0..100; omit to let the stage keep its own. */
  position?: number;
  onPositionChange?: (value: number) => void;
  className?: string;
}

function frameLabel(f: Frame): string {
  if (f.kind === 'target') return 'Target, simulated by YouCam';
  return `Day ${f.day}`;
}

function statLine(concern: Concern, from: Frame, to: Frame): string | null {
  if (concern === 'acne') {
    const a = from.stats.acne?.blemishCount;
    const b = to.stats.acne?.blemishCount;
    if (a === undefined) return null;
    if (from.id === to.id) return `${a} blemishes on the map`;
    if (b === undefined) return null;
    return `Blemishes ${a} → ${b}`;
  }
  if (concern === 'redness') {
    const a = from.stats.redness?.areaPct;
    const b = to.stats.redness?.areaPct;
    if (a === undefined) return null;
    if (from.id === to.id) return `Red area ${a}% of the photo`;
    if (b === undefined) return null;
    return `Red area ${a}% → ${b}%`;
  }
  return null;
}

function Photo({ frame, concern, showMask, priority }: { frame: Frame; concern: Concern; showMask: boolean; priority?: boolean }) {
  const mask = frame.masks[concern];
  return (
    <div className={styles.photo}>
      {frame.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame.photo} alt="" draggable={false} loading={priority ? 'eager' : 'lazy'} decoding="async" />
      ) : null}
      {mask ? <MaskLayer key={mask} mask={mask} visible={showMask} opacity={0.85} /> : null}
    </div>
  );
}

/** The trial's main evidence: day 0 and the chosen frame on one photo with a divider, the chosen area's skin map on both halves. */
export function CompareStage({
  baseline,
  frame,
  concern,
  showMask,
  onShowMaskChange,
  verdict,
  sample,
  position,
  onPositionChange,
  className,
}: CompareStageProps) {
  const [innerPos, setInnerPos] = useState(50);
  const pos = position ?? innerPos;
  const setPos = (v: number) => {
    if (position === undefined) setInnerPos(v);
    onPositionChange?.(v);
  };

  const single = frame.id === baseline.id;
  const base = baseline.scores[concern]?.ui;
  const now = frame.scores[concern]?.ui;
  const delta = base !== undefined && now !== undefined ? now - base : undefined;
  const tone = delta !== undefined ? concernTone(delta, concern, verdict) : 'flat';
  const ToneIcon = TONE_ICON[tone];
  const stat = statLine(concern, baseline, frame);
  const hasMask = Boolean(baseline.masks[concern] || frame.masks[concern]);
  const label = concernLabel(concern);

  const right = (
    <div className={styles.box}>
      <AnimatePresence initial={false}>
        <motion.div
          key={frame.id}
          className={styles.layer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Photo frame={frame} concern={concern} showMask={showMask} priority />
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return (
    <figure className={clsx(styles.stage, frame.kind === 'target' && styles.target, className)}>
      <div className={styles.frame}>
        {single ? (
          <div className={styles.single}>
            <div className={styles.box}>
              <div className={styles.layer}>
                <Photo frame={baseline} concern={concern} showMask={showMask} priority />
              </div>
            </div>
            <span className={styles.corner}>Day 0</span>
          </div>
        ) : (
          <CompareSlider
            left={
              <div className={styles.box}>
                <div className={styles.layer}>
                  <Photo frame={baseline} concern={concern} showMask={showMask} priority />
                </div>
              </div>
            }
            right={right}
            labels={['Day 0', frameLabel(frame)]}
            value={pos}
            onChange={setPos}
            aria-label={`Compare day 0 with ${frame.kind === 'target' ? 'the target' : `day ${frame.day}`}`}
          />
        )}
      </div>

      <figcaption className={styles.caption}>
        <div className={styles.captionRow}>
        <div className={styles.reading} aria-live="polite">
          {delta !== undefined && !single ? (
            <span className={clsx(styles.badge, styles[tone])} title={TONE_SR[tone]}>
              <ToneIcon size={14} strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
          <span className={styles.concern}>{label}</span>
          {base !== undefined ? (
            <span className={clsx(styles.scores, 'num')}>
              {single || now === undefined ? (
                base
              ) : (
                <>
                  {base} → <span className={styles[`${tone}Text`]}>{now}</span>
                </>
              )}
            </span>
          ) : null}
          {delta !== undefined && !single ? (
            <span className={clsx(styles.delta, styles[`${tone}Text`], 'num')}>
              {formatDelta(delta)}
              <span className="visually-hidden">, {TONE_SR[tone]}</span>
            </span>
          ) : null}
          {stat ? <span className={clsx(styles.stat, 'num')}>{stat}</span> : null}
          {frame.kind === 'target' ? <span className={styles.stat}>expected by day {frame.day}</span> : null}
        </div>
        <div className={styles.tools}>
          <span className={clsx(styles.date, 'num')}>
            {single ? formatShortDate(baseline.date) : `${formatShortDate(baseline.date)} and ${formatShortDate(frame.date)}`}
          </span>
          {hasMask ? (
            <IconButton
              icon={showMask ? EyeOff : Eye}
              label={showMask ? `Hide the ${label.toLowerCase()} map` : `Show the ${label.toLowerCase()} map`}
              aria-pressed={showMask}
              onClick={() => onShowMaskChange(!showMask)}
            />
          ) : null}
        </div>
        </div>
        {sample ? <span className={styles.credit}>Sample trial. Face generated with YouCam AI</span> : null}
      </figcaption>
    </figure>
  );
}
