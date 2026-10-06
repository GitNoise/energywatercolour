/**
 * Force-directed placement of annotation notes and routing of swoopy arrows.
 *
 * `layoutNotes()` takes:
 * - `notes` — each with a data point A, size w×h, and preferred side sN
 * - `fixed` — obstacle boxes already on the page
 * - `limit(x0, x1, side)` — how close to the chart a note may come
 * - page bounds and optional zoom magnifier
 *
 * It writes `n.x`, `n.y`, and `n.pts` (arrow path) on each note.
 */
import { RNG, clamp } from './random.js';
import { swoopyPts } from './pen.js';
import { boxesOverlap, polyPoly, polyRect, segHit, segRect } from './geometry.js';

// [subtended angle, bulge sign] pairs tried when routing each arrow
const ARROW_CANDIDATES = [
  [0.9, 1], [0.9, -1], [0.6, 1], [0.6, -1],
  [1.25, 1], [1.25, -1], [1.6, 1], [1.6, -1],
  [2.1, 1], [2.1, -1], [0.3, 1], [0.3, -1], [0.08, 1],
];

export function layoutNotes({ notes, fixed, limit, W, H, M, zoom: ZOOM = null, seed = 1 }) {

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Where the arrow leaves the note box. */
  const attach = n => {
    const right = n.A.x > n.x + n.w + 20;
    const left = n.A.x < n.x - 20;
    const level = n.A.y > n.y - 90 && n.A.y < n.y + n.h + 90;

    if ((right || left) && level) {
      return {
        x: right ? n.x + n.w + 10 : n.x - 10,
        y: n.y + (n.th || 18) / 2,
      };
    }

    const above = n.y + n.h / 2 < n.A.y;
    return {
      x: clamp(n.A.x, n.x + 18, n.x + n.w - 18),
      y: above ? n.y + n.h + 10 : n.y - 14,
    };
  };

  /** Clamp note inside margins and stream clearance. */
  const keepIn = n => {
    n.x = clamp(n.x, M, (W - M) - n.w);
    n.y = clamp(n.y, M, (H - M) - n.h);

    const lim = limit(n.x, n.x + n.w, n.sN);
    if (n.sN < 0) n.y = Math.min(n.y, lim - n.h);
    else n.y = Math.max(n.y, lim);

    if (n.zoomed) n.y = Math.min(n.y, ZOOM.D.y + ZOOM.D.h + 20 - n.h / 2);
  };

  /** Whether note at (x, y) overlaps obstacles or other notes. */
  const clash = (n, x, y, strict = true) => {
    const box = { x, y, w: n.w, h: n.h };

    if (fixed.some(f => boxesOverlap(box, f, 14))) return true;
    if (notes.some(m => m !== n && boxesOverlap(box, m, 18))) return true;
    if (x < M || x + n.w > (W - M) || y < M || y + n.h > (H - M)) return true;

    const upper = limit(x, x + n.w, -1);
    const lower = limit(x, x + n.w, 1);
    if (y + n.h > upper && y < lower) return true;
    if (n.zoomed && y + n.h > upper) return true;
    if (n.zoomed && y + n.h / 2 > ZOOM.D.y + ZOOM.D.h + 20) return true;

    if (!strict) return false;

    const start = attach({ ...n, x, y, w: n.w, h: n.h, A: n.A });
    return notes.some(m => {
      if (m === n) return false;
      const otherStart = attach(m);
      return segRect(start, n.A, m, 6)
        || segRect(otherStart, m.A, box, 6)
        || segHit(start, n.A, otherStart, m.A);
    });
  };

  /** Build a candidate swoopy path for note n. */
  const shapeFor = (n, candidate) => {
    const start = attach(n);
    const dx = n.A.x - start.x;
    const dy = n.A.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    const end = { x: n.A.x - dx / dist * 3, y: n.A.y - dy / dist * 3 };
    const bulge = { x: -dy / dist * candidate[1], y: dx / dist * candidate[1] };
    return swoopyPts(start, end, candidate[0], bulge, 40);
  };

  /** Penalty for arrow paths that cross notes, fixed blocks, or other arrows. */
  const cost = (n, pts) => {
    let c = 0;

    for (const m of notes) {
      if (m !== n && polyRect(pts, m, 6)) c += 10;
    }
    for (const f of fixed) {
      if (!f.soft && !(n.zoomed && f === ZOOM.box) && polyRect(pts.slice(0, -3), f, 4)) c += 10;
    }
    for (const m of notes) {
      if (m !== n && m.pts && polyPoly(pts, m.pts)) c += 10;
    }

    if (n.arrive) {
      const end = pts[pts.length - 1];
      const near = pts[pts.length - 6];
      const dx = end.x - near.x;
      const dy = end.y - near.y;
      const dist = Math.hypot(dx, dy) || 1;
      c += 20 * (1 - (dx * n.arrive.x + dy * n.arrive.y) / dist);
    }

    return c;
  };

  /** Pick the lowest-cost arrow path for every note (three refinement passes). */
  const route = () => {
    for (const n of notes) n.pts = null;

    for (let pass = 0; pass < 3; pass++) {
      for (const n of notes) {
        let bestCost = 1e9;
        for (const candidate of ARROW_CANDIDATES) {
          const pts = shapeFor(n, candidate);
          const k = cost(n, pts) + Math.abs(candidate[0] - 0.9) * 0.3;
          if (k < bestCost) {
            bestCost = k;
            n.pts = pts;
            n.c = bestCost;
          }
        }
      }
    }
  };

  // -------------------------------------------------------------------------
  // Force simulation (one attempt)
  // -------------------------------------------------------------------------

  const simulate = rnd => {
    for (const n of notes) {
      n.x = n.A.x - n.w / 2 + rnd.gauss(0, 90);
      n.y = n.sN < 0
        ? limit(n.x, n.x + n.w, -1) - n.h - rnd.range(10, 160)
        : limit(n.x, n.x + n.w, 1) + rnd.range(10, 160);
      keepIn(n);
    }

    for (let it = 0; it < 260; it++) {
      const cool = 1 - it / 260;

      // Attraction towards preferred position beside anchor point A
      for (const n of notes) {
        const targetX = n.prefX ?? n.A.x - n.w / 2;
        const targetY = n.sN < 0
          ? limit(n.x, n.x + n.w, -1) - n.h - 18
          : limit(n.x, n.x + n.w, 1) + 18;
        n.fx = (targetX - n.x) * 0.02;
        n.fy = (targetY - n.y) * 0.04;
      }

      // Repulsion between notes and from fixed obstacles
      for (let i = 0; i < notes.length; i++) {
        const a = notes[i];

        for (let j = i + 1; j < notes.length; j++) {
          const b = notes[j];
          if (!boxesOverlap(a, b, 22)) continue;

          const ox = Math.min(a.x + a.w + 22 - b.x, b.x + b.w + 22 - a.x);
          const oy = Math.min(a.y + a.h + 22 - b.y, b.y + b.h + 22 - a.y);

          if (ox < oy) {
            const sign = (a.x + a.w / 2 < b.x + b.w / 2) ? -1 : 1;
            a.fx += sign * ox * 0.3;
            b.fx -= sign * ox * 0.3;
          } else {
            const sign = (a.y + a.h / 2 < b.y + b.h / 2) ? -1 : 1;
            a.fy += sign * oy * 0.3;
            b.fy -= sign * oy * 0.3;
          }
        }

        for (const f of fixed) {
          if (!boxesOverlap(a, f, 18)) continue;
          const ox = Math.min(a.x + a.w + 18 - f.x, f.x + f.w + 18 - a.x);
          const oy = Math.min(a.y + a.h + 18 - f.y, f.y + f.h + 18 - a.y);
          if (ox < oy) {
            a.fx += ((a.x + a.w / 2 < f.x + f.w / 2) ? -1 : 1) * ox * 0.6;
          } else {
            a.fy += ((a.y + a.h / 2 < f.y + f.h / 2) ? -1 : 1) * oy * 0.6;
          }
        }
      }

      // Arrows push notes out of their way; crossing arrows push apart
      for (const a of notes) {
        const start = attach(a);
        for (const b of notes) {
          if (a === b) continue;

          if (segRect(start, a.A, b, 12)) {
            const cy = clamp(b.y + b.h / 2, Math.min(start.y, a.A.y), Math.max(start.y, a.A.y));
            const t = (cy - start.y) / ((a.A.y - start.y) || 1);
            const lx = start.x + (a.A.x - start.x) * t;
            b.fx += ((b.x + b.w / 2) < lx ? -1 : 1) * 7;
          }

          const otherStart = attach(b);
          if (a.ev !== b.ev && segHit(start, a.A, otherStart, b.A)) {
            const sign = a.A.x < b.A.x ? -1 : 1;
            a.fx += sign * 5;
            b.fx -= sign * 5;
          }
        }
      }

      for (const n of notes) {
        n.x += clamp(n.fx, -30, 30) * (0.4 + 0.6 * cool);
        n.y += clamp(n.fy, -30, 30) * (0.4 + 0.6 * cool);
        keepIn(n);
      }
    }

    // Score this layout
    let score = 0;
    for (let i = 0; i < notes.length; i++) {
      const a = notes[i];
      const start = attach(a);

      for (const f of fixed) {
        if (boxesOverlap(a, f, 8)) score += 1000;
      }
      for (let j = 0; j < notes.length; j++) {
        if (i === j) continue;
        const b = notes[j];
        if (j > i && boxesOverlap(a, b, 10)) score += 1000;
        if (segRect(start, a.A, b, 6)) score += 150;
        if (j > i && segHit(start, a.A, attach(b), b.A)) score += 150;
      }
      score += Math.hypot(a.x + a.w / 2 - a.A.x, a.y + a.h / 2 - a.A.y) / 200;
    }
    return score;
  };

  // -------------------------------------------------------------------------
  // Multi-start search
  // -------------------------------------------------------------------------

  let bestLayout = null;
  const layoutStart = performance.now();

  for (let attempt = 0; attempt < 24; attempt++) {
    if (bestLayout && performance.now() - layoutStart > 2500) break;

    // Run several simulations per attempt; keep the best positions
    let best = null;
    for (let k = 0; k < 4; k++) {
      const score = simulate(RNG(seed * 31 + k + attempt * 1009));
      if (!best || score < best.score) best = { score, pos: notes.map(n => [n.x, n.y]) };
      if (score < 5) break;
    }
    notes.forEach((n, k) => {
      n.x = best.pos[k][0];
      n.y = best.pos[k][1];
    });

    // Grid search for any note still in clash
    for (let round = 0; round < 3; round++) {
      for (const n of notes) {
        if (!clash(n, n.x, n.y)) continue;

        for (const [strict, ownSide] of [[true, true], [false, true], [true, false], [false, false]]) {
          let bestSpot = null;
          let bestDist = 1e9;

          for (let y = M; y < (H - M) - n.h; y += 18) {
            for (let x = M; x < (W - M) - n.w; x += 26) {
              if (ownSide && !n.zoomed && ((y + n.h / 2 < n.A.y) ? -1 : 1) !== n.sN) continue;

              const d = Math.hypot(
                x + n.w / 2 - (n.prefX != null ? n.prefX + n.w / 2 : n.A.x),
                (y + n.h / 2 - n.A.y) * 1.2,
              ) + Math.hypot(x - n.x, y - n.y) * 0.5;

              if (d < bestDist && !clash(n, x, y, strict)) {
                bestDist = d;
                bestSpot = { x, y };
              }
            }
          }

          if (bestSpot) {
            n.x = bestSpot.x;
            n.y = bestSpot.y;
            break;
          }
          if (strict && ownSide && !clash(n, n.x, n.y, false)) break;
        }
      }
    }

    route();

    // Nudge notes whose arrows still score badly
    for (let fix = 0; fix < 4; fix++) {
      const bad = notes.filter(n => n.c >= 10);
      if (!bad.length) break;

      for (const n of bad.slice()) {
        for (const m of notes) {
          if (m !== n && !bad.includes(m) && n.pts && (
            polyRect(n.pts, m, 6) || (m.pts && polyPoly(n.pts, m.pts))
          )) bad.push(m);
        }
      }

      for (const n of bad) {
        const old = { x: n.x, y: n.y };
        const spots = [];

        for (let y = M; y < (H - M) - n.h; y += 20) {
          for (let x = M; x < (W - M) - n.w; x += 28) {
            if (!n.zoomed && ((y + n.h / 2 < n.A.y) ? -1 : 1) !== n.sN) continue;
            spots.push({ x, y, d: Math.hypot(x + n.w / 2 - n.A.x, (y + n.h / 2 - n.A.y) * 1.2) });
          }
        }
        spots.sort((a, b) => a.d - b.d);

        let bestSpot = null;
        let tested = 0;
        for (const sp of spots) {
          if (tested >= 30) break;
          if (clash(n, sp.x, sp.y) || notes.some(m => m !== n && m.pts && polyRect(m.pts, { x: sp.x, y: sp.y, w: n.w, h: n.h }, 8))) continue;

          tested++;
          n.x = sp.x;
          n.y = sp.y;
          let ok = false;
          for (const c of ARROW_CANDIDATES) {
            if (cost(n, shapeFor(n, c)) < 10) { ok = true; break; }
          }
          n.x = old.x;
          n.y = old.y;
          if (ok) { bestSpot = sp; break; }
        }

        if (bestSpot) {
          n.x = bestSpot.x;
          n.y = bestSpot.y;
        }
      }
      route();
    }

    // Rank this attempt
    let overlaps = 0;
    let crossings = 0;
    let through = 0;

    notes.forEach((a, i) => {
      for (const f of fixed) if (boxesOverlap(a, f, 0)) overlaps++;
      notes.forEach((b, j) => {
        if (j > i && boxesOverlap(a, b, 0)) overlaps++;
        if (j > i && polyPoly(a.pts, b.pts)) crossings++;
        if (i !== j && polyRect(a.pts, b, 0)) through++;
      });
      for (const f of fixed) {
        if (!f.soft && !(a.zoomed && f === ZOOM.box) && polyRect(a.pts.slice(0, -3), f, 0)) through++;
      }
    });

    const far = notes.reduce((total, n) => {
      const start = attach(n);
      return total + Math.max(0, Math.hypot(start.x - n.A.x, start.y - n.A.y) - 300);
    }, 0);

    const bad = (overlaps * 10 + crossings + through) * 1000 + far;
    if (!bestLayout || bad < bestLayout.bad) {
      bestLayout = { bad, snap: notes.map(n => ({ x: n.x, y: n.y, pts: n.pts })) };
    }
    if (bad === 0) break;
  }

  notes.forEach((n, k) => Object.assign(n, bestLayout.snap[k]));

  // Corner notes (e.g. solar overtakes other renewables) prefer the magnifier area
  for (const n of notes.filter(m => m.ev.corner)) {
    const old = { x: n.x, y: n.y, pts: n.pts };
    let done = false;

    for (let y = M; y < (ZOOM ? ZOOM.D.y : H * 0.2) && !done; y += 12) {
      for (let x = W - M - n.w; x > (ZOOM ? ZOOM.D.x + ZOOM.D.w - 40 : W * 0.7) && !done; x -= 20) {
        if (clash(n, x, y)) continue;
        n.x = x;
        n.y = y;
        n.pts = null;

        for (const c of ARROW_CANDIDATES) {
          const pts = shapeFor(n, c);
          if (cost(n, pts) < 10) {
            n.pts = pts;
            done = true;
            break;
          }
        }
        if (!done) {
          n.x = old.x;
          n.y = old.y;
        }
      }
    }
    if (!done) Object.assign(n, old);
  }
}
