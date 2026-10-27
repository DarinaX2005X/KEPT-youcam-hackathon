'use client';

import clsx from 'clsx';
import { useCallback, useId, useLayoutEffect, useRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './Field.module.css';

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, className, children }: FieldShellProps) {
  return (
    <div className={clsx(styles.field, error ? styles.invalid : null, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: ReactNode, hint?: ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function TextField({ label, hint, error, id, className, fieldClassName, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} className={fieldClassName}>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={clsx(styles.control, styles.input, className)}
      />
    </FieldShell>
  );
}

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Height grows with the content up to this many pixels, then scrolls. */
  maxHeight?: number;
  fieldClassName?: string;
}

export function Textarea({ label, hint, error, id, className, fieldClassName, maxHeight = 360, rows = 3, onChange, ref, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inner = useRef<HTMLTextAreaElement | null>(null);

  const fit = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight + 2, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + 2 > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  useLayoutEffect(() => {
    fit();
  }, [fit, rest.value]);

  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} className={fieldClassName}>
      <textarea
        {...rest}
        rows={rows}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        id={inputId}
        onChange={(e) => {
          onChange?.(e);
          fit();
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={clsx(styles.control, styles.textarea, className)}
      />
    </FieldShell>
  );
}
