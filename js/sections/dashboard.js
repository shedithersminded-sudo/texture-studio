import { h, icon, clear, fmtDate, fmtDT, money, fmtBytes, pickFiles } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { tile, quickProject, statusBadge } from '../core/widgets.js';

const TITLES = { actions: 'Quick actions', stats: 'Studio at a glance', recentProjects: 'Recent projects', recentTextures: 'Recent textures', materials: 'Materials', presets: 'Saved presets', collections: 'Material collections', business: 'Business snapshot', academy: 'Academy progress', exports: 'Recent exports', backup: 'Backup status' };

export default function (el) {
  const s = S.settings(); let customizing = false;
  const page = h('div', { class: 'page' }); el.append(page);
  const draw = () => {
    clear(page);
    page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Welcome back' + (s.owner ? ', ' + s.owner : '')), h('div', { class: 'sub' }, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))),
      h('div', { class: 'act' }, h('button', { class: 'btn' + (customizing ? ' on' : ''), onclick: () => { customizing = !customizing; draw(); } }, icon('grid'), customizing ? 'Done customizing' : 'Customize dashboard'))));
    if (customizing) page.append(h('div', { class: 'callout' }, 'Drag widgets by their handle to reorder. Use the eye button to hide or show a widget.'));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: '14px' } });
    const order = [...new Set([...s.dashboard.order, ...S.DASH_WIDGETS])].filter(k => TITLES[k]);
    for (const key of order) {
      const hidden = s.dashboard.hidden.includes(key); if (hidden && !customizing) continue;
      const body = hidden ? h('div', { class: 'muted small' }, 'Hidden') : W[key]();
      const card = h('div', { class: 'card widget', draggable: customizing, 'data-k': key, style: { gridColumn: ['actions', 'recentTextures', 'stats'].includes(key) ? '1/-1' : null, opacity: hidden ? 0.5 : 1 } },
        h('div', { class: 'wh' }, h('h3', { style: { margin: 0 } }, TITLES[key]), customizing ? [h('button', { class: 'btn ghost icon', style: { marginLeft: 'auto' }, title: hidden ? 'Show' : 'Hide', onclick: () => { hidden ? s.dashboard.hidden.splice(s.dashboard.hidden.indexOf(key), 1) : s.dashboard.hidden.push(key); S.save(s); draw(); } }, icon(hidden ? 'eyeoff' : 'eye')), h('span', { class: 'handle' }, icon('drag'))] : null), body);
      if (customizing) {
        card.ondragstart = e => { e.dataTransfer.setData('text/plain', key); card.classList.add('dragging'); };
        card.ondragend = () => card.classList.remove('dragging');
        card.ondragover = e => e.preventDefault();
        card.ondrop = e => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); const o = order.slice(); o.splice(o.indexOf(from), 1); o.splice(o.indexOf(key), 0, from); s.dashboard.order = o; S.save(s); draw(); };
      }
      grid.append(card);
    }
    page.append(grid);
  };
  const W = {
    actions: () => h('div', { class: 'row wrap' }, [
      ['plus', 'New Texture Project', async () => { const p = await quickProject(); if (p) nav.go('projects', p.id); }],
      ['wand', 'Generate Texture', () => nav.go('generate')], ['upload', 'Import Texture', () => nav.go('import')],
      ['copy', 'Upload Multiple', async () => { const f = await pickFiles({ accept: '.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.tga,.exr,.hdr,.psd' }); if (f.length) { nav.handoff.importFiles = f; nav.go('import'); } }],
      ['brush', 'Edit Existing Texture', () => nav.go('editor')], ['layers', 'Create Material', () => nav.go('pbr')],
      ['library', 'Browse Library', () => nav.go('library')], ['star', 'Saved Presets', () => nav.go('presets')],
      ['download', 'Export Manager', () => nav.go('export')], ['folder', 'Collections', () => nav.go('library', 'collections')],
    ].map(([ic, l, f]) => h('button', { class: 'btn', onclick: f }, icon(ic), l))),
    stats: () => {
      const tex = S.liveTextures(); const size = tex.reduce((a, t) => a + (t.size || 0), 0);
      return h('div', { class: 'stats', style: { margin: 0 } }, [[S.all('project', p => !p.archived).length, 'Active projects'], [tex.filter(t => t.kind !== 'map').length, 'Textures'], [S.count('material'), 'Materials'], [tex.filter(t => t.kind === 'map').length, 'Material maps'], [S.count('product'), 'Products'], [S.all('exportlog', e => e.ok).length, 'Exports'], [fmtBytes(size), 'Image storage']].map(([n, l]) => h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l))));
    },
    recentProjects: () => {
      const list = S.all('project', p => !p.archived).sort((a, b) => b.modified - a.modified).slice(0, 6);
      if (!list.length) return h('div', { class: 'empty' }, 'No projects yet.');
      return h('table', { class: 't' }, h('tbody', null, list.map(p => { const cover = S.liveTextures(t => t.projectId === p.id)[0]; return h('tr', { style: { cursor: 'pointer' }, onclick: () => nav.go('projects', p.id) }, h('td', { style: { width: '44px' } }, cover ? h('img', { src: cover.thumb, style: { width: '36px', height: '36px', borderRadius: '5px', objectFit: 'cover' } }) : h('div', { class: 'swatch', style: { width: '36px', height: '36px' } })), h('td', null, h('b', null, p.name), h('div', { class: 'small muted' }, p.category.replace(/_/g, ' '))), h('td', null, statusBadge(p.status)), h('td', { class: 'small muted' }, fmtDate(p.modified))); })));
    },
    recentTextures: () => {
      const list = S.liveTextures(t => t.kind !== 'map').sort((a, b) => b.modified - a.modified).slice(0, 8);
      if (!list.length) return h('div', { class: 'empty' }, 'Generate or import your first texture to see it here.');
      return h('div', { class: 'tgrid', style: { '--tw': '140px' } }, list.map(t => tile(t, { onclick: () => nav.go('library', t.id), extra: h('span', null, fmtDate(t.created)) })));
    },
    materials: () => { const list = S.all('material').sort((a, b) => b.modified - a.modified).slice(0, 5); return list.length ? h('div', null, list.map(m => h('div', { class: 'row', style: { padding: '5px 0', cursor: 'pointer' }, onclick: () => nav.go('pbr', m.id) }, S.get(m.maps?.baseColor) ? h('img', { src: S.get(m.maps.baseColor).thumb, style: { width: '30px', height: '30px', borderRadius: '50%' } }) : null, h('b', null, m.name), h('span', { class: 'small muted' }, Object.keys(m.maps || {}).length + ' maps'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, fmtDate(m.modified))))) : h('div', { class: 'empty' }, 'No materials yet.'); },
    presets: () => { const list = S.all('preset').slice(0, 8); return list.length ? h('div', { class: 'row wrap' }, list.map(p => h('button', { class: 'btn sm', onclick: () => nav.go('presets', p.id) }, p.name, h('span', { class: 'dim' }, ' ' + p.kind)))) : h('div', { class: 'muted' }, 'No custom presets yet. Save one from the Generator, Editor, PBR or Export pages.'); },
    collections: () => { const list = S.all('collection'); return list.length ? h('div', null, list.map(c => h('div', { class: 'row', style: { padding: '4px 0', cursor: 'pointer' }, onclick: () => nav.go('library', 'col:' + c.id) }, icon('folder'), c.name, h('span', { class: 'grow' }), h('span', { class: 'small muted' }, (c.items || []).length + ' items')))) : h('div', { class: 'muted' }, 'Group textures into collections from the Texture Library.'); },
    business: () => {
      const sales = S.all('sale'), exp = S.all('expense'); const rev = sales.reduce((a, x) => a + (+x.amount || 0) - (+x.fees || 0), 0), cost = exp.reduce((a, x) => a + (+x.amount || 0), 0);
      const prods = S.all('product'); const by = st => prods.filter(p => p.status === st).length;
      return h('div', null, h('div', { class: 'g3' }, [[money(rev), 'Net revenue'], [money(cost), 'Expenses'], [money(rev - cost), 'Profit']].map(([n, l]) => h('div', { class: 'stat' }, h('div', { class: 'n', style: { fontSize: '17px' } }, n), h('div', { class: 'l' }, l)))),
        h('div', { class: 'row wrap', style: { marginTop: '10px' } }, ['In Production', 'Quality Check', 'Ready for Sale', 'Published'].map(st => h('span', null, statusBadge(st), ' ' + by(st)))), h('div', { class: 'small dim', style: { marginTop: '8px' } }, 'Figures come only from sales and expenses you entered.'));
    },
    academy: () => { const prog = S.get('academy') || { done: {} }; const n = Object.keys(prog.done || {}).length; return import('../content/academy-content.js').then(({ COURSES }) => { const total = COURSES.reduce((a, c) => a + c.lessons.length, 0); return h('div', null, h('div', { class: 'row' }, h('b', null, n + ' of ' + total + ' lessons complete')), h('div', { class: 'prog', style: { margin: '8px 0' } }, h('i', { style: { width: (n / total * 100) + '%' } })), h('button', { class: 'btn sm', onclick: () => nav.go('academy') }, icon('academy'), 'Continue learning')); }); },
    exports: () => { const list = S.all('exportlog').sort((a, b) => b.created - a.created).slice(0, 6); return list.length ? h('div', null, list.map(e => h('div', { class: 'row small', style: { padding: '3px 0' } }, h('span', { class: 'dot', style: { background: e.ok ? 'var(--ok)' : 'var(--bad)' } }), e.name, h('span', { class: 'grow' }), h('span', { class: 'muted' }, fmtDT(e.created))))) : h('div', { class: 'muted' }, 'No exports yet.'); },
    backup: () => { const b = s.backup; const due = !b.last || Date.now() - b.last > b.everyHours * 3600000; return h('div', null, h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: due ? 'var(--warn)' : 'var(--ok)' } }), b.last ? 'Last backup ' + fmtDT(b.last) : 'No backup yet'), h('div', { class: 'small muted', style: { margin: '6px 0' } }, b.auto ? `Automatic every ${b.everyHours}h` + (b.folderName ? ' to folder "' + b.folderName + '"' : '') : 'Automatic backups are off.'), h('button', { class: 'btn sm', onclick: () => nav.go('admin', 'backups') }, icon('archive'), 'Manage backups')); },
  };
  // academy widget returns a promise; wrap it
  const ac = W.academy; W.academy = () => { const box = h('div'); Promise.resolve(ac()).then(x => { if (x instanceof Node) box.append(x); }); return box; };
  draw();
}
