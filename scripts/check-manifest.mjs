// Validates public/demo/manifest.json against the domain contract (types.ts) and checks every file exists.
// Usage: node scripts/check-manifest.mjs   (exit code 1 on any problem)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/youcam.mjs';

const PUBLIC = path.join(ROOT, 'public');
const file = path.join(PUBLIC, 'demo', 'manifest.json');
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const CONCERNS = ['acne', 'redness', 'pore', 'texture', 'wrinkle', 'moisture', 'oiliness', 'radiance', 'age_spot', 'dark_circle_v2', 'eye_bag', 'firmness'];
const SIM = ['acne', 'redness', 'pores', 'texture', 'wrinkle', 'oiliness', 'radiance', 'spots', 'dark_circle', 'eye_bags'];
const OFFSET = /^-\d+d$/;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;

const files = new Set();
function blob(where, ref) {
  if (!ref || typeof ref !== 'object' || !isStr(ref.url) || Object.keys(ref).length !== 1) return err(where, 'BlobRef must be { url }');
  if (!ref.url.startsWith('/demo/')) return err(where, `url outside /demo/: ${ref.url}`);
  const abs = path.join(PUBLIC, ...ref.url.split('/').filter(Boolean));
  if (!fs.existsSync(abs)) return err(where, `missing file ${ref.url}`);
  files.add(abs);
}
function scores(where, s) {
  if (!s || typeof s !== 'object') return err(where, 'scores missing');
  for (const [c, v] of Object.entries(s)) {
    if (!CONCERNS.includes(c)) err(where, `unknown concern ${c}`);
    if (!v || !isNum(v.ui) || !isNum(v.raw) || v.ui < 0 || v.ui > 100) err(`${where}.${c}`, 'ConcernScore { ui 0..100, raw }');
  }
}

if (!isStr(m.generatedAt) || Number.isNaN(Date.parse(m.generatedAt))) err('generatedAt', 'ISO date expected');
if (!isNum(m.noise) || m.noise < 3) err('noise', 'number ≥ 3 expected');
if (!isStr(m.face?.credit)) err('face.credit', 'missing');
if (!Array.isArray(m.trials) || m.trials.length !== 3) err('trials', 'three trials expected');

const scanIds = new Map();
for (const [i, entry] of (m.trials || []).entries()) {
  const t = entry.trial;
  const w = `trials[${i}]`;
  if (!isStr(t?.id)) { err(w, 'trial.id missing'); continue; }
  if (!isStr(t.product?.name) || !Array.isArray(t.product?.actives) || !t.product.actives.length) err(`${w}.product`, 'name and actives expected');
  for (const k of ['targets', 'watch']) {
    if (!Array.isArray(t[k]) || !t[k].length || t[k].some((c) => !CONCERNS.includes(c))) err(`${w}.${k}`, 'Concern[] expected');
  }
  if (!OFFSET.test(t.startedAt)) err(`${w}.startedAt`, 'offset like "-21d" expected');
  const p = t.plan;
  if (!p || !Array.isArray(p.checkinDays) || !isNum(p.onsetDay) || !isNum(p.fullEffectDay) || p.onsetDay >= p.fullEffectDay) err(`${w}.plan`, 'TrialPlan invalid');
  if (p?.purge && !(isNum(p.purge.fromDay) && isNum(p.purge.toDay) && p.purge.fromDay < p.purge.toDay)) err(`${w}.plan.purge`, 'invalid');
  if (!['testing', 'kept', 'stopped', 'paused'].includes(t.status)) err(`${w}.status`, t.status);
  if ((t.status === 'kept' || t.status === 'stopped') && !OFFSET.test(t.decidedAt || '')) err(`${w}.decidedAt`, 'offset expected for a decided trial');
  if (t.sample !== true) err(`${w}.sample`, 'true expected');
  if (t.projection) {
    blob(`${w}.projection.photo`, t.projection.photo);
    scores(`${w}.projection.scores`, t.projection.scores);
    const ints = Object.entries(t.projection.intensities || {});
    if (!ints.length || ints.some(([k, v]) => !SIM.includes(k) || !isNum(v) || v < 0 || v > 1)) err(`${w}.projection.intensities`, 'SimConcern → 0..1 expected');
  }
  const scans = entry.scans;
  if (!Array.isArray(scans) || scans.length < 2) { err(`${w}.scans`, 'at least two scans expected'); continue; }
  const days = scans.map((s) => s.day);
  if (days.some((d, j) => j && d <= days[j - 1])) err(`${w}.scans`, 'days must increase');
  for (const [j, s] of scans.entries()) {
    const sw = `${w}.scans[${j}]`;
    if (!isStr(s.id)) err(sw, 'id missing');
    if (scanIds.has(s.id)) err(sw, `duplicate scan id ${s.id}`);
    scanIds.set(s.id, t.id);
    if (s.trialId !== t.id) err(sw, 'trialId mismatch');
    if (s.kind !== (j === 0 ? 'baseline' : 'checkin')) err(sw, `kind ${s.kind}`);
    if (j === 0 && s.day !== 0) err(sw, 'baseline must be day 0');
    if (!OFFSET.test(s.takenAt)) err(sw, 'takenAt offset expected');
    else if (Number(s.takenAt.slice(0, -1)) !== Number(t.startedAt.slice(0, -1)) + s.day) err(sw, 'takenAt ≠ startedAt + day');
    blob(`${sw}.photo`, s.photo);
    scores(`${sw}.scores`, s.scores);
    for (const c of [...t.targets, ...t.watch]) {
      if (!s.scores?.[c]) err(sw, `no score for ${c}`);
      if (!s.masks?.[c]) err(sw, `no mask for ${c}`);
    }
    for (const [c, ref] of Object.entries(s.masks || {})) blob(`${sw}.masks.${c}`, ref);
    if (!isNum(s.overall) || !isNum(s.skinAge)) err(sw, 'overall and skinAge expected');
    if (s.scores?.acne && !isNum(s.maskStats?.acne?.blemishCount)) err(sw, 'maskStats.acne.blemishCount expected');
    if (s.scores?.redness && !isNum(s.maskStats?.redness?.areaPct)) err(sw, 'maskStats.redness.areaPct expected');
    if (s.capture?.source !== 'sample' || !isNum(s.capture?.luminance)) err(`${sw}.capture`, 'CaptureMeta { source: sample, luminance }');
  }
}

for (const k of ['baseline', 'checkin']) blob(`samplePhotos.${k}`, { url: m.samplePhotos?.[k] });
if (!m.trials?.some((e) => e.trial.id === m.hero?.trialId)) err('hero.trialId', 'not a trial in the manifest');
if (!Array.isArray(m.hero?.frames) || m.hero.frames.length !== 2 || m.hero.frames.some((id) => scanIds.get(id) !== m.hero.trialId)) err('hero.frames', 'two scan ids of the hero trial expected');
if (!('verdict' in (m.hero || {}))) err('hero.verdict', 'missing (null until MAIN fills it from the engine)');

// Files in public/demo that nothing references.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const all = walk(path.join(PUBLIC, 'demo')).filter((f) => f !== file);
for (const f of all) if (!files.has(f)) err('public/demo', `unreferenced file ${path.relative(PUBLIC, f)}`);

const bytes = all.reduce((a, f) => a + fs.statSync(f).size, fs.statSync(file).size);
if (errors.length) {
  console.log(`manifest INVALID, ${errors.length} problem(s):\n` + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(`manifest ok: ${m.trials.length} trials, ${scanIds.size} scans, ${all.length + 1} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
