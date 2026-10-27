'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Combobox } from '@/components/ui';
import { concernLabel, getActive, searchActives, type Active } from '@/lib/domain';
import styles from './BuyCheck.module.css';

export interface ActivePickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Shown in the list when nothing matches. */
  emptyState: ReactNode;
}

/**
 * Several actives through the single-select Combobox: each pick becomes a removable chip and the
 * field clears for the next one.
 */
export function ActivePicker({ value, onChange, emptyState }: ActivePickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [round, setRound] = useState(0);

  const items = useMemo(() => searchActives(query).filter((a) => !value.includes(a.id)), [query, value]);

  useEffect(() => {
    if (round > 0) document.getElementById(inputId)?.focus();
  }, [round, inputId]);

  const picked = value.map((id) => getActive(id)).filter((a): a is Active => Boolean(a));

  return (
    // The field is empty whenever it gets focus again, so the list starts from the full catalogue.
    <div className={styles.picker} onFocusCapture={() => setQuery('')}>
      <Combobox<Active>
        key={round}
        id={inputId}
        items={items}
        value={null}
        onChange={(a) => {
          if (!a) return;
          onChange([...value, a.id]);
          setQuery('');
          setRound((r) => r + 1);
        }}
        onQueryChange={setQuery}
        filter={() => true}
        getKey={(a) => a.id}
        getLabel={(a) => a.name}
        getDescription={(a) => (a.targets.length ? a.targets.map(concernLabel).join(', ') : a.prevention ? 'Sun protection' : undefined)}
        label="Active ingredients"
        placeholder="e.g. niacinamide or BHA"
        emptyState={emptyState}
      />
      {picked.length ? (
        <ul className={styles.pickedList} aria-label="Picked actives">
          {picked.map((a) => (
            <li key={a.id}>
              <span className={styles.activeChip}>
                {a.name}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${a.name}`}
                  onClick={() => onChange(value.filter((id) => id !== a.id))}
                >
                  <X size={14} strokeWidth={2.25} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
