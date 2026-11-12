// Shared navigation state so sections can move around without importing the shell.
export const NAV = [
  ['dashboard', 'Dashboard', 'dashboard', 'Studio'],
  ['generate', 'Texture Generator', 'wand'],
  ['editor', 'Texture Editor', 'brush'],
  ['pbr', 'PBR Materials', 'layers'],
  ['library', 'Texture Library', 'library'],
  ['import', 'Import Center', 'upload'],
  ['preview', '3D Preview', 'cube'],
  ['export', 'Export Center', 'download'],
  ['projects', 'Project Manager', 'folder'],
  ['business', 'Business Center', 'briefcase', 'Business'],
  ['academy', 'Texture Creator Academy', 'academy', 'Learn'],
  ['admin', 'Admin Panel', 'shield', 'System'],
  ['settings', 'Settings', 'settings'],
  ['help', 'Help Center', 'help'],
];
// Routable pages reached from inside other sections (not in the sidebar).
export const HIDDEN = [['presets', 'Presets', 'star'], ['compare', 'Texture Comparison', 'compare']];
export const nav = {
  ctrl: null, current: null, arg: null, _status: () => { }, _top: () => { }, _crumbs: () => { },
  go(id, arg) { const h = '#/' + id + (arg != null && arg !== '' ? '/' + encodeURIComponent(arg) : ''); if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; },
  status(msg) { this._status(msg); },
  refresh() { this._top(); },
  crumbs(...parts) { this._crumbs(parts); },
  // Hand-off slots for passing objects between sections (e.g. generated data to PBR)
  handoff: {},
};
