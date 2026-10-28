// Renders docs/readme/logo-card.png: the Kept logo on a filled white card with rounded corners,
// so it reads on both GitHub themes. Chrome renders the wordmark in Onest from Google Fonts.
// Run: PLAYWRIGHT_DIR=<folder with node_modules/playwright> node docs/readme/render-logo-card.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(process.env.PLAYWRIGHT_DIR || ROOT, 'node_modules', 'x.js'));
const { chromium } = require('playwright');

const logo = readFileSync(join(ROOT, 'public', 'brand', 'logo.svg'), 'utf8');

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@700&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; background: transparent; }
  .card {
    display: inline-flex; align-items: center; justify-content: center;
    width: 520px; height: 176px; box-sizing: border-box;
    background: #FFFFFF; border: 1.5px solid #E3DBD1; border-radius: 36px;
    box-shadow: 0 1px 2px rgb(40 34 26 / .08), 0 10px 26px -10px rgb(40 34 26 / .22);
  }
  .card svg { width: 330px; height: auto; display: block; }
  .wrap { padding: 14px 18px 30px; display: inline-block; }
</style></head>
<body><div class="wrap"><div class="card">${logo}</div></div></body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const ok = await page.evaluate(() => document.fonts.check('700 44px Onest'));
if (!ok) throw new Error('Onest did not load');
// The logo's viewBox has spare room after the wordmark; fit it to the drawn mark and word so the card centres them.
await page.evaluate(() => {
  const svg = document.querySelector('.card svg');
  const b = svg.getBBox();
  const pad = 2;
  svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
  svg.style.width = '300px';
});
await page.locator('.wrap').screenshot({ path: join(HERE, 'logo-card.png'), omitBackground: true });
await browser.close();
console.log('docs/readme/logo-card.png');
