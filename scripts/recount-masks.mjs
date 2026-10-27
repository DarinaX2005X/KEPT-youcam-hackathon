// Recomputes the demo manifest's mask statistics with the same counting code the app uses
// (src/lib/scan/mask-core.ts), so live check-ins and sample scans are counted the same way.
// No API calls. Run: node --experimental-strip-types scripts/recount-masks.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { maskStatsFromAlpha, alphaOf } from '../src/lib/scan/mask-core.ts';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'public/demo/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let changed = 0;
for (const { scans } of manifest.trials) {
  for (const scan of scans) {
    for (const concern of ['acne', 'redness']) {
      const ref = scan.masks?.[concern];
      if (!ref?.url) continue;
      const { data, info } = await sharp(path.join(root, 'public', ref.url))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alpha = alphaOf(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.channels);
      const stats = maskStatsFromAlpha(concern, alpha, info.width, info.height);
      const before = JSON.stringify(scan.maskStats?.[concern] ?? {});
      scan.maskStats = { ...scan.maskStats, [concern]: stats };
      if (before !== JSON.stringify(stats)) {
        changed++;
        console.log(`${scan.id} ${concern}: ${before} -> ${JSON.stringify(stats)}`);
      }
    }
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${changed} values updated`);
