/**
 * WebGL2 watercolour renderer.
 *
 * Pipeline
 * --------
 * 1. Normalise the input (full `<svg>` or bare path markup) and optionally set fill colour.
 * 2. Rasterise the shape to a canvas — its alpha channel is the paint mask.
 * 3. Run a full-screen fragment shader over the mask:
 *      - warp UVs (anisotropic bleed along the band)
 *      - layer fBm noise at four scales (wash, pooling, grain, paper)
 *      - darken and pool pigment at edges
 * 4. Return an `<svg>` wrapping the painted result as a PNG data URL.
 *
 * The WebGL context is released after each call so painting nine bands does not
 * hit the browser's context limit.
 *
 * Public API: `watercolor()`, `loadImage()`, `darken()`.
 */

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  width: 1024,
  height: 1024,
  color: null,           // fill colour; inferred from SVG if omitted
  seed: 1,               // drives all shader noise
  passes: 7,             // virtual wash layers (opacity saturates with exp)
  strength: 0.72,        // overall pigment density
  granulation: 0.42,     // fine grain strength
  edgeDarkening: 0.58,   // pigment pooling at mask edges
  bleed: 0.75,           // domain-warp distance (anisotropic)
  paper: 0.22,           // paper-fibre texture strength
  roughness: 0.7,        // high-frequency opacity jitter
  opacity: 1,
};

// Two triangles covering clip space [-1, 1].
const QUAD = new Float32Array([
  -1, -1,  1, -1,  -1, 1,
  -1,  1,  1, -1,   1, 1,
]);

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;   // rasterised SVG alpha mask
uniform vec2 u_resolution;     // mask size in pixels
uniform float u_seed;
uniform float u_strength;
uniform float u_granulation;
uniform float u_edge;
uniform float u_bleed;
uniform float u_paper;
uniform float u_roughness;
uniform float u_passes;
uniform vec3 u_color;
uniform float u_opacity;

// --- noise utilities -------------------------------------------------------

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += noise(p) * a;
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

// --- mask sampling ---------------------------------------------------------

float sourceAlpha(vec2 uv) {
  return texture(u_texture, clamp(uv, 0.0, 1.0)).a;
}

// Anisotropic domain warp: bleed mostly along x (time axis), less across y.
vec2 warp(vec2 uv) {
  float a = fbm(uv * 2.0 + vec2(u_seed * 0.071, u_seed * 0.113));
  float b = fbm(uv * 2.0 + vec2(17.2 + u_seed * 0.037, 31.8 + u_seed * 0.091));
  vec2 offset = (vec2(a, b) - 0.5) * vec2(0.12, 0.04) * u_bleed;
  return uv + offset;
}

// Edge detector on the source mask (for pooling at band boundaries).
float boundary(vec2 uv) {
  vec2 px = 1.0 / u_resolution;
  float l = sourceAlpha(uv - vec2(px.x, 0.0));
  float r = sourceAlpha(uv + vec2(px.x, 0.0));
  float up = sourceAlpha(uv + vec2(0.0, px.y));
  float d = sourceAlpha(uv - vec2(0.0, px.y));
  return clamp(abs(r - l) + abs(up - d), 0.0, 1.0);
}

// --- main ------------------------------------------------------------------

void main() {
  vec2 uv = v_uv;

  // 1. Sample the mask, then re-sample after warping (bleed).
  float alpha = sourceAlpha(uv);
  vec2 warpedUV = warp(uv);
  float warpedAlpha = sourceAlpha(warpedUV);
  float edge = boundary(uv);

  // 2. Layered paper texture at increasing frequency.
  float wash    = fbm(warpedUV * 3.4   + u_seed * 0.017);
  float pooling = fbm(warpedUV * 10.0  + vec2(u_seed * 0.131, u_seed * 0.217));
  float grain   = fbm(warpedUV * 48.0  + u_seed * 0.371);
  float paper   = fbm(warpedUV * 115.0 + vec2(42.0 + u_seed, 73.0 - u_seed));
  float irregularity = wash * 0.55 + pooling * 0.30 + grain * 0.15;

  // 3. Build opacity from bleed mask + textures + edge pool.
  float bleedMask = max(warpedAlpha, alpha * 0.72);
  bleedMask = mix(bleedMask, smoothstep(0.0, 0.72, bleedMask), 0.65);

  float edgePool = smoothstep(0.05, 0.75, edge) * (0.55 + 0.45 * pooling);

  float opacity = bleedMask * (0.64 + irregularity * 0.42);
  opacity *= mix(0.72, 1.0, smoothstep(0.15, 0.85, pooling));
  opacity *= mix(1.0, 0.60 + grain * 0.85, u_granulation);
  opacity *= mix(1.0, 0.72 + paper * 0.56, u_paper);
  opacity += edgePool * u_edge * alpha * 0.38;
  opacity *= 0.88 + noise(warpedUV * 75.0 + u_seed) * 0.24 * u_roughness;
  opacity *= 1.0 - exp(-u_passes * 0.115);
  opacity *= u_strength * u_opacity;

  // 4. Pigment colour with subtle channel variation from the textures.
  vec3 pigment = u_color;
  pigment.r *= 0.94 + pooling * 0.10;
  pigment.g *= 0.95 + grain * 0.08;
  pigment.b *= 0.92 + wash * 0.12;
  pigment = mix(vec3(1.0), pigment, 0.88 + pooling * 0.12);

  // 5. Fade out away from the mask so only the shape carries paint.
  opacity *= mix(0.75, 1.0, alpha);

  outColor = vec4(pigment, clamp(opacity, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Paint an SVG shape with the watercolour shader.
 *
 * @param {string} svg  Full `<svg>` markup, or bare path elements to wrap.
 * @param {object} [options]  See DEFAULTS above.
 * @returns {Promise<string>}  SVG string with an embedded PNG data URL.
 */
export async function watercolor(svg, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const source = normalizeSVG(svg, opt.width, opt.height, opt.color);
  const maskCanvas = await rasterizeSVG(source.svg, source.width, source.height);

  const paintCanvas = document.createElement('canvas');
  paintCanvas.width = source.width;
  paintCanvas.height = source.height;

  const gl = paintCanvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL2 is required.');

  paintMask(gl, maskCanvas, source.width, source.height, opt, opt.color || source.color || '#315b91');
  const png = paintCanvas.toDataURL('image/png');

  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  const { width, height } = source;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${png}"/></svg>`;
}

/** Load a painted band from a data URL (extracted from the SVG `<image href>`). */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load painted band.'));
    image.src = src;
  });
}

