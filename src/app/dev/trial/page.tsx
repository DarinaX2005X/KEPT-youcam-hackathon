import type { Metadata } from 'next';
import { DevTrial } from './DevTrial';

export const metadata: Metadata = {
  title: 'Trial workspace',
  robots: { index: false, follow: false },
};

export default function DevTrialPage() {
  return (
    <main>
      <DevTrial />
    </main>
  );
}
