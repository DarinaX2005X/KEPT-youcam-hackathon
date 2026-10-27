// 01.4.2 Noise calibration: four repeat-photo variants of X, analysed, spread of ui scores per zone.
// NOISE = ceil(max over zones of 2σ), at least 3. Writes scripts/calibration.json.
import fs from 'node:fs';
import path from 'node:path';
import { SCRIPTS, analyze, logBalance } from './lib/youcam.mjs';
import { variant } from './lib/image.mjs';
import { FACE_CONCERNS, CALIBRATION_CONCERNS, CALIBRATION_VARIANTS, FACE_JPG, FACE_JSON } from './lib/config.mjs';

if (!fs.existsSync(FACE_JSON)) throw new Error('Run scripts/make-face.mjs first');
const face = JSON.parse(fs.readFileSync(FACE_JSON, 'utf8'));

await logBalance('before calibrate-noise');
const rows = [{ id: 'original', label: 'original X', scores: face.scores }];
for (const v of CALIBRATION_VARIANTS) {
  const buf = await variant(FACE_JPG, v.params);
  // Analysed with all six face concerns so the niacinamide demo trial can reuse these frames.
  const a = await analyze(buf, FACE_CONCERNS, `cal-${v.id}`);
  rows.push({ id: v.id, label: v.label, params: v.params, scores: a.scores, analysisDir: path.relative(SCRIPTS, a.dir) });
}

const stat = (vals) => {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Sample standard deviation (n − 1): five photos are a sample of all possible repeat photos.
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  return { values: vals, mean: +mean.toFixed(2), range: Math.max(...vals) - Math.min(...vals), sd: +sd.toFixed(2), twoSigma: +(2 * sd).toFixed(2) };
};
const zones = Object.fromEntries(FACE_CONCERNS.map((c) => [c, stat(rows.map((r) => r.scores[c].ui))]));
const noiseOf = (cs) => Math.max(3, Math.ceil(Math.max(...cs.map((c) => zones[c].twoSigma))));
const noise = noiseOf(CALIBRATION_CONCERNS);
const noiseAll = noiseOf(FACE_CONCERNS);

const report = {
  generatedAt: new Date().toISOString(),
  method: 'Five photos of the same face (original + 4 repeat-photo variants), SD skin analysis. NOISE = ceil(max over zones of 2 × sample σ of ui scores), at least 3.',
  photos: rows.map(({ id, label, params }) => ({ id, label, params })),
  scores: Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(CALIBRATION_CONCERNS.map((c) => [c, r.scores[c].ui]))])),
  zones: Object.fromEntries(CALIBRATION_CONCERNS.map((c) => [c, zones[c]])),
  noise,
  extra: {
    note: 'oiliness and moisture were measured on the same five photos because the demo trials watch them; they are not part of the NOISE definition.',
    scores: Object.fromEntries(rows.map((r) => [r.id, { oiliness: r.scores.oiliness.ui, moisture: r.scores.moisture.ui }])),
    zones: { oiliness: zones.oiliness, moisture: zones.moisture },
    noiseAllSixZones: noiseAll,
  },
};
fs.writeFileSync(path.join(SCRIPTS, 'calibration.json'), JSON.stringify(report, null, 2) + '\n');

console.log('zone      values               range  sd    2σ');
for (const c of FACE_CONCERNS) {
  const z = zones[c];
  console.log(`${c.padEnd(9)} ${z.values.join(' ').padEnd(20)} ${String(z.range).padEnd(6)} ${String(z.sd).padEnd(5)} ${z.twoSigma}`);
}
console.log(`NOISE = ${noise} (4 calibration zones); with oiliness and moisture it would be ${noiseAll}`);
await logBalance('after calibrate-noise');
