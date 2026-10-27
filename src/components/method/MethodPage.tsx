import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Hourglass, MinusCircle, RefreshCw, TrendingUp, type LucideIcon } from 'lucide-react';
import {
  BASE_CHECKIN_DAYS,
  CONCERN_IDS,
  CONCERNS,
  HEADLINES,
  LIGHT_LOW,
  LIGHT_MEDIUM,
  MAX_REASONS,
  SMOOTHING_GAP_DAYS,
  getActive,
  joinNouns,
  concernNoun,
  type SimConcern,
  type VerdictKind,
} from '@/lib/domain';
import { CALIBRATION, LARGEST_EXTRA_TWO_SIGMA, LARGEST_TWO_SIGMA } from './calibration';
import { NoiseFigure } from './NoiseFigure';
import { SectionIndex } from './SectionIndex';
import { sectionTitle, type SectionId } from './sections';
import { ActivesTable, AreasTable, CalibrationTable, ChecksTable } from './tables';
import styles from './MethodPage.module.css';

const N = CALIBRATION.noise;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const one = (n: number) => (Math.round(n * 100) / 100).toString();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function simNoun(s: SimConcern): string {
  const c = CONCERN_IDS.find((id) => CONCERNS[id].simName === s);
  return c ? concernNoun(c) : s;
}

/** "acne at 0.6, pores at 0.4 and oiliness at 0.4" from the active's simulation settings. */
function simulationExample(activeId: string): { name: string; text: string } | null {
  const a = getActive(activeId);
  if (!a) return null;
  const parts = (Object.entries(a.simulation) as [SimConcern, number][]).map(([s, v]) => `${simNoun(s)} at ${v}`);
  return parts.length ? { name: a.name, text: joinNouns(parts) } : null;
}

const VERDICT_ICON: Record<VerdictKind, { icon: LucideIcon; tone: 'better' | 'worse' | 'reacting' | 'flat' }> = {
  reacting: { icon: AlertTriangle, tone: 'worse' },
  purging: { icon: RefreshCw, tone: 'reacting' },
  too_early: { icon: Hourglass, tone: 'flat' },
  working: { icon: CheckCircle2, tone: 'better' },
  not_enough: { icon: MinusCircle, tone: 'flat' },
  on_track: { icon: TrendingUp, tone: 'better' },
};

/** Rules in the order computeVerdict checks them. */
const VERDICT_RULES: { kind: VerdictKind; when: string }[] = [
  {
    kind: 'reacting',
    when: `Redness or hydration, when Kept watches them, is more than ${N} points worse than day 0 outside a breakout window, or more than ${2 * N} points worse in the latest photo at any time. If it was already worse at the check-in before, the next step is to stop. Otherwise Kept suggests using the product every other night for a week.`,
  },
  {
    kind: 'purging',
    when: `The latest check-in falls inside the breakout window, acne is more than ${N} points worse than day 0, and redness has not dropped by more than ${2 * N}. The next step is to keep going on schedule.`,
  },
  {
    kind: 'too_early',
    when: 'There is no check-in yet, or the latest one comes before the day the ingredient usually shows first changes.',
  },
  {
    kind: 'working',
    when: `The target areas improved by ${N} points or more on average, and at least one of them by more than ${N}.`,
  },
  {
    kind: 'not_enough',
    when: 'The full effect day has passed and the target areas did not improve that much.',
  },
  {
    kind: 'on_track',
    when: 'Anything else. Kept compares the latest scores with the expected curve and says whether you are ahead of it or behind it.',
  },
];

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.h2}>
        {sectionTitle(id)}
      </h2>
      {children}
    </section>
  );
}

