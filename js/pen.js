/**
 * Hand-drawn marks on the canvas.
 *
 * - `pen` — wobbly stroke with width variation and a faint second pass
 * - `label`, `para` — Newsreader text
 * - `swoopyPts`, `arrow` — circular-arc arrows after bizweekgraphics/swoopyarrows
 */
import { ctx, INK } from './canvas.js';
import { clamp, makeNoise } from './random.js';

// ---------------------------------------------------------------------------
// Pen stroke
// ---------------------------------------------------------------------------

function resampleOpen(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) {
      out.push({
        x: a.x + (b.x - a.x) * k / n,
        y: a.y + (b.y - a.y) * k / n,
      });
    }
  }
  return out;
}

/**
 * Draw a hand-drawn polyline: low-frequency wobble perpendicular to the path,
 * line width that swells and thins, and a faint second pass.
 */
export function pen(points, options = {}) {
  const R = options.R;
  const n1 = makeNoise(R);
  const n2 = makeNoise(R);
  const amp = options.amp ?? 1.4;
  const freq = options.freq ?? 60;
  const width = options.w ?? 1.2;
  const phase = R.next() * 100;

  const sampled = resampleOpen(points, 3);
  const wobbly = [];
  let dist = 0;

  for (let i = 0; i < sampled.length; i++) {
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;

    if (i) dist += Math.hypot(sampled[i].x - sampled[i - 1].x, sampled[i].y - sampled[i - 1].y);

    const off = n1(dist / freq + phase) * amp + n2(dist / 9 + phase) * amp * 0.25;
    wobbly.push({
      x: sampled[i].x - dy / len * off,
      y: sampled[i].y + dx / len * off,
      d: dist,
    });
  }

  ctx.save();
  ctx.strokeStyle = options.color || INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const passes = options.passes ?? 2;
  for (let pass = 0; pass < passes; pass++) {
    ctx.globalAlpha = (options.alpha ?? 0.9) * (pass ? 0.3 : 1);
    for (let i = 0; i < wobbly.length - 1; i += 6) {
      ctx.lineWidth = Math.max(0.3, width * (1 + 0.45 * n2(wobbly[i].d / 40 + phase + pass * 7)) * (pass ? 0.7 : 1));
      ctx.beginPath();
      ctx.moveTo(wobbly[i].x + pass * 0.8, wobbly[i].y + pass * 0.6);
      for (let k = i + 1; k <= Math.min(wobbly.length - 1, i + 6); k++) {
        ctx.lineTo(wobbly[k].x + pass * 0.8, wobbly[k].y + pass * 0.6);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Text and dots
// ---------------------------------------------------------------------------

export function dot(x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 7);
  ctx.fill();
  ctx.restore();
}

export function label(text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || INK;
  ctx.globalAlpha = options.alpha ?? 0.85;
  ctx.font = `${options.italic === false ? '' : 'italic '}${options.size || 15}px Newsreader, Georgia, serif`;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Word-wrapped paragraph. Set `measure: true` to size without drawing.
 * Optional `stats.maxw` records the widest line.
 */
export function para(text, x, y, maxWidth, options = {}) {
  const size = options.size || 15;
  const lineHeight = size * (options.lh || 1.32);

  ctx.save();
  ctx.fillStyle = options.color || INK;
  ctx.globalAlpha = options.alpha ?? 0.92;
  ctx.font = `${options.weight || ''} ${options.italic ? 'italic' : ''} ${size}px Newsreader, Georgia, serif`;
  if (options.caps) ctx.fontVariantCaps = 'small-caps';
  if (options.spacing) ctx.letterSpacing = options.spacing + 'px';
  ctx.textBaseline = 'top';
  ctx.textAlign = options.align || 'left';

  const words = text.split(' ');
  let line = '';
  let yy = y;
  let maxw = 0;

  const drawLine = (t, lineY) => {
    maxw = Math.max(maxw, ctx.measureText(t).width);
    if (!options.measure) ctx.fillText(t, x, lineY);
  };

  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      drawLine(line, yy);
      yy += lineHeight;
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) {
    drawLine(line, yy);
    yy += lineHeight;
  }

  ctx.restore();
  if (options.stats) options.stats.maxw = maxw;
  return yy - y;
}

// ---------------------------------------------------------------------------
// Swoopy arrows (after bizweekgraphics/swoopyarrows)
// ---------------------------------------------------------------------------

/**
 * Circular arc between two points.
 * @param {number} angle  Subtended angle in radians (0 ≈ straight, π ≈ semicircle).
 * @param {{x,y}} bulge   Rough direction the arc should bow towards.
 */
export function swoopyPts(a, b, angle, bulge, samples = 50) {
  const th = clamp(angle, 0.05, Math.PI - 0.05);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy) || 1;
  const nx = -dy / chord;
  const ny = dx / chord;
  const side = (nx * bulge.x + ny * bulge.y) > 0 ? -1 : 1;

  const r = chord / (2 * Math.sin(th / 2));
  const h = r * Math.cos(th / 2);
  const cx = (a.x + b.x) / 2 + nx * side * h;
  const cy = (a.y + b.y) / 2 + ny * side * h;

  const a0 = Math.atan2(a.y - cy, a.x - cx);
  let da = Math.atan2(b.y - cy, b.x - cx) - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;

  return Array.from({ length: samples + 1 }, (_, i) => ({
    x: cx + Math.cos(a0 + da * i / samples) * r,
    y: cy + Math.sin(a0 + da * i / samples) * r,
  }));
}

/** Draw a swoopy path with a chevron arrowhead at the end. */
export function arrow(points, options) {
  pen(points, options);

  const end = points[points.length - 1];
  const near = points[Math.max(0, points.length - 4)];
  const heading = Math.atan2(end.y - near.y, end.x - near.x);
  const headLen = options.head ?? 13;
  const spread = options.spread ?? Math.PI / 4;

  for (const sign of [-1, 1]) {
    pen(
      [
        { x: end.x - Math.cos(heading + sign * spread) * headLen, y: end.y - Math.sin(heading + sign * spread) * headLen },
        end,
      ],
      { ...options, amp: 0.05, passes: 1 },
    );
  }
}
