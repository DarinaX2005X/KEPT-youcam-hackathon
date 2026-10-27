'use client';

import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> {
  icon: LucideIcon;
  /** Required accessible name, also shown as the native tooltip. */
  label: string;
  variant?: 'secondary' | 'quiet' | 'primary';
}

export function IconButton({ icon: Icon, label, variant = 'quiet', className, type = 'button', title, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} title={title ?? label} className={clsx(styles.iconButton, styles[variant], className)}>
      <Icon size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
