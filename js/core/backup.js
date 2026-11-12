// Backups contain the encrypted records and images exactly as stored, plus the wrapped keys.
// Restoring needs the password (or a recovery code) that was valid when the backup was made.
import * as db from './db.js';
import * as S from './store.js';
import { b64, unb64 } from './crypto.js';
import { ZipWriter, readZip } from './zip.js';
import { task } from './ui.js';

export async function createBackup(label = 'manual') {
  const t = task('Creating backup');
  try {
    const z = new ZipWriter(); const meta = await db.meta.all(); delete meta.backupDir;
    const items = (await db.items.all()).map(i => ({ id: i.id, type: i.type, iv: b64(i.iv), data: b64(i.data) }));
    const keys = await db.blobs.keys(); const blobInfo = [];
    for (let i = 0; i < keys.length; i++) {
      const r = await db.blobs.get(keys[i]); const u = new Uint8Array(12 + r.data.byteLength); u.set(r.iv, 0); u.set(new Uint8Array(r.data), 12);
      await z.add('blobs/' + r.id + '.bin', u, { compress: false }); blobInfo.push({ id: r.id, mime: r.mime, size: r.size }); t.update(i / keys.length * 0.9);
    }
    const manifest = { app: 'Ultimate Texture Studio', format: 1, created: Date.now(), label, items: items.length, blobs: blobInfo.length };
    await z.add('manifest.json', JSON.stringify(manifest, null, 1)); await z.add('meta.json', JSON.stringify(meta)); await z.add('items.json', JSON.stringify(items)); await z.add('blobs.json', JSON.stringify(blobInfo));
    const blob = z.blob(); t.done(); return { blob, manifest };
  } catch (e) { t.fail(e); throw e; }
}
export async function verifyBackup(blob) {
  const files = await readZip(blob); const td = new TextDecoder();
  const m = JSON.parse(td.decode(files.get('manifest.json'))); const items = JSON.parse(td.decode(files.get('items.json'))); const blobs = JSON.parse(td.decode(files.get('blobs.json')));
  if (m.app !== 'Ultimate Texture Studio') throw new Error('This is not a Texture Studio backup.');
  if (items.length !== m.items || blobs.length !== m.blobs) throw new Error('Backup counts do not match its manifest.');
  for (const b of blobs) if (!files.has('blobs/' + b.id + '.bin')) throw new Error('Backup is missing image ' + b.id);
  return { manifest: m, files, items, blobs, meta: JSON.parse(td.decode(files.get('meta.json'))) };
}
export async function restoreBackup(file) {
  const v = await verifyBackup(file); const t = task('Restoring backup');
  try {
    const dir = await db.meta.get('backupDir');
    await db.wipeAll();
    await db.bulkPut('meta', Object.entries(v.meta).map(([key, value]) => ({ key, value })));
    if (dir) await db.meta.set('backupDir', dir);
    await db.bulkPut('items', v.items.map(i => ({ id: i.id, type: i.type, iv: unb64(i.iv), data: unb64(i.data).buffer })));
    const list = []; for (const b of v.blobs) { const u = v.files.get('blobs/' + b.id + '.bin'); list.push({ id: b.id, mime: b.mime, size: b.size, iv: u.slice(0, 12), data: u.slice(12).buffer }); if (list.length > 40) { await db.bulkPut('blobs', list.splice(0)); } }
    if (list.length) await db.bulkPut('blobs', list);
    t.done(); return v.manifest;
  } catch (e) { t.fail(e); throw e; }
}
// ---- backup folder (File System Access API, Chrome and Edge) ----
export const folderSupported = () => 'showDirectoryPicker' in window;
export async function chooseFolder() { const d = await window.showDirectoryPicker({ id: 'uts-backups', mode: 'readwrite' }); await db.meta.set('backupDir', d); await S.saveSettings({ backup: { ...S.settings().backup, folderName: d.name } }); return d; }
export async function folder(ask = false) {
  const d = await db.meta.get('backupDir'); if (!d) return null;
  let p = await d.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && ask) p = await d.requestPermission({ mode: 'readwrite' });
  return p === 'granted' ? d : null;
}
export async function writeToFolder(d, blob, name) {
  const fh = await d.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(blob); await w.close();
  const back = await (await d.getFileHandle(name)).getFile(); await verifyBackup(back);
  const keep = S.settings().backup.keep || 10; const names = []; for await (const [n] of d.entries()) if (/^TextureStudio_Backup_.*\.zip$/.test(n)) names.push(n);
  names.sort(); while (names.length > keep) await d.removeEntry(names.shift());
}
export const backupName = () => 'TextureStudio_Backup_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.zip';
export async function recordBackup(manifest, where, ok = true, error) {
  await S.save({ type: 'backup', ...manifest, where, ok, error }); const b = S.settings().backup; b.last = Date.now(); await S.saveSettings({ backup: b });
  await S.log('backup', (ok ? 'Backup saved: ' : 'Backup failed: ') + where + (error ? ' (' + error + ')' : ''), ok ? 'info' : 'error');
}
export function backupDue() { const b = S.settings().backup; return b.auto && Date.now() - (b.last || 0) > b.everyHours * 3600000; }
export async function autoBackupTick() {
  if (!S.hasKey() || !backupDue()) return;
  const d = await folder(false);
  if (!d) { const { nav } = await import('./nav.js'); nav.status('Automatic backup is due. Open Admin, Backups to grant folder access.'); return; }
  try { const { blob, manifest } = await createBackup('automatic'); await writeToFolder(d, blob, backupName()); await recordBackup(manifest, 'folder: ' + d.name); }
  catch (e) { await recordBackup({ created: Date.now() }, 'folder', false, e.message); }
}
