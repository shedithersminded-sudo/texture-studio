// Export engine shared by the Export Center and the Business Center packaging assistant.
import * as S from './store.js';
import { newCanvas, ctx, getData, fromData, resize, encodePNG, encodeCanvasLossy, encodeBMP, encodeTGA, encodeTIFF, encodeEXR, encodeHDR, toLinearFloat, srgb2lin, isPow2 } from './img.js';
import { ZipWriter } from './zip.js';
import { pack, MAP_SPACE, MAP_LABEL } from './pbr.js';
import { task, download } from './ui.js';

export const FORMATS = {
  PNG: { ext: 'png', bits: [8, 16], alpha: true, gray: true, dpi: true, note: 'Lossless. Best default for textures and all data maps.' },
  JPG: { ext: 'jpg', bits: [8], alpha: false, quality: true, dpi: true, note: 'Lossy, small files. Fine for base color previews. Avoid for normal and data maps.' },
  WEBP: { ext: 'webp', bits: [8], alpha: true, quality: true, note: 'Small files with alpha. Supported by Godot and browsers; many DCC tools do not read it.' },
  TIFF: { ext: 'tif', bits: [8, 16], alpha: true, gray: true, comp: true, dpi: true, note: 'Lossless, 16-bit capable. Common in print and Photoshop workflows.' },
  BMP: { ext: 'bmp', bits: [8], alpha: true, dpi: true, note: 'Uncompressed, large. Only for tools that require it.' },
  TGA: { ext: 'tga', bits: [8], alpha: true, gray: true, rle: true, note: 'Classic game format with alpha. RLE compression is lossless.' },
  EXR: { ext: 'exr', bits: ['32f'], alpha: true, hdr: true, note: '32-bit float, linear. Converted from the 8-bit working image; it does not add dynamic range.' },
  HDR: { ext: 'hdr', bits: ['32f'], alpha: false, hdr: true, note: 'Radiance RGBE float, linear. Converted from 8-bit data; no added range.' },
};
const SUF_UE = { baseColor: 'BC', normal: 'N', height: 'H', displacement: 'D', roughness: 'R', metallic: 'M', ao: 'AO', opacity: 'O', emission: 'E', specular: 'S', glossiness: 'G', ORM: 'ORM' };
const SUF_LONG = { baseColor: 'BaseColor', normal: 'Normal', height: 'Height', displacement: 'Displacement', roughness: 'Roughness', metallic: 'Metallic', ao: 'AO', opacity: 'Opacity', emission: 'Emissive', specular: 'Specular', glossiness: 'Glossiness', ORM: 'ORM', MaskMap: 'MaskMap', MetallicSmoothness: 'MetallicSmoothness' };
const SUF_BL = { baseColor: 'diff', normal: 'nor_gl', height: 'height', displacement: 'disp', roughness: 'rough', metallic: 'metal', ao: 'ao', opacity: 'alpha', emission: 'emission', specular: 'spec', glossiness: 'gloss' };
export const EXPORT_PRESETS = [
  { id: 'unreal', group: 'Game Development', name: 'Unreal Engine 5', format: 'PNG', size: 2048, bits: 8, normalY: 'DirectX', pack: 'ORM', naming: 'T_{material}_{suffix}', suffix: SUF_UE, folder: '06_EXPORTS/Unreal_Engine',
    recommended: ['2048 px for hero props, 1024 for small props, power-of-two sizes', 'PNG or TGA source files; Unreal compresses on import', 'Pack AO, Roughness, Metallic into one ORM texture', 'Prefix T_ and suffix _BC, _N, _ORM'],
    required: ['Normal maps must use the DirectX (green down) convention or have Flip Green Channel enabled on import', 'Turn sRGB off for ORM, roughness, metallic, height and AO textures after import', 'Non power-of-two textures get no mipmaps and cannot stream'] },
  { id: 'unity-urp', group: 'Game Development', name: 'Unity (URP / Built-in)', format: 'PNG', size: 2048, bits: 8, normalY: 'OpenGL', pack: 'MetallicSmoothness', naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Unity',
    recommended: ['PNG or TGA, power-of-two sizes', 'Metallic map with smoothness in alpha (R = metal, A = smoothness)', 'Keep a separate AO map for the Occlusion slot'],
    required: ['Normal maps use OpenGL (green up). Set Texture Type to Normal map on import', 'Disable sRGB for metallic, AO and height textures', 'Smoothness is 1 minus roughness'] },
  { id: 'unity-hdrp', group: 'Game Development', name: 'Unity HDRP', format: 'PNG', size: 2048, bits: 8, normalY: 'OpenGL', pack: 'MaskMap', naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Unity',
    recommended: ['Mask map: R metallic, G AO, B detail mask, A smoothness'], required: ['OpenGL normal maps', 'Mask map must be imported with sRGB off'] },
  { id: 'godot', group: 'Game Development', name: 'Godot 4', format: 'PNG', size: 2048, bits: 8, normalY: 'OpenGL', pack: 'ORM', naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Godot',
    recommended: ['PNG or WEBP', 'ORM texture works with ORMMaterial3D', 'Power-of-two sizes for VRAM compression'], required: ['OpenGL normal maps (Godot uses Y+)', 'Godot detects normal maps on first use; check import settings say Normal Map'] },
  { id: 'blender', group: '3D Modeling', name: 'Blender', format: 'PNG', size: 4096, bits: 16, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}', suffix: SUF_BL, folder: '06_EXPORTS/Blender',
    recommended: ['16-bit PNG or EXR for height and displacement to avoid stepping', 'Separate maps, one per Principled BSDF input', 'Node Wrangler (Ctrl+Shift+T) recognizes these suffixes'], required: ['Set Color Space to Non-Color for every map except base color and emission', 'OpenGL normal maps through a Normal Map node'] },
  { id: 'painter', group: '3D Modeling', name: 'Substance 3D Painter', format: 'PNG', size: 2048, bits: 8, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR',
    recommended: ['Import as resources into the shelf', 'PNG, TGA, TIFF or EXR'], required: ['Project normal format defaults to OpenGL; match it'] },
  { id: 'designer', group: '3D Modeling', name: 'Substance 3D Designer', format: 'PNG', size: 2048, bits: 16, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR',
    recommended: ['16-bit for height', 'Bitmap inputs at the graph resolution'], required: ['Normal format setting must match (OpenGL default)'] },
  { id: 'photoshop', group: 'Digital Art', name: 'Photoshop', format: 'TIFF', size: 4096, bits: 16, normalY: 'OpenGL', pack: null, naming: '{name}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR',
    recommended: ['16-bit TIFF keeps room for color edits', 'PNG for web output'], required: ['This app cannot write PSD files. TIFF and PNG open directly in Photoshop'] },
  { id: 'general', group: 'Digital Art', name: 'General image editing', format: 'PNG', size: 2048, bits: 8, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR', recommended: ['8-bit sRGB PNG opens everywhere'], required: [] },
  { id: 'archviz', group: 'Architecture & Visualization', name: 'Architectural visualization', format: 'JPG', size: 4096, bits: 8, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}_{w}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR', quality: 0.95,
    recommended: ['4K base color as high quality JPG, data maps as PNG', 'Note the real-world size of one tile (for example 2 x 2 m) in the file name or readme'], required: ['V-Ray, Corona and Enscape expect linear (Non-Color) data maps'] },
  { id: 'cad', group: 'Architecture & Visualization', name: 'CAD-compatible images', format: 'JPG', size: 1024, bits: 8, normalY: 'OpenGL', pack: null, naming: '{material}_{suffix}', suffix: SUF_LONG, folder: '06_EXPORTS/Generic_PBR', quality: 0.9,
    recommended: ['JPG, PNG or BMP at 512 to 2048 px keeps drawings light', 'No spaces in names'], required: ['Many CAD tools ignore alpha; keep textures opaque', 'Some older tools only accept JPG or BMP'] },
];
export function defaultOptions() {
  return { preset: 'general', format: 'PNG', width: 0, height: 0, keepSize: true, filter: 'high', channels: 'auto', bits: 8, space: 'auto', convertLinear: false, quality: 0.92, compression: 'deflate', rle: true, dpi: 72, alphaMode: 'keep', matte: '#ffffff', mipmaps: false, normalY: 'keep', pack: null, packAlso: false, naming: '{material}_{suffix}', suffix: SUF_LONG, organize: 'material', destination: 'zip', metadata: true, mtl: true, zipName: '' };
}
export function applyPreset(o, p) { Object.assign(o, { preset: p.id, format: p.format, bits: p.bits, normalY: p.normalY, pack: p.pack, naming: p.naming, suffix: p.suffix, keepSize: false, width: p.size, height: p.size, quality: p.quality || o.quality, presetFolder: p.folder }); return o; }

