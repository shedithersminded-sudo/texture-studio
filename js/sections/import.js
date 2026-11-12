import { h, add, icon, clear, toast, task, pickFiles, fmtBytes, select, slider } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { decodeFile, IMPORT_ACCEPT, resize, getData, fromData } from '../core/img.js';
import { projectOptions, helpLink } from '../core/widgets.js';
import { RES_PRESETS } from './generate.js';

const MAX_BYTES = 512 * 1048576;
export default function (el) {
  const items = []; let defProject = '', defCategory = '';
  const list = h('div', { style: { display: 'grid', gap: '12px' } });
  const drop = h('div', { class: 'drop' }, icon('upload'), h('h3', { style: { margin: '8px 0 4px' } }, 'Drop texture files here'), h('div', null, 'PNG, JPG, WEBP, TIFF, BMP, TGA, EXR, HDR, PSD. Multiple files are fine.'), h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn pri', onclick: async () => add(await pickFiles({ accept: IMPORT_ACCEPT })) }, 'Choose files')));
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); };
  const bar = h('div', { class: 'row wrap', style: { margin: '14px 0' } });
  el.append(h('div', { class: 'page' }, h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Import Center'), h('div', { class: 'sub' }, 'Every file is analyzed before import. Originals are stored untouched and never overwritten without your permission.')), h('div', { class: 'act' }, helpLink('formats', 'Which format to choose'))), drop, bar, list));
  const drawBar = () => {
    clear(bar); const pending = items.filter(i => i.state === 'ready');
    bar.append(select('Default project', projectOptions(), defProject, v => { defProject = v; items.forEach(i => { if (i.state === 'ready') i.project = v; }); draw(); }), select('Default category', [['', 'Unsorted'], ...S.categories()], defCategory, v => { defCategory = v; items.forEach(i => { if (i.state === 'ready') i.category = v; }); draw(); }),
      h('span', { class: 'grow' }), items.length ? h('span', { class: 'muted' }, `${items.length} file(s), ${pending.length} ready`) : null,
      h('button', { class: 'btn pri', disabled: !pending.length, onclick: importAll }, icon('download'), 'Import all ready'), items.length ? h('button', { class: 'btn', onclick: () => { items.splice(0); draw(); } }, 'Clear list') : null);
  };
  async function add(files) {
    for (const f of files) {
      const it = { file: f, name: f.name.replace(/\.[^.]+$/, ''), state: 'reading', project: defProject, category: defCategory, tags: '', resize: 'none', exposure: 0 }; items.push(it); draw();
      if (f.size > MAX_BYTES) { it.state = 'error'; it.error = 'File is larger than 512 MB.'; draw(); continue; }
      await analyze(it);
    }
  }
  async function analyze(it) {
    const t = task('Analyzing ' + it.file.name);
    try { const r = await decodeFile(it.file, { exposure: it.exposure }); it.canvas = r.canvas; it.info = r.info; it.bytes = r.bytes; it.thumb = S.thumbOf(r.canvas, 240); it.state = 'ready'; t.done(); }
    catch (e) { it.state = 'error'; it.error = e.message; t.fail(e); S.log('import', 'Rejected ' + it.file.name + ': ' + e.message, 'warn'); }
    draw();
  }
  async function importOne(it) {
    const t = task('Importing ' + it.name);
    try {
      const i = it.info; const tags = it.tags.split(',').map(s => s.trim()).filter(Boolean);
      const orig = await S.saveTexture(it.canvas, { name: it.name, kind: 'original', projectId: it.project || null, category: it.category || null, tags, format: i.format, bitDepth: i.bits, colorProfile: i.colorProfile, hasAlpha: i.hasAlpha, alphaKind: i.alphaKind, dpi: i.dpi, sourceFile: it.file.name, sourceSize: it.file.size, importInfo: i, folder: it.project ? null : '03_TEXTURE_LIBRARY/' + libFolder(it.category) });
      const ob = 'orig_' + orig.id; await S.putBlob(ob, new Blob([it.bytes], { type: it.file.type || 'application/octet-stream' })); orig.originalBlobId = ob; await S.save(orig);
      let last = orig;
      if (it.resize !== 'none') {
        const [w, hh] = it.resize.split('x').map(Number); const c = resize(it.canvas, w, hh);
        last = await S.saveTexture(c, { name: it.name, kind: 'edited', parentId: orig.id, version: 2, projectId: orig.projectId, category: orig.category, tags, format: 'PNG', description: `Resized from ${i.width}x${i.height} on import` });
      }
      await S.log('activity', `Imported "${it.name}" (${i.format} ${i.width}x${i.height})`, 'info', { ref: orig.id });
      it.state = 'done'; it.id = last.id; t.done();
    } catch (e) { it.state = 'error'; it.error = e.message; t.fail(e); S.err('Import', e); }
  }
  async function importAll() { for (const it of items.filter(i => i.state === 'ready')) { await importOne(it); draw(); } toast('Import finished', 'ok'); }
  function row(k, v, warn) { return v == null || v === '' ? null : h('tr', null, h('td', { class: 'muted small', style: { width: '120px' } }, k), h('td', { style: warn ? { color: 'var(--warn)' } : null }, String(v))); }
  function draw() {
    drawBar(); clear(list);
    for (const it of items) {
      const i = it.info;
      const head = h('div', { class: 'row' }, h('b', null, it.file.name), h('span', { class: 'badge' }, fmtBytes(it.file.size)), it.state === 'error' ? h('span', { class: 'badge bad' }, 'Rejected') : it.state === 'done' ? h('span', { class: 'badge ok' }, 'Imported') : it.state === 'reading' ? h('span', { class: 'badge info' }, 'Analyzing') : h('span', { class: 'badge acc' }, 'Ready'),
        h('span', { class: 'grow' }), h('button', { class: 'btn ghost icon', title: 'Remove from list', onclick: () => { items.splice(items.indexOf(it), 1); draw(); } }, icon('x')));
      if (it.state === 'error') { list.append(h('div', { class: 'card tight' }, head, h('div', { class: 'callout bad' }, it.error))); continue; }
      if (!i) { list.append(h('div', { class: 'card tight' }, head)); continue; }
      const sizes = [['none', `Keep ${i.width} x ${i.height}`], ...RES_PRESETS.filter(r => r <= 8192).map(r => [r + 'x' + Math.round(r * i.height / i.width), `${r} x ${Math.round(r * i.height / i.width)}`])];
      const info = h('table', { class: 't', style: { fontSize: '12px' } }, h('tbody', null,
        row('Dimensions', `${i.width} x ${i.height} px` + (i.pow2 ? ' (power of two)' : '')), row('Format', i.format + (i.compression ? ' . ' + i.compression : '')), row('Color profile', i.colorProfile), row('Color type', i.colorType + ' . ' + i.channels + ' channel(s)' + (i.gray ? ' . looks grayscale' : '')),
        row('Bit depth', i.bits != null ? i.bits + ' bits per channel' : 'Not reported'), row('Transparency', i.hasAlpha ? 'Yes, ' + i.alphaKind : 'No (fully opaque)'), row('DPI metadata', i.dpi ? i.dpi + ' dpi' : 'None'),
        row('Tiling check', i.seam.seamless ? 'Edges appear to match (likely seamless)' : 'Visible seam likely at the edges', !i.seam.seamless), ...i.notes.map(n => row('Note', n, true))));
      const ctrls = it.state === 'done' ? h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => nav.go('editor', it.id) }, icon('brush'), 'Edit'), h('button', { class: 'btn sm', onclick: () => { nav.handoff.pbrFrom = { textureId: it.id }; nav.go('pbr', 'new'); } }, icon('layers'), 'Make PBR material'), h('button', { class: 'btn sm', onclick: () => nav.go('library', it.id) }, icon('library'), 'View in library'))
        : h('div', null, h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Name'), h('input', { type: 'text', value: it.name, oninput: e => it.name = e.target.value })), h('div', { class: 'f' }, h('label', null, 'Tags (comma separated)'), h('input', { type: 'text', value: it.tags, oninput: e => it.tags = e.target.value }))),
          h('div', { class: 'g3' }, select('Project', projectOptions(), it.project, v => it.project = v), select('Category', [['', 'Unsorted'], ...S.categories()], it.category, v => it.category = v), select('Also save a resized version', sizes, it.resize, v => it.resize = v, 'The original stays at full size. A resized copy is saved as version 2.')),
          i.hdr ? slider('HDR exposure for the 8-bit working copy', it.exposure, -6, 6, 0.25, v => { it.exposure = v; clearTimeout(it.et); it.et = setTimeout(() => analyze(it), 300); }) : null,
          h('button', { class: 'btn pri sm', onclick: async () => { await importOne(it); draw(); } }, 'Import this file'));
      list.append(h('div', { class: 'card tight' }, head, h('div', { class: 'split', style: { '--a': '180px minmax(0,1fr)', '--b': 'minmax(0,1.2fr)', marginTop: '10px', gap: '14px' } }, h('div', { class: 'tile', style: { cursor: 'default' } }, h('div', { class: 'im' }, h('img', { src: it.thumb }))), info, ctrls)));
    }
  }
  draw();
  if (nav.handoff.importFiles) { const f = nav.handoff.importFiles; nav.handoff.importFiles = null; add(f); }
}
export function libFolder(cat) {
  const map = { Wood: 'Wood', Metal: 'Metal', Rust: 'Metal', 'Industrial materials': 'Metal', Stone: 'Stone', Marble: 'Stone', Granite: 'Stone', Brick: 'Stone', Concrete: 'Concrete', Asphalt: 'Concrete', Fabric: 'Fabric', Cloth: 'Fabric', Leather: 'Leather', Glass: 'Glass', Ice: 'Glass', Plastic: 'Plastic', Rubber: 'Plastic', 'Carbon fiber': 'Plastic', Grass: 'Nature', Leaves: 'Nature', Water: 'Nature', Snow: 'Nature', Sand: 'Nature', Soil: 'Organic', Dirt: 'Organic', Paper: 'Organic', 'Sci-fi materials': 'SciFi', 'Fantasy materials': 'Fantasy' };
  return map[cat] || 'Custom';
}
