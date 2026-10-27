'use client';

import clsx from 'clsx';
import { ThumbImage } from '@/components/ui/thumbnail';
import styles from './MiniPrint.module.css';

export interface MiniPrintProps {
  /** The user's own photo, ideally already small (see `thumbUrl`). Without one the print shows the day 0 outline. */
  src?: string;
  alt?: string;
  /** Rotation in degrees. */
  tilt?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** A thumbnail-sized photo print: white border, contact shadow, the same light as PhotoPrint. */
export function MiniPrint({ src, alt = '', tilt = 0, size = 'md', className }: MiniPrintProps) {
  return (
    <span className={clsx(styles.print, styles[size], className)} style={tilt ? { rotate: `${tilt}deg` } : undefined}>
      <span className={styles.photo}>
        {src ? (
          <ThumbImage src={src} alt={alt} sizes={size === 'sm' ? '44px' : '64px'} className={styles.img} />
        ) : (
          <svg viewBox="0 0 30 40" className={styles.outline} aria-hidden>
            <rect x="5" y="5" width="20" height="30" rx="10" />
          </svg>
        )}
      </span>
    </span>
  );
}
