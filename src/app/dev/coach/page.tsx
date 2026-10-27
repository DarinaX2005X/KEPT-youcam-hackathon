import type { Metadata } from 'next';
import { DevCoachPage } from '@/components/coach/DevCoachPage';

export const metadata: Metadata = {
  title: 'Trial assistant',
  robots: { index: false, follow: false },
};

export default function DevCoachRoute() {
  return (
    <main>
      <DevCoachPage />
    </main>
  );
}
