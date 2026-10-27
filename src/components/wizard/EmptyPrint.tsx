import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import styles from './EmptyPrint.module.css';

export interface EmptyPrintProps {
  label: ReactNode;
  sublabel?: ReactNode;
  variant?: 'default' | 'target';
  tilt?: number;
  /** Drawn in the middle of the empty photo, such as the steps of a running operation. */
  children?: ReactNode;
  /** Slow light sweep while something is being made for this frame. */
  busy?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A print waiting for its photo: the same paper and caption as PhotoPrint, with the face outline the camera will use. */
export function EmptyPrint({ label, sublabel, variant = 'default', tilt = 0, children, busy, className, style }: EmptyPrintProps) {
  return (
    <figure className={clsx(styles.print, variant === 'target' && styles.target, className)} style={{ ...style, rotate: tilt ? `${tilt}deg` : undefined }}>
      <div className={clsx(styles.photo, busy && styles.busy)}>
        <svg className={styles.outline} viewBox="0 0 120 160" aria-hidden>
          <ellipse cx="60" cy="74" rx="38" ry="50" />
          <path d="M34 140c6-12 15-17 26-17s20 5 26 17" />
        </svg>
        {children ? <div className={styles.inner}>{children}</div> : null}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.label}>{label}</span>
        {sublabel ? <span className={styles.sublabel}>{sublabel}</span> : null}
      </figcaption>
    </figure>
  );
}
