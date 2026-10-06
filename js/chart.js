// The composition: data -> bump stream -> watercolour bands -> annotations, as a list of drawing tasks.
import { RNG, makeNoise, clamp } from './random.js';
import { cv, ctx, W, H, PAPER, INK, RED, BLUE, NAVY, ORANGE, YELLOW } from './canvas.js';
import { YEARS, SOURCES, ENERGY, COLORS, fmt } from './data.js';
import { watercolor, loadImage, darken } from './watercolor.js';
import { P, shape, deformN, toPath } from './hobbs.js';
import { pen, arcPts, dot, label, para, swoopyPts, arrow } from './pen.js';
import { layoutNotes } from './layout.js';

// two levels of note: the main story (primary) and the asides (secondary)
const TYPE = { primary: { title: 22, body: 18, width: .14, arrow: 1.8, head: 17, alpha: 1, caps: true, spacing: .6, lh: 1.3 }, secondary: { title: 16.5, body: 14.5, width: .11, arrow: 1.1, head: 13, alpha: .78, caps: false, spacing: 0, lh: 1.2 } };
const typeOf = ev => TYPE[ev.primary ? 'primary' : 'secondary'];

export function compose(seed){
  const R = RNG(seed), tasks = [], add = f => tasks.push({ f });
  const M = Math.round(W * .03);   // one margin, all round
  const nC = makeNoise(R), X0 = W * .06, X1 = W * .91;
  const xOf = yr => X0 + (yr - 1965) / 59 * (X1 - X0);
  const FOOT = (() => {
    const t1 = 'Source: Energy Institute, Statistical Review of World Energy 2025, via Our World in Data. Non-fossil sources use the substitution method.';
    const t2 = 'Watercolour after Tyler Hobbs\u2019 \u201cHow to Hack a Painting\u201d, painted with a WebGL shader. The paint bleeds mostly along the time axis, so bands stay true to their values. Red notes mark years when total use fell; blue arrows mark one source overtaking another. Dashed lines extend the five-year trend before each shock.';
    const w = W * .36, h1 = para(t1, 0, 0, w, { size: 14.5, italic: true, measure: true }), h2 = para(t2, 0, 0, w, { size: 14.5, italic: true, measure: true }), h = h1 + 8 + h2;
    return { t1, t2, w, h1, h, x: M + W * .25 + W * .05, y: H - M - h };   // bottom middle, beside the dot plot
  })();
  const cyAt = x => H * (.535 + .06 * clamp((x - X0) / (X1 - X0), 0, 1));   // starts higher on the left and settles lower as it grows   // sits a little low: most notes are about the small sources on top
  const N = SOURCES.length, step = 8, xs = [];
  for (let x = X0; x <= X1 + .01; x += step) xs.push(x);
  // Catmull-Rom between years, so the stream is smooth but passes through every data point
  const interp = (i, t) => { const k = Math.min(58, Math.floor(t)), f = t - k, g = j => ENERGY[clamp(j, 0, 59)][i];
    const p0 = g(k - 1), p1 = g(k), p2 = g(k + 1), p3 = g(k + 2);
    return Math.max(0, .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)); };
  const vals = xs.map(x => { const t = (x - X0) / (X1 - X0) * 59; return SOURCES.map((_, i) => interp(i, t)); });
  // Bump stream: every year the sources are re-stacked by size, smallest on top, with a small gap between them.
  // Between years each band's centre eases from its slot in one year to its slot in the next, so overtakes show as crossings.
  const maxT = Math.max(...ENERGY.map(r => r.reduce((a, b) => a + b, 0))), half = H * .2, px = half * 2 / maxT, GAP = 7;
  const gapOf = v => GAP * clamp(v * px / 4, 0, 1);
  const slots = ENERGY.map((row, k) => {
    const order = SOURCES.map((_, i) => i).sort((a, b) => row[a] - row[b] || a - b);
    const total = row.reduce((a, b) => a + b, 0) * px + order.reduce((g, i) => g + gapOf(row[i]), 0);
    let y = cyAt(xOf(1965 + k)) - total / 2; const c = [];
    for (const i of order){ const w = row[i] * px; c[i] = y + w / 2; y += w + gapOf(row[i]); }
    return { c, order };
  });
  const ease = f => f * f * (3 - 2 * f);
  const bands = xs.map((x, j) => { const t = (x - X0) / (X1 - X0) * 59, k = Math.min(58, Math.floor(t)), e = ease(t - k);
    return vals[j].map((v, i) => { const c = slots[k].c[i] * (1 - e) + slots[k + 1].c[i] * e, w = v * px; return [c - w / 2, c + w / 2]; }); });
  const col = x => clamp(Math.round((x - X0) / step), 0, xs.length - 1);
  const edges = bands.map(bs => { let a = 1e9, b = -1e9; for (const [p, q] of bs) if (q - p > 1){ a = Math.min(a, p); b = Math.max(b, q); } return [a, b]; });
  const edgeAt = (x, side) => edges[col(x)][side < 0 ? 0 : 1];
  const centreAt = (x, i) => { const [a, b] = bands[col(x)][i]; return (a + b) / 2; };
  const bandMid = (yr, i) => { const j = col(xOf(yr)), [a, b] = bands[j][i]; return { x: xOf(yr), y: (a + b) / 2 }; };
  const insideAt = x => { const j = col(x), i = R.int() % N, [a, b] = bands[j][i]; return { y: R.range(a, b), i, a, b, w: b - a }; };
  const yearTotal = yr => ENERGY[yr - 1965].reduce((a, b) => a + b, 0);

  // layout bookkeeping: boxes already used, and a margin around the stream for the year ladder
  const taken = [];
  const take = (x, y, w, h) => taken.push({ x, y, w, h });
  const clearOfStream = (x, y, w, h) => { for (let xx = x - 10; xx <= x + w + 10; xx += 12){ if (xx < X0 - 20 || xx > X1 + 20) continue; if (y < edgeAt(xx, 1) + 62 && y + h > edgeAt(xx, -1) - 62) return false; } return true; };
  const free = (x, y, w, h) => x > W * .01 && x + w < W * .99 && y > H * .02 && y + h < H * .96 && clearOfStream(x, y, w, h) &&
    !taken.some(r => x < r.x + r.w + 18 && x + w > r.x - 18 && y < r.y + r.h + 14 && y + h > r.y - 14);

  // paper, decade rules with year labels along the bottom
  add(() => { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    const g = RNG(seed + 1); for (let k = 0; k < 12000; k++){ ctx.fillStyle = g.chance(.5) ? 'rgba(120,100,60,.05)' : 'rgba(255,255,255,.12)'; ctx.fillRect(g.next() * W, g.next() * H, g.range(1, 3), g.range(1, 3)); }
  });

  // the stream: each source's band (all of its visible runs) becomes an SVG path, painted by the watercolor shader,
  // then multiplied onto the paper like a real transparent wash
  // Each band: its outline is deformed Hobbs-style into a base shape, then into a stack of faint layers,
  // each deformed differently. The stack goes to the shader as one SVG, so the shader's texture sits on a Hobbs edge:
  // rough and fractal along the band, and much looser at the end of the stream, where the variance is raised.
  const LAYERS = 14, smooth = t => t * t * (3 - 2 * t);
  const bandSVG = SOURCES.map((_, i) => {
    const nv = makeNoise(R), nw = makeNoise(R), pieces = []; let run = [];
    // "too much water": here and there along each edge the paper is wetter, so the wash creeps across the gap into its neighbour
    // thin bands get much less water: their pushes are measured in edge lengths, which would swamp a band a few pixels high
    const water = q => { const [a, b] = bands[col(q.x)][i]; return clamp((b - a) / 45, .15, 1); };
    const endness = q => smooth(clamp(((q.x - X0) / (X1 - X0) - .82) / .18, 0, 1));
    const wetAt = q => smooth(clamp(((nw(q.x / 230) * .5 + .5) - .52) / .22, 0, 1)) * water(q) * (1 - endness(q));
    const kyAt = q => (P.ky + .75 * wetAt(q)) * (1 - .7 * endness(q));  // near 2024 the bleed runs along the stream, not across it
    const varianceAt = q => {
      let v = .1 + .28 * Math.max(0, nv(q.x / 140) * .6 + .5);
      v *= 1 + 1.6 * endness(q);                                      // loosen towards 2024
      v *= 1 + .5 * wetAt(q);                                          // and a little more where it is wet
      v *= .3 + .7 * water(q);
      if (q.x >= X1 - 1) v = .6 * (.4 + .6 * water(q)); else if (q.x <= X0 + 1) v = .32 * (.4 + .6 * water(q));  // the open ends bleed most
      return v; };
    const flush = () => { if (run.length > 3){
        const T = run.map(j => ({ x: xs[j], y: bands[j][i][0] })), B = run.map(j => ({ x: xs[j], y: bands[j][i][1] })).reverse();
        const BR = RNG(R.int()), base = deformN(shape(T.concat(B), 26, varianceAt, kyAt), BR, 3);
        for (let l = 0; l < LAYERS; l++) pieces.push(toPath(deformN(base, BR, 3))); }
      run = []; };
    xs.forEach((x, j) => { if (bands[j][i][1] - bands[j][i][0] > 1.5) run.push(j); else flush(); }); flush();
    return pieces.length ? pieces.map(d => `<path d="${d}" fill-opacity="0.15"/>`).join('') : '';
  });
  // the shader's own bleed is scaled the same way, by the band's typical height
  const bandBleed = SOURCES.map((_, i) => { const hs = bands.map(b => b[i][1] - b[i][0]).filter(h => h > 1.5).sort((a, b) => a - b);
    return hs.length ? .75 * clamp(hs[Math.floor(hs.length / 2)] / 40, .25, 1) : .75; });
  let streamSnap = null;
  tasks.push({ wait: async (status) => {
    for (let i = 0; i < SOURCES.length; i++){
      if (!bandSVG[i]) continue;
      status(`Painting ${SOURCES[i].toLowerCase()}…`);
      const out = await watercolor(bandSVG[i], { width: W, height: H, color: COLORS[i], seed: seed % 997 + i * 37, bleed: bandBleed[i], passes: 14, strength: 1.1, granulation: .6, paper: .32 });
      const img = await loadImage(out.match(/href="([^"]+)"/)[1]);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(img, 0, 0); ctx.restore();
    }
  } });
  add(() => { streamSnap = document.createElement('canvas'); streamSnap.width = W; streamSnap.height = H; streamSnap.getContext('2d').drawImage(cv, 0, 0); });

  // ruler lines: the trend in total use over the five years before each shock, laid along the stream's bottom edge
  // and extended past it as a dashed line, so you can see where the stream would have gone had nothing happened.
  // The slope comes from the yearly totals (a least-squares fit), not from the painted edge.
  // The five-year totals under the stream share that strip, so the rulers and totals are laid out together:
  // a total that a ruler runs through moves down (or is dropped if it can't), the line breaks around every total,
  // and each ruler's label slides along its line to a free stretch.
  const totalsAt = {};   // year -> label position, or null when the total is dropped
  add(() => {
    const bottomAt = (yr, total) => { const row = ENERGY[clamp(Math.round(yr), 1965, 2024) - 1965];
      const gaps = row.reduce((g, v) => g + gapOf(v), 0); return cyAt(xOf(yr)) + (total * px + gaps) / 2; };
    const segBox = (p, q, r, pad) => { const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
      for (let k = 0; k <= 24; k++){ const t = k / 24, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t; if (x > x0 && x < x1 && y > y0 && y < y1) return true; } return false; };
    // 1. the rulers' geometry
    const rulers = [[1974, 1979, 1985], [2003, 2008, 2014], [2014, 2019, 2024]].map(([y0, y1, y2]) => {
      const ys = []; for (let y = y0; y <= y1; y++) ys.push(y);
      const mx = ys.reduce((a, b) => a + b, 0) / ys.length, my = ys.reduce((a, y) => a + yearTotal(y), 0) / ys.length;
      const slope = ys.reduce((a, y) => a + (y - mx) * (yearTotal(y) - my), 0) / ys.reduce((a, y) => a + (y - mx) ** 2, 0);
      const fit = y => my + slope * (y - mx), P = y => ({ x: xOf(y), y: bottomAt(y, fit(y)) + 9 });
      return { y0, y1, y2, s: P(y0), a: P(y1), b: P(y2) };
    });
    const hitsRuler = r => rulers.some(u => segBox(u.s, u.a, r, 4) || segBox(u.a, u.b, r, 4));
    // 2. the totals: keep, move down, or drop
    const boxes = [];
    for (let yr = 1965; yr <= 2024; yr += 5){
      const x = xOf(yr), yb = edgeAt(x, 1), tw = 56;
      let placed = null;
      for (const dy of [36, 58, 80]){ const r = { x: x - tw / 2, y: yb + dy - 8, w: tw, h: 16 }; if (!hitsRuler(r)){ placed = { x, y: yb + dy, r }; break; } }
      totalsAt[yr] = placed; if (placed){ boxes.push(placed.r); take(placed.r.x - 2, placed.r.y - 2, placed.r.w + 4, placed.r.h + 4); }
    }
    // 3. draw each ruler, lifting the pencil wherever it would cross a total
    const clear = p => !boxes.some(r => p.x > r.x - 6 && p.x < r.x + r.w + 6 && p.y > r.y - 5 && p.y < r.y + r.h + 5);
    const strokeBroken = (p, q, dash, w, alpha) => {
      const L = Math.hypot(q.x - p.x, q.y - p.y), step = 3, n = Math.ceil(L / step); let run = [];
      const flush = () => { if (run.length > 1) pen(run, { R, w, color: INK, alpha, amp: .1, passes: 1 }); run = []; };
      for (let k = 0; k <= n; k++){ const d = k * step, t = Math.min(1, d / L), pt = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        const on = clear(pt) && (!dash || (d % 18) < 11); if (on) run.push(pt); else flush(); }
      flush(); };
    for (const u of rulers){
      strokeBroken(u.s, u.a, false, 1.9, .85);
      strokeBroken(u.a, u.b, true, 1.7, .8);
      // 4. the label slides back along the dashed line until it touches no total, tick or other label
      const t = `${u.y0}–${String(u.y1).slice(2)} trend`;
      ctx.save(); ctx.font = 'italic 15.5px Newsreader, Georgia, serif'; const tw = ctx.measureText(t).width; ctx.restore();
      const ang = Math.atan2(u.b.y - u.a.y, u.b.x - u.a.x), ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, lo = 13;
      const L = Math.hypot(u.b.x - u.a.x, u.b.y - u.a.y);
      const boxAt = (sx, sy) => { const cs = [[0, -9], [tw, -9], [tw, 9], [0, 9]].map(([px2, py2]) => ({ x: sx + px2 * ux - py2 * uy, y: sy + px2 * uy + py2 * ux }));
        const x0 = Math.min(...cs.map(c => c.x)), y0 = Math.min(...cs.map(c => c.y)); return { x: x0, y: y0, w: Math.max(...cs.map(c => c.x)) - x0, h: Math.max(...cs.map(c => c.y)) - y0 }; };
      const ticks = []; for (let yr = 1965; yr <= 2024; yr += 5){ const x = xOf(yr), yb = edgeAt(x, 1); ticks.push({ x: x - 2, y: yb + 4, w: 4, h: 20 }); }
      let best = null;
      for (let back = 0; back <= Math.max(0, L - tw) + 1e-6; back += 6){
        const ex = u.b.x - ux * back, ey = u.b.y - uy * back, sx = ex - ux * tw + nx * lo, sy = ey - uy * tw + ny * lo, bx = boxAt(sx, sy);
        const free = ![...boxes, ...ticks].some(r => bx.x < r.x + r.w + 4 && bx.x + bx.w + 4 > r.x && bx.y < r.y + r.h + 3 && bx.y + bx.h + 3 > r.y);
        if (free){ best = { sx, sy, bx }; break; }
        if (!best) best = { sx, sy, bx }; }
      ctx.save(); ctx.translate(best.sx, best.sy); ctx.rotate(ang); ctx.shadowColor = 'rgba(242,236,221,1)'; ctx.shadowBlur = 5;
      label(t, 0, 0, { size: 15.5, alpha: .85 }); ctx.restore();
      take(best.bx.x - 3, best.bx.y - 3, best.bx.w + 6, best.bx.h + 6);
      boxes.push(best.bx);
    }
  });

  // the year ladder: a tick and label for every year
  add(() => {
    YEARS.forEach(yr => { const x = xOf(yr), yt = edgeAt(x, -1), yb = edgeAt(x, 1), major = yr % 5 === 0;
      pen([{ x, y: yt - (major ? 30 : 14) }, { x, y: yt - 4 }], { R, w: .5, alpha: .55, amp: .2, passes: 1 });
      label(String(yr), x, yt - (major ? 40 : 22), { size: major ? 13 : 9.5, align: 'center', alpha: major ? .8 : .5, italic: false });
      if (major){ const tp = totalsAt[yr];
        // the tick reaches down to its total, wherever the rulers left room for it; a dropped total keeps a short tick
        pen([{ x, y: yb + 4 }, { x, y: tp ? tp.y - 12 : yb + 24 }], { R, w: .5, alpha: .55, amp: .2, passes: 1 });
        if (tp){ ctx.save(); ctx.shadowColor = 'rgba(242,236,221,1)'; ctx.shadowBlur = 5;
          label(fmt(yearTotal(yr) / 1000) + 'k TWh', x, tp.y, { size: 12, align: 'center', alpha: .7 }); ctx.restore(); } } });
  });


  // header, top left: title and one sentence
  add(() => {
    const x = M, w = W * .33; let y = M * .8;
    y += para('World energy, 1965–2024', x, y, w, { size: 64 }) + 14;
    y += para('Primary energy use by source. Each year the sources are stacked by size, smallest on top, and the stream’s height is the total, which grew about fourfold.', x, y, w, { size: 23, alpha: .85 });
    take(x, M * .6, w, y - M * .6 + 6);
  });

  // a ranked list under the intro: every source by size in 1965 and in 2024, with its share and a small bar,
  // set as ruled rows in the spirit of the tables in the margins of a technical drawing
  add(() => {
    const GRAPHITE = '#4a4a48', head = taken.find(r => r.x < W * .3 && r.y < H * .1), kx = M, ky = head.y + head.h + 78;
    label('Ranked by size', kx, ky, { size: 20, italic: true, color: GRAPHITE, alpha: .9 });
    const colW = 330, gapC = 72, rowH = 27, top = ky + 34, barMax = 92;
    const maxShare = Math.max(...[0, 59].map(k => Math.max(...ENERGY[k]) / ENERGY[k].reduce((a, b) => a + b, 0) * 100));
    [1965, 2024].forEach((yr, c) => {
      const row = ENERGY[yr - 1965], sum = row.reduce((a, b) => a + b, 0), x = kx + c * (colW + gapC);
      const order = SOURCES.map((_, i) => i).sort((p, q) => row[q] - row[p]);
      label(String(yr), x, top, { size: 18, italic: false, color: INK, alpha: .9 });
      pen([{ x, y: top + 14 }, { x: x + colW, y: top + 14 }], { R, w: .9, color: GRAPHITE, alpha: .7, amp: .2, passes: 1 });
      order.forEach((i, k) => {
        const y = top + 14 + (k + .5) * rowH + 2, share = row[i] / sum * 100;
        label(String(k + 1), x + 12, y, { size: 13, italic: false, align: 'right', alpha: .55 });
        label(SOURCES[i], x + 24, y, { size: 15.5, italic: false, alpha: .9 });
        const bw = Math.max(share > 0 ? 1.5 : 0, share / maxShare * barMax);   // bars on one scale across both years
        ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = COLORS[i]; ctx.fillRect(x + colW - barMax - 62, y - 5, bw, 10); ctx.restore();
        label(share === 0 ? '0.0%' : share < .05 ? '<0.1%' : share.toFixed(1) + '%', x + colW, y, { size: 14.5, italic: false, align: 'right', alpha: .8 });
        pen([{ x, y: y + rowH / 2 }, { x: x + colW, y: y + rowH / 2 }], { R, w: .5, color: GRAPHITE, alpha: .3, amp: .15, passes: 1 });
      });
    });
    // the obstacle box is generous on purpose: it keeps notes and arrows at a breathing distance from the table
    take(kx - 6, ky - 40, 2 * colW + gapC + 44, 34 + 14 + 9 * rowH + 90);
  });

  // direct labels: every band is named where the stream ends (with its 2024 share) and, if visible, where it begins
  add(() => {
    const ends = (yr, xEdge, xText, align, withShare) => {
      const row = ENERGY[yr - 1965], sum = row.reduce((a, b) => a + b, 0);
      const items = SOURCES.map((n, i) => ({ i, y: centreAt(xEdge, i), w: row[i] * px })).filter(o => o.w > 2.5).sort((a, b) => a.y - b.y);
      for (let k = 1; k < items.length; k++) items[k].ly = Math.max(items[k].y, (items[k - 1].ly ?? items[k - 1].y) + 17);
      items[0].ly = items[0].y; const shift = Math.min(0, items[items.length - 1].y - items[items.length - 1].ly) / 2;
      for (const o of items){ o.ly += shift;
        pen([{ x: xEdge + (align === 'left' ? 4 : -4), y: o.y }, { x: xText + (align === 'left' ? -4 : 4), y: o.ly }], { R, w: .5, alpha: .5, amp: .1, passes: 1 });
        const bx = align === 'left' ? xText + 5 : xText - 5, tx = align === 'left' ? xText + 15 : xText - 15;
        ctx.save(); ctx.strokeStyle = COLORS[o.i]; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - 4, o.ly); ctx.lineTo(bx + 4, o.ly); ctx.stroke(); ctx.restore();
        const txt = withShare ? `${SOURCES[o.i]} ${(row[o.i] / sum * 100).toFixed(1)}%` : SOURCES[o.i];
        label(txt, tx, o.ly, { size: 13, italic: false, align, alpha: .9 });
        ctx.save(); ctx.font = '13px Newsreader, Georgia, serif'; const tw = ctx.measureText(txt).width; ctx.restore();
        take(align === 'left' ? xText - 2 : xText - 15 - tw - 2, o.ly - 9, tw + 19, 18); }
    };
    ends(2024, X1 + 2, X1 + 18, 'left', true);
    ends(1965, X0 - 2, X0 - 18, 'right', false);
    label('share in 2024', X1 + 18, edgeAt(X1, -1) - 22, { size: 11, alpha: .6 }); take(X1 + 16, edgeAt(X1, -1) - 30, 80, 16);
  });

  // yearly change in total use: a grid of dots, red for falls, bottom left on the margin
  add(() => {
    const w = W * .25, cols = 15, cs = w / cols, x0 = M, rows = Math.ceil(59 / cols);
    const t1 = 'Year-on-year change in total use', t2 = 'One dot per year, 1966–2024. Size is the size of the change; red marks a fall.';
    const h = para(t1, 0, 0, w, { size: 18.5, weight: 600, measure: true }) + 3 + para(t2, 0, 0, w, { size: 15.5, italic: true, measure: true }) + 16 + (rows - 1) * cs + cs * .52 + 12;
    const y0 = H - M - h; let y = y0;   // measured, so its last row of labels sits right on the bottom margin
    y += para(t1, x0, y, w, { size: 18.5, weight: 600 }) + 3;
    y += para(t2, x0, y, w, { size: 15.5, italic: true, alpha: .7 }) + 16;
    for (let k = 1; k < 60; k++){ const c = (yearTotal(1965 + k) / yearTotal(1964 + k) - 1) * 100, cx = x0 + ((k - 1) % cols + .5) * cs, cy = y + Math.floor((k - 1) / cols) * cs;
      dot(cx, cy, clamp(Math.sqrt(Math.abs(c)) * 3.75, 1.5, cs * .45), c < 0 ? RED : NAVY, .88);
      if ((1965 + k) % 10 === 0) label(String(1965 + k), cx, cy + cs * .52, { size: 11.5, align: 'center', alpha: .6, italic: false }); }
    take(x0, y0 - 6, w, h + 6);
  });

  // notes, each joined to the exact point it describes by a swoopy arrow.
  // Ink: an event. Red: a year when total use fell (anchored on the stream's edge, which is the total). Blue: one source overtaking another.
  const EVENTS = [
    { primary: true, yr: 1973, src: 1, side: 'B', title: '1973 · Oil crisis', body: 'The OPEC embargo. Oil use falls in 1974 and again in 1975.' },
    { primary: true, yr: 1979, src: 1, side: 'B', title: '1979 · Second oil shock', body: 'Oil peaks at 37,178 TWh and doesn’t pass that level again until 1989.' },
    { yr: 1981, span: [1980, 1982], kind: 'band', src: -1, side: 'B', drop: true, title: '1980–82 · Three years of decline', body: 'Total energy use falls three years in a row, by 0.9%, 0.5% and 0.5%.' },
    { yr: 1986, src: 3, side: 'T', title: '1986 · Chernobyl', body: 'Nuclear grew 3.7× in the decade before. In the decade after, 1.5×.' },
    { primary: true, yr: 2006, span: [2002, 2011], kind: 'oval', src: 0, side: 'B', title: '2002–11 · The coal boom', body: 'Coal use rises 52% in nine years, mostly in China.' },
    { yr: 2006, src: 3, side: 'T', title: '2006 · Nuclear peaks', body: 'At 7,495 TWh. In 2024 it is still below that, at 6,872.' },
    { yr: 2009, src: -1, side: 'B', drop: true, title: '2009 · Financial crisis', body: 'Global energy use falls 1.6%.' },
    { yr: 2011, src: 3, side: 'T', title: '2011 · Fukushima', body: 'Nuclear output drops 7.3% the following year.' },
    { primary: true, yr: 2018, span: [2014, 2024], kind: 'band', src: 6, side: 'T', title: '2014–24 · Solar takes off', body: 'From 502 TWh to 5,151 TWh in ten years, more than tenfold.' },
    { primary: true, yr: 2020, span: [2019.5, 2020.5], kind: 'band', src: -1, side: 'B', drop: true, title: '2020 · Covid-19', body: 'Demand falls 3.5%, the largest drop in this record, then rebounds 5.1% in 2021.' },
    { yr: 2001, pass: [3, 4], side: 'T', title: '2001 · Nuclear passes hydro', body: '7,330 TWh to 7,123. Hydro takes the lead back in 2004 and keeps it.' },
    { yr: 2003, pass: [5, 7], side: 'T', title: '2003 · Wind passes biofuels', body: '172 TWh to 169. Wind stays ahead from here on.' },
    { yr: 2012, pass: [5, 8], side: 'T', title: '2012 · Wind passes other renewables', body: '1,368 TWh to 1,340.' },
    { yr: 2017, pass: [6, 7], side: 'T', title: '2017 · Solar passes biofuels', body: '1,115 TWh to 958.' },
    { yr: 2021, pass: [6, 8], side: 'T', corner: true, title: '2021 · Solar passes other renewables', body: '2,593 TWh to 2,318. By 2024 it is closing in on wind: 5,151 against 6,125.' }
  ];
  // footnote: source, technique and the colour key, bottom left on the margin
  add(() => {
    para(FOOT.t1, FOOT.x, FOOT.y, FOOT.w, { size: 14.5, italic: true, alpha: .65 });
    para(FOOT.t2, FOOT.x, FOOT.y + FOOT.h1 + 8, FOOT.w, { size: 14.5, italic: true, alpha: .65 });
    take(FOOT.x - 4, FOOT.y - 4, FOOT.w + 8, FOOT.h + 8);
  });

  // ---- magnifier callout: the small sources around 2009–2021 are crowded, so that corner is shown enlarged ----
  // The corner is framed on the chart, copied into the open space at the top, and joined to the copy by two lines.
  // Notes about points in that corner (Fukushima, wind passing other renewables, solar passing biofuels and other renewables) point into the enlargement.
  let ZOOM = null; const zoomLabels = [];
  add(() => {
    const yA = 2008.6, yB = 2021.6, sx0 = xOf(yA), sx1 = xOf(yB);
    let top = 1e9, bot = -1e9;
    for (let x = sx0; x <= sx1; x += 4){ top = Math.min(top, edgeAt(x, -1)); bot = Math.max(bot, centreAt(x, 4) - 2); }   // down to hydro's top
    const S = { x: sx0, y: top - 30, w: sx1 - sx0, h: bot - top + 36 };   // headroom for the year ladder
    // the enlargement fills a fixed slot in the open space at the top, left of the corner it was taken from
    const slot = { x: W * .456, y: H * .089, w: W * .305, h: H * .164 };
    const z = Math.min(slot.w / S.w, slot.h / S.h), Dw = S.w * z, Dh = S.h * z;
    const D = { x: slot.x + (slot.w - Dw) / 2, y: slot.y + (slot.h - Dh) / 2, w: Dw, h: Dh };
    ZOOM = { S, D, z, map: p => ({ x: D.x + (p.x - S.x) * z, y: D.y + (p.y - S.y) * z }) };
    const snap = streamSnap;   // the paint alone, without the year ladder, so the enlargement stays clean
    const rr = (c, b, r) => { c.beginPath(); c.moveTo(b.x + r, b.y); c.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r); c.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r); c.arcTo(b.x, b.y + b.h, b.x, b.y, r); c.arcTo(b.x, b.y, b.x + b.w, b.y, r); c.closePath(); };
    const rrPts = (b, r) => [...arcPts(b.x + r, b.y + r, r, Math.PI, Math.PI * 1.5, 6), ...arcPts(b.x + b.w - r, b.y + r, r, -Math.PI / 2, 0, 6),
      ...arcPts(b.x + b.w - r, b.y + b.h - r, r, 0, Math.PI / 2, 6), ...arcPts(b.x + r, b.y + b.h - r, r, Math.PI / 2, Math.PI, 6)].concat([{ x: b.x, y: b.y + r }]);
    // connectors first, so the enlargement sits on top of them
    const corners = b => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }];
    // connectors from the top corners of the ringed corner up to the bottom corners of the enlargement
    pen([{ x: S.x, y: S.y }, { x: D.x, y: D.y + D.h }], { R, w: .7, alpha: .45, amp: .2, passes: 1 });
    pen([{ x: S.x + S.w, y: S.y }, { x: D.x + D.w, y: D.y + D.h }], { R, w: .7, alpha: .45, amp: .2, passes: 1 });
    ctx.save(); ctx.beginPath(); ctx.rect(D.x, D.y, D.w, D.h); ctx.clip(); ctx.fillStyle = PAPER; ctx.fillRect(D.x, D.y, D.w, D.h); ctx.drawImage(snap, S.x, S.y, S.w, S.h, D.x, D.y, D.w, D.h); ctx.restore();
    const openFrame = (b, o) => { const g = 9, c = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
      for (let k = 0; k < 4; k++){ const [x1, y1] = c[k], [x2, y2] = c[(k + 1) % 4], L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        pen([{ x: x1 + ux * g, y: y1 + uy * g }, { x: x2 - ux * (g - 3), y: y2 - uy * (g - 3) }], Object.assign({ R, color: '#4a4a48', amp: .5, passes: 2 }, o)); } };
    openFrame(D, { w: 1, alpha: .75 });
    openFrame(S, { w: .85, alpha: .65 });
    ctx.save(); ctx.shadowColor = 'rgba(242,236,221,.95)'; ctx.shadowBlur = 6;
    // the same year ladder as the main chart: a tick and label for every year on the stream's top edge, larger every five years
    for (let yr = Math.ceil(yA); yr <= Math.floor(yB); yr++){
      const x = xOf(yr), p = ZOOM.map({ x, y: edgeAt(x, -1) }), major = yr % 5 === 0;
      pen([{ x: p.x, y: p.y - (major ? 30 : 14) }, { x: p.x, y: p.y - 4 }], { R, w: .5, alpha: .55, amp: .2, passes: 1 });
      label(String(yr), p.x, p.y - (major ? 40 : 22), { size: major ? 13 : 9.5, align: 'center', alpha: major ? .8 : .5, italic: false });
      zoomLabels.push({ x: p.x - 15, y: p.y - (major ? 49 : 29), w: 30, h: major ? 18 : 14 }); }
    ctx.restore();
    take(D.x - 4, D.y - 4, D.w + 8, D.h + 8);
    ZOOM.box = taken[taken.length - 1];
    for (const r of zoomLabels) taken.push(r);
  });

  // ---- force-directed placement of the notes and their arrows ----
  // Notes repel each other and the fixed blocks (title, labels, dot grid, gauges), are pulled towards a spot beside their point,
  // and may not enter the stream. Arrows push other notes out of their way and crossing arrows push their notes apart.
  // Several starts are tried and the cleanest layout kept; then each arrow's swoop is chosen so it hits nothing.
  const notes = [];
  add(() => {
    // events that last several years: a box around that stretch of the data, with the text right beside it, no arrow
    const spans = [], ovalNotes = [];
    for (const ev of EVENTS.filter(e => e.span)){
      const [y0r, y1r] = ev.span, sN = ev.side === 'T' ? -1 : 1, bx0 = xOf(y0r) - 6, bx1 = xOf(y1r) + 6;
      let top = 1e9, bot = -1e9;
      for (let x = xOf(y0r); x <= xOf(y1r) + .1; x += 4){
        if (ev.src < 0){ top = Math.min(top, edgeAt(x, -1)); bot = Math.max(bot, edgeAt(x, 1)); }
        else { const [a, b] = bands[col(x)][ev.src]; top = Math.min(top, a); bot = Math.max(bot, b); } }
      const isBand = ev.kind === 'band';
      // a band runs the full height of the chart over the years the event covers; an oval rings one source's stretch of data
      let sTop = 1e9, sBot = -1e9; for (let x = xOf(y0r); x <= xOf(y1r) + .1; x += 4){ sTop = Math.min(sTop, edgeAt(x, -1)); sBot = Math.max(sBot, edgeAt(x, 1)); }
      const bTop = Math.max(H * .17, sTop - 170), bBot = Math.min(H * .95, sBot + 170);   // reaching well out from the stream
      let bTop2 = bTop; if (ZOOM && xOf(y0r) < ZOOM.box.x + ZOOM.box.w + 10 && xOf(y1r) > ZOOM.box.x) bTop2 = Math.max(bTop, ZOOM.box.y + ZOOM.box.h + 12);   // stay clear of the enlargement
      const box = isBand ? { x: xOf(y0r), y: bTop2, w: xOf(y1r) - xOf(y0r), h: bBot - bTop2 } : { x: bx0, y: top - 7, w: bx1 - bx0, h: bot - top + 14 };
      const tt = typeOf(ev), w = W * tt.width, th = para(ev.title, 0, 0, w, { size: tt.title, weight: 600, caps: tt.caps, spacing: tt.spacing, measure: true }), h = th + 2 + para(ev.body, 0, 0, w, { size: tt.body, lh: tt.lh, measure: true });
      // just outside the stream (clear of the year ladder and totals), lined up with the box's left edge
      // pick a spot for the text along the box (start, end, or past either end) that sits over no other note's data point;
      // only if every spot is taken does the text lift higher to leave a lane for those notes underneath
      const underAt = tx => EVENTS.filter(e => !e.span && e.side === ev.side && (x => x > tx - 40 && x < tx + w + 40)(xOf(e.pass ? e.yr - .5 : e.yr))).length;
      const opts = (isBand ? [box.x + box.w + 10, box.x - 10 - w] : [bx0, bx1 - w, bx1 - 30, bx0 - w + 30]).map(x => clamp(x, M, (W - M) - w));
      const tx = opts.reduce((best, x) => underAt(x) < underAt(best) ? x : best, opts[0]), under = underAt(tx);
      let ex = 1e9, eb = -1e9; for (let x = tx; x <= tx + w; x += 6){ const xx = clamp(x, X0, X1); ex = Math.min(ex, edgeAt(xx, -1)); eb = Math.max(eb, edgeAt(xx, 1)); }
      if (tx + w > X1) ex = Math.min(ex, edgeAt(X1, -1) - 34);   // above the 'share in 2024' heading
      let ty = sN < 0 ? ex - (under ? 175 : 70) - h : eb + (under ? 150 : 52);
      if (!isBand){   // an oval's text sits right beside the oval, level with its middle
        const rx = box.w / 2 + 14, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        const right = cx + rx + 12, left = cx - rx - 12 - w;
        spans.push({ ev, box, isBand, noText: true, sN, lc: INK });
        // the note itself is placed with the others, outside the stream, pointing at the oval's lower edge
        ovalNotes.push({ ev, A: { x: cx - rx - 3, y: cy + 6 } }); continue; }   // the oval's left side
      const hits = y => taken.some(r => tx < r.x + r.w + 14 && tx + w + 14 > r.x && y < r.y + r.h + 10 && y + h + 10 > r.y);
      for (let k = 0; k < 40 && hits(ty); k++) ty += sN * 10;
      let fx = tx;
      if (isBand){   // best of all: right at the band's end, on top (or below), starting at its first year
        const cy = sN < 0 ? box.y - 10 - h : box.y + box.h + 10, cx = clamp(box.x, M, (W - M) - w);
        const free2 = taken.every(r => !(cx < r.x + r.w + 14 && cx + w + 14 > r.x && cy < r.y + r.h + 10 && cy + h + 10 > r.y));
        if (free2 && cy > M && cy + h < H - M){ fx = cx; ty = cy; } }
      const tint = ev.src >= 0 ? COLORS[ev.src] : RED;
      spans.push({ ev, box, isBand, tint, x: fx, y: ty, w, h, th, sN, lc: isBand ? darken(tint, ev.src >= 0 ? .45 : .25) : ev.drop ? RED : INK, edge: sN < 0 ? box.y : box.y + box.h });
      take(fx, ty, w, h);
      if (isBand) continue;   // text sits right beside the band; no tie needed
      const tieX = clamp(box.x + box.w / 2, tx + 6, tx + w - 6), t0 = Math.min(sN < 0 ? box.y : box.y + box.h, sN < 0 ? ty + h : ty), t1 = Math.max(sN < 0 ? box.y : box.y + box.h, sN < 0 ? ty + h : ty);
      take(tieX - 3, t0, 6, t1 - t0);   // the tie line is an obstacle too
    }
    window.__spans = spans;
    const fixed = taken.slice();
    const limit = (x0, x1, side) => { let m = side < 0 ? H : 0;
      for (let xx = x0 - 10; xx <= x1 + 10; xx += 10){ if (xx < X0 - 30 || xx > X1 + 30) continue; const e = edgeAt(clamp(xx, X0, X1), side);
        m = side < 0 ? Math.min(m, e - 66) : Math.max(m, e + 66); } return m; };

    for (const ev of EVENTS.filter(e => !e.span)){
      const sN = ev.side === 'T' ? -1 : 1; let A;
      if (ev.pass){ const x = xOf(ev.yr - .5); A = { x, y: (centreAt(x, ev.pass[0]) + centreAt(x, ev.pass[1])) / 2 }; }
      else { const x = xOf(ev.yr), [ba, bb] = bands[col(x)][ev.src >= 0 ? ev.src : 0];
        const outer = ev.src >= 0 && (sN > 0 ? Math.abs(bb - edgeAt(x, 1)) < 1 : Math.abs(ba - edgeAt(x, -1)) < 1);
        // an outermost band is pointed at in its outer third (the bottom third of oil, say): clearly inside that band, and still close to the note
        A = ev.src < 0 ? { x, y: edgeAt(x, sN) + sN * 4 } : outer ? { x, y: sN > 0 ? ba + (bb - ba) * 5 / 6 : ba + (bb - ba) / 6 } : { x, y: centreAt(x, ev.src) }; }
      const ty = typeOf(ev), wMax = W * ty.width, s1 = {}, s2 = {}, th = para(ev.title, 0, 0, wMax, { size: ty.title, weight: 600, italic: !!ev.pass, caps: ty.caps, spacing: ty.spacing, measure: true, stats: s1 }), h = th + 2 + para(ev.body, 0, 0, wMax, { size: ty.body, lh: ty.lh, italic: !!ev.pass, measure: true, stats: s2 });
      const w = Math.ceil(Math.max(s1.maxw, s2.maxw)) + 2;   // the note's box is as wide as its longest line
      let zoomed = false;
      if (ZOOM && A.x > ZOOM.S.x && A.x < ZOOM.S.x + ZOOM.S.w && A.y > ZOOM.S.y && A.y < ZOOM.S.y + ZOOM.S.h){ A = ZOOM.map(A); zoomed = true; }
      notes.push({ ev, sN: zoomed ? -1 : sN, A, zoomed, w, h, th, x: 0, y: 0, lc: ev.drop ? RED : ev.pass ? BLUE : INK });
    }
    for (const { ev, A } of ovalNotes){   // the oval's note joins the layout like any other, on its side of the stream
      const ty = typeOf(ev), wMax = W * ty.width, s1 = {}, s2 = {};
      const th = para(ev.title, 0, 0, wMax, { size: ty.title, weight: 600, caps: ty.caps, spacing: ty.spacing, measure: true, stats: s1 });
      const h = th + 2 + para(ev.body, 0, 0, wMax, { size: ty.body, lh: ty.lh, measure: true, stats: s2 });
      const w = Math.ceil(Math.max(s1.maxw, s2.maxw)) + 2;
      notes.push({ ev, sN: 1, A, zoomed: false, w, h, th, x: 0, y: 0, lc: INK, prefX: A.x - w - 60, arrive: { x: 1, y: 0 } });   // sits below and to the left, so the arrow comes in from the left
    }
    // place the notes and route their arrows (see layout.js)
    window.__labelStats = layoutNotes({ notes, fixed, limit, W, H, M, zoom: ZOOM, seed });
  });

  // draw the notes, their arrows and the markers on the data
  add(() => {
    for (const sp of window.__spans){ const { box, lc, ev } = sp;
      if (sp.isBand){
        // a faint wash over the years, edged by two hairlines
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .1; ctx.fillStyle = sp.tint; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.restore();
        for (const x of [box.x, box.x + box.w]) pen([{ x, y: box.y }, { x, y: box.y + box.h }], { R, w: .7, color: lc, alpha: .45, amp: .3, passes: 1 });
      } else {
        // an oval around the stretch of the band
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2, rx = box.w / 2 + 14, ry = box.h / 2 + 10;
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .1; ctx.fillStyle = RED; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        pen(Array.from({ length: 121 }, (_, k) => { const a = k / 120 * Math.PI * 2 + .3; return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }; }), { R, w: 1.2, color: lc, alpha: .85, amp: .6 });
      }
      // text over the paint gets a soft paper halo so it stays readable
      if (sp.noText) continue;
      ctx.save(); if (sp.beside){ ctx.shadowColor = 'rgba(242,236,221,.95)'; ctx.shadowBlur = 7; }
      const ty = typeOf(ev); let yy = sp.y; yy += para(ev.title, sp.x, yy, sp.w, { size: ty.title, weight: 600, color: lc, alpha: ty.alpha, caps: ty.caps, spacing: ty.spacing }) + 2; para(ev.body, sp.x, yy, sp.w, { size: ty.body, lh: ty.lh, alpha: (sp.beside ? .95 : .9) * ty.alpha, color: sp.isBand ? lc : INK });
      ctx.restore(); }
    for (const n of notes){ const { ev, A, lc } = n;
      ctx.save(); ctx.shadowColor = 'rgba(242,236,221,1)'; ctx.shadowBlur = 6;   // paper halo: thin lines behind a note are broken by its text
      const ty = typeOf(ev); const tc = ev.drop ? RED : ev.pass ? BLUE : INK; let yy = n.y; yy += para(ev.title, n.x, yy, n.w, { size: ty.title, weight: 600, color: tc, alpha: ty.alpha, italic: !!ev.pass, caps: ty.caps, spacing: ty.spacing }) + 2; para(ev.body, n.x, yy, n.w, { size: ty.body, lh: ty.lh, italic: !!ev.pass, alpha: .85 * ty.alpha });
      ctx.restore();
      arrow(n.pts, { R, w: ty.arrow, color: lc, alpha: .9 * ty.alpha, amp: .15, head: ty.head }); }   // the arrowhead itself marks the point
  });

  return tasks;
}
