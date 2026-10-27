import { describe, expect, it } from 'vitest';
import { allowedAssetUrl, assetContentType } from '@/server/youcam/asset';
import { parseTaskRequest, quotaTaskOf, youcamTaskOf } from '@/server/youcam/validate';

describe('parseTaskRequest', () => {
  it('accepts an analysis and builds the YouCam body', () => {
    const p = parseTaskRequest({ kind: 'analysis', fileId: 'f1', concerns: ['acne', 'redness', 'pore', 'texture'] });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(quotaTaskOf(p.request)).toEqual({ kind: 'analysis', concerns: 4 });
    expect(youcamTaskOf(p.request)).toEqual({
      path: 'skin-analysis',
      body: { src_file_id: 'f1', dst_actions: ['acne', 'redness', 'pore', 'texture'], format: 'json' },
    });
  });

  it.each([
    [{ kind: 'analysis', fileId: 'f', concerns: [] }],
    [{ kind: 'analysis', fileId: 'f', concerns: ['acne', 'hd_acne'] }],
    [{ kind: 'analysis', fileId: 'f', concerns: Array(9).fill('acne') }],
    [{ kind: 'analysis', fileId: 'x'.repeat(201), concerns: ['acne'] }],
    [{ kind: 'analysis', fileId: 42, concerns: ['acne'] }],
    [{ kind: 'simulation', fileId: 'f', intensities: { acne: 0 } }],
    [{ kind: 'simulation', fileId: 'f', intensities: { acne: 1.2 } }],
    [{ kind: 'simulation', fileId: 'f', intensities: { pore: 0.5 } }],
    [{ kind: 'makeup', fileId: 'f' }],
    [null],
  ])('rejects %j', (body) => {
    expect(parseTaskRequest(body).ok).toBe(false);
  });

  it('drops zero intensities and spreads the rest into the simulation body', () => {
    const p = parseTaskRequest({ kind: 'simulation', fileId: 'f', intensities: { acne: 0.6, redness: 0.6, pores: 0 } });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(youcamTaskOf(p.request)).toEqual({ path: 'skin-simulation', body: { src_file_id: 'f', acne: 0.6, redness: 0.6 } });
    expect(quotaTaskOf(p.request)).toEqual({ kind: 'simulation', concerns: 2 });
  });

  it('accepts aging', () => {
    const p = parseTaskRequest({ kind: 'aging', fileId: 'f' });
    expect(p.ok && youcamTaskOf(p.request)).toEqual({ path: 'aging', body: { src_file_id: 'f' } });
  });
});

describe('asset allow-list', () => {
  it.each([
    'https://yce-us.s3-accelerate.amazonaws.com/ttl30/x/mask.png?X-Amz-Signature=1',
    'https://yce-us.s3.us-west-2.amazonaws.com/results/resized_image.jpg',
  ])('allows %s', (u) => expect(allowedAssetUrl(u)).not.toBeNull());

  it.each([
    'http://yce-us.s3-accelerate.amazonaws.com/a.png',
    'https://evil.example.com/yce-us/a.png',
    'https://other-bucket.s3.amazonaws.com/a.png',
    'https://s3.amazonaws.com/other/yce-us/a.png',
    'https://yce-us.s3.amazonaws.com.evil.com/a.png',
    'https://localhost/yce-x/a.png',
    // Anyone can create a bucket with the yce- prefix, so only YouCam's exact buckets pass.
    'https://yce-attacker.s3.amazonaws.com/x.html',
    'https://s3.amazonaws.com/yce-attacker/x.html',
    'https://s3-us-west-2.amazonaws.com/yce-us/results/resized_image.jpg',
    'not a url',
    null,
  ])('blocks %s', (u) => expect(allowedAssetUrl(u)).toBeNull());

  it('falls back to the extension for generic content types', () => {
    const u = new URL('https://yce-us.s3.amazonaws.com/a/mask.png?sig=1');
    expect(assetContentType(u, 'binary/octet-stream')).toBe('image/png');
    expect(assetContentType(u, 'image/jpeg')).toBe('image/jpeg');
  });

  it('never serves a non-image type', () => {
    expect(assetContentType(new URL('https://yce-us.s3.amazonaws.com/x.html'), 'text/html')).toBeNull();
    expect(assetContentType(new URL('https://yce-us.s3.amazonaws.com/x'), 'binary/octet-stream')).toBeNull();
  });
});
