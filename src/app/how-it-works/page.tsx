import type { Metadata } from 'next';
import { MethodPage } from '@/components/method';

export const metadata: Metadata = {
  title: 'How Kept measures',
  description:
    'What Kept checks before each photo, what YouCam Skin AI measures, how much change between repeat photos Kept treats as noise, ingredient timelines and where your photos are stored.',
};

export default function Page() {
  return <MethodPage />;
}
