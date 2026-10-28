// Product screenshots for README, Devpost and the deck.
//
//   node docs/screenshots/capture.mjs                 every free shot
//   node docs/screenshots/capture.mjs hero shelf      only these
//   node docs/screenshots/capture.mjs wizard --live   the wizard plan step (one real YouCam run, about 22 units)
//
// Every shot starts from a fresh browser profile on KEPT_URL (default: production).
// Each frame is taken at device scale 2 into docs/screenshots/full/<name>@2x.png and scaled
// down to the exact 1440 x 900 or 390 x 844 file in docs/screenshots/<name>.png.
// Outside the wizard run, every YouCam and coach request is blocked, so nothing is spent.
//
// Needs Playwright (npm i -D playwright, or PLAYWRIGHT_DIR pointing at a node_modules that has it)
// and Google Chrome. The camera shot feeds Chrome a fake camera made with ffmpeg from the
// sample face in public/demo/sample/week6.jpg.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FULL = join(HERE, 'full');
const BASE = (process.env.KEPT_URL || 'https://kept-skin.vercel.app').replace(/\/$/, '');
mkdirSync(FULL, { recursive: true });

const require = createRequire(join(process.env.PLAYWRIGHT_DIR || ROOT, 'node_modules', 'x.js'));
const { chromium } = require('playwright');
const sharp = createRequire(join(ROOT, 'package.json'))('sharp');

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const args = process.argv.slice(2);
const live = args.includes('--live');
const picked = args.filter((a) => !a.startsWith('--'));
const log = (...m) => console.log(...m);

/* ---------- browser helpers ---------- */

async function session(device, { reducedMotion = 'no-preference', launchArgs = [], permissions = [], allowYouCam = false } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args: launchArgs });
  const context = await browser.newContext({ ...device, reducedMotion, permissions, locale: 'en-US', colorScheme: 'light' });
  const calls = [];
  await context.route('**/api/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push(`${req.method()} ${url.pathname}`);
    if (allowYouCam && url.pathname.startsWith('/api/youcam')) return route.continue();
    if (req.method() === 'GET' && url.pathname === '/api/coach') return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  return { browser, context, page, calls };
}

async function settled(page, extra = 800) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
  await document_fonts(page);
  await page.waitForTimeout(extra);
}

async function document_fonts(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

/** Saves the @2x frame and the exact-size file. */
async function shoot(page, name, { fullPage = false } = {}) {
  const vp = page.viewportSize();
  const big = join(FULL, `${name}@2x.png`);
  await page.screenshot({ path: big, fullPage });
  if (!fullPage) {
    await sharp(big).resize(vp.width, vp.height, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(HERE, `${name}.png`));
  }
  log('  saved', name, fullPage ? '(full page)' : '');
}

/** The sticky site header stays in place so element crops are not covered by it. */
async function unstick(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if ((pos === 'sticky' || pos === 'fixed') && el.getBoundingClientRect().top <= 0) el.style.position = 'static';
    }
  });
}

/** Element crop at @2x, for the gallery only. */
async function part(page, locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await locator.screenshot({ path: join(FULL, `${name}@2x.png`) });
  log('  saved', name, '(part)');
}

const sectionOf = (page, name, tag = 'section') => page.getByRole('heading', { name, exact: true }).first().locator(`xpath=ancestor::${tag}[1]`);

/** Copies the sample shelf into this profile and returns the trial ids by product. */
async function loadSamples(page) {
  await page.goto(`${BASE}/demo`);
  await page.waitForURL(/\/trial\/[^/]+$/, { timeout: 45000 });
  const salicylic = page.url().split('/trial/')[1];
  const ids = { salicylic };
  for (const tab of ['testing', 'kept', 'stopped']) {
    await page.goto(`${BASE}/shelf?tab=${tab}`);
    await settled(page, 300);
    for (const a of await page.locator('main a[href*="/trial/"]').all()) {
      const text = (await a.innerText()).toLowerCase();
      const id = (await a.getAttribute('href')).split('/trial/')[1];
      if (text.includes('retinal')) ids.retinal = id;
      if (text.includes('niacinamide')) ids.niacinamide = id;
    }
  }
  return ids;
}

