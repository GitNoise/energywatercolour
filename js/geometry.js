/**
 * Shared 2D geometry for annotation layout.
 *
 * Axis-aligned boxes, segment intersection, and polyline-vs-rectangle tests
 * used by layout.js when placing notes and routing swoopy arrows.
 */

/** Whether segments pq and rt cross (proper intersection). */
export const segHit = (p, q, r, t) => {
  const orient = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  const d1 = orient(r, t, p);
  const d2 = orient(r, t, q);
  const d3 = orient(p, q, r);
  const d4 = orient(p, q, t);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
};

/** Whether point p lies inside rectangle b, expanded by pad on all sides. */
export const inRect = (p, b, pad) =>
  p.x > b.x - pad && p.x < b.x + b.w + pad
  && p.y > b.y - pad && p.y < b.y + b.h + pad;

/** Whether segment pq intersects rectangle b, expanded by pad. */
export const segRect = (p, q, b, pad) => {
  if (inRect(p, b, pad) || inRect(q, b, pad)) return true;

  const x0 = b.x - pad;
  const y0 = b.y - pad;
  const x1 = b.x + b.w + pad;
  const y1 = b.y + b.h + pad;
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];

  for (let k = 0; k < 4; k++) {
    if (segHit(p, q, corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
};

/** Whether any segment of polyline pts intersects rectangle b. */
export const polyRect = (pts, b, pad) => {
  for (let k = 0; k < pts.length - 1; k++) {
    if (segRect(pts[k], pts[k + 1], b, pad)) return true;
  }
  return false;
};

/** Whether polylines a and c share an intersecting segment pair. */
export const polyPoly = (a, c) => {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < c.length - 1; j++) {
      if (segHit(a[i], a[i + 1], c[j], c[j + 1])) return true;
    }
  }
  return false;
};

/** Whether axis-aligned boxes a and b overlap, with optional padding. */
export const boxesOverlap = (a, b, pad) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x
  && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** Whether segment pq passes through the interior of rectangle r (sampled). */
export const segBox = (p, q, r, pad, samples = 24) => {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;

  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    const x = p.x + (q.x - p.x) * t;
    const y = p.y + (q.y - p.y) * t;
    if (x > x0 && x < x1 && y > y0 && y < y1) return true;
  }
  return false;
};
