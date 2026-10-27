'use client';

import clsx from 'clsx';
import { useRef, useState, type DragEvent } from 'react';
import { ImageOff, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './StillPane.module.css';

export interface DropZoneProps {
  onFile: (file: File) => void;
  /** Shown instead of the invitation, with a button to pick another file. */
  error?: string | null;
  /** A line above the invitation, e.g. that no camera was found. */
  note?: string | null;
}

/** Drag and drop or pick a JPEG/PNG. The native input stays hidden; the zone and its button open it. */
export function DropZone({ onFile, error, note }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const open = () => inputRef.current?.click();

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={clsx(styles.zone, over && styles.zoneOver, error && styles.zoneError)}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) open();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      {note && !error ? <p className={styles.note}>{note}</p> : null}
      <span className={clsx(styles.well, error && styles.wellError)} aria-hidden>
        {error ? <ImageOff size={26} strokeWidth={1.75} /> : <ImagePlus size={26} strokeWidth={1.75} />}
      </span>
      {error ? (
        <p className={styles.zoneTitle} role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className={styles.zoneTitle}>{over ? 'Drop to check the photo' : 'Add a photo of your face'}</p>
          <p className={styles.zoneHint}>Drop it here or choose a file. JPEG or PNG, taken straight on in even light, without filters.</p>
        </>
      )}
      <Button variant={error ? 'primary' : 'secondary'} size="lg" onClick={open}>
        {error ? 'Choose another photo' : 'Choose a photo'}
      </Button>
    </div>
  );
}
