'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Camera, CalendarPlus, Download, Pause, ScanFace, Settings2, Trash2 } from 'lucide-react';
import {
  Button,
  Chip,
  Combobox,
  CompareSlider,
  IconButton,
  MaskLayer,
  PhotoPrint,
  Segmented,
  Sheet,
  Skeleton,
  StepProgress,
  Tag,
  TextField,
  Textarea,
  ToastProvider,
  useToast,
  type Tone,
} from '@/components/ui';
import styles from './showcase.module.css';

const COLORS: { name: string; hex: string; ink?: boolean }[] = [
  { name: 'field', hex: '#F8F4EF' },
  { name: 'surface', hex: '#FDFBF8' },
  { name: 'sunk', hex: '#EFE9E1' },
  { name: 'line', hex: '#E3DBD1' },
  { name: 'ink', hex: '#17221D', ink: true },
  { name: 'ink-soft', hex: '#4F5B55', ink: true },
  { name: 'brand', hex: '#1F5A47', ink: true },
  { name: 'brand-hover', hex: '#184A3A', ink: true },
  { name: 'on-brand', hex: '#FDFBF8' },
  { name: 'better', hex: '#1F6B4F', ink: true },
  { name: 'better-bg', hex: '#DCEFE5' },
  { name: 'worse', hex: '#B4493A', ink: true },
  { name: 'worse-bg', hex: '#F6E0DA' },
  { name: 'reacting', hex: '#9A5B12', ink: true },
  { name: 'reacting-bg', hex: '#F7E7CF' },
  { name: 'flat', hex: '#5A6470', ink: true },
  { name: 'flat-bg', hex: '#E7E9EC' },
  { name: 'mask-tint', hex: '#E0563F', ink: true },
];

const TYPE = [
  { size: 72, weight: 700, text: 'Is it working' },
  { size: 44, weight: 700, text: 'Working after 28 days' },
  { size: 30, weight: 700, text: '2% salicylic acid serum' },
  { size: 22, weight: 600, text: 'Blemishes 23 → 11 on the acne map' },
  { size: 17, weight: 400, text: 'Kept photographs your skin the same way at every check-in and measures it with YouCam Skin AI.' },
  { size: 15, weight: 500, text: 'Next check-in on Nov 12. Take it in the same spot as day 0.' },
  { size: 13, weight: 600, text: 'Day 28 of 56, redness 62 → 80' },
];

interface DemoActive {
  id: string;
  name: string;
  aliases: string;
}

const ACTIVES: DemoActive[] = [
  { id: 'salicylic', name: 'Salicylic acid (BHA)', aliases: 'salicylic acid, betaine salicylate, willow bark extract' },
  { id: 'bpo', name: 'Benzoyl peroxide', aliases: 'benzoyl peroxide' },
  { id: 'adapalene', name: 'Adapalene', aliases: 'adapalene' },
  { id: 'retinol', name: 'Retinol', aliases: 'retinol' },
  { id: 'retinal', name: 'Retinal', aliases: 'retinal, retinaldehyde' },
  { id: 'gentle-retinoids', name: 'Gentle retinoids', aliases: 'hydroxypinacolone retinoate, retinyl palmitate, bakuchiol' },
  { id: 'glycolic', name: 'Glycolic acid', aliases: 'glycolic acid' },
  { id: 'lactic', name: 'Lactic and mandelic acid', aliases: 'lactic acid, mandelic acid, gluconolactone' },
  { id: 'azelaic', name: 'Azelaic acid', aliases: 'azelaic acid, potassium azeloyl diglycinate' },
  { id: 'niacinamide', name: 'Niacinamide', aliases: 'niacinamide' },
  { id: 'vitamin-c', name: 'Vitamin C', aliases: 'ascorbic acid, sodium ascorbyl phosphate, ethyl ascorbic acid' },
  { id: 'tranexamic', name: 'Tranexamic acid and arbutin', aliases: 'tranexamic acid, alpha-arbutin, kojic acid' },
  { id: 'barrier', name: 'Barrier and hydration', aliases: 'ceramide np, sodium hyaluronate, squalane, panthenol' },
  { id: 'soothing', name: 'Soothing botanicals', aliases: 'centella asiatica extract, madecassoside, allantoin' },
  { id: 'peptides', name: 'Peptides', aliases: 'palmitoyl tripeptide-1, acetyl hexapeptide-8, copper tripeptide-1' },
];

