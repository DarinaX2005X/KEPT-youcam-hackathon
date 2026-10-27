import { concernLabel } from '@/lib/domain';
import { CALIBRATION } from './calibration';
import styles from './MethodPage.module.css';

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/**
 * Dot plot: for each area, the five photos placed by how far their score sits from that area's mean,
 * against the ±NOISE band Kept treats as no change.
 */
export function NoiseFigure() {
  const noise = CALIBRATION.noise;
  const maxDev = Math.max(...CALIBRATION.areas.flatMap((a) => a.values.map((v) => Math.abs(v - a.mean))));
  const half = Math.max(noise + 2, Math.ceil(maxDev) + 1);
  const x = (dev: number) => `${((dev + half) / (2 * half)) * 100}%`;
  const ticks: number[] = [];
  for (let t = -half; t <= half; t++) if (t % 2 === 0 || Math.abs(t) === noise) ticks.push(t);

  return (
    <figure className={styles.noiseFigure}>
      <div className={styles.noisePlot} role="img" aria-label={`Scores of ${CALIBRATION.photos.length} repeat photos per area, at most ${Math.round(maxDev * 10) / 10} points from the area's average, against a band of ±${noise} points.`}>
        {CALIBRATION.areas.map((a) => {
          const stacks = new Map<number, number>();
          return (
            <div key={a.concern} className={styles.noiseRow}>
              <span className={styles.noiseLabel}>{concernLabel(a.concern)}</span>
              <div className={styles.noiseTrack}>
                <span className={styles.noiseBand} style={{ left: x(-noise), width: `${(noise / half) * 100}%` }} />
                <span className={styles.noiseZero} style={{ left: x(0) }} />
                {a.values.map((v, i) => {
                  const dev = v - a.mean;
                  const key = Math.round(dev * 100);
                  const k = stacks.get(key) ?? 0;
                  stacks.set(key, k + 1);
                  return (
                    <span
                      key={i}
                      className={styles.noiseDot}
                      style={{ left: x(dev), transform: `translate(-50%, calc(-50% + ${(k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10}px))` }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className={styles.noiseRow} aria-hidden="true">
          <span className={styles.noiseLabel} />
          <div className={styles.noiseAxis}>
            {ticks.map((t) => (
              <span key={t} className={`${styles.noiseTick} num`} style={{ left: x(t) }}>
                {signed(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className={styles.caption}>
        Each dot is one of the five photos, placed by how far its score sits from the average of the five. The shaded band is ±{noise} points, the
        range Kept treats as no change.
      </figcaption>
    </figure>
  );
}
