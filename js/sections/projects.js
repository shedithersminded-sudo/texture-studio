import { h, icon, clear, select, toast, modal, confirmDlg, promptDlg, fmtDate, fmtDT, tabs, slider } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { tile, quickProject, statusBadge, STATUS_COLORS } from '../core/widgets.js';

export const PROJECT_STATUSES = ['Idea', 'Planning', 'In Production', 'Editing', 'Quality Check', 'Complete', 'On Hold'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const PCOL = { Low: 'var(--dim)', Normal: 'var(--info)', High: 'var(--warn)', Urgent: 'var(--bad)' };

export default function (el, arg) {
  const page = h('div', { class: 'page' }); el.append(page);
  if (arg && S.get(arg)?.type === 'project') return projectPage(page, S.get(arg));
  let view = 'table', F = { q: '', cat: '', status: '', archived: false };
  const body = h('div');
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Project Manager'), h('div', { class: 'sub' }, 'Every project has the same layout: originals, generated, edited, materials, previews, exports.')),
    h('div', { class: 'act' }, h('button', { class: 'btn pri', onclick: async () => { const p = await newProjectDialog(); if (p) nav.go('projects', p.id); } }, icon('plus'), 'New project'))), body);
  const draw = () => {
    clear(body);
    body.append(h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('input', { type: 'search', placeholder: 'Search projects', value: F.q, oninput: e => { F.q = e.target.value; drawList(); } }),
      select(null, [['', 'All categories'], ...S.PROJECT_CATEGORIES.map(c => [c, c.replace(/_/g, ' ')])], F.cat, v => { F.cat = v; drawList(); }), select(null, [['', 'All statuses'], ...PROJECT_STATUSES], F.status, v => { F.status = v; drawList(); }),
      h('label', { class: 'chk', style: { margin: 0 } }, h('input', { type: 'checkbox', checked: F.archived, onchange: e => { F.archived = e.target.checked; drawList(); } }), 'Show archived'), h('span', { class: 'grow' }),
      ['table', 'board'].map(v => h('button', { class: 'btn sm' + (view === v ? ' on' : ''), onclick: () => { view = v; draw(); } }, v === 'table' ? 'Table' : 'Status board'))), listEl);
    drawList();
  };
  const listEl = h('div');
  const filtered = () => S.all('project', p => !!p.archived === F.archived && (!F.cat || p.category === F.cat) && (!F.status || p.status === F.status) && (!F.q || (p.name + ' ' + p.description + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(F.q.toLowerCase()))).sort((a, b) => b.modified - a.modified);
  function drawList() {
    clear(listEl); const list = filtered();
    if (!list.length) return listEl.append(h('div', { class: 'empty' }, F.archived ? 'No archived projects.' : 'No projects yet. Create one to keep textures, materials and exports together.'));
    if (view === 'board') { listEl.append(h('div', { class: 'kanban' }, PROJECT_STATUSES.map(st => { const col = list.filter(p => p.status === st); return h('div', { class: 'col', ondragover: e => e.preventDefault(), ondrop: async e => { const p = S.get(e.dataTransfer.getData('text')); if (p) { p.status = st; await S.save(p); S.log('activity', `Project "${p.name}" moved to ${st}`, 'info', { ref: p.id }); drawList(); } } }, h('h4', null, st, h('span', null, col.length)), col.map(p => h('div', { class: 'kc', draggable: true, ondragstart: e => e.dataTransfer.setData('text', p.id), onclick: () => nav.go('projects', p.id) }, h('b', null, p.name), h('div', { class: 'small muted' }, p.category.replace(/_/g, ' ')), h('div', { class: 'row small' }, h('span', { style: { color: PCOL[p.priority] } }, p.priority), p.deadline ? h('span', { class: 'muted' }, 'Due ' + fmtDate(p.deadline)) : null), h('div', { class: 'prog', style: { marginTop: '6px' } }, h('i', { style: { width: (p.progress || 0) + '%' } }))))); }))); return; }
    listEl.append(h('table', { class: 't' }, h('thead', null, h('tr', null, ['', 'Project', 'Category', 'Status', 'Priority', 'Progress', 'Deadline', 'Items', 'Modified', ''].map(x => h('th', null, x)))), h('tbody', null, list.map(p => {
      const items = S.liveTextures(t => t.projectId === p.id); const cover = items[0];
      return h('tr', { style: { cursor: 'pointer' }, onclick: e => { if (!e.target.closest('button')) nav.go('projects', p.id); } }, h('td', { style: { width: '44px' } }, cover ? h('img', { src: cover.thumb, style: { width: '36px', height: '36px', borderRadius: '5px', objectFit: 'cover' } }) : icon('folder')), h('td', null, h('b', null, p.name), p.description ? h('div', { class: 'small muted' }, p.description.slice(0, 80)) : null), h('td', { class: 'small' }, p.category.replace(/_/g, ' ')), h('td', null, statusBadge(p.status)), h('td', { style: { color: PCOL[p.priority] } }, p.priority), h('td', { style: { width: '120px' } }, h('div', { class: 'prog' }, h('i', { style: { width: (p.progress || 0) + '%' } })), h('span', { class: 'small muted' }, (p.progress || 0) + '%')), h('td', { class: 'small', style: { color: p.deadline && p.deadline < Date.now() && p.status !== 'Complete' ? 'var(--bad)' : null } }, p.deadline ? fmtDate(p.deadline) : '-'), h('td', null, items.length), h('td', { class: 'small muted' }, fmtDate(p.modified)),
        h('td', null, h('button', { class: 'btn ghost sm', title: 'Duplicate', onclick: () => duplicateProject(p).then(drawList) }, icon('copy')), h('button', { class: 'btn ghost sm', title: p.archived ? 'Restore' : 'Archive', onclick: async () => { p.archived = !p.archived; await S.save(p); S.log('activity', (p.archived ? 'Archived' : 'Restored') + ' project "' + p.name + '"'); drawList(); } }, icon(p.archived ? 'restore' : 'archive'))));
    }))));
  }
  draw();
}
export async function newProjectDialog() {
  const f = { name: 'New Texture Project', category: 'Game_Assets', priority: 'Normal', description: '' };
  const ok = await modal({ title: 'New project', body: h('div', null, h('div', { class: 'f' }, h('label', null, 'Name'), h('input', { type: 'text', value: f.name, oninput: e => f.name = e.target.value })), h('div', { class: 'g2' }, select('Category', S.PROJECT_CATEGORIES.map(c => [c, c.replace(/_/g, ' ')]), f.category, v => f.category = v), select('Priority', PRIORITIES, f.priority, v => f.priority = v)), h('div', { class: 'f' }, h('label', null, 'Description'), h('textarea', { rows: 2, oninput: e => f.description = e.target.value }))), actions: [{ label: 'Cancel', value: false }, { label: 'Create project', cls: 'pri', value: true }] });
  if (!ok || !f.name.trim()) return null;
  const p = await S.save({ type: 'project', name: f.name.trim(), category: f.category, priority: f.priority, description: f.description, status: 'Planning', progress: 0, tags: [], notes: '' });
  await S.log('activity', 'Created project "' + p.name + '"', 'info', { ref: p.id }); return p;
}
async function duplicateProject(p) {
  const { id, created, modified, ...rest } = p; const n = await S.save({ ...rest, name: p.name + ' copy', archived: false });
  for (const t of S.liveTextures(t => t.projectId === p.id && !t.materialId)) { const c = await S.textureCanvas(t); const { id: _i, blobId, created: _c, modified: _m, doc, originalBlobId, ...r } = t; await S.saveTexture(c, { ...r, projectId: n.id, folder: null }); }
  toast('Project duplicated (textures copied; materials can be rebuilt from them)', 'ok'); return n;
}

