'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { deleteTrial, getTrial, importSample, listTrials, loadManifest } from '@/lib/store';
import type { DemoManifest } from '@/lib/domain';
import { ShelfSkeletonRows } from './ShelfSkeleton';
import styles from './ShelfPage.module.css';

/**
 * Finds the new id of the manifest's hero trial. importSample returns ids in manifest order, but
 * when samples were already here it returns whatever is left of them, so the name is checked too.
 */
async function heroId(manifest: DemoManifest, ids: string[]): Promise<string | undefined> {
  const index = manifest.trials.findIndex((t) => t.trial.id === manifest.hero.trialId);
  if (index < 0) return ids[0];
  const name = manifest.trials[index].trial.product.name;
  const byIndex = ids[index] ? await getTrial(ids[index]) : undefined;
  if (byIndex?.product.name === name) return byIndex.id;
  const match = (await listTrials()).find((t) => t.sample && t.product.name === name);
  return match?.id;
}

async function openSample(): Promise<string> {
  const manifest = await loadManifest();
  let id = await heroId(manifest, await importSample());
  if (!id) {
    // Some samples were removed one by one: put the whole sample shelf back.
    const stale = (await listTrials()).filter((t) => t.sample);
    await Promise.all(stale.map((t) => deleteTrial(t.id)));
    id = await heroId(manifest, await importSample());
  }
  if (!id) throw new Error('The sample trial is missing from the manifest');
  return id;
}

/** /demo: copies the sample shelf into this browser and opens the finished salicylic trial. */
export function DemoLoader() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    openSample().then(
      (id) => alive && router.replace(`/trial/${id}`),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{failed ? 'Sample trials' : 'Opening a finished trial'}</h1>
      </header>
      {failed ? (
        <div className={styles.emptyTab} role="alert">
          <p>Couldn&apos;t load the sample trials. Refresh the page to try again.</p>
          <Button variant="secondary" icon={RotateCw} onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      ) : (
        <div className={styles.body} aria-busy="true">
          <span className="visually-hidden" role="status">
            Copying the sample trials to this browser
          </span>
          <div className={styles.tabsSkeleton} />
          <ShelfSkeletonRows />
        </div>
      )}
    </main>
  );
}
