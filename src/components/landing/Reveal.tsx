'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * A landing block that rises 12 px into place the first time it scrolls into view.
 * Server and client render the same start state; reduced motion only drops the travel time.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={reduce ? { duration: 0 } : { duration: 0.36, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
