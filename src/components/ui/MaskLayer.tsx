import clsx from 'clsx';
import type { CSSProperties } from 'react';
import styles from './MaskLayer.module.css';

export interface MaskLayerProps {
  /** URL of a YouCam mask PNG (alpha marks the zone). */
  mask: string;
  /** Fill colour for the zone; defaults to Mask tint. */
  tint?: string;
  /** 0..1, defaults to 0.75. */
  opacity?: number;
  /** Fades the layer out without unmounting it. */
  visible?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Repaints the alpha of a YouCam mask in one colour, stretched over the photo it was made for. Place inside a positioned photo box. */
export function MaskLayer({ mask, tint = 'var(--mask-tint)', opacity = 0.75, visible = true, className, style }: MaskLayerProps) {
  const url = `url("${mask.replace(/"/g, '%22')}")`;
  return (
    <span
      aria-hidden
      className={clsx(styles.mask, className)}
      style={
        {
          ...style,
          maskImage: url,
          WebkitMaskImage: url,
          '--mask-fill': tint,
          '--mask-opacity': visible ? opacity : 0,
        } as CSSProperties
      }
    />
  );
}
