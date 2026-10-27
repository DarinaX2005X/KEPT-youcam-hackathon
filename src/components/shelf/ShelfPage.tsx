'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Button, Segmented, useToast } from '@/components/ui';
import { deleteTrial, importSample } from '@/lib/store';
import { EmptyMark } from './EmptyMark';
import { isShelfTab, TABS, type ShelfTab } from './model';
import { ShelfRow } from './ShelfRow';
import { ShelfSkeletonRows } from './ShelfSkeleton';
import { useShelf, type ShelfItem } from './useShelf';
import styles from './ShelfPage.module.css';

const EASE = [0.2, 0.8, 0.2, 1] as const;

function readTab(): ShelfTab | null {
  if (typeof window === 'undefined') return null;
  const t = new URLSearchParams(window.location.search).get('tab');
  return isShelfTab(t) ? t : null;
}

function writeTab(tab: ShelfTab) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', url);
}

function EmptyShelf() {
  return (
    <section className={styles.empty} aria-labelledby="empty-shelf">
      <EmptyMark size={128} />
      <div className={styles.emptyText}>
        <h2 id="empty-shelf" className={styles.emptyTitle}>
          Your shelf is empty
        </h2>
        <p>Start a trial with the product you&apos;re using now, or look at a finished one.</p>
      </div>
      <div className={styles.emptyActions}>
        <Button href="/start" size="lg" icon={Plus}>
          Start a trial
        </Button>
        <Button href="/demo" size="lg" variant="secondary">
          See a finished trial
        </Button>
      </div>
    </section>
  );
}

const TAB_EMPTY: Record<ShelfTab, string> = {
  testing: 'Nothing in testing right now. Start a trial when you open a new product.',
  kept: 'Products you decide to keep after a trial will be here, with what they changed.',
  stopped: 'Products you stop will be here, so you remember what didn’t work for you.',
};

function EmptyTab({ tab, counts, onTab }: { tab: ShelfTab; counts: Record<ShelfTab, number>; onTab: (t: ShelfTab) => void }) {
  const testing = tab !== 'testing' && counts.testing > 0;
  return (
    <div className={styles.emptyTab}>
      <p>{TAB_EMPTY[tab]}</p>
      {testing ? (
        <Button variant="secondary" onClick={() => onTab('testing')}>
          See what you&apos;re testing
        </Button>
      ) : (
        <Button href="/start" variant="secondary" icon={Plus}>
          Start a trial
        </Button>
      )}
    </div>
  );
}

function Rows({ items, tab }: { items: ShelfItem[]; tab: ShelfTab }) {
  const reduce = useReducedMotion();
  return (
    <ul className={styles.list} key={tab}>
      {items.map((item, i) => (
        <motion.li
          key={item.trial.id}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE, delay: i * 0.05 }}
        >
          <ShelfRow item={item} index={i} />
        </motion.li>
      ))}
    </ul>
  );
}

export function ShelfPage() {
  const shelf = useShelf();
  const toast = useToast();
  const [picked, setPicked] = useState<ShelfTab | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setPicked(readTab());
  }, []);

  const items = useMemo(() => (shelf.status === 'ready' ? shelf.items : []), [shelf]);
  const counts = useMemo(() => {
    const c: Record<ShelfTab, number> = { testing: 0, kept: 0, stopped: 0 };
    for (const it of items) c[it.tab] += 1;
    return c;
  }, [items]);

  const tab: ShelfTab = picked ?? TABS.find((t) => counts[t.value] > 0)?.value ?? 'testing';
  const visible = items.filter((it) => it.tab === tab);
  const samples = items.filter((it) => it.trial.sample);

  function chooseTab(t: ShelfTab) {
    setPicked(t);
    writeTab(t);
  }

  async function removeSamples() {
    setRemoving(true);
    try {
      await Promise.all(samples.map((s) => deleteTrial(s.trial.id)));
      await shelf.reload();
      toast.show({
        text: 'Sample trials removed',
        action: {
          label: 'Bring back',
          onAction: () => {
            void importSample().then(() => shelf.reload());
          },
        },
        duration: 6000,
      });
    } catch {
      toast.show({ text: "Couldn't remove the samples. Try again", tone: 'worse' });
    } finally {
      setRemoving(false);
    }
  }

  const ready = shelf.status === 'ready';
  const empty = ready && items.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Your shelf</h1>
        {empty ? null : (
          <Button href="/start" variant="secondary" icon={Plus} className={styles.headCta}>
            Start a trial
          </Button>
        )}
      </header>

      {shelf.status === 'loading' ? (
        <div className={styles.body} aria-busy="true">
          <span className="visually-hidden" role="status">
            Loading your shelf
          </span>
          <div className={styles.tabsSkeleton} />
          <ShelfSkeletonRows />
        </div>
      ) : null}

      {shelf.status === 'error' ? (
        <div className={styles.emptyTab} role="alert">
          <p>Couldn&apos;t read your shelf from this browser. Refresh the page to try again.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      ) : null}

      {empty ? <EmptyShelf /> : null}

      {ready && !empty ? (
        <div className={styles.body}>
          {samples.length ? (
            <div className={styles.sampleBar}>
              <p>These are sample trials. Your own trials appear here too.</p>
              <Button variant="quiet" onClick={removeSamples} loading={removing} className={styles.sampleButton}>
                Remove samples
              </Button>
            </div>
          ) : null}

          <Segmented
            aria-label="Trials by status"
            value={tab}
            onChange={chooseTab}
            className={styles.tabs}
            options={TABS.map((t) => ({
              value: t.value,
              label: (
                <>
                  {t.label}
                  <span className={`${styles.count} num`}>{counts[t.value]}</span>
                </>
              ),
            }))}
          />

          {visible.length ? <Rows items={visible} tab={tab} /> : <EmptyTab tab={tab} counts={counts} onTab={chooseTab} />}
        </div>
      ) : null}
    </main>
  );
}
