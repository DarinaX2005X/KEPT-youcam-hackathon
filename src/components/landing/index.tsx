import type { LandingData } from './data';
import { Hero } from './Hero';
import styles from './Landing.module.css';

export function Landing({ data }: { data: LandingData }) {
  return (
    <main className={styles.main}>
      <Hero data={data.hero} credit={data.faceCredit} />
    </main>
  );
}
