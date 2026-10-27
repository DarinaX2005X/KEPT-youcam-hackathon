'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Short line under the title when it helps the decision. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions pinned to the bottom of the sheet. */
  footer?: ReactNode;
  /** Desktop dialog width. */
  width?: number;
  /** Element to focus first; defaults to the first focusable control. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Bottom sheet under 768 px (drag the handle down to close), centred dialog above. Traps focus and closes on Escape. */
export function Sheet({ open, onClose, title, description, children, footer, width = 520, initialFocus, className }: SheetProps) {
  const mobile = useMediaQuery(MOBILE_QUERY);
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const dragControls = useDragControls();
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const body = panel.querySelector<HTMLElement>('[data-sheet-body]');
      const target = initialFocus?.current ?? body?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus({ preventScroll: true });
    }, 30);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || !panel.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !panel.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 96 || info.velocity.y > 600) onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className={clsx(styles.layer, mobile ? styles.layerSheet : styles.layerDialog)}>
          <motion.div
            className={styles.scrim}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={clsx(styles.panel, mobile ? styles.sheet : styles.dialog, className)}
            style={mobile ? undefined : { width: `min(${width}px, calc(100vw - 48px))` }}
            initial={mobile ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={mobile ? { y: '100%' } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={mobile ? { type: 'spring', stiffness: 420, damping: 42 } : { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            drag={mobile ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            onDragEnd={mobile ? onDragEnd : undefined}
          >
            {mobile ? (
              <div className={styles.grabZone} onPointerDown={(e) => dragControls.start(e)} aria-hidden>
                <span className={styles.handle} />
              </div>
            ) : null}
            <header className={styles.header} onPointerDown={mobile ? (e) => dragControls.start(e) : undefined}>
              <div className={styles.titles}>
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className={styles.description}>
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className={styles.close} />
            </header>
            <div className={styles.body} data-sheet-body>
              {children}
            </div>
            {footer ? <footer className={styles.footer}>{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
