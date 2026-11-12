// Procedural material engine. Pure math, runs in a Web Worker. All noise is periodic, so output tiles seamlessly.
const TAU = Math.PI * 2;
const fract = x => x - Math.floor(x);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const mod = (a, n) => ((a % n) + n) % n;

function makeNoise(seed, aspect, seamless) {
  const big = 4096;
  const fr = f => Math.max(1, Math.round(f)); // feature count across the tile
  const per = f => seamless ? fr(f) : big;      // wrap period: equal to frequency when seamless
  function grad(u, v, px, py, s) {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const g = (ix, iy, dx, dy) => { const a = hash(mod(ix, px), mod(iy, py), s) * TAU; return Math.cos(a) * dx + Math.sin(a) * dy; };
    return lerp(lerp(g(x0, y0, fx, fy), g(x0 + 1, y0, fx - 1, fy), sx), lerp(g(x0, y0 + 1, fx, fy - 1), g(x0 + 1, y0 + 1, fx - 1, fy - 1), sx), sy) * 1.41;
  }
  // fbm in [0,1]. fx, fy are cell counts across the tile.
  function n(x, y, fx, fy = fx, oct = 4, s = 0) {
    let sum = 0, amp = 0.5, norm = 0, m = 1; const FX = fr(fx), FY = fr(fy * aspect), PX = per(fx), PY = per(fy * aspect);
    for (let o = 0; o < oct; o++) { sum += amp * grad(x * FX * m, y * FY * m, PX * m, PY * m, seed + s * 131 + o * 17); norm += amp; amp *= 0.5; m *= 2; }
    return clamp01(0.5 + 0.5 * sum / norm * 1.6);
  }
  function ridge(x, y, fx, fy = fx, oct = 4, s = 0) {
    let sum = 0, amp = 0.5, norm = 0, m = 1; const FX = fr(fx), FY = fr(fy * aspect), PX = per(fx), PY = per(fy * aspect);
    for (let o = 0; o < oct; o++) { sum += amp * (1 - Math.abs(grad(x * FX * m, y * FY * m, PX * m, PY * m, seed + s * 131 + o * 23))); norm += amp; amp *= 0.5; m *= 2; }
    return clamp01(sum / norm);
  }
  // Worley: f1, f2 distances (cell units), id of nearest cell, vector to nearest point.
  const W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
  function w(x, y, f, s = 0, jitter = 0.9) {
    const PX = per(f), PY = per(f * aspect); const u = x * fr(f), v = y * fr(f * aspect), cx = Math.floor(u), cy = Math.floor(v);
    let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ix = cx + i, iy = cy + j, hx = mod(ix, PX), hy = mod(iy, PY);
      const px = ix + 0.5 + (hash(hx, hy, seed + s * 7 + 1) - 0.5) * jitter, py = iy + 0.5 + (hash(hx, hy, seed + s * 7 + 2) - 0.5) * jitter;
      const dx = px - u, dy = py - v, d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hash(hx, hy, seed + s * 7 + 3); bx = dx; by = dy; } else if (d < f2) f2 = d;
    }
    W.f1 = f1; W.f2 = f2; W.id = id; W.dx = bx; W.dy = by; return W;
  }
  const h = (x, y, s = 0) => hash(x | 0, y | 0, seed + s);
  return { n, ridge, w, h, per };
}

