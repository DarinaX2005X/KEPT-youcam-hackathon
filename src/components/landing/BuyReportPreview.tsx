'use client';

import { useSyncExternalStore } from 'react';
import { BuyCheckReport, type BuyCheckReportProps } from '@/components/buycheck/BuyCheckReport';

const noop = () => () => {};

/**
 * BuyCheckReport picks its entrance by `useReducedMotion`, which differs between server and browser,
 * so this preview renders it only in the browser to keep hydration clean.
 */
export function BuyReportPreview(props: BuyCheckReportProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <BuyCheckReport {...props} /> : <div style={{ minHeight: 400 }} aria-hidden />;
}
