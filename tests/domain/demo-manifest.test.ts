import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeVerdict, materializeManifest, NOISE } from '@/lib/domain';
import type { DemoManifest } from '@/lib/domain/types';

const manifest: DemoManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../public/demo/manifest.json'), 'utf8'),
);

describe('demo manifest', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  let n = 0;
  const shelf = materializeManifest(manifest, now, () => `id${++n}`);

  it('was calibrated with the noise the engine uses', () => {
    expect(manifest.noise).toBe(NOISE);
  });

  it('gives each sample trial the verdict the demo story needs', () => {
    const byName = Object.fromEntries(
      shelf.trials.map(trial => [
        trial.product.name,
        computeVerdict(trial, shelf.scans.filter(s => s.trialId === trial.id), now).kind,
      ]),
    );
    expect(byName).toEqual({
      '10% niacinamide toner': 'not_enough',
      '2% salicylic acid serum': 'working',
      '0.05% retinal cream': 'purging',
    });
  });

  it('points every photo and mask at a file that exists', () => {
    for (const { scans } of manifest.trials) {
      for (const scan of scans) {
        const refs = [scan.photo, ...Object.values(scan.masks)];
        for (const ref of refs) {
          if (!ref || !('url' in ref)) throw new Error('demo refs must be urls');
          expect(fs.existsSync(path.join(__dirname, '../../public', ref.url))).toBe(true);
        }
      }
    }
  });
});
