// Product presentation generator: covers, renders, map sheets, comparisons and spec sheets.
import { h, add, icon, clear, select, check, toast, task, download, colorIn, text } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { newCanvas, resize } from '../core/img.js';
import { MAP_LABEL } from '../core/pbr.js';
import { pickTextures } from '../core/widgets.js';

export const TEMPLATES = [['cover', 'Product cover'], ['spheres', 'Material sphere renders'], ['balls', 'Material ball renders (cube + sphere)'], ['mapsheet', 'PBR map preview sheet'], ['closeup', 'Surface close-up'], ['texture', 'Texture preview (tiled)'], ['comparison', 'Texture comparison'], ['resolution', 'Resolution comparison'], ['feature', 'Product feature sheet'], ['spec', 'Technical specification sheet']];
const SIZES = [['1920x1080', '1920 x 1080 (16:9)'], ['1600x1200', '1600 x 1200 (4:3)'], ['2048x2048', '2048 x 2048 (square)'], ['1080x1350', '1080 x 1350 (portrait)']];
const FONT = '"Inter","Segoe UI",system-ui,sans-serif';

export function presentation(el) {
  const prods = S.all('product'); const O = { productId: nav.handoff.presentProduct || prods[0]?.id || '', materialId: '', template: 'cover', size: '1920x1080', bg: '#121418', fg: '#f2f3f5', accent: S.settings().accent, title: '', subtitle: '', labels: true, shape: 'sphere', compareId: '' };
  nav.handoff.presentProduct = null;
  const canvasBox = h('div', { class: 'card tight', style: { display: 'grid', placeItems: 'center', minHeight: '300px' } }, h('span', { class: 'muted' }, 'Choose options and press Generate.'));
  const ctrl = h('div'); let out = null;
  el.append(h('div', { class: 'split', style: { '--a': '320px', '--b': 'minmax(0,1fr)' } }, ctrl, h('div', null, canvasBox, h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => out && saveTo(true) }, icon('save'), 'Save to product previews'), h('button', { class: 'btn', onclick: () => out && out.toBlob(b => download(b, S.safeName(O.title || 'presentation') + '_' + O.template + '.png')) }, 'Download PNG'), h('button', { class: 'btn', onclick: () => out && out.toBlob(b => download(b, S.safeName(O.title || 'presentation') + '_' + O.template + '.jpg'), 'image/jpeg', 0.92) }, 'Download JPG')))));
  const mats = () => { const p = S.get(O.productId); return p ? (p.materialIds || []).map(S.get).filter(Boolean) : S.all('material'); };
  function draw() {
    clear(ctrl); const p = S.get(O.productId); if (p && !O.title) { O.title = p.name; O.subtitle = p.shortDescription || ''; }
    add(ctrl, select('Product', [['', 'No product (any material)'], ...prods.map(x => [x.id, x.name])], O.productId, v => { O.productId = v; O.title = ''; draw(); }),
      select('Layout', TEMPLATES, O.template, v => { O.template = v; draw(); }), select('Image size', SIZES, O.size, v => O.size = v),
      ['mapsheet', 'closeup', 'texture', 'comparison', 'resolution', 'cover', 'feature'].includes(O.template) ? select('Material', [['', 'First material'], ...mats().map(m => [m.id, m.name])], O.materialId, v => O.materialId = v) : null,
      O.template === 'comparison' ? h('div', { class: 'f' }, h('label', null, 'Compare with texture'), h('button', { class: 'btn sm', onclick: async () => { const t = await pickTextures(); if (t) { O.compareId = t.id; draw(); } } }, O.compareId ? S.get(O.compareId)?.name : 'Choose...')) : null,
      ['cover', 'feature'].includes(O.template) ? select('Render shape', [['sphere', 'Sphere'], ['cube', 'Cube'], ['rounded', 'Rounded box'], ['torus', 'Torus knot'], ['cylinder', 'Cylinder']], O.shape, v => O.shape = v) : null,
      text('Title', O.title, v => O.title = v), text('Subtitle', O.subtitle, v => O.subtitle = v),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Background'), colorIn(O.bg, v => O.bg = v), h('span', { class: 'lbl' }, 'Text'), colorIn(O.fg, v => O.fg = v), h('span', { class: 'lbl' }, 'Accent'), colorIn(O.accent, v => O.accent = v)),
      check('Show labels', O.labels, v => O.labels = v), h('button', { class: 'btn pri', style: { width: '100%', justifyContent: 'center' }, onclick: generate }, icon('image'), 'Generate'));
  }
  async function generate() {
    const t = task('Building presentation'); try { out = await render(O); clear(canvasBox); out.style.cssText = 'max-width:100%;height:auto;border-radius:6px'; canvasBox.append(out); t.done(); } catch (e) { t.fail(e); toast(e.message, 'bad', 6000); S.err('Presentation', e); }
  }
  async function saveTo() {
    const p = S.get(O.productId); const rec = await S.saveTexture(out, { name: (O.title || 'Presentation') + ' ' + TEMPLATES.find(x => x[0] === O.template)[1], kind: 'preview', projectId: p?.projectIds?.[0] || null, format: 'PNG', folder: '07_BUSINESS/Marketing', tags: ['presentation', O.template] });
    if (p) { p.previewIds = [...(p.previewIds || []), rec.id]; await S.save(p); toast('Saved and added to the product previews', 'ok'); } else toast('Saved to the library (Marketing folder)', 'ok');
  }
  draw();
}

