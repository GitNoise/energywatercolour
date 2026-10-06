/**
 * Bump-stream layout: scales, interpolation, and band-outline helpers.
 *
 * The stream runs left to right (1965 → 2024). Each year the sources are
 * re-stacked by size (smallest on top). Between years, band centres ease
 * from one year's slot to the next so overtakes show as crossings.
 */
import { scaleLinear } from 'd3';
import { clamp } from './random.js';

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/** Uniform Catmull–Rom at year index t, matching `curveCatmullRom.alpha(0)`. */
export function interpolateSeries(values, t) {
  const k = Math.min(58, Math.floor(t));
  const f = t - k;
  const at = j => values[clamp(j, 0, 59)];

  const p0 = at(k - 1);
  const p1 = at(k);
  const p2 = at(k + 1);
  const p3 = at(k + 2);

  const v = 0.5 * (
    (2 * p1)
    + (-p0 + p2) * f
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
    + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f
  );
  return Math.max(0, v);
}

/** Sample every source at each x-column. */
export function sampleStreamValues(xs, x0, x1, energy, sourceCount) {
  const yearToT = scaleLinear().domain([x0, x1]).range([0, 59]);
  const series = Array.from({ length: sourceCount }, (_, i) => energy.map(row => row[i]));

  return xs.map(x => {
    const t = yearToT(x);
    return series.map(vals => interpolateSeries(vals, t));
  });
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/**
 * Horizontal scales for the bump stream.
 * @returns {{ xOf, yearToT, cyAt, endness }}
 */
export function makeStreamScales(W, H, x0, x1) {
  const xOf = scaleLinear().domain([1965, 2024]).range([x0, x1]);
  const yearToT = scaleLinear().domain([x0, x1]).range([0, 59]);
  const cyAt = scaleLinear().domain([x0, x1]).range([H * 0.535, H * 0.595]).clamp(true);
  const streamProgress = scaleLinear().domain([x0, x1]).range([0, 1]).clamp(true);

  // How loose the Hobbs edges become towards 2024 (open end of the stream).
  const smoothstep = t => t * t * (3 - 2 * t);
  const endness = x => {
    const t = streamProgress(x);
    return smoothstep(clamp((t - 0.82) / 0.18, 0, 1));
  };

  return { xOf, yearToT, cyAt, endness };
}

// ---------------------------------------------------------------------------
// Band outlines (input to Hobbs deformation)
// ---------------------------------------------------------------------------

/** Top edge forward, bottom edge reversed — a closed polygon wound for `shape()`. */
export function bandOutlinePoints(xs, bands, run, bandIndex) {
  const top = run.map(j => ({ x: xs[j], y: bands[j][bandIndex][0] }));
  const bottom = run.map(j => ({ x: xs[j], y: bands[j][bandIndex][1] })).reverse();
  return top.concat(bottom);
}
