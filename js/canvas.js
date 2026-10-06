/**
 * Off-screen canvas and colour palette.
 *
 * The whole piece is painted on `cv`, then exported as a PNG in main.js.
 * 2500 × 1750 (10:7) — slightly taller than 16:9 so it fills phone screens.
 */

export const cv = document.createElement('canvas');
cv.width = 2500;
cv.height = 1750;

export const ctx = cv.getContext('2d');
export const W = cv.width;
export const H = cv.height;

// Paper and ink
export const PAPER = '#F2ECDD';
export const INK = '#3A322B';

// Annotation and chart accents
export const RED = '#C63D27';
export const BLUE = '#2F5D8A';
export const NAVY = '#1F3A5F';
