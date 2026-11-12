// Image codecs and analysis. Browser-native for PNG/JPEG/WEBP/BMP/GIF, own code for TIFF, TGA, PSD, HDR and EXR.
import { crc32, streamBytes } from './zip.js';

export function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
export const ctx = c => c.getContext('2d', { willReadFrequently: true });
export const getData = c => ctx(c).getImageData(0, 0, c.width, c.height);
export function fromData(id) { const c = newCanvas(id.width, id.height); ctx(c).putImageData(id, 0, 0); return c; }
export function cloneCanvas(c) { const n = newCanvas(c.width, c.height); ctx(n).drawImage(c, 0, 0); return n; }
export function resize(c, w, h, filter = 'high') {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (filter === 'nearest') { const n = newCanvas(w, h); const x = ctx(n); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, w, h); return n; }
  let src = c; // step down by halves for clean downscales
  while (src.width / 2 >= w * 1.0001 && src.height / 2 >= h * 1.0001 && filter === 'high') {
    const n = newCanvas(Math.round(src.width / 2), Math.round(src.height / 2)); const x = ctx(n); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, n.width, n.height); src = n;
  }
  const n = newCanvas(w, h); const x = ctx(n); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = filter === 'bilinear' ? 'low' : 'high'; x.drawImage(src, 0, 0, w, h); return n;
}
export const srgb2lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
export const lin2srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const S2L = new Float32Array(256).map((_, i) => srgb2lin(i / 255));
const latin = u => String.fromCharCode(...u);
export const isPow2 = n => n > 0 && (n & (n - 1)) === 0;

// ======================= ANALYSIS =======================
export function alphaInfo(id) {
  const d = id.data; let any = false, partial = false;
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a < 255) { any = true; if (a > 0) { partial = true; break; } } }
  return { hasAlpha: any, alphaKind: !any ? 'none' : partial ? 'gradient' : 'binary (cut-out)' };
}
export function isGray(id) { const d = id.data; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - d[i + 1]) > 2 || Math.abs(d[i] - d[i + 2]) > 2) return false; return true; }
// Compares the wrap-around seam with normal neighbour differences. ~1 means seamless.
export function seamScore(id) {
  const { width: w, height: h, data: d } = id; const lum = i => d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  let seam = 0, base = 0, n = 0;
  for (let y = 0; y < h; y += Math.max(1, h >> 8)) { const r = y * w * 4; seam += Math.abs(lum(r) - lum(r + (w - 1) * 4)); base += Math.abs(lum(r + (w >> 1) * 4) - lum(r + ((w >> 1) - 1) * 4)); n++; }
  for (let x = 0; x < w; x += Math.max(1, w >> 8)) { seam += Math.abs(lum(x * 4) - lum(((h - 1) * w + x) * 4)); base += Math.abs(lum(((h >> 1) * w + x) * 4) - lum((((h >> 1) - 1) * w + x) * 4)); n++; }
  seam /= n; base = base / n + 0.5;
  return { ratio: seam / base, seamless: seam / base < 2.2 };
}
export function meanColor(id) { const d = id.data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; }

function sniff(u8, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'PNG';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'JPEG';
  if (latin(u8.subarray(0, 4)) === 'RIFF' && latin(u8.subarray(8, 12)) === 'WEBP') return 'WEBP';
  if (latin(u8.subarray(0, 4)) === 'GIF8') return 'GIF';
  if (u8[0] === 0x42 && u8[1] === 0x4d) return 'BMP';
  if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42) || (u8[0] === 0x4d && u8[1] === 0x4d && u8[3] === 42)) return 'TIFF';
  if (latin(u8.subarray(0, 4)) === '8BPS') return 'PSD';
  if (u8[0] === 0x76 && u8[1] === 0x2f && u8[2] === 0x31 && u8[3] === 0x01) return 'EXR';
  if (latin(u8.subarray(0, 2)) === '#?') return 'HDR';
  if (ext === 'tga') return 'TGA';
  return null;
}
export const IMPORT_ACCEPT = '.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.tga,.exr,.hdr,.psd,.gif';

