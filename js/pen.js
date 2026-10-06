// Hand-drawn marks: a wobbly pen, text, and swoopy arrows.
import { ctx, INK } from './canvas.js';
import { clamp, makeNoise } from './random.js';

/* ===== pen ===== */
function resampleOpen(pts, step){ const o = [pts[0]]; for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)); for (let k = 1; k <= n; k++) o.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); } return o; }
// A hand-drawn line: low-frequency wobble perpendicular to the path, width that swells and thins, and a faint second pass.
export function pen(pts, o = {}){
  const R = o.R, n1 = makeNoise(R), n2 = makeNoise(R), amp = o.amp ?? 1.4, freq = o.freq ?? 60, w = o.w ?? 1.2, ph = R.next() * 100;
  const s = resampleOpen(pts, 3); const q = [];
  let dist = 0;
  for (let i = 0; i < s.length; i++){
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    if (i) dist += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    const off = n1(dist / freq + ph) * amp + n2(dist / 9 + ph) * amp * .25;
    q.push({ x: s[i].x - dy / l * off, y: s[i].y + dx / l * off, d: dist });
  }
  ctx.save(); ctx.strokeStyle = o.color || INK; ctx.lineCap = ctx.lineJoin = 'round';
  const passes = o.passes ?? 2;
  for (let pass = 0; pass < passes; pass++){
    ctx.globalAlpha = (o.alpha ?? .9) * (pass ? .3 : 1);
    for (let i = 0; i < q.length - 1; i += 6){
      ctx.lineWidth = Math.max(.3, w * (1 + .45 * n2(q[i].d / 40 + ph + pass * 7)) * (pass ? .7 : 1));
      ctx.beginPath(); ctx.moveTo(q[i].x + pass * .8, q[i].y + pass * .6);
      for (let k = i + 1; k <= Math.min(q.length - 1, i + 6); k++) ctx.lineTo(q[k].x + pass * .8, q[k].y + pass * .6);
      ctx.stroke();
    }
  }
  ctx.restore();
}
export const bez = (a, b, c, d, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t;
  return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x, y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y }; });
export const arcPts = (cx, cy, r, a0 = 0, a1 = Math.PI * 2, n = 80) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
export function dot(x, y, r, color, alpha = 1){ ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore(); }

export function label(txt, x, y, o = {}){ ctx.save(); ctx.fillStyle = o.color || INK; ctx.globalAlpha = o.alpha ?? .85; ctx.font = `${o.italic === false ? '' : 'italic '}${o.size || 15}px Newsreader, Georgia, serif`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); ctx.restore(); }

export function para(txt, x, y, w, o = {}){
  const size = o.size || 15, lh = size * (o.lh || 1.32); ctx.save(); ctx.fillStyle = o.color || INK; ctx.globalAlpha = o.alpha ?? .92;
  ctx.font = `${o.weight || ''} ${o.italic ? 'italic' : ''} ${size}px Newsreader, Georgia, serif`;
  if (o.caps) ctx.fontVariantCaps = 'small-caps'; if (o.spacing) ctx.letterSpacing = o.spacing + 'px';   // after the font, which resets them
  ctx.textBaseline = 'top'; ctx.textAlign = o.align || 'left';
  const words = txt.split(' '); let line = '', yy = y, maxw = 0;
  const draw = (t, yy) => { maxw = Math.max(maxw, ctx.measureText(t).width); if (!o.measure) ctx.fillText(t, x, yy); };
  for (const wd of words){ const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > w && line){ draw(line, yy); yy += lh; line = wd; } else line = t; }
  if (line){ draw(line, yy); yy += lh; } ctx.restore(); if (o.stats) o.stats.maxw = maxw; return yy - y;
}


/* ===== swoopy arrows (after bizweekgraphics/swoopyarrows) ===== */
// swoopyArrow: a circular arc between two points that subtends `angle` (0 = straight, π = semicircle).
// `bulge` is a rough direction the arc should bow towards.
export function swoopyPts(a, b, angle, bulge, n = 50){
  const th = clamp(angle, .05, Math.PI - .05), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d, s = (nx * bulge.x + ny * bulge.y) > 0 ? -1 : 1;     // centre sits opposite the bulge
  const r = d / (2 * Math.sin(th / 2)), h = r * Math.cos(th / 2), cx = (a.x + b.x) / 2 + nx * s * h, cy = (a.y + b.y) / 2 + ny * s * h;
  const a0 = Math.atan2(a.y - cy, a.x - cx); let da = Math.atan2(b.y - cy, b.x - cx) - a0;
  while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: cx + Math.cos(a0 + da * i / n) * r, y: cy + Math.sin(a0 + da * i / n) * r }));
}
// Draw an arrow in pen, with the library's chevron arrowhead at the end.
export function arrow(pts, o){
  pen(pts, o);
  const e = pts[pts.length - 1], p = pts[Math.max(0, pts.length - 4)], a = Math.atan2(e.y - p.y, e.x - p.x), L = o.head ?? 13, sp = o.spread ?? Math.PI / 4;
  for (const s of [-1, 1]) pen([{ x: e.x - Math.cos(a + s * sp) * L, y: e.y - Math.sin(a + s * sp) * L }, e], Object.assign({}, o, { amp: .05, passes: 1 }));
}
