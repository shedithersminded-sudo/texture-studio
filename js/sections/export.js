import { h, icon, clear, select, check, slider, panel, toast, promptDlg, fmtBytes, fmtDT, modal, tabs } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { FORMATS, EXPORT_PRESETS, defaultOptions, applyPreset, runExport, itemsFromMaterial, itemFromTexture, fileName } from '../core/exporter.js';
import { MAP_LABEL } from '../core/pbr.js';
import { pickTextures, helpLink, academyLink } from '../core/widgets.js';
import { RES_PRESETS } from './generate.js';

export default function (el, arg) {
  const o = defaultOptions(); let src = { kind: 'texture', ids: [] }; let sel = new Set(); let lastResult = null; let productId = '';
  if (arg?.startsWith('mat:')) src = { kind: 'material', id: arg.slice(4) }; else if (arg?.startsWith('proj:')) src = { kind: 'project', id: arg.slice(5) }; else if (arg?.startsWith('col:')) src = { kind: 'collection', id: arg.slice(4) }; else if (arg?.startsWith('prod:')) { productId = arg.slice(5); const p = S.get(productId); src = p?.materialIds?.length ? { kind: 'material', id: p.materialIds[0] } : { kind: 'texture', ids: p?.textureIds || [] }; } else if (arg && S.get(arg)) src = { kind: 'texture', ids: [arg] };
  const left = h('div'), right = h('div');
  el.append(h('div', { class: 'page' }, h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Export Center'), h('div', { class: 'sub' }, 'Pick what to export, choose a preset, fine-tune, export. Every export is logged.')), h('div', { class: 'act' }, helpLink('formats', 'Choosing a format'), academyLink('c4-engines', 'Exporting course'))),
    h('div', { class: 'split', style: { '--b': '380px' } }, left, right)));

  function list() {
    if (src.kind === 'material') { const m = S.get(src.id); return m ? Object.entries(m.maps || {}).filter(([, id]) => S.get(id) && !S.get(id).deleted).map(([k, id]) => ({ key: k, tex: S.get(id), label: MAP_LABEL[k] || k, material: m })) : []; }
    if (src.kind === 'project') { const mats = S.all('material', m => m.projectId === src.id); const tex = S.liveTextures(t => t.projectId === src.id && !t.materialId); return [...mats.flatMap(m => Object.entries(m.maps || {}).filter(([, id]) => S.get(id)).map(([k, id]) => ({ key: m.id + ':' + k, tex: S.get(id), label: m.name + ' . ' + (MAP_LABEL[k] || k), material: m, mapType: k }))), ...tex.map(t => ({ key: t.id, tex: t, label: t.name }))]; }
    if (src.kind === 'collection') { const c = S.get(src.id); return (c?.items || []).map(S.get).filter(t => t && !t.deleted).map(t => ({ key: t.id, tex: t, label: t.name })); }
    return src.ids.map(S.get).filter(Boolean).map(t => ({ key: t.id, tex: t, label: t.name }));
  }
  function drawLeft() {
    clear(left); const L = list(); if (!sel.size || ![...sel].every(k => L.some(x => x.key === k))) sel = new Set(L.map(x => x.key));
    const srcTabs = tabs([['texture', 'Textures'], ['material', 'PBR material set'], ['project', 'Entire project'], ['collection', 'Collection']], src.kind, async k => { if (k === 'texture') { const t = await pickTextures({ multiple: true, title: 'Textures to export' }); src = { kind: 'texture', ids: t ? t.map(x => x.id) : [] }; } else src = { kind: k, id: '' }; sel.clear(); drawLeft(); });
    left.append(srcTabs);
    const pickers = { material: () => select('Material', [['', 'Choose...'], ...S.all('material').map(m => [m.id, m.name])], src.id, v => { src.id = v; sel.clear(); drawLeft(); }), project: () => select('Project', [['', 'Choose...'], ...S.all('project').map(p => [p.id, p.name])], src.id, v => { src.id = v; sel.clear(); drawLeft(); }), collection: () => select('Collection', [['', 'Choose...'], ...S.all('collection').map(c => [c.id, c.name])], src.id, v => { src.id = v; sel.clear(); drawLeft(); }), texture: () => h('button', { class: 'btn', onclick: async () => { const t = await pickTextures({ multiple: true, title: 'Textures to export' }); if (t) { src.ids = [...new Set([...src.ids, ...t.map(x => x.id)])]; drawLeft(); } } }, icon('plus'), 'Add textures') };
    left.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, pickers[src.kind](), h('span', { class: 'grow' }), L.length ? h('button', { class: 'btn sm', onclick: () => { sel = sel.size === L.length ? new Set() : new Set(L.map(x => x.key)); drawLeft(); } }, sel.size === L.length ? 'Select none' : 'Select all') : null));
    if (!L.length) { left.append(h('div', { class: 'empty' }, 'Nothing selected to export yet.')); drawPreview(); return; }
    const W = o.keepSize ? null : o.width, F = FORMATS[o.format];
    left.append(h('table', { class: 't' }, h('thead', null, h('tr', null, h('th'), h('th'), h('th', null, 'Item'), h('th', null, 'Source'), h('th', null, 'Output name'))), h('tbody', null, L.map(x => {
      const it = { name: x.tex.name, material: x.material?.name, mapType: x.mapType || (src.kind === 'material' ? x.key : x.tex.mapType), project: S.get(x.tex.projectId)?.name, version: x.tex.version, w: W || x.tex.width, h: W ? (o.height || Math.round(W * x.tex.height / x.tex.width)) : x.tex.height };
      return h('tr', null, h('td', null, h('input', { type: 'checkbox', checked: sel.has(x.key), onchange: e => { e.target.checked ? sel.add(x.key) : sel.delete(x.key); drawPreview(); } })), h('td', { style: { width: '40px' } }, h('img', { src: x.tex.thumb, style: { width: '32px', height: '32px', borderRadius: '4px' } })), h('td', null, x.label, x.tex.estimated ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'estimated') : null), h('td', { class: 'small muted' }, x.tex.width + 'x' + x.tex.height + ' ' + x.tex.format), h('td', { class: 'mono small' }, fileName(o, it, F.ext)));
    }))));
    drawPreview();
  }
  const sumEl = h('div');
  function drawPreview() { clear(sumEl); sumEl.append(h('div', { class: 'small muted', style: { marginTop: '10px' } }, `${sel.size} item(s). Format ${o.format}${o.keepSize ? ', original size' : `, ${o.width}${o.height ? 'x' + o.height : ' wide'}`}. Destination: ${{ zip: 'ZIP package', download: 'individual downloads', folder: 'a folder you choose' }[o.destination]}.`)); if (lastResult) sumEl.append(resultBox()); left.append(sumEl); }
  function resultBox() { const r = lastResult; return h('div', { class: 'card tight', style: { marginTop: '12px' } }, h('h3', null, icon('check'), 'Export complete'), h('div', { class: 'small muted' }, `${r.files.length} file(s), ${fmtBytes(r.total)} before packaging, saved to ${r.where}.`), r.errors.length ? h('div', { class: 'callout bad' }, r.errors.join('\n')) : null, h('div', { style: { maxHeight: '200px', overflow: 'auto', marginTop: '6px' } }, r.files.map(f => h('div', { class: 'row small mono' }, f.path, h('span', { class: 'grow' }), fmtBytes(f.blob.size))))); }
  function drawRight() {
    clear(right); const F = FORMATS[o.format]; const P = EXPORT_PRESETS.find(p => p.id === o.preset); const user = S.all('preset', p => p.kind === 'export');
    const groups = [...new Set(EXPORT_PRESETS.map(p => p.group))];
    const presetSel = h('select', { onchange: e => { const v = e.target.value; if (v.startsWith('u:')) Object.assign(o, structuredClone(S.get(v.slice(2)).data)); else applyPreset(o, EXPORT_PRESETS.find(p => p.id === v)); drawRight(); drawLeft(); } }, groups.map(g => h('optgroup', { label: g }, EXPORT_PRESETS.filter(p => p.group === g).map(p => h('option', { value: p.id, selected: p.id === o.preset }, p.name)))), user.length ? h('optgroup', { label: 'My presets' }, user.map(p => h('option', { value: 'u:' + p.id }, p.name))) : null);
    right.append(panel('Export preset', [presetSel, P ? h('div', { style: { marginTop: '8px' } }, h('h4', null, 'Recommended (good practice)'), h('ul', { class: 'small', style: { paddingLeft: '18px', margin: '4px 0 8px' } }, P.recommended.map(r => h('li', null, r))), P.required.length ? [h('h4', null, 'Requirements (the target app expects these)'), h('ul', { class: 'small', style: { paddingLeft: '18px', margin: '4px 0' } }, P.required.map(r => h('li', null, r)))] : null) : null], { iconName: 'star' }));
    const userRes = S.all('preset', p => p.kind === 'resolution');
    const sizeOpts = [['keep', 'Keep original size'], ...RES_PRESETS.map(r => [String(r), r + ' x ' + r]), ...userRes.map(p => ['u' + p.id, 'Saved: ' + p.name]), ['custom', 'Custom...']];
    const set = k => v => { o[k] = v; drawLeft(); drawRight(); };
    right.append(panel('Format & size', [
      select('File format', Object.keys(FORMATS), o.format, v => { o.format = v; const f = FORMATS[v]; if (!f.bits.includes(o.bits)) o.bits = f.bits[0]; drawRight(); drawLeft(); }), h('div', { class: 'small muted', style: { marginTop: '-6px', marginBottom: '8px' } }, F.note),
      select('Dimensions', sizeOpts, o.keepSize ? 'keep' : RES_PRESETS.includes(o.width) && o.width === o.height ? String(o.width) : 'custom', async v => { if (v === 'keep') o.keepSize = true; else if (v.startsWith('u')) { const d = S.get(v.slice(1)).data; o.keepSize = false; o.width = d.w; o.height = d.h; } else if (v === 'custom') { const r = await promptDlg('Width x height (leave height empty to keep aspect ratio)', (o.width || 2048) + 'x' + (o.height || '')); const m = r?.match(/(\d+)\s*(?:[x*, ]\s*(\d*))?/); if (m) { o.keepSize = false; o.width = Math.min(8192, +m[1]); o.height = m[2] ? Math.min(8192, +m[2]) : 0; } } else { o.keepSize = false; o.width = o.height = +v; } drawRight(); drawLeft(); }, 'Square presets stretch non-square textures. Use Custom with only a width to keep the aspect ratio.'),
      !o.keepSize ? check('Allow upscaling smaller sources', o.allowUpscale, set('allowUpscale'), 'Off by default: a source smaller than the target keeps its own size, because enlarging adds no detail.') : null,
      select('Resampling filter', [['high', 'High quality'], ['bilinear', 'Bilinear'], ['nearest', 'Nearest (pixel art)']], o.filter, set('filter'), null, true),
      select('Bit depth', F.bits.map(b => [b, b === '32f' ? '32-bit float' : b + '-bit per channel']), o.bits, v => { o.bits = isNaN(+v) ? v : +v; drawRight(); }, '16-bit avoids banding in height maps. The working data is 8-bit, so 16-bit output has smoother storage but no extra detail.'),
      F.quality ? slider('Quality', Math.round(o.quality * 100), 40, 100, 1, v => o.quality = v / 100, 'Lossy compression quality. 90 to 95 is a good balance.') : null,
      F.comp ? select('Compression', [['none', 'None'], ['packbits', 'PackBits (lossless)'], ['deflate', 'Deflate (lossless, smaller)']], o.compression, set('compression')) : null,
      F.rle ? check('RLE compression (lossless)', o.rle, set('rle')) : null,
      h('div', { class: 'small dim' }, ['PNG', 'TIFF', 'BMP', 'TGA', 'EXR', 'HDR'].includes(o.format) ? 'This format is lossless.' : 'This format is lossy.'),
    ], { iconName: 'image' }));
    right.append(panel('Color & channels', [
      select('Channels', [['auto', 'Automatic (gray for data maps)'], ['rgba', 'RGBA'], ['rgb', 'RGB'], ['gray', 'Grayscale'], ['bw', 'Black and white']], o.channels, set('channels'), 'Automatic writes single-channel files for roughness, height and similar maps, and keeps alpha only when used.'),
      select('Alpha / transparency', [['keep', 'Keep alpha'], ['remove', 'Remove (flatten on matte color)'], ['matte', 'Flatten only when format lacks alpha']], o.alphaMode, set('alphaMode')),
      o.alphaMode !== 'keep' ? h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Matte color'), h('input', { type: 'color', value: o.matte, oninput: e => o.matte = e.target.value })) : null,
      select('Color space tag', [['auto', 'Automatic (sRGB color, linear data)'], ['srgb', 'sRGB'], ['linear', 'Linear']], o.space, set('space'), 'Tags the file. Base color and emission are sRGB; all other maps are linear data.'),
      check('Convert sRGB values to linear', o.convertLinear, set('convertLinear'), 'Changes pixel values. Only use when a pipeline asks for linear color textures.', true),
      select('Normal map green channel', [['keep', 'Keep as authored'], ['OpenGL', 'OpenGL (Y+)'], ['DirectX', 'DirectX (Y-)']], o.normalY, set('normalY'), 'Flips the green channel when the target differs from how the map was made.'),
      select('Channel packing', [['', 'None'], ['ORM', 'ORM (AO, Roughness, Metallic)'], ['MaskMap', 'Unity HDRP Mask Map'], ['MetallicSmoothness', 'Unity Metallic + Smoothness']], o.pack || '', v => { o.pack = v || null; drawRight(); }), o.pack ? check('Also export the unpacked maps', o.packAlso, v => o.packAlso = v) : null,
      F.dpi ? h('div', { class: 'f adv' }, h('label', null, 'DPI metadata'), h('input', { type: 'number', value: o.dpi, min: 1, max: 2400, oninput: e => o.dpi = +e.target.value || 72 })) : null,
      check('Generate mipmaps (separate files per level)', o.mipmaps, set('mipmaps'), 'Writes the full chain down to 1 px as _mip1, _mip2... Engines normally build mips themselves.', true),
    ], { iconName: 'sun' }));
    right.append(panel('Naming & destination', [
      h('div', { class: 'f' }, h('label', null, 'File name template'), h('input', { type: 'text', value: o.naming, onchange: e => { o.naming = e.target.value || '{name}'; drawLeft(); } }), h('div', { class: 'small dim' }, 'Tokens: {name} {material} {map} {suffix} {w} {h} {project} {version} {date}')),
      select('Folder organization', [['flat', 'All files in one folder'], ['material', 'One folder per material'], ['studio', 'Studio structure (06_EXPORTS/...)']], o.organize, set('organize')),
      select('Destination', [['zip', 'ZIP package (download)'], ['download', 'Individual downloads'], ...('showDirectoryPicker' in window ? [['folder', 'Write to a folder on this computer']] : [])], o.destination, set('destination'), 'Folder export writes files directly using your browser\'s folder permission. More than 6 individual files are zipped automatically.'),
      o.destination === 'folder' ? h('button', { class: 'btn sm', onclick: async () => { try { o.dirHandle = await window.showDirectoryPicker({ id: 'uts-export', mode: 'readwrite' }); drawRight(); } catch { } } }, icon('folder'), o.dirHandle ? 'Folder: ' + o.dirHandle.name : 'Choose folder') : null,
      check('Include JSON material metadata', o.metadata, set('metadata')), check('Include .mtl material file (Wavefront)', o.mtl, set('mtl'), 'Readable by Blender, 3ds Max, Maya and most OBJ importers.'),
      select('Attach exported files to product', [['', 'None'], ...S.all('product').map(p => [p.id, p.name])], productId, v => productId = v, 'Records the exported files on the product so packaging and QC can see them.'),
    ], { iconName: 'folder' }));
    right.append(h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn pri', style: { flex: 1, justifyContent: 'center' }, onclick: go }, icon('download'), 'Export ' + sel.size + ' item(s)'), h('button', { class: 'btn', onclick: async () => { const n = await promptDlg('Preset name', 'My ' + o.format + ' export'); if (n) { const d = structuredClone({ ...o, dirHandle: undefined }); await S.save({ type: 'preset', kind: 'export', name: n, data: d }); toast('Export preset saved', 'ok'); drawRight(); } } }, icon('star'), 'Save preset')));
    const recent = S.all('exportlog').sort((a, b) => b.created - a.created).slice(0, 5);
    if (recent.length) right.append(panel('Recent exports', recent.map(e => h('div', { class: 'row small', style: { padding: '2px 0' } }, h('span', { class: 'dot', style: { background: e.ok ? 'var(--ok)' : 'var(--bad)' } }), e.name, h('span', { class: 'grow' }), h('span', { class: 'muted' }, fmtDT(e.created)))), { open: false }));
  }
  async function go() {
    const L = list().filter(x => sel.has(x.key)); if (!L.length) return toast('Select at least one item', 'warn');
    if (o.destination === 'folder' && !o.dirHandle) return toast('Choose an export folder first', 'warn');
    if (o.width > 4096 && !o.keepSize && !(await (await import('../core/ui.js')).confirmDlg('Exports above 4K use a lot of memory. Continue?'))) return;
    try {
      let items;
      if (src.kind === 'material') { const m = S.get(src.id); items = await itemsFromMaterial(m, L.map(x => x.key)); }
      else { items = []; for (const x of L) { const it = await itemFromTexture(x.tex); if (x.mapType) it.mapType = x.mapType; items.push(it); } }
      const label = src.kind === 'material' ? S.get(src.id).name : src.kind === 'project' ? S.get(src.id).name : src.kind === 'collection' ? S.get(src.id).name : (L.length === 1 ? L[0].tex.name : L.length + ' textures');
      o.zipName = label + '_' + o.format;
      lastResult = await runExport(items, o, { label, productId });
      toast(`Exported ${lastResult.files.length} file(s)`, lastResult.errors.length ? 'warn' : 'ok'); drawLeft(); drawRight();
    } catch (e) { toast('Export failed: ' + e.message, 'bad', 7000); S.err('Export', e); }
  }
  if (!src.ids?.length && src.kind === 'texture' && !arg) { const r = S.recent('texture')[0]; if (r) src.ids = [r.id]; }
  drawRight(); drawLeft();
  return {};
}
