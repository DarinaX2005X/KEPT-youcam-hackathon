/**
 * Spread of YouCam ui scores between repeat photos of the same face, in points.
 * A change counts only when |Δ| > NOISE; a strong change is > 2 × NOISE.
 * Placeholder until the 01.4 calibration; MAIN replaces it with the measured value.
 */
export const NOISE = 4;
