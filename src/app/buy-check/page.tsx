import type { Metadata } from 'next';
import { BuyCheckPage } from '@/components/buycheck';

export const metadata: Metadata = {
  title: 'Before you buy',
  description: "Paste a product's ingredients and Kept checks them against your skin and the products you've already tested.",
};

export default function Page() {
  return <BuyCheckPage />;
}
