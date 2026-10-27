'use client';

import clsx from 'clsx';
import { Camera, CalendarPlus } from 'lucide-react';
import type { Verdict } from '@/lib/domain';
import { Button } from '@/components/ui';
import styles from './DecisionBar.module.css';

export type Decision = 'kept' | 'stopped';

export interface DecisionBarProps {
  action: Verdict['next']['action'];
  onRunCheckin?: () => void;
  onAddToCalendar?: () => void;
  onDecide?: (decision: Decision) => void;
  /** «Keep testing» after a keep or stop suggestion, «Got it» after a reduce-use one. */
  onDefer?: () => void;
  /** Hides «Add to calendar» when no check-ins are left. */
  canAddToCalendar?: boolean;
  className?: string;
}

/** The two buttons under a verdict. The first one is what the verdict suggests. */
export function DecisionBar({ action, onRunCheckin, onAddToCalendar, onDecide, onDefer, canAddToCalendar = true, className }: DecisionBarProps) {
  let buttons;
  if (action === 'decide_keep') {
    buttons = (
      <>
        <Button onClick={() => onDecide?.('kept')}>Keep this product</Button>
        <Button variant="secondary" onClick={onDefer}>
          Keep testing
        </Button>
      </>
    );
  } else if (action === 'decide_stop') {
    buttons = (
      <>
        <Button onClick={() => onDecide?.('stopped')}>Stop this product</Button>
        <Button variant="secondary" onClick={onDefer}>
          Keep testing
        </Button>
      </>
    );
  } else if (action === 'reduce_use') {
    buttons = (
      <>
        <Button onClick={onDefer}>Got it</Button>
        <Button variant="secondary" onClick={() => onDecide?.('stopped')}>
          Stop this product
        </Button>
      </>
    );
  } else {
    buttons = (
      <>
        <Button icon={Camera} onClick={onRunCheckin}>
          Run check-in
        </Button>
        {canAddToCalendar ? (
          <Button variant="secondary" icon={CalendarPlus} onClick={onAddToCalendar}>
            Add to calendar
          </Button>
        ) : null}
      </>
    );
  }
  return <div className={clsx(styles.bar, className)}>{buttons}</div>;
}
