import { h, icon, clear, select, check, toast, modal, confirmDlg, promptDlg, fmtDate, fmtDT, money, tabs, task, download, fmtBytes, badge, text } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { statusBadge, pickTextures, helpLink, academyLink } from '../core/widgets.js';
import { PRODUCT_STATUSES, GATED, APPS, EXPENSE_CATS, MARKETPLACES, LICENSES, LICENSE_NOTICE, DEFAULT_PACKAGE } from '../core/business-data.js';
import { QC_CHECKS, runQC, verdict } from '../core/qc.js';
import { EXPORT_PRESETS, FORMATS, applyPreset, defaultOptions, encode, fileName, itemsFromMaterial, itemFromTexture } from '../core/exporter.js';
import { ZipWriter } from '../core/zip.js';
import { MAP_LABEL, MAP_SPACE } from '../core/pbr.js';
import { resize } from '../core/img.js';
import { presentation, TEMPLATES } from './business-present.js';

const TABS = [['overview', 'Overview'], ['products', 'Products'], ['qc', 'Quality Control'], ['packaging', 'Packaging'], ['marketplace', 'Marketplace Prep'], ['sales', 'Sales'], ['expenses', 'Expenses'], ['licenses', 'Licenses'], ['presentation', 'Presentation'], ['reports', 'Reports']];
const csv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
const dlCSV = (name, rows) => download(new Blob([csv(rows)], { type: 'text/csv' }), name + '_' + new Date().toISOString().slice(0, 10) + '.csv');
const net = s => (+s.amount || 0) - (+s.fees || 0);

export async function ensureBusinessData() {
  // clean up records saved by an earlier version that lost their id prefix
  for (const x of [...S.all('marketplace', r => !r.id.startsWith('mkt_')), ...S.all('license', r => LICENSES.some(l => l.id === r.id))]) await S.remove(x.id);
  for (const m of MARKETPLACES) if (!S.get('mkt_' + m.id)) await S.save({ ...structuredClone(m), key: m.id, id: 'mkt_' + m.id, type: 'marketplace' }, { silent: true });
  for (const l of LICENSES) if (!S.get('lic_' + l.id)) await S.save({ ...structuredClone(l), key: l.id, id: 'lic_' + l.id, type: 'license' }, { silent: true });
  if (!S.all('pkgtemplate').length) await S.save({ id: 'pkg_default', type: 'pkgtemplate', ...structuredClone(DEFAULT_PACKAGE) }, { silent: true });
}

export default async function (el, arg) {
  await ensureBusinessData();
  const page = h('div', { class: 'page' }); el.append(page);
  if (arg?.startsWith('newFromProject:')) { const p = await productFromProject(S.get(arg.split(':')[1])); return nav.go('business', 'product:' + p.id); }
  if (arg?.startsWith('product:')) { const p = S.get(arg.slice(8)); if (p) return productPage(page, p); }
  let tab = TABS.some(t => t[0] === arg) ? arg : 'overview';
  const body = h('div');
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Business Center'), h('div', { class: 'sub' }, 'Turn finished textures into products, check quality, package, prepare listings and track the money.')), h('div', { class: 'act' }, academyLink('c5-market', 'Selling course'), h('button', { class: 'btn pri', onclick: async () => { const p = await newProduct(); if (p) nav.go('business', 'product:' + p.id); } }, icon('plus'), 'New product'))),
    tabs(TABS, tab, t => { tab = t; history.replaceState(null, '', '#/business/' + t); draw(); }), body);
  const draw = () => { clear(body); VIEWS[tab](body); };
  draw();
}

async function newProduct(extra = {}) {
  const name = extra.name || await promptDlg('Product name', 'New Texture Pack', { title: 'New product' }); if (!name) return null;
  const p = await S.save({ type: 'product', name, category: 'Texture Pack', status: 'Idea', description: '', shortDescription: '', price: 0, cost: 0, version: '1.0.0', versions: [{ v: '1.0.0', date: Date.now(), notes: 'Initial version' }], apps: ['Unreal Engine', 'Unity', 'Blender'], projectIds: [], materialIds: [], textureIds: [], previewIds: [], licenseId: 'lic_commercial', marketplaces: {}, qcManual: {}, packageId: 'pkg_default', targetResolution: 0, ...extra });
  await S.log('activity', 'Created product "' + p.name + '"', 'info', { ref: p.id }); return p;
}
async function productFromProject(pr) {
  const mats = S.all('material', m => m.projectId === pr.id); const tex = S.liveTextures(t => t.projectId === pr.id && !t.materialId && t.kind !== 'preview' && t.kind !== 'original'); const prev = S.liveTextures(t => t.projectId === pr.id && t.kind === 'preview');
  const p = await newProduct({ name: pr.name, description: pr.description || '', projectIds: [pr.id], materialIds: mats.map(m => m.id), textureIds: mats.length ? [] : tex.map(t => t.id), previewIds: prev.map(t => t.id), category: pr.category.replace(/_/g, ' '), status: 'In Production' });
  toast('Product created from project. Materials and previews were linked automatically.', 'ok', 5000); return p;
}
function specs(p) {
  const mats = (p.materialIds || []).map(S.get).filter(Boolean); const tex = (p.textureIds || []).map(S.get).filter(Boolean);
  const maps = [...new Set(mats.flatMap(m => Object.keys(m.maps || {})))]; const res = [...new Set([...mats.map(m => m.width + 'x' + m.height), ...tex.map(t => t.width + 'x' + t.height)])];
  const pkg = S.get(p.packageId) || DEFAULT_PACKAGE;
  return { materials: mats.length, textures: tex.length, maps, mapLabels: maps.map(k => MAP_LABEL[k] || k), resolutions: res, format: pkg.format, optimized: pkg.includeOptimized ? pkg.optimizedSize : null, estimated: mats.some(m => m.estimated), tileable: !p.notTileable };
}

