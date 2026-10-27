import clsx from 'clsx';
import styles from './MiniPrint.module.css';

export interface MiniPrintProps {
  /** The user's own photo. Without one the print shows the day 0 outline. */
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className={styles.img} loading="lazy" decoding="async" draggable={false} />
        ) : (
          <svg viewBox="0 0 30 40" className={styles.outline} aria-hidden>
            <rect x="5" y="5" width="20" height="30" rx="10" />
          </svg>
        )}
      </span>
    </span>
  );
}
