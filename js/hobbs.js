import { clamp } from './random.js';

/* ===== Hobbs deformation, for the band outlines =====
   Each edge is broken near its middle and a new vertex pushed outward (Gaussian position, angle and distance),
   recursively, with the distance scaled by edge length and by that edge's variance.
   Pushes are squashed vertically, so band edges stay close to their data and the bleed runs with the time axis. */
// ky: how much of each push is allowed across the flow (vertical). The stream runs left to right, so most movement goes along it.
export const P = { posSd: .15, angleSd: .35, inheritSd: .1, vMin: .02, vMax: .6, ky: .34 };
export function orient(p){ let a = 0; for (let i = 0; i < p.length; i++){ const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; } return a < 0 ? p.slice().reverse() : p; }
export function resample(p, seg){ const o = []; for (let i = 0; i < p.length; i++){ const a = p[i], b = p[(i + 1) % p.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / seg)); for (let k = 0; k < n; k++) o.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); } return o; }
export const shape = (pts, seg, vfn, kyfn = () => P.ky) => resample(orient(pts), seg).map(q => ({ x: q.x, y: q.y, v: clamp(vfn(q), P.vMin, P.vMax), ky: kyfn(q) }));
export function deform(poly, R){ const out = [];
  for (let i = 0; i < poly.length; i++){ const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const t = clamp(R.gauss(.5, P.posSd), .05, .95), ang = Math.atan2(-dx, dy) + R.gauss(0, P.angleSd), mag = Math.abs(R.gauss(0, a.v)) * len;
    const ch = () => clamp(a.v * R.gauss(1, P.inheritSd), P.vMin, P.vMax), ky = a.ky ?? P.ky;
    out.push({ x: a.x, y: a.y, v: ch(), ky }, { x: a.x + dx * t + Math.cos(ang) * mag, y: a.y + dy * t + Math.sin(ang) * mag * ky, v: ch(), ky }); }
  return out; }
export const deformN = (p, R, n) => { for (let i = 0; i < n; i++) p = deform(p, R); return p; };
export function trace2(c, p){ c.beginPath(); c.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y); c.closePath(); }
export const toPath = p => 'M' + p.map(q => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L') + ' Z';
