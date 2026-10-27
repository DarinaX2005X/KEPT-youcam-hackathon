import { describe, expect, it } from 'vitest';
import a0 from './fixtures/a0.json';
import { engineError, ENGINE_MESSAGES, NormalizeError, normalizeAging, normalizeAnalysis, normalizeSimulation } from '@/server/youcam/normalize';
import type { RawTaskStatus } from '@/server/youcam/client';

const PROXY = '/api/youcam/asset?u=';

describe('normalizeAnalysis on a real YouCam answer (a0.json)', () => {
  const r = normalizeAnalysis(a0.data as RawTaskStatus);

  it('reads scores, overall and skin age', () => {
    expect(r.scores.redness?.ui).toBe(62);
    expect(r.scores.redness?.raw).toBeCloseTo(37.97, 2);
    expect(r.scores.acne?.ui).toBe(70);
    expect(r.overall).toBe(68.25);
    expect(r.skinAge).toBe(37);
    expect(Object.keys(r.scores).sort()).toEqual(['acne', 'pore', 'redness', 'texture']);
  });

  it('wraps 4 masks and the aligned image in the asset proxy', () => {
    expect(Object.keys(r.masks)).toHaveLength(4);
    for (const m of Object.values(r.masks)) expect(m!.startsWith(PROXY)).toBe(true);
    expect(decodeURIComponent(r.masks.acne!.slice(PROXY.length))).toContain('_acne_output.png');
    expect(r.image.startsWith(PROXY)).toBe(true);
    expect(decodeURIComponent(r.image.slice(PROXY.length))).toContain('_resize_image.jpg');
  });

  it('rejects a payload without scores', () => {
    expect(() => normalizeAnalysis({ task_status: 'success', results: { output: [] } })).toThrow(NormalizeError);
  });
});

describe('normalizeSimulation and normalizeAging', () => {
  it('wraps the simulation image', () => {
    const r = normalizeSimulation({ task_status: 'success', results: { url: 'https://yce-us.s3.amazonaws.com/a/sim.jpg?x=1' } });
    expect(r.image).toBe(PROXY + encodeURIComponent('https://yce-us.s3.amazonaws.com/a/sim.jpg?x=1'));
  });

  it('reads aging frames sorted by age', () => {
    const r = normalizeAging({
      task_status: 'success',
      results: {
        age: 29,
        output: [
          { url: 'https://yce-us.s3.amazonaws.com/a/50.jpg', res_age: 50 },
          { url: 'https://yce-us.s3.amazonaws.com/a/30.jpg', res_age: 30 },
        ],
      },
    });
    expect(r.age).toBe(29);
    expect(r.frames.map((f) => f.age)).toEqual([30, 50]);
    expect(r.frames[0].image.startsWith(PROXY)).toBe(true);
  });
});

describe('engineError', () => {
  it.each([
    ['error_src_face_too_small', 'face', ENGINE_MESSAGES.tooSmall],
    ['error_face_position_too_small', 'face', ENGINE_MESSAGES.tooSmall],
    ['error_lighting_dark', 'light', ENGINE_MESSAGES.dark],
    ['error_no_face', 'face', ENGINE_MESSAGES.noFace],
    ['error_src_face_out_of_bound', 'face', ENGINE_MESSAGES.outOfBound],
    ['error_face_position_out_of_boundary', 'face', ENGINE_MESSAGES.outOfBound],
    ['error_below_min_image_size', 'face', ENGINE_MESSAGES.smallImage],
    ['error_face_angle_leftward', 'face', ENGINE_MESSAGES.angle],
    ['error_inference', 'upstream', ENGINE_MESSAGES.generic],
    [null, 'upstream', ENGINE_MESSAGES.generic],
  ])('%s → %s', (raw, code, message) => {
    expect(engineError(raw)).toEqual({ code, message });
  });
});
