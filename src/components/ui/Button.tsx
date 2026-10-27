'use client';

import Link from 'next/link';
import clsx from 'clsx';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon drawn on the left at 18 px. */
  icon?: LucideIcon;
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
  children: ReactNode;
  className?: string;
}

type AsButton = CommonProps & Omit<ComponentPropsWithRef<'button'>, keyof CommonProps> & { href?: undefined };
type AsLink = CommonProps & Omit<ComponentPropsWithRef<typeof Link>, keyof CommonProps> & { href: string };

export type ButtonProps = AsButton | AsLink;

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) {
  return clsx(styles.button, styles[variant], styles[size], block && styles.block);
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', icon: Icon, loading = false, block = false, children, className, ...rest } = props;
  const cls = clsx(buttonClass(variant, size, block), loading && styles.loading, className);
  const inner = (
    <>
      <span className={styles.content}>
        {Icon ? <Icon size={18} strokeWidth={1.75} aria-hidden className={styles.icon} /> : null}
        <span>{children}</span>
      </span>
      {loading ? (
        <span className={styles.spinner} aria-hidden>
          <Spinner size={size === 'lg' ? 20 : 18} />
        </span>
      ) : null}
    </>
  );

  if (typeof rest.href === 'string') {
    const linkProps = rest as Omit<AsLink, keyof CommonProps>;
    return (
      <Link {...linkProps} className={cls} aria-busy={loading || undefined}>
        {inner}
      </Link>
    );
  }

  const { type = 'button', disabled, ...buttonProps } = rest as Omit<AsButton, keyof CommonProps>;
  return (
    <button
      {...buttonProps}
      type={type}
      className={cls}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : buttonProps.onClick}
    >
      {inner}
    </button>
  );
}
