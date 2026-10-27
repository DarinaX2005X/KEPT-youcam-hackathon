import type { Metadata } from 'next';
import { ShelfPage } from '@/components/shelf';

export const metadata: Metadata = {
  title: 'Your shelf',
  description: 'Products you are testing, the ones you kept and the ones you stopped, with what each changed on your skin.',
};

export default function Page() {
  return <ShelfPage />;
}
