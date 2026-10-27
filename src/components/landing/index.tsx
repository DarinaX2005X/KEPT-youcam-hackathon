import type { LandingData } from './data';
import { Hero } from './Hero';
import { Mechanism } from './Mechanism';
import { BuySection, Closing, TrialSection, VerdictsSection } from './Sections';
import styles from './Landing.module.css';

/** The landing page: the trial scene, the real trial page, how it measures, the verdicts, the buy check and the close. */
export function Landing({ data }: { data: LandingData }) {
  return (
    <main className={styles.main}>
      <Hero data={data.hero} credit={data.faceCredit} />
      <TrialSection data={data.workspace} />
      <Mechanism data={data.mechanism} />
      <VerdictsSection rows={data.verdicts} />
      <BuySection data={data.buy} />
      <Closing shelf={data.buy.shelf} />
    </main>
  );
}
