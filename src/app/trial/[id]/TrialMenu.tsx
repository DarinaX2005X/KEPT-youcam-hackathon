'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CirclePause, CirclePlay, Ellipsis, FileText, Trash2, type LucideIcon } from 'lucide-react';
import { dayOf, type Trial } from '@/lib/domain';
import { saveTrial } from '@/lib/store';
import { Button, IconButton, Sheet, useToast } from '@/components/ui';
import type { ReadyTrialData } from '@/components/trial';
import { deleteWithSnapshot, restoreSnapshot } from './trialSnapshot';
import styles from './trialPage.module.css';

export interface TrialMenuProps {
  data: ReadyTrialData;
}

function Row({ icon: Icon, label, text, danger, ...rest }: { icon: LucideIcon; label: string; text: string; danger?: boolean } & ({ href: string; onClick?: undefined } | { href?: undefined; onClick: () => void })) {
  const inner = (
    <>
      <span className={clsx(styles.rowIcon, danger && styles.rowIconDanger)} aria-hidden>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <span className={styles.rowText}>
        <span className={clsx(styles.rowLabel, danger && styles.danger)}>{label}</span>
        <span className={styles.rowHint}>{text}</span>
      </span>
    </>
  );
  return (
    <li>
      {rest.href ? (
        <Link href={rest.href} className={styles.row}>
          {inner}
        </Link>
      ) : (
        <button type="button" className={styles.row} onClick={rest.onClick}>
          {inner}
        </button>
      )}
    </li>
  );
}

/** Three-dot menu on the trial header: report, pause or resume, delete with Undo. */
export function TrialMenu({ data }: TrialMenuProps) {
  const { trial, scans, reload } = data;
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const canPause = trial.status === 'testing' || trial.status === 'paused';
  const paused = trial.status === 'paused';
  const photos = scans.length;

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  async function setStatus(status: Trial['status']) {
    const before = trial;
    try {
      await saveTrial({ ...trial, status });
      await reload();
    } catch {
      toast.show({ text: "Couldn't save the change. Try again", tone: 'worse' });
      return;
    }
    close();
    const day = Math.max(0, dayOf(trial, new Date()));
    toast.show({
      text: status === 'paused' ? `Paused on day ${day}` : 'Back to testing',
      action: {
        onAction: async () => {
          await saveTrial(before);
          await reload();
        },
      },
      duration: 6000,
    });
  }

  async function remove() {
    setBusy(true);
    try {
      const snap = await deleteWithSnapshot(trial.id);
      close();
      router.push('/shelf');
      toast.show({
        text: `Deleted ${trial.product.name}`,
        action: snap
          ? {
              onAction: async () => {
                await restoreSnapshot(snap);
                router.push(`/trial/${trial.id}`);
              },
            }
          : undefined,
        duration: 5000,
      });
    } catch {
      toast.show({ text: "Couldn't delete this trial. Try again", tone: 'worse' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <IconButton icon={Ellipsis} label="Trial options" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} />
      <Sheet
        open={open}
        onClose={close}
        title={confirming ? 'Delete this trial?' : trial.product.name}
        description={
          confirming
            ? `${trial.product.name} and its ${photos === 1 ? 'photo' : `${photos} photos`} with their skin maps will be removed from this browser. You can undo it for a few seconds.`
            : undefined
        }
        width={460}
        footer={
          confirming ? (
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Don&apos;t delete
              </Button>
              <Button className={styles.dangerButton} icon={Trash2} onClick={() => void remove()} loading={busy}>
                Delete trial
              </Button>
            </>
          ) : undefined
        }
      >
        {confirming ? null : (
          <ul className={styles.menu}>
            <Row icon={FileText} label="Download report" text="One page with the photos, scores and verdict, ready to print or save as PDF" href={`/trial/${trial.id}/report`} />
            {canPause ? (
              paused ? (
                <Row icon={CirclePlay} label="Resume trial" text="Back to testing. Your day count carries on from the start date" onClick={() => void setStatus('testing')} />
              ) : (
                <Row icon={CirclePause} label="Pause trial" text="For a break from the product. The trial stays on your shelf" onClick={() => void setStatus('paused')} />
              )
            ) : null}
            <Row icon={Trash2} label="Delete trial" text="Removes it and its photos from this browser" danger onClick={() => setConfirming(true)} />
          </ul>
        )}
      </Sheet>
    </>
  );
}