const STEPS = [
  { id: 'upload', label: 'Uploading photo' },
  { id: 'analyze', label: 'Analyzing skin' },
  { id: 'maps', label: 'Saving maps' },
];

const STATES = ['rest', 'hover', 'pressed', 'focus', 'disabled', 'loading'] as const;

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        {note ? <div className={styles.sectionNote}>{note}</div> : null}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Specimen({ caption, children, wide }: { caption: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? `${styles.specimen} ${styles.specimenWide}` : styles.specimen}>
      <div className={styles.specimenStage}>{children}</div>
      <p className={styles.caption}>{caption}</p>
    </div>
  );
}

function FontReadout() {
  const [info, setInfo] = useState<{ family: string; faces: string } | null>(null);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (!alive) return;
      const family = getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      const weights = new Set<string>();
      document.fonts.forEach((f) => {
        if (f.status === 'loaded' && /onest/i.test(f.family) && !/fallback/i.test(f.family)) weights.add(f.weight);
      });
      setInfo({ family, faces: Array.from(weights).sort().join(', ') });
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <p className={styles.fontReadout} aria-live="polite">
      {info ? (
        <>
          Body renders in <strong>{info.family}</strong>
          {info.faces ? <>, loaded weights {info.faces}</> : <>, no Onest face loaded yet</>}
        </>
      ) : (
        'Checking the loaded font'
      )}
    </p>
  );
}

function ToastButtons({ where }: { where: string }) {
  const toast = useToast();
  return (
    <div className={styles.row}>
      <Button
        variant="secondary"
        icon={Trash2}
        onClick={() =>
          toast.show({
            text: 'Check-in on day 14 deleted',
            action: { onAction: () => toast.show({ text: 'Check-in restored', tone: 'better' }) },
          })
        }
      >
        Delete check-in {where}
      </Button>
      <Button variant="quiet" onClick={() => toast.show({ text: 'Photo too dark. Face a window or a lamp', tone: 'worse' })}>
        Show an error
      </Button>
    </div>
  );
}

