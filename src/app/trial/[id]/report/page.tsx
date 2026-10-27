import type { Metadata } from 'next';
import { ReportPage } from '@/components/report';

export const metadata: Metadata = {
  title: 'Trial report',
  robots: { index: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportPage trialId={decodeURIComponent(id)} />;
}
