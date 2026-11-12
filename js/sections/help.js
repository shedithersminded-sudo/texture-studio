import { h, icon, clear, debounce } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { ARTICLES } from '../content/help-content.js';

const CONTEXT = { editor: 'editor-basics', export: 'formats', pbr: 'pbr-maps', preview: 'preview', admin: 'security', generate: 'seamless', import: 'formats', library: 'folders', projects: 'folders', settings: 'security', business: 'material-sets', dashboard: 'getting-started', academy: 'getting-started' };

export default function (el, arg) {
  const page = h('div', { class: 'page' }); el.append(page);
  const art = ARTICLES.find(a => a.id === arg) || ARTICLES.find(a => a.id === CONTEXT[arg]);
  if (art) return article(page, art);
  let q = ''; const list = h('div');
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Help Center'), h('div', { class: 'sub' }, 'Short, practical answers. For full courses see the Academy.')), h('div', { class: 'act' }, h('input', { type: 'search', placeholder: 'Search help', oninput: debounce(e => { q = e.target.value.toLowerCase(); draw(); }, 120) }), h('button', { class: 'btn', onclick: () => nav.go('academy') }, icon('academy'), 'Academy'))), tutorial(), list);
  function draw() {
    clear(list); const groups = [...new Set(ARTICLES.map(a => a.group))];
    for (const g of groups) {
      const items = ARTICLES.filter(a => a.group === g && (!q || (a.title + a.body + a.steps.join(' ')).toLowerCase().includes(q))); if (!items.length) continue;
      list.append(h('h3', { style: { marginTop: '16px' } }, g), h('div', { class: 'cards' }, items.map(a => h('a', { href: '#/help/' + a.id, class: 'card tight', style: { textDecoration: 'none', color: 'var(--text)' } }, h('b', null, a.title), h('div', { class: 'small muted', style: { marginTop: '4px' } }, a.body.slice(0, 110) + '...')))));
    }
  }
  draw();
}
function article(page, a) {
  nav.crumbs('Studio', 'Help Center', a.title);
  const related = ARTICLES.filter(x => x.group === a.group && x.id !== a.id);
  page.append(h('div', { class: 'lesson' }, h('div', { class: 'row' }, h('a', { href: '#/help' }, 'Help Center'), icon('right'), h('span', { class: 'muted' }, a.group)), h('h1', { style: { marginTop: '8px' } }, a.title), h('p', { style: { fontSize: '14px' } }, a.body),
    a.steps.length ? [h('h2', null, 'Steps'), h('ol', null, a.steps.map(s => h('li', null, s)))] : null, a.example ? [h('h2', null, 'Example'), h('div', { class: 'callout' }, a.example)] : null,
    related.length ? [h('h2', null, 'Related'), h('div', { class: 'row wrap' }, related.map(r => h('a', { href: '#/help/' + r.id, class: 'btn sm' }, r.title)))] : null));
}
// Interactive quick-start that checks real progress in the studio.
function tutorial() {
  const steps = [
    ['Create a project', () => S.count('project') > 0, () => nav.go('projects')],
    ['Generate or import a texture', () => S.liveTextures(t => t.kind !== 'preview').length > 0, () => nav.go('generate')],
    ['Edit a texture and save a version', () => S.liveTextures(t => t.kind === 'edited').length > 0, () => nav.go('editor')],
    ['Build a PBR material', () => S.count('material') > 0, () => nav.go('pbr', 'new')],
    ['Preview it in 3D and save a render', () => S.liveTextures(t => t.kind === 'preview').length > 0, () => nav.go('preview')],
    ['Export with an engine preset', () => S.all('exportlog', e => e.ok).length > 0, () => nav.go('export')],
    ['Turn work into a product', () => S.count('product') > 0, () => nav.go('business', 'products')],
    ['Make a backup', () => S.count('backup') > 0, () => nav.go('admin', 'backups')],
  ];
  const done = steps.filter(s => s[1]()).length;
  return h('div', { class: 'card', style: { marginBottom: '8px' } }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, 'Quick-start tutorial'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, done + ' of ' + steps.length + ' done')), h('p', { class: 'small muted' }, 'Each step checks your real studio data and ticks itself off.'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '6px' } }, steps.map(([l, ok, go], i) => h('button', { class: 'btn', style: { justifyContent: 'flex-start' }, onclick: go }, h('span', { class: 'dot', style: { background: ok() ? 'var(--ok)' : 'var(--line2)' } }), (i + 1) + '. ' + l))));
}
