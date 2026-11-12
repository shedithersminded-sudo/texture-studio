import { h, icon, clear, select, toast, modal, confirmDlg, promptDlg, fmtBytes, fmtDate, fmtDT, debounce, download, badge } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { tile, compareView, projectOptions } from '../core/widgets.js';

export function parseTree(text) {
  const root = { name: '', path: '', kids: [] }; const stack = [{ node: root, ind: -1 }];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue; const ind = line.match(/^\s*/)[0].length; const name = line.trim().replace(/\/$/, '');
    while (stack.length > 1 && stack.at(-1).ind >= ind) stack.pop();
    const parent = stack.at(-1).node; const node = { name, path: parent.path ? parent.path + '/' + name : name, kids: [] }; parent.kids.push(node); stack.push({ node, ind });
  }
  const top = root.kids[0]; if (top && top.kids.length && /STUDIO/i.test(top.name)) { const strip = n => ({ ...n, path: n.path.split('/').slice(1).join('/'), kids: n.kids.map(strip) }); return top.kids.map(strip); }
  return root.kids;
}
export const texPath = t => t.folder || S.defaultFolder(t.kind, t.projectId, t.materialName);

export default function (el, arg) {
  const st = S.settings();
  const F = { q: '', cat: '', fmt: '', kind: 'nomaps', size: '', from: '', to: '', tag: '', fav: false, folder: '', col: '', smart: '', sort: 'modified', dir: -1, trash: false };
  let selected = new Set(), tw = 170;
  if (arg === 'trash') F.trash = true; else if (arg?.startsWith('col:')) F.col = arg.slice(4); else if (arg === 'collections') F.smart = 'collections';
  const side = h('div', { class: 'tree', style: { width: '250px', flex: 'none', overflow: 'auto', maxHeight: 'calc(100vh - 140px)', position: 'sticky', top: '0' } });
  const main = h('div', { style: { flex: 1, minWidth: 0 } });
  el.append(h('div', { class: 'page', style: { maxWidth: 'none' } }, h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Texture Library'), h('div', { class: 'sub' }, 'Every texture, map, render and version in one place.')), h('div', { class: 'act' }, h('button', { class: 'btn', onclick: () => nav.go('import') }, icon('upload'), 'Import'), h('button', { class: 'btn', onclick: () => nav.go('generate') }, icon('wand'), 'Generate'))), h('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start' } }, side, main)));

  const filtered = () => {
    const q = F.q.toLowerCase(); const col = F.col && S.get(F.col);
    let list = S.all('texture', t => F.trash ? !!t.deleted : !t.deleted);
    list = list.filter(t => (!q || [t.name, t.description, t.category, (t.tags || []).join(' '), t.sourceFile, t.format].join(' ').toLowerCase().includes(q))
      && (!F.cat || t.category === F.cat) && (!F.fmt || t.format === F.fmt) && (F.trash || !F.kind || (F.kind === 'nomaps' ? t.kind !== 'map' : t.kind === F.kind)) && (!F.tag || (t.tags || []).includes(F.tag)) && (!F.fav || t.favorite)
      && (!F.size || (F.size === 'other' ? ![256, 512, 1024, 2048, 4096, 8192].includes(Math.max(t.width, t.height)) : Math.max(t.width, t.height) === +F.size))
      && (!F.from || t.created >= new Date(F.from).getTime()) && (!F.to || t.created <= new Date(F.to).getTime() + 86400000)
      && (!F.folder || texPath(t) === F.folder || texPath(t).startsWith(F.folder + '/')) && (!col || (col.items || []).includes(t.id)));
    if (F.smart === 'recentOpen') { const r = S.recent('texture').map(t => t.id); list = list.filter(t => r.includes(t.id)).sort((a, b) => r.indexOf(a.id) - r.indexOf(b.id)); return list; }
    if (F.smart === 'recentExport') { const names = new Set(S.all('exportlog').flatMap(e => e.paths || []).map(p => p.split('/').pop().split('.')[0].toLowerCase())); list = list.filter(t => [...names].some(n => n.includes(S.safeName(t.name).toLowerCase()))); }
    const key = { name: t => t.name.toLowerCase(), modified: t => t.modified, created: t => t.created, size: t => t.size || 0, format: t => t.format, resolution: t => t.width * t.height, category: t => t.category || '' }[F.sort];
    return list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * F.dir);
  };
  function drawSide() {
    clear(side); const all = S.liveTextures(); const count = p => all.filter(t => texPath(t) === p || texPath(t).startsWith(p + '/')).length;
    const node = (label, on, fn, ic = 'folder', cnt) => h('div', { class: 'node' + (on ? ' on' : ''), onclick: fn }, icon(ic), label, cnt != null ? h('span', { class: 'cnt' }, cnt) : null);
    const reset = () => Object.assign(F, { folder: '', col: '', smart: '', fav: false, trash: false });
    side.append(h('h4', null, 'Smart views'),
      node('All textures', !F.folder && !F.col && !F.smart && !F.fav && !F.trash, () => { reset(); draw(); }, 'grid', all.length),
      node('Favorites', F.fav, () => { reset(); F.fav = true; draw(); }, 'star', all.filter(t => t.favorite).length),
      node('Recently opened', F.smart === 'recentOpen', () => { reset(); F.smart = 'recentOpen'; draw(); }, 'restore'),
      node('Recently modified', F.smart === 'recentMod', () => { reset(); F.smart = 'recentMod'; F.sort = 'modified'; F.dir = -1; draw(); }, 'edit'),
      node('Recently exported', F.smart === 'recentExport', () => { reset(); F.smart = 'recentExport'; draw(); }, 'download'),
      node('Trash', F.trash, () => { reset(); F.trash = true; draw(); }, 'trash', S.all('texture', t => t.deleted).length));
    side.append(h('h4', { style: { marginTop: '14px', display: 'flex' } }, 'Collections', h('button', { class: 'btn ghost sm', style: { marginLeft: 'auto' }, onclick: newCollection }, icon('plus'))));
    for (const c of S.all('collection')) side.append(h('div', { class: 'node' + (F.col === c.id ? ' on' : ''), onclick: () => { reset(); F.col = c.id; draw(); } }, icon('folder'), c.name, h('span', { class: 'cnt' }, (c.items || []).length)));
    if (st.savedSearches?.length) { side.append(h('h4', { style: { marginTop: '14px' } }, 'Saved searches')); st.savedSearches.forEach((s, i) => side.append(h('div', { class: 'node', onclick: () => { Object.assign(F, s.f); draw(); } }, icon('search'), s.name, h('button', { class: 'btn ghost sm', style: { marginLeft: 'auto' }, onclick: e => { e.stopPropagation(); st.savedSearches.splice(i, 1); S.save(st); drawSide(); } }, icon('x'))))); }
    side.append(h('h4', { style: { marginTop: '14px', display: 'flex' } }, 'Folders', h('button', { class: 'btn ghost sm', style: { marginLeft: 'auto' }, title: 'New folder inside the selected folder', onclick: newFolder }, icon('plus'))));
    const tree = parseTree(st.structure); const extra = [...new Set(all.map(texPath))];
    const rec = (n, depth) => { const c = count(n.path); const el = h('div', null, node(n.name.replace(/_/g, ' '), F.folder === n.path, () => { reset(); F.folder = n.path; draw(); }, 'folder', c || null)); const kids = [...n.kids, ...extra.filter(p => p.startsWith(n.path + '/') && p.split('/').length === n.path.split('/').length + 1 && !n.kids.some(k => k.path === p)).map(p => ({ name: p.split('/').pop(), path: p, kids: [] }))]; if (kids.length && (depth < 1 || F.folder.startsWith(n.path))) el.append(h('div', { class: 'kids' }, kids.map(k => rec(k, depth + 1)))); return el; };
    tree.forEach(n => side.append(rec(n, 0)));
  }
  function drawMain() {
    clear(main); const list = filtered();
    const sizes = [['', 'Any size'], ...[256, 512, 1024, 2048, 4096, 8192].map(s => [s, s + ' px']), ['other', 'Other']];
    const formats = [['', 'Any format'], ...[...new Set(S.all('texture').map(t => t.format))].map(f => [f, f])];
    const tags = [['', 'Any tag'], ...[...new Set(S.all('texture').flatMap(t => t.tags || []))].sort().map(t => [t, t])];
    const searchIn = h('input', { type: 'search', placeholder: 'Search by filename, tag, description', value: F.q, style: { flex: 1, minWidth: '200px' }, oninput: debounce(e => { F.q = e.target.value; drawGrid(); }, 150) });
    main.append(h('div', { class: 'row wrap', style: { marginBottom: '8px' } }, searchIn,
      select(null, [['', 'All categories'], ...S.categories()], F.cat, v => { F.cat = v; drawMain(); }), select(null, formats, F.fmt, v => { F.fmt = v; drawMain(); }), select(null, sizes, F.size, v => { F.size = v; drawMain(); }),
      select(null, [['nomaps', 'Textures and renders'], ['', 'Everything incl. maps'], ['original', 'Originals'], ['generated', 'Generated'], ['edited', 'Edited'], ['map', 'Material maps'], ['preview', 'Previews']], F.kind, v => { F.kind = v; drawMain(); }), select(null, tags, F.tag, v => { F.tag = v; drawMain(); })),
      h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('span', { class: 'small muted' }, 'Created'), h('input', { type: 'date', value: F.from, onchange: e => { F.from = e.target.value; drawMain(); } }), h('span', { class: 'small muted' }, 'to'), h('input', { type: 'date', value: F.to, onchange: e => { F.to = e.target.value; drawMain(); } }),
        h('span', { class: 'small muted', style: { marginLeft: '10px' } }, 'Sort'), select(null, [['modified', 'Date modified'], ['created', 'Date created'], ['name', 'Name'], ['size', 'File size'], ['format', 'Format'], ['resolution', 'Resolution'], ['category', 'Material category']], F.sort, v => { F.sort = v; drawGrid(); }),
        h('button', { class: 'btn sm', onclick: () => { F.dir *= -1; drawMain(); } }, F.dir < 0 ? 'Descending' : 'Ascending'),
        h('input', { type: 'range', min: 110, max: 280, value: tw, style: { width: '100px' }, title: 'Thumbnail size', oninput: e => { tw = +e.target.value; grid.style.setProperty('--tw', tw + 'px'); } }),
        h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: async () => { const n = await promptDlg('Name this search', F.q || F.cat || 'My search'); if (n) { st.savedSearches.push({ name: n, f: { ...F } }); await S.save(st); drawSide(); } } }, icon('star'), 'Save search')));
    main.append(selBar); drawSelBar();
    const crumb = F.folder ? F.folder.split('/').map(s => s.replace(/_/g, ' ')).join('  /  ') : F.col ? 'Collection: ' + S.get(F.col)?.name : F.trash ? 'Trash. Items here can be restored or deleted permanently.' : '';
    if (crumb) main.append(h('div', { class: 'small muted', style: { marginBottom: '8px' } }, crumb));
    main.append(grid); drawGrid();
  }
  const grid = h('div', { class: 'tgrid' }); const selBar = h('div');
  function drawGrid() {
    clear(grid); grid.style.setProperty('--tw', tw + 'px'); const list = filtered();
    if (!list.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, F.trash ? 'Trash is empty.' : 'No textures match these filters.'));
    for (const t of list) {
      const ck = h('input', { type: 'checkbox', class: 'ck', checked: selected.has(t.id), onclick: e => { e.stopPropagation(); e.target.checked ? selected.add(t.id) : selected.delete(t.id); drawSelBar(); } });
      grid.append(tile(t, { check: ck, selected: selected.has(t.id), onclick: e => { if (e.shiftKey || e.ctrlKey || selected.size) { selected.has(t.id) ? selected.delete(t.id) : selected.add(t.id); drawGrid(); drawSelBar(); } else detail(t); }, extra: [h('span', null, t.kind), t.estimated ? h('span', { style: { color: 'var(--warn)' } }, 'est.') : null] }));
    }
  }
  function drawSelBar() {
    clear(selBar); if (!selected.size) return; const ids = [...selected];
    const act = (l, f, cls = '') => h('button', { class: 'btn sm ' + cls, onclick: f }, l);
    selBar.append(h('div', { class: 'card tight row wrap', style: { marginBottom: '10px' } }, h('b', null, ids.length + ' selected'),
      ...(F.trash ? [act('Restore', async () => { for (const id of ids) { const t = S.get(id); delete t.deleted; await S.save(t); } selected.clear(); draw(); toast('Restored', 'ok'); }), act('Delete permanently', async () => { if (!(await confirmDlg(`Permanently delete ${ids.length} texture(s)? This cannot be undone.`, { danger: true, ok: 'Delete forever' }))) return; for (const id of ids) await S.purgeTexture(S.get(id)); S.log('activity', 'Permanently deleted ' + ids.length + ' texture(s)', 'warn'); selected.clear(); draw(); }, 'danger')] : [
        act('Add tag', async () => { const tg = await promptDlg('Tag to add'); if (!tg) return; for (const id of ids) { const t = S.get(id); t.tags = [...new Set([...(t.tags || []), tg.trim()])]; await S.save(t); } draw(); }),
        act('Set category', async () => { const c = await modal({ title: 'Set category', body: h('div', null, 'Choose a material category'), actions: S.categories().slice(0, 40).map(c => ({ label: c, value: c })) }); if (!c) return; for (const id of ids) { const t = S.get(id); t.category = c; await S.save(t); } draw(); }),
        act('Move to folder', () => moveDialog(ids)), act('Add to collection', () => addToCollection(ids)), act('Export', () => { nav.handoff = nav.handoff || {}; nav.go('export', ids[0]); }),
        ids.length === 2 ? act('Compare', () => compareTwo(S.get(ids[0]), S.get(ids[1]))) : null,
        F.col ? act('Remove from collection', async () => { const c = S.get(F.col); c.items = c.items.filter(i => !ids.includes(i)); await S.save(c); selected.clear(); draw(); }) : null,
        act('Move to trash', async () => { if (!(await confirmDlg(`Move ${ids.length} texture(s) to the trash? You can restore them later.`, { ok: 'Move to trash', danger: true }))) return; for (const id of ids) await S.trashTexture(S.get(id)); selected.clear(); draw(); }, 'danger')]),
      h('span', { class: 'grow' }), act('Clear selection', () => { selected.clear(); draw(); })));
  }
  async function moveDialog(ids, copy = false) {
    const paths = []; const walk = n => { paths.push(n.path); n.kids.forEach(walk); }; parseTree(st.structure).forEach(walk);
    const extra = [...new Set(S.liveTextures().map(texPath))].filter(p => !paths.includes(p)); const sel = h('select', { style: { width: '100%' } }, [...paths, ...extra].sort().map(p => h('option', { value: p }, p)));
    const proj = h('select', { style: { width: '100%' } }, projectOptions('Keep current project').map(([v, l]) => h('option', { value: v }, l)));
    const ok = await modal({ title: copy ? 'Copy to...' : 'Move to folder', body: h('div', null, h('div', { class: 'f' }, h('label', null, 'Folder'), sel), h('div', { class: 'f' }, h('label', null, 'Project'), proj)), actions: [{ label: 'Cancel', value: false }, { label: copy ? 'Copy' : 'Move', cls: 'pri', value: true }] });
    if (!ok) return;
    for (const id of ids) { let t = S.get(id); if (copy) t = await duplicate(t, true); t.folder = sel.value; if (proj.value) t.projectId = proj.value; await S.save(t); }
    S.log('activity', (copy ? 'Copied ' : 'Moved ') + ids.length + ' texture(s) to ' + sel.value); selected.clear(); draw(); toast(copy ? 'Copied' : 'Moved', 'ok');
  }
  async function addToCollection(ids) {
    const cols = S.all('collection'); const c = await modal({ title: 'Add to collection', body: h('p', { class: 'muted' }, 'Pick a collection or create one.'), actions: [...cols.map(c => ({ label: c.name, value: c.id })), { label: 'New collection...', value: '__new', cls: 'pri' }] });
    if (!c) return; let col = c === '__new' ? await newCollection() : S.get(c); if (!col) return;
    col.items = [...new Set([...(col.items || []), ...ids])]; await S.save(col); toast('Added to ' + col.name, 'ok'); drawSide();
  }
  async function newCollection() { const n = await promptDlg('Collection name', 'New collection'); if (!n) return null; const c = await S.save({ type: 'collection', name: n, items: [], description: '' }); drawSide(); return c; }
  async function newFolder() {
    const parent = F.folder || '03_TEXTURE_LIBRARY'; const n = await promptDlg(`New folder inside ${parent}`, 'New_Folder'); if (!n) return;
    const lines = st.structure.split('\n'); const pathParts = parent.split('/'); let depth = 0, idx = 1, ind = 2;
    for (let i = 1; i < lines.length && depth < pathParts.length; i++) { const li = lines[i].match(/^\s*/)[0].length; if (lines[i].trim() === pathParts[depth] && li === (depth + 1) * 2) { depth++; idx = i; ind = li; } }
    if (depth < pathParts.length) { toast('That folder comes from your files, not the structure. Edit the structure in Admin, Organization.', 'warn'); return; }
    let ins = idx + 1; while (ins < lines.length && lines[ins].match(/^\s*/)[0].length > ind) ins++;
    lines.splice(ins, 0, ' '.repeat(ind + 2) + S.safeName(n)); st.structure = lines.join('\n'); await S.save(st); F.folder = parent + '/' + S.safeName(n); draw(); toast('Folder created', 'ok');
  }
  async function duplicate(t, silent) {
    const c = await S.textureCanvas(t); const { id, blobId, created, modified, doc, originalBlobId, ...rest } = t;
    const n = await S.saveTexture(c, { ...rest, name: t.name + ' copy', parentId: null, version: 1, kind: t.kind === 'original' ? 'edited' : t.kind, favorite: false, description: (t.description || '') + (t.description ? ' ' : '') + '(Duplicated from ' + t.name + ')' });
    if (!silent) { toast('Duplicated', 'ok'); draw(); } return n;
  }
  async function compareTwo(a, b) { modal({ title: 'Compare textures', wide: true, body: compareView(await S.blobURL(a.blobId), await S.blobURL(b.blobId), { labels: [a.name + ' v' + (a.version || 1) + ' ' + a.width + 'px', b.name + ' v' + (b.version || 1) + ' ' + b.width + 'px'] }) }); }
  async function detail(t) {
    S.touchRecent('texture', t.id); const url = await S.blobURL(t.blobId); const vers = S.versionsOf(t); const mat = t.materialId && S.get(t.materialId);
    const f = { name: t.name, description: t.description || '', tags: (t.tags || []).join(', '), category: t.category || '', folder: texPath(t), projectId: t.projectId || '' };
    const row = (k, v) => v == null || v === '' ? null : h('tr', null, h('td', { class: 'muted small', style: { width: '120px' } }, k), h('td', null, v));
    const body = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } },
      h('div', null, h('div', { class: 'cmp', style: { aspectRatio: t.width + '/' + t.height, maxHeight: '420px' } }, h('img', { src: url })), h('div', { class: 'row wrap', style: { marginTop: '10px' } },
        h('button', { class: 'btn sm', onclick: () => go('editor', t.id) }, icon('brush'), 'Edit'), h('button', { class: 'btn sm', onclick: () => { nav.handoff.pbrFrom = { textureId: t.id }; go('pbr', 'new'); } }, icon('layers'), 'Make material'), h('button', { class: 'btn sm', onclick: () => go('preview', mat ? mat.id : t.id) }, icon('cube'), '3D'), h('button', { class: 'btn sm', onclick: () => go('export', t.id) }, icon('download'), 'Export'),
        h('button', { class: 'btn sm', onclick: async () => { await duplicate(t); } }, icon('copy'), 'Duplicate'), h('button', { class: 'btn sm', onclick: () => { closeM(); moveDialog([t.id], true); } }, 'Copy to...'),
        t.originalBlobId ? h('button', { class: 'btn sm', onclick: async () => download(await S.getBlob(t.originalBlobId), t.sourceFile || t.name) }, 'Download original file') : null,
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Move "' + t.name + '" to the trash?', { danger: true, ok: 'Move to trash' })) { await S.trashTexture(t); closeM(); draw(); } } }, icon('trash')))),
      h('div', null,
        h('div', { class: 'f' }, h('label', null, 'File name'), h('input', { type: 'text', value: f.name, oninput: e => f.name = e.target.value })),
        h('div', { class: 'f' }, h('label', null, 'Description'), h('textarea', { rows: 2, oninput: e => f.description = e.target.value }, f.description)),
        h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Tags'), h('input', { type: 'text', value: f.tags, oninput: e => f.tags = e.target.value })), select('Category', [['', 'None'], ...S.categories()], f.category, v => f.category = v)),
        select('Project', projectOptions(), f.projectId, v => f.projectId = v),
        h('table', { class: 't', style: { marginTop: '8px' } }, h('tbody', null, row('Dimensions', t.width + ' x ' + t.height + ' px'), row('Stored as', 'PNG, 8-bit per channel (lossless)'), row('Source format', t.format + (t.sourceFile ? ' . ' + t.sourceFile : '')), row('Bit depth (source)', t.bitDepth), row('Color profile', t.colorProfile), row('Transparency', t.hasAlpha != null ? (t.hasAlpha ? 'Yes, ' + t.alphaKind : 'No') : null),
          row('Kind', t.kind + (t.mapType ? ' . ' + t.mapType + ' map' : '') + (t.estimated ? ' (estimated)' : '')), row('Material', mat?.name), row('Folder', texPath(t)), row('Version', 'v' + (t.version || 1)), row('Size', fmtBytes(t.size)), row('Created', fmtDT(t.created)), row('Modified', fmtDT(t.modified)), row('Generated with', t.genParams ? t.genParams.category + ', seed ' + t.genParams.seed : null))),
        h('h4', { style: { marginTop: '12px' } }, 'Version history'), h('div', { style: { maxHeight: '160px', overflow: 'auto' } }, vers.map(v => h('div', { class: 'row small', style: { padding: '3px 0' } }, h('img', { src: v.thumb, style: { width: '26px', height: '26px', borderRadius: '3px' } }), h('b', null, 'v' + (v.version || 1)), v.kind, v.id === t.id ? badge('this one', 'acc') : null, h('span', { class: 'grow' }), h('span', { class: 'muted' }, fmtDT(v.modified)), v.id !== t.id ? [h('button', { class: 'btn ghost sm', onclick: () => compareTwo(v, t) }, 'Compare'), h('button', { class: 'btn ghost sm', onclick: () => { closeM(); detail(v); } }, 'Open')] : null)))));
    let closeM = () => document.querySelector('.modal-bg')?.remove();
    const go = (s, a) => { closeM(); nav.go(s, a); };
    const ok = await modal({ title: t.name, wide: true, body, actions: [{ label: 'Close', value: false }, { label: 'Save details', cls: 'pri', value: true }] });
    if (ok) { Object.assign(t, { name: f.name.trim() || t.name, description: f.description, tags: f.tags.split(',').map(s => s.trim()).filter(Boolean), category: f.category || null, projectId: f.projectId || null }); if (f.projectId && !t.folder?.startsWith('02_PROJECTS')) t.folder = S.defaultFolder(t.kind, t.projectId, t.materialName); await S.save(t); toast('Saved', 'ok'); draw(); }
  }
  const draw = () => { drawSide(); drawMain(); };
  draw();
  if (arg && S.get(arg)?.type === 'texture') detail(S.get(arg));
}