const VIEWS = {
  overview(el) {
    const prods = S.all('product'), sales = S.all('sale'), exp = S.all('expense'); const rev = sales.reduce((a, s) => a + net(s), 0), cost = exp.reduce((a, e) => a + (+e.amount || 0), 0);
    el.append(h('div', { class: 'stats' }, [[prods.filter(p => ['Idea', 'Planning', 'In Production', 'Editing', 'Quality Check', 'Ready for Export'].includes(p.status)).length, 'In development'], [prods.filter(p => p.status === 'Ready for Sale').length, 'Ready for sale'], [prods.filter(p => ['Published', 'Updated'].includes(p.status)).length, 'Published'], [money(rev), 'Net revenue (entered)'], [money(cost), 'Expenses'], [money(rev - cost), 'Profit']].map(([n, l]) => h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l)))));
    el.append(h('div', { class: 'g2' }, h('div', { class: 'card' }, h('h3', null, 'Last 12 months'), monthlyBars(sales, exp), h('div', { class: 'small dim' }, 'Green: net revenue. Red: expenses. Only figures you entered.')),
      h('div', { class: 'card' }, h('h3', null, 'Product pipeline'), h('div', null, PRODUCT_STATUSES.map(st => { const n = prods.filter(p => p.status === st).length; return h('div', { class: 'row', style: { padding: '3px 0' } }, statusBadge(st), h('div', { class: 'prog grow' }, h('i', { style: { width: (prods.length ? n / prods.length * 100 : 0) + '%' } })), h('span', { class: 'small', style: { width: '20px', textAlign: 'right' } }, n)); })))));
    el.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', null, 'Product performance'), perfTable()));
  },
  products(el) {
    let view = 'board'; const box = h('div');
    const draw = () => {
      clear(box); const prods = S.all('product').sort((a, b) => b.modified - a.modified);
      box.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, ['board', 'table'].map(v => h('button', { class: 'btn sm' + (view === v ? ' on' : ''), onclick: () => { view = v; draw(); } }, v === 'board' ? 'Status board' : 'Catalog table')), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => dlCSV('product_catalog', [['Name', 'Category', 'Status', 'Version', 'Price', 'Production cost', 'Materials', 'Textures', 'Supported apps', 'Created'], ...prods.map(p => [p.name, p.category, p.status, p.version, p.price, p.cost, (p.materialIds || []).length, (p.textureIds || []).length, (p.apps || []).join('; '), fmtDate(p.created)])]) }, icon('download'), 'Catalog CSV')));
      if (!prods.length) return box.append(h('div', { class: 'empty' }, 'No products yet. Create one, or open a project and choose "Turn into product".'));
      if (view === 'board') box.append(h('div', { class: 'kanban' }, PRODUCT_STATUSES.map(st => h('div', { class: 'col', ondragover: e => e.preventDefault(), ondrop: async e => { const p = S.get(e.dataTransfer.getData('text')); if (p) { await setStatus(p, st); draw(); } } }, h('h4', null, st, h('span', null, prods.filter(p => p.status === st).length)), prods.filter(p => p.status === st).map(p => h('div', { class: 'kc', draggable: true, ondragstart: e => e.dataTransfer.setData('text', p.id), onclick: () => nav.go('business', 'product:' + p.id) }, cover(p, 40), h('b', null, p.name), h('div', { class: 'small muted' }, 'v' + p.version + ' . ' + money(p.price)), qcBadge(p)))))));
      else box.append(h('table', { class: 't' }, h('thead', null, h('tr', null, ['', 'Product', 'Status', 'QC', 'Version', 'Price', 'Revenue', 'Updated'].map(x => h('th', null, x)))), h('tbody', null, prods.map(p => h('tr', { style: { cursor: 'pointer' }, onclick: () => nav.go('business', 'product:' + p.id) }, h('td', null, cover(p, 34)), h('td', null, h('b', null, p.name), h('div', { class: 'small muted' }, p.category)), h('td', null, statusBadge(p.status)), h('td', null, qcBadge(p)), h('td', null, p.version), h('td', null, money(p.price)), h('td', null, money(S.all('sale', s => s.productId === p.id).reduce((a, s) => a + net(s), 0))), h('td', { class: 'small muted' }, fmtDate(p.modified)))))));
    };
    el.append(box); draw();
  },
  qc(el) { el.append(h('p', { class: 'muted' }, 'Run checks from a product page. Latest results:'), h('table', { class: 't' }, h('tbody', null, S.all('product').map(p => h('tr', { style: { cursor: 'pointer' }, onclick: () => nav.go('business', 'product:' + p.id) }, h('td', null, p.name), h('td', null, qcBadge(p)), h('td', { class: 'small muted' }, p.qc ? 'Checked ' + fmtDT(p.qc.date) : 'Never checked')))))); },
  packaging(el) {
    const tpls = S.all('pkgtemplate');
    el.append(h('p', { class: 'muted' }, 'Package templates decide the folder layout and file versions of a product ZIP. Build a package from a product page.'));
    for (const t of tpls) el.append(templateEditor(t));
    el.append(h('button', { class: 'btn', onclick: async () => { const n = await promptDlg('Template name', 'My package layout'); if (n) { await S.save({ type: 'pkgtemplate', ...structuredClone(DEFAULT_PACKAGE), name: n }); el.replaceChildren(); VIEWS.packaging(el); } } }, icon('plus'), 'New template'));
  },
  marketplace(el) {
    el.append(h('div', { class: 'callout' }, 'This app prepares products for these marketplaces. It does not publish or upload anything. Requirements change, so confirm on the official page before you submit. Every checklist is editable.'));
    const mk = S.all('marketplace').sort((a, b) => a.name.localeCompare(b.name));
    el.append(h('div', { class: 'cards' }, mk.map(m => h('div', { class: 'card' }, h('h3', null, m.name), h('div', { class: 'small' }, h('a', { href: m.url, target: '_blank', rel: 'noopener' }, 'Website'), '  .  ', h('a', { href: m.docs, target: '_blank', rel: 'noopener' }, 'Official documentation')), h('div', { class: 'small muted', style: { margin: '6px 0' } }, m.checklist.length + ' checklist items'), h('button', { class: 'btn sm', onclick: () => editChecklist(m).then(() => { el.replaceChildren(); VIEWS.marketplace(el); }) }, icon('edit'), 'Edit requirements')))));
  },
  sales(el) { ledger(el, 'sale'); },
  expenses(el) { ledger(el, 'expense'); },
  licenses(el) {
    el.append(h('div', { class: 'callout warn' }, LICENSE_NOTICE));
    for (const l of S.all('license')) {
      const body = h('textarea', { rows: 8, class: 'mono', style: { fontSize: '12px' } }); body.value = l.body;
      el.append(h('div', { class: 'card', style: { marginBottom: '10px' } }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, l.name), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: async () => { const n = await promptDlg('Name for the copy', l.name + ' copy'); if (n) { const { id, created, modified, ...r } = l; await S.save({ ...r, name: n }); el.replaceChildren(); VIEWS.licenses(el); } } }, icon('copy'), 'Duplicate'), !l.id.startsWith('lic_') ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Delete this license template?', { danger: true })) { await S.remove(l.id); el.replaceChildren(); VIEWS.licenses(el); } } }, icon('trash')) : null),
        h('p', { class: 'small muted' }, l.explain), h('div', { class: 'small dim' }, 'Placeholders: {product} {owner} {year}'), body, h('button', { class: 'btn sm pri', style: { marginTop: '6px' }, onclick: async () => { l.body = body.value; await S.save(l); toast('License saved', 'ok'); } }, 'Save')));
    }
  },
  presentation(el) { presentation(el); },
  reports(el) {
    const sales = S.all('sale'), exp = S.all('expense'); const months = {}; const years = {};
    for (const s of sales) { const d = new Date(s.date || s.created), m = d.toISOString().slice(0, 7), y = d.getFullYear(); (months[m] ||= { rev: 0, exp: 0, n: 0 }).rev += net(s); months[m].n += +s.qty || 1; (years[y] ||= { rev: 0, exp: 0, n: 0 }).rev += net(s); years[y].n += +s.qty || 1; }
    for (const e of exp) { const d = new Date(e.date || e.created), m = d.toISOString().slice(0, 7), y = d.getFullYear(); (months[m] ||= { rev: 0, exp: 0, n: 0 }).exp += +e.amount || 0; (years[y] ||= { rev: 0, exp: 0, n: 0 }).exp += +e.amount || 0; }
    const tbl = (obj, label) => h('table', { class: 't' }, h('thead', null, h('tr', null, [label, 'Units', 'Net revenue', 'Expenses', 'Profit'].map(x => h('th', null, x)))), h('tbody', null, Object.keys(obj).sort().reverse().map(k => h('tr', null, h('td', null, k), h('td', null, obj[k].n), h('td', null, money(obj[k].rev)), h('td', null, money(obj[k].exp)), h('td', { style: { color: obj[k].rev - obj[k].exp < 0 ? 'var(--bad)' : 'var(--ok)' } }, money(obj[k].rev - obj[k].exp))))));
    el.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { class: 'btn sm', onclick: () => dlCSV('monthly_report', [['Month', 'Units', 'Net revenue', 'Expenses', 'Profit'], ...Object.keys(months).sort().map(k => [k, months[k].n, months[k].rev.toFixed(2), months[k].exp.toFixed(2), (months[k].rev - months[k].exp).toFixed(2)])]) }, icon('download'), 'Monthly CSV'), h('button', { class: 'btn sm', onclick: () => dlCSV('annual_report', [['Year', 'Units', 'Net revenue', 'Expenses', 'Profit'], ...Object.keys(years).sort().map(k => [k, years[k].n, years[k].rev.toFixed(2), years[k].exp.toFixed(2), (years[k].rev - years[k].exp).toFixed(2)])]) }, icon('download'), 'Annual CSV')),
      h('div', { class: 'g2' }, h('div', { class: 'card' }, h('h3', null, 'Monthly report'), Object.keys(months).length ? tbl(months, 'Month') : h('div', { class: 'muted' }, 'No entries yet.')), h('div', { class: 'card' }, h('h3', null, 'Annual report'), Object.keys(years).length ? tbl(years, 'Year') : h('div', { class: 'muted' }, 'No entries yet.'))),
      h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', null, 'Product performance'), perfTable()));
  },
};
function perfTable() {
  const prods = S.all('product'); if (!prods.length) return h('div', { class: 'muted' }, 'No products yet.');
  return h('table', { class: 't' }, h('thead', null, h('tr', null, ['Product', 'Status', 'Price', 'Units', 'Net revenue', 'Costs', 'Profit'].map(x => h('th', null, x)))), h('tbody', null, prods.map(p => { const s = S.all('sale', x => x.productId === p.id), r = s.reduce((a, x) => a + net(x), 0), c = (+p.cost || 0) + S.all('expense', e => e.productId === p.id).reduce((a, e) => a + (+e.amount || 0), 0); return h('tr', null, h('td', null, p.name), h('td', null, statusBadge(p.status)), h('td', null, money(p.price)), h('td', null, s.reduce((a, x) => a + (+x.qty || 1), 0)), h('td', null, money(r)), h('td', null, money(c)), h('td', { style: { color: r - c < 0 ? 'var(--bad)' : 'var(--ok)' } }, money(r - c))); })));
}
function monthlyBars(sales, exp) {
  const now = new Date(), months = []; for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
  const v = months.map(m => [sales.filter(s => new Date(s.date || s.created).toISOString().slice(0, 7) === m).reduce((a, s) => a + net(s), 0), exp.filter(e => new Date(e.date || e.created).toISOString().slice(0, 7) === m).reduce((a, e) => a + (+e.amount || 0), 0)]);
  const max = Math.max(1, ...v.flat());
  return h('div', { class: 'bars' }, months.map((m, i) => h('div', { class: 'b', title: `${m}: revenue ${money(v[i][0])}, expenses ${money(v[i][1])}` }, h('div', { style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px', width: '100%' } }, h('i', { style: { height: (v[i][0] / max * 100) + '%', background: 'var(--ok)', flex: 1 } }), h('i', { style: { height: (v[i][1] / max * 100) + '%', background: 'var(--bad)', flex: 1, opacity: .7 } })), m.slice(5))));
}
function cover(p, s) { const t = S.get(p.previewIds?.[0]) || S.get(S.get(p.materialIds?.[0])?.maps?.baseColor) || S.get(p.textureIds?.[0]); return t ? h('img', { src: t.thumb, style: { width: s + 'px', height: s + 'px', borderRadius: '5px', objectFit: 'cover', float: 'right', marginLeft: '6px' } }) : null; }
function qcBadge(p) { const v = verdict(p.qc, p.qcManual); return badge('QC: ' + v, { pass: 'ok', fail: 'bad', review: 'warn' }[v] || ''); }
async function setStatus(p, st) {
  if (GATED.includes(st)) { const v = verdict(p.qc, p.qcManual); if (v !== 'pass') { toast(`"${p.name}" cannot be marked ${st}: quality control is "${v}". Run QC and resolve every required check first.`, 'bad', 7000); return false; } }
  const old = p.status; p.status = st; await S.save(p); await S.log('activity', `Product "${p.name}": ${old} to ${st}`, 'info', { ref: p.id }); return true;
}
async function editChecklist(m) {
  const ta = h('textarea', { rows: 14 }); ta.value = m.checklist.join('\n'); const url = h('input', { type: 'text', value: m.url }), docs = h('input', { type: 'text', value: m.docs });
  const ok = await modal({ title: 'Edit ' + m.name + ' requirements', body: h('div', null, h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Website'), url), h('div', { class: 'f' }, h('label', null, 'Documentation link'), docs)), h('div', { class: 'f' }, h('label', null, 'Checklist (one item per line)'), ta)), actions: [{ label: 'Cancel', value: false }, { label: 'Save', cls: 'pri', value: true }] });
  if (ok) { m.checklist = ta.value.split('\n').map(s => s.trim()).filter(Boolean); m.url = url.value; m.docs = docs.value; await S.save(m); toast('Requirements updated', 'ok'); }
}
function templateEditor(t) {
  const f = (k, label, tip) => h('div', { class: 'f' }, h('label', null, label), h('input', { type: 'text', value: t[k], title: tip || '', onchange: async e => { t[k] = e.target.value; await S.save(t); } }));
  return h('div', { class: 'card', style: { marginBottom: '10px' } }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, t.name), h('span', { class: 'grow' }), t.id !== 'pkg_default' ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDlg('Delete template?', { danger: true })) { await S.remove(t.id); nav.go('business', 'packaging'); } } }, icon('trash')) : null),
    h('div', { class: 'g3' }, f('root', 'Root folder', '{product} is replaced with the product name'), f('main', 'Main textures folder'), f('optimized', 'Optimized textures folder'), f('previews', 'Previews folder'), f('renders', 'Renders folder'), f('docs', 'Documentation folder')),
    h('div', { class: 'g3' }, select('Main file format', Object.keys(FORMATS).filter(k => !FORMATS[k].hdr), t.format, async v => { t.format = v; await S.save(t); }), select('Naming and map conventions', EXPORT_PRESETS.map(p => [p.id, p.name]), t.preset, async v => { t.preset = v; await S.save(t); }), select('Optimized size', [512, 1024, 2048], t.optimizedSize, async v => { t.optimizedSize = +v; await S.save(t); })),
    h('div', { class: 'row wrap' }, check('Include optimized (smaller) versions', t.includeOptimized, async v => { t.includeOptimized = v; await S.save(t); }), check('Render material spheres', t.includeRenders, async v => { t.includeRenders = v; await S.save(t); })),
    h('div', { class: 'small muted' }, 'Extra engine-ready copies:'), h('div', { class: 'row wrap' }, ['unreal', 'unity-urp', 'godot', 'blender'].map(id => check(EXPORT_PRESETS.find(p => p.id === id).name, (t.includeEngineVersions || []).includes(id), async v => { t.includeEngineVersions = v ? [...new Set([...(t.includeEngineVersions || []), id])] : (t.includeEngineVersions || []).filter(x => x !== id); await S.save(t); }))));
}
function ledger(el, type) {
  const isSale = type === 'sale'; const rows = S.all(type).sort((a, b) => (b.date || b.created) - (a.date || a.created)); const prods = S.all('product');
  const mk = S.all('marketplace').map(m => m.name);
  const add = async (rec = {}) => {
    const f = { date: new Date(rec.date || Date.now()).toISOString().slice(0, 10), productId: rec.productId || '', marketplace: rec.marketplace || mk[0] || '', qty: rec.qty ?? 1, amount: rec.amount ?? '', fees: rec.fees ?? 0, category: rec.category || EXPENSE_CATS[0], note: rec.note || '' };
    const body = h('div', null, h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Date'), h('input', { type: 'date', value: f.date, oninput: e => f.date = e.target.value })), select('Product', [['', isSale ? 'Choose...' : 'General (not product specific)'], ...prods.map(p => [p.id, p.name])], f.productId, v => f.productId = v)),
      isSale ? h('div', { class: 'g3' }, h('div', { class: 'f' }, h('label', null, 'Marketplace'), h('input', { type: 'text', list: 'mk-list', value: f.marketplace, oninput: e => f.marketplace = e.target.value }), h('datalist', { id: 'mk-list' }, mk.map(m => h('option', { value: m })))), h('div', { class: 'f' }, h('label', null, 'Units'), h('input', { type: 'number', value: f.qty, min: 1, oninput: e => f.qty = +e.target.value })), h('div', { class: 'f' }, h('label', null, 'Gross amount ($)'), h('input', { type: 'number', step: '0.01', value: f.amount, oninput: e => f.amount = e.target.value })))
        : h('div', { class: 'g2' }, select('Category', EXPENSE_CATS, f.category, v => f.category = v), h('div', { class: 'f' }, h('label', null, 'Amount ($)'), h('input', { type: 'number', step: '0.01', value: f.amount, oninput: e => f.amount = e.target.value }))),
      isSale ? h('div', { class: 'f' }, h('label', null, 'Marketplace fees ($)'), h('input', { type: 'number', step: '0.01', value: f.fees, oninput: e => f.fees = e.target.value })) : null, h('div', { class: 'f' }, h('label', null, 'Note'), h('input', { type: 'text', value: f.note, oninput: e => f.note = e.target.value })));
    const ok = await modal({ title: (rec.id ? 'Edit ' : 'Add ') + (isSale ? 'sale' : 'expense'), body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', cls: 'pri', run: () => { if (!(+f.amount >= 0) || f.amount === '') { toast('Enter an amount', 'warn'); return false; } if (isSale && !f.productId) { toast('Choose the product sold', 'warn'); return false; } return true; } }] });
    if (!ok) return; Object.assign(rec, { type, ...f, date: new Date(f.date).getTime(), amount: +f.amount, fees: +f.fees || 0 }); await S.save(rec); S.log('activity', (isSale ? 'Recorded sale ' : 'Recorded expense ') + money(rec.amount)); el.replaceChildren(); ledger(el, type);
  };
  const total = rows.reduce((a, r) => a + (isSale ? net(r) : +r.amount || 0), 0);
  el.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { class: 'btn pri', onclick: () => add() }, icon('plus'), isSale ? 'Add sale' : 'Add expense'), h('button', { class: 'btn', onclick: () => dlCSV(isSale ? 'sales' : 'expenses', isSale ? [['Date', 'Product', 'Marketplace', 'Units', 'Gross', 'Fees', 'Net', 'Note'], ...rows.map(r => [fmtDate(r.date), S.get(r.productId)?.name || '', r.marketplace, r.qty, r.amount, r.fees, net(r).toFixed(2), r.note])] : [['Date', 'Category', 'Product', 'Amount', 'Note'], ...rows.map(r => [fmtDate(r.date), r.category, S.get(r.productId)?.name || 'General', r.amount, r.note])]) }, icon('download'), 'Export CSV'), h('span', { class: 'grow' }), h('b', null, (isSale ? 'Net total ' : 'Total ') + money(total))),
    h('div', { class: 'small dim', style: { marginBottom: '8px' } }, isSale ? 'Enter sales by hand from your marketplace statements. The app does not connect to marketplace revenue systems.' : 'Track costs to see real profit per product.'),
    rows.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, (isSale ? ['Date', 'Product', 'Marketplace', 'Units', 'Gross', 'Fees', 'Net', 'Note', ''] : ['Date', 'Category', 'Product', 'Amount', 'Note', '']).map(x => h('th', null, x)))), h('tbody', null, rows.map(r => h('tr', null, ...(isSale ? [fmtDate(r.date), S.get(r.productId)?.name || '(deleted)', r.marketplace, r.qty, money(r.amount), money(r.fees), money(net(r)), r.note] : [fmtDate(r.date), r.category, S.get(r.productId)?.name || 'General', money(r.amount), r.note]).map(x => h('td', null, x)), h('td', null, h('button', { class: 'btn ghost sm', onclick: () => add(r) }, icon('edit')), h('button', { class: 'btn ghost sm', onclick: async () => { if (await confirmDlg('Delete this entry?', { danger: true })) { await S.remove(r.id); el.replaceChildren(); ledger(el, type); } } }, icon('trash'))))))) : h('div', { class: 'empty' }, 'No entries yet.'));
}

