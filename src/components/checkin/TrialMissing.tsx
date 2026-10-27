import clsx from 'clsx';
import { Button } from '@/components/ui';
import styles from './TrialMissing.module.css';

export interface TrialMissingProps {
  /** Error loading from IndexedDB instead of a trial that isn't there. */
  error?: boolean;
  onRetry?: () => void;
  className?: string;
}

/** Two empty frames: the day 0 outline with nothing inside, the way Kept's mark looks without a photo. */
function EmptyFrames() {
  return (
    <svg width="112" height="112" viewBox="16 14 96 104" fill="none" aria-hidden className={styles.art}>
      <rect x="20" y="30" width="58" height="84" rx="29" stroke="var(--line-strong)" strokeWidth="3" strokeDasharray="7 7" />
      <rect x="50" y="18" width="58" height="84" rx="29" fill="var(--sunk)" stroke="var(--line)" strokeWidth="2" />
    </svg>
  );
}

/** Shown when a trial id isn't in this browser's IndexedDB. */
export function TrialMissing({ error, onRetry, className }: TrialMissingProps) {
  return (
    <section className={clsx(styles.root, className)} aria-labelledby="trial-missing-title">
      <EmptyFrames />
      <h1 id="trial-missing-title" className={styles.title}>
        {error ? "Kept couldn't open this trial" : "This trial isn't on this device"}
      </h1>
      <p className={styles.text}>
        {error
          ? 'Your browser refused to read the saved trials. Reload the page, and if it keeps happening, check that this site may store data.'
          : 'Trials are stored in your browser. Open the link on the phone or computer where you started the trial, or look at a finished sample.'}
      </p>
      <div className={styles.actions}>
        {error && onRetry ? (
          <Button size="lg" onClick={onRetry}>
            Try again
          </Button>
        ) : (
          <Button size="lg" href="/shelf">
            Go to your shelf
          </Button>
        )}
        <Button size="lg" variant="secondary" href="/demo">
          Open the sample trial
        </Button>
      </div>
    </section>
  );
}
