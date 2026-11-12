// Encrypted record store with an in-memory cache. Every record is JSON encrypted with the data key.
import * as db from './db.js';
import { encrypt, decrypt, sha256hex } from './crypto.js';

const te = new TextEncoder(), td = new TextDecoder();
let KEY = null;
const cache = new Map();
const listeners = new Set();
const blobCache = new Map();
const urlCache = new Map();

export const uid = (p = 'x') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const setKey = k => { KEY = k; };
export const hasKey = () => !!KEY;
export const on = f => { listeners.add(f); return () => listeners.delete(f); };
const emit = (type, obj) => listeners.forEach(f => { try { f(type, obj); } catch (e) { console.error(e); } });

export async function loadAll() {
  cache.clear(); let bad = 0;
  for (const it of await db.items.all()) {
    try { cache.set(it.id, JSON.parse(td.decode(await decrypt(KEY, it.iv, it.data)))); } catch { bad++; }
  }
  if (bad) console.warn(bad + ' records could not be decrypted');
  return bad;
}
export function all(type, pred) { const out = []; for (const o of cache.values()) if (o.type === type && (!pred || pred(o))) out.push(o); return out; }
export const get = id => cache.get(id);
export const count = type => all(type).length;
export async function save(obj, { touch = true, silent = false } = {}) {
  if (!obj.type) throw new Error('Record needs a type');
  obj.id ||= uid(obj.type.slice(0, 3));
  const now = Date.now(); obj.created ||= now; if (touch) obj.modified = now;
  cache.set(obj.id, obj);
  const { iv, data } = await encrypt(KEY, te.encode(JSON.stringify(obj)));
  await db.items.put({ id: obj.id, type: obj.type, iv, data });
  if (!silent) emit(obj.type, obj);
  return obj;
}
export async function remove(id) { const o = cache.get(id); cache.delete(id); await db.items.del(id); if (o) emit(o.type, o); }

// ---------- binary blobs ----------
export async function putBlob(id, blob) {
  const buf = await blob.arrayBuffer();
  const { iv, data } = await encrypt(KEY, buf);
  await db.blobs.put({ id, iv, data, size: buf.byteLength, mime: blob.type || 'application/octet-stream' });
  blobCache.delete(id); dropURL(id);
  return { size: buf.byteLength, hash: await sha256hex(buf) };
}
export async function getBlob(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const r = await db.blobs.get(id); if (!r) return null;
  const b = new Blob([await decrypt(KEY, r.iv, r.data)], { type: r.mime });
  blobCache.set(id, b); if (blobCache.size > 60) blobCache.delete(blobCache.keys().next().value);
  return b;
}
export async function delBlob(id) { blobCache.delete(id); dropURL(id); await db.blobs.del(id); }
export async function blobURL(id) { if (urlCache.has(id)) return urlCache.get(id); const b = await getBlob(id); if (!b) return null; const u = URL.createObjectURL(b); urlCache.set(id, u); return u; }
function dropURL(id) { const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); } }

// ---------- settings ----------
export const MATERIAL_CATEGORIES = ['Wood', 'Metal', 'Concrete', 'Stone', 'Marble', 'Granite', 'Brick', 'Ceramic', 'Glass', 'Plastic', 'Rubber', 'Leather', 'Fabric', 'Cloth', 'Paper', 'Sand', 'Soil', 'Grass', 'Leaves', 'Water', 'Ice', 'Snow', 'Rust', 'Dirt', 'Asphalt', 'Carbon fiber', 'Painted surfaces', 'Industrial materials', 'Fantasy materials', 'Sci-fi materials', 'Abstract patterns'];
export const PROJECT_CATEGORIES = ['Game_Assets', 'Environment_Assets', 'Character_Assets', 'Prop_Assets', 'Architecture', 'Experimental'];
export const DEFAULT_TREE = `ULTIMATE_TEXTURE_STUDIO
  01_ADMINISTRATION
    Security
    Settings
    Backups
    System_Logs
  02_PROJECTS
    Game_Assets
    Environment_Assets
    Character_Assets
    Prop_Assets
    Architecture
    Experimental
  03_TEXTURE_LIBRARY
    Wood
    Metal
    Stone
    Concrete
    Fabric
    Leather
    Glass
    Plastic
    Organic
    Nature
    SciFi
    Fantasy
    Custom
  04_MATERIALS
    PBR_Materials
    Stylized_Materials
    Realistic_Materials
    Procedural_Materials
  05_TEXTURE_MAPS
    BaseColor
    Normal
    Roughness
    Metallic
    Height
    Displacement
    AmbientOcclusion
    Opacity
    Emission
  06_EXPORTS
    Unreal_Engine
    Unity
    Godot
    Blender
    Generic_PBR
    Marketplace_Packages
  07_BUSINESS
    Product_Catalog
    Pricing
    Product_Descriptions
    Marketing
    Licensing
    Sales_Records
    Expenses
    Revenue
  08_REFERENCE_LIBRARY
    Reference_Images
    Inspiration
    Tutorials
    Technical_Documentation
  09_ARCHIVES
    Completed_Projects
    Old_Versions
    Retired_Assets`;