// =================== PRODUCT PAGE ===================
function productPage(page, p) {
  nav.crumbs('Studio', 'Business Center', p.name); p.qcManual ||= {}; p.marketplaces ||= {};
  let tab = 'details'; const save = () => S.save(p);
  const head = h('div'), body = h('div'); page.append(head, body);
  function drawHead() {
    clear(head); const v = verdict(p.qc, p.qcManual);
    head.append(h('div', { class: 'ph' }, h('button', { class: 'btn ghost', onclick: () => nav.go('business', 'products') }, 'Products'), h('h1', null, p.name), statusBadge(p.status), qcBadge(p), h('div', { class: 'act' },
      select(null, PRODUCT_STATUSES, p.status, async st => { if (!(await setStatus(p, st))) drawHead(); else drawHead(); }),
      h('button', { class: 'btn', onclick: () => nav.go('export', 'prod:' + p.id) }, icon('download'), 'Export files'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmDlg(`Delete product "${p.name}"? Linked textures and materials are not deleted.`, { danger: true })) { await S.remove(p.id); nav.go('business', 'products'); } } }, icon('trash')))),
      h('div', { class: 'row small muted', style: { marginBottom: '10px', gap: '6px' } }, ['Idea', 'Planning', 'In Production', 'Editing', 'Quality Check', 'Ready for Export', 'Ready for Sale', 'Published'].map((st, i, a) => [h('span', { style: { color: st === p.status ? 'var(--accent)' : PRODUCT_STATUSES.indexOf(p.status) > PRODUCT_STATUSES.indexOf(st) ? 'var(--ok)' : null, fontWeight: st === p.status ? 700 : 400 } }, st), i < a.length - 1 ? icon('right') : null])));
  }
  const T = [['details', 'Details'], ['contents', 'Contents'], ['qc', 'Quality control'], ['package', 'Package'], ['market', 'Marketplaces'], ['versions', 'Versions'], ['money', 'Sales']];
  function drawBody() { clear(body); body.append(tabs(T, tab, t => { tab = t; drawBody(); })); PV[tab](); }
  const PV = {
    details() {
      const sp = specs(p); const inp = (k, label, type = 'text') => h('div', { class: 'f' }, h('label', null, label), h('input', { type, value: p[k] ?? '', step: type === 'number' ? '0.01' : null, onchange: async e => { p[k] = type === 'number' ? +e.target.value : e.target.value; await save(); drawHead(); } }));
      body.append(h('div', { class: 'g2' }, h('div', { class: 'card' }, h('h3', null, 'Product information'), h('div', { class: 'g2' }, inp('name', 'Product name'), inp('category', 'Product category')),
        h('div', { class: 'f' }, h('label', null, 'Short description (one line for listings)'), h('input', { type: 'text', value: p.shortDescription || '', onchange: async e => { p.shortDescription = e.target.value; await save(); } })),
        h('div', { class: 'f' }, h('label', null, 'Full description'), h('textarea', { rows: 7, onchange: async e => { p.description = e.target.value; await save(); } }, p.description || ''), h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: async () => { p.description = autoDescription(p); await save(); drawBody(); } }, icon('wand'), 'Write a draft from the product data')),
        h('div', { class: 'g3' }, inp('price', 'Selling price ($)', 'number'), inp('cost', 'Production cost ($)', 'number'), h('div', { class: 'f' }, h('label', null, 'Target resolution'), select(null, [[0, 'Any'], [1024, '1024'], [2048, '2048'], [4096, '4096']], p.targetResolution || 0, async v => { p.targetResolution = +v; await save(); }))),
        h('div', { class: 'f' }, h('label', null, 'Supported applications'), h('div', { class: 'row wrap' }, APPS.map(a => check(a, (p.apps || []).includes(a), async v => { p.apps = v ? [...new Set([...(p.apps || []), a])] : p.apps.filter(x => x !== a); await save(); })))),
        check('Not tileable (decals, atlases, trim sheets)', p.notTileable, async v => { p.notTileable = v; await save(); }),
        select('License', S.all('license').map(l => [l.id, l.name]), p.licenseId, async v => { p.licenseId = v; await save(); })),
        h('div', { class: 'card' }, h('h3', null, 'Technical specifications'), h('div', { class: 'small dim', style: { marginBottom: '6px' } }, 'Filled in from the linked materials and package template.'), specTable(sp), h('h3', { style: { marginTop: '14px' } }, 'Preview images'), previewsBox())));
    },
    contents() {
      const mats = (p.materialIds || []).map(S.get).filter(Boolean), tex = (p.textureIds || []).map(S.get).filter(Boolean), projs = (p.projectIds || []).map(S.get).filter(Boolean);
      const rm = (k, id) => async () => { p[k] = p[k].filter(x => x !== id); await save(); drawBody(); };
      body.append(h('div', { class: 'g2' },
        h('div', { class: 'card' }, h('h3', null, 'PBR materials'), mats.map(m => h('div', { class: 'row', style: { padding: '4px 0' } }, S.get(m.maps?.baseColor) ? h('img', { src: S.get(m.maps.baseColor).thumb, style: { width: '34px', height: '34px', borderRadius: '50%' } }) : null, h('a', { href: '#/pbr/' + m.id }, m.name), h('span', { class: 'small muted' }, Object.keys(m.maps || {}).length + ' maps . ' + m.width + 'px'), m.estimated ? badge('estimated', 'warn') : null, h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', onclick: rm('materialIds', m.id) }, icon('x')))),
          h('button', { class: 'btn sm', onclick: async () => { const all = S.all('material', m => !(p.materialIds || []).includes(m.id)); if (!all.length) return toast('No other materials available', 'warn'); const id = await modal({ title: 'Add material', body: h('p', { class: 'muted' }, 'Choose a material to include.'), actions: all.slice(0, 30).map(m => ({ label: m.name, value: m.id })) }); if (id) { p.materialIds = [...(p.materialIds || []), id]; await save(); drawBody(); } } }, icon('plus'), 'Add material')),
        h('div', { class: 'card' }, h('h3', null, 'Standalone textures'), tex.map(t => h('div', { class: 'row', style: { padding: '4px 0' } }, h('img', { src: t.thumb, style: { width: '34px', height: '34px', borderRadius: '4px' } }), t.name, h('span', { class: 'small muted' }, t.width + 'px'), h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', onclick: rm('textureIds', t.id) }, icon('x')))),
          h('button', { class: 'btn sm', onclick: async () => { const t = await pickTextures({ multiple: true, title: 'Add textures to product' }); if (t) { p.textureIds = [...new Set([...(p.textureIds || []), ...t.map(x => x.id)])]; await save(); drawBody(); } } }, icon('plus'), 'Add textures'),
          h('h3', { style: { marginTop: '14px' } }, 'Source projects'), projs.map(x => h('div', null, h('a', { href: '#/projects/' + x.id }, x.name))), !projs.length ? h('div', { class: 'small muted' }, 'None linked.') : null)));
    },
    async qc() {
      const res = h('div'); const v = verdict(p.qc, p.qcManual);
      body.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { class: 'btn pri', onclick: async () => { const t = task('Quality check'); try { p.qc = await runQC(p, x => t.update(x)); await save(); t.done(); S.log('activity', `QC run on "${p.name}": ${verdict(p.qc, p.qcManual)}`, 'info', { ref: p.id }); drawHead(); drawBody(); } catch (e) { t.fail(e); toast(e.message, 'bad'); } } }, icon('check'), p.qc ? 'Run checks again' : 'Run quality checks'),
        p.qc ? h('button', { class: 'btn', onclick: () => download(new Blob([qcReport(p)], { type: 'text/plain' }), S.safeName(p.name) + '_QC_report.txt') }, icon('download'), 'Download report') : null, h('span', { class: 'grow' }), p.qc ? h('span', null, 'Result: ', qcBadge(p), '  ', h('span', { class: 'small muted' }, fmtDT(p.qc.date))) : null), res);
      if (!p.qc) return res.append(h('div', { class: 'empty' }, 'Checks have not run yet. A product can only be marked Ready for Sale after every required check passes.'));
      res.append(h('div', { class: 'callout' + (v === 'pass' ? '' : ' warn') }, v === 'pass' ? 'All required checks pass. You can mark this product Ready for Sale.' : 'Products are never marked Ready for Sale automatically. Fix the failed items, or review and sign off the items that need a human eye.'));
      res.append(h('table', { class: 't' }, h('tbody', null, p.qc.results.map(r => { const c = QC_CHECKS.find(x => x[0] === r.id); return h('tr', null, h('td', { style: { width: '24px' } }, h('span', { class: 'dot', style: { background: { pass: 'var(--ok)', fail: 'var(--bad)', review: 'var(--warn)' }[r.status] } })), h('td', { style: { width: '200px' } }, h('b', null, c[1]), c[2] ? h('div', { class: 'small dim' }, 'Required') : h('div', { class: 'small dim' }, 'Advisory')), h('td', null, badge(r.status, { pass: 'ok', fail: 'bad', review: 'warn' }[r.status])), h('td', { class: 'small' }, r.msg), h('td', null, r.status !== 'pass' && !(r.status === 'fail' && c[2]) ? check('Reviewed and OK', p.qcManual[r.id], async val => { p.qcManual[r.id] = val; await save(); drawHead(); }) : null)); }))));
    },
    package() {
      const tpl = S.get(p.packageId) || S.all('pkgtemplate')[0]; const sp = specs(p); const root = (tpl.root || '{product}').replace('{product}', S.safeName(p.name));
      const tree = [root + '/', `  ${tpl.main}/<Material>/  (${tpl.format}, full resolution: ${sp.resolutions.join(', ') || '-'})`, tpl.includeOptimized ? `  ${tpl.optimized}/<Material>/  (${tpl.optimizedSize} px)` : null, ...(tpl.includeEngineVersions || []).map(id => `  Engine_Ready/${EXPORT_PRESETS.find(x => x.id === id).name.replace(/\W+/g, '_')}/`), `  ${tpl.previews}/  (${(p.previewIds || []).length} image(s))`, tpl.includeRenders ? `  ${tpl.renders}/  (material sphere renders)` : null, `  ${tpl.docs}/README.txt, INSTALL.txt, LICENSE.txt, VERSION.txt`, `  ${S.safeName(p.name)}_product.json`].filter(Boolean);
      body.append(h('div', { class: 'g2' }, h('div', { class: 'card' }, h('h3', null, 'Packaging assistant'), select('Package template', S.all('pkgtemplate').map(t => [t.id, t.name]), tpl.id, async v => { p.packageId = v; p.packageName = S.get(v).name; await save(); drawBody(); }), h('pre', { class: 'mono small', style: { background: 'var(--bg)', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap' } }, tree.join('\n')),
        h('button', { class: 'btn pri', onclick: () => buildPackage(p, tpl) }, icon('zip'), 'Build ZIP package'), h('button', { class: 'btn', style: { marginLeft: '6px' }, onclick: () => nav.go('business', 'packaging') }, 'Edit templates')),
        h('div', { class: 'card' }, h('h3', null, 'Documentation preview'), h('pre', { class: 'mono small', style: { whiteSpace: 'pre-wrap', maxHeight: '420px', overflow: 'auto', background: 'var(--bg)', padding: '10px', borderRadius: '6px' } }, readme(p, tpl)))));
      const ex = p.exportFiles || []; if (ex.length) body.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', null, 'Files exported for this product'), h('div', { style: { maxHeight: '200px', overflow: 'auto' } }, ex.slice(-200).reverse().map(f => h('div', { class: 'row small mono' }, f.path, h('span', { class: 'grow' }), fmtBytes(f.size), h('span', { class: 'muted' }, fmtDate(f.date)))))));
    },
    market() {
      const mk = S.all('marketplace').sort((a, b) => a.name.localeCompare(b.name));
      body.append(h('div', { class: 'callout' }, 'Tick items as you prepare each listing. Nothing is uploaded from here. Open the official documentation to confirm current rules.'));
      body.append(h('div', { class: 'cards' }, mk.map(m => {
        const st = p.marketplaces[m.id] ||= { on: false, checks: {}, url: '' }; const done = m.checklist.filter((_, i) => st.checks[i]).length;
        return h('div', { class: 'card', style: { opacity: st.on ? 1 : 0.7 } }, h('div', { class: 'row' }, h('h3', { style: { margin: 0 } }, m.name), h('span', { class: 'grow' }), check('Target', st.on, async v => { st.on = v; await save(); drawBody(); })),
          h('div', { class: 'prog', style: { margin: '6px 0' } }, h('i', { style: { width: (done / m.checklist.length * 100) + '%' } })), h('div', { class: 'small muted' }, done + ' of ' + m.checklist.length + ' done . ', h('a', { href: m.docs, target: '_blank', rel: 'noopener' }, 'Official docs')),
          st.on ? [h('div', { style: { marginTop: '8px' } }, m.checklist.map((c, i) => check(c, st.checks[i], async v => { st.checks[i] = v; await save(); }))), h('div', { class: 'f' }, h('label', null, 'Listing URL (after you publish)'), h('input', { type: 'text', value: st.url, onchange: async e => { st.url = e.target.value; await save(); } }))] : null);
      })));
    },
    versions() {
      const notes = h('textarea', { rows: 3, placeholder: 'What changed in this version' }); const ver = h('input', { type: 'text', value: bump(p.version) });
      body.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('h3', null, 'Release a new version'), h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Version number'), ver), h('div', { class: 'f' }, h('label', null, 'Changes'), notes)), h('button', { class: 'btn pri', onclick: async () => { p.versions = [...(p.versions || []), { v: ver.value, date: Date.now(), notes: notes.value }]; p.version = ver.value; if (['Published', 'Ready for Sale'].includes(p.status)) { p.status = 'Updated'; if (verdict(p.qc, p.qcManual) !== 'pass') p.status = 'Quality Check'; } p.qc = null; await save(); S.log('activity', `"${p.name}" version ${ver.value}`, 'info', { ref: p.id }); toast('Version recorded. Run QC again before selling.', 'ok'); drawHead(); drawBody(); } }, 'Record version')),
        h('table', { class: 't' }, h('tbody', null, [...(p.versions || [])].reverse().map(v => h('tr', null, h('td', null, h('b', null, v.v)), h('td', { class: 'small muted' }, fmtDate(v.date)), h('td', null, v.notes))))));
    },
    money() {
      const s = S.all('sale', x => x.productId === p.id), e = S.all('expense', x => x.productId === p.id); const r = s.reduce((a, x) => a + net(x), 0), c = (+p.cost || 0) + e.reduce((a, x) => a + (+x.amount || 0), 0);
      body.append(h('div', { class: 'stats' }, [[money(p.price), 'Price'], [s.reduce((a, x) => a + (+x.qty || 1), 0), 'Units sold'], [money(r), 'Net revenue'], [money(c), 'Costs'], [money(r - c), 'Profit'], [p.price > 0 ? Math.max(0, Math.ceil((c - r) / p.price)) : '-', 'Sales to break even']].map(([n, l]) => h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l)))),
        h('button', { class: 'btn', onclick: () => nav.go('business', 'sales') }, 'Open sales ledger'));
    },
  };
  function previewsBox() {
    const prev = (p.previewIds || []).map(S.get).filter(t => t && !t.deleted);
    return h('div', null, h('div', { class: 'tgrid', style: { '--tw': '90px' } }, prev.map(t => h('div', { class: 'tile', title: t.name + ' ' + t.width + 'px' }, h('div', { class: 'im' }, h('img', { src: t.thumb })), h('button', { class: 'fav', onclick: async () => { p.previewIds = p.previewIds.filter(x => x !== t.id); await save(); drawBody(); } }, icon('x'))))),
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: async () => { const t = await pickTextures({ multiple: true, title: 'Choose preview images', filter: t => t.kind === 'preview' || true }); if (t) { p.previewIds = [...new Set([...(p.previewIds || []), ...t.map(x => x.id)])]; await save(); drawBody(); } } }, icon('plus'), 'Add images'), h('button', { class: 'btn sm', onclick: () => { nav.handoff.presentProduct = p.id; nav.go('business', 'presentation'); } }, icon('image'), 'Make presentation images')));
  }
  drawHead(); drawBody();
}
function specTable(sp) { const row = (k, v) => h('tr', null, h('td', { class: 'muted small', style: { width: '150px' } }, k), h('td', null, v)); return h('table', { class: 't' }, h('tbody', null, row('Materials', sp.materials), row('Standalone textures', sp.textures), row('Maps per material', sp.mapLabels.join(', ') || '-'), row('Resolution', sp.resolutions.join(', ') || '-'), row('File format', sp.format + (sp.optimized ? ` + optimized ${sp.optimized} px` : '')), row('Color spaces', 'Base color and emission sRGB, other maps linear'), row('Tileable', sp.tileable ? 'Yes, seamless' : 'No'), row('Map source', sp.estimated ? 'Some maps estimated from images' : 'Procedural or hand-made'))); }
function autoDescription(p) {
  const sp = specs(p);
  return `${p.name} is a set of ${sp.materials || sp.textures} ${sp.tileable ? 'seamless, tileable ' : ''}PBR ${sp.materials ? 'materials' : 'textures'} for ${(p.apps || []).join(', ') || 'any PBR renderer'}.\n\nIncluded maps: ${sp.mapLabels.join(', ') || 'base color'}.\nResolution: ${sp.resolutions.join(', ')}${sp.optimized ? `, plus optimized ${sp.optimized} px versions` : ''}.\nFormat: ${sp.format}. Base color is sRGB; all other maps are linear data.\n\nEvery material is organized in its own folder with clear names, and the pack includes setup notes for each supported application.`;
}
function readme(p, tpl) {
  const sp = specs(p); const lic = S.get(p.licenseId); const owner = S.settings().owner || 'the author';
  return `${p.name}\nVersion ${p.version}\n${'='.repeat(p.name.length)}\n\n${p.description || p.shortDescription || ''}\n\nCONTENTS\n- ${sp.materials} material(s), ${sp.textures} standalone texture(s)\n- Maps: ${sp.mapLabels.join(', ') || '-'}\n- Resolution: ${sp.resolutions.join(', ') || '-'}\n- Format: ${tpl.format}${tpl.includeOptimized ? `, optimized copies at ${tpl.optimizedSize} px` : ''}\n- Color spaces: base color and emission are sRGB. Normal, roughness, metallic, AO, height and opacity are linear (Non-Color).\n- Normal maps: OpenGL (Y+) unless the folder name says DirectX.\n${sp.estimated ? '- Note: some maps were derived from the base color image.\n' : ''}\nSUPPORTED APPLICATIONS\n${(p.apps || []).map(a => '- ' + a).join('\n')}\n\nLICENSE\n${lic ? lic.name : 'See LICENSE.txt'}. Full terms in LICENSE.txt.\n\nCreated by ${owner}.`;
}
function install(p) {
  const parts = { 'Unreal Engine': 'UNREAL ENGINE\n1. Drag the texture files into the Content Browser.\n2. For normal maps, set Compression to Normalmap. If the bumps look inverted, enable Flip Green Channel.\n3. Turn sRGB off on roughness, metallic, AO, ORM and height textures.\n4. Create a Material, connect Base Color, Normal, Roughness, Metallic and AO.', 'Unity': 'UNITY\n1. Copy the folders into your Assets folder.\n2. Select each normal map and set Texture Type to Normal map.\n3. Turn sRGB (Color Texture) off for metallic, AO and height maps.\n4. Create a Lit material and assign the maps.', 'Godot': 'GODOT\n1. Copy the folders into your project.\n2. Create a StandardMaterial3D and assign Albedo, Normal Map, Roughness, Metallic and AO.\n3. Godot uses OpenGL normal maps, which matches these files.', 'Blender': 'BLENDER\n1. Add an Image Texture node per map (Node Wrangler: Ctrl+Shift+T on the Principled BSDF does it in one step).\n2. Set Color Space to Non-Color for every map except base color and emission.\n3. Connect the normal map through a Normal Map node.\n4. For height, use a Displacement node with Midlevel 0.5.' };
  return (p.apps || []).filter(a => parts[a]).map(a => parts[a]).join('\n\n') || 'Assign base color to the color input, normal to the normal input (through a normal map node), and set every map except base color and emission to linear / Non-Color.';
}
function qcReport(p) { return `QUALITY CONTROL REPORT\n${p.name} v${p.version}\nChecked: ${new Date(p.qc.date).toLocaleString()}\nResult: ${verdict(p.qc, p.qcManual).toUpperCase()}\n\n` + p.qc.results.map(r => { const c = QC_CHECKS.find(x => x[0] === r.id); return `[${r.status.toUpperCase()}] ${c[1]}${c[2] ? ' (required)' : ''}${p.qcManual[r.id] ? ' . signed off' : ''}\n    ${r.msg}`; }).join('\n'); }
const bump = v => { const m = String(v || '1.0.0').split('.').map(Number); m[2] = (m[2] || 0) + 1; return m.join('.'); };

