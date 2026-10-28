// Devpost gallery: 1800 x 1200 compositions on the Field background, captions set in Onest.
//
//   node docs/gallery/compose.mjs            every image
//   node docs/gallery/compose.mjs 01 05      only these
//
// Sources are the @2x frames from docs/screenshots/full (made by docs/screenshots/capture.mjs).
// Each composition is an HTML page rendered by Playwright in Chrome, so the captions use the
// real Onest font from Google Fonts. Needs Playwright (or PLAYWRIGHT_DIR) and sharp.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = join(ROOT, 'docs/screenshots/full');
const WORK = join(tmpdir(), 'kept-gallery');
mkdirSync(WORK, { recursive: true });

const require = createRequire(join(process.env.PLAYWRIGHT_DIR || ROOT, 'node_modules', 'x.js'));
const { chromium } = require('playwright');
const sharp = createRequire(join(ROOT, 'package.json'))('sharp');

const W = 1800;
const H = 1200;
const M = 72;

/* ---------- sources ---------- */

/** Crops a @2x frame by CSS pixel box and returns { url, w, h } in CSS pixels. */
async function crop(file, box) {
  const src = join(SRC, `${file}@2x.png`);
  const meta = await sharp(src).metadata();
  const b = box ?? { x: 0, y: 0, w: meta.width / 2, h: meta.height / 2 };
  const out = join(WORK, `${file}-${b.x}-${b.y}-${b.w}-${b.h}.png`);
  await sharp(src)
    .extract({ left: b.x * 2, top: b.y * 2, width: Math.min(b.w * 2, meta.width - b.x * 2), height: Math.min(b.h * 2, meta.height - b.y * 2) })
    .toFile(out);
  return { url: pathToFileURL(out).href, w: b.w, h: b.h };
}

