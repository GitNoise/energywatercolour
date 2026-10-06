/**
 * Seeded randomness.
 *
 * Every value in a render derives from one integer seed, so Repaint this seed
 * reproduces the same hand-drawn lines, Hobbs edges, and note layouts.
 */

/**
 * Mulberry32 PRNG with Gaussian and helper methods.
 * @param {number} seed
 */
export function RNG(seed) {
  let state = seed >>> 0;

  const next = () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const gauss = (mean = 0, sd = 1) => {
    let u = 0;
    while (u === 0) u = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };

  return {
    next,
    gauss,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: () => Math.floor(next() * 4294967296),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
  };
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** 1D smooth noise in [-1, 1], built from a seeded lookup table. */
export function makeNoise(R) {
  const table = Array.from({ length: 512 }, () => R.next() * 2 - 1);
  return t => {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return table[i & 511] * (1 - u) + table[(i + 1) & 511] * u;
  };
}
