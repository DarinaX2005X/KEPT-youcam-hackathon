'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, FileDown } from 'lucide-react';
import { Button, Skeleton, useToast } from '@/components/ui';
import { useTrialData } from '@/components/trial';
import { TrialMissing } from '@/components/checkin';
import { ReportSheet } from './ReportSheet';
import { summaryText } from './reportModel';
import styles from './Report.module.css';

/** A4 minus the 10 mm page margins, in CSS px. */
const PRINT_HEIGHT_PX = (277 / 25.4) * 96;
/** The sheet is drawn at print width on screens at least this wide, so its measured height is the printed height. */
const PRINT_WIDTH_PX = (190 / 25.4) * 96;

const PAGE_CSS = `
@page { size: A4; margin: 10mm; }
@media print { html, body { background: #fff !important; } }
`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export interface ReportPageProps {
  trialId: string;
}

/** /trial/[id]/report: the printable one-page report with «Download PDF» and «Copy summary». */
export function ReportPage({ trialId }: ReportPageProps) {
  const data = useTrialData(trialId);
  const toast = useToast();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const ready = data.status === 'ready' ? data : null;

  useEffect(() => {
    if (ready) document.title = `${ready.trial.product.name} report · Kept`;
  }, [ready]);

  // If a long product name or many areas push the page past one A4 sheet, print it slightly smaller.
  useLayoutEffect(() => {
    const el = sheetRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !ready) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const innerW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (Math.abs(innerW - PRINT_WIDTH_PX) > 2) return;
      const innerH = el.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setZoom(innerH > PRINT_HEIGHT_PX ? Math.floor((PRINT_HEIGHT_PX / innerH) * 1000) / 1000 : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  async function copySummary() {
    if (!ready) return;
    const ok = await copyText(summaryText(ready.trial, ready.scans, ready.verdict, ready.now));
    toast.show(ok ? { text: 'Summary copied', tone: 'better' } : { text: "Couldn't copy. Select the text in the report instead", tone: 'worse' });
  }

  if (data.status === 'missing' || data.status === 'error') {
    return (
      <main className={styles.main}>
        <TrialMissing error={data.status === 'error'} onRetry={() => void data.reload()} />
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <style>{PAGE_CSS}</style>
      <div className={styles.toolbar}>
        <Button variant="quiet" icon={ArrowLeft} href={`/trial/${encodeURIComponent(trialId)}`} className={styles.back}>
          Back to the trial
        </Button>
        <div className={styles.tools}>
          <Button variant="secondary" icon={Copy} onClick={() => void copySummary()} disabled={!ready}>
            Copy summary
          </Button>
          <Button icon={FileDown} onClick={() => window.print()} disabled={!ready}>
            Download PDF
          </Button>
        </div>
      </div>

      <div ref={sheetRef} className={styles.paper} style={{ ['--print-zoom' as string]: zoom }}>
        {ready ? (
          <ReportSheet trial={ready.trial} scans={ready.scans} verdict={ready.verdict} urls={ready.urls} now={ready.now} />
        ) : (
          <div className={styles.sheet} aria-busy="true" aria-label="Loading the report">
            <Skeleton width={120} height={28} radius="tag" />
            <Skeleton width="70%" height={36} radius="control" />
            <div className={styles.skeletonPrints}>
              <Skeleton aspect="3 / 4" radius="card" width="100%" />
              <Skeleton aspect="3 / 4" radius="card" width="100%" />
              <Skeleton aspect="3 / 4" radius="card" width="100%" />
            </div>
            <Skeleton width="100%" height={300} radius="card" />
          </div>
        )}
      </div>
      <p className={styles.hint}>Download PDF opens your browser&apos;s print dialog. Choose Save as PDF there.</p>
    </main>
  );
}
