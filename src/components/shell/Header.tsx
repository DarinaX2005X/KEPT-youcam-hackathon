'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { Button, IconButton, Sheet } from '@/components/ui';
import { Logo } from './Logo';
import { NAV_LINKS, isActive, isChromeless } from './nav';
import styles from './Header.module.css';

/** Sticky app header. Transparent at the top of the page, Surface with blur once the page scrolls 24 px. */
export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);

  // Close the menu when the route changes.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (isChromeless(pathname)) return null;

  return (
    <header className={clsx(styles.header, scrolled && styles.scrolled, 'no-print')}>
      <div className={styles.inner}>
        <Link href="/" className={styles.home} aria-label="Kept home">
          <Logo size={30} />
        </Link>

        <nav aria-label="Main" className={styles.nav}>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.link} aria-current={isActive(pathname, l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Button href="/start" variant="primary" size="md" className={styles.cta}>
            Start a trial
          </Button>
          <IconButton icon={Menu} label="Open menu" className={styles.menuButton} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} />
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav aria-label="Main" className={styles.sheetNav}>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.sheetLink} aria-current={isActive(pathname, l.href) ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link href="/how-it-works" className={styles.sheetLink} aria-current={isActive(pathname, '/how-it-works') ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
            How Kept measures
          </Link>
        </nav>
        <Button href="/start" variant="primary" size="lg" block icon={Plus} className={styles.sheetCta} onClick={() => setMenuOpen(false)}>
          Start a trial
        </Button>
      </Sheet>
    </header>
  );
}