export const DASH_WIDGETS = ['actions', 'stats', 'recentProjects', 'recentTextures', 'materials', 'presets', 'collections', 'business', 'academy', 'exports', 'backup'];
const DEFAULTS = {
  id: 'settings', type: 'settings',
  theme: 'clear', plastic: 'clear', accent: '#7c9cff', mode: 'advanced', autosaveSec: 60, undoDepth: 40, defaultSize: 1024,
  idleMin: 30, rememberIdleMin: 240, sidebarCollapsed: false, normalY: 'OpenGL',
  dashboard: { order: DASH_WIDGETS.slice(), hidden: [] },
  security: { totpSecret: null, email: '', reauthMin: 5 },
  ai: { enabled: false, endpoint: 'https://api.openai.com/v1/images/generations', model: 'gpt-image-1', key: '', size: '1024x1024' },
  backup: { auto: false, everyHours: 24, last: 0, keep: 10, folderName: '' },
  structure: DEFAULT_TREE, customCategories: [], savedSearches: [],
};
export function settings() {
  let s = cache.get('settings');
  if (!s) { s = structuredClone(DEFAULTS); cache.set('settings', s); }
  for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = structuredClone(v);
  return s;
}
export async function saveSettings(patch = {}) { const s = settings(); Object.assign(s, patch); await save(s); return s; }
export const categories = () => [...MATERIAL_CATEGORIES, ...settings().customCategories];

// ---------- logs ----------
export async function log(kind, msg, level = 'info', extra = {}) {
  if (!KEY) return;
  await save({ type: 'log', kind, msg, level, ...extra }, { silent: kind !== 'activity' });
  const logs = all('log');
  if (logs.length > 1500) { logs.sort((a, b) => a.created - b.created); for (const l of logs.slice(0, 200)) await remove(l.id); }
}
export const err = (msg, e) => { console.error(msg, e); log('error', msg + (e ? ': ' + (e.message || e) : ''), 'error'); };

// ---------- textures ----------
export const PROJECT_SUBFOLDERS = ['Original_Images', 'Generated_Textures', 'Edited_Textures', 'Materials', 'Previews', 'Exports'];
export function projectPath(p) { return p ? `02_PROJECTS/${p.category || 'Experimental'}/${safeName(p.name)}` : null; }
export function defaultFolder(kind, projectId, extra) {
  const p = projectId && get(projectId);
  const sub = { original: 'Original_Images', generated: 'Generated_Textures', edited: 'Edited_Textures', map: 'Materials', preview: 'Previews' }[kind] || 'Edited_Textures';
  if (p) return `${projectPath(p)}/${sub}${kind === 'map' && extra ? '/' + safeName(extra) : ''}`;
  if (kind === 'map') return '05_TEXTURE_MAPS';
  if (kind === 'preview') return '07_BUSINESS/Marketing';
  return '03_TEXTURE_LIBRARY/Custom';
}
export const safeName = s => String(s || 'untitled').trim().replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'untitled';

export async function canvasToBlob(c, type = 'image/png', q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not encode image')), type, q)); }
export function thumbOf(c, size = 192) {
  const s = Math.min(1, size / Math.max(c.width, c.height));
  const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(c.width * s)); t.height = Math.max(1, Math.round(c.height * s));
  const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/webp', 0.82);
}
// Store a canvas as a texture record. Pixel data is kept as lossless PNG inside the encrypted blob store.
export async function saveTexture(c, rec) {
  const id = rec.id || uid('tex'); const blobId = 'b_' + id + '_' + Date.now().toString(36);
  const blob = await canvasToBlob(c);
  const { size, hash } = await putBlob(blobId, blob);
  const old = rec.blobId && rec.blobId !== blobId ? rec.blobId : null;
  const t = Object.assign(rec, {
    id, type: 'texture', blobId, size, hash, width: c.width, height: c.height, thumb: thumbOf(c),
    format: rec.format || 'PNG', kind: rec.kind || 'edited', version: rec.version || 1, tags: rec.tags || [],
    folder: rec.folder || defaultFolder(rec.kind || 'edited', rec.projectId, rec.materialName),
  });
  await save(t);
  if (old) await delBlob(old);
  return t;
}
export async function textureCanvas(id) {
  const t = typeof id === 'string' ? get(id) : id; if (!t) throw new Error('Texture not found');
  const b = await getBlob(t.blobId); if (!b) throw new Error('Image data missing for ' + t.name);
  const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0); bmp.close?.();
  return c;
}
export const liveTextures = pred => all('texture', t => !t.deleted && (!pred || pred(t)));
export function versionsOf(t) {
  const root = rootOf(t); const out = [];
  for (const x of all('texture', x => !x.deleted)) if (rootOf(x).id === root.id) out.push(x);
  return out.sort((a, b) => (a.version || 1) - (b.version || 1) || a.created - b.created);
}
export function rootOf(t) { let r = t, n = 0; while (r.parentId && get(r.parentId) && n++ < 200) r = get(r.parentId); return r; }
export async function trashTexture(t) { t.deleted = Date.now(); await save(t); await log('activity', `Moved "${t.name}" to trash`); }
export async function purgeTexture(t) { if (t.blobId) await delBlob(t.blobId); for (const l of t.doc?.layers || []) if (l.blobId) await delBlob(l.blobId); await remove(t.id); }
export function touchRecent(kind, id) {
  const s = settings(); s.recent ||= {}; const list = (s.recent[kind] ||= []);
  const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); list.unshift(id); list.length = Math.min(list.length, 20);
  save(s, { silent: true });
}
export const recent = kind => (settings().recent?.[kind] || []).map(get).filter(x => x && !x.deleted);