function nativeInfo(fmt, u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const info = { notes: [] };
  if (fmt === 'PNG') {
    let p = 8;
    while (p + 8 < u8.length) {
      const len = dv.getUint32(p), type = latin(u8.subarray(p + 4, p + 8)), d = p + 8;
      if (type === 'IHDR') { info.bits = u8[d + 8]; const ct = u8[d + 9]; info.colorType = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed color', 4: 'Grayscale + Alpha', 6: 'RGBA' }[ct]; info.channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; }
      else if (type === 'iCCP') { let e = d; while (u8[e] && e < d + 80) e++; info.colorProfile = 'Embedded ICC (' + latin(u8.subarray(d, e)) + ')'; }
      else if (type === 'sRGB') info.colorProfile ||= 'sRGB';
      else if (type === 'gAMA') info.gamma = dv.getUint32(d) / 100000;
      else if (type === 'pHYs' && u8[d + 8] === 1) info.dpi = Math.round(dv.getUint32(d) * 0.0254);
      else if (type === 'IEND') break;
      p += 12 + len;
    }
    if (!info.colorProfile && info.gamma) info.colorProfile = Math.abs(info.gamma - 0.45455) < 0.01 ? 'sRGB-like (gamma 2.2)' : info.gamma === 1 ? 'Linear (gamma 1.0)' : 'Gamma ' + (1 / info.gamma).toFixed(2);
    if (info.bits === 16) info.notes.push('16-bit source. The working copy is 8-bit per channel; the original file is kept unchanged.');
  } else if (fmt === 'JPEG') {
    let p = 2; info.compression = 'Lossy (JPEG)';
    while (p + 4 < u8.length && u8[p] === 0xff) {
      const m = u8[p + 1], len = dv.getUint16(p + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { info.bits = u8[p + 4]; info.channels = u8[p + 9]; info.colorType = { 1: 'Grayscale', 3: 'RGB (YCbCr)', 4: 'CMYK' }[info.channels]; if (m === 0xc2) info.notes.push('Progressive JPEG'); }
      if (m === 0xe2 && latin(u8.subarray(p + 4, p + 15)) === 'ICC_PROFILE') info.colorProfile = 'Embedded ICC profile';
      if (m === 0xe0 && latin(u8.subarray(p + 4, p + 8)) === 'JFIF' && u8[p + 11] === 1) info.dpi = dv.getUint16(p + 12);
      if (m === 0xda) break; p += 2 + len;
    }
    info.colorProfile ||= 'Untagged (assumed sRGB)';
  } else if (fmt === 'WEBP') {
    const ck = latin(u8.subarray(12, 16)); info.bits = 8;
    if (ck === 'VP8X') { const f = u8[20]; if (f & 0x20) info.colorProfile = 'Embedded ICC profile'; info.compression = 'WebP extended'; }
    else info.compression = ck === 'VP8L' ? 'Lossless WebP' : 'Lossy WebP';
    info.colorProfile ||= 'Untagged (assumed sRGB)';
  } else if (fmt === 'BMP') { info.bits = dv.getUint16(28, true); info.notes.push(info.bits + ' bits per pixel'); info.bits = info.bits >= 24 ? 8 : info.bits; info.colorProfile = 'Untagged (assumed sRGB)'; }
  else if (fmt === 'GIF') { info.bits = 8; info.colorType = 'Indexed color'; info.colorProfile = 'sRGB'; }
  return info;
}

// Decode any supported file into an 8-bit RGBA canvas plus metadata.
export async function decodeFile(file, { exposure = 0 } = {}) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  const fmt = sniff(u8, file.name || '');
  if (!fmt) throw new Error('Unrecognized file type. Supported: ' + IMPORT_ACCEPT.replaceAll('.', ' ').toUpperCase());
  let canvas, info = { notes: [] };
  if (['PNG', 'JPEG', 'WEBP', 'BMP', 'GIF'].includes(fmt)) {
    info = nativeInfo(fmt, u8);
    let bmp;
    try { bmp = await createImageBitmap(new Blob([u8]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
    catch { throw new Error(`The browser could not decode this ${fmt} file. It may be damaged.`); }
    canvas = newCanvas(bmp.width, bmp.height); ctx(canvas).drawImage(bmp, 0, 0); bmp.close?.();
    if (info.colorType === 'CMYK') info.notes.push('CMYK JPEG was converted to RGB by the browser. Colors may shift.');
  } else {
    const r = fmt === 'TIFF' ? await decodeTIFF(u8) : fmt === 'TGA' ? decodeTGA(u8) : fmt === 'PSD' ? decodePSD(u8) : fmt === 'HDR' ? decodeHDR(u8) : await decodeEXR(u8);
    info = { ...info, ...r.info, notes: [...(r.info?.notes || [])] };
    if (r.float) { canvas = tonemap(r.float, r.w, r.h, exposure); info.hdr = true; info.notes.push('High dynamic range data was tone mapped to 8-bit for editing (exposure ' + exposure + '). The original file is kept.'); }
    else { const id = new ImageData(r.rgba, r.w, r.h); canvas = fromData(id); }
  }
  const id = getData(canvas); const a = alphaInfo(id);
  info = {
    format: fmt === 'JPEG' ? 'JPG' : fmt, width: canvas.width, height: canvas.height, fileSize: u8.length,
    bits: info.bits ?? null, channels: info.channels ?? (a.hasAlpha ? 4 : 3), colorType: info.colorType || (a.hasAlpha ? 'RGBA' : 'RGB'),
    colorProfile: info.colorProfile || 'Untagged', dpi: info.dpi || null, compression: info.compression || null,
    hasAlpha: a.hasAlpha, alphaKind: a.alphaKind, gray: isGray(id), seam: seamScore(id), hdr: !!info.hdr, notes: info.notes, pow2: isPow2(canvas.width) && isPow2(canvas.height),
  };
  return { canvas, info, bytes: u8 };
}
function tonemap(f, w, h, exposure) {
  const c = newCanvas(w, h); const id = ctx(c).createImageData(w, h); const d = id.data; const k = Math.pow(2, exposure);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { for (let c2 = 0; c2 < 3; c2++) { const v = Math.max(0, f[i * 4 + c2] * k); d[j + c2] = lin2srgb(Math.min(1, v)) * 255; } d[j + 3] = Math.max(0, Math.min(1, f[i * 4 + 3])) * 255; }
  ctx(c).putImageData(id, 0, 0); return c;
}

// ---------- TIFF ----------
function packbitsDecode(src, outLen) {
  const out = new Uint8Array(outLen); let i = 0, o = 0;
  while (i < src.length && o < outLen) { let n = src[i++]; if (n > 127) n -= 256; if (n >= 0) { for (let j = 0; j <= n && o < outLen; j++) out[o++] = src[i++]; } else if (n !== -128) { const b = src[i++]; for (let j = 0; j < 1 - n && o < outLen; j++) out[o++] = b; } }
  return out;
}
function lzwDecode(src, outLen) {
  const out = new Uint8Array(outLen); let op = 0;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), len = new Uint16Array(4096), first = new Uint8Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; first[i] = i; }
  let next = 258, codeLen = 9, prev = -1, bit = 0; const total = src.length * 8;
  const emit = c => { const l = len[c]; if (op + l > outLen) return false; for (let k = l - 1, x = c; k >= 0; k--) { out[op + k] = suffix[x]; x = prefix[x]; } op += l; return true; };
  while (bit + codeLen <= total) {
    let code = 0; for (let k = 0; k < codeLen; k++, bit++) code = (code << 1) | ((src[bit >> 3] >> (7 - (bit & 7))) & 1);
    if (code === 257) break;
    if (code === 256) { next = 258; codeLen = 9; prev = -1; continue; }
    if (code < next) {
      if (!emit(code)) break;
      if (prev >= 0 && next < 4096) { prefix[next] = prev; suffix[next] = first[code]; len[next] = len[prev] + 1; first[next] = first[prev]; next++; }
    } else {
      if (prev < 0 || next >= 4096) break;
      prefix[next] = prev; suffix[next] = first[prev]; len[next] = len[prev] + 1; first[next] = first[prev];
      if (!emit(next)) break; next++;
    }
    prev = code;
    if (next + 1 >= (1 << codeLen) && codeLen < 12) codeLen++;
  }
  return out;
}
async function decodeTIFF(u8) {
  const le = u8[0] === 0x49; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  const ifd = u32(4), n = u16(ifd), T = {}; const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), bytes = (sz[type] || 1) * cnt, off = bytes <= 4 ? e + 8 : u32(e + 8);
    const vals = []; if (type === 3) for (let k = 0; k < Math.min(cnt, 65536); k++) vals.push(u16(off + k * 2));
    else if (type === 4) for (let k = 0; k < Math.min(cnt, 65536); k++) vals.push(u32(off + k * 4));
    else if (type === 5) for (let k = 0; k < cnt; k++) vals.push(u32(off + k * 8) / (u32(off + k * 8 + 4) || 1));
    T[tag] = { type, cnt, vals, off };
  }
  const v = (t, d) => T[t]?.vals[0] ?? d;
  const w = v(256), h = v(257), bps = T[258]?.vals || [1], comp = v(259, 1), photo = v(262, 1), spp = v(277, 1), rps = v(278, h), planar = v(284, 1), pred = v(317, 1), sfmt = v(339, 1);
  if (T[322]) throw new Error('Tiled TIFF files are not supported yet. Save as a striped TIFF or PNG.');
  if (planar !== 1) throw new Error('Planar (separate channel) TIFF files are not supported yet.');
  const bits = bps[0]; if (![8, 16, 32].includes(bits)) throw new Error(bits + '-bit TIFF is not supported. Supported: 8, 16, 32-bit float.');
  if (![0, 1, 2].includes(photo)) throw new Error('This TIFF color mode (' + ({ 3: 'palette', 5: 'CMYK', 6: 'YCbCr', 8: 'Lab' }[photo] || photo) + ') is not supported yet.');
  const B = bits / 8, rowBytes = w * spp * B, full = new Uint8Array(rowBytes * h);
  const offs = T[273].vals, cnts = T[279].vals; let pos = 0;
  for (let s = 0; s < offs.length; s++) {
    const raw = u8.subarray(offs[s], offs[s] + cnts[s]); const rows = Math.min(rps, h - s * rps); const want = rows * rowBytes; let dec;
    if (comp === 1) dec = raw; else if (comp === 32773) dec = packbitsDecode(raw, want); else if (comp === 5) dec = lzwDecode(raw, want);
    else if (comp === 8 || comp === 32946) dec = await streamBytes(raw, new DecompressionStream('deflate'));
    else throw new Error('TIFF compression type ' + comp + ' is not supported. Supported: none, LZW, PackBits, Deflate.');
    full.set(dec.subarray(0, Math.min(want, full.length - pos)), pos); pos += want;
  }
  if (pred === 2) {
    for (let y = 0; y < h; y++) {
      const r = y * rowBytes;
      if (B === 1) for (let i = spp; i < w * spp; i++) full[r + i] = (full[r + i] + full[r + i - spp]) & 255;
      else if (B === 2) { const fd = new DataView(full.buffer); for (let i = spp; i < w * spp; i++) fd.setUint16(r + i * 2, (fd.getUint16(r + i * 2, le) + fd.getUint16(r + (i - spp) * 2, le)) & 65535, le); }
    }
  }
  const fd = new DataView(full.buffer); const rgba = new Uint8ClampedArray(w * h * 4);
  const sample = i => B === 1 ? full[i] : B === 2 ? fd.getUint16(i * 1, le) >> 8 : Math.max(0, Math.min(1, sfmt === 3 ? lin2srgb(Math.max(0, fd.getFloat32(i, le))) : fd.getUint32(i, le) / 4294967295)) * 255;
  const assoc = T[338]?.vals[0] === 1;
  for (let p = 0; p < w * h; p++) {
    const b = p * spp * B; let r, g, bl, a = 255;
    if (spp >= 3) { r = sample(b); g = sample(b + B); bl = sample(b + 2 * B); if (spp >= 4) a = sample(b + 3 * B); }
    else { r = g = bl = sample(b); if (photo === 0) r = g = bl = 255 - r; if (spp === 2) a = sample(b + B); }
    if (assoc && a > 0 && a < 255) { r = r * 255 / a; g = g * 255 / a; bl = bl * 255 / a; }
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = bl; rgba[p * 4 + 3] = a;
  }
  const res = v(282), unit = v(296, 2);
  return { w, h, rgba, info: { bits: sfmt === 3 ? '32 (float)' : bits, channels: spp, colorType: spp >= 3 ? (spp >= 4 ? 'RGBA' : 'RGB') : spp === 2 ? 'Grayscale + Alpha' : 'Grayscale', colorProfile: T[34675] ? 'Embedded ICC profile' : 'Untagged', dpi: res ? Math.round(unit === 3 ? res * 2.54 : res) : null, compression: { 1: 'None', 5: 'LZW', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits' }[comp], notes: bits > 8 ? ['High bit depth source. The working copy is 8-bit per channel; the original file is kept unchanged.'] : [] } };
}
// ---------- TGA ----------
function decodeTGA(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const idLen = u8[0], cmapType = u8[1], type = u8[2], cmapLen = dv.getUint16(5, true), cmapBits = u8[7];
  const w = dv.getUint16(12, true), h = dv.getUint16(14, true), bpp = u8[16], desc = u8[17];
  if (![2, 3, 10, 11].includes(type)) throw new Error('This TGA type (' + type + ') is not supported. Supported: true-color and grayscale, raw or RLE.');
  if (![8, 24, 32].includes(bpp)) throw new Error(bpp + '-bit TGA is not supported. Supported: 8, 24, 32-bit.');
  let p = 18 + idLen + (cmapType ? cmapLen * Math.ceil(cmapBits / 8) : 0);
  const Bp = bpp / 8, n = w * h, px = new Uint8Array(n * Bp);
  if (type < 9) px.set(u8.subarray(p, p + n * Bp));
  else { let o = 0; while (o < n * Bp && p < u8.length) { const c = u8[p++], k = (c & 127) + 1; if (c & 128) { const v = u8.subarray(p, p + Bp); p += Bp; for (let i = 0; i < k; i++) { px.set(v, o); o += Bp; } } else { px.set(u8.subarray(p, p + k * Bp), o); p += k * Bp; o += k * Bp; } } }
  const top = desc & 0x20, rgba = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * Bp, dy = top ? y : h - 1 - y, d = (dy * w + x) * 4;
    if (Bp === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
    else { rgba[d] = px[s + 2]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s]; rgba[d + 3] = Bp === 4 && (desc & 15) ? px[s + 3] : 255; }
  }
  return { w, h, rgba, info: { bits: 8, channels: Bp === 1 ? 1 : Bp, colorType: Bp === 1 ? 'Grayscale' : Bp === 4 ? 'RGBA' : 'RGB', compression: type > 8 ? 'RLE' : 'None', colorProfile: 'Untagged (assumed sRGB)' } };
}
// ---------- PSD (flattened composite only) ----------
function decodePSD(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(4) !== 1) throw new Error('Large document (PSB) files are not supported.');
  const ch = dv.getUint16(12), h = dv.getUint32(14), w = dv.getUint32(18), depth = dv.getUint16(22), mode = dv.getUint16(24);
  if (![1, 3].includes(mode)) throw new Error('Only RGB and Grayscale PSD files are supported. This one uses ' + ({ 0: 'Bitmap', 2: 'Indexed', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' }[mode] || 'another') + ' mode.');
  if (![8, 16].includes(depth)) throw new Error(depth + '-bit PSD files are not supported. Supported: 8 and 16-bit.');
  let p = 26; p += 4 + dv.getUint32(p);
  const resLen = dv.getUint32(p); let icc = false; { let q = p + 4; const end = q + resLen; while (q < end - 12) { if (latin(u8.subarray(q, q + 4)) !== '8BIM') break; const id = dv.getUint16(q + 4); let nl = u8[q + 6]; let o = q + 7 + nl; if ((nl + 1) % 2) o++; const sz = dv.getUint32(o); if (id === 1039) icc = true; q = o + 4 + sz + (sz % 2); } }
  p += 4 + resLen; p += 4 + dv.getUint32(p);
  const comp = dv.getUint16(p); p += 2;
  const bpc = depth / 8, rowB = w * bpc, planes = [];
  const useCh = Math.min(ch, mode === 3 ? 4 : 2);
  if (comp === 0) { for (let c = 0; c < useCh; c++) planes.push(u8.subarray(p + c * h * rowB, p + (c + 1) * h * rowB)); }
  else if (comp === 1) {
    const counts = []; for (let i = 0; i < ch * h; i++) counts.push(dv.getUint16(p + i * 2)); let q = p + ch * h * 2;
    for (let c = 0; c < ch; c++) { const pl = new Uint8Array(h * rowB); for (let y = 0; y < h; y++) { const cnt = counts[c * h + y]; if (c < useCh) pl.set(packbitsDecode(u8.subarray(q, q + cnt), rowB), y * rowB); q += cnt; } if (c < useCh) planes.push(pl); }
  } else throw new Error('This PSD uses ZIP compression for its composite, which is not supported yet.');
  const rgba = new Uint8ClampedArray(w * h * 4); const g = (pl, i) => pl[i * bpc];
  for (let i = 0; i < w * h; i++) {
    if (mode === 3) { rgba[i * 4] = g(planes[0], i); rgba[i * 4 + 1] = g(planes[1], i); rgba[i * 4 + 2] = g(planes[2], i); rgba[i * 4 + 3] = planes[3] ? g(planes[3], i) : 255; }
    else { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g(planes[0], i); rgba[i * 4 + 3] = planes[1] ? g(planes[1], i) : 255; }
  }
  return { w, h, rgba, info: { bits: depth, channels: useCh, colorType: mode === 3 ? 'RGB' : 'Grayscale', colorProfile: icc ? 'Embedded ICC profile' : 'Untagged', compression: comp ? 'RLE' : 'None', notes: ['PSD: the flattened composite image was imported. Layers are not read.'] } };
}
// ---------- Radiance HDR ----------
function decodeHDR(u8) {
  let p = 0; const line = () => { let s = ''; while (p < u8.length && u8[p] !== 10) s += String.fromCharCode(u8[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('Not a Radiance HDR file.');
  let fmt = ''; for (let l = line(); l !== ''; l = line()) { if (l.startsWith('FORMAT=')) fmt = l.slice(7).trim(); if (p >= u8.length) throw new Error('HDR header is damaged.'); }
  if (fmt && fmt !== '32-bit_rle_rgbe') throw new Error('HDR format ' + fmt + ' is not supported. Supported: RGBE.');
  const res = line().trim().split(/\s+/); if (res[0] !== '-Y' || res[2] !== '+X') throw new Error('This HDR pixel orientation is not supported.');
  const h = +res[1], w = +res[3]; const f = new Float32Array(w * h * 4); const scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (w >= 8 && w < 32768 && u8[p] === 2 && u8[p + 1] === 2 && !(u8[p + 2] & 128)) {
      p += 4; for (let c = 0; c < 4; c++) { let x = 0; while (x < w) { let n = u8[p++]; if (n > 128) { n -= 128; const v = u8[p++]; while (n--) scan[(x++) * 4 + c] = v; } else { if (!n) throw new Error('HDR data is damaged.'); while (n--) scan[(x++) * 4 + c] = u8[p++]; } } }
    } else { scan.set(u8.subarray(p, p + w * 4)); p += w * 4; }
    for (let x = 0; x < w; x++) { const e = scan[x * 4 + 3], k = e ? Math.pow(2, e - 136) : 0, o = (y * w + x) * 4; f[o] = scan[x * 4] * k; f[o + 1] = scan[x * 4 + 1] * k; f[o + 2] = scan[x * 4 + 2] * k; f[o + 3] = 1; }
  }
  return { w, h, float: f, info: { bits: '32 (RGBE float)', channels: 3, colorType: 'RGB (linear HDR)', colorProfile: 'Linear', compression: 'RLE' } };
}
// ---------- OpenEXR (scanline; none, ZIPS, ZIP) ----------
export function half2f(h) { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; if (!e) return s * 6.103515625e-5 * (f / 1024); if (e === 31) return f ? 0 : s * 65504; return s * Math.pow(2, e - 15) * (1 + f / 1024); }
async function decodeEXR(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const ver = dv.getUint32(4, true);
  if (ver & 0x200) throw new Error('Tiled EXR files are not supported yet.'); if (ver & 0x1800) throw new Error('Multi-part and deep EXR files are not supported.');
  let p = 8; const A = {}; const str = () => { let s = ''; while (u8[p]) s += String.fromCharCode(u8[p++]); p++; return s; };
  while (u8[p] !== 0) {
    const name = str(); str(); const size = dv.getInt32(p, true); p += 4; const s = p;
    if (name === 'channels') { const ch = []; let q = s; while (u8[q] !== 0) { let nm = ''; while (u8[q]) nm += String.fromCharCode(u8[q++]); q++; ch.push({ name: nm, type: dv.getInt32(q, true), xs: dv.getInt32(q + 8, true), ys: dv.getInt32(q + 12, true) }); q += 16; } A.ch = ch; }
    else if (name === 'compression') A.comp = u8[s];
    else if (name === 'dataWindow') A.dw = [0, 4, 8, 12].map(o => dv.getInt32(s + o, true));
    p = s + size;
  }
  p++;
  const [x0, y0, x1, y1] = A.dw, w = x1 - x0 + 1, h = y1 - y0 + 1; const NAMES = ['none', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'];
  const lpb = { 0: 1, 2: 1, 3: 16 }[A.comp]; if (!lpb) throw new Error('EXR compression "' + NAMES[A.comp] + '" is not supported yet. Supported: none, ZIPS, ZIP.');
  if (A.ch.some(c => c.xs !== 1 || c.ys !== 1)) throw new Error('Subsampled EXR channels are not supported.');
  const chunks = Math.ceil(h / lpb), offs = []; for (let i = 0; i < chunks; i++) { offs.push(Number(dv.getBigUint64(p, true))); p += 8; }
  const bp = c => c.type === 1 ? 2 : 4, lineB = A.ch.reduce((a, c) => a + bp(c) * w, 0);
  const idx = c => ({ R: 0, G: 1, B: 2, A: 3, Y: 4 }[c.name.split('.').pop()] ?? -1);
  const f = new Float32Array(w * h * 4); for (let i = 3; i < f.length; i += 4) f[i] = 1;
  for (let i = 0; i < chunks; i++) {
    const q = offs[i], y = dv.getInt32(q, true), size = dv.getInt32(q + 4, true), lines = Math.min(lpb, y1 - y + 1); let data = u8.subarray(q + 8, q + 8 + size);
    if (size < lineB * lines) {
      const raw = await streamBytes(data, new DecompressionStream('deflate'));
      for (let k = 1; k < raw.length; k++) raw[k] = (raw[k - 1] + raw[k] - 128) & 255;
      const out = new Uint8Array(raw.length), hl = (raw.length + 1) >> 1; for (let k = 0; k < raw.length; k++) out[k] = k & 1 ? raw[hl + (k >> 1)] : raw[k >> 1];
      data = out;
    }
    const dd = new DataView(data.buffer, data.byteOffset, data.byteLength); let o = 0;
    for (let l = 0; l < lines; l++) {
      const yy = y - y0 + l;
      for (const c of A.ch) { const k = idx(c); for (let x = 0; x < w; x++) { let v; if (c.type === 1) { v = half2f(dd.getUint16(o, true)); o += 2; } else if (c.type === 2) { v = dd.getFloat32(o, true); o += 4; } else { v = dd.getUint32(o, true) / 4294967295; o += 4; } if (k < 0) continue; const b = (yy * w + x) * 4; if (k === 4) f[b] = f[b + 1] = f[b + 2] = v; else f[b + k] = v; } }
    }
  }
  const types = [...new Set(A.ch.map(c => ['32 uint', '16 (half float)', '32 (float)'][c.type]))].join(', ');
  return { w, h, float: f, info: { bits: types, channels: A.ch.length, colorType: A.ch.map(c => c.name).join(''), colorProfile: 'Linear (scene referred)', compression: NAMES[A.comp] } };
}

// ======================= ENCODERS =======================
const lum8 = (d, i) => Math.round(d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722);
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
}
// mode: rgba | rgb | gray | graya ; bits: 8 | 16 ; space: srgb | linear
export async function encodePNG(id, { mode = 'rgba', bits = 8, dpi, space = 'srgb' } = {}) {
  const { width: w, height: h, data: d } = id; const ch = { gray: 1, graya: 2, rgb: 3, rgba: 4 }[mode], ct = { gray: 0, graya: 4, rgb: 2, rgba: 6 }[mode];
  const B = bits === 16 ? 2 : 1, bpp = ch * B, stride = w * bpp; const raw = new Uint8Array((stride + 1) * h); let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    let o = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const vals = mode === 'gray' ? [lum8(d, i)] : mode === 'graya' ? [lum8(d, i), d[i + 3]] : mode === 'rgb' ? [d[i], d[i + 1], d[i + 2]] : [d[i], d[i + 1], d[i + 2], d[i + 3]];
      for (const v of vals) { if (B === 2) { const v16 = v * 257; cur[o++] = v16 >> 8; cur[o++] = v16 & 255; } else cur[o++] = v; }
    }
    const r = y * (stride + 1); raw[r] = 4;
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); raw[r + 1 + i] = (cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    [prev, cur] = [cur, prev];
  }
  const ihdr = new Uint8Array(13); const iv = new DataView(ihdr.buffer); iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = bits; ihdr[9] = ct;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (space === 'srgb') { parts.push(chunk('sRGB', new Uint8Array([0]))); const g = new Uint8Array(4); new DataView(g.buffer).setUint32(0, 45455); parts.push(chunk('gAMA', g)); }
  if (dpi) { const ph = new Uint8Array(9); const pv = new DataView(ph.buffer); const ppm = Math.round(dpi / 0.0254); pv.setUint32(0, ppm); pv.setUint32(4, ppm); ph[8] = 1; parts.push(chunk('pHYs', ph)); }
  parts.push(chunk('IDAT', await streamBytes(raw, new CompressionStream('deflate'))), chunk('IEND', new Uint8Array(0)));
  return new Blob(parts, { type: 'image/png' });
}
export async function encodeCanvasLossy(c, type, quality, dpi) {
  const b = await new Promise(r => c.toBlob(r, type, quality));
  if (!b || b.type !== type) throw new Error((type === 'image/webp' ? 'WebP' : 'JPEG') + ' encoding is not available in this browser.');
  if (type === 'image/jpeg' && dpi) { const u = new Uint8Array(await b.arrayBuffer()); if (latin(u.subarray(6, 10)) === 'JFIF') { u[13] = 1; u[14] = dpi >> 8; u[15] = dpi & 255; u[16] = dpi >> 8; u[17] = dpi & 255; } return new Blob([u], { type }); }
  return b;
}
export function encodeBMP(id, { alpha = false, dpi = 72 } = {}) {
  const { width: w, height: h, data: d } = id; const bpp = alpha ? 4 : 3, row = alpha ? w * 4 : Math.ceil(w * 3 / 4) * 4, hdr = alpha ? 108 : 40, off = 14 + hdr, size = off + row * h;
  const buf = new ArrayBuffer(size), dv = new DataView(buf), u = new Uint8Array(buf); const ppm = Math.round(dpi / 0.0254);
  u[0] = 66; u[1] = 77; dv.setUint32(2, size, true); dv.setUint32(10, off, true); dv.setUint32(14, hdr, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true); dv.setUint16(28, bpp * 8, true); dv.setUint32(30, alpha ? 3 : 0, true); dv.setUint32(34, row * h, true); dv.setInt32(38, ppm, true); dv.setInt32(42, ppm, true);
  if (alpha) { dv.setUint32(54, 0x00ff0000, true); dv.setUint32(58, 0x0000ff00, true); dv.setUint32(62, 0x000000ff, true); dv.setUint32(66, 0xff000000, true); dv.setUint32(70, 0x73524742, true); }
  for (let y = 0; y < h; y++) { let o = off + (h - 1 - y) * row; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u[o++] = d[i + 2]; u[o++] = d[i + 1]; u[o++] = d[i]; if (alpha) u[o++] = d[i + 3]; } }
  return new Blob([buf], { type: 'image/bmp' });
}
export function encodeTGA(id, { alpha = true, rle = false, gray = false } = {}) {
  const { width: w, height: h, data: d } = id; const B = gray ? 1 : alpha ? 4 : 3; const out = [];
  const hd = new Uint8Array(18); const hv = new DataView(hd.buffer); hd[2] = (gray ? 3 : 2) + (rle ? 8 : 0); hv.setUint16(12, w, true); hv.setUint16(14, h, true); hd[16] = B * 8; hd[17] = 0x20 | (alpha && !gray ? 8 : 0); out.push(hd);
  const px = new Uint8Array(w * h * B); for (let i = 0, o = 0; i < w * h; i++) { const s = i * 4; if (gray) px[o++] = lum8(d, s); else { px[o++] = d[s + 2]; px[o++] = d[s + 1]; px[o++] = d[s]; if (B === 4) px[o++] = d[s + 3]; } }
  if (!rle) out.push(px);
  else {
    const buf = new Uint8Array(w * h * (B + 1) + h * 2); let o = 0; const same = (a, b) => { for (let k = 0; k < B; k++) if (px[a * B + k] !== px[b * B + k]) return false; return true; };
    for (let y = 0; y < h; y++) {
      let x = 0; const r = y * w;
      while (x < w) {
        let run = 1; while (x + run < w && run < 128 && same(r + x, r + x + run)) run++;
        if (run > 1) { buf[o++] = 128 | (run - 1); buf.set(px.subarray((r + x) * B, (r + x + 1) * B), o); o += B; x += run; }
        else { let n = 1; while (x + n < w && n < 128 && !(x + n + 1 < w && same(r + x + n, r + x + n + 1))) n++; buf[o++] = n - 1; buf.set(px.subarray((r + x) * B, (r + x + n) * B), o); o += n * B; x += n; }
      }
    }
    out.push(buf.subarray(0, o));
  }
  const ft = new Uint8Array(26); ft.set(new TextEncoder().encode('TRUEVISION-XFILE.'), 8); out.push(ft);
  return new Blob(out, { type: 'image/x-tga' });
}
export async function encodeTIFF(id, { mode = 'rgba', bits = 8, comp = 'none', dpi = 72 } = {}) {
  const { width: w, height: h, data: d } = id; const spp = { gray: 1, rgb: 3, rgba: 4 }[mode]; const B = bits / 8, rowB = w * spp * B;
  let raw = new Uint8Array(rowB * h); const rv = new DataView(raw.buffer); let o = 0;
  for (let i = 0; i < w * h; i++) { const s = i * 4; const vals = mode === 'gray' ? [lum8(d, s)] : mode === 'rgb' ? [d[s], d[s + 1], d[s + 2]] : [d[s], d[s + 1], d[s + 2], d[s + 3]]; for (const v of vals) { if (B === 2) { rv.setUint16(o, v * 257, true); o += 2; } else raw[o++] = v; } }
  let data = raw, compTag = 1;
  if (comp === 'packbits') { const parts = []; for (let y = 0; y < h; y++) parts.push(packbitsEncode(raw.subarray(y * rowB, (y + 1) * rowB))); data = new Uint8Array(await new Blob(parts).arrayBuffer()); compTag = 32773; }
  else if (comp === 'deflate') { data = await streamBytes(raw, new CompressionStream('deflate')); compTag = 8; }
  const tags = [[256, 4, [w]], [257, 4, [h]], [258, 3, Array(spp).fill(bits)], [259, 3, [compTag]], [262, 3, [spp >= 3 ? 2 : 1]], [273, 4, [0]], [277, 3, [spp]], [278, 4, [h]], [279, 4, [data.length]], [282, 5, [dpi]], [283, 5, [dpi]], [284, 3, [1]], [296, 3, [2]]];
  if (mode === 'rgba') tags.push([338, 3, [2]]);
  const dataOff = 8, ifdOff = dataOff + data.length + (data.length & 1), ifdSize = 2 + tags.length * 12 + 4; let extOff = ifdOff + ifdSize;
  const ext = []; const total = () => extOff;
  const buf = new Uint8Array(ifdOff + ifdSize + 64 + spp * 2); const dv = new DataView(buf.buffer);
  buf[0] = 0x49; buf[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true); buf.set(data, dataOff);
  dv.setUint16(ifdOff, tags.length, true);
  tags.forEach(([tag, type, vals], i) => {
    const e = ifdOff + 2 + i * 12; dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, vals.length, true);
    const bytes = (type === 3 ? 2 : type === 4 ? 4 : 8) * vals.length; let at = e + 8;
    if (bytes > 4) { at = extOff; dv.setUint32(e + 8, extOff, true); extOff += bytes; }
    vals.forEach((v, k) => { if (tag === 273) v = dataOff; if (type === 3) dv.setUint16(at + k * 2, v, true); else if (type === 4) dv.setUint32(at + k * 4, v, true); else { dv.setUint32(at + k * 8, Math.round(v * 100), true); dv.setUint32(at + k * 8 + 4, 100, true); } });
  });
  dv.setUint32(ifdOff + 2 + tags.length * 12, 0, true);
  return new Blob([buf.subarray(0, total())], { type: 'image/tiff' });
}
function packbitsEncode(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    let run = 1; while (i + run < src.length && run < 128 && src[i + run] === src[i]) run++;
    if (run > 1) { out.push(257 - run, src[i]); i += run; }
    else { let n = 1; while (i + n < src.length && n < 128 && !(i + n + 1 < src.length && src[i + n] === src[i + n + 1])) n++; out.push(n - 1); for (let k = 0; k < n; k++) out.push(src[i + k]); i += n; }
  }
  return Uint8Array.from(out);
}
// Float data for HDR formats. 8-bit sRGB values become linear floats. This does not add dynamic range.
export function toLinearFloat(id, linearize = true) {
  const d = id.data, f = new Float32Array(id.width * id.height * 4);
  for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) f[i + c] = linearize ? S2L[d[i + c]] : d[i + c] / 255; f[i + 3] = d[i + 3] / 255; }
  return f;
}
export function encodeHDR(f, w, h) {
  const head = new TextEncoder().encode(`#?RADIANCE\n# Ultimate Texture Studio\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const r = f[i * 4], g = f[i * 4 + 1], b = f[i * 4 + 2], v = Math.max(r, g, b); if (v < 1e-32) continue; const e = Math.floor(Math.log2(v)) + 1, k = 256 / Math.pow(2, e); px[i * 4] = Math.min(255, r * k + 0.5); px[i * 4 + 1] = Math.min(255, g * k + 0.5); px[i * 4 + 2] = Math.min(255, b * k + 0.5); px[i * 4 + 3] = e + 128; }
  return new Blob([head, px], { type: 'image/vnd.radiance' });
}
export function encodeEXR(f, w, h, alpha = true) {
  const names = alpha ? ['A', 'B', 'G', 'R'] : ['B', 'G', 'R']; const te = new TextEncoder(); const parts = [];
  const attr = (name, type, bytes) => { parts.push(te.encode(name + '\0' + type + '\0')); const s = new Uint8Array(4); new DataView(s.buffer).setInt32(0, bytes.length, true); parts.push(s, bytes); };
  const chl = []; for (const n of names) { chl.push(...te.encode(n + '\0')); const b = new Uint8Array(16); const v = new DataView(b.buffer); v.setInt32(0, 2, true); v.setInt32(8, 1, true); v.setInt32(12, 1, true); chl.push(...b); } chl.push(0);
  const box = () => { const b = new Uint8Array(16); const v = new DataView(b.buffer); v.setInt32(8, w - 1, true); v.setInt32(12, h - 1, true); return b; };
  const fl = x => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, true); return b; };
  parts.push(new Uint8Array([0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0]));
  attr('channels', 'chlist', Uint8Array.from(chl)); attr('compression', 'compression', new Uint8Array([0])); attr('dataWindow', 'box2i', box()); attr('displayWindow', 'box2i', box());
  attr('lineOrder', 'lineOrder', new Uint8Array([0])); attr('pixelAspectRatio', 'float', fl(1)); attr('screenWindowCenter', 'v2f', new Uint8Array(8)); attr('screenWindowWidth', 'float', fl(1)); parts.push(new Uint8Array([0]));
  const headLen = parts.reduce((a, p) => a + p.length, 0); const lineData = names.length * w * 4; const chunkLen = 8 + lineData;
  const table = new Uint8Array(h * 8); const tv = new DataView(table.buffer); for (let y = 0; y < h; y++) tv.setBigUint64(y * 8, BigInt(headLen + h * 8 + y * chunkLen), true);
  parts.push(table);
  const body = new Uint8Array(h * chunkLen); const bv = new DataView(body.buffer); const ci = { R: 0, G: 1, B: 2, A: 3 };
  for (let y = 0; y < h; y++) { let o = y * chunkLen; bv.setInt32(o, y, true); bv.setInt32(o + 4, lineData, true); o += 8; for (const n of names) for (let x = 0; x < w; x++) { bv.setFloat32(o, f[(y * w + x) * 4 + ci[n]], true); o += 4; } }
  parts.push(body);
  return new Blob(parts, { type: 'image/x-exr' });
}

// Make edges wrap by cross-fading with a half-offset copy.
export function makeSeamless(c, blend = 0.25) {
  const w = c.width, h = c.height; const src = getData(c).data; const out = ctx(c).createImageData(w, h); const d = out.data;
  const bw = Math.max(1, blend * w / 2), bh = Math.max(1, blend * h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
    const a = Math.min(1, ex / bw) * Math.min(1, ey / bh);
    const sx = (x + (w >> 1)) % w, sy = (y + (h >> 1)) % h;
    const cx = Math.min(sx, w - 1 - sx), cy = Math.min(sy, h - 1 - sy); const b = Math.min(1, cx / bw) * Math.min(1, cy / bh);
    const wa = a + 1e-4, wb = (1 - a) * b + 1e-4; const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
    for (let k = 0; k < 4; k++) d[i + k] = (src[i + k] * wa + src[j + k] * wb) / (wa + wb);
  }
  return fromData(out);
}
export function offsetHalf(c) { const w = c.width, h = c.height, n = newCanvas(w, h), x = ctx(n); const ox = w >> 1, oy = h >> 1; for (const [dx, dy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) x.drawImage(c, ox + dx, oy + dy); return n; }
