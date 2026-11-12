// PBR map derivation. Maps made from a single image are estimates, not measured material data.
import { newCanvas, ctx, getData } from './img.js';

export const MAPS = [
  ['baseColor', 'Base Color / Albedo', 'srgb'], ['normal', 'Normal', 'linear'], ['height', 'Height', 'linear'], ['displacement', 'Displacement', 'linear'],
  ['roughness', 'Roughness', 'linear'], ['metallic', 'Metallic', 'linear'], ['ao', 'Ambient Occlusion', 'linear'], ['opacity', 'Opacity', 'linear'],
  ['emission', 'Emission', 'srgb'], ['specular', 'Specular', 'linear'], ['glossiness', 'Glossiness', 'linear'],
];
export const MAP_LABEL = Object.fromEntries(MAPS.map(m => [m[0], m[1]]));
export const MAP_SPACE = Object.fromEntries(MAPS.map(m => [m[0], m[2]]));

export function defaultPbr() {
  return {
    heightSource: 'luminance', heightInvert: false, heightBlur: 1, heightContrast: 1, heightIntensity: 1,
    normalStrength: 2.5, normalY: 'OpenGL', displacementDepth: 1, displacementMid: 0.5,
    roughMin: 0.35, roughMax: 0.85, roughInvert: false, roughContrast: 1,
    metallicMode: 'uniform', metallicValue: 0, metallicThreshold: 0.6, metallicIntensity: 1,
    aoStrength: 1, aoRadius: 8,
    opacityMode: 'alpha', opacityThreshold: 0.5,
    emissionMode: 'none', emissionColor: '#ffffff', emissionIntensity: 1, emissionThreshold: 0.85,
    specularLevel: 0.5, enabled: { baseColor: true, normal: true, height: true, displacement: false, roughness: true, metallic: true, ao: true, opacity: false, emission: false, specular: false, glossiness: false },
  };
}

