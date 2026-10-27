import { buildLandingData } from '@/components/landing/data';
import { Landing } from '@/components/landing';

export default function Home() {
  const data = buildLandingData();
  return <Landing data={data} />;
}