export function Showcase() {
  const [chips, setChips] = useState<Record<string, boolean>>({ acne: true, redness: false, pores: false, texture: false });
  const [seg2, setSeg2] = useState<'search' | 'paste'>('search');
  const [seg3, setSeg3] = useState<'testing' | 'kept' | 'stopped'>('testing');
  const [seg4, setSeg4] = useState<'0' | '28' | '56' | 'target'>('28');
  const [active, setActive] = useState<DemoActive | null>(null);
  const [notes, setNotes] = useState('Aqua, Niacinamide, Pentylene Glycol, Zinc PCA, Salicylic Acid, Sodium Hyaluronate');
  const [product, setProduct] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [stepStatus, setStepStatus] = useState<'running' | 'done' | 'error'>('running');
  const [mask, setMask] = useState<'acne' | 'redness' | 'none'>('acne');
  const [compare, setCompare] = useState(50);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const tones: { key: string; label: string; tone: Tone; count?: number }[] = [
    { key: 'acne', label: 'Acne', tone: 'better', count: 11 },
    { key: 'redness', label: 'Redness', tone: 'worse' },
    { key: 'pores', label: 'Pores', tone: 'flat' },
    { key: 'texture', label: 'Hydration', tone: 'reacting' },
  ];

  const maskUrl = mask === 'acne' ? '/brand/dev/m_acne.png' : mask === 'redness' ? '/brand/dev/m_redness.png' : null;

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.h1}>Interface kit</h1>
        <p className={styles.lead}>Every shared control in its real states. Build screens from these parts and tokens only.</p>
      </header>

      <Section id="colour" title="Colour" note="Tokens from globals.css. Text pairs pass WCAG AA on Field and Surface.">
        <div className={styles.swatches}>
          {COLORS.map((c) => (
            <div key={c.name} className={styles.swatch}>
              <span className={styles.chipColor} style={{ background: `var(--${c.name})` }} />
              <span className={styles.swatchName}>--{c.name}</span>
              <span className={`${styles.swatchHex} num`}>{c.hex}</span>
            </div>
          ))}
          <div className={styles.swatch}>
            <span className={styles.chipColor} style={{ background: 'var(--sheen)' }} />
            <span className={styles.swatchName}>--sheen</span>
            <span className={`${styles.swatchHex} num`}>#F4CDB8 #C9E6D6 #D6D9F0</span>
          </div>
        </div>
      </Section>

      <Section id="type" title="Type" note={<FontReadout />}>
        <ol className={styles.typeList}>
          {TYPE.map((t) => (
            <li key={t.size} className={styles.typeRow}>
              <span className={`${styles.typeMeta} num`}>
                {t.size}/{t.weight}
              </span>
              <span
                className={styles.typeSample}
                style={{
                  fontSize: `var(--t-${t.size})`,
                  fontWeight: t.weight,
                  letterSpacing: t.size >= 30 ? 'var(--track-display)' : t.size === 22 ? '-0.015em' : undefined,
                  lineHeight: t.size >= 30 ? 'var(--lh-display)' : 1.45,
                }}
              >
                {t.text}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="depth" title="Radius and depth" note="Light from the top left. Objects get the print shadow; working panels stay flat.">
        <div className={styles.depthRow}>
          {[
            { r: 'panel', s: 'none', label: 'Panel 28, flat' },
            { r: 'card', s: 'print', label: 'Card 20, print' },
            { r: 'control', s: 'rest', label: 'Control 14, rest' },
            { r: 'chip', s: 'raised', label: 'Chip 10, raised' },
            { r: 'tag', s: 'overlay', label: 'Tag 6, overlay' },
          ].map((d) => (
            <div key={d.r} className={styles.depthItem}>
              <span
                className={styles.depthBox}
                style={{
                  borderRadius: `var(--r-${d.r})`,
                  boxShadow: d.s === 'none' ? 'none' : `var(--shadow-${d.s})`,
                  border: d.s === 'none' ? '1px solid var(--line)' : undefined,
                }}
              />
              <span className={styles.caption}>{d.label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons" note="Hover lifts 2 px, press scales to 0.97, loading keeps the width.">
        <div className={styles.stateGrid}>
          {(['primary', 'secondary', 'quiet'] as const).map((variant) => (
            <div key={variant} className={styles.stateRow}>
              <p className={styles.rowLabel}>{variant}</p>
              <div className={styles.stateCells}>
                {STATES.map((s) => (
                  <Specimen key={s} caption={s}>
                    <Button
                      variant={variant}
                      disabled={s === 'disabled'}
                      loading={s === 'loading'}
                      data-demo-state={s === 'hover' || s === 'pressed' || s === 'focus' ? s : undefined}
                    >
                      Add photo
                    </Button>
                  </Specimen>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.row}>
          <Button size="lg" icon={Camera}>
            Take baseline photo
          </Button>
          <Button size="lg" variant="secondary" icon={CalendarPlus}>
            Add to calendar
          </Button>
          <Button
            size="lg"
            variant="secondary"
            icon={Download}
            loading={loadingDemo}
            onClick={() => {
              setLoadingDemo(true);
              window.setTimeout(() => setLoadingDemo(false), 1600);
            }}
          >
            Download report
          </Button>
          <Button size="lg" variant="quiet">
            See a finished trial
          </Button>
        </div>
        <div className={styles.row}>
          <IconButton icon={Settings2} label="Trial settings" />
          <IconButton icon={Pause} label="Pause trial" variant="secondary" />
          <IconButton icon={ScanFace} label="Run check-in" variant="primary" />
          <IconButton icon={Trash2} label="Delete trial" variant="secondary" disabled />
        </div>
      </Section>

      <Section id="chips" title="Chips, segments, tags" note="A tone adds its own glyph and a spoken word, so colour is never the only signal.">
        <div className={styles.stack}>
          <div className={styles.row} role="group" aria-label="Zones on the photo">
            {tones.map((t) => (
              <Chip key={t.key} tone={t.tone} count={t.count} selected={chips[t.key]} onClick={() => setChips((c) => ({ ...c, [t.key]: !c[t.key] }))}>
                {t.label}
              </Chip>
            ))}
            <Chip disabled>Firmness</Chip>
          </div>
          <div className={styles.row}>
            <Chip>Unselected</Chip>
            <Chip selected>Selected</Chip>
            <Chip count={3}>With count</Chip>
            <Chip selected count={3}>
              Selected with count
            </Chip>
          </div>
          <div className={styles.row}>
            <Segmented
              aria-label="Find the product"
              options={[
                { value: 'search', label: 'Search actives' },
                { value: 'paste', label: 'Paste ingredients' },
              ]}
              value={seg2}
              onChange={setSeg2}
            />
            <Segmented
              aria-label="Shelf filter"
              options={[
                { value: 'testing', label: 'Testing' },
                { value: 'kept', label: 'Kept' },
                { value: 'stopped', label: 'Stopped' },
              ]}
              value={seg3}
              onChange={setSeg3}
            />
          </div>
          <Segmented
            aria-label="Compare with"
            size="lg"
            options={[
              { value: '0', label: 'Day 0' },
              { value: '28', label: 'Day 28' },
              { value: '56', label: 'Day 56' },
              { value: 'target', label: 'Target' },
            ]}
            value={seg4}
            onChange={setSeg4}
          />
          <div className={styles.row}>
            <Tag status="testing" />
            <Tag status="kept" />
            <Tag status="stopped" />
            <Tag status="paused" />
            <Tag status="sample" />
          </div>
        </div>
      </Section>

      <Section id="fields" title="Fields">
        <div className={styles.fieldGrid}>
          <TextField label="Product name" placeholder="2% salicylic acid serum" value={product} onChange={(e) => setProduct(e.target.value)} />
          <TextField label="Product name" defaultValue="Retinal cream" error="This name is already on your shelf. Add a size or a brand to tell them apart" />
          <TextField label="Started on" defaultValue="Oct 6" disabled hint="Set when you took the baseline photo" />
          <Combobox
            label="Active ingredient"
            placeholder="Search, for example salicylic"
            items={ACTIVES}
            value={active}
            onChange={setActive}
            getKey={(a) => a.id}
            getLabel={(a) => a.name}
            getDescription={(a) => a.aliases}
            filter={(a, q) => {
              const s = q.toLowerCase();
              return a.name.toLowerCase().includes(s) || a.aliases.includes(s);
            }}
            emptyState="No active found. Paste the ingredient list instead"
          />
          <Textarea
            label="Ingredient list"
            hint="Paste it from the box or the shop page"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fieldClassName={styles.span2}
          />
        </div>
      </Section>

      <Section id="overlays" title="Sheet and toast" note="Sheet rises from the bottom under 768 px and sits centred above. Toasts appear at the edge of the box that caused them.">
        <div className={styles.stack}>
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Stop this product
            </Button>
          </div>
          <ToastButtons where="" />
          <ToastProvider placement="container" className={styles.toastBox}>
            <div className={styles.toastBoxInner}>
              <p className={styles.caption}>Anchored region</p>
              <ToastButtons where="here" />
            </div>
          </ToastProvider>
        </div>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Stop this product"
          description="The trial moves to Stopped with its photos and verdict."
          footer={
            <>
              <Button variant="quiet" onClick={() => setSheetOpen(false)}>
                Keep testing
              </Button>
              <Button onClick={() => setSheetOpen(false)}>Stop this product</Button>
            </>
          }
        >
          <div className={styles.stack}>
            <TextField label="What did you notice" placeholder="Optional" />
            <div className={styles.row}>
              <Chip>Dryness</Chip>
              <Chip>Stinging</Chip>
              <Chip>No change</Chip>
            </div>
          </div>
        </Sheet>
      </Section>

      <Section id="loading" title="Loading" note="Skeletons take the shape of what is coming. Steps name the real stages of an operation.">
        <div className={styles.loadingGrid}>
          <div className={styles.skeletonPrint}>
            <Skeleton aspect="3 / 4" radius="photo" />
            <Skeleton width="40%" height={12} radius="tag" />
          </div>
          <div className={styles.skeletonText}>
            <Skeleton width="70%" height={30} radius="chip" />
            <Skeleton lines={3} />
            <Skeleton width={160} height={44} radius="control" />
          </div>
          <div className={styles.stack}>
            <StepProgress steps={STEPS} current={STEPS[stepIndex]?.id ?? null} status={stepStatus} aria-label="Check-in progress" />
            <div className={styles.row}>
              <Button
                variant="secondary"
                onClick={() => {
                  if (stepStatus !== 'running') {
                    setStepStatus('running');
                    setStepIndex(0);
                    return;
                  }
                  if (stepIndex >= STEPS.length - 1) setStepStatus('done');
                  else setStepIndex((i) => i + 1);
                }}
              >
                {stepStatus === 'running' ? 'Next step' : 'Start over'}
              </Button>
              <Button variant="quiet" disabled={stepStatus !== 'running'} onClick={() => setStepStatus('error')}>
                Fail this step
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section id="photos" title="Photos" note="Prints carry the trial frames. The slider compares day 0 with a later frame; the mask repaints a YouCam zone in one colour.">
        <div className={styles.prints}>
          <PhotoPrint src="/brand/dev/m_resize_image.png" label="Day 0" sublabel="Oct 6" tilt={-2} priority aside={<span>Acne 58</span>} />
          <PhotoPrint src="/brand/dev/m_resize_image.png" label="Day 0 with acne map" sublabel="11 blemishes" tilt={0}>
            <MaskLayer mask="/brand/dev/m_acne.png" />
          </PhotoPrint>
          <PhotoPrint src="/brand/dev/face1.jpg" label="Day 56" sublabel="Target" tilt={1.5} variant="target" />
        </div>

        <div className={styles.compareWrap}>
          <CompareSlider
            labels={['Day 0', 'Day 56 target']}
            value={compare}
            onChange={setCompare}
            left={
              <div className={styles.frame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/dev/m_resize_image.png" alt="Day 0" />
                {maskUrl ? <MaskLayer key={maskUrl} mask={maskUrl} /> : null}
              </div>
            }
            right={
              <div className={styles.frame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/dev/face1.jpg" alt="Day 56 target" />
              </div>
            }
          />
          <div className={styles.compareSide}>
            <Segmented
              aria-label="Zone map"
              block
              options={[
                { value: 'acne', label: 'Acne' },
                { value: 'redness', label: 'Redness' },
                { value: 'none', label: 'No map' },
              ]}
              value={mask}
              onChange={setMask}
            />
            <p className={`${styles.caption} num`}>Divider at {Math.round(compare)}%. Drag it, or focus the handle and use the arrow keys, Home and End.</p>
          </div>
        </div>
      </Section>
    </main>
  );
}
