import type { Metadata } from 'next';
import { CheckinFlow } from '@/components/checkin';

export const metadata: Metadata = {
  title: 'Check-in',
  robots: { index: false },
};

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckinFlow trialId={decodeURIComponent(id)} />;
}
