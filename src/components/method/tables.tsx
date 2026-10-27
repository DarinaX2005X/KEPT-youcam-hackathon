import { ADVICE, CHECK_LABEL, LIMITS } from '@/lib/capture/quality';
import { ACTIVES, CONCERNS, CONCERN_IDS, concernLabel, concernNoun, joinNouns, spanText, type Active, type Concern } from '@/lib/domain';
import { CALIBRATION } from './calibration';
import styles from './MethodPage.module.css';

const percent = (n: number) => `${Math.round(n * 100)}%`;

/* ---------- Camera checks ---------- */

const CHECK_ROWS = [
  {
    check: CHECK_LABEL.size,
    passes: `Your face spans ${percent(LIMITS.faceWidth.min)} to ${percent(LIMITS.faceWidth.max)} of the guide’s width`,
    advice: [ADVICE.closer, ADVICE.back],
  },
  {
    check: CHECK_LABEL.angle,
    passes: `Head turned or tipped up and down by ${LIMITS.yaw}° at most, tilted to the side by ${LIMITS.roll}° at most`,
    advice: [ADVICE.straight, ADVICE.chinDown],
  },
  {
    check: CHECK_LABEL.light,
    passes: `Forehead and cheeks average ${LIMITS.light.min} to ${LIMITS.light.max} on a 0 to 255 brightness scale, and the two cheeks differ by ${LIMITS.light.sideGap} or less`,
    advice: [ADVICE.dark, ADVICE.bright, ADVICE.side],
  },
  {
    check: `${CHECK_LABEL.align}, check-ins only`,
    passes: `Twelve points on your face (eye corners, nose, mouth corners, chin, forehead, cheek edges) sit on average within ${percent(LIMITS.align)} of the distance between your outer eye corners from where they were on day 0. That is about 1 cm at arm’s length`,
    advice: [ADVICE.align],
  },
  {
    check: `${CHECK_LABEL.sharp}, uploads only`,
    passes: `At least ${LIMITS.sharpness} on Kept’s sharpness measure. A sharp phone photo scores about 160 to 185, the same photo blurred by 1 px about 60`,
    advice: [ADVICE.blur],
  },
];

export function ChecksTable() {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.tableStacked}`}>
        <caption className="visually-hidden">Camera checks before each photo</caption>
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Passes when</th>
            <th scope="col">Otherwise the camera says</th>
          </tr>
        </thead>
        <tbody>
          {CHECK_ROWS.map((r) => (
            <tr key={r.check}>
              <th scope="row" className={styles.rowHead}>
                {r.check}
              </th>
              <td data-label="Passes when" className="num">
                {r.passes}
              </td>
              <td data-label="Otherwise" className={styles.adviceCell}>
                {r.advice.map((a) => (
                  <span key={a} className={styles.advice}>
                    {a}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Areas ---------- */

function targetedBy(c: Concern): Active[] {
  return ACTIVES.filter((a) => a.targets.includes(c));
}

export function AreasTable() {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Skin areas Kept can track</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Ingredients that target it</th>
            <th scope="col">In the target photo</th>
          </tr>
        </thead>
        <tbody>
          {CONCERN_IDS.map((c) => {
            const by = targetedBy(c);
            return (
              <tr key={c}>
                <th scope="row" className={styles.rowHead}>
                  {concernLabel(c)}
                </th>
                <td data-label="Targeted by">{by.length ? by.map((a) => a.name).join(', ') : 'Watched for irritation only'}</td>
                <td data-label="Target photo">{CONCERNS[c].simName ? 'Yes' : 'No, YouCam can’t simulate it'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Calibration scores ---------- */

export function CalibrationTable() {
  const areas = CALIBRATION.areas;
  const two = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.tableNumeric}`}>
        <caption className="visually-hidden">YouCam scores of the five calibration photos</caption>
        <thead>
          <tr>
            <th scope="col">Photo</th>
            {areas.map((a) => (
              <th key={a.concern} scope="col" className={styles.numCol}>
                {concernLabel(a.concern)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CALIBRATION.photos.map((p) => (
            <tr key={p.id}>
              <th scope="row" className={styles.rowHead}>
                {p.description}
              </th>
              {areas.map((a) => (
                <td key={a.concern} data-label={concernLabel(a.concern)} className={`${styles.numCol} num`}>
                  {p.scores[a.concern] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Highest minus lowest
            </th>
            {areas.map((a) => (
              <td key={a.concern} data-label={concernLabel(a.concern)} className={`${styles.numCol} num`}>
                {a.range}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Twice the standard deviation
            </th>
            {areas.map((a) => (
              <td key={a.concern} data-label={concernLabel(a.concern)} className={`${styles.numCol} num`}>
                {two(a.twoSigma)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------- Actives ---------- */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function purgeText(a: Active): string {
  if (!a.purge) return 'Not expected';
  return `Days ${a.purge.fromDay} to ${a.purge.toDay}`;
}

export function ActivesTable() {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Timelines for each active ingredient in Kept’s catalog</caption>
        <thead>
          <tr>
            <th scope="col">Ingredient</th>
            <th scope="col">What Kept tracks</th>
            <th scope="col" className={styles.dayCol}>
              First changes
            </th>
            <th scope="col" className={styles.dayCol}>
              Full effect
            </th>
            <th scope="col" className={styles.dayCol}>
              Breakout window
            </th>
          </tr>
        </thead>
        <tbody>
          {ACTIVES.map((a) => {
            if (a.prevention) {
              return (
                <tr key={a.id}>
                  <th scope="row" className={styles.rowHead}>
                    {a.name}
                  </th>
                  <td data-label="Tracks" colSpan={4} className={styles.spanCell}>
                    No trial. Its effect shows over years, so Kept shows an aging simulation instead
                  </td>
                </tr>
              );
            }
            const watch = a.watch.filter((c) => !a.targets.includes(c));
            return (
              <tr key={a.id}>
                <th scope="row" className={styles.rowHead}>
                  {a.name}
                </th>
                <td data-label="Tracks">
                  <span>
                    {capitalize(joinNouns(a.targets.map(concernNoun)))}
                    {watch.length ? <span className={styles.subline}>Watches {joinNouns(watch.map(concernNoun))}</span> : null}
                  </span>
                </td>
                <td data-label="First changes" className={`${styles.dayCol} num`}>
                  {spanText(a.onsetDay)}
                </td>
                <td data-label="Full effect" className={`${styles.dayCol} num`}>
                  {spanText(a.fullEffectDay)}
                </td>
                <td data-label="Breakout window" className={`${styles.dayCol} num`}>
                  {purgeText(a)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