/* ---------- pieces ---------- */

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=block');
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden; position: relative;
    background: #F8F4EF; color: #17221D;
    font-family: Onest, sans-serif; -webkit-font-smoothing: antialiased;
  }
  .cap {
    position: absolute; left: ${M}px; top: 62px; margin: 0;
    font-size: 40px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.18;
  }
  .note { position: absolute; font-size: 18px; color: #4F5B55; margin: 0; }
  .shot {
    position: absolute; border-radius: 18px; overflow: hidden; background: #FDFBF8;
    box-shadow: 0 0 0 1px #E3DBD1, 0 2px 4px rgb(40 34 26 / .08), 0 24px 64px -12px rgb(40 34 26 / .28);
  }
  .card {
    position: absolute; border-radius: 22px; overflow: hidden; background: #FDFBF8;
    box-shadow: 0 1px 2px rgb(40 34 26 / .10), 0 12px 28px -8px rgb(40 34 26 / .22);
  }
  .plain { position: absolute; }
  .shot img, .card img, .plain img, .screen img { display: block; width: 100%; height: 100%; }
  .phone {
    position: absolute; background: #17221D; border-radius: 62px; padding: 14px;
    box-shadow: inset 0 0 0 2px #2E3A34, 0 2px 4px rgb(40 34 26 / .10), 0 30px 70px -14px rgb(40 34 26 / .38);
  }
  .phone::before {
    content: ''; position: absolute; top: 26px; left: 50%; width: 92px; height: 26px;
    transform: translateX(-50%); border-radius: 14px; background: #0E1512; z-index: 2;
  }
  .screen { width: 100%; height: 100%; border-radius: 48px; overflow: hidden; background: #F8F4EF; }
`;

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
const cap = (text, style = '') => `<p class="cap" style="${style}">${text}</p>`;
const img = (cls, s, x, y, w, h) => `<div class="${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${s.url}" alt=""></div>`;

/** A phone drawn in code around a 390 x 844 frame, with a status bar above the page. */
const BAR = 40;
const phoneHeight = (s, screenW) => Math.round((screenW * s.h) / s.w) + BAR + 28;
function phone(s, x, y, screenW) {
  const sh = Math.round((screenW * s.h) / s.w);
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${screenW + 28}px;height:${sh + BAR + 28}px">
    <div class="screen"><div style="height:${BAR}px"></div><img src="${s.url}" alt="" style="height:${sh}px"></div></div>`;
}

/** Caption and content centered as one group. Returns the caption markup and the content top. */
const CAP_H = 48;
const CAP_GAP = 60;
function group(caption, contentH, x = M) {
  const capTop = Math.max(44, Math.round((H - (CAP_H + CAP_GAP + contentH)) / 2));
  return { head: cap(caption, `left:${x}px;top:${capTop}px`), top: capTop + CAP_H + CAP_GAP };
}

/** Desktop frame on the left, phone on the right, overlapping a little. */
function desktopAndPhone(caption, desk, mob, { deskW = 1300, screenW = 410, note = '' } = {}) {
  const deskH = Math.round((deskW * desk.h) / desk.w);
  const phoneH = phoneHeight(mob, screenW);
  const { head, top } = group(caption, Math.max(deskH, phoneH));
  const phoneX = W - 60 - (screenW + 28);
  const deskY = Math.round(top + (Math.max(deskH, phoneH) - deskH) / 2);
  const phoneY = Math.round(top + (Math.max(deskH, phoneH) - phoneH) / 2);
  return page(`${head}${img('shot', desk, M, deskY, deskW, deskH)}${phone(mob, phoneX, phoneY, screenW)}${note}`);
}

/** One frame as large as the canvas allows under the caption. */
function single(caption, s, { cls = 'shot', maxW = W - 2 * M, maxH = H - 2 * 52 - CAP_H - CAP_GAP } = {}) {
  const scale = Math.min(maxW / s.w, maxH / s.h);
  const w = Math.round(s.w * scale);
  const h = Math.round(s.h * scale);
  const x = Math.round((W - w) / 2);
  const { head, top } = group(caption, h, x);
  return page(`${head}${img(cls, s, x, top, w, h)}`);
}

/** Two crops side by side at the same width. */
function pair(caption, a, b, { cls = 'card', colW = 800 } = {}) {
  const gap = W - 2 * M - 2 * colW;
  const ah = Math.round((colW * a.h) / a.w);
  const bh = Math.round((colW * b.h) / b.w);
  const { head, top } = group(caption, Math.max(ah, bh));
  return page(`${head}${img(cls, a, M, top, colW, ah)}${img(cls, b, M + colW + gap, top, colW, bh)}`);
}

const logo = readFileSync(join(ROOT, 'public/brand/logo.svg'), 'utf8').replace('<svg ', '<svg width="200" height="65" ');

/* ---------- compositions ---------- */

const GALLERY = {
  async '00-thumbnail'() {
    const scene = await crop('01-hero-tall', { x: 128, y: 350, w: 1312, h: 628 });
    const scale = (W - 80) / scene.w;
    return page(`
      <div style="position:absolute;left:76px;top:44px">${logo}</div>
      <h1 style="position:absolute;left:80px;top:136px;margin:0;font-size:84px;font-weight:700;letter-spacing:-0.03em;line-height:1.02">
        Find out if your skincare<br>is actually working
      </h1>
      ${img('plain', scene, 80, 364, Math.round(scene.w * scale), Math.round(scene.h * scale))}`);
  },

  async '01-trial-compare'() {
    return desktopAndPhone('Day 0 against day 56, with the acne map on both halves', await crop('02-trial-compare'), await crop('02-trial-compare-mobile'));
  },

  async '02-retinal-purge'() {
    return pair('Acne is up on day 18 of retinal, inside its usual purge window', await crop('03-retinal-verdict'), await crop('03-retinal-chart'));
  },

  async '03-wizard-target'() {
    return desktopAndPhone(
      'A week 8 target simulated with YouCam from the day 0 photo',
      await crop('04-wizard-target', { x: 0, y: 0, w: 1440, h: 800 }),
      await crop('04-wizard-target-mobile'),
    );
  },

  async '04-baseline-maps'() {
    return single('YouCam Skin Analysis scores and the acne map on day 0', await crop('04-wizard-baseline', { x: 0, y: 0, w: 1440, h: 900 }));
  },

  async '05-capture-ghost'() {
    const note = `<p class="note" style="left:${M}px;bottom:26px">Face generated with YouCam AI</p>`;
    return desktopAndPhone('Check-in camera with the day 0 outline and four photo checks', await crop('05-capture-ghost'), await crop('05-capture-ghost-mobile'), { note });
  },

  async '06-shelf'() {
    const rows = await Promise.all(['testing', 'kept', 'stopped'].map((t) => crop(`06-shelf-row-${t}`)));
    const w = W - 2 * M;
    const h = Math.round((w * rows[0].h) / rows[0].w);
    const gap = 40;
    const { head, top } = group('The shelf keeps every trial: one testing, one kept, one stopped', rows.length * h + (rows.length - 1) * gap);
    return page(`${head}${rows.map((r, i) => img('card', r, M, top + i * (h + gap), w, h)).join('')}`);
  },

  async '07-buy-check'() {
    return single('An ingredient list checked against your skin and your shelf', await crop('07-buy-check'));
  },

  async '08-report'() {
    const sheet = await crop('08-report-page', { x: 323, y: 149, w: 794, h: 1141 });
    const h = H - 2 * 56;
    const w = Math.round((h * sheet.w) / sheet.h);
    const x = W - 120 - w;
    return page(`
      <p class="cap" style="top:${H / 2 - 60}px;left:120px;max-width:${x - 120 - 100}px;font-size:44px">A trial report on one page, ready to print or share</p>
      ${img('card', sheet, x, 56, w, h)}`);
  },

  async '09-how-it-measures'() {
    return single('Camera checks, YouCam scores, the active’s timeline, then a verdict', await crop('landing-measures', { x: 70, y: 236, w: 1300, h: 536 }), { cls: 'plain' });
  },

  async '10-photo-noise'() {
    return pair(
      'Five versions of one photo move YouCam scores by 4 points at most',
      await crop('09-real-change', { x: 0, y: 272, w: 720, h: 420 }),
      await crop('09-real-change', { x: 0, y: 716, w: 720, h: 476 }),
      { cls: 'plain', colW: 810 },
    );
  },

  async '11-landing'() {
    return desktopAndPhone('Three photos from one trial and the verdict they add up to', await crop('01-hero-tall', { x: 0, y: 0, w: 1440, h: 990 }), await crop('01-hero-mobile'));
  },
};

/* ---------- render ---------- */

const wanted = process.argv.slice(2);
const names = Object.keys(GALLERY).filter((n) => !wanted.length || wanted.some((w) => n.startsWith(w)));
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
for (const name of names) {
  const html = join(WORK, `${name}.html`);
  writeFileSync(html, await GALLERY[name]());
  await tab.goto(pathToFileURL(html).href);
  await tab.waitForLoadState('networkidle');
  const onest = await tab.evaluate(async () => {
    await Promise.all(['400 18px Onest', '600 40px Onest', '700 86px Onest'].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return document.fonts.check('600 40px Onest') && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Onest' && f.status === 'loaded');
  });
  if (!onest) throw new Error(`${name}: Onest did not load`);
  await tab.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const out = join(HERE, `${name}.png`);
  await tab.screenshot({ path: out });
  const mb = statSync(out).size / 1024 / 1024;
  console.log(`${name}.png ${mb.toFixed(2)} MB`);
  if (mb > 5) throw new Error(`${name} is over 5 MB`);
}
await browser.close();
