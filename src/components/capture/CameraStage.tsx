'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { referenceRect, smoothPath, type GhostGuide, type Rect } from '@/lib/capture';
import styles from './CameraStage.module.css';

export interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Video frame size once the camera is live. */
  frame: { width: number; height: number } | null;
  /** Day 0 outline for check-ins. Without it the stage draws the plain oval. */
  ghost: GhostGuide | null;
  /** 0 = far from the outline, 1 = lined up. Drives the outline colour from Ink 50 % to Better. */
  match: number;
  /** Every check is Good. */
  ready: boolean;
  /** Hides the video under a state panel or skeleton. */
  dimmed?: boolean;
  children?: ReactNode;
  className?: string;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

/** Guide oval inside the 3:4 guide frame: 62 % of its width, a little above centre. */
function guideOval(ref: Rect) {
  const rx = ref.w * 0.31;
  return ellipsePath(ref.x + ref.w / 2, ref.y + ref.h * 0.45, rx, rx * 1.34);
}

/**
 * Mirrored camera preview that covers its box, with the scrim, the guide oval or the day 0 photo and outline
 * drawn in video-frame coordinates so they stay locked to the picture at any screen size.
 */
export function CameraStage({ videoRef, frame, ghost, match, ready, dimmed, children, className }: CameraStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let placement: React.CSSProperties = { inset: 0 };
  if (frame && box.w && box.h) {
    const scale = Math.max(box.w / frame.width, box.h / frame.height);
    const w = frame.width * scale;
    const h = frame.height * scale;
    placement = { left: (box.w - w) / 2, top: (box.h - h) / 2, width: w, height: h };
  }

  let overlay: ReactNode = null;
  if (frame) {
    const ref = referenceRect(frame.width, frame.height);
    const hole = ghost?.oval ? smoothPath(ghost.oval, (p) => ({ x: ref.x + p.x * ref.w, y: ref.y + p.y * ref.h })) : guideOval(ref);
    const t = Math.max(0, Math.min(1, match));
    const stroke = ghost?.oval
      ? `color-mix(in oklab, var(--better) ${Math.round(t * 100)}%, rgb(23 34 29 / 0.5))`
      : ready
        ? 'var(--better)'
        : 'rgb(253 251 248 / 0.9)';
    overlay = (
      <svg className={styles.overlay} viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id={`m${uid}`}>
            <rect width={frame.width} height={frame.height} fill="#fff" />
            <path d={hole} fill="#000" />
          </mask>
          <clipPath id={`c${uid}`}>
            <path d={hole} />
          </clipPath>
        </defs>
        <rect width={frame.width} height={frame.height} className={styles.scrim} mask={`url(#m${uid})`} />
        {ghost ? (
          <image
            href={ghost.url}
            x={ref.x}
            y={ref.y}
            width={ref.w}
            height={ref.h}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#c${uid})`}
            className={styles.ghost}
          />
        ) : null}
        <path d={hole} className={styles.halo} vectorEffect="non-scaling-stroke" />
        <path d={hole} className={clsx(styles.outline, ready && styles.outlineReady)} style={{ stroke }} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  return (
    <div ref={boxRef} className={clsx(styles.stage, className)}>
      <div className={clsx(styles.frame, (!frame || dimmed) && styles.hidden)} style={placement}>
        <video ref={videoRef} className={styles.video} muted playsInline autoPlay disablePictureInPicture />
        {overlay}
      </div>
      {children}
    </div>
  );
}
