import { h, icon, clear, toast, promptDlg, confirmDlg, download, pickFiles, fmtDate, colorIn, modal } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';

const KINDS = { generation: 'Texture generation', prompt: 'Generation prompts', pbr: 'PBR configurations', export: 'Export settings', edit: 'Editing configurations', palette: 'Color palettes', resolution: 'Resolution presets' };
export default function (el, arg) {
  const page = h('div', { class: 'page' }); el.append(page); const body = h('div');
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Presets'), h('div', { class: 'sub' }, 'Your saved prompts, generator looks, PBR setups, edit settings, palettes, resolutions and export settings.')),
    h('div', { class: 'act' }, h('button', { class: 'btn', onclick: newPalette }, icon('plus'), 'Palette'), h('button', { class: 'btn', onclick: newResolution }, icon('plus'), 'Resolution'),
      h('button', { class: 'btn', onclick: importPresets }, icon('upload'), 'Import'), h('button', { class: 'btn', onclick: () => exportPresets(S.all('preset')) }, icon('download'), 'Export all'))), body);
  function draw() {
    clear(body); const all = S.all('preset');
    if (!all.length) body.append(h('div', { class: 'empty' }, 'No presets yet. Use the Save preset buttons in the Generator, Editor, PBR Materials and Export Center.'));
    for (const [k, label] of Object.entries(KINDS)) {
      const list = all.filter(p => p.kind === k).sort((a, b) => a.name.localeCompare(b.name)); if (!list.length) continue;
      body.append(h('h3', { style: { marginTop: '16px' } }, label), h('table', { class: 't' }, h('tbody', null, list.map(p => h('tr', { style: { background: p.id === arg ? 'color-mix(in srgb,var(--accent) 10%,transparent)' : null } },
        h('td', null, h('b', null, p.name), p.kind === 'palette' ? h('span', { class: 'row', style: { display: 'inline-flex', marginLeft: '8px' } }, p.data.colors.map(c => h('span', { class: 'swatch', style: { background: c, width: '16px', height: '16px' } }))) : null, p.kind === 'resolution' ? h('span', { class: 'muted' }, ' ' + p.data.w + ' x ' + p.data.h) : null, p.kind === 'prompt' ? h('div', { class: 'small muted' }, p.data.prompt) : null),
        h('td', { class: 'small muted' }, fmtDate(p.modified)),
        h('td', { style: { textAlign: 'right' } }, use(p), h('button', { class: 'btn ghost sm', title: 'Rename', onclick: async () => { const n = await promptDlg('New name', p.name); if (n) { p.name = n; await S.save(p); draw(); } } }, icon('edit')), h('button', { class: 'btn ghost sm', title: 'Duplicate', onclick: async () => { const { id, created, modified, ...r } = p; await S.save({ ...structuredClone(r), name: p.name + ' copy' }); draw(); } }, icon('copy')), h('button', { class: 'btn ghost sm', title: 'Export as file', onclick: () => exportPresets([p]) }, icon('download')), h('button', { class: 'btn ghost sm', title: 'Delete', onclick: async () => { if (await confirmDlg(`Delete preset "${p.name}"?`, { danger: true })) { await S.remove(p.id); draw(); } } }, icon('trash'))))))));
    }
  }
  const use = p => { const go = { generation: () => nav.go('generate', p.id), prompt: () => nav.go('generate', p.id), export: () => nav.go('export'), pbr: () => nav.go('pbr'), edit: () => nav.go('editor'), palette: () => { nav.handoff.genParams = null; nav.go('generate'); }, resolution: () => nav.go('export') }[p.kind]; return h('button', { class: 'btn sm', onclick: go }, 'Use'); };
  async function newPalette() { const cols = ['#4a2c1a', '#8a5a36', '#d2a46c']; const name = h('input', { type: 'text', value: 'My palette' }); const ok = await modal({ title: 'New color palette', body: h('div', null, h('div', { class: 'f' }, h('label', null, 'Name'), name), h('div', { class: 'row' }, cols.map((c, i) => colorIn(c, v => cols[i] = v)))), actions: [{ label: 'Cancel', value: false }, { label: 'Save', cls: 'pri', value: true }] }); if (ok) { await S.save({ type: 'preset', kind: 'palette', name: name.value, data: { colors: cols } }); draw(); } }
  async function newResolution() { const r = await promptDlg('Width x height', '3072x3072', { title: 'New resolution preset' }); const m = r?.match(/(\d+)\s*[x*, ]\s*(\d+)/); if (m) { await S.save({ type: 'preset', kind: 'resolution', name: m[1] + ' x ' + m[2], data: { w: Math.min(8192, +m[1]), h: Math.min(8192, +m[2]) } }); draw(); } }
  function exportPresets(list) { download(new Blob([JSON.stringify({ app: 'Ultimate Texture Studio', kind: 'presets', presets: list.map(({ id, created, modified, ...r }) => r) }, null, 2)], { type: 'application/json' }), (list.length === 1 ? S.safeName(list[0].name) : 'presets') + '.utspreset.json'); }
  async function importPresets() {
    const [f] = await pickFiles({ accept: '.json', multiple: false }); if (!f) return;
    try { const j = JSON.parse(await f.text()); if (j.kind !== 'presets' || !Array.isArray(j.presets)) throw new Error('Not a Texture Studio preset file.'); let n = 0; for (const p of j.presets) { if (!KINDS[p.kind] || !p.name || typeof p.data !== 'object') continue; await S.save({ type: 'preset', kind: p.kind, name: String(p.name).slice(0, 80), data: p.data }); n++; } toast(`Imported ${n} preset(s)`, 'ok'); draw(); }
    catch (e) { toast('Import failed: ' + e.message, 'bad'); }
  }
  draw();
}
