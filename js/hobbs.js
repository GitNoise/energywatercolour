/**
 * Tyler Hobbs-style polygon deformation for band outlines.
 *
 * After Tyler Hobbs, "How to Hack a Painting": each edge is split near its
 * midpoint and a new vertex pushed outward. Position, angle, and distance are
 * Gaussian; distance scales with edge length and per-vertex variance.
 *
 * Pushes are squashed vertically (`ky`) so edges stay close to the data and
 * the watercolour bleed runs along the time axis.
 *
 * Public API: `P`, `shape`, `deform`, `deformN`, `toPath`.
 */
import { pathRound } from 'd3';
import { clamp } from './random.js';

export const P = {
  posSd: 0.15,      // where along the edge to split (Gaussian around midpoint)
  angleSd: 0.35,    // push direction jitter
  inheritSd: 0.1,   // variance inherited by child vertices
  vMin: 0.02,
  vMax: 0.6,
  ky: 0.34,         // vertical component of each push (flow is left → right)
};

function orient(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area < 0 ? points.slice().reverse() : points;
}

function resample(points, segmentLength) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / segmentLength));
    for (let k = 0; k < n; k++) {
      out.push({
        x: a.x + (b.x - a.x) * k / n,
        y: a.y + (b.y - a.y) * k / n,
      });
    }
  }
  return out;
}

/** Resample a closed polygon and attach variance + ky at each vertex. */
export function shape(points, segmentLength, varianceAt, kyAt = () => P.ky) {
  return resample(orient(points), segmentLength).map(q => ({
    x: q.x,
    y: q.y,
    v: clamp(varianceAt(q), P.vMin, P.vMax),
    ky: kyAt(q),
  }));
}

/** One subdivision pass: each edge becomes two edges with a pushed midpoint. */
export function deform(poly, R) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);

    const t = clamp(R.gauss(0.5, P.posSd), 0.05, 0.95);
    const ang = Math.atan2(-dx, dy) + R.gauss(0, P.angleSd);
    const mag = Math.abs(R.gauss(0, a.v)) * len;
    const inherit = () => clamp(a.v * R.gauss(1, P.inheritSd), P.vMin, P.vMax);
    const ky = a.ky ?? P.ky;

    out.push(
      { x: a.x, y: a.y, v: inherit(), ky },
      {
        x: a.x + dx * t + Math.cos(ang) * mag,
        y: a.y + dy * t + Math.sin(ang) * mag * ky,
        v: inherit(),
        ky,
      },
    );
  }
  return out;
}

export const deformN = (poly, R, passes) => {
  let p = poly;
  for (let i = 0; i < passes; i++) p = deform(p, R);
  return p;
};

/** Closed polygon as an SVG path string (one decimal place). */
export const toPath = points => {
  const path = pathRound(1);
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
  path.closePath();
  return path.toString();
};