export const CATEGORY_DEFAULTS = {
  'Wood': ['wood', ['#5a3820', '#9a6a3f', '#c9975e'], 0.65, 0],
  'Metal': ['metal', ['#6b6f75', '#a6abb2', '#d7dbe0'], 0.35, 1],
  'Concrete': ['concrete', ['#6e6c68', '#9a9893', '#bdbab3'], 0.85, 0],
  'Stone': ['stone', ['#4e4a44', '#7d776d', '#a39b8e'], 0.8, 0],
  'Marble': ['marble', ['#f2f0ec', '#d9d6d0', '#5d5a58'], 0.18, 0],
  'Granite': ['granite', ['#2b2a2c', '#8b8580', '#e2ddd6'], 0.4, 0],
  'Brick': ['brick', ['#5e2a1d', '#9c4a32', '#c8bfb2'], 0.85, 0],
  'Ceramic': ['ceramic', ['#cfd8dc', '#eef2f3', '#9aa3a6'], 0.2, 0],
  'Glass': ['glass', ['#9fc6cf', '#cfe8ec', '#ffffff'], 0.05, 0],
  'Plastic': ['plastic', ['#c0392b', '#e74c3c', '#f1948a'], 0.4, 0],
  'Rubber': ['rubber', ['#1c1c1e', '#2c2c2e', '#3a3a3c'], 0.9, 0],
  'Leather': ['leather', ['#3b2216', '#6b3e26', '#8f5a3a'], 0.6, 0],
  'Fabric': ['fabric', ['#2d3e57', '#4a6286', '#7891b5'], 0.85, 0],
  'Cloth': ['cloth', ['#22324a', '#3d5a80', '#6c8ebf'], 0.9, 0],
  'Paper': ['paper', ['#d8d2c4', '#ece7db', '#f8f5ee'], 0.9, 0],
  'Sand': ['sand', ['#b8995e', '#d6bb83', '#ead6a8'], 0.9, 0],
  'Soil': ['soil', ['#2e2016', '#4f3826', '#6e5038'], 0.95, 0],
  'Grass': ['grass', ['#1e3d14', '#3d6b22', '#7aa33c'], 0.8, 0],
  'Leaves': ['leaves', ['#2f4a1a', '#5e7d2a', '#a3803a'], 0.7, 0],
  'Water': ['water', ['#0b3954', '#1b6b8a', '#7fc8d8'], 0.04, 0],
  'Ice': ['ice', ['#8fb8cc', '#c3e0ec', '#f2fbff'], 0.1, 0],
  'Snow': ['snow', ['#c7d3dd', '#e8eef3', '#ffffff'], 0.6, 0],
  'Rust': ['rust', ['#5a2410', '#a04a1c', '#7a7e84'], 0.8, 0.6],
  'Dirt': ['dirt', ['#3a2b1e', '#5c4632', '#7d6448'], 0.95, 0],
  'Asphalt': ['asphalt', ['#1f1f21', '#3a3a3d', '#77777a'], 0.9, 0],
  'Carbon fiber': ['carbon', ['#0c0c0e', '#1f2024', '#3d3f45'], 0.25, 0],
  'Painted surfaces': ['painted', ['#2f6f8f', '#3f8fb5', '#8d8f94'], 0.45, 0],
  'Industrial materials': ['diamond', ['#6d7177', '#9da2a8', '#c9cdd2'], 0.4, 1],
  'Fantasy materials': ['fantasy', ['#1d0f33', '#4b2a7a', '#8a5cff'], 0.3, 0],
  'Sci-fi materials': ['scifi', ['#2a2f37', '#4a525e', '#7c8796'], 0.4, 0.7],
  'Abstract patterns': ['abstract', ['#ff4d6d', '#7c3aed', '#06b6d4'], 0.5, 0],
};
export const PATTERNS = ['stripes', 'checker', 'dots', 'grid', 'hexagons', 'waves', 'diamonds', 'noise'];

