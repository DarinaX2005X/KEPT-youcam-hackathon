'use client';

import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleAlert, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'better' | 'worse' | 'reacting';

export interface ToastOptions {
  text: ReactNode;
  tone?: ToastTone;
  /** Undo or another quick reversal. The label defaults to «Undo». */
  action?: { label?: string; onAction: () => void };
  /** Milliseconds; defaults to 4000. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<ToastTone, LucideIcon> = {
  neutral: Info,
  better: Check,
  worse: CircleAlert,
  reacting: TriangleAlert,
};

let nextId = 1;

export interface ToastProviderProps {
  children: ReactNode;
  /**
   * `viewport` pins toasts to the bottom of the window (root layout).
   * `container` wraps its children and shows toasts at the bottom edge of that box, next to the action that caused them.
   */
  placement?: 'viewport' | 'container';
  className?: string;
}

/** Nest a `container` provider around a panel to anchor its toasts there; `useToast` picks the nearest provider. */
export function ToastProvider({ children, placement = 'viewport', className }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((opts: ToastOptions) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { ...opts, id }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const region = (
    <div className={clsx(styles.region, placement === 'viewport' ? styles.viewport : styles.anchored)} aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {placement === 'container' ? (
        <div className={clsx(styles.container, className)}>
          {children}
          {region}
        </div>
      ) : (
        <>
          {children}
          {region}
        </>
      )}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone = item.tone ?? 'neutral';
  const Icon = ICON[tone];
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration ?? 4000);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const t = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, onDismiss]);

  return (
    <motion.div
      layout
      role="status"
      className={clsx(styles.toast, styles[tone])}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon}>
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={styles.text}>{item.text}</span>
      {item.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onAction();
            onDismiss();
          }}
        >
          {item.action.label ?? 'Undo'}
        </button>
      ) : null}
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </motion.div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