async function buildPackage(p, tpl) {
  const mats = (p.materialIds || []).map(S.get).filter(Boolean), tex = (p.textureIds || []).map(S.get).filter(t => t && !t.deleted);
  if (!mats.length && !tex.length) return toast('Add materials or textures to the product first', 'warn');
  const v = verdict(p.qc, p.qcManual); if (v !== 'pass' && !(await confirmDlg(`Quality control is "${v}". Build the package anyway for testing?`, { ok: 'Build anyway' }))) return;
  const t = task('Building package'); const z = new ZipWriter(); const root = (tpl.root || '{product}').replace('{product}', S.safeName(p.name)) + '/'; const added = [];
  const add = async (path, blob) => { await z.add(root + path, blob); added.push({ path: root + path, size: blob.size }); };
  try {
    const base = applyPreset(defaultOptions(), EXPORT_PRESETS.find(x => x.id === tpl.preset) || EXPORT_PRESETS[0]); base.format = tpl.format; base.keepSize = true; base.pack = null; base.organize = 'flat';
    if (!FORMATS[base.format].bits.includes(base.bits)) base.bits = 8;
    const groups = []; for (const m of mats) groups.push({ folder: S.safeName(m.name) + '/', items: await itemsFromMaterial(m) }); if (tex.length) { const items = []; for (const x of tex) items.push(await itemFromTexture(x)); groups.push({ folder: 'Textures/', items }); }
    const total = groups.reduce((a, g) => a + g.items.length, 0) * (1 + (tpl.includeOptimized ? 1 : 0) + (tpl.includeEngineVersions || []).length); let n = 0;
    for (const g of groups) for (const it of g.items) {
      t.update(n++ / total, 'Packaging ' + it.name); const r = await encode(it.canvas, { ...base, sourceNormalY: it.normalY }, it.mapType); await add(`${tpl.main}/${g.folder}${fileName(base, { ...it, w: r.w, h: r.h }, FORMATS[base.format].ext)}`, r.blob);
      if (tpl.includeOptimized && Math.max(it.canvas.width, it.canvas.height) > tpl.optimizedSize) { t.update(n++ / total); const o = { ...base, keepSize: false, width: tpl.optimizedSize, height: Math.round(tpl.optimizedSize * it.canvas.height / it.canvas.width) }; const r2 = await encode(it.canvas, { ...o, sourceNormalY: it.normalY }, it.mapType); await add(`${tpl.optimized}/${g.folder}${fileName(o, { ...it, w: r2.w, h: r2.h }, FORMATS[o.format].ext)}`, r2.blob); }
    }
    for (const id of tpl.includeEngineVersions || []) {
      const pr = EXPORT_PRESETS.find(x => x.id === id); const o = applyPreset(defaultOptions(), pr); o.keepSize = true; o.organize = 'flat';
      for (const g of groups) {
        let items = g.items.map(i => ({ ...i }));
        if (o.pack) { const { pack } = await import('../core/pbr.js'); const { getData, fromData } = await import('../core/img.js'); const by = Object.fromEntries(items.filter(i => ['ao', 'roughness', 'metallic'].includes(i.mapType)).map(i => [i.mapType, i])); if (Object.keys(by).length >= 2) { const f = Object.values(by)[0]; const w = f.canvas.width, hh = f.canvas.height; items = items.filter(i => !by[i.mapType]); items.push({ ...f, mapType: o.pack, canvas: fromData(pack(o.pack, Object.fromEntries(Object.entries(by).map(([k, i]) => [k, getData(i.canvas.width === w ? i.canvas : resize(i.canvas, w, hh))])), w, hh)) }); } }
        for (const it of items) { t.update(n++ / total, pr.name + ': ' + it.name); const r = await encode(it.canvas, { ...o, sourceNormalY: it.normalY, space: ['ORM', 'MaskMap', 'MetallicSmoothness'].includes(it.mapType) ? 'linear' : o.space }, it.mapType); await add(`Engine_Ready/${pr.name.replace(/\W+/g, '_')}/${g.folder}${fileName(o, { ...it, w: r.w, h: r.h }, FORMATS[o.format].ext)}`, r.blob); }
      }
    }
    for (const pid of p.previewIds || []) { const x = S.get(pid); if (x && !x.deleted) await add(`${tpl.previews}/${S.safeName(x.name)}.png`, await S.getBlob(x.blobId)); }
    if (tpl.includeRenders && mats.length) {
      t.update(0.95, 'Rendering spheres'); const { createViewer, loadMaterialCanvases } = await import('../core/viewer.js'); const V = createViewer(null, { width: 1024, height: 1024 }); V.set({ bg: '#1b1e24' });
      try { for (const m of mats) { const { maps } = await loadMaterialCanvases(S, m.id); V.setMaps(maps); V.set({ normalY: m.settings?.normalY || 'OpenGL', displacement: 0.02 }); await new Promise(r => setTimeout(r, 120)); const url = V.snapshot(1024, 1024); await add(`${tpl.renders}/${S.safeName(m.name)}_sphere.png`, await (await fetch(url)).blob()); } } finally { V.dispose(); }
    }
    const lic = S.get(p.licenseId); const owner = S.settings().owner || 'The Author';
    await add(`${tpl.docs}/README.txt`, new Blob([readme(p, tpl)])); await add(`${tpl.docs}/INSTALL.txt`, new Blob([install(p)]));
    await add(`${tpl.docs}/LICENSE.txt`, new Blob([(lic?.body || 'All rights reserved.').replace(/\{product\}/g, p.name).replace(/\{owner\}/g, owner).replace(/\{year\}/g, new Date().getFullYear())]));
    await add(`${tpl.docs}/VERSION.txt`, new Blob([`${p.name}\nCurrent version: ${p.version}\n\nCHANGELOG\n` + [...(p.versions || [])].reverse().map(v => `${v.v} (${new Date(v.date).toISOString().slice(0, 10)}): ${v.notes || ''}`).join('\n')]));
    await add(`${S.safeName(p.name)}_product.json`, new Blob([JSON.stringify({ name: p.name, version: p.version, category: p.category, description: p.description, apps: p.apps, specs: specs(p), license: lic?.name, built: new Date().toISOString(), qc: verdict(p.qc, p.qcManual), files: added.map(a => a.path) }, null, 2)]));
    const blob = z.blob(); const name = `${S.safeName(p.name)}_v${p.version}.zip`; download(blob, name);
    p.packages = [...(p.packages || []), { date: Date.now(), name, size: blob.size, files: added.length, version: p.version }]; p.exportFiles = [...(p.exportFiles || []), ...added.map(a => ({ ...a, date: Date.now(), preset: 'package' }))];
    if (p.status === 'Quality Check' && v === 'pass') p.status = 'Ready for Export'; await S.save(p);
    await S.save({ type: 'exportlog', name: 'Package ' + p.name, ok: true, format: 'ZIP', files: added.length, size: blob.size, where: 'ZIP ' + name, productId: p.id, paths: added.map(a => a.path) });
    await S.log('export', `Packaged "${p.name}" v${p.version}: ${added.length} files, ${fmtBytes(blob.size)}`); t.done(); toast(`Package built: ${added.length} files, ${fmtBytes(blob.size)}`, 'ok', 6000);
  } catch (e) { t.fail(e); toast('Packaging failed: ' + e.message, 'bad', 7000); S.err('Packaging', e); await S.save({ type: 'exportlog', name: 'Package ' + p.name, ok: false, errors: [e.message], files: 0 }); }
}
export { TEMPLATES };