export function fileName(o, it, ext, extra = '') {
  const d = new Date(); const sfx = (o.suffix || SUF_LONG)[it.mapType] || it.mapType || '';
  let n = o.naming.replace(/\{(\w+)\}/g, (_, k) => ({ name: it.name, material: it.material || it.name, map: it.mapType ? (MAP_LABEL[it.mapType] || it.mapType) : '', suffix: sfx, w: it.w, h: it.h, project: it.project || 'NoProject', version: 'v' + (it.version || 1), date: d.toISOString().slice(0, 10), format: ext }[k] ?? ''));
  n = n.replace(/_+$/, ''); if (it.mapType && !o.naming.includes('{suffix}') && !o.naming.includes('{map}')) n += '_' + sfx;
  return S.safeName(n) + extra + '.' + ext;
}
// Convert one canvas into one encoded file according to options.
export async function encode(c, o, mapType) {
  const F = FORMATS[o.format]; let w = c.width, h = c.height;
  if (!o.keepSize && o.width) { if (o.height) { w = o.width; h = o.height; } else { w = o.width; h = Math.round(o.width * c.height / c.width); } }
  if (!o.allowUpscale && (w > c.width || h > c.height)) { w = c.width; h = c.height; } // never invent pixels unless asked
  let cv = w !== c.width || h !== c.height ? resize(c, w, h, mapType === 'normal' && o.filter === 'high' ? 'bilinear' : o.filter) : c;
  let id = getData(cv); const d = id.data;
  if (mapType === 'normal' && o.normalY !== 'keep' && o.sourceNormalY && o.normalY !== o.sourceNormalY) for (let i = 1; i < d.length; i += 4) d[i] = 255 - d[i];
  let channels = o.channels; const space = o.space === 'auto' ? (MAP_SPACE[mapType] || 'srgb') : o.space;
  if (channels === 'auto') channels = ['height', 'displacement', 'roughness', 'metallic', 'ao', 'opacity', 'specular', 'glossiness'].includes(mapType) && F.gray ? 'gray' : F.alpha && hasAlpha(id) ? 'rgba' : 'rgb';
  if (channels === 'rgba' && !F.alpha) channels = 'rgb';
  if (channels === 'gray' && !F.gray && o.format !== 'JPG') channels = 'rgb';
  if (o.alphaMode === 'remove' || (channels !== 'rgba' && o.alphaMode === 'matte')) { const m = parseInt(o.matte.slice(1), 16), mr = m >> 16 & 255, mg = m >> 8 & 255, mb = m & 255; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; d[i] = d[i] * a + mr * (1 - a); d[i + 1] = d[i + 1] * a + mg * (1 - a); d[i + 2] = d[i + 2] * a + mb * (1 - a); d[i + 3] = 255; } if (channels === 'rgba') channels = 'rgb'; }
  if (channels === 'bw') { for (let i = 0; i < d.length; i += 4) { const l = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722 >= 128 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = l; } channels = F.gray ? 'gray' : 'rgb'; }
  if (o.convertLinear && space === 'srgb' && !F.hdr) for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = srgb2lin(d[i + k] / 255) * 255;
  const dpi = F.dpi ? o.dpi : null; let blob;
  switch (o.format) {
    case 'PNG': blob = await encodePNG(id, { mode: channels === 'gray' ? 'gray' : channels, bits: o.bits === 16 ? 16 : 8, dpi, space: space === 'linear' || o.convertLinear ? 'linear' : 'srgb' }); break;
    case 'JPG': cv = fromData(id); blob = await encodeCanvasLossy(cv, 'image/jpeg', o.quality, dpi); break;
    case 'WEBP': cv = fromData(id); blob = await encodeCanvasLossy(cv, 'image/webp', o.quality); break;
    case 'TIFF': blob = await encodeTIFF(id, { mode: channels === 'gray' ? 'gray' : channels, bits: o.bits === 16 ? 16 : 8, comp: o.compression, dpi: dpi || 72 }); break;
    case 'BMP': blob = encodeBMP(id, { alpha: channels === 'rgba', dpi: dpi || 72 }); break;
    case 'TGA': blob = encodeTGA(id, { alpha: channels === 'rgba', rle: o.rle, gray: channels === 'gray' }); break;
    case 'EXR': blob = encodeEXR(toLinearFloat(id, space === 'srgb'), w, h, channels === 'rgba'); break;
    case 'HDR': blob = encodeHDR(toLinearFloat(id, space === 'srgb'), w, h); break;
    default: throw new Error('Unknown format ' + o.format);
  }
  return { blob, w, h, channels, space, canvas: o.mipmaps ? fromData(id) : null };
}
function hasAlpha(id) { const d = id.data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true; return false; }