const RECIPES = {
  wood(x, y, o, N, P) {
    const k = Math.round(4 + P.scale * 2 * (0.5 + P.density));
    const warp = N.n(x, y, 2, 1, 3, 1) * (0.8 + P.organic * 1.5);
    const ring = Math.pow(0.5 + 0.5 * Math.sin(TAU * (x * k + warp)), 3);
    const grain = N.n(x, y, 48 * P.scale / 4, 1, 2, 7);
    o.v = 0.15 + 0.6 * ring + (grain - 0.5) * 0.5; o.h = 0.45 + ring * 0.25 + (grain - 0.5) * 0.5;
  },
  metal(x, y, o, N, P) {
    const st = N.n(x, y, 1, 160 * P.scale / 4, 2, 2), lo = N.n(x, y, 3, 3, 3, 4);
    o.v = 0.5 + (st - 0.5) * 0.6 + (lo - 0.5) * 0.3; o.h = 0.5 + (st - 0.5) * 0.25; o.r = (st - 0.5) * 0.25; o.m = 1;
  },
  concrete(x, y, o, N, P) {
    const b = N.n(x, y, P.scale, P.scale, P.detail, 1), sp = N.n(x, y, P.scale * 24, P.scale * 24, 1, 2);
    const W = N.w(x, y, P.scale * 6 * (0.5 + P.density), 3); const pit = W.f1 < 0.1 + 0.15 * P.imperfections ? 1 - W.f1 / (0.25) : 0;
    o.v = 0.25 + b * 0.5 + (sp - 0.5) * 0.25 - pit * 0.25; o.h = 0.55 + (b - 0.5) * 0.4 + (sp - 0.5) * 0.15 - pit * 0.35;
  },
  stone(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 1.2 * (0.5 + P.density), 1, 0.85); const e = W.f2 - W.f1, m = smooth(0.02, 0.12, e), id = W.id;
    const d = N.n(x, y, P.scale * 4, P.scale * 4, P.detail, 2);
    o.v = (0.15 + id * 0.45 + (d - 0.5) * 0.4) * (0.35 + 0.65 * m); o.h = m * (0.55 + 0.25 * smooth(0, 0.5, e) + (d - 0.5) * 0.3);
  },
  marble(x, y, o, N, P) {
    const t = N.n(x, y, Math.max(1, P.scale / 2), Math.max(1, P.scale / 2), P.detail, 3);
    const s = Math.abs(Math.sin(TAU * (x + y * 1 + t * (1.5 + P.organic * 2))));
    const vein = Math.pow(1 - s, 10 / (0.4 + P.density)), cloud = N.n(x, y, P.scale, P.scale, 4, 5);
    o.v = clamp01(0.08 + (cloud - 0.5) * 0.3 + vein * 0.95); o.h = 0.5 - vein * 0.08;
  },
  granite(x, y, o, N, P) {
    const f = P.scale * 12 * (0.5 + P.density); const a = N.n(x, y, f, f, 2, 1), b = N.n(x, y, f * 1.5, f * 1.5, 2, 2), c = N.n(x, y, f * 3, f * 3, 1, 3);
    o.v = a > 0.63 ? 0.95 : b > 0.62 ? 0.04 : 0.42 + (c - 0.5) * 0.35; o.h = 0.5 + (c - 0.5) * 0.1;
  },
  brick(x, y, o, N, P) {
    const rows = Math.max(2, Math.round(P.scale * 2 * (0.5 + P.density) / 2) * 2), cols = Math.max(1, rows >> 1);
    const ry = y * rows, row = Math.floor(ry), fy = ry - row, bx = x * cols + (row & 1) * 0.5, col = Math.floor(bx), fx = bx - col;
    const e = Math.min(Math.min(fx, 1 - fx) / cols, Math.min(fy, 1 - fy) / rows);
    const mw = 0.002 + 0.004 * (1 - P.density * 0.5), m = smooth(mw * 0.5, mw * 1.6, e), id = N.h(mod(col, cols), row, 11);
    const d = N.n(x, y, P.scale * 8, P.scale * 8, 3, 4);
    o.v = m > 0.5 ? clamp01(0.05 + id * 0.35 + (d - 0.5) * 0.5) : 0.92 + (d - 0.5) * 0.2; if (m > 0 && m < 0.5) o.v = lerp(0.92, 0.3, m * 2);
    o.h = m * (0.75 + (d - 0.5) * 0.3) + (1 - m) * 0.2; o.r = m > 0.5 ? 0 : 0.1;
  },
  ceramic(x, y, o, N, P) {
    const n = Math.max(1, Math.round(P.scale * (0.5 + P.density))), u = x * n, v = y * n, fx = fract(u), fy = fract(v);
    const e = Math.min(fx, 1 - fx, fy, 1 - fy) / n, m = smooth(0.002, 0.008, e), id = N.h(Math.floor(u), Math.floor(v), 5);
    const d = N.n(x, y, P.scale * 6, P.scale * 6, 3, 2);
    o.v = m * (0.45 + (id - 0.5) * 0.15 * P.variation + (d - 0.5) * 0.08) + (1 - m) * 0.98; o.h = 0.25 + m * 0.6 + smooth(0, 0.03, e) * 0.1; o.r = m > 0.5 ? -0.05 : 0.55;
  },
  glass(x, y, o, N, P) { const d = N.n(x, y, P.scale, P.scale, 4, 1); o.v = 0.45 + (d - 0.5) * 0.25; o.h = 0.5 + (d - 0.5) * 0.15; o.a = 0.25 + d * 0.25; },
  plastic(x, y, o, N, P) { const d = N.n(x, y, P.scale * 8, P.scale * 8, 2, 1); o.v = 0.5 + (d - 0.5) * 0.12; o.h = 0.5 + (d - 0.5) * 0.08; },
  rubber(x, y, o, N, P) { const d = N.n(x, y, P.scale * 16, P.scale * 16, 2, 1), f = N.n(x, y, P.scale * 2, P.scale * 2, 3, 2); o.v = 0.45 + (d - 0.5) * 0.3 + (f - 0.5) * 0.2; o.h = 0.5 + (d - 0.5) * 0.2; },
  leather(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 6 * (0.5 + P.density), 1, 1); const cr = smooth(0, 0.18, W.f2 - W.f1); const pore = N.n(x, y, P.scale * 40, P.scale * 40, 1, 2);
    o.v = 0.2 + cr * 0.45 + (pore - 0.5) * 0.25 + (W.id - 0.5) * 0.1; o.h = cr * 0.7 + pore * 0.3;
  },
  fabric(x, y, o, N, P, twill) {
    const n = Math.max(4, Math.round(P.scale * 12 * (0.5 + P.density))); const u = x * n, v = y * n, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    const over = twill ? mod(ix + iy, 4) < 2 : (ix + iy) & 1; const th = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
    const fuzz = N.n(x, y, n * 4, n * 4, 1, 3), slub = N.n(x, y, over ? 2 : n, over ? n : 2, 2, 4);
    o.v = 0.15 + th * 0.55 + (fuzz - 0.5) * 0.2 + (slub - 0.5) * 0.25; o.h = 0.2 + th * 0.7 + (fuzz - 0.5) * 0.1;
  },
  cloth(x, y, o, N, P) { RECIPES.fabric(x, y, o, N, P, true); },
  paper(x, y, o, N, P) { const a = N.n(x, y, P.scale * 6, P.scale * 30, 3, 1), b = N.n(x, y, P.scale * 30, P.scale * 6, 3, 2), c = N.n(x, y, P.scale * 2, P.scale * 2, 3, 3); o.v = 0.55 + (a + b - 1) * 0.35 + (c - 0.5) * 0.3; o.h = 0.5 + (a + b - 1) * 0.3; },
  sand(x, y, o, N, P) {
    const g = N.n(x, y, P.scale * 64, P.scale * 64, 1, 1); const k = Math.max(1, Math.round(P.scale * 2 * (0.5 + P.density)));
    const rip = 0.5 + 0.5 * Math.sin(TAU * (y * k + N.n(x, y, 2, 2, 3, 2) * (0.8 + P.organic))); o.v = 0.25 + g * 0.45 + rip * 0.3; o.h = rip * 0.6 + g * 0.3;
  },
  soil(x, y, o, N, P) {
    const b = N.n(x, y, P.scale * 2, P.scale * 2, P.detail, 1); const W = N.w(x, y, P.scale * 10 * (0.5 + P.density), 2); const peb = W.f1 < 0.3 ? 1 - W.f1 / 0.3 : 0;
    o.v = 0.15 + b * 0.55 + peb * W.id * 0.35; o.h = 0.35 + b * 0.35 + Math.sqrt(peb) * 0.35;
  },
  grass(x, y, o, N, P) {
    const f = P.scale * 40 * (0.5 + P.density); const a = N.ridge(x, y, f, 3, 2, 1), b = N.ridge(x, y, f * 1.3, 4, 2, 2), c = N.n(x, y, P.scale, P.scale, 3, 3);
    const bl = Math.max(Math.pow(a, 3), Math.pow(b, 3) * 0.85); o.v = clamp01(0.08 + bl * 0.75 + (c - 0.5) * 0.4); o.h = bl;
  },
  leaves(x, y, o, N, P) {
    let best = 0, v = 0.05, h = 0.05;
    for (let L = 0; L < 3; L++) {
      const W = N.w(fract(x + L * 0.37), fract(y + L * 0.61), P.scale * 2 * (0.5 + P.density), L + 1, 0.8); const ang = W.id * TAU, c = Math.cos(ang), s = Math.sin(ang);
      const lx = (W.dx * c - W.dy * s) / 0.48, ly = (W.dx * s + W.dy * c) / 0.22, e = lx * lx + ly * ly;
      if (e < 1) { const vein = Math.abs(ly) < 0.06 ? 0.15 : 0; const hh = 0.3 + L * 0.25 + (1 - e) * 0.2; if (hh > best) { best = hh; v = clamp01(0.2 + W.id * 0.7 - vein + (1 - e) * 0.1); h = hh - vein * 0.3; } }
    }
    o.v = v; o.h = h;
  },
  water(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 2, 1, 1); const c = Math.pow(clamp01(1 - (W.f2 - W.f1) * 2.2), 6); const d = N.n(x, y, P.scale, P.scale, 4, 2);
    o.v = 0.25 + d * 0.35 + c * 0.45; o.h = d * 0.7 + c * 0.2; o.a = 0.85;
  },
  ice(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 2 * (0.5 + P.density), 1, 1); const cr = 1 - smooth(0, 0.035, W.f2 - W.f1); const cl = N.n(x, y, P.scale, P.scale, 5, 2);
    o.v = 0.3 + cl * 0.55 + cr * 0.25; o.h = 0.6 + (cl - 0.5) * 0.3 - cr * 0.4;
  },
  snow(x, y, o, N, P) { const d = N.n(x, y, P.scale, P.scale, P.detail, 1), sp = N.n(x, y, P.scale * 64, P.scale * 64, 1, 2); o.v = 0.55 + d * 0.35 + (sp > 0.82 ? 0.15 : 0); o.h = 0.3 + d * 0.6; },
  rust(x, y, o, N, P) {
    const f = N.n(x, y, P.scale, P.scale, P.detail, 1), g = N.n(x, y, P.scale * 16, P.scale * 16, 2, 2);
    const mask = smooth(0.42, 0.56, f + (P.weathering + P.age) * 0.2 - 0.1);
    o.v = mask ? lerp(0.98, 0.1 + g * 0.6, mask) : 0.98; o.h = 0.5 + mask * (g - 0.3) * 0.5; o.m = 1 - mask; o.r = mask * 0.3 - (1 - mask) * 0.4;
  },
  dirt(x, y, o, N, P) { const b = N.n(x, y, P.scale * 2, P.scale * 2, P.detail, 1), c = N.n(x, y, P.scale * 12, P.scale * 12, 2, 2); o.v = 0.15 + b * 0.5 + (c - 0.5) * 0.4; o.h = 0.3 + b * 0.5 + (c - 0.5) * 0.3; },
  asphalt(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 20 * (0.5 + P.density), 1, 1); const ag = W.f1 < 0.35 ? 1 : 0; const d = N.n(x, y, P.scale * 2, P.scale * 2, 3, 2);
    o.v = ag ? 0.25 + W.id * 0.7 : 0.12 + (d - 0.5) * 0.2; o.h = ag ? 0.6 + (0.35 - W.f1) : 0.3 + d * 0.1;
  },
  carbon(x, y, o, N, P) {
    const n = Math.max(4, Math.round(P.scale * 8 * (0.5 + P.density))); const u = x * n, v = y * n, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    const dir = mod(ix + iy, 4) < 2; const th = dir ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx); const sheen = dir ? fx : fy;
    o.v = 0.1 + th * 0.4 + sheen * 0.35; o.h = 0.4 + th * 0.4;
  },
  painted(x, y, o, N, P) {
    const f = N.n(x, y, P.scale * 2, P.scale * 2, P.detail, 1), t = 1 - 0.3 * (P.weathering + P.imperfections + P.age) - 0.05;
    const chip = smooth(t, t + 0.03, f); const d = N.n(x, y, P.scale * 20, P.scale * 20, 1, 2);
    o.v = chip > 0.5 ? 0.95 + (d - 0.5) * 0.1 : 0.4 + (d - 0.5) * 0.12 + (N.n(x, y, P.scale, P.scale, 3, 3) - 0.5) * 0.2; o.h = 0.65 - chip * 0.3 + (d - 0.5) * 0.05; o.m = chip * 0.9; o.r = chip ? -0.1 : 0;
  },
  diamond(x, y, o, N, P) {
    const n = Math.max(2, Math.round(P.scale * 3 * (0.5 + P.density))); const u = x * n, v = y * n, ix = Math.floor(u), iy = Math.floor(v);
    const px = u - ix - 0.5, py = v - iy - 0.5, s = (ix + iy) & 1 ? 1 : -1; const a = (px + s * py) * 0.7071, b = (px * -s + py) * 0.7071;
    const d = Math.abs(a) / 0.38 + Math.abs(b) / 0.09; const raised = 1 - smooth(0.85, 1, d); const br = N.n(x, y, 1, 120, 2, 1);
    o.v = 0.45 + raised * 0.2 + (br - 0.5) * 0.3; o.h = 0.2 + raised * 0.7; o.m = 1; o.r = raised * -0.1;
  },
  fantasy(x, y, o, N, P) {
    const W = N.w(x, y, P.scale * 2 * (0.5 + P.density), 1, 1); const vein = 1 - smooth(0, 0.06, W.f2 - W.f1); const d = N.n(x, y, P.scale * 2, P.scale * 2, P.detail, 2);
    o.v = vein > 0.3 ? 1 : 0.15 + d * 0.45 + W.id * 0.2; o.h = 0.5 + W.f1 * 0.4 - vein * 0.3; o.e = vein;
  },
  scifi(x, y, o, N, P) {
    const n = Math.max(1, Math.round(P.scale * (0.5 + P.density))); let u = x * n, v = y * n, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy, sz = 1 / n;
    const r = N.h(mod(ix, n), mod(iy, n), 9);
    if (r > 0.45) { const qx = fx < 0.5 ? 0 : 1, qy = fy < 0.5 ? 0 : 1; fx = (fx - qx * 0.5) * 2; fy = (fy - qy * 0.5) * 2; sz /= 2; ix = ix * 2 + qx; iy = iy * 2 + qy; }
    const e = Math.min(fx, 1 - fx, fy, 1 - fy) * sz; const groove = 1 - smooth(0.002, 0.006, e); const id = N.h(ix, iy, 3);
    const bolt = Math.min(Math.hypot(fx - 0.1, fy - 0.1), Math.hypot(fx - 0.9, fy - 0.1), Math.hypot(fx - 0.1, fy - 0.9), Math.hypot(fx - 0.9, fy - 0.9)) * sz < 0.006 ? 1 : 0;
    const light = id > 0.8 && Math.abs(fy - 0.5) * sz < 0.004 && fx > 0.2 && fx < 0.8 ? 1 : 0; const d = N.n(x, y, P.scale * 16, P.scale * 16, 2, 2);
    o.v = groove ? 0.05 : 0.35 + id * 0.35 + (d - 0.5) * 0.1 + bolt * 0.3; o.h = groove ? 0.1 : 0.6 + id * 0.1 + bolt * 0.25 - light * 0.2; o.e = light; o.m = groove ? 0.2 : 0.8;
  },
  abstract(x, y, o, N, P) {
    const q1 = N.n(x, y, P.scale, P.scale, P.detail, 1), q2 = N.n(x, y, P.scale, P.scale, P.detail, 2);
    const k = 1 + P.organic * 2; o.v = N.n(fract(x + q1 * 0.5 * k), fract(y + q2 * 0.5 * k), P.scale * 1.5, P.scale * 1.5, P.detail, 3); o.h = o.v;
  },
  pattern(x, y, o, N, P) {
    const n = Math.max(1, Math.round(P.scale * 2 * (0.5 + P.density))); const u = x * n, v = y * n, fx = fract(u), fy = fract(v); let val = 0;
    switch (P.pattern) {
      case 'stripes': val = smooth(0.45, 0.55, 0.5 + 0.5 * Math.sin(TAU * (u + v * 0))); break;
      case 'checker': val = (Math.floor(u) + Math.floor(v)) & 1; break;
      case 'dots': val = 1 - smooth(0.28, 0.32, Math.hypot(fx - 0.5, fy - 0.5)); break;
      case 'grid': val = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.05 ? 1 : 0; break;
      case 'hexagons': { const W = N.w(x, y, n, 1, 0); val = smooth(0.02, 0.06, W.f2 - W.f1); break; }
      case 'waves': val = 0.5 + 0.5 * Math.sin(TAU * (v + 0.15 * Math.sin(TAU * u))); break;
      case 'diamonds': val = (Math.abs(fx - 0.5) + Math.abs(fy - 0.5)) < 0.35 ? 1 : 0; break;
      default: val = N.n(x, y, P.scale, P.scale, P.detail, 1);
    }
    o.v = val; o.h = val;
  },
};

