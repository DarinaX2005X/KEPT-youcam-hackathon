import path from 'node:path';
import { CACHE } from './youcam.mjs';

/** Concerns measured on X and its repeat photos: the union of what the three demo trials need. */
export const FACE_CONCERNS = ['acne', 'redness', 'pore', 'texture', 'oiliness', 'moisture'];
/** The four zones the noise calibration is defined on (01.4.2). */
export const CALIBRATION_CONCERNS = ['acne', 'redness', 'pore', 'texture'];

export const FACES = path.join(CACHE, 'faces');
export const FACE_JPG = path.join(FACES, 'face.jpg');
export const FACE_JSON = path.join(FACES, 'face.json');

/** Repeat-photo variants of X used for calibration (and reused as the niacinamide trial frames). */
export const CALIBRATION_VARIANTS = [
  { id: 'shift-scale', label: 'shift 3 %, scale 0.97', params: { dx: 0.03, dy: 0.01, scale: 0.97 } },
  { id: 'bright-up', label: 'brightness +6 %', params: { brightness: 1.06 } },
  { id: 'bright-down-rot', label: 'brightness -6 %, rotate 1.5°', params: { brightness: 0.94, rotate: 1.5 } },
  { id: 'blur', label: 'blur 0.6 px', params: { blur: 0.6 } },
];
