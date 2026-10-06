// Force-directed placement of annotation notes, and routing of their swoopy arrows.
//
// layoutNotes() takes the notes (each with a data point A, a size w x h and a preferred side sN),
// the fixed obstacles already on the page, a limit(x0, x1, side) function that says how close to the
// chart a note may come on each side, and the page bounds. It moves the notes in place (n.x, n.y),
// gives each one an arrow path (n.pts), and returns a few numbers that say how clean the result is.
import { RNG, clamp } from './random.js';
import { swoopyPts } from './pen.js';

// small geometry helpers, exported for reuse
export const segHit = (p, q, r, t) => { const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  const d1 = d(r, t, p), d2 = d(r, t, q), d3 = d(p, q, r), d4 = d(p, q, t); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); };
export const inRect = (p, b, pad) => p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
export const segRect = (p, q, b, pad) => { if (inRect(p, b, pad) || inRect(q, b, pad)) return true;
  const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad, c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  for (let k = 0; k < 4; k++) if (segHit(p, q, c[k], c[(k + 1) % 4])) return true; return false; };
export const polyRect = (pts, b, pad) => { for (let k = 0; k < pts.length - 1; k++) if (segRect(pts[k], pts[k + 1], b, pad)) return true; return false; };
export const polyPoly = (a, c) => { for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < c.length - 1; j++) if (segHit(a[i], a[i + 1], c[j], c[j + 1])) return true; return false; };
export const boxesOverlap = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export function layoutNotes({ notes, fixed, limit, W, H, M, zoom: ZOOM = null, seed = 1 }){
    const attach = n => {
      const right = n.A.x > n.x + n.w + 20, left = n.A.x < n.x - 20, level = n.A.y > n.y - 90 && n.A.y < n.y + n.h + 90;
      if ((right || left) && level) return { x: right ? n.x + n.w + 10 : n.x - 10, y: n.y + (n.th || 18) / 2 };
      const above = n.y + n.h / 2 < n.A.y; return { x: clamp(n.A.x, n.x + 18, n.x + n.w - 18), y: above ? n.y + n.h + 10 : n.y - 14 }; };
    const keepIn = n => { n.x = clamp(n.x, M, (W - M) - n.w); n.y = clamp(n.y, M, (H - M) - n.h);
      const lim = limit(n.x, n.x + n.w, n.sN); if (n.sN < 0) n.y = Math.min(n.y, lim - n.h); else n.y = Math.max(n.y, lim);
      if (n.zoomed) n.y = Math.min(n.y, ZOOM.D.y + ZOOM.D.h + 20 - n.h / 2); };

    const simulate = rnd => {
      for (const n of notes){ n.x = n.A.x - n.w / 2 + rnd.gauss(0, 90); n.y = n.sN < 0 ? limit(n.x, n.x + n.w, -1) - n.h - rnd.range(10, 160) : limit(n.x, n.x + n.w, 1) + rnd.range(10, 160); keepIn(n); }
      for (let it = 0; it < 260; it++){
        const cool = 1 - it / 260;
        for (const n of notes){ const tx = n.prefX ?? n.A.x - n.w / 2, ty = n.sN < 0 ? limit(n.x, n.x + n.w, -1) - n.h - 18 : limit(n.x, n.x + n.w, 1) + 18;
          n.fx = (tx - n.x) * .02; n.fy = (ty - n.y) * .04; }
        for (let i = 0; i < notes.length; i++){ const a = notes[i];
          for (let j = i + 1; j < notes.length; j++){ const b = notes[j]; if (!boxesOverlap(a, b, 22)) continue;
            const ox = Math.min(a.x + a.w + 22 - b.x, b.x + b.w + 22 - a.x), oy = Math.min(a.y + a.h + 22 - b.y, b.y + b.h + 22 - a.y);
            if (ox < oy){ const s = (a.x + a.w / 2 < b.x + b.w / 2) ? -1 : 1; a.fx += s * ox * .3; b.fx -= s * ox * .3; }
            else { const s = (a.y + a.h / 2 < b.y + b.h / 2) ? -1 : 1; a.fy += s * oy * .3; b.fy -= s * oy * .3; } }
          for (const f of fixed){ if (!boxesOverlap(a, f, 18)) continue;
            const ox = Math.min(a.x + a.w + 18 - f.x, f.x + f.w + 18 - a.x), oy = Math.min(a.y + a.h + 18 - f.y, f.y + f.h + 18 - a.y);
            if (ox < oy) a.fx += ((a.x + a.w / 2 < f.x + f.w / 2) ? -1 : 1) * ox * .6; else a.fy += ((a.y + a.h / 2 < f.y + f.h / 2) ? -1 : 1) * oy * .6; } }
        // arrows: a straight leader from each note to its point pushes other notes aside, and crossing leaders push their notes apart
        for (const a of notes){ const p = attach(a);
          for (const b of notes){ if (a === b) continue;
            if (segRect(p, a.A, b, 12)){ const cy = clamp(b.y + b.h / 2, Math.min(p.y, a.A.y), Math.max(p.y, a.A.y)), t = (cy - p.y) / ((a.A.y - p.y) || 1), lx = p.x + (a.A.x - p.x) * t;
              b.fx += ((b.x + b.w / 2) < lx ? -1 : 1) * 7; }
            const q = attach(b); if (a.ev !== b.ev && segHit(p, a.A, q, b.A)){ const s = a.A.x < b.A.x ? -1 : 1; a.fx += s * 5; b.fx -= s * 5; } } }
        for (const n of notes){ n.x += clamp(n.fx, -30, 30) * (.4 + .6 * cool); n.y += clamp(n.fy, -30, 30) * (.4 + .6 * cool); keepIn(n); }
      }
      // score: overlaps are worst, then crossings and leaders through notes, then distance from the points
      let sc = 0;
      for (let i = 0; i < notes.length; i++){ const a = notes[i], p = attach(a);
        for (const f of fixed) if (boxesOverlap(a, f, 8)) sc += 1000;
        for (let j = 0; j < notes.length; j++){ if (i === j) continue; const b = notes[j];
          if (j > i && boxesOverlap(a, b, 10)) sc += 1000;
          if (segRect(p, a.A, b, 6)) sc += 150;
          if (j > i && segHit(p, a.A, attach(b), b.A)) sc += 150; }
        sc += Math.hypot(a.x + a.w / 2 - a.A.x, a.y + a.h / 2 - a.A.y) / 200; }
      return sc;
    };
    // the whole layout is tried again from fresh starts until nothing overlaps or crosses (or the attempts run out)
    let bestLayout = null;
    const layoutStart = performance.now();
    for (let attempt = 0; attempt < 24; attempt++){
      if (bestLayout && performance.now() - layoutStart > 2500) break;   // keep the page responsive: settle for the best so far
    let best = null;
      for (let k = 0; k < 4; k++){ const sc = simulate(RNG(seed * 31 + k + attempt * 1009)); if (!best || sc < best.sc) best = { sc, pos: notes.map(n => [n.x, n.y]) }; if (sc < 5) break; }
      notes.forEach((n, k) => { n.x = best.pos[k][0]; n.y = best.pos[k][1]; });
  
      // legalise: any note still touching another note or a fixed block moves to the nearest clear spot
      // (on either side of the stream if it has to), where its leader also crosses no other note
      const clash = (n, x, y, strict = true) => { const b = { x, y, w: n.w, h: n.h };
        if (fixed.some(f => boxesOverlap(b, f, 14))) return true;
        if (notes.some(m => m !== n && boxesOverlap(b, m, 18))) return true;
        if (x < M || x + n.w > (W - M) || y < M || y + n.h > (H - M)) return true;
        const up = limit(x, x + n.w, -1), dn = limit(x, x + n.w, 1); if (y + n.h > up && y < dn) return true;
      if (n.zoomed && y + n.h > up) return true;   // notes about the enlargement stay above the stream
      if (n.zoomed && y + n.h / 2 > ZOOM.D.y + ZOOM.D.h + 20) return true;   // ...and beside or above it, not under it
        if (!strict) return false;
        const t = { x, y, w: n.w, h: n.h, A: n.A }, p = attach(t);
        if (notes.some(m => m !== n && (segRect(p, n.A, m, 6) || segRect(attach(m), m.A, b, 6) || segHit(p, n.A, attach(m), m.A)))) return true;
        return false; };
      for (let round = 0; round < 3; round++) for (const n of notes){
        if (!clash(n, n.x, n.y)) continue;
        for (const [strict, own] of [[true, true], [false, true], [true, false], [false, false]]){
          let bestSpot = null, bd = 1e9;
          for (let y = M; y < (H - M) - n.h; y += 18) for (let x = M; x < (W - M) - n.w; x += 26){
              if (own && !n.zoomed && ((y + n.h / 2 < n.A.y) ? -1 : 1) !== n.sN) continue;
            const d = Math.hypot(x + n.w / 2 - (n.prefX != null ? n.prefX + n.w / 2 : n.A.x), (y + n.h / 2 - n.A.y) * 1.2) + Math.hypot(x - n.x, y - n.y) * .5;
            if (d < bd && !clash(n, x, y, strict)){ bd = d; bestSpot = { x, y }; } }
          if (bestSpot){ n.x = bestSpot.x; n.y = bestSpot.y; break; }
          if (strict && own && !clash(n, n.x, n.y, false)) break;   // already clear of other notes: keep it rather than move it far
        }
      }
  
      // choose each arrow's swoop: try several bends on both sides and keep the one that hits no note, block or other arrow
      const candidates = [[.9, 1], [.9, -1], [.6, 1], [.6, -1], [1.25, 1], [1.25, -1], [1.6, 1], [1.6, -1], [2.1, 1], [2.1, -1], [.3, 1], [.3, -1], [.08, 1]];
      const shapeFor = (n, c) => { const S = attach(n), dx = n.A.x - S.x, dy = n.A.y - S.y, d = Math.hypot(dx, dy) || 1, E = { x: n.A.x - dx / d * 3, y: n.A.y - dy / d * 3 };
        return swoopyPts(S, E, c[0], { x: -dy / d * c[1], y: dx / d * c[1] }, 40); };
      const cost = (n, pts) => { let c = 0;
        for (const m of notes) if (m !== n && polyRect(pts, m, 6)) c += 10;
        for (const f of fixed) if (!f.soft && !(n.zoomed && f === ZOOM.box) && polyRect(pts.slice(0, -3), f, 4)) c += 10;
        for (const m of notes) if (m !== n && m.pts && polyPoly(pts, m.pts)) c += 10;
        if (n.arrive){ const e = pts[pts.length - 1], p = pts[pts.length - 6], dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          c += 20 * (1 - (dx * n.arrive.x + dy * n.arrive.y) / d); }   // prefer arrows that come in from the wanted direction
        return c; };
      for (let pass = 0; pass < 3; pass++) for (const n of notes){
        let bestC = 1e9;
        for (const c of candidates){ const pts = shapeFor(n, c), k = cost(n, pts) + Math.abs(c[0] - .9) * .3; if (k < bestC){ bestC = k; n.pts = pts; } } }
      const route = () => { for (const n of notes) n.pts = null;
        for (let pass = 0; pass < 3; pass++) for (const n of notes){ let bc = 1e9;
          for (const c of candidates){ const pts = shapeFor(n, c), k = cost(n, pts) + Math.abs(c[0] - .9) * .3; if (k < bc){ bc = k; n.pts = pts; n.c = bc; } } } };
      route();
      for (let fix = 0; fix < 4; fix++){
        const bad = notes.filter(n => n.c >= 10); if (!bad.length) break;
        // also try moving whatever the bad arrow runs into
        for (const n of bad.slice()) for (const m of notes) if (m !== n && !bad.includes(m) && n.pts && (polyRect(n.pts, m, 6) || (m.pts && polyPoly(n.pts, m.pts)))) bad.push(m);
        for (const n of bad){ const old = { x: n.x, y: n.y }, spots = [];
          // cheap checks first on a coarse grid, then the expensive arrow test only on the nearest few spots
          for (let y = M; y < (H - M) - n.h; y += 20) for (let x = M; x < (W - M) - n.w; x += 28){
            if (!n.zoomed && ((y + n.h / 2 < n.A.y) ? -1 : 1) !== n.sN) continue;
            spots.push({ x, y, d: Math.hypot(x + n.w / 2 - n.A.x, (y + n.h / 2 - n.A.y) * 1.2) }); }
          spots.sort((a, b) => a.d - b.d);
          let bestSpot = null, tested = 0;
          for (const sp of spots){
            if (tested >= 30) break;
            if (clash(n, sp.x, sp.y) || notes.some(m => m !== n && m.pts && polyRect(m.pts, { x: sp.x, y: sp.y, w: n.w, h: n.h }, 8))) continue;
            tested++; n.x = sp.x; n.y = sp.y; let ok = false;
            for (const c of candidates){ if (cost(n, shapeFor(n, c)) < 10){ ok = true; break; } }
            n.x = old.x; n.y = old.y; if (ok){ bestSpot = sp; break; } }
          if (bestSpot){ n.x = bestSpot.x; n.y = bestSpot.y; } }
        route();
      }
      // report what is left, so the layout can be checked
      let overlaps = 0, crossings = 0, through = 0;
      notes.forEach((a, i) => { for (const f of fixed) if (boxesOverlap(a, f, 0)) overlaps++;
        notes.forEach((b, j) => { if (j > i && boxesOverlap(a, b, 0)) overlaps++; if (j > i && polyPoly(a.pts, b.pts)) crossings++; if (i !== j && polyRect(a.pts, b, 0)) through++; });
        for (const f of fixed) if (!f.soft && !(a.zoomed && f === ZOOM.box) && polyRect(a.pts.slice(0, -3), f, 0)) through++; });
      // a clean layout is not enough: notes far from their point count against it too
      const far = notes.reduce((t, n) => { const p = attach(n); return t + Math.max(0, Math.hypot(p.x - n.A.x, p.y - n.A.y) - 300); }, 0);
      const bad = (overlaps * 10 + crossings + through) * 1000 + far;
      if (!bestLayout || bad < bestLayout.bad) bestLayout = { bad, far, overlaps, crossings, through, snap: notes.map(n => ({ x: n.x, y: n.y, pts: n.pts })) };
      if (bad === 0) break;
    }
    notes.forEach((n, k) => Object.assign(n, bestLayout.snap[k]));
    // a note marked 'corner' moves up and out into the empty top right, if it fits there with a clean arrow
    const clash = (n, x, y, strict = true) => { const b = { x, y, w: n.w, h: n.h };
      if (fixed.some(f => boxesOverlap(b, f, 14))) return true;
      if (notes.some(m => m !== n && boxesOverlap(b, m, 18))) return true;
      if (x < M || x + n.w > (W - M) || y < M || y + n.h > (H - M)) return true;
      const up = limit(x, x + n.w, -1), dn = limit(x, x + n.w, 1); if (y + n.h > up && y < dn) return true;
    if (n.zoomed && y + n.h > up) return true;   // notes about the enlargement stay above the stream
    if (n.zoomed && y + n.h / 2 > ZOOM.D.y + ZOOM.D.h + 20) return true;   // ...and beside or above it, not under it
      if (!strict) return false;
      const t = { x, y, w: n.w, h: n.h, A: n.A }, p = attach(t);
      if (notes.some(m => m !== n && (segRect(p, n.A, m, 6) || segRect(attach(m), m.A, b, 6) || segHit(p, n.A, attach(m), m.A)))) return true;
      return false; };
    const candidates = [[.9, 1], [.9, -1], [.6, 1], [.6, -1], [1.25, 1], [1.25, -1], [1.6, 1], [1.6, -1], [2.1, 1], [2.1, -1], [.3, 1], [.3, -1], [.08, 1]];
    const shapeFor = (n, c) => { const S = attach(n), dx = n.A.x - S.x, dy = n.A.y - S.y, d = Math.hypot(dx, dy) || 1, E = { x: n.A.x - dx / d * 3, y: n.A.y - dy / d * 3 };
      return swoopyPts(S, E, c[0], { x: -dy / d * c[1], y: dx / d * c[1] }, 40); };
    const cost = (n, pts) => { let c = 0;
      for (const m of notes) if (m !== n && polyRect(pts, m, 6)) c += 10;
      for (const f of fixed) if (!f.soft && !(n.zoomed && f === ZOOM.box) && polyRect(pts.slice(0, -3), f, 4)) c += 10;
      for (const m of notes) if (m !== n && m.pts && polyPoly(pts, m.pts)) c += 10;
      if (n.arrive){ const e = pts[pts.length - 1], p = pts[pts.length - 6], dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        c += 20 * (1 - (dx * n.arrive.x + dy * n.arrive.y) / d); }   // prefer arrows that come in from the wanted direction
      return c; };
    for (const n of notes.filter(m => m.ev.corner)){
      const old = { x: n.x, y: n.y, pts: n.pts }; let done = false;
      for (let y = M; y < (ZOOM ? ZOOM.D.y : H * .2) && !done; y += 12) for (let x = W - M - n.w; x > (ZOOM ? ZOOM.D.x + ZOOM.D.w - 40 : W * .7) && !done; x -= 20){
        if (clash(n, x, y)) continue;
        n.x = x; n.y = y; n.pts = null;
        for (const c of candidates){ const pts = shapeFor(n, c); if (cost(n, pts) < 10){ n.pts = pts; done = true; break; } }
        if (!done){ n.x = old.x; n.y = old.y; } }
      if (!done) Object.assign(n, old);
    }
    const { overlaps, crossings, through } = bestLayout;
    const who = [];
    notes.forEach((a, i) => { notes.forEach((b, j) => { if (i !== j && polyRect(a.pts, b, 0)) who.push(a.ev.title + ' → through ' + b.ev.title); });
      fixed.forEach((f, k) => { if (!f.soft && !(a.zoomed && f === ZOOM.box) && polyRect(a.pts.slice(0, -3), f, 0)) who.push(a.ev.title + ' → through fixed ' + k + ' ' + JSON.stringify(f)); });
      fixed.forEach((f, k) => { if (boxesOverlap(a, f, 0)) who.push(a.ev.title + ' overlaps fixed ' + k); });
      notes.forEach((b, j) => { if (j > i && boxesOverlap(a, b, 0)) who.push(a.ev.title + ' overlaps ' + b.ev.title); }); });
    const longest = notes.map(n => { const p = attach(n); return [n.ev.title.slice(0, 22), Math.round(Math.hypot(p.x - n.A.x, p.y - n.A.y))]; }).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { overlaps, crossings, arrowsThroughLabels: through, longest, who };
}
