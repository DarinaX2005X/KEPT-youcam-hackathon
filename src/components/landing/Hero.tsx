import Link from 'next/link';
import { Button } from '@/components/ui';
import type { HeroData } from './data';
import { TrialScene } from './TrialScene';
import styles from './Landing.module.css';

export function Hero({ data, credit }: { data: HeroData; credit: string }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
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
