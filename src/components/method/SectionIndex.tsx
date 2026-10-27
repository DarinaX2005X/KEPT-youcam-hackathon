'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { SECTIONS, type SectionId } from './sections';
import styles from './MethodPage.module.css';

/** Contents list. Sticky beside the text on wide screens, a plain list under the intro on narrow ones. */
export function SectionIndex() {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id);

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter((n): n is HTMLElement => Boolean(n));
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;

    // The current section is the last one whose top has passed the upper third of the viewport.
    const pick = () => {
      const line = window.innerHeight * 0.33;
      let current: SectionId = SECTIONS[0].id;
      for (const n of nodes) {
        if (n.getBoundingClientRect().top <= line) current = n.id as SectionId;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd) current = nodes[nodes.length - 1].id as SectionId;
      setActive(current);
    };

    const io = new IntersectionObserver(pick, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
    nodes.forEach((n) => io.observe(n));
    window.addEventListener('scroll', pick, { passive: true });
    pick();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', pick);
    };
  }, []);

  return (
    <nav className={styles.index} aria-labelledby="method-index-title">
      <p id="method-index-title" className={styles.indexTitle}>
        On this page
      </p>
      <ul className={styles.indexList}>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={clsx(styles.indexLink, active === s.id && styles.indexLinkActive)}
              aria-current={active === s.id ? 'location' : undefined}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
