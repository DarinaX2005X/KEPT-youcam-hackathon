'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, ClipboardList, Search } from 'lucide-react';
import { Button, Segmented, Tag, Textarea, TextField } from '@/components/ui';
import { buyCheck, getActive, parseInci, type BuyCheckResult, type ParsedInci } from '@/lib/domain';
import { MiniPrint, useShelf, type ShelfItem } from '@/components/shelf';
import { ActivePicker } from './ActivePicker';
import { BuyCheckReport } from './BuyCheckReport';
import styles from './BuyCheck.module.css';

type Mode = 'paste' | 'pick';

const EXAMPLE_INCI = 'Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Tamarindus Indica Seed Gum, Sodium Hyaluronate, Phenoxyethanol';

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return out;
}

function sameWord(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Live preview under the pasted list: which tokens matched which active. */
function FoundPreview({ parsed, onPick }: { parsed: ParsedInci; onPick: () => void }) {
  if (!parsed.actives.length) {
    return (
      <p className={styles.previewNone}>
        We didn&apos;t find active ingredients we can track.{' '}
        <button type="button" className={styles.inlineLink} onClick={onPick}>
          You can still pick them by hand
        </button>
      </p>
    );
  }
  const seen = new Set<string>();
  const rows = parsed.matched.filter((m) => (seen.has(m.activeId) ? false : (seen.add(m.activeId), true)));
  return (
    <div className={styles.preview} aria-live="polite">
      <span className={styles.smallHead}>Found {rows.length === 1 ? '1 active' : `${rows.length} actives`}</span>
      <ul className={styles.pickedList}>
        {rows.map((m) => {
          const a = getActive(m.activeId);
          if (!a) return null;
          return (
            <li key={m.activeId} className={styles.activeChip}>
              {sameWord(m.token, a.name) ? (
                a.name
              ) : (
                <>
                  <span className={styles.token}>{m.token}</span>
                  <span aria-hidden>→</span>
                  <span className="visually-hidden">matched</span>
                  {a.name}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What the check will be compared with, shown until there is a result. */
function ShelfContext({ items, loading }: { items: ShelfItem[]; loading: boolean }) {
  if (loading) return null;
  if (!items.length) {
    return (
      <section className={styles.context} aria-labelledby="ctx-head">
        <h2 id="ctx-head" className={styles.contextHead}>
          Checked against the ingredients only
        </h2>
        <p className={styles.contextText}>
          Your shelf is empty, so Kept can only read the list itself. Once you have tested products, it also checks what worked for you and what didn&apos;t.
        </p>
        <Link href="/demo" className={styles.inlineLink}>
          See a finished trial
        </Link>
      </section>
    );
  }
  // Decided trials are the evidence a check leans on, so they come first; testing ones follow.
  const decided = (it: ShelfItem) => it.trial.status === 'kept' || it.trial.status === 'stopped';
  const ordered = [...items.filter(decided), ...items.filter((it) => !decided(it))];
  return (
    <section className={styles.context} aria-labelledby="ctx-head">
      <h2 id="ctx-head" className={styles.contextHead}>
        Checked against your shelf
      </h2>
      <ul className={styles.contextList}>
        {ordered.slice(0, 5).map((it, i) => (
          <li key={it.trial.id} className={styles.contextRow}>
            <MiniPrint src={it.thumb} size="sm" tilt={i % 2 ? 1.5 : -1.5} />
            <span className={styles.contextName}>
              <span className={styles.contextProduct}>{it.trial.product.name}</span>
              <span className={styles.contextMeta}>{it.verdict ? it.verdict.headline : it.prevention ? 'Daily protection' : 'No photos yet'}</span>
            </span>
            <Tag status={it.trial.status} />
          </li>
        ))}
      </ul>
      {items.length > 5 ? (
        <Link href="/shelf" className={styles.inlineLink}>
          {`and ${items.length - 5} more on your shelf`}
        </Link>
      ) : null}
    </section>
  );
}

interface Checked {
  result: BuyCheckResult;
  name: string;
  tokens: Record<string, string>;
}

export function BuyCheckPage() {
  const shelf = useShelf();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('paste');
  const [inci, setInci] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const reportRef = useRef<HTMLElement>(null);
  const scrollNext = useRef(false);

  const debounced = useDebounced(inci, 300);
  const parsed = debounced.trim() ? parseInci(debounced) : null;

  const items = shelf.status === 'ready' ? shelf.items : [];

  useEffect(() => {
    if (!checked || !scrollNext.current) return;
    scrollNext.current = false;
    const el = reportRef.current;
    if (!el) return;
    const below = el.getBoundingClientRect().top > window.innerHeight * 0.6;
    if (below) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    el.focus({ preventScroll: true });
  }, [checked]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (shelf.status === 'loading') return;
    const input = mode === 'paste' ? { inci } : { activeIds: picked };
    if (mode === 'paste' && !inci.trim()) {
      setError('Paste the ingredient list first');
      return;
    }
    if (mode === 'pick' && !picked.length) {
      setError('Pick at least one active ingredient');
      return;
    }
    setError(null);
    const trials = items.map((it) => it.trial);
    const scansByTrial = shelf.status === 'ready' ? shelf.scansByTrial : {};
    const result = buyCheck(input, trials, scansByTrial, new Date());
    const tokens: Record<string, string> = {};
    if (mode === 'paste') for (const m of parseInci(inci).matched) tokens[m.activeId] ??= m.token;
    scrollNext.current = true;
    setChecked({ result, name, tokens });
  }

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Thinking about a new product?</h1>
        <p className={styles.lead}>Paste its ingredients. Kept checks them against your skin and the products you&apos;ve already tested.</p>
      </header>

      <div className={styles.layout}>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <TextField label="Product name" hint="Optional. It carries over if you start a trial" placeholder="e.g. 10% niacinamide toner" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />

          <div className={styles.modeBlock}>
            <Segmented<Mode>
              aria-label="How to enter ingredients"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              block
              options={[
                { value: 'paste', label: 'Paste ingredient list' },
                { value: 'pick', label: 'Pick actives' },
              ]}
            />

            {mode === 'paste' ? (
              <div className={styles.pasteBlock}>
                <Textarea
                  label="Ingredient list"
                  placeholder="Paste the INCI list from the box or product page"
                  rows={5}
                  value={inci}
                  onChange={(e) => {
                    setInci(e.target.value);
                    if (error) setError(null);
                  }}
                  error={error ?? undefined}
                />
                {parsed ? (
                  <FoundPreview parsed={parsed} onPick={() => setMode('pick')} />
                ) : inci.trim() ? null : (
                  <button type="button" className={clsx(styles.inlineLink, styles.example)} onClick={() => setInci(EXAMPLE_INCI)}>
                    <ClipboardList size={16} strokeWidth={1.75} aria-hidden />
                    Try an example list
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.pasteBlock}>
                <ActivePicker
                  value={picked}
                  onChange={(ids) => {
                    setPicked(ids);
                    if (error) setError(null);
                  }}
                  emptyState={
                    <span>
                      No active found.{' '}
                      <button type="button" className={styles.inlineLink} onClick={() => setMode('paste')}>
                        Paste the ingredient list instead
                      </button>
                    </span>
                  }
                />
                {error ? (
                  <p className={styles.formError} role="alert">
                    <CircleAlert size={16} strokeWidth={1.75} aria-hidden />
                    {error}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <Button type="submit" size="lg" icon={Search} loading={shelf.status === 'loading'} className={styles.submit}>
            Check ingredients
          </Button>
        </form>

        <div className={styles.side}>
          {checked ? (
            <BuyCheckReport key={JSON.stringify(checked.result)} ref={reportRef} result={checked.result} name={checked.name} tokens={checked.tokens} shelf={items} />
          ) : (
            <ShelfContext items={items} loading={shelf.status === 'loading'} />
          )}
        </div>
      </div>
    </main>
  );
}