const hex = s => { const n = parseInt(s.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export function defaultParams(category = 'Wood') {
  const d = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS.Wood;
  return {
    category, recipe: d[0], colors: d[1].slice(), roughness: d[2], metallic: d[3], seed: 1, width: 1024, height: 1024,
    scale: 4, density: 0.5, detail: 5, reflectivity: 0.5, imperfections: 0.2, weathering: 0.1, age: 0, organic: 0.5,
    realism: 0.8, lighting: 0, variation: 0.5, seamless: true, pattern: 'stripes', emissionColor: '#7cf3ff', emissionStrength: 1,
  };
}

// Returns rgba (Uint8ClampedArray) plus height, roughness, metallic, emission (Float32Array 0..1).
export function generate(P, progress) {
  const W = P.width | 0, H = P.height | 0, N = makeNoise(P.seed | 0, H / W, P.seamless !== false);
  const recipe = RECIPES[P.recipe] || RECIPES.wood; const pal = P.colors.map(hex); const dirtC = [0.23, 0.18, 0.14];
  const n = W * H, rgba = new Uint8ClampedArray(n * 4), height = new Float32Array(n), rough = new Float32Array(n), metal = new Float32Array(n), emis = new Float32Array(n);
  const o = {}; const levels = P.realism < 0.5 ? Math.round(3 + P.realism * 10) : 0;
  for (let y = 0; y < H; y++) {
    const fy = y / H;
    for (let x = 0; x < W; x++) {
      const fx = x / W; o.v = 0.5; o.h = 0.5; o.r = 0; o.m = P.metallic; o.e = 0; o.a = 1;
      recipe(fx, fy, o, N, P);
      let v = clamp01(o.v); if (levels) v = Math.round(v * levels) / levels;
      // colour ramp through the three palette colours
      let c = v < 0.5 ? pal[0].map((a, i) => lerp(a, pal[1][i], v * 2)) : pal[1].map((a, i) => lerp(a, pal[2][i], (v - 0.5) * 2));
      let hgt = clamp01(o.h), rr = clamp01(P.roughness + o.r + (1 - P.reflectivity - 0.5) * 0.3), mm = clamp01(o.m);
      if (P.variation > 0) { const va = (N.n(fx, fy, 2, 2, 2, 91) - 0.5) * P.variation * 0.35; c = c.map(k => clamp01(k * (1 + va))); }
      if (P.realism > 0.5) { const mic = (N.n(fx, fy, 128, 128, 1, 77) - 0.5) * (P.realism - 0.5) * 0.12; c = c.map(k => clamp01(k + mic)); hgt = clamp01(hgt + mic * 0.5); }
      if (P.imperfections > 0) {
        const sc = N.ridge(fx, fy, 24, 3, 1, 61); const scratch = smooth(0.985 - P.imperfections * 0.02, 1, sc) * P.imperfections;
        const spot = smooth(0.7, 0.8, N.n(fx, fy, 12, 12, 2, 62)) * P.imperfections * 0.5;
        c = c.map(k => clamp01(k + scratch * 0.25 - spot * 0.15)); hgt = clamp01(hgt - scratch * 0.15); rr = clamp01(rr - scratch * 0.2 + spot * 0.2);
      }
      const wea = clamp01(P.weathering + P.age * 0.5);
      if (wea > 0) { const m = smooth(0.35, 0.8, N.n(fx, fy, 3, 3, 4, 41) * 0.6 + (1 - hgt) * 0.6) * wea; c = c.map((k, i) => lerp(k, dirtC[i] * (0.6 + k * 0.6), m * 0.75)); rr = clamp01(rr + m * 0.3); mm *= 1 - m * 0.7; }
      if (P.age > 0) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((k, i) => lerp(k, g * [1.06, 1.0, 0.86][i], P.age * 0.45)); }
      const i4 = (y * W + x) * 4, i1 = y * W + x;
      rgba[i4] = c[0] * 255; rgba[i4 + 1] = c[1] * 255; rgba[i4 + 2] = c[2] * 255; rgba[i4 + 3] = clamp01(o.a) * 255;
      height[i1] = hgt; rough[i1] = rr; metal[i1] = mm; emis[i1] = clamp01(o.e) * P.emissionStrength;
    }
    if (progress && (y & 31) === 0) progress(y / H);
  }
  if (P.lighting > 0) bakeLight(rgba, height, W, H, P.lighting);
  if (emis.some(v => v > 0)) { const ec = hex(P.emissionColor); for (let i = 0; i < n; i++) if (emis[i] > 0) for (let k = 0; k < 3; k++) rgba[i * 4 + k] = Math.min(255, rgba[i * 4 + k] + ec[k] * 255 * emis[i]); }
  return { rgba, height, rough, metal, emis, width: W, height_px: H };
}
function bakeLight(rgba, h, W, H, k) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const dx = h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W], dy = h[((y + 1) % H) * W + x] - h[((y - 1 + H) % H) * W + x];
    const l = clamp01(1 + (-dx * 0.7 - dy * 0.7) * 6) * 0.6 + 0.4 * (0.5 + h[i] * 0.5); const f = lerp(1, l * 1.25, k);
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.min(255, rgba[i * 4 + c] * f);
  }
}

