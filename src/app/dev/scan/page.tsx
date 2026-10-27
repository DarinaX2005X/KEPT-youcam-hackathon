import type { Metadata } from 'next';
import { DevScanPage } from '@/lib/scan/DevScanPage';

export const metadata: Metadata = {
  title: 'Scan pipeline',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DevScanPage />;
}
