// Renders docs/gallery/00-thumbnail.png (1800 × 1200, 3:2): the Devpost cover. Built to read at
// thumbnail size: the Kept mark, two large prints of the sample trial (day 0 with YouCam's acne map,
// day 56 after it) and the verdict, almost no text. Chrome renders it with Onest from Google Fonts.
// Run: PLAYWRIGHT_DIR=<folder with node_modules/playwright> node docs/gallery/render-thumbnail.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(process.env.PLAYWRIGHT_DIR || ROOT, 'node_modules', 'x.js'));
const { chromium } = require('playwright');

const demo = (p) => pathToFileURL(join(ROOT, 'public', 'demo', 'salicylic-serum', p)).href;
const mark = readFileSync(join(ROOT, 'public', 'brand', 'mark.svg'), 'utf8');

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1800px; height: 1200px; overflow: hidden; font-family: Onest, sans-serif; }
  .cover {
    position: relative; width: 1800px; height: 1200px; overflow: hidden;
    background:
      radial-gradient(1100px 800px at 78% 42%, #2c7158 0%, rgba(44,113,88,0) 70%),
      linear-gradient(150deg, #1f5a47 0%, #163c30 62%, #10302a 100%);
  }
  /* soft grain so the large field doesn't band */
  .cover::after {
    content: ''; position: absolute; inset: 0; opacity: .06; pointer-events: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
  }
  .brand { position: absolute; left: 120px; top: 300px; display: flex; align-items: center; gap: 30px; }
  .brand .m { width: 150px; height: 150px; }
  .brand .m svg { width: 100%; height: 100%; }
  .brand .m svg rect:first-of-type { stroke: #cfe5da; stroke-opacity: .8; }
  .brand .m svg rect:nth-of-type(2) { fill: #fdfbf8; }
  .word { color: #fdfbf8; font-weight: 700; font-size: 184px; letter-spacing: -0.045em; line-height: 1; margin-top: -18px; }
  .line { position: absolute; left: 128px; top: 530px; color: #cfe5da; font-weight: 500; font-size: 54px; letter-spacing: -0.015em; line-height: 1.2; white-space: nowrap; }

  .print {
    position: absolute; width: 500px; padding: 18px 18px 22px; border-radius: 34px; background: #fdfbf8;
    box-shadow: 0 2px 4px rgba(10,30,24,.25), 0 40px 90px -20px rgba(5,20,16,.6);
  }
  .photo { position: relative; width: 100%; aspect-ratio: 3/4; border-radius: 22px; overflow: hidden; background: #efe9e1; }
  .photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }
  .mask { position: absolute; inset: 0; background: #e0563f; -webkit-mask-size: cover; -webkit-mask-position: 50% 30%; mask-size: cover; mask-position: 50% 30%; }
  .cap { display: flex; justify-content: flex-start; gap: 18px; align-items: center; margin-top: 18px; padding: 0 6px; }
  .day { color: #17221d; font-weight: 700; font-size: 40px; letter-spacing: -0.02em; }
  .chip { font-weight: 600; font-size: 32px; padding: 8px 18px; border-radius: 14px; }
  .bad { color: #b4493a; background: #f6e0da; }
  .good { color: #1f6b4f; background: #dcefe5; }
  .p0 { left: 790px; top: 110px; transform: rotate(-5deg); }
  .p56 { left: 1220px; top: 250px; transform: rotate(4deg); }

  .verdict {
    position: absolute; left: 120px; top: 760px; display: flex; align-items: center; gap: 26px;
    padding: 28px 44px 28px 30px; border-radius: 40px; background: #dcefe5; color: #1f5a47;
    box-shadow: 0 30px 70px -24px rgba(5,20,16,.7);
  }
  .verdict .ic { width: 84px; height: 84px; border-radius: 50%; background: #fdfbf8; display: grid; place-items: center; }
  .verdict b { font-size: 84px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .verdict span { display: block; font-size: 34px; font-weight: 600; color: #1f6b4f; margin-top: 8px; letter-spacing: -0.01em; }
</style></head><body>
<div class="cover">
  <div class="brand"><div class="m">${mark}</div><div class="word">kept</div></div>
  <div class="line">Is your skincare working?</div>

  <div class="print p0">
    <div class="photo"><img src="${demo('day-0/photo.jpg')}"><div class="mask" style="-webkit-mask-image:url('${demo('day-0/mask-acne.png')}');mask-image:url('${demo('day-0/mask-acne.png')}')"></div></div>
    <div class="cap"><span class="day">Day 0</span><span class="chip bad">49 blemishes</span></div>
  </div>
  <div class="print p56">
    <div class="photo"><img src="${demo('day-56/photo.jpg')}"><div class="mask" style="-webkit-mask-image:url('${demo('day-56/mask-acne.png')}');mask-image:url('${demo('day-56/mask-acne.png')}')"></div></div>
    <div class="cap"><span class="day">Day 56</span><span class="chip good">11 blemishes</span></div>
  </div>

  <div class="verdict">
    <div class="ic"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1f5a47" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/></svg></div>
    <div><b>Working</b><span>Measured with YouCam Skin AI</span></div>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
// Loaded from a file so the page may read the local demo photos.
const tmp = join(HERE, '.thumbnail.html');
writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
if (!(await page.evaluate(() => document.fonts.check('700 80px Onest')))) throw new Error('Onest did not load');
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: join(HERE, '00-thumbnail.png') });
await browser.close();
rmSync(tmp);
console.log('docs/gallery/00-thumbnail.png');
