import type { Metadata } from 'next';
import { TrialPage } from './TrialPage';

export const metadata: Metadata = {
  // The product name replaces it once the trial loads from this browser.
  title: { absolute: 'Kept' },
  robots: { index: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const fresh = typeof query.new === 'string' && query.new ? query.new : undefined;
  return <TrialPage trialId={decodeURIComponent(id)} newScanId={fresh} />;
}
