// Seeded randomness: everything in a render follows from one seed.
/* ===== randomness ===== */
export function RNG(seed){ let a = seed >>> 0;
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = (m = 0, s = 1) => { let u = 0; while (u === 0) u = next(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()); };
  return { next, gauss, range: (l, h) => l + (h - l) * next(), int: () => Math.floor(next() * 4294967296), pick: a => a[Math.floor(next() * a.length)], chance: p => next() < p };
}
export const clamp = (x, l, h) => Math.max(l, Math.min(h, x));
export function makeNoise(R){ const p = Array.from({ length: 512 }, () => R.next() * 2 - 1);
  return t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return p[i & 511] * (1 - u) + p[(i + 1) & 511] * u; }; }