// ---- Local prompt interpretation (keyword matching, not AI) ----
const COLORS = { red: '#b03a2e', crimson: '#8b1e2d', orange: '#d9772b', yellow: '#d8b13a', gold: '#c9a227', golden: '#c9a227', green: '#3f7d3a', olive: '#6b6b2a', teal: '#1f7a7a', cyan: '#2bb3c0', blue: '#2e5fa3', navy: '#1d2c4d', purple: '#6a3d9a', violet: '#7e57c2', pink: '#d36c9a', magenta: '#b02e8f', brown: '#6b4428', tan: '#c2a27a', beige: '#d9c7a7', white: '#f2f2f0', cream: '#efe6d2', grey: '#808080', gray: '#808080', black: '#141414', silver: '#c0c4c8', copper: '#b06a3b', bronze: '#8c6239', dark: '#202020', light: '#e0e0e0' };
const CAT_WORDS = [['oak|walnut|pine|plank|timber|wood|bark|parquet', 'Wood'], ['marble', 'Marble'], ['granite|terrazzo', 'Granite'], ['brick', 'Brick'], ['tile|ceramic|porcelain', 'Ceramic'], ['concrete|cement|plaster', 'Concrete'], ['cobble|stone|rock|slate|pebble', 'Stone'], ['rust|corroded|oxidized', 'Rust'], ['diamond plate|tread plate|industrial|grate', 'Industrial materials'], ['steel|metal|iron|aluminum|aluminium|chrome|brushed', 'Metal'], ['glass|window', 'Glass'], ['plastic|polymer', 'Plastic'], ['rubber|tire|tyre', 'Rubber'], ['leather|hide', 'Leather'], ['denim|twill|cloth', 'Cloth'], ['fabric|canvas|weave|linen|wool|textile', 'Fabric'], ['paper|cardboard|parchment', 'Paper'], ['sand|dune|beach', 'Sand'], ['soil|mud|earth|ground', 'Soil'], ['grass|lawn|turf', 'Grass'], ['leaf|leaves|foliage', 'Leaves'], ['water|ocean|lake|pool', 'Water'], ['ice|frozen', 'Ice'], ['snow', 'Snow'], ['dirt|dust|grime', 'Dirt'], ['asphalt|tarmac|road', 'Asphalt'], ['carbon', 'Carbon fiber'], ['paint|painted|enamel', 'Painted surfaces'], ['magic|fantasy|crystal|rune|elven|arcane|lava', 'Fantasy materials'], ['sci-fi|scifi|futuristic|panel|spaceship|tech', 'Sci-fi materials'], ['abstract|psychedelic|swirl', 'Abstract patterns']];
export function interpretPrompt(prompt, negative = '', base) {
  const p = ' ' + prompt.toLowerCase() + ' ', ng = ' ' + negative.toLowerCase() + ' ', has = (s, re) => new RegExp('\\b(' + re + ')\\b').test(s);
  let cat = base?.category || 'Wood'; for (const [re, c] of CAT_WORDS) if (has(p, re)) { cat = c; break; }
  const P = Object.assign(defaultParams(cat), base?.category === cat ? {} : {}); const notes = ['Category: ' + cat];
  const cols = Object.keys(COLORS).filter(c => has(p, c) && !has(ng, c));
  if (cols.length) { const cs = cols.map(c => COLORS[c]); P.colors = cs.length === 1 ? [shade(cs[0], -0.35), cs[0], shade(cs[0], 0.3)] : cs.length === 2 ? [cs[0], mix(cs[0], cs[1]), cs[1]] : cs.slice(0, 3); notes.push('Colors: ' + cols.join(', ')); }
  const set = (k, v, why) => { P[k] = v; notes.push(why); };
  if (has(p, 'old|aged|ancient|worn|weathered')) set('age', 0.6, 'Aged'), set('weathering', 0.5, 'Weathered');
  if (has(p, 'new|clean|pristine|fresh')) set('age', 0, 'Clean'), set('weathering', 0, 'No weathering'), set('imperfections', 0.05, 'Few imperfections');
  if (has(p, 'dirty|grimy|muddy|filthy')) set('weathering', 0.8, 'Dirty');
  if (has(p, 'scratched|damaged|chipped|battered')) set('imperfections', 0.7, 'Damaged');
  if (has(p, 'polished|glossy|shiny|lacquered|wet')) set('roughness', 0.15, 'Glossy');
  if (has(p, 'matte|rough|dull')) set('roughness', 0.85, 'Matte');
  if (has(p, 'metallic|chrome')) set('metallic', 1, 'Metallic');
  if (has(p, 'fine|dense|small|tight')) set('density', 0.85, 'Dense');
  if (has(p, 'large|big|coarse|wide|sparse')) set('density', 0.2, 'Sparse');
  if (has(p, 'stylized|stylised|cartoon|hand-painted|toon|painterly')) set('realism', 0.25, 'Stylized');
  if (has(p, 'realistic|photoreal|photorealistic')) set('realism', 1, 'Realistic');
  if (has(p, 'organic|natural|wavy')) set('organic', 0.9, 'Organic');
  if (has(p, 'geometric|artificial|uniform|regular')) set('organic', 0.1, 'Artificial');
  if (has(p, 'glowing|glow|emissive|neon')) set('emissionStrength', 1.4, 'Glowing');
  if (has(ng, 'dirt|grime|weathering|stains')) set('weathering', 0, 'Excluded: dirt');
  if (has(ng, 'scratches|damage|imperfections|chips')) set('imperfections', 0, 'Excluded: damage');
  if (has(ng, 'age|aging|old')) set('age', 0, 'Excluded: aging');
  if (has(ng, 'glow|emission')) set('emissionStrength', 0, 'Excluded: glow');
  if (has(ng, 'repetition|tiling|pattern')) set('variation', 0.9, 'More variation to hide repetition');
  if (has(ng, 'noise|grain')) set('realism', 0.5, 'Less micro noise');
  const m = p.match(/seed\s*(\d+)/); P.seed = m ? +m[1] : (hashStr(prompt) % 9999) + 1;
  return { params: P, notes };
}
const hashStr = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
function shade(h, k) { const c = hex(h); return '#' + c.map(v => Math.round(clamp01(k < 0 ? v * (1 + k) : v + (1 - v) * k) * 255).toString(16).padStart(2, '0')).join(''); }
function mix(a, b) { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round((v + y[i]) / 2 * 255).toString(16).padStart(2, '0')).join(''); }
export function randomParams(category) {
  const cats = Object.keys(CATEGORY_DEFAULTS); const c = category || cats[Math.floor(Math.random() * cats.length)]; const P = defaultParams(c); const r = Math.random;
  Object.assign(P, { seed: 1 + Math.floor(r() * 99999), scale: 2 + Math.floor(r() * 8), density: r(), detail: 3 + Math.floor(r() * 4), imperfections: r() * 0.5, weathering: r() * 0.5, age: r() * 0.4, organic: r(), variation: r() * 0.8 });
  P.colors = P.colors.map(h => shade(h, (r() - 0.5) * 0.4)); return P;
}
