import type { Metadata } from 'next';
import { Showcase } from './Showcase';

export const metadata: Metadata = {
  title: 'Interface kit',
  robots: { index: false, follow: false },
};

export default function DevUiPage() {
  return <Showcase />;
}
