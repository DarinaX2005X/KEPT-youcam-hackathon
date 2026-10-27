// 01.4.1 Sample face: three candidates from YouCam text-to-image, each analysed, one picked.
// Usage: node scripts/make-face.mjs [--pick N]   (N = 1..3; without it the best by the criteria wins)
import fs from 'node:fs';
import path from 'node:path';
import { textToImage, analyze, logBalance } from './lib/youcam.mjs';
import { toUploadJpeg, contactSheet } from './lib/image.mjs';
import { FACE_CONCERNS, FACES } from './lib/config.mjs';

fs.mkdirSync(FACES, { recursive: true });

const common =
  'looking straight into the camera, neutral relaxed face, mouth closed, hair pulled back off the forehead with a headband, ' +
  'no makeup, mild inflamed acne spots on the cheeks and chin, mild redness around the sides of the nose, visible pores, ' +
  'soft even daylight, plain light bathroom wall behind, face fills most of the frame and is centered, sharp focus, natural real skin texture, ' +
  'realistic smartphone front camera selfie taken at home in the bathroom';
const PROMPTS = [
  `Photo of a 27 year old woman wearing a plain grey t-shirt, ${common}`,
  `Photo of a 29 year old woman with a white towel over her shoulders, ${common}`,
  `Photo of a 26 year old woman of mixed ethnicity wearing a plain white t-shirt, ${common}`,
];
const NEGATIVE = 'makeup, beauty filter, smooth plastic skin, glasses, hands, phone, tilted head, smiling, blur, illustration, cartoon, severe acne, scars';

const pickArg = process.argv.indexOf('--pick');
const forced = pickArg > 0 ? Number(process.argv[pickArg + 1]) : null;

await logBalance('before make-face');
const cands = [];
for (const [i, prompt] of PROMPTS.entries()) {
  const n = i + 1;
  const raw = await textToImage(`face-${n}`, prompt, NEGATIVE);
  const jpg = await toUploadJpeg(raw);
  const file = path.join(FACES, `cand-${n}.jpg`);
  fs.writeFileSync(file, jpg);
  let a = null;
  let error = null;
  try {
    a = await analyze(jpg, FACE_CONCERNS, `face${n}`);
  } catch (e) {
    error = String(e.message || e);
  }
  const s = a?.scores ?? {};
  const pass = !!a && s.acne.ui <= 72 && s.redness.ui <= 68;
  cands.push({ n, file, error, pass, scores: s, overall: a?.overall, skinAge: a?.skinAge, analysisDir: a?.dir });
}

const fmt = (c) => (c.error ? `#${c.n} error` : `#${c.n} acne ${c.scores.acne.ui} red ${c.scores.redness.ui} pore ${c.scores.pore.ui} tex ${c.scores.texture.ui}`);
await contactSheet(cands.map((c) => c.file), cands.map(fmt), path.join(FACES, 'contact.jpg'));

const passing = cands.filter((c) => c.pass);
// Default pick: passing candidate whose acne and redness are clearly visible but not severe (closest to 66/62).
const auto = passing.sort((a, b) =>
  Math.abs(a.scores.acne.ui - 66) + Math.abs(a.scores.redness.ui - 62) - (Math.abs(b.scores.acne.ui - 66) + Math.abs(b.scores.redness.ui - 62)))[0];
const chosen = forced ? cands.find((c) => c.n === forced) : auto;
if (!chosen || chosen.error) {
  console.log(cands.map(fmt).join('\n'));
  throw new Error('No usable candidate. Regenerate with another prompt.');
}
fs.copyFileSync(chosen.file, path.join(FACES, 'face.jpg'));
fs.writeFileSync(path.join(FACES, 'candidates.json'), JSON.stringify({ chosen: chosen.n, candidates: cands, prompts: PROMPTS, negative: NEGATIVE }, null, 2));
fs.writeFileSync(path.join(FACES, 'face.json'), JSON.stringify({ candidate: chosen.n, concerns: FACE_CONCERNS, analysisDir: chosen.analysisDir, scores: chosen.scores, overall: chosen.overall, skinAge: chosen.skinAge }, null, 2));

console.log(cands.map((c) => `${fmt(c)} oil ${c.scores.oiliness?.ui ?? '-'} moist ${c.scores.moisture?.ui ?? '-'}${c.pass ? ' pass' : ''}`).join('\n'));
console.log(`chosen: candidate ${chosen.n} -> scripts/.cache/faces/face.jpg`);
await logBalance('after make-face');
