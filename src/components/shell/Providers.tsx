'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { ToastProvider } from '@/components/ui';

/** App-wide client context: reduced-motion handling for Motion and the viewport toast region. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider placement="viewport">{children}</ToastProvider>
    </MotionConfig>
  );
}
