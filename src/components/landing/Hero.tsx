import Link from 'next/link';
import { Button } from '@/components/ui';
import type { HeroData } from './data';
import { TrialScene } from './TrialScene';
import styles from './Landing.module.css';

/** Marks the page before first paint so the scene starts empty instead of flashing its last frame. */
const START_CSS =
  '[data-scene] [data-mask]{clip-path:inset(0 0 100% 0)}' +
  '[data-scene] [data-count],[data-scene] [data-point],[data-scene] [data-ring],[data-scene] [data-verdict]{opacity:0}' +
  '[data-scene] [data-segment]{stroke-dashoffset:1}';
const MOTION_FLAG = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.getElementById('kept-scene-start')){var s=document.createElement('style');s.id='kept-scene-start';s.textContent='${START_CSS}';document.head.appendChild(s)}}catch(e){}`;

export function Hero({ data, credit }: { data: HeroData; credit: string }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <script dangerouslySetInnerHTML={{ __html: MOTION_FLAG }} />
      <div className={styles.heroText}>
        <h1 id="hero-title" className={styles.heroTitle}>
          Find out if your skincare is actually working
        </h1>
        <p className={styles.heroLead}>
          Kept photographs your skin the same way at every check-in, measures it with YouCam Skin AI and tells you when a product deserves a place on your
          shelf.
        </p>
        <div className={styles.heroActions}>
          <Button href="/start" variant="primary" size="lg">
            Start a trial
          </Button>
          <Button href="/demo" variant="secondary" size="lg" className={styles.notPhone}>
            See a finished trial
          </Button>
          <Link href="/demo" className={`${styles.textLink} ${styles.onlyPhone}`}>
            See a finished trial
          </Link>
        </div>
      </div>
      <TrialScene data={data} credit={credit} />
    </section>
  );
}
