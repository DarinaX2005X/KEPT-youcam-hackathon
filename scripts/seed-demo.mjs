// 01.4.3 Demo shelf: three trials on real YouCam scores, written to public/demo/.
// Usage: node scripts/seed-demo.mjs [--only t1|t2|t3]   (--only stops after that trial, nothing is written)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCRIPTS, analyze, simulate, logBalance } from './lib/youcam.mjs';
import { variant, naturalSpread, luminance, maskStats, webPhoto, webMask, toUploadJpeg } from './lib/image.mjs';
import { FACE_CONCERNS, CALIBRATION_VARIANTS, FACE_JPG, FACE_JSON } from './lib/config.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const DEMO = path.join(ROOT, 'public', 'demo');
const calibration = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'calibration.json'), 'utf8'));
const face = JSON.parse(fs.readFileSync(FACE_JSON, 'utf8'));
const X = fs.readFileSync(FACE_JPG);

// Demo strength for the salicylic serum. Measured on X: the plain salicylic vector
// (acne .6, pores .4, oiliness .4) left the acne ui score at 66 (only the blemish count fell),
// so the demo uses acne 1.0 plus redness .4 (calmer inflamed spots): acne 66 → 72, pores 69 → 79.
const SALICYLIC = { acne: 1, redness: 0.4, pores: 0.4, oiliness: 0.4 };
// Retinal targets acne and texture (simulationFor: acne .4, texture .5).
const RETINAL = { acne: 0.4, texture: 0.5 };
const times = (v, k) => Object.fromEntries(Object.entries(v).map(([c, x]) => [c, Math.round(x * k * 1000) / 1000]));

// Trial 2 frame k per day, also the source of trial 3 days 0 and 7.
// Day 56 reaches the full simulation, so the kept serum lands on its target.
const T2_DAYS = [[14, 0.25], [28, 0.5], [42, 0.75], [56, 1]];
// Trial 3: skin after the salicylic serum (sim .75) on days 0 and 7, and the purge on day 18:
// acne back to X while the redness intensity of day 0 is held (in YouCam acne and redness move together,
// and a redness drop above 2 × NOISE would read as a reaction, not a purge).
// Day 7 was first sim .6: redness fell 80 → 75 (more than NOISE outside the purge window, a false
// "reacting" on day 7), so day 7 repeats sim .75 with its own spread.
const T3_DAYS = [[0, 0.75], [7, 0.75]];
const T3_PURGE = { day: 18, intensities: { redness: 0.3, pores: 0.3, oiliness: 0.3 } };

/** Simulation of a source buffer, returned as the JPEG buffer we upload. */
async function sim(src, intensities, label) {
  const png = await simulate(src, intensities, label);
  return toUploadJpeg(png);
}

/** Analysis of a frame with natural spread; returns the frame record used by the manifest writer. */
async function scanFrame(src, seed, concerns, label, spread = true) {
  const buf = spread ? await variant(src, naturalSpread(seed)) : src;
  const a = await analyze(buf, concerns, label);
  return { a, upload: buf, concerns };
}

const T1_CONCERNS = ['pore', 'oiliness', 'redness', 'moisture'];
const T2_CONCERNS = ['acne', 'pore', 'oiliness', 'redness'];
const T3_CONCERNS = ['acne', 'texture', 'redness', 'moisture'];

await logBalance('before seed-demo');
const trials = {};

// ---- 1. Niacinamide toner: repeat photos of X only (the calibration frames), within noise.
{
  const byId = { original: null };
  byId.original = { a: { ...(await analyze(X, FACE_CONCERNS, 'face3')) }, upload: X, concerns: T1_CONCERNS };
  for (const v of CALIBRATION_VARIANTS) {
    const buf = await variant(FACE_JPG, v.params);
    byId[v.id] = { a: await analyze(buf, FACE_CONCERNS, `cal-${v.id}`), upload: buf, concerns: T1_CONCERNS };
  }
  // Day 56 is X itself, the same photo that opens the salicylic trial four days later.
  const order = [[0, 'blur'], [14, 'bright-up'], [28, 'shift-scale'], [42, 'bright-down-rot'], [56, 'original']];
  trials.t1 = { frames: order.map(([day, id]) => ({ day, ...byId[id] })) };
}
if (only === 't1') { printTable(); process.exit(0); }

