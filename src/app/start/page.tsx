import type { Metadata } from 'next';
import { Wizard } from '@/components/wizard';

export const metadata: Metadata = {
  title: 'Start a trial',
  description: 'Add the product you started using, take a day 0 photo and get a check-in plan with a target simulated by YouCam.',
};

export default function Page() {
  return <Wizard />;
}
