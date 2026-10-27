import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import styles from './PhotoPrint.module.css';

export interface PhotoPrintProps {
  src: string;
  alt?: string;
  /** Caption on the print border, e.g. «Day 0». */
  label: ReactNode;
  sublabel?: ReactNode;
  /** Rotation in degrees, e.g. -2. */
  tilt?: number;
  /** `target` adds the sheen edge and the «Simulated with YouCam» tag. */
  variant?: 'default' | 'target';
  /** Photo aspect ratio; YouCam frames are 3 / 4. */
  aspect?: string;
  /** Layers drawn over the photo, such as <MaskLayer>. */
  children?: ReactNode;
  /** Right side of the caption row, such as a score. */
  aside?: ReactNode;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A frame of the trial as a physical print: Surface border, contact shadow, caption on the border. */
export function PhotoPrint({ src, alt = '', label, sublabel, tilt = 0, variant = 'default', aspect = '3 / 4', children, aside, priority, className, style }: PhotoPrintProps) {
  return (
    <figure className={clsx(styles.print, variant === 'target' && styles.target, className)} style={{ ...style, rotate: tilt ? `${tilt}deg` : undefined }}>
      <div className={styles.photo} style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={styles.img} loading={priority ? 'eager' : 'lazy'} decoding="async" draggable={false} />
        {children}
        {variant === 'target' ? <span className={styles.simTag}>Simulated with YouCam</span> : null}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.captionText}>
          <span className={styles.label}>{label}</span>
          {sublabel ? <span className={styles.sublabel}>{sublabel}</span> : null}
        </span>
        {aside ? <span className={styles.aside}>{aside}</span> : null}
      </figcaption>
    </figure>
  );
}
