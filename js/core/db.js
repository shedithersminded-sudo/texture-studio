// IndexedDB layer. Stores: meta (plain auth config), items (encrypted records), blobs (encrypted binaries).
// To move to server or local-file storage later, replace this file with the same API.
const NAME = 'ultimate-texture-studio';
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('meta');
      d.createObjectStore('items', { keyPath: 'id' }).createIndex('type', 'type');
      d.createObjectStore('blobs', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function run(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
    const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  });
}
export const meta = {
  get: k => run('meta', 'readonly', s => s.get(k)),
  set: (k, v) => run('meta', 'readwrite', s => s.put(v, k)),
  del: k => run('meta', 'readwrite', s => s.delete(k)),
  all: async () => { const keys = await run('meta', 'readonly', s => s.getAllKeys()); const out = {}; for (const k of keys) out[k] = await meta.get(k); return out; },
};
export const items = {
  all: () => run('items', 'readonly', s => s.getAll()),
  put: v => run('items', 'readwrite', s => s.put(v)),
  del: id => run('items', 'readwrite', s => s.delete(id)),
};
export const blobs = {
  get: id => run('blobs', 'readonly', s => s.get(id)),
  put: v => run('blobs', 'readwrite', s => s.put(v)),
  del: id => run('blobs', 'readwrite', s => s.delete(id)),
  keys: () => run('blobs', 'readonly', s => s.getAllKeys()),
};
export async function wipeAll() {
  for (const s of ['meta', 'items', 'blobs']) await run(s, 'readwrite', st => st.clear());
}
export async function bulkPut(store, list) {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); const s = t.objectStore(store); for (const v of list) store === 'meta' ? s.put(v.value, v.key) : s.put(v); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