// ---- 2. Salicylic serum: X, then simulations of X at growing strength.
{
  // Day 0 is X as analysed in make-face (it already carries the four concerns of this trial).
  const frames = [{ day: 0, a: await analyze(X, FACE_CONCERNS, 'face3'), upload: X, concerns: T2_CONCERNS }];
  for (const [day, k] of T2_DAYS) {
    const s = await sim(X, times(SALICYLIC, k), `x-v${k}`);
    frames.push({ day, k, ...(await scanFrame(s, 200 + day, T2_CONCERNS, `t2d${day}`)) });
  }
  const projSrc = await sim(X, SALICYLIC, 'x-v1');
  const proj = await analyze(projSrc, T2_CONCERNS, 't2projv');
  trials.t2 = { frames, projection: { a: proj, intensities: SALICYLIC, concerns: T2_CONCERNS } };
}
if (only === 't2') { printTable(); process.exit(0); }

// ---- 3. Retinal cream: starts on post-salicylic skin, acne gets worse by day 18 (purge).
let t3Day0Upload;
{
  const frames = [];
  for (const [day, k] of T3_DAYS) {
    const s = await sim(X, times(SALICYLIC, k), `x-v${k}`);
    const f = await scanFrame(s, 300 + day, T3_CONCERNS, `t3d${day}`);
    if (day === 0) t3Day0Upload = f.upload;
    frames.push({ day, k, ...f });
  }
  const purgeSrc = await sim(X, T3_PURGE.intensities, 'x-purge');
  frames.push({ day: T3_PURGE.day, k: 'purge', ...(await scanFrame(purgeSrc, 300 + T3_PURGE.day, T3_CONCERNS, `t3d${T3_PURGE.day}`)) });
  const projSrc = await sim(t3Day0Upload, RETINAL, 't3-ret1');
  const proj = await analyze(projSrc, T3_CONCERNS, 't3proj');
  trials.t3 = { frames, projection: { a: proj, intensities: RETINAL, concerns: T3_CONCERNS } };
}
if (only === 't3') { printTable(); process.exit(0); }

// ---- Sample photos for the live flows.
const baselineSample = await variant(FACE_JPG, { dx: -0.012, dy: 0.008, brightness: 1.02 });
const week6Sample = await sim(t3Day0Upload, times(RETINAL, 0.7), 't3-ret0.7');

// ---- Write public/demo.
fs.rmSync(DEMO, { recursive: true, force: true });
fs.mkdirSync(DEMO, { recursive: true });
const rel = (...p) => '/demo/' + p.join('/');
const writeFile = (p, buf) => {
  const abs = path.join(DEMO, ...p.split('/').slice(2));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
};

async function writeScan(trialId, slug, f, kind) {
  const dir = [slug, `day-${f.day}`];
  const photoUrl = rel(...dir, 'photo.jpg');
  writeFile(photoUrl, await webPhoto(f.a.image));
  const masks = {};
  const stats = {};
  const scores = {};
  for (const c of f.concerns) {
    scores[c] = f.a.scores[c];
    const url = rel(...dir, `mask-${c}.png`);
    const png = await webMask(f.a.masks[c]);
    writeFile(url, png);
    masks[c] = { url };
    if (c === 'acne' || c === 'redness') stats[c] = await maskStats(c, png);
  }
  return {
    id: `${trialId}-day-${f.day}`,
    trialId,
    kind,
    day: f.day,
    takenAt: '', // filled by caller as an offset
    photo: { url: photoUrl },
    masks,
    scores,
    // YouCam's "all" score is the mean of the requested concerns. Some frames were analysed with six
    // concerns, so the overall is recomputed over this trial's four to keep a series comparable.
    overall: Math.round((f.concerns.reduce((a, c) => a + f.a.scores[c].ui, 0) / f.concerns.length) * 100) / 100,
    skinAge: f.a.skinAge,
    maskStats: stats,
    capture: { source: 'sample', luminance: await luminance(f.a.image) },
  };
}

