import { h, icon, clear, select, slider, check, panel, toast, promptDlg, confirmDlg } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { applyLook } from '../app.js';

const ACCENTS = ['#7c9cff', '#a78bfa', '#f472b6', '#fb7185', '#f59e0b', '#34d399', '#22d3ee', '#e5e7eb'];
export default function (el) {
  const s = S.settings(); const page = h('div', { class: 'page', style: { maxWidth: '900px' } }); el.append(page);
  const set = (k, after) => async v => { s[k] = v; await S.save(s); applyLook(); after?.(); };
  const lookHolder = () => { const box = h('div', { class: 'f' }); import('../app.js').then(m => box.append(m.lookControls(() => { Object.assign(s, S.settings()); draw(); }))); return box; };
  const draw = () => {
    clear(page);
    page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Settings'), h('div', { class: 'sub' }, 'Interface and workflow preferences. Security, storage, backups and integrations live in the Admin Panel.')), h('div', { class: 'act' }, h('button', { class: 'btn', onclick: () => nav.go('admin') }, icon('shield'), 'Admin Panel'))));
    page.append(panel('Appearance', [
      lookHolder(),
      h('div', { class: 'f' }, h('label', null, 'Custom accent color'), h('div', { class: 'row' }, ACCENTS.map(c => h('button', { class: 'swatch', style: { background: c, cursor: 'pointer', outline: s.accent === c ? '2px solid var(--text)' : 'none' }, onclick: () => set('accent', draw)(c) })), h('input', { type: 'color', value: s.accent, onchange: e => set('accent', draw)(e.target.value) }))),
      select('Interface mode', [['beginner', 'Beginner (simplified controls)'], ['advanced', 'Advanced (all options)']], s.mode, set('mode'), 'Beginner mode hides advanced controls across the studio. You can switch any time.'),
      check('Collapse the sidebar', s.sidebarCollapsed, v => { set('sidebarCollapsed')(v); document.querySelector('.shell')?.classList.toggle('collapsed', v); }),
    ], { iconName: 'sun' }));
    page.append(panel('Workflow', [
      slider('Editor autosave interval (seconds)', s.autosaveSec, 15, 600, 15, set('autosaveSec'), 'The editor saves your working version this often when there are changes. Leaving a page or locking also autosaves.'),
      slider('Undo history depth', s.undoDepth, 10, 100, 5, set('undoDepth'), 'More steps use more memory for large textures.'),
      select('Default new document size', [256, 512, 1024, 2048, 4096].map(n => [n, n + ' x ' + n]), s.defaultSize, v => set('defaultSize')(+v)),
      select('Preferred normal map convention', [['OpenGL', 'OpenGL (Blender, Unity, Godot)'], ['DirectX', 'DirectX (Unreal)']], s.normalY, set('normalY')),
    ], { iconName: 'brush' }));
    page.append(panel('Session', [
      slider('Lock after inactivity (minutes, 0 = never)', s.idleMin, 0, 240, 5, set('idleMin'), 'The studio signs out and clears its key from memory after this long without input.'),
      slider('Idle lock on remembered devices (minutes)', s.rememberIdleMin, 15, 1440, 15, set('rememberIdleMin')),
      slider('Admin re-authentication window (minutes)', s.security.reauthMin, 1, 60, 1, async v => { s.security.reauthMin = v; await S.save(s); }, 'How long the Admin Panel stays unlocked after you confirm your password.'),
    ], { iconName: 'lock' }));
    const cats = h('div', { class: 'row wrap' }, s.customCategories.map((c, i) => h('span', { class: 'badge acc' }, c, h('button', { class: 'btn ghost sm', style: { padding: 0 }, onclick: async () => { s.customCategories.splice(i, 1); await S.save(s); draw(); } }, icon('x')))));
    page.append(panel('Custom material categories', [h('p', { class: 'small muted' }, 'Add your own categories next to the 31 built-in ones.'), cats, h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: async () => { const n = await promptDlg('Category name', 'Crystal'); if (n && !S.categories().includes(n.trim())) { s.customCategories.push(n.trim()); await S.save(s); draw(); } } }, icon('plus'), 'Add category')], { iconName: 'tag' }));
    page.append(panel('Dashboard', [h('button', { class: 'btn sm', onclick: async () => { s.dashboard = { order: S.DASH_WIDGETS.slice(), hidden: [] }; await S.save(s); toast('Dashboard layout reset', 'ok'); } }, 'Reset dashboard layout')], { iconName: 'dashboard', open: false }));
    page.append(panel('Where my data is stored', [h('p', { class: 'small' }, 'All projects, textures and business records are stored in this browser\'s IndexedDB on this computer, encrypted with AES-256. Nothing is uploaded. Clearing site data for this page deletes everything, so keep backups (Admin Panel, Backups). The storage layer is a single module (js/core/db.js), so it can be moved to a local server or file storage later without changing the rest of the app.')], { iconName: 'folder', open: false }));
  };
  draw();
}
