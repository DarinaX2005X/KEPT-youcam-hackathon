'use client';

import clsx from 'clsx';
import { useEffect, useId, useMemo, useRef, useState, type Dispatch } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Button, Combobox, Segmented, Textarea, TextField } from '@/components/ui';
import { concernLabel, getActive, parseInci, searchActives, type Active } from '@/lib/domain';
import { selectedIds, type Action, type EntryMode, type WizardState } from './state';
import { TrialSheet } from './TrialSheet';
import layout from './Wizard.module.css';
import styles from './ProductStep.module.css';

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return out;
}

/** The token as it was written in the pasted list, so "Salicylic Acid" keeps its capitals. */
function originalToken(inci: string, token: string): string {
  const i = inci.toLowerCase().indexOf(token);
  return i < 0 ? token : inci.slice(i, i + token.length);
}

interface Row {
  active: Active;
  /** Pasted spelling when it differs from the active's name. */
  token?: string;
}

function ActiveRows({ rows, onRemove }: { rows: Row[]; onRemove: (id: string) => void }) {
  if (!rows.length) return null;
  return (
    <ul className={styles.rows} aria-label="Active ingredients in this product">
      {rows.map(({ active, token }, i) => (
        <li key={active.id} className={styles.row} style={{ animationDelay: `${i * 50}ms` }}>
          <span className={styles.chip}>
            {token ? (
              <>
                <span className={styles.token}>{token}</span>
                <ArrowRight size={14} strokeWidth={2} aria-hidden className={styles.arrow} />
                <span className="visually-hidden">matched</span>
              </>
            ) : null}
            <span className={styles.name}>{active.name}</span>
            <button type="button" className={styles.remove} aria-label={`Remove ${active.name}`} onClick={() => onRemove(active.id)}>
              <X size={14} strokeWidth={2.25} aria-hidden />
            </button>
          </span>
          <span className={styles.note}>{active.note}</span>
        </li>
      ))}
    </ul>
  );
}

function ActiveSearch({ picked, onPick, onPaste }: { picked: string[]; onPick: (id: string) => void; onPaste: () => void }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [round, setRound] = useState(0);
  // Picking by keyboard keeps focus in the field for the next active; a click lets the list close.
  const byKeyboard = useRef(false);
  const items = useMemo(() => searchActives(query).filter((a) => !picked.includes(a.id)), [query, picked]);

  useEffect(() => {
    if (round > 0 && byKeyboard.current) document.getElementById(inputId)?.focus();
  }, [round, inputId]);

  return (
    <div
      onFocusCapture={() => setQuery('')}
      onKeyDownCapture={() => (byKeyboard.current = true)}
      onPointerDownCapture={() => (byKeyboard.current = false)}
    >
      <Combobox<Active>
        key={round}
        id={inputId}
        items={items}
        value={null}
        onChange={(a) => {
          if (!a) return;
          onPick(a.id);
          setQuery('');
          setRound((r) => r + 1);
        }}
        onQueryChange={setQuery}
        filter={() => true}
        getKey={(a) => a.id}
        getLabel={(a) => a.name}
        getDescription={(a) => (a.targets.length ? a.targets.map(concernLabel).join(', ') : a.prevention ? 'Sun protection' : undefined)}
        label="Active ingredients"
        placeholder="Search, e.g. retinal or BHA"
        emptyState={
          <span className={styles.empty}>
            No active found.{' '}
            <button type="button" className={styles.inlineLink} onClick={onPaste}>
              Paste the ingredient list instead
            </button>
          </span>
        }
      />
    </div>
  );
}

export interface ProductStepProps {
  state: WizardState;
  dispatch: Dispatch<Action>;
  onContinue: () => void;
}

export function ProductStep({ state, dispatch, onContinue }: ProductStepProps) {
  const debouncedInci = useDebounced(state.inci, 300);
  const ids = selectedIds(state);
  const ready = state.name.trim().length > 0 && ids.length > 0;

  const rows: Row[] = useMemo(() => {
    if (state.mode === 'pick') {
      return state.picked.map((id) => getActive(id)).filter((a): a is Active => !!a).map((active) => ({ active }));
    }
    const parsed = parseInci(debouncedInci);
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const m of parsed.matched) {
      if (seen.has(m.activeId) || state.excluded.includes(m.activeId)) continue;
      seen.add(m.activeId);
      const active = getActive(m.activeId);
      if (!active) continue;
      const written = originalToken(debouncedInci, m.token);
      out.push({ active, token: written.toLowerCase() === active.name.toLowerCase() ? undefined : written });
    }
    return out;
  }, [state.mode, state.picked, state.excluded, debouncedInci]);

  const pastedNothing = state.mode === 'paste' && debouncedInci.trim().length > 0 && rows.length === 0;

  function remove(id: string) {
    if (state.mode === 'pick') dispatch({ type: 'picked', value: state.picked.filter((x) => x !== id) });
    else dispatch({ type: 'exclude', id });
  }

  const missing = !state.name.trim() ? (ids.length ? 'Add the product name to continue' : 'Add the product name and its actives to continue') : 'Add at least one active ingredient to continue';

  return (
    <div className={layout.split}>
      <form
        className={layout.main}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onContinue();
        }}
        noValidate
      >
        <h1 className={layout.title}>What did you start using?</h1>

        <div className={styles.fields}>
          <TextField
            label="Product name"
            placeholder="e.g. 2% salicylic acid serum"
            value={state.name}
            onChange={(e) => dispatch({ type: 'name', value: e.target.value })}
            autoComplete="off"
            maxLength={80}
          />

          <div className={styles.entry}>
            <Segmented<EntryMode>
              aria-label="How to add the ingredients"
              value={state.mode}
              onChange={(m) => dispatch({ type: 'mode', value: m })}
              block
              options={[
                { value: 'pick', label: 'Pick active ingredients' },
                { value: 'paste', label: 'Paste ingredient list' },
              ]}
            />

            {state.mode === 'pick' ? (
              <ActiveSearch
                picked={state.picked}
                onPick={(id) => dispatch({ type: 'picked', value: [...state.picked, id] })}
                onPaste={() => dispatch({ type: 'mode', value: 'paste' })}
              />
            ) : (
              <Textarea
                label="Ingredient list"
                placeholder="Paste the INCI list from the box or product page"
                value={state.inci}
                onChange={(e) => dispatch({ type: 'inci', value: e.target.value })}
                rows={4}
                maxHeight={220}
                spellCheck={false}
              />
            )}

            {pastedNothing ? (
              <p className={styles.none} role="status">
                We didn&apos;t find active ingredients we can track.{' '}
                <button type="button" className={styles.inlineLink} onClick={() => dispatch({ type: 'mode', value: 'pick' })}>
                  You can still pick them by hand
                </button>
              </p>
            ) : null}

            <div aria-live="polite">
              <ActiveRows rows={rows} onRemove={remove} />
            </div>
          </div>
        </div>

        <div className={layout.actions}>
          <Button type="submit" size="lg" disabled={!ready} className={layout.primary}>
            Continue
          </Button>
          {!ready ? <p className={clsx(layout.actionNote)}>{missing}</p> : null}
        </div>
      </form>

      <aside className={clsx(layout.aside, layout.hideMobile)} aria-label="Your trial so far">
        <TrialSheet name={state.name} activeIds={ids} />
      </aside>
    </div>
  );
}
