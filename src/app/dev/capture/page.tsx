import type { Metadata } from 'next';
import { DevCapturePage } from '@/components/capture/DevCapturePage';

export const metadata: Metadata = {
  title: 'Capture',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DevCapturePage />;
}
