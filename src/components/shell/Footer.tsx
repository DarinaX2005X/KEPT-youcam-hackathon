'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mark } from './Logo';
import { isChromeless } from './nav';
import styles from './Footer.module.css';

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? '';

export function Footer() {
  const pathname = usePathname();
  if (isChromeless(pathname)) return null;

  return (
    <footer className={clsx(styles.footer, 'no-print')}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Mark size={36} />
          <p className={styles.line}>Keep what works for your skin</p>
        </div>
        <nav aria-label="Footer" className={styles.links}>
          <Link href="/how-it-works" className={styles.link}>
            How Kept measures
          </Link>
          <Link href="/shelf" className={styles.link}>
            Shelf
          </Link>
          {REPO_URL ? (
            <a href={REPO_URL} className={styles.link} target="_blank" rel="noreferrer">
              GitHub
            </a>
          ) : null}
        </nav>
        <p className={styles.credit}>Skin analysis by YouCam API</p>
      </div>
    </footer>
  );
}
