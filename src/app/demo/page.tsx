import type { Metadata } from 'next';
import { DemoLoader } from '@/components/shelf';

export const metadata: Metadata = {
  title: 'Sample trial',
  robots: { index: false },
};

export default function Page() {
  return <DemoLoader />;
}
