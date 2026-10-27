'use client';

import { ScanFace, SunMedium } from 'lucide-react';
import type { DiaryEntry } from '@/lib/domain';
import { Button, Chip, Textarea } from '@/components/ui';
import type { PhotoDifference } from './checkinModel';
import styles from './CheckinFlow.module.css';

type Flag = 'newProduct' | 'period' | 'sun' | 'poorSleep';

const FLAGS: { key: Flag; label: string }[] = [
  { key: 'newProduct', label: 'Started another product' },
  { key: 'period', label: 'Period this week' },
  { key: 'sun', label: 'Lots of sun' },
  { key: 'poorSleep', label: 'Poor sleep' },
];

export interface DiaryPanelProps {
  sinceDay: number;
  value: DiaryEntry;
  onChange: (next: DiaryEntry) => void;
  difference: PhotoDifference;
  /** «Acne, Texture, Redness and Hydration». */
  areas: string;
  onRun: () => void;
  onRetake: () => void;
}

/** One panel between the photo and the scan: what else changed, and whether the photo matches day 0. */
export function DiaryPanel({ sinceDay, value, onChange, difference, areas, onRun, onRetake }: DiaryPanelProps) {
  const { light, framing } = difference;
  const lightPct = light !== undefined ? Math.round(Math.abs(light) * 100) : 0;

  return (
    <section className={styles.diary} aria-labelledby="diary-title">
      <h1 id="diary-title" className={styles.title}>
        Anything new since day {sinceDay}?
      </h1>
      <p className={styles.lead}>Kept saves these with the photo. Another new product in your routine makes the verdict less certain.</p>

      <div className={styles.flags} role="group" aria-label="Since your last photo">
        {FLAGS.map((f) => (
          <Chip key={f.key} selected={Boolean(value[f.key])} onClick={() => onChange({ ...value, [f.key]: !value[f.key] })}>
            {f.label}
          </Chip>
        ))}
      </div>

      <Textarea
        label="Note"
        placeholder="Optional. For example, switched moisturizer on day 16"
        rows={2}
        maxHeight={160}
        maxLength={500}
        value={value.note ?? ''}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
      />

      {light !== undefined || framing ? (
        <div className={styles.notice} role="note">
          {light !== undefined ? <SunMedium size={20} strokeWidth={1.75} aria-hidden /> : <ScanFace size={20} strokeWidth={1.75} aria-hidden />}
          <p>
            {light !== undefined
              ? `This photo is ${lightPct}% ${light > 0 ? 'brighter' : 'darker'} than day 0. Light shifts the scores, so this check-in will count with less certainty. `
              : 'This photo is framed differently from day 0, so small changes will count with less certainty. '}
            Retake it where you took day 0 if you can.
          </p>
        </div>
      ) : null}

      <div className={styles.runRow}>
        <p className={styles.areas}>Measures {areas}, the same areas as day 0.</p>
        <div className={styles.actions}>
          <Button size="lg" onClick={onRun}>
            Run check-in
          </Button>
          <Button size="lg" variant="quiet" onClick={onRetake}>
            Retake photo
          </Button>
        </div>
      </div>
    </section>
  );
}
