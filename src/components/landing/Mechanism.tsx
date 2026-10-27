import clsx from 'clsx';
import Image from 'next/image';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { MaskLayer } from '@/components/ui';
import { ChecksList } from '@/components/capture/ChecksList';
import { TrendChart } from '@/components/trial/TrendChart';
import type { MechanismData } from './data';
import { Reveal } from './Reveal';
import styles from './Sections.module.css';

// Both photos are drawn with the same box, so the day 0 ghost lines up with today's face as it does on the camera.
const PHOTO_BOX = { x: -24, y: -10, width: 348, height: 464 };
const OVAL = 'M148 22 C200 22 232 70 232 132 C232 202 196 252 148 252 C100 252 64 202 64 132 C64 70 96 22 148 22 Z';

/** The camera guide as it looks at a check-in: day 0 faintly inside the outline, the three checks passed. */
function CameraPart({ photo, ghost }: { photo: string; ghost: string }) {
  return (
    <div className={styles.camera}>
      <div className={styles.cameraView}>
        <svg viewBox="0 0 300 400" className={styles.cameraOverlay} aria-hidden preserveAspectRatio="xMidYMid slice">
          <defs>
            <mask id="mech-hole">
              <rect width="300" height="400" fill="#fff" />
              <path d={OVAL} fill="#000" />
            </mask>
            <clipPath id="mech-clip">
              <path d={OVAL} />
            </clipPath>
          </defs>
          <image href={photo} {...PHOTO_BOX} preserveAspectRatio="xMidYMid slice" />
          <rect width="300" height="400" className={styles.cameraScrim} mask="url(#mech-hole)" />
          <image href={ghost} {...PHOTO_BOX} preserveAspectRatio="xMidYMid slice" clipPath="url(#mech-clip)" className={styles.cameraGhost} />
          <path d={OVAL} className={styles.cameraOutline} />
        </svg>
      </div>
      <ChecksList
        className={styles.cameraChecks}
        checks={[
          { id: 'size', label: 'Face size', state: 'good', text: 'Good' },
          { id: 'angle', label: 'Angle', state: 'good', text: 'Good' },
          { id: 'light', label: 'Light', state: 'good', text: 'Good' },
        ]}
      />
    </div>
  );
}

function MapPart({ photo, mask, scores, blemishes }: Pick<MechanismData, 'scores' | 'blemishes' | 'mask'> & { photo: string }) {
  return (
    <figure className={styles.mapPrint}>
      <div className={styles.mapPhoto}>
        <div className={styles.mapZoom}>
          <Image src={photo} alt="" fill sizes="320px" className={styles.cameraImg} />
          <MaskLayer mask={mask} opacity={0.95} />
        </div>
        <span className={clsx(styles.mapCount, 'num')}>{blemishes} blemishes</span>
      </div>
      <ul className={styles.mapScores} aria-label="Scores on day 0">
        {scores.map((s) => (
          <li key={s.concern}>
            <span>{s.label}</span>
            <strong className="num">{s.value}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function VerdictPart({ data }: { data: MechanismData }) {
  const v = data.verdict;
  const reasons = v.reasons.filter((r) => r.tone === 'better').slice(0, 2);
  return (
    <div className={styles.slip}>
      <div className={styles.slipHead}>
        <CheckCircle2 size={22} strokeWidth={2} aria-hidden />
        <span>{v.headline}</span>
      </div>
      <ul className={styles.slipReasons}>
        {reasons.map((r) => (
          <li key={r.text} className="num">
            <TrendingUp size={14} strokeWidth={2.5} aria-hidden />
            <span>{r.text.split('. ')[0]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STEPS = [
  { key: 'camera', text: 'Same angle, distance and light every time' },
  { key: 'map', text: 'YouCam Skin AI scores each area and maps where it changed' },
  {
    key: 'chart',
    text: 'Each active ingredient has its own timeline. Kept knows when to expect a change and when a breakout is a purge',
  },
  { key: 'verdict', text: 'A verdict with the numbers behind it' },
] as const;

export function Mechanism({ data }: { data: MechanismData }) {
  const parts: Record<(typeof STEPS)[number]['key'], React.ReactNode> = {
    camera: <CameraPart photo={data.photo} ghost={data.ghost} />,
    map: <MapPart photo={data.maskPhoto} mask={data.mask} scores={data.scores} blemishes={data.blemishes} />,
    chart: <TrendChart trial={data.trial} scans={data.scans} concern="acne" staticMode className={styles.chart} />,
    verdict: <VerdictPart data={data} />,
  };
  return (
    <section className={styles.section} aria-labelledby="measure-title">
      <div className={styles.wrap}>
        <Reveal>
          <h2 id="measure-title" className={styles.h2}>
            How Kept measures
          </h2>
        </Reveal>
        <ol className={styles.flow}>
          {STEPS.map((s, i) => (
            <li key={s.key} className={clsx(styles.flowStep, styles[`flow_${s.key}`])}>
              <Reveal delay={i * 0.06} className={styles.flowInner}>
                <div className={styles.flowObject}>{parts[s.key]}</div>
                <span className={styles.flowNode} aria-hidden />
                <p className={styles.flowText}>{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