async function renders(materials, shapes, size) {
  const { createViewer, loadMaterialCanvases } = await import('../core/viewer.js'); const V = createViewer(null, { width: size, height: size }); const out = [];
  try { V.set({ bg: null, displacement: 0.02 }); for (const m of materials) for (const sh of shapes) { const { maps } = await loadMaterialCanvases(S, m.id); V.setShape(sh); V.setMaps(maps); V.set({ normalY: m.settings?.normalY || 'OpenGL' }); if (sh === 'cube' || sh === 'rounded') V.scene.children.at(-1).rotation.set(0.45, 0.7, 0); await new Promise(r => setTimeout(r, 60)); const img = await loadImg(V.snapshot(size, size)); out.push({ m, sh, img }); } }
  finally { V.dispose(); }
  return out;
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image failed')); i.src = src; });

export async function render(O) {
  const [W, H] = O.size.split('x').map(Number); const c = newCanvas(W, H), x = c.getContext('2d'); const u = Math.min(W, H) / 1000;
  const p = S.get(O.productId); const mats = p ? (p.materialIds || []).map(S.get).filter(Boolean) : S.all('material'); const mat = S.get(O.materialId) || mats[0];
  x.fillStyle = O.bg; x.fillRect(0, 0, W, H);
  const T = (s, X, Y, size, opts = {}) => { x.font = `${opts.weight || 600} ${size * u}px ${FONT}`; x.fillStyle = opts.color || O.fg; x.textAlign = opts.align || 'left'; x.textBaseline = 'alphabetic'; x.fillText(s, X, Y); };
  const wrap = (s, X, Y, maxW, size, lh = 1.4, color) => { x.font = `400 ${size * u}px ${FONT}`; x.fillStyle = color || O.fg; x.textAlign = 'left'; let line = '', y = Y; for (const w of String(s).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, X, y); line = w; y += size * u * lh; } else line = t; } if (line) x.fillText(line, X, y); return y; };
  const bar = () => { x.fillStyle = O.accent; x.fillRect(0, H - 8 * u, W, 8 * u); };
  const header = () => { if (O.title) T(O.title, 60 * u, 90 * u, 52); if (O.subtitle) T(O.subtitle, 60 * u, 135 * u, 24, { weight: 400, color: O.fg + 'b0' }); };
  const label = (s, X, Y, align = 'center') => { if (O.labels) T(s, X, Y, 18, { weight: 500, align, color: O.fg + 'cc' }); };
  const texCanvas = async id => S.textureCanvas(S.get(id));
  const needMat = () => { if (!mat) throw new Error('This layout needs at least one PBR material. Link one to the product first.'); };
  const grid = (n, x0, y0, w, h, gap) => { const cols = Math.ceil(Math.sqrt(n * w / h)), rows = Math.ceil(n / cols), cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows, s = Math.min(cw, ch); return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cw + gap) + (cw - s) / 2, y: y0 + Math.floor(i / cols) * (ch + gap) + (ch - s) / 2, s })); };

  switch (O.template) {
    case 'cover': case 'feature': {
      needMat(); const [r] = await renders([mat], [O.shape], 1024); const s = Math.min(H * 0.86, W * 0.5);
      x.drawImage(r.img, O.template === 'cover' ? W - s - 40 * u : 40 * u, (H - s) / 2, s, s);
      const tx = O.template === 'cover' ? 70 * u : s + 90 * u, maxW = W - s - 160 * u;
      x.fillStyle = O.accent; x.fillRect(tx, H * 0.3 - 40 * u, 60 * u, 6 * u);
      T(O.title || mat.name, tx, H * 0.3 + 30 * u, O.template === 'cover' ? 72 : 54);
      let y = wrap(O.subtitle || (p?.shortDescription || ''), tx, H * 0.3 + 90 * u, maxW, 28, 1.35, O.fg + 'c0');
      if (O.template === 'feature') {
        const sp = p ? specsOf(p) : null; const feats = [sp ? sp.mapLabels.length + ' PBR maps per material' : Object.keys(mat.maps).length + ' PBR maps', sp ? 'Resolution ' + sp.res.join(', ') : mat.width + ' x ' + mat.height, mat.estimated ? 'Maps derived from source images' : 'Built from procedural data', p?.notTileable ? 'Ready-to-use layout' : 'Seamless and tileable', p ? 'Works with ' + (p.apps || []).slice(0, 4).join(', ') : 'Works in any PBR engine'];
        y += 60 * u; for (const f of feats) { x.fillStyle = O.accent; x.beginPath(); x.arc(tx + 8 * u, y - 9 * u, 6 * u, 0, 7); x.fill(); T(f, tx + 28 * u, y, 26, { weight: 400 }); y += 48 * u; }
      } else { const keys = Object.keys(mat.maps).slice(0, 6); const sw = 90 * u; let xx = tx; const yy = H - sw - 70 * u; for (const k of keys) { const cv = await texCanvas(mat.maps[k]); x.drawImage(cv, xx, yy, sw, sw); label(MAP_LABEL[k]?.split(' ')[0] || k, xx + sw / 2, yy + sw + 24 * u); xx += sw + 14 * u; } }
      bar(); break;
    }
    case 'spheres': case 'balls': {
      if (!mats.length) throw new Error('Link materials to the product first.'); header();
      const shapes = O.template === 'balls' ? ['sphere', 'rounded'] : ['sphere']; const rs = await renders(mats.slice(0, 12), shapes, 768);
      const cells = grid(rs.length, 60 * u, 170 * u, W - 120 * u, H - 250 * u, 20 * u);
      rs.forEach((r, i) => { const g = cells[i]; x.drawImage(r.img, g.x, g.y, g.s, g.s); if (shapes.length === 1 || r.sh === 'sphere') label(r.m.name, g.x + g.s / 2, g.y + g.s + 22 * u); });
      bar(); break;
    }
    case 'mapsheet': {
      needMat(); header(); const keys = Object.keys(mat.maps); const cells = grid(keys.length, 60 * u, 170 * u, W - 120 * u, H - 250 * u, 24 * u);
      for (let i = 0; i < keys.length; i++) { const g = cells[i]; x.drawImage(await texCanvas(mat.maps[keys[i]]), g.x, g.y, g.s, g.s); x.strokeStyle = O.fg + '30'; x.strokeRect(g.x, g.y, g.s, g.s); label(MAP_LABEL[keys[i]] || keys[i], g.x + g.s / 2, g.y + g.s + 24 * u); }
      bar(); break;
    }
    case 'closeup': {
      needMat(); const cv = await texCanvas(mat.maps.baseColor); const cw = cv.width / 4, ch = cv.height / 4;
      x.imageSmoothingQuality = 'high'; x.drawImage(cv, cv.width / 2 - cw / 2, cv.height / 2 - ch / 2, cw, ch, 0, 0, W, H);
      const g = x.createLinearGradient(0, H * 0.6, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)'); x.fillStyle = g; x.fillRect(0, H * 0.6, W, H * 0.4);
      T(O.title || mat.name, 60 * u, H - 90 * u, 56, { color: '#fff' }); T('Surface close-up . 4x detail crop', 60 * u, H - 50 * u, 24, { weight: 400, color: '#ffffffb0' }); break;
    }
    case 'texture': {
      needMat(); const cv = await texCanvas(mat.maps.baseColor); const s = Math.max(W, H) / 3; for (let i = 0; i * s < W; i++) for (let j = 0; j * s < H; j++) x.drawImage(cv, i * s, j * s, s, s);
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, H - 120 * u, W, 120 * u); T(O.title || mat.name, 60 * u, H - 55 * u, 46, { color: '#fff' }); T('Tiled 3 x 3, seamless', W - 60 * u, H - 55 * u, 22, { weight: 400, align: 'right', color: '#ffffffc0' }); break;
    }
    case 'comparison': case 'resolution': {
      needMat(); header(); const cv = await texCanvas(mat.maps.baseColor); const top = 170 * u, ih = H - top - 90 * u;
      if (O.template === 'comparison') {
        const other = O.compareId ? await texCanvas(O.compareId) : (mat.maps.normal ? await texCanvas(mat.maps.normal) : null); if (!other) throw new Error('Choose a texture to compare with.');
        const w2 = (W - 140 * u) / 2, s = Math.min(w2, ih); [[cv, 'A: ' + mat.name], [other, 'B: ' + (O.compareId ? S.get(O.compareId).name : 'Normal map')]].forEach(([im, l], i) => { const X = 60 * u + i * (w2 + 20 * u) + (w2 - s) / 2; x.drawImage(im, X, top, s, s); label(l, X + s / 2, top + s + 28 * u); });
      } else {
        const res = [cv.width, cv.width / 2, cv.width / 4, cv.width / 8].filter(r => r >= 128).map(Math.round); const w4 = (W - 120 * u - (res.length - 1) * 16 * u) / res.length, s = Math.min(w4, ih);
        res.forEach((r, i) => { const small = resize(cv, r, Math.round(r * cv.height / cv.width)); const crop = small.width / 4; const X = 60 * u + i * (w4 + 16 * u); x.imageSmoothingEnabled = false; x.drawImage(small, 0, 0, crop, crop, X, top, s, s); x.imageSmoothingEnabled = true; label(r + ' px', X + s / 2, top + s + 28 * u); });
      }
      bar(); break;
    }
    case 'spec': {
      header(); const sp = p ? specsOf(p) : { mapLabels: mat ? Object.keys(mat.maps).map(k => MAP_LABEL[k]) : [], res: mat ? [mat.width + ' x ' + mat.height] : [], count: mats.length };
      const rows = [['Product', p?.name || mat?.name || '-'], ['Version', p?.version || '1.0'], ['Materials', String(sp.count ?? mats.length)], ['Maps', sp.mapLabels.join(', ')], ['Resolution', sp.res.join(', ')], ['File format', 'PNG (lossless)'], ['Color spaces', 'Base color and emission sRGB, data maps linear'], ['Normal convention', 'OpenGL (Y+), DirectX versions available'], ['Tileable', p?.notTileable ? 'No' : 'Yes'], ['Applications', (p?.apps || []).join(', ') || 'Any PBR renderer'], ['License', S.get(p?.licenseId)?.name || '-']];
      let y = 220 * u; for (const [k, v] of rows) { x.fillStyle = O.fg + '12'; x.fillRect(60 * u, y - 34 * u, W - 120 * u, 48 * u); T(k, 80 * u, y, 22, { weight: 600, color: O.accent }); wrap(v, 380 * u, y, W - 480 * u, 22); y += 58 * u; if (y > H - 60 * u) break; }
      bar(); break;
    }
  }
  return c;
}
function specsOf(p) { const mats = (p.materialIds || []).map(S.get).filter(Boolean); return { mapLabels: [...new Set(mats.flatMap(m => Object.keys(m.maps || {})))].map(k => MAP_LABEL[k] || k), res: [...new Set(mats.map(m => m.width + ' x ' + m.height))], count: mats.length }; }