async function writeProjection(slug, p) {
  const url = rel(slug, 'target', 'photo.jpg');
  writeFile(url, await webPhoto(p.a.image));
  return { photo: { url }, scores: Object.fromEntries(p.concerns.map((c) => [c, p.a.scores[c]])), intensities: p.intensities };
}

const offset = (startDays, day = 0) => `${-(startDays - day)}d`;
const META = {
  t1: {
    id: 'sample-niacinamide', slug: 'niacinamide-toner', startDays: 160,
    product: { name: '10% niacinamide toner', actives: ['niacinamide'] },
    targets: ['pore', 'oiliness'], watch: ['redness', 'moisture'],
    plan: { checkinDays: [7, 14, 21, 28, 42, 56], onsetDay: 28, fullEffectDay: 56 },
    status: 'stopped', decidedDay: 56,
  },
  t2: {
    id: 'sample-salicylic', slug: 'salicylic-serum', startDays: 100,
    product: { name: '2% salicylic acid serum', actives: ['salicylic'] },
    targets: ['acne', 'pore', 'oiliness'], watch: ['redness'],
    plan: { checkinDays: [7, 14, 21, 28, 42, 56], onsetDay: 14, fullEffectDay: 56, purge: { fromDay: 7, toDay: 42 } },
    status: 'kept', decidedDay: 56,
  },
  t3: {
    id: 'sample-retinal', slug: 'retinal-cream', startDays: 21,
    product: { name: '0.05% retinal cream', actives: ['retinal'] },
    targets: ['acne', 'texture'], watch: ['redness', 'moisture'],
    plan: { checkinDays: [7, 14, 21, 28, 42, 56, 84], onsetDay: 21, fullEffectDay: 84, purge: { fromDay: 14, toDay: 42 } },
    status: 'testing',
  },
};

const manifestTrials = [];
for (const key of ['t1', 't2', 't3']) {
  const m = META[key];
  const t = trials[key];
  const scans = [];
  for (const f of t.frames) {
    const s = await writeScan(m.id, m.slug, f, f.day === 0 ? 'baseline' : 'checkin');
    s.takenAt = offset(m.startDays, f.day);
    scans.push(s);
  }
  const trial = {
    id: m.id,
    product: m.product,
    targets: m.targets,
    watch: m.watch,
    startedAt: offset(m.startDays),
    plan: m.plan,
    ...(t.projection ? { projection: await writeProjection(m.slug, t.projection) } : {}),
    status: m.status,
    ...(m.decidedDay ? { decidedAt: offset(m.startDays, m.decidedDay) } : {}),
    sample: true,
  };
  manifestTrials.push({ trial, scans });
}

writeFile(rel('sample', 'baseline.jpg'), await webPhoto(baselineSample));
writeFile(rel('sample', 'week6.jpg'), await webPhoto(week6Sample));

const manifest = {
  generatedAt: new Date().toISOString(),
  noise: calibration.noise,
  face: { credit: 'Face generated with YouCam AI Image Generator' },
  trials: manifestTrials,
  samplePhotos: { baseline: rel('sample', 'baseline.jpg'), checkin: rel('sample', 'week6.jpg') },
  hero: { trialId: META.t2.id, frames: [`${META.t2.id}-day-0`, `${META.t2.id}-day-28`], verdict: null },
};
fs.writeFileSync(path.join(DEMO, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

printTable();
await logBalance('after seed-demo');

function printTable() {
  for (const [key, t] of Object.entries(trials)) {
    const cs = t.frames[0].concerns;
    console.log(`\n${key}  ${cs.map((c) => c.padStart(9)).join('')}   overall`);
    for (const f of t.frames) console.log(`day ${String(f.day).padEnd(4)}${cs.map((c) => String(f.a.scores[c].ui).padStart(9)).join('')}   ${f.a.overall}${f.k ? `   sim ${f.k}` : ''}`);
    if (t.projection) console.log(`target  ${cs.map((c) => String(t.projection.a.scores[c].ui).padStart(9)).join('')}   ${t.projection.a.overall}`);
  }
}
