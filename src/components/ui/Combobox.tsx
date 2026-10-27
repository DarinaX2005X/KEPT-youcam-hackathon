'use client';

import clsx from 'clsx';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Search, X } from 'lucide-react';
import styles from './Combobox.module.css';

export interface ComboboxProps<T> {
  items: readonly T[];
  value: T | null;
  onChange: (item: T | null) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  /** Second line under the label, for example aliases or a note. */
  getDescription?: (item: T) => ReactNode;
  /** Custom match; defaults to a case-insensitive match on the label, word starts first. */
  filter?: (item: T, query: string) => boolean;
  label: ReactNode;
  placeholder?: string;
  /** Shown inside the panel when nothing matches the query. */
  emptyState: ReactNode;
  onQueryChange?: (query: string) => void;
  /** Cap on rendered rows. */
  limit?: number;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function defaultScore(label: string, q: string): number {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  const i = l.indexOf(q);
  if (i < 0) return -1;
  return /[\s(/-]/.test(l[i - 1] ?? '') ? 1 : 2;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className={styles.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Searchable single-select. Arrow keys move, Enter picks, Escape closes. No native select underneath. */
export function Combobox<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getDescription,
  filter,
  label,
  placeholder,
  emptyState,
  onQueryChange,
  limit = 50,
  hint,
  disabled,
  className,
  id,
}: ComboboxProps<T>) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const optionId = (i: number) => `${autoId}-opt-${i}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? getLabel(value) : '');
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);

  // Keep the input in sync when the value changes from outside.
  const valueKey = value ? getKey(value) : null;
  const [syncedKey, setSyncedKey] = useState(valueKey);
  if (syncedKey !== valueKey) {
    setSyncedKey(valueKey);
    setText(value ? getLabel(value) : '');
    setTyped(false);
  }

  const query = typed ? text.trim() : '';

  const results = useMemo(() => {
    if (!query) return items.slice(0, limit);
    const q = query.toLowerCase();
    if (filter) return items.filter((it) => filter(it, query)).slice(0, limit);
    return items
      .map((it) => ({ it, s: defaultScore(getLabel(it), q) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map((r) => r.it)
      .slice(0, limit);
  }, [items, query, filter, getLabel, limit]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  });

  // Keep the active row in view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function openList() {
    if (disabled) return;
    if (!open) {
      const selectedIndex = value && !typed ? results.findIndex((r) => getKey(r) === getKey(value)) : -1;
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTyped(false);
    setText(value ? getLabel(value) : '');
  }

  function pick(item: T) {
    onChange(item);
    setText(getLabel(item));
    setTyped(false);
    setOpen(false);
    onQueryChange?.('');
  }

  function clear() {
    onChange(null);
    setText('');
    setTyped(false);
    onQueryChange?.('');
    inputRef.current?.focus();
    setOpen(true);
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => (results.length ? (Math.min(a, results.length - 1) + 1) % results.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => (results.length ? (Math.min(a, results.length - 1) - 1 + results.length) % results.length : 0));
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(Math.max(results.length - 1, 0));
        }
        break;
      case 'Enter':
        if (open && results[activeIndex]) {
          e.preventDefault();
          pick(results[activeIndex]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        } else if (text) {
          e.preventDefault();
          clear();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) close();
        break;
    }
  }

  const showList = open && !disabled;

  return (
    <div ref={rootRef} className={clsx(styles.root, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.anchor}>
      <div className={clsx(styles.control, disabled && styles.disabled)}>
        <Search size={18} strokeWidth={1.75} aria-hidden className={styles.searchIcon} />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results.length ? optionId(activeIndex) : undefined}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          className={styles.input}
          onChange={(e) => {
            setText(e.target.value);
            setTyped(true);
            setActive(0);
            setOpen(true);
            onQueryChange?.(e.target.value);
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
        />
        {text ? (
          <button type="button" className={styles.clear} aria-label="Clear" tabIndex={-1} onClick={clear}>
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {showList ? (
          <motion.div
            className={styles.panel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ul ref={listRef} id={listId} role="listbox" aria-label={typeof label === 'string' ? label : undefined} className={styles.list}>
              {results.map((item, i) => {
                const selected = value ? getKey(value) === getKey(item) : false;
                const desc = getDescription?.(item);
                return (
                  <li
                    key={getKey(item)}
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    data-active={i === activeIndex || undefined}
                    className={styles.option}
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerMove={() => i !== activeIndex && setActive(i)}
                    onClick={() => pick(item)}
                  >
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>
                        <Highlight text={getLabel(item)} query={query} />
                      </span>
                      {desc ? <span className={styles.optionDesc}>{desc}</span> : null}
                    </span>
                    {selected ? <Check size={18} strokeWidth={2} aria-hidden className={styles.check} /> : null}
                  </li>
                );
              })}
            </ul>
            {results.length === 0 ? <div className={styles.empty}>{emptyState}</div> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
      {hint ? (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
