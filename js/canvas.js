// The off-screen canvas the whole piece is painted on, and the base palette.
/* ===== canvas & paint ===== */
// The painting is built off-screen, then shown as a plain image.
export const cv = document.createElement('canvas'); cv.width = 2500; cv.height = 1750;   // 10:7, a little taller than 16:9 so it fills more of a phone screen
export const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
export const PAPER = '#F2ECDD', INK = '#3A322B';   // a warm, slightly brown ink that sits with the paper
// One watercolor layer: a faint multiplied fill. Paper grain is added once afterwards, which is far cheaper than masking every layer.
export const RED = '#C63D27', BLUE = '#2F5D8A', NAVY = '#1F3A5F', ORANGE = '#EE8A3C', YELLOW = '#F2C14E';