// Wrap-around box blur (seamless-safe), two passes approximate a Gaussian.
export function blur(src, w, h, r) {
  r = Math.round(r); if (r < 1) return src.slice(); let a = src.slice(), b = new Float32Array(src.length); const k = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let i = -r; i <= r; i++) s += a[row + ((i % w) + w) % w]; for (let x = 0; x < w; x++) { b[row + x] = s * k; s += a[row + (x + r + 1) % w] - a[row + ((x - r) % w + w) % w]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += b[(((i % h) + h) % h) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s * k; s += b[((y + r + 1) % h) * w + x] - b[(((y - r) % h + h) % h) * w + x]; } }
  }
  return a;
}
export function luminance(id) { const d = id.data, n = id.width * id.height, out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = (d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722) / 255; return out; }
function contrast(arr, c, mid = 0.5) { if (c === 1) return arr; for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, Math.max(0, (arr[i] - mid) * c + mid)); return arr; }
function grayImage(arr, w, h) { const id = new ImageData(w, h); const d = id.data; for (let i = 0; i < arr.length; i++) { const v = Math.max(0, Math.min(255, arr[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } return id; }
const hexRGB = s => { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

// src: base color canvas. gen: optional procedural data { height, rough, metal, emis } for exact maps.
export function buildMaps(src, S, gen) {
  const w = src.width, h = src.height, base = getData(src), n = w * h, out = {}, lum = luminance(base);
  // height
  let H = gen?.height ? Float32Array.from(gen.height) : S.heightSource === 'alpha' ? Float32Array.from({ length: n }, (_, i) => base.data[i * 4 + 3] / 255) : lum.slice();
  if (S.heightInvert) for (let i = 0; i < n; i++) H[i] = 1 - H[i];
  if (!gen?.height && S.heightBlur > 0) H = blur(H, w, h, S.heightBlur);
  contrast(H, S.heightContrast); if (S.heightIntensity !== 1) for (let i = 0; i < n; i++) H[i] = Math.min(1, Math.max(0, 0.5 + (H[i] - 0.5) * S.heightIntensity));
  const en = S.enabled;
  if (en.baseColor) out.baseColor = base;
  if (en.height) out.height = grayImage(H, w, h);
  if (en.displacement) { const D = new Float32Array(n); for (let i = 0; i < n; i++) D[i] = S.displacementMid + (H[i] - 0.5) * S.displacementDepth; out.displacement = grayImage(D, w, h); }
  if (en.normal) {
    const id = new ImageData(w, h), d = id.data, k = S.normalStrength, flip = S.normalY === 'DirectX' ? -1 : 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const g = (xx, yy) => H[((yy + h) % h) * w + (xx + w) % w];
      const dx = (g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1)) - (g(x - 1, y - 1) + 2 * g(x - 1, y) + g(x - 1, y + 1));
      const dy = (g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1)) - (g(x - 1, y - 1) + 2 * g(x, y - 1) + g(x + 1, y - 1));
      let nx = -dx * k, ny = dy * k * flip, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    out.normal = id;
  }
  let R;
  if (en.roughness || en.glossiness || en.specular) {
    R = new Float32Array(n);
    if (gen?.rough) for (let i = 0; i < n; i++) R[i] = S.roughMin + gen.rough[i] * (S.roughMax - S.roughMin);
    else { const L = contrast(lum.slice(), S.roughContrast); for (let i = 0; i < n; i++) { const t = S.roughInvert ? L[i] : 1 - L[i]; R[i] = S.roughMin + t * (S.roughMax - S.roughMin); } }
    if (en.roughness) out.roughness = grayImage(R, w, h);
    if (en.glossiness) out.glossiness = grayImage(R.map(v => 1 - v), w, h);
  }
  let M;
  if (en.metallic || en.specular) {
    M = new Float32Array(n);
    if (S.metallicMode === 'procedural' && gen?.metal) for (let i = 0; i < n; i++) M[i] = gen.metal[i] * S.metallicIntensity;
    else if (S.metallicMode === 'threshold') for (let i = 0; i < n; i++) M[i] = (lum[i] >= S.metallicThreshold ? 1 : 0) * S.metallicIntensity;
    else M.fill(S.metallicValue * S.metallicIntensity);
    if (en.metallic) out.metallic = grayImage(M, w, h);
  }
  if (en.ao) {
    const r1 = blur(H, w, h, Math.max(1, S.aoRadius / 2)), r2 = blur(H, w, h, S.aoRadius * 2), A = new Float32Array(n);
    for (let i = 0; i < n; i++) { const cav = Math.max(0, r1[i] - H[i]) * 0.6 + Math.max(0, r2[i] - H[i]) * 0.4; A[i] = 1 - Math.min(1, cav * 4 * S.aoStrength); }
    out.ao = grayImage(A, w, h);
  }
  if (en.opacity) {
    const O = new Float32Array(n);
    for (let i = 0; i < n; i++) O[i] = S.opacityMode === 'alpha' ? base.data[i * 4 + 3] / 255 : S.opacityMode === 'luminance' ? (lum[i] >= S.opacityThreshold ? 1 : 0) : (lum[i] < S.opacityThreshold ? 1 : 0);
    out.opacity = grayImage(O, w, h);
  }
  if (en.emission) {
    const id = new ImageData(w, h), d = id.data, c = hexRGB(S.emissionColor), k = S.emissionIntensity;
    for (let i = 0; i < n; i++) {
      const m = S.emissionMode === 'procedural' && gen?.emis ? gen.emis[i] : S.emissionMode === 'threshold' ? (lum[i] >= S.emissionThreshold ? 1 : 0) : S.emissionMode === 'color' ? 1 : 0;
      for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = Math.min(255, (S.emissionMode === 'threshold' ? base.data[i * 4 + ch] * c[ch] / 255 : c[ch]) * m * k); d[i * 4 + 3] = 255;
    }
    out.emission = id;
  }
  if (en.specular) { const Sp = new Float32Array(n); for (let i = 0; i < n; i++) Sp[i] = (1 - M[i]) * S.specularLevel * (1 - R[i] * 0.5) + M[i] * lum[i]; out.specular = grayImage(Sp, w, h); }
  return out;
}
export function toCanvas(id) { const c = newCanvas(id.width, id.height); ctx(c).putImageData(id, 0, 0); return c; }

// Channel packing for engines: ORM (Unreal), MaskMap (Unity HDRP), MetallicSmoothness (Unity URP).
export function pack(kind, maps, w, h) {
  const g = k => maps[k] ? maps[k].data : null; const ao = g('ao'), r = g('roughness'), m = g('metallic');
  const id = new ImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) {
    const A = ao ? ao[i * 4] : 255, R = r ? r[i * 4] : 128, M = m ? m[i * 4] : 0, i4 = i * 4;
    if (kind === 'ORM') { d[i4] = A; d[i4 + 1] = R; d[i4 + 2] = M; d[i4 + 3] = 255; }
    else if (kind === 'MaskMap') { d[i4] = M; d[i4 + 1] = A; d[i4 + 2] = 0; d[i4 + 3] = 255 - R; }
    else { d[i4] = M; d[i4 + 1] = M; d[i4 + 2] = M; d[i4 + 3] = 255 - R; }
  }
  return id;
}
