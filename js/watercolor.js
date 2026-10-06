/* ===== watercolor.js: zero-dependency WebGL2 watercolor renderer =====
   Inlined from the supplied watercolor.js. Two changes:
   - the SVG is rasterised from a data: URL instead of a blob: URL, which published pages block;
   - the texture is uploaded with UNPACK_FLIP_Y, so the painted shape isn't upside down.
   Each call also releases its WebGL context afterwards, so painting nine bands doesn't hit the browser's context limit. */
export async function watercolor(svg, options = {}) {
  const opt = {
    width: options.width ?? 1024, height: options.height ?? 1024, color: options.color ?? null, seed: options.seed ?? 1,
    passes: options.passes ?? 7, strength: options.strength ?? 0.72, granulation: options.granulation ?? 0.42,
    edgeDarkening: options.edgeDarkening ?? 0.58, bleed: options.bleed ?? 0.75, paper: options.paper ?? 0.22,
    roughness: options.roughness ?? 0.7, opacity: options.opacity ?? 1
  };
  const source = normalizeSVG(svg, opt.width, opt.height, opt.color);
  const sourceCanvas = await rasterizeSVG(source.svg, source.width, source.height);
  const glCanvas = document.createElement("canvas");
  glCanvas.width = source.width; glCanvas.height = source.height;
  const gl = glCanvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is required.");
  const sourceTexture = createTexture(gl, sourceCanvas);
  const program = createProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const u = n => gl.getUniformLocation(program, n);
  const rgb = hexToRgb(opt.color || source.color || "#315b91");
  gl.viewport(0, 0, source.width, source.height);
  gl.clearColor(1, 1, 1, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(u("u_texture"), 0);
  gl.uniform2f(u("u_resolution"), source.width, source.height);
  gl.uniform1f(u("u_seed"), opt.seed); gl.uniform1f(u("u_strength"), opt.strength);
  gl.uniform1f(u("u_granulation"), opt.granulation); gl.uniform1f(u("u_edge"), opt.edgeDarkening);
  gl.uniform1f(u("u_bleed"), opt.bleed); gl.uniform1f(u("u_paper"), opt.paper);
  gl.uniform1f(u("u_roughness"), opt.roughness); gl.uniform1f(u("u_passes"), opt.passes);
  gl.uniform3f(u("u_color"), rgb[0], rgb[1], rgb[2]); gl.uniform1f(u("u_opacity"), opt.opacity);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.finish();
  const png = glCanvas.toDataURL("image/png");
  const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${source.width}" height="${source.height}" viewBox="0 0 ${source.width} ${source.height}"><image width="${source.width}" height="${source.height}" href="${png}"/></svg>`;
}
function normalizeSVG(input, width, height, color) {
  const trimmed = input.trim();
  if (/^<svg[\s>]/i.test(trimmed)) {
    const doc = new DOMParser().parseFromString(trimmed, "image/svg+xml"), root = doc.documentElement, vb = root.getAttribute("viewBox");
    let w = parseFloat(root.getAttribute("width")) || width, h = parseFloat(root.getAttribute("height")) || height;
    if (vb) { const parts = vb.trim().split(/[\s,]+/).map(Number); if (parts.length === 4) { w = parts[2]; h = parts[3]; } }
    if (!root.getAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    root.setAttribute("width", w); root.setAttribute("height", h);
    if (color) root.querySelectorAll("path, polygon, polyline, rect, circle, ellipse").forEach(el => el.setAttribute("fill", color));
    return { svg: new XMLSerializer().serializeToString(root), width: w, height: h, color };
  }
  const svgColor = color || extractAttribute(trimmed, "fill") || "#315b91";
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="${escapeAttribute(svgColor)}">${trimmed}</g></svg>`, width, height, color: svgColor };
}
function extractAttribute(str, name) { const m = str.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i")); return m ? m[1] : null; }
function escapeAttribute(v) { return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function rasterizeSVG(svg, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { const c = document.createElement("canvas"); c.width = width; c.height = height;
      const g = c.getContext("2d"); g.clearRect(0, 0, width, height); g.drawImage(image, 0, 0, width, height); resolve(c); };
    image.onerror = () => reject(new Error("Could not rasterize SVG."));
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
function createTexture(gl, canvas) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  return t;
}
function createProgram(gl, vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
}
function compileShader(gl, type, source) {
  const sh = gl.createShader(type); gl.shaderSource(sh, source); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh;
}
const vertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }
`;
const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_seed, u_strength, u_granulation, u_edge, u_bleed, u_paper, u_roughness, u_passes;
uniform vec3 u_color;
uniform float u_opacity;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += noise(p) * a; p *= 2.03; a *= 0.5; } return v; }
vec2 warp(vec2 p) {
  float a = fbm(p * 2.0 + vec2(u_seed * 0.071, u_seed * 0.113));
  float b = fbm(p * 2.0 + vec2(17.2 + u_seed * 0.037, 31.8 + u_seed * 0.091));
  return p + (vec2(a, b) - 0.5) * vec2(0.12, 0.04) * u_bleed;   // bleed mostly along the flow, a little across it
}
float sourceAlpha(vec2 uv) { return texture(u_texture, clamp(uv, 0.0, 1.0)).a; }
float boundary(vec2 uv) {
  vec2 px = 1.0 / u_resolution;
  float l = sourceAlpha(uv - vec2(px.x, 0.0)), r = sourceAlpha(uv + vec2(px.x, 0.0));
  float up = sourceAlpha(uv + vec2(0.0, px.y)), d = sourceAlpha(uv - vec2(0.0, px.y));
  return clamp(abs(r - l) + abs(up - d), 0.0, 1.0);
}
void main() {
  vec2 uv = v_uv;
  float alpha = sourceAlpha(uv);
  vec2 p = warp(uv);
  float warpedAlpha = sourceAlpha(p);
  float edge = boundary(uv);
  float wash = fbm(p * 3.4 + u_seed * 0.017);                                  // large-scale wet-paper wash
  float pooling = fbm(p * 10.0 + vec2(u_seed * 0.131, u_seed * 0.217));        // medium pigment pooling
  float grain = fbm(p * 48.0 + u_seed * 0.371);                                // fine granulation
  float paper = fbm(p * 115.0 + vec2(42.0 + u_seed, 73.0 - u_seed));           // paper fibres
  float irregularity = wash * 0.55 + pooling * 0.30 + grain * 0.15;
  float bleedMask = max(warpedAlpha, alpha * 0.72);
  bleedMask = mix(bleedMask, smoothstep(0.0, 0.72, bleedMask), 0.65);
  float edgePool = smoothstep(0.05, 0.75, edge) * (0.55 + 0.45 * pooling);
  float opacity = bleedMask * (0.64 + irregularity * 0.42);
  opacity *= mix(0.72, 1.0, smoothstep(0.15, 0.85, pooling));
  opacity *= mix(1.0, 0.60 + grain * 0.85, u_granulation);
  opacity *= mix(1.0, 0.72 + paper * 0.56, u_paper);
  opacity += edgePool * u_edge * alpha * 0.38;
  opacity *= 0.88 + noise(p * 75.0 + u_seed) * 0.24 * u_roughness;
  opacity *= 1.0 - exp(-u_passes * 0.115);
  opacity *= u_strength * u_opacity;
  vec3 pigment = u_color;
  pigment.r *= 0.94 + pooling * 0.10; pigment.g *= 0.95 + grain * 0.08; pigment.b *= 0.92 + wash * 0.12;
  pigment = mix(vec3(1.0), pigment, 0.88 + pooling * 0.12);
  opacity *= mix(0.75, 1.0, alpha);
  outColor = vec4(pigment, clamp(opacity, 0.0, 1.0));
}
`;
export function darken(hex, k){ const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * (1 - k) * 255)); return `rgb(${r},${g},${b})`; }
function hexToRgb(hex) {
  hex = hex.trim().replace("#", ""); if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
  const n = parseInt(hex, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not load painted band.')); im.src = src; });