async function openTrial(page, id) {
  await page.goto(`${BASE}/trial/${id}`);
  await settled(page, 1200);
  // Acne map on, divider in the middle.
  const acne = page.getByRole('button', { name: /^Acne/ }).first();
  if ((await acne.count()) && (await acne.getAttribute('aria-pressed')) === 'false') await acne.click();
  const slider = page.getByRole('slider').first();
  if (await slider.count()) {
    const now = Number(await slider.getAttribute('aria-valuenow'));
    if (now !== 50) {
      await slider.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    }
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
}

/* ---------- shots ---------- */

const SHOTS = {
  async hero() {
    for (const [device, name] of [[DESKTOP, '01-hero'], [MOBILE, '01-hero-mobile']]) {
      // Reduced motion shows the finished frame of the 9 s scene.
      const s = await session(device, { reducedMotion: 'reduce' });
      await s.page.goto(`${BASE}/`);
      await settled(s.page, 1500);
      await shoot(s.page, name);
      if (device === DESKTOP) {
        // Landing sections below the hero reveal on scroll.
        for (let y = 0; y < 6000; y += 400) {
          await s.page.mouse.wheel(0, 400);
          await s.page.waitForTimeout(150);
        }
        await settled(s.page, 1200);
        await unstick(s.page);
        await part(s.page, sectionOf(s.page, 'What a trial looks like'), 'landing-trial');
        await part(s.page, sectionOf(s.page, 'How Kept measures'), 'landing-measures');
        await part(s.page, sectionOf(s.page, 'Verdicts you can act on'), 'landing-verdicts');
      }
      await s.browser.close();
    }
  },

  async trial() {
    for (const [device, name] of [[DESKTOP, '02-trial-compare'], [MOBILE, '02-trial-compare-mobile']]) {
      const s = await session(device);
      const ids = await loadSamples(s.page);
      await openTrial(s.page, ids.salicylic);
      await shoot(s.page, name);
      await shoot(s.page, `${name}-page`, { fullPage: true });
      if (device === DESKTOP) {
        await unstick(s.page);
        await part(s.page, sectionOf(s.page, 'Working'), '02-verdict');
        await part(s.page, sectionOf(s.page, 'Acne score by day'), '02-chart');
      }
      await s.browser.close();
    }
  },

  async retinal() {
    const s = await session(DESKTOP);
    const ids = await loadSamples(s.page);
    await openTrial(s.page, ids.retinal);
    await shoot(s.page, '03-retinal-page', { fullPage: true });
    await unstick(s.page);
    await part(s.page, sectionOf(s.page, 'Likely purging'), '03-retinal-verdict');
    await part(s.page, sectionOf(s.page, 'Acne score by day'), '03-retinal-chart');
    await s.page.reload();
    await openTrial(s.page, ids.retinal);
    // Scroll so the verdict reasons, the chart with the purge window and the check-in strip share the frame.
    const reasons = await s.page.getByText(/Retinal often causes a short purge/).first().boundingBox();
    await s.page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(reasons.y) - 84));
    await s.page.waitForTimeout(800);
    await shoot(s.page, '03-retinal-purge');
    await s.browser.close();
  },

  async camera() {
    const video = join(tmpdir(), 'kept-fake-camera.y4m');
    if (!existsSync(video)) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', join(ROOT, 'public/demo/sample/week6.jpg'), '-t', '2', '-r', '10', '-vf', 'scale=720:960,format=yuv420p', video]);
    }
    for (const [device, name] of [[DESKTOP, '05-capture-ghost'], [MOBILE, '05-capture-ghost-mobile']]) {
      const s = await session(device, {
        permissions: ['camera'],
        launchArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
      });
      const ids = await loadSamples(s.page);
      await s.page.goto(`${BASE}/trial/${ids.retinal}/check-in`);
      await s.page.getByText('Line up', { exact: true }).waitFor({ timeout: 45000 });
      await s.page.waitForTimeout(5000);
      await shoot(s.page, name);
      await s.browser.close();
    }
  },

  async shelf() {
    const s = await session(DESKTOP);
    await loadSamples(s.page);
    for (const tab of ['testing', 'kept', 'stopped']) {
      await s.page.goto(`${BASE}/shelf?tab=${tab}`);
      await settled(s.page, 900);
      if (tab === 'testing') await shoot(s.page, '06-shelf');
      await part(s.page, s.page.locator('main ul li').first(), `06-shelf-row-${tab}`);
    }
    await s.browser.close();
  },

  async buy() {
    const s = await session(DESKTOP);
    await loadSamples(s.page);
    await s.page.goto(`${BASE}/buy-check`);
    await settled(s.page, 600);
    await s.page.getByRole('button', { name: 'Try an example list' }).click();
    await s.page.waitForTimeout(500);
    await s.page.getByRole('button', { name: 'Check ingredients' }).click();
    await settled(s.page, 1500);
    await shoot(s.page, '07-buy-check-page', { fullPage: true });
    await s.page.evaluate(() => window.scrollTo(0, 0));
    await s.page.waitForTimeout(400);
    await shoot(s.page, '07-buy-check');
    await s.browser.close();
  },

  async report() {
    const s = await session(DESKTOP);
    const ids = await loadSamples(s.page);
    await s.page.goto(`${BASE}/trial/${ids.salicylic}/report`);
    await settled(s.page, 1200);
    await shoot(s.page, '08-report');
    await shoot(s.page, '08-report-page', { fullPage: true });
    await s.browser.close();
  },

  async method() {
    const s = await session(DESKTOP);
    await s.page.goto(`${BASE}/how-it-works`);
    await settled(s.page, 1000);
    await shoot(s.page, '09-how-it-works');
    await unstick(s.page);
    await part(s.page, s.page.locator('section#real-change'), '09-real-change');
    await s.browser.close();
  },

  /** One real run: sample face, YouCam Skin Analysis, then Skin Simulation for the target. */
  async wizard() {
    if (!live) {
      log('  wizard skipped: it spends YouCam units, run it with --live');
      return;
    }
    const s = await session(DESKTOP, { allowYouCam: true });
    const { page } = s;
    await page.goto(`${BASE}/start`);
    await settled(page, 800);
    await page.getByLabel('Product name').fill('2% BHA liquid exfoliant');
    await page.getByRole('combobox').fill('salicylic');
    await page.getByRole('option', { name: /salicylic/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Take baseline photo' }).click();
    await page.getByRole('radio', { name: 'Sample face' }).or(page.getByRole('tab', { name: 'Sample face' })).or(page.getByRole('button', { name: 'Sample face' })).first().click();
    const use = page.getByRole('button', { name: 'Use the sample face' });
    await use.waitFor({ timeout: 45000 });
    await page.waitForTimeout(600);
    await use.click();
    await page.getByRole('button', { name: 'See your plan' }).waitFor({ timeout: 180000 });
    await page.getByText(/target is ready/).waitFor({ timeout: 240000 }).catch(() => log('  target not ready yet'));
    await settled(page, 1200);
    await shoot(page, '04-wizard-baseline');
    await page.getByRole('button', { name: 'See your plan' }).click();
    await page.locator('img[alt^="Simulated look"]').waitFor({ timeout: 240000 });
    await settled(page, 1500);
    await shoot(page, '04-wizard-target');
    await shoot(page, '04-wizard-target-page', { fullPage: true });
    await page.setViewportSize(MOBILE.viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(page, 1500);
    await shoot(page, '04-wizard-target-mobile');
    await shoot(page, '04-wizard-target-mobile-page', { fullPage: true });
    await s.context.storageState({ path: join(tmpdir(), 'kept-wizard-state.json'), indexedDB: true }).catch(() => {});
    writeFileSync(join(tmpdir(), 'kept-wizard-calls.txt'), s.calls.join('\n'));
    log('  YouCam calls:', s.calls.filter((c) => c.includes('youcam')).join(', '));
    await s.browser.close();
  },
};

const order = picked.length ? picked : Object.keys(SHOTS);
for (const name of order) {
  if (!SHOTS[name]) throw new Error(`Unknown shot ${name}. Known: ${Object.keys(SHOTS).join(', ')}`);
  log(name);
  await SHOTS[name]();
}