function projectPage(page, p) {
  nav.crumbs('Studio', 'Project Manager', p.name); S.touchRecent('project', p.id);
  let tab = 'Original_Images';
  const save = async () => { await S.save(p); };
  const head = h('div'); const content = h('div');
  page.append(head, content);
  function drawHead() {
    clear(head);
    head.append(h('div', { class: 'ph' }, h('button', { class: 'btn ghost', onclick: () => nav.go('projects') }, icon('right', 'flip'), 'Projects'),
      h('h1', { style: { cursor: 'text' }, title: 'Click to rename', onclick: async () => { const n = await promptDlg('Project name', p.name, { title: 'Rename project' }); if (n) { p.name = n.trim(); await save(); S.log('activity', 'Renamed project to "' + p.name + '"'); drawHead(); } } }, p.name), statusBadge(p.status), p.archived ? h('span', { class: 'badge warn' }, 'Archived') : null,
      h('div', { class: 'act' }, h('button', { class: 'btn', onclick: () => { nav.handoff.genProject = p.id; nav.go('generate'); } }, icon('wand'), 'Generate'), h('button', { class: 'btn', onclick: () => nav.go('import') }, icon('upload'), 'Import'), h('button', { class: 'btn', onclick: () => nav.go('export', 'proj:' + p.id) }, icon('download'), 'Export project'),
        h('button', { class: 'btn', onclick: () => nav.go('business', 'newFromProject:' + p.id) }, icon('briefcase'), 'Turn into product'),
        h('button', { class: 'btn', onclick: async () => { p.archived = !p.archived; await save(); drawHead(); } }, icon(p.archived ? 'restore' : 'archive'), p.archived ? 'Restore' : 'Archive'),
        h('button', { class: 'btn danger', onclick: async () => { const n = S.liveTextures(t => t.projectId === p.id).length; if (!(await confirmDlg(`Delete project "${p.name}"? Its ${n} texture(s) move to the trash and can be restored from the Library.`, { danger: true, ok: 'Delete project' }))) return; for (const t of S.liveTextures(t => t.projectId === p.id)) await S.trashTexture(t); await S.remove(p.id); S.log('activity', 'Deleted project "' + p.name + '"', 'warn'); nav.go('projects'); } }, icon('trash')))));
    head.append(h('div', { class: 'card', style: { marginBottom: '14px' } }, h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '10px' } },
      select('Category', S.PROJECT_CATEGORIES.map(c => [c, c.replace(/_/g, ' ')]), p.category, async v => { const old = S.projectPath(p); p.category = v; await save(); await refolder(old); drawHead(); }),
      select('Status', PROJECT_STATUSES, p.status, async v => { p.status = v; await save(); S.log('activity', `Project "${p.name}" set to ${v}`, 'info', { ref: p.id }); drawHead(); }),
      select('Priority', PRIORITIES, p.priority, async v => { p.priority = v; await save(); }),
      h('div', { class: 'f' }, h('label', null, 'Deadline'), h('input', { type: 'date', value: p.deadline ? new Date(p.deadline).toISOString().slice(0, 10) : '', onchange: async e => { p.deadline = e.target.value ? new Date(e.target.value).getTime() : null; await save(); } })),
      slider('Completion', p.progress || 0, 0, 100, 5, v => { p.progress = v; clearTimeout(p._t); p._t = setTimeout(save, 400); }),
      h('div', { class: 'f' }, h('label', null, 'Tags'), h('input', { type: 'text', value: (p.tags || []).join(', '), onchange: async e => { p.tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean); await save(); } }))),
      h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Description'), h('textarea', { rows: 3, onchange: async e => { p.description = e.target.value; await save(); } }, p.description || '')), h('div', { class: 'f' }, h('label', null, 'Notes'), h('textarea', { rows: 3, onchange: async e => { p.notes = e.target.value; await save(); } }, p.notes || ''))),
      h('div', { class: 'small dim' }, 'Location: ' + S.projectPath(p) + '/  .  Created ' + fmtDate(p.created))));
  }
  async function refolder(old) { const nw = S.projectPath(p); for (const t of S.all('texture', t => t.projectId === p.id && t.folder?.startsWith(old))) { t.folder = nw + t.folder.slice(old.length); await S.save(t, { touch: false }); } }
  function drawContent() {
    clear(content);
    const tex = S.liveTextures(t => t.projectId === p.id); const mats = S.all('material', m => m.projectId === p.id); const exps = S.all('exportlog', e => e.name === p.name || (e.paths || []).some(x => x.includes(S.safeName(p.name))));
    const counts = { Original_Images: tex.filter(t => t.kind === 'original').length, Generated_Textures: tex.filter(t => t.kind === 'generated').length, Edited_Textures: tex.filter(t => t.kind === 'edited').length, Materials: mats.length, Previews: tex.filter(t => t.kind === 'preview').length, Exports: exps.length, History: null };
    content.append(tabs(Object.keys(counts).map(k => [k, k.replace(/_/g, ' ') + (counts[k] != null ? ' (' + counts[k] + ')' : '')]), tab, k => { tab = k; drawContent(); }));
    const grid = list => list.length ? h('div', { class: 'tgrid' }, list.map(t => tile(t, { onclick: () => nav.go('library', t.id) }))) : h('div', { class: 'empty' }, 'Nothing here yet.');
    if (tab === 'Original_Images') content.append(grid(tex.filter(t => t.kind === 'original')));
    else if (tab === 'Generated_Textures') content.append(grid(tex.filter(t => t.kind === 'generated')));
    else if (tab === 'Edited_Textures') content.append(grid(tex.filter(t => t.kind === 'edited')));
    else if (tab === 'Previews') content.append(grid(tex.filter(t => t.kind === 'preview')));
    else if (tab === 'Materials') content.append(mats.length ? h('div', { class: 'tgrid' }, mats.map(m => { const b = S.get(m.maps?.baseColor); return h('div', { class: 'tile', onclick: () => nav.go('pbr', m.id) }, h('div', { class: 'im' }, b ? h('img', { src: b.thumb }) : null), h('div', { class: 'meta' }, h('div', { class: 'nm' }, m.name), h('div', { class: 'sm' }, Object.keys(m.maps || {}).map(k => h('span', null, k))))); })) : h('div', { class: 'empty' }, 'No materials. Open a texture and choose Make material.'));
    else if (tab === 'Exports') content.append(exps.length ? h('table', { class: 't' }, h('tbody', null, exps.map(e => h('tr', null, h('td', null, e.ok ? icon('check') : icon('x')), h('td', null, e.name), h('td', null, e.format), h('td', null, e.files + ' files'), h('td', { class: 'muted' }, e.where), h('td', { class: 'muted' }, fmtDT(e.created)))))) : h('div', { class: 'empty' }, 'No exports yet.'));
    else { const ids = new Set([p.id, ...tex.map(t => t.id), ...mats.map(m => m.id)]); const logs = S.all('log', l => l.kind === 'activity' && (ids.has(l.ref) || l.msg.includes(p.name))).sort((a, b) => b.created - a.created); content.append(logs.length ? h('div', null, logs.map(l => h('div', { class: 'row small', style: { padding: '4px 0', borderBottom: '1px solid var(--line)' } }, h('span', { class: 'muted', style: { width: '140px' } }, fmtDT(l.created)), l.msg))) : h('div', { class: 'empty' }, 'No history yet.')); }
  }
  drawHead(); drawContent();
}