// items: [{ canvas, name, material, mapType, project, version, folder, normalY }]
export async function runExport(items, o, { label = 'Export', productId, onFile } = {}) {
  const F = FORMATS[o.format]; const t = task(label); const files = []; const errors = [];
  try {
    // channel packing
    if (o.pack) {
      const byMat = {}; for (const it of items) if (it.material && ['ao', 'roughness', 'metallic'].includes(it.mapType)) (byMat[it.material] ||= {})[it.mapType] = it;
      for (const [m, g] of Object.entries(byMat)) {
        if (Object.keys(g).length < 2) continue; const first = Object.values(g)[0]; const w = first.canvas.width, h = first.canvas.height;
        const md = Object.fromEntries(Object.entries(g).map(([k, it]) => [k, getData(it.canvas.width === w && it.canvas.height === h ? it.canvas : resize(it.canvas, w, h))]));
        items.push({ ...first, mapType: o.pack, canvas: fromData(pack(o.pack, md, w, h)), packed: Object.keys(g) });
        if (!o.packAlso) items = items.filter(it => !(it.material === m && g[it.mapType] === it));
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; t.update(i / items.length, label + ': ' + it.name);
      try {
        const sp = ['ORM', 'MaskMap', 'MetallicSmoothness'].includes(it.mapType) ? 'linear' : undefined;
        const r = await encode(it.canvas, { ...o, sourceNormalY: it.normalY || 'OpenGL', space: sp || o.space }, it.mapType);
        const base = { ...it, w: r.w, h: r.h };
        const name = fileName(o, base, F.ext); const dir = folderFor(o, it);
        files.push({ path: dir + name, blob: r.blob, meta: { map: it.mapType || null, w: r.w, h: r.h, channels: r.channels, colorSpace: r.space, packed: it.packed || null } });
        if (o.mipmaps && r.canvas) { let c = r.canvas, lvl = 1; while (c.width > 1 && c.height > 1 && lvl < 14) { c = resize(c, Math.max(1, c.width >> 1), Math.max(1, c.height >> 1), 'bilinear'); const m = await encode(c, { ...o, keepSize: true, mipmaps: false, normalY: 'keep' }, it.mapType); files.push({ path: dir + fileName(o, { ...base, w: m.w, h: m.h }, F.ext, '_mip' + lvl), blob: m.blob, meta: { mip: lvl, w: m.w, h: m.h } }); lvl++; } }
      } catch (e) { errors.push(it.name + ': ' + e.message); }
    }
    // metadata and material files
    const mats = [...new Set(items.filter(i => i.material).map(i => i.material))];
    if (o.metadata) for (const m of mats) {
      const rec = items.find(i => i.material === m)?.materialRec; const dir = folderFor(o, items.find(i => i.material === m));
      const mapFiles = Object.fromEntries(files.filter(f => f.path.startsWith(dir) && f.meta.map && !f.meta.mip).map(f => [f.meta.map, f.path.slice(dir.length)]));
      const meta = { material: m, category: rec?.category, generator: 'Ultimate Texture Studio', exported: new Date().toISOString(), preset: o.preset, format: o.format, bitDepth: o.bits, normalConvention: o.normalY === 'keep' ? (rec?.settings?.normalY || 'OpenGL') : o.normalY, maps: mapFiles, colorSpaces: Object.fromEntries(Object.keys(mapFiles).map(k => [k, ['ORM', 'MaskMap', 'MetallicSmoothness'].includes(k) ? 'linear' : MAP_SPACE[k] || 'srgb'])), estimatedMaps: rec?.estimated ? 'Maps other than base color were estimated from one image.' : 'Procedural data', settings: rec?.settings || null };
      files.push({ path: dir + S.safeName(m) + '.material.json', blob: new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), meta: {} });
      if (o.mtl) { const mf = mapFiles; const mtl = ['# Wavefront MTL written by Ultimate Texture Studio', 'newmtl ' + S.safeName(m), 'Kd 1 1 1', 'Ks 0.04 0.04 0.04', mf.baseColor && 'map_Kd ' + mf.baseColor, mf.normal && 'norm ' + mf.normal, mf.normal && 'map_Bump -bm 1.0 ' + mf.normal, mf.roughness && 'map_Pr ' + mf.roughness, mf.metallic && 'map_Pm ' + mf.metallic, mf.opacity && 'map_d ' + mf.opacity, mf.emission && 'map_Ke ' + mf.emission, (mf.displacement || mf.height) && 'disp ' + (mf.displacement || mf.height)].filter(Boolean).join('\n'); files.push({ path: dir + S.safeName(m) + '.mtl', blob: new Blob([mtl], { type: 'text/plain' }), meta: {} }); }
    }
    t.update(0.98, 'Writing files');
    const total = files.reduce((a, f) => a + f.blob.size, 0);
    let where;
    if (o.destination === 'folder') {
      const root = o.dirHandle; if (!root) throw new Error('No export folder chosen.');
      for (const f of files) { const parts = f.path.split('/'); let d = root; for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true }); const fh = await d.getFileHandle(parts.at(-1), { create: true }); const w = await fh.createWritable(); await w.write(f.blob); await w.close(); }
      where = 'folder "' + root.name + '"';
    } else if (o.destination === 'zip' || files.length > 6) {
      const z = new ZipWriter(); for (const f of files) await z.add(f.path, f.blob); const zb = z.blob(); const zn = S.safeName(o.zipName || label) + '.zip'; download(zb, zn); where = 'ZIP ' + zn;
      files.zipSize = zb.size;
    } else { for (const f of files) download(f.blob, f.path.split('/').pop()); where = 'downloads'; }
    await S.save({ type: 'exportlog', name: label, ok: !errors.length, format: o.format, preset: o.preset, files: files.length, size: files.zipSize || total, where, errors, productId: productId || null, paths: files.map(f => f.path).slice(0, 200) });
    await S.log('export', `${label}: ${files.length} file(s) to ${where}` + (errors.length ? `, ${errors.length} failed` : ''), errors.length ? 'warn' : 'info');
    if (productId) { const p = S.get(productId); if (p) { p.exportFiles ||= []; for (const f of files) p.exportFiles.push({ path: f.path, size: f.blob.size, date: Date.now(), preset: o.preset }); await S.save(p); } }
    t.done(); return { files, errors, where, total };
  } catch (e) {
    t.fail(e); await S.save({ type: 'exportlog', name: label, ok: false, format: o.format, errors: [e.message], files: 0 }); await S.log('export', label + ' failed: ' + e.message, 'error'); throw e;
  }
}
function folderFor(o, it) {
  if (!it) return '';
  if (o.organize === 'flat') return '';
  if (o.organize === 'material') return it.material ? S.safeName(it.material) + '/' : '';
  // studio structure
  const base = (o.presetFolder || '06_EXPORTS/Generic_PBR') + '/';
  return base + (it.project ? S.safeName(it.project) + '/' : '') + (it.material ? 'Materials/' + S.safeName(it.material) + '/' + (SUF_LONG[it.mapType] || 'Other') + '/' : 'Textures/');
}
// Build export items from records.
export async function itemsFromMaterial(m, only) {
  const out = []; const proj = S.get(m.projectId)?.name;
  for (const [k, id] of Object.entries(m.maps || {})) { if (only && !only.includes(k)) continue; const t = S.get(id); if (!t || t.deleted) continue; out.push({ canvas: await S.textureCanvas(t), name: m.name + ' ' + (MAP_LABEL[k] || k), material: m.name, mapType: k, project: proj, version: t.version, normalY: m.settings?.normalY || 'OpenGL', materialRec: m }); }
  return out;
}
export async function itemFromTexture(t) { const m = t.materialId && S.get(t.materialId); return { canvas: await S.textureCanvas(t), name: t.name, material: m?.name || null, mapType: t.mapType || null, project: S.get(t.projectId)?.name, version: t.version, normalY: m?.settings?.normalY || 'OpenGL', materialRec: m || null }; }
export { isPow2 };
