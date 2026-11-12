import { h, add, icon, clear, slider, select, check, colorIn, panel, toast, pickFiles, download, tabs } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { createViewer, SHAPES, parseOBJ, loadMaterialCanvases } from '../core/viewer.js';
import { pickTextures, helpLink } from '../core/widgets.js';
import { newCanvas } from '../core/img.js';

export default async function (el, arg) {
  let mode = '3d', V = null, maps = {}, rec = null, shape = 'sphere', tile2d = 3, zoom2d = 1, mapView = 'baseColor';
  const O = { roughness: 0.6, metalness: 0, normalScale: 1, displacement: 0.015, ao: 1, emission: 1, env: 1, light: 2, lightColor: '#ffffff', azimuth: 45, elevation: 40, bg: '#15171c', repeat: 1, offsetX: 0, offsetY: 0, rotation: 0, spin: false, wire: false, normalY: 'OpenGL', clearcoat: 0 };
  const box = h('div', { style: { position: 'absolute', inset: 0 } }); const stage = h('div', { class: 'stage' }, box);
  const top = h('div', { class: 'toolbar' }), right = h('div', { class: 'r' });
  el.append(h('div', { class: 'page full' }, h('div', { class: 'ws', style: { '--lw': '0px', '--rw': '320px' } }, h('div', { class: 'l' }), h('div', { class: 'c' }, top, stage), right)));

  async function load(id) {
    const r = await loadMaterialCanvases(S, id); maps = r.maps; rec = r.rec;
    if (rec?.type === 'material') { O.normalY = rec.settings?.normalY || 'OpenGL'; if (!maps.roughness) O.roughness = 0.6; }
    if (rec) { nav.crumbs('Studio', '3D Preview', rec.name); S.touchRecent(rec.type, rec.id); }
    mapView = maps.baseColor ? 'baseColor' : Object.keys(maps)[0] || 'baseColor';
    if (V) { V.setMaps(maps); V.set(O); } draw2d(); drawRight(); drawTop();
  }
  function start3d() {
    clear(box); const r = stage.getBoundingClientRect(); V = createViewer(box, { width: r.width || 800, height: r.height || 600 }); V.setShape(shape); V.setMaps(maps); V.set(O);
    ro.observe(stage);
  }
  const ro = new ResizeObserver(() => { const r = stage.getBoundingClientRect(); if (V && r.width) V.resize(r.width, r.height); if (mode === '2d') draw2d(); });
  function draw2d() {
    if (mode !== '2d') return; clear(box); const c = maps[mapView]; if (!c) { box.append(h('div', { class: 'empty', style: { margin: '40px' } }, 'Nothing to show. Choose a material or texture.')); return; }
    const W = stage.clientWidth, H = stage.clientHeight; const cv = newCanvas(W, H); const x = cv.getContext('2d'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const cell = Math.min(W, H) / tile2d * zoom2d; x.save(); x.translate(W / 2, H / 2); x.rotate(O.rotation * Math.PI / 180); const pat = x.createPattern(c, 'repeat'); const m = new DOMMatrix().scale(cell / c.width, cell / c.width).translate(O.offsetX * c.width, O.offsetY * c.height); pat.setTransform(m); x.fillStyle = pat; x.fillRect(-W, -H, W * 2, H * 2); x.restore();
    box.append(cv);
  }
  function drawTop() {
    clear(top);
    add(top, h('div', { class: 'row' }, ['3d', '2d'].map(m => h('button', { class: 'btn sm' + (mode === m ? ' on' : ''), onclick: () => { mode = m; if (m === '3d') start3d(); else { V?.dispose(); V = null; draw2d(); } drawTop(); drawRight(); } }, m === '3d' ? '3D view' : '2D tiling view'))), h('div', { class: 'sep' }),
      mode === '3d' ? [SHAPES.map(([k, l]) => h('button', { class: 'btn sm' + (shape === k ? ' on' : ''), onclick: () => { shape = k; V.setShape(k); drawTop(); } }, l)), h('button', { class: 'btn sm', onclick: loadOBJ }, icon('upload'), 'Custom model (OBJ)')] : [select(null, Object.keys(maps).map(k => [k, k]), mapView, v => { mapView = v; draw2d(); })],
      h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: async () => { const t = await pickTextures({ title: 'Preview a texture' }); if (t) nav.go('preview', t.id); } }, 'Texture...'), h('button', { class: 'btn sm', onclick: pickMaterial }, 'Material...'));
  }
  async function pickMaterial() { const list = S.all('material'); if (!list.length) return toast('No materials yet. Create one in PBR Materials.', 'warn'); const { modal } = await import('../core/ui.js'); const id = await modal({ title: 'Choose material', body: h('div', { class: 'tgrid', style: { '--tw': '120px' } }, list.map(m => h('div', { class: 'tile', onclick: e => { e.target.closest('.modal-bg').remove(); nav.go('preview', m.id); } }, h('div', { class: 'im' }, S.get(m.maps?.baseColor) ? h('img', { src: S.get(m.maps.baseColor).thumb }) : null), h('div', { class: 'meta' }, h('div', { class: 'nm' }, m.name))))) }); }
  async function loadOBJ() {
    const [f] = await pickFiles({ accept: '.obj', multiple: false }); if (!f) return;
    try { const r = parseOBJ(await f.text()); V.setShape('custom', r.geometry); shape = 'custom'; drawTop(); toast(r.hasUV ? 'Model loaded' : 'Model loaded, but it has no UV coordinates, so textures cannot map correctly.', r.hasUV ? 'ok' : 'warn', 6000); }
    catch (e) { toast('Could not read OBJ: ' + e.message, 'bad'); }
  }
  function drawRight() {
    clear(right); const set = k => v => { O[k] = v; V?.set({ [k]: v }); if (mode === '2d') draw2d(); };
    right.append(h('div', { class: 'card tight', style: { marginBottom: '8px' } }, rec ? [h('b', null, rec.name), h('div', { class: 'small muted' }, rec.type === 'material' ? Object.keys(maps).join(', ') : 'Single texture (shown as base color)'), rec.type === 'material' && rec.estimated ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, 'Maps are estimated from one image.') : null] : h('span', { class: 'muted' }, 'No material loaded. Use the buttons above.')));
    right.append(panel('UV & tiling', [slider('UV scale (repeats)', O.repeat, 0.25, 16, 0.25, v => { O.repeat = v; tile2d = Math.max(1, v * 3); V?.set({ repeat: v }); draw2d(); }), slider('UV offset X', O.offsetX, -1, 1, 0.01, set('offsetX')), slider('UV offset Y', O.offsetY, -1, 1, 0.01, set('offsetY')), slider('UV rotation', O.rotation, -180, 180, 1, set('rotation')), mode === '2d' ? slider('Zoom', zoom2d, 0.25, 4, 0.05, v => { zoom2d = v; draw2d(); }) : null], { iconName: 'grid' }));
    if (mode === '2d') return;
    right.append(panel('Material response', [slider('Roughness' + (maps.roughness ? ' (multiplier)' : ''), O.roughness, 0, 1, 0.01, set('roughness'), maps.roughness ? 'The roughness map is multiplied by this value.' : null), slider('Metallic' + (maps.metallic ? ' (multiplier)' : ''), O.metalness, 0, 1, 0.01, set('metalness')),
      slider('Normal strength', O.normalScale, 0, 4, 0.05, set('normalScale')), select('Normal map convention', ['OpenGL', 'DirectX'], O.normalY, set('normalY'), 'Pick the convention the normal map was made in. A wrong setting makes bumps look inverted.'),
      slider('Displacement', O.displacement, 0, 0.3, 0.005, set('displacement'), 'Moves geometry with the height or displacement map.'), slider('AO intensity', O.ao, 0, 2, 0.05, set('ao')), slider('Emission intensity', O.emission, 0, 5, 0.05, set('emission')), slider('Clearcoat', O.clearcoat, 0, 1, 0.01, set('clearcoat'), null, true),
      check('Wireframe', O.wire, set('wire'), null, true)], { iconName: 'sphere' }));
    right.append(panel('Lighting', [slider('Environment light', O.env, 0, 3, 0.05, set('env')), slider('Key light', O.light, 0, 8, 0.1, set('light')), slider('Light direction', O.azimuth, -180, 180, 1, v => { O.azimuth = v; V?.set({ azimuth: v, elevation: O.elevation }); }), slider('Light height', O.elevation, -10, 90, 1, v => { O.elevation = v; V?.set({ azimuth: O.azimuth, elevation: v }); }),
      h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Light color'), colorIn(O.lightColor, set('lightColor')), h('label', { class: 'lbl' }, 'Background'), colorIn(O.bg, set('bg')))], { iconName: 'sun' }));
    right.append(h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => V?.resetCamera() }, 'Reset camera'), h('button', { class: 'btn' + (O.spin ? ' on' : ''), onclick: () => { O.spin = !O.spin; V?.set({ spin: O.spin }); drawRight(); } }, 'Auto-rotate'),
      h('button', { class: 'btn', onclick: shot }, icon('image'), 'Save render'), helpLink('preview', 'Preview help')), h('p', { class: 'small dim', style: { marginTop: '8px' } }, 'Drag to rotate, right-drag to pan, scroll to zoom.'));
  }
  async function shot() {
    if (!V) return; const url = V.snapshot(1600, 1600); const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob); const c = newCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
    const t = await S.saveTexture(c, { name: (rec?.name || 'Render') + ' ' + shape + ' render', kind: 'preview', projectId: rec?.projectId || null, category: rec?.category, sourceRef: rec?.id, format: 'PNG' });
    toast('Render saved to the library (Previews)', 'ok'); download(blob, (rec?.name || 'render').replace(/\W+/g, '_') + '_' + shape + '.png'); return t;
  }
  drawTop(); start3d(); drawRight();
  const id = arg || S.recent('material')[0]?.id || S.all('material')[0]?.id; if (id) await load(id);
  return { destroy: () => { ro.disconnect(); V?.dispose(); }, exportArg: () => rec ? (rec.type === 'material' ? 'mat:' + rec.id : rec.id) : '' };
}