/** Darken a hex colour by a factor in [0, 1]. Used for annotation ink. */
export function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * (1 - amount) * 255));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Render pass
// ---------------------------------------------------------------------------

function paintMask(gl, maskCanvas, width, height, opt, colorHex) {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  gl.useProgram(program);

  setupQuad(gl, program);
  gl.viewport(0, 0, width, height);
  gl.clearColor(1, 1, 1, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const maskTexture = uploadTexture(gl, maskCanvas);
  setShaderUniforms(gl, program, maskTexture, width, height, opt, colorHex);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.finish();
}

function setupQuad(gl, program) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}

function setShaderUniforms(gl, program, maskTexture, width, height, opt, colorHex) {
  const [r, g, b] = hexToRgb(colorHex);
  const loc = name => gl.getUniformLocation(program, name);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.uniform1i(loc('u_texture'), 0);

  gl.uniform2f(loc('u_resolution'), width, height);
  gl.uniform1f(loc('u_seed'), opt.seed);
  gl.uniform1f(loc('u_strength'), opt.strength);
  gl.uniform1f(loc('u_granulation'), opt.granulation);
  gl.uniform1f(loc('u_edge'), opt.edgeDarkening);
  gl.uniform1f(loc('u_bleed'), opt.bleed);
  gl.uniform1f(loc('u_paper'), opt.paper);
  gl.uniform1f(loc('u_roughness'), opt.roughness);
  gl.uniform1f(loc('u_passes'), opt.passes);
  gl.uniform3f(loc('u_color'), r, g, b);
  gl.uniform1f(loc('u_opacity'), opt.opacity);
}

// ---------------------------------------------------------------------------
// SVG → canvas mask
// ---------------------------------------------------------------------------

/**
 * Accept either a complete SVG document or bare shape markup.
 * Returns serialised SVG plus its pixel dimensions.
 */
function normalizeSVG(input, width, height, color) {
  const trimmed = input.trim();

  if (/^<svg[\s>]/i.test(trimmed)) {
    return normalizeSVGDocument(trimmed, width, height, color);
  }

  const svgColor = color || extractAttribute(trimmed, 'fill') || '#315b91';
  const wrapped =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<g fill="${escapeAttribute(svgColor)}">${trimmed}</g></svg>`;

  return { svg: wrapped, width, height, color: svgColor };
}

function normalizeSVGDocument(svg, fallbackWidth, fallbackHeight, color) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const viewBox = root.getAttribute('viewBox');

  let width = parseFloat(root.getAttribute('width')) || fallbackWidth;
  let height = parseFloat(root.getAttribute('height')) || fallbackHeight;

  if (viewBox) {
    const [, , vbWidth, vbHeight] = viewBox.trim().split(/[\s,]+/).map(Number);
    if (vbWidth && vbHeight) {
      width = vbWidth;
      height = vbHeight;
    }
  }

  if (!root.getAttribute('viewBox')) {
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  root.setAttribute('width', width);
  root.setAttribute('height', height);

  if (color) {
    root.querySelectorAll('path, polygon, polyline, rect, circle, ellipse')
      .forEach(el => el.setAttribute('fill', color));
  }

  return {
    svg: new XMLSerializer().serializeToString(root),
    width,
    height,
    color,
  };
}

/** Draw SVG to a canvas; alpha becomes the paint mask. */
function rasterizeSVG(svg, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('Could not rasterize SVG.'));
    // data: URLs work on static hosts; blob: URLs are often blocked when published.
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function extractAttribute(str, name) {
  const match = str.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function uploadTexture(gl, canvas) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  return texture;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** @returns {[number, number, number]} RGB in 0–1. */
function hexToRgb(hex) {
  let value = hex.trim().replace('#', '');
  if (value.length === 3) value = value.split('').map(ch => ch + ch).join('');
  const n = parseInt(value, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