export function MethodPage() {
  const sim = simulationExample('salicylic');
  const checkinDays = joinNouns(BASE_CHECKIN_DAYS.map(String));
  const definingAreas = joinNouns(CALIBRATION.areas.filter((a) => a.defining).map((a) => concernNoun(a.concern)));
  const extraAreas = CALIBRATION.areas.filter((a) => !a.defining).map((a) => concernNoun(a.concern));
  const variants = CALIBRATION.photos.length - 1;

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <header className={styles.intro}>
          <h1 className={styles.h1}>How Kept measures your skin</h1>
          <p className={styles.lead}>
            Kept tells you whether a skincare product is changing your skin by comparing photos taken the same way over several weeks. This page
            explains what it measures, how much change it treats as real and where its limits are.
          </p>
        </header>

        <aside className={styles.aside}>
          <SectionIndex />
        </aside>

        <article className={styles.body}>
          <Section id="gallery-photos">
            <p>
              Skin analysis reads small differences in color, shadow and surface detail. A selfie by a window in the morning and one under a
              bathroom lamp at night differ in exactly those things, so their scores differ even when your skin has not changed. Distance changes
              how many pixels each pore gets. A head turned slightly to one side puts one cheek in shadow and flattens the other. Two photos from
              your gallery mostly compare two moments of light.
            </p>
            <p>
              So Kept takes every photo itself and checks the same things each time. The camera measures your face in the live video and waits
              until all of these pass. When they stay green for a moment, it takes the photo on its own.
            </p>
            <ChecksTable />
            <p>
              At check-ins the oval on screen is replaced by a faint outline of your day 0 face, so you stand where you stood the first time.
              Uploaded photos go through the same checks plus sharpness, because a blurred photo hides pores and texture.
            </p>
            <p className="num">
              Some differences still get through. If a check-in photo is {pct(LIGHT_MEDIUM)} or more lighter or darker overall than day 0, the
              verdict says so and its confidence drops to medium. Past {pct(LIGHT_LOW)} it drops to low. A check-in that sits further from the day
              0 outline than the camera allows also lowers confidence to medium.
            </p>
          </Section>

          <Section id="what-youcam-measures">
            <p>
              Kept uploads each photo through the YouCam File API and sends it to AI Skin Analysis, the SD model, asking for up to 8 skin areas:
              the ones the product targets and the ones worth watching for irritation. For every area YouCam returns a score from 1 to 100, where
              higher always means healthier looking skin, and a map of where on the face it found the problem.
            </p>
            <p>
              Kept keeps both. On the acne map it counts separate spots, which is the blemish count you see in verdicts. On the redness map it
              measures the share of the face that is red. These are the areas Kept works with:
            </p>
            <AreasTable />

            <h3 className={styles.h3}>The target photo</h3>
            <p>
              When a trial starts, Kept sends your day 0 photo to AI Skin Simulation with the areas the product targets and a strength for each,
              set per ingredient.
              {sim ? ` ${sim.name}, for example, asks for ${sim.text}.` : null} YouCam returns your face with those areas improved. Kept then
              analyzes the simulated photo like any other, and its scores become the end point of the expected curve.
            </p>
            <p>
              The curve stays flat until half of the ingredient’s first change day, rises along a smooth S shape and reaches the target scores on
              the full effect day. The target photo is a reasonable picture of success for this product on your face. It is not a promise.
            </p>

            <h3 className={styles.h3}>Sunscreen</h3>
            <p>
              Sunscreen prevents damage that builds up over years, so a trial of a few weeks can’t show it working. For a sunscreen Kept skips the
              trial and uses YouCam AI Aging Simulation to show how your face may age instead.
            </p>
          </Section>

          <Section id="real-change">
            <p>
              Analyzing the same photo file twice gives identical scores, so YouCam adds no randomness of its own. The spread comes from the photo.
              Two photos taken a minute apart are never quite the same: you stand a little closer, the light shifts, your head tilts a degree.
            </p>
            <p>
              To measure how much that moves the scores, we took one face and made {variants} variants of it, each a change small enough to pass
              the camera checks. Then all {CALIBRATION.photos.length} were analyzed with the SD model.
            </p>
            <CalibrationTable />
            <NoiseFigure />
            <p className="num">
              Kept takes twice the standard deviation of each area, picks the largest among {definingAreas} and rounds it up: {one(LARGEST_TWO_SIGMA)}{' '}
              becomes {N}.
              {extraAreas.length
                ? ` ${capitalize(joinNouns(extraAreas))}, measured on the same photos, would not change that number: their largest is ${one(LARGEST_EXTRA_TWO_SIGMA)}.`
                : null}
            </p>
            <div className={styles.rule}>
              <p className="num">
                A change of {N} points or less from day 0 counts as no change. More than {N} counts as a real change. More than {2 * N} counts as a
                strong one, which is what Kept looks for when deciding whether your skin is reacting.
              </p>
            </div>
            <p className="num">
              When the last two check-ins are within {SMOOTHING_GAP_DAYS} days of each other, Kept averages them before comparing with day 0, so one
              unlucky photo moves the verdict less.
            </p>
            <p>
              This was measured on variants of one photo, not on photos of a person taken on different days. Real repeat photos can differ more,
              for example after a short night. That is why the camera checks matter, and why the verdict lowers its confidence when light or
              framing drifted.
            </p>
          </Section>

          <Section id="timelines">
            <p>
              Every ingredient in Kept’s catalog has its own timeline: when the first changes usually appear, when the full effect is reached and,
              for some, a window when a short breakout is common because skin renews faster. Before the first change day Kept says it is too early
              to tell, unless your skin is reacting. Inside the breakout window a rise in acne is read as likely purging rather than failure.
            </p>
            <ActivesTable />
            <p className="num">
              When a product contains several of these, the trial uses the earliest first change day, the latest full effect day and one breakout
              window that covers all of them. Check-ins fall on days {checkinDays} up to the full effect day, with the last one on the full effect
              day itself. These are typical ranges for each ingredient, not a prediction for your skin.
            </p>
          </Section>

          <Section id="verdict">
            <p>
              The verdict is computed in your browser by fixed rules from the scores, the day of the trial and the ingredient’s timeline. Kept
              checks the rules in this order and stops at the first one that applies.
            </p>
            <ol className={styles.rules}>
              {VERDICT_RULES.map((r) => {
                const { icon: Icon, tone } = VERDICT_ICON[r.kind];
                return (
                  <li key={r.kind} className={styles.ruleItem}>
                    <span className={styles.ruleIcon} data-tone={tone} aria-hidden="true">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <div>
                      <h3 className={styles.ruleTitle}>{HEADLINES[r.kind]}</h3>
                      <p className="num">{r.when}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="num">
              Each verdict lists up to {MAX_REASONS} reasons with the numbers behind them, such as the score on day 0 and today. Confidence drops
              when light or framing drifted, and drops to low when you started another product during the trial, because changes after that may
              come from it.
            </p>
            <p>
              An optional assistant, built on Gemini through OpenRouter, answers questions about a trial. It reads the trial’s numbers and explains
              the verdict. It never decides it.
            </p>
          </Section>

          <Section id="your-device">
            <p>
              There is no account. Your trials, photos, skin maps, scores and diary notes are stored in this browser’s IndexedDB, on this device.
            </p>
            <p>
              To analyze a photo, Kept’s server forwards it to the YouCam API and passes the result back. The server does not save photos or
              results. YouCam’s links to the maps expire after two hours, so the browser downloads them as soon as an analysis finishes.
            </p>
            <p>
              The assistant receives the trial’s numbers and diary notes, without photos. Photos go to OpenRouter only if you switch on “Let the
              assistant look at my photos”, and then only two of them, reduced to 512 px.
            </p>
            <p>
              Because everything lives in the browser, clearing this site’s data deletes your trials, and they do not follow you to another device.
              The report page of each trial can be printed or saved as a PDF.
            </p>
          </Section>

          <Section id="limits">
            <p>
              Kept compares photos of your skin. It is not a medical diagnosis, and a score from 1 to 100 says nothing about what causes the thing
              it measures.
            </p>
            <p>
              The ±{N} point range was measured on variants of a single photo. Sleep, your period, sun or a new product can move scores further
              from one week to the next. The check-in diary lets you note these, and a new product lowers the verdict’s confidence.
            </p>
            <p>The timelines are typical for each ingredient. Your skin can respond faster or slower.</p>
            <p>
              See a doctor rather than waiting for the next check-in if you have pain or swelling, burning that does not settle after you stop the
              product, a rash that spreads, or a spot or mole that changes in size, shape or color, bleeds or does not heal.
            </p>
            <p className={styles.closing}>
              <Link href="/demo" className={styles.textLink}>
                See a finished trial
              </Link>{' '}
              or{' '}
              <Link href="/start" className={styles.textLink}>
                start your own
              </Link>
              .
            </p>
          </Section>
        </article>
      </div>
    </main>
  );
}
