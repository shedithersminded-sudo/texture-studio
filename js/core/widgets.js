// Shared components used across sections.
import { h, icon, modal, clear, fmtDate, badge, toast, promptDlg } from './ui.js';
import * as S from './store.js';
import { nav } from './nav.js';

// ---- procedural worker client ----
let worker, seq = 0; const pending = new Map();
export function runGen(params, onProgress) {
  if (!worker) {
    worker = new Worker(new URL('../workers/gen.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; if (e.data.progress != null) p.prog?.(e.data.progress); else { pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); } };
    worker.onerror = e => { for (const p of pending.values()) p.rej(new Error(e.message || 'Generator worker failed')); pending.clear(); worker = null; };
  }
  const id = ++seq; return new Promise((res, rej) => { pending.set(id, { res, rej, prog: onProgress }); worker.postMessage({ id, params }); });
}

export function tile(t, { onclick, selected, onfav, check, extra } = {}) {
  const fav = h('button', { class: 'fav' + (t.favorite ? ' on' : ''), title: 'Favorite', onclick: async e => { e.stopPropagation(); t.favorite = !t.favorite; await S.save(t, { touch: false }); fav.classList.toggle('on', t.favorite); onfav?.(t); } }, icon('star'));
  return h('div', { class: 'tile' + (selected ? ' sel' : ''), onclick, title: t.name },
    h('div', { class: 'im' }, t.thumb ? h('img', { src: t.thumb, loading: 'lazy', alt: '' }) : icon('image')), check || null, fav,
    h('div', { class: 'meta' }, h('div', { class: 'nm' }, t.name), h('div', { class: 'sm' }, h('span', null, t.width + 'x' + t.height), h('span', null, t.format), h('span', null, 'v' + (t.version || 1)), t.mapType ? h('span', null, t.mapType) : null, extra || null)));
}

// Modal that lets the owner pick one or more textures.
export function pickTextures({ multiple = false, title = 'Choose a texture', filter } = {}) {
  let q = '', sel = new Set(); const grid = h('div', { class: 'tgrid', style: { '--tw': '130px', maxHeight: '60vh', overflow: 'auto' } });
  const draw = () => {
    clear(grid); const list = S.liveTextures(t => (!filter || filter(t)) && (!q || (t.name + ' ' + (t.category || '')).toLowerCase().includes(q))).sort((a, b) => b.modified - a.modified);
    if (!list.length) grid.append(h('div', { class: 'empty' }, 'No textures yet. Generate or import one first.'));
    for (const t of list) grid.append(tile(t, { selected: sel.has(t.id), onclick: () => { if (!multiple) sel.clear(); sel.has(t.id) ? sel.delete(t.id) : sel.add(t.id); draw(); } }));
  };
  draw();
  return modal({ title, wide: true, body: h('div', null, h('input', { type: 'search', placeholder: 'Filter by name or category', style: { width: '100%', marginBottom: '10px' }, oninput: e => { q = e.target.value.toLowerCase(); draw(); } }), grid), actions: [{ label: 'Cancel', value: null }, { label: multiple ? 'Use selected' : 'Use texture', cls: 'pri', run: () => { if (!sel.size) { toast('Select a texture first', 'warn'); return false; } return multiple ? [...sel].map(S.get) : S.get([...sel][0]); } }] });
}

export function projectOptions(blank = 'No project') { return [['', blank], ...S.all('project', p => !p.archived).sort((a, b) => b.modified - a.modified).map(p => [p.id, p.name])]; }
export async function quickProject(name) {
  name = name ?? await promptDlg('Project name', 'New Texture Project', { title: 'New project' }); if (!name) return null;
  const p = await S.save({ type: 'project', name, category: 'Experimental', status: 'In Production', priority: 'Normal', progress: 0, tags: [], description: '', notes: '' });
  await S.log('activity', 'Created project "' + name + '"', 'info', { ref: p.id }); return p;
}
export const STATUS_COLORS = { 'Idea': '#8c94a3', 'Planning': '#5bb6e8', 'In Production': '#7c9cff', 'Editing': '#b58cff', 'Quality Check': '#e7ad47', 'Ready for Export': '#4fd1c5', 'Ready for Sale': '#47c28a', 'Published': '#2fb36f', 'Updated': '#6be0c4', 'Archived': '#5f6674', 'On Hold': '#e7ad47', 'Complete': '#47c28a' };
export const statusBadge = s => h('span', { class: 'badge', style: { background: (STATUS_COLORS[s] || '#888') + '26', color: STATUS_COLORS[s] || 'var(--muted)' } }, h('span', { class: 'dot', style: { background: STATUS_COLORS[s] || '#888' } }), s || '-');

// Split slider and side by side comparison of two image URLs.
export function compareView(aURL, bURL, { mode = 'split', labels = ['A', 'B'], height = 460 } = {}) {
  const wrap = h('div');
  const draw = m => {
    clear(wrap);
    const bar = h('div', { class: 'row', style: { marginBottom: '8px' } }, ['split', 'side'].map(k => h('button', { class: 'btn sm' + (m === k ? ' on' : ''), onclick: () => draw(k) }, k === 'split' ? 'Split screen' : 'Side by side')), h('span', { class: 'small muted' }, labels[0] + ' vs ' + labels[1]));
    if (m === 'side') wrap.append(bar, h('div', { class: 'g2' }, [aURL, bURL].map((u, i) => h('div', null, h('div', { class: 'cmp', style: { height: height + 'px' } }, h('img', { src: u })), h('div', { class: 'small muted', style: { marginTop: '4px' } }, labels[i])))));
    else {
      const clip = h('div', { class: 'clip' }, h('img', { src: bURL })); const line = h('div', { class: 'bar' }); const box = h('div', { class: 'cmp', style: { height: height + 'px' } }, h('img', { src: aURL }), clip, line);
      const set = f => { clip.style.clipPath = `inset(0 0 0 ${f * 100}%)`; line.style.left = f * 100 + '%'; }; set(0.5);
      const mv = e => { const r = box.getBoundingClientRect(); set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); };
      box.onpointerdown = e => { box.setPointerCapture(e.pointerId); mv(e); box.onpointermove = mv; }; box.onpointerup = () => { box.onpointermove = null; };
      wrap.append(bar, box, h('div', { class: 'row small muted', style: { justifyContent: 'space-between', marginTop: '4px' } }, h('span', null, labels[0] + ' (left)'), h('span', null, labels[1] + ' (right)')));
    }
  };
  draw(mode); return wrap;
}
export const helpLink = (id, label = 'Help') => h('button', { class: 'btn ghost sm', onclick: () => nav.go('help', id), title: 'Open help article' }, icon('help'), label);
export const academyLink = (id, label = 'Lesson') => h('button', { class: 'btn ghost sm', onclick: () => nav.go('academy', id), title: 'Open Academy lesson' }, icon('academy'), label);
export { badge, fmtDate };
