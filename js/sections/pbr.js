import { h, icon, clear, slider, select, check, colorIn, panel, toast, debounce, task, modal, promptDlg, fmtDate, confirmDlg } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { MAPS, MAP_LABEL, MAP_SPACE, defaultPbr, buildMaps, toCanvas } from '../core/pbr.js';
import { resize, getData, newCanvas, ctx } from '../core/img.js';
import { pickTextures, projectOptions, runGen, helpLink, academyLink } from '../core/widgets.js';

const resampleArr = (a, w, h, nw, nh) => { if (!a) return null; const o = new Float32Array(nw * nh); for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) o[y * nw + x] = a[Math.floor(y * h / nh) * w + Math.floor(x * w / nw)]; return o; };

export default async function (el, arg) {
  const page = h('div', { class: 'page' }); el.append(page);
  if (!arg) return listView(page);
  let mat, srcTex, srcCanvas, gen = null;
  if (arg === 'new') {
    const from = nav.handoff.pbrFrom; nav.handoff.pbrFrom = null;
    srcTex = from ? S.get(from.textureId) : await pickTextures({ title: 'Choose the source texture (base color)' });
    if (!srcTex) return nav.go('pbr');
    gen = from?.gen || null;
    const settings = defaultPbr(); if (gen) { settings.metallicMode = 'procedural'; settings.emissionMode = gen.emis?.some(v => v > 0) ? 'procedural' : 'none'; settings.enabled.emission = settings.emissionMode !== 'none'; settings.roughMin = 0; settings.roughMax = 1; settings.heightBlur = 0; }
    if (srcTex.genParams && !gen) settings.metallicValue = srcTex.genParams.metallic || 0;
    mat = { type: 'material', name: srcTex.name.replace(/\s+\d+$/, '') + ' Material', category: srcTex.category || 'Custom', projectId: srcTex.projectId || null, sourceTextureId: srcTex.id, settings, maps: {}, mapNotes: {}, genBacked: !!(gen || srcTex.genParams), collection: '', description: '' };
  } else {
    mat = S.get(arg); if (!mat) { page.append(h('div', { class: 'empty' }, 'Material not found.')); return; }
    srcTex = S.get(mat.sourceTextureId); mat.settings = { ...defaultPbr(), ...mat.settings, enabled: { ...defaultPbr().enabled, ...mat.settings?.enabled } };
  }
  if (!srcTex) { page.append(h('div', { class: 'callout bad' }, 'The source texture for this material is missing. Choose a new source.'), h('button', { class: 'btn', onclick: async () => { const t = await pickTextures(); if (t) { mat.sourceTextureId = t.id; await S.save(mat); nav.go('pbr', mat.id); } } }, 'Choose source')); return; }
  srcCanvas = await S.textureCanvas(srcTex);
  if (!gen && mat.genBacked && srcTex.genParams && srcTex.genParams.width === srcCanvas.width) {
    const t = task('Rebuilding procedural data'); try { const r = await runGen({ ...srcTex.genParams }, p => t.update(p)); gen = { height: r.height, rough: r.rough, metal: r.metal, emis: r.emis }; t.done(); } catch (e) { t.fail(e); }
  }
  S.touchRecent('material', mat.id);
  nav.crumbs('Studio', 'PBR Materials', mat.name);

  const PV = Math.min(512, srcCanvas.width); const pvH = Math.round(PV * srcCanvas.height / srcCanvas.width);
  const pvSrc = resize(srcCanvas, PV, pvH); const pvGen = gen ? { height: resampleArr(gen.height, srcCanvas.width, srcCanvas.height, PV, pvH), rough: resampleArr(gen.rough, srcCanvas.width, srcCanvas.height, PV, pvH), metal: resampleArr(gen.metal, srcCanvas.width, srcCanvas.height, PV, pvH), emis: resampleArr(gen.emis, srcCanvas.width, srcCanvas.height, PV, pvH) } : null;
  let maps = {}, selMap = 'normal', dirty = arg === 'new';
  const mapList = h('div', { class: 'tgrid', style: { '--tw': '120px' } }); const big = h('canvas', { style: { width: '100%', maxWidth: '560px', aspectRatio: srcCanvas.width + '/' + srcCanvas.height, background: 'var(--checker)', borderRadius: '8px', display: 'block' } });
  const ctrl = h('div'); const head = h('div', { class: 'ph' });
  page.append(head, h('div', { class: 'split' }, h('div', { class: 'split', style: { '--a': 'minmax(260px,480px)', '--b': 'minmax(0,1fr)', gap: '12px' } }, h('div', { class: 'card tight', style: { position: 'sticky', top: '0', maxWidth: '520px' } }, big, h('div', { class: 'small muted', id: 'pbr-cap', style: { marginTop: '6px' } })), mapList), ctrl));

  const S0 = mat.settings;
  const rebuild = debounce(() => { maps = buildMaps(pvSrc, S0, pvGen); for (const [k, v] of Object.entries(mat.maps)) if (mat.mapNotes?.[k] === 'edited' || mat.mapNotes?.[k] === 'custom') maps[k] = maps[k] || null; drawMaps(); }, 120);
  const origin = k => mat.mapNotes?.[k] === 'edited' ? ['Edited by hand', 'acc'] : mat.mapNotes?.[k] === 'custom' ? ['Custom file', 'acc'] : k === 'baseColor' ? ['Source image', 'ok'] : pvGen && ['height', 'roughness', 'metallic', 'displacement', 'glossiness'].includes(k) ? ['From procedural data', 'ok'] : pvGen && k === 'emission' && S0.emissionMode === 'procedural' ? ['From procedural data', 'ok'] : pvGen ? ['Derived from height', 'info'] : ['Estimated', 'warn'];
  async function drawMaps() {
    clear(mapList);
    for (const [k, label] of MAPS) {
      const on = S0.enabled[k]; const keep = mat.mapNotes?.[k] === 'edited' || mat.mapNotes?.[k] === 'custom';
      let img = null; if (keep && S.get(mat.maps[k])) img = h('img', { src: S.get(mat.maps[k]).thumb }); else if (maps[k]) { const c = toCanvas(maps[k]); img = h('img', { src: resize(c, 160, Math.round(160 * c.height / c.width)).toDataURL() }); }
      const [o, cls] = origin(k);
      mapList.append(h('div', { class: 'tile' + (selMap === k ? ' sel' : ''), style: { opacity: on ? 1 : 0.45 }, onclick: () => { selMap = k; drawMaps(); drawCtrl(); } },
        h('div', { class: 'im' }, img || h('span', { class: 'small dim' }, 'off')), h('input', { type: 'checkbox', class: 'ck', checked: on, title: 'Include this map', onclick: e => { e.stopPropagation(); S0.enabled[k] = e.target.checked; dirty = true; rebuild(); } }),
        h('div', { class: 'meta' }, h('div', { class: 'nm' }, label), h('div', { class: 'sm' }, h('span', { class: 'badge ' + cls }, o), h('span', null, MAP_SPACE[k] === 'srgb' ? 'sRGB' : 'Linear')))));
    }
    const keep = mat.mapNotes?.[selMap] && S.get(mat.maps[selMap]);
    if (keep) { const c = await S.textureCanvas(S.get(mat.maps[selMap])); big.width = c.width; big.height = c.height; big.getContext('2d').drawImage(c, 0, 0); }
    else if (maps[selMap]) { big.width = maps[selMap].width; big.height = maps[selMap].height; big.getContext('2d').putImageData(maps[selMap], 0, 0); }
    else { big.width = 1; big.height = 1; }
    const [o] = origin(selMap); const capEl = document.getElementById('pbr-cap'); if (capEl) capEl.textContent = MAP_LABEL[selMap] + ' . ' + o + (o === 'Estimated' ? '. Built from image brightness, not measured material data.' : '') + ' . preview ' + PV + ' px, saved at ' + srcCanvas.width + ' x ' + srcCanvas.height;
  }
  const set = k => v => { S0[k] = v; dirty = true; rebuild(); };
  function drawCtrl() {
    clear(ctrl);
    const per = {
      baseColor: [h('p', { class: 'small muted' }, 'Base color is the source texture. Edit it in the Texture Editor to change it.'), h('button', { class: 'btn sm', onclick: () => nav.go('editor', srcTex.id) }, icon('brush'), 'Edit source')],
      height: [select('Height source', [['luminance', 'Image brightness'], ['alpha', 'Alpha channel']], S0.heightSource, set('heightSource')), check('Invert height', S0.heightInvert, set('heightInvert'), 'Turn on when dark areas should be raised.'), slider('Smoothing', S0.heightBlur, 0, 12, 1, set('heightBlur'), 'Blurs fine noise out of the height estimate.'), slider('Height contrast', S0.heightContrast, 0.2, 3, 0.05, set('heightContrast')), slider('Height intensity', S0.heightIntensity, 0, 2, 0.05, set('heightIntensity'))],
      normal: [slider('Normal map strength', S0.normalStrength, 0.1, 12, 0.1, set('normalStrength'), 'Steepness of the surface slopes computed from height.'), select('Green channel', [['OpenGL', 'OpenGL (Y+) Blender, Unity, Godot'], ['DirectX', 'DirectX (Y-) Unreal']], S0.normalY, set('normalY'), 'Engines read the green channel in opposite directions. Export presets can convert it.')],
      displacement: [slider('Displacement depth', S0.displacementDepth, 0, 2, 0.05, set('displacementDepth')), slider('Mid level', S0.displacementMid, 0, 1, 0.01, set('displacementMid'), 'Gray value that means no displacement. Blender uses 0.5 by default.')],
      roughness: [slider('Roughness minimum', S0.roughMin, 0, 1, 0.01, set('roughMin')), slider('Roughness maximum', S0.roughMax, 0, 1, 0.01, set('roughMax')), check('Invert (bright = rough)', S0.roughInvert, set('roughInvert')), slider('Contrast', S0.roughContrast, 0.2, 3, 0.05, set('roughContrast'))],
      metallic: [select('Metallic source', [['uniform', 'Uniform value'], ['threshold', 'Bright areas are metal'], ...(pvGen ? [['procedural', 'From procedural data']] : [])], S0.metallicMode, v => { S0.metallicMode = v; dirty = true; rebuild(); drawCtrl(); }), S0.metallicMode === 'uniform' ? slider('Metallic value', S0.metallicValue, 0, 1, 0.01, set('metallicValue'), 'Real materials are almost always 0 or 1.') : S0.metallicMode === 'threshold' ? slider('Threshold', S0.metallicThreshold, 0, 1, 0.01, set('metallicThreshold')) : null, slider('Metallic intensity', S0.metallicIntensity, 0, 1, 0.01, set('metallicIntensity'))],
      ao: [slider('AO strength', S0.aoStrength, 0, 4, 0.05, set('aoStrength')), slider('AO radius', S0.aoRadius, 1, 48, 1, set('aoRadius'), 'Size of the crevices that get darkened.')],
      opacity: [select('Opacity source', [['alpha', 'Alpha channel'], ['luminance', 'Bright areas are opaque'], ['dark', 'Dark areas are opaque']], S0.opacityMode, set('opacityMode')), slider('Opacity threshold', S0.opacityThreshold, 0, 1, 0.01, set('opacityThreshold'))],
      emission: [select('Emission source', [['none', 'None'], ['threshold', 'Brightest areas glow'], ['color', 'Whole surface'], ...(pvGen ? [['procedural', 'From procedural data']] : [])], S0.emissionMode, set('emissionMode')), h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Emission color'), colorIn(S0.emissionColor, set('emissionColor'))), slider('Emission intensity', S0.emissionIntensity, 0, 4, 0.05, set('emissionIntensity')), slider('Threshold', S0.emissionThreshold, 0, 1, 0.01, set('emissionThreshold'))],
      specular: [slider('Specular level (non-metals)', S0.specularLevel, 0, 1, 0.01, set('specularLevel'), 'Used by specular/glossiness workflows. 0.5 equals 4% reflectance.')],
      glossiness: [h('p', { class: 'small muted' }, 'Glossiness is the inverse of roughness. Adjust it with the roughness controls.')],
    };
    const keep = mat.mapNotes?.[selMap];
    ctrl.append(panel(MAP_LABEL[selMap] + ' map', [
      keep ? h('div', { class: 'callout' }, 'This map uses a ' + (keep === 'edited' ? 'hand-edited' : 'custom') + ' image, so the sliders do not change it. ', h('button', { class: 'btn sm', onclick: () => { delete mat.mapNotes[selMap]; dirty = true; rebuild(); drawCtrl(); } }, 'Go back to generated')) : null,
      ...per[selMap],
      h('div', { class: 'hr' }), h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', disabled: !mat.id || !mat.maps[selMap], title: mat.id ? '' : 'Save the material first', onclick: () => nav.go('editor', mat.maps[selMap]) }, icon('brush'), 'Paint in editor'),
        h('button', { class: 'btn sm', onclick: async () => { const t = await pickTextures({ title: 'Use a texture as the ' + MAP_LABEL[selMap] + ' map' }); if (t) { mat.maps[selMap] = t.id; mat.mapNotes[selMap] = 'custom'; S0.enabled[selMap] = true; dirty = true; drawMaps(); drawCtrl(); } } }, 'Replace with texture')),
    ], { iconName: 'layers' }));
    ctrl.append(panel('Material details', [
      h('div', { class: 'f' }, h('label', null, 'Name'), h('input', { type: 'text', value: mat.name, oninput: e => { mat.name = e.target.value; dirty = true; } })),
      select('Category', S.categories(), mat.category, v => { mat.category = v; dirty = true; }),
      select('Project', projectOptions(), mat.projectId || '', v => { mat.projectId = v || null; dirty = true; }),
      h('div', { class: 'f' }, h('label', null, 'Collection'), h('input', { type: 'text', value: mat.collection || '', list: 'mat-cols', placeholder: 'e.g. Medieval Village Pack', oninput: e => { mat.collection = e.target.value; dirty = true; } }), h('datalist', { id: 'mat-cols' }, [...new Set(S.all('material').map(m => m.collection).filter(Boolean))].map(c => h('option', { value: c })))),
      select('Material style folder', ['PBR_Materials', 'Stylized_Materials', 'Realistic_Materials', 'Procedural_Materials'], mat.styleFolder || (mat.genBacked ? 'Procedural_Materials' : 'PBR_Materials'), v => { mat.styleFolder = v; dirty = true; }),
      h('div', { class: 'f' }, h('label', null, 'Description'), h('textarea', { rows: 2, oninput: e => { mat.description = e.target.value; dirty = true; } }, mat.description || '')),
    ], { iconName: 'tag', open: !mat.id }));
    ctrl.append(h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: async () => { const n = await promptDlg('Preset name', mat.category + ' PBR'); if (n) { await S.save({ type: 'preset', kind: 'pbr', name: n, data: structuredClone(S0) }); toast('PBR preset saved', 'ok'); } } }, icon('star'), 'Save PBR preset'),
      h('button', { class: 'btn', onclick: loadPreset }, 'Load preset')));
  }
  async function loadPreset() { const list = S.all('preset', p => p.kind === 'pbr'); if (!list.length) return toast('No PBR presets yet', 'warn'); const id = await modal({ title: 'Load PBR preset', body: h('div', null, list.map(p => h('div', { class: 'row', style: { padding: '4px 0' } }, p.name))), actions: list.map(p => ({ label: p.name, value: p.id })) }); if (id) { Object.assign(S0, structuredClone(S.get(id).data)); dirty = true; rebuild(); drawCtrl(); } }

  async function save() {
    const t = task('Saving material maps');
    try {
      const full = buildMaps(srcCanvas, S0, gen); mat.estimated = !gen; mat.width = srcCanvas.width; mat.height = srcCanvas.height;
      if (!mat.id) { mat.id = S.uid('mat'); }
      const keys = MAPS.map(m => m[0]).filter(k => S0.enabled[k]); let i = 0;
      for (const k of keys) {
        t.update(i++ / keys.length, 'Saving ' + MAP_LABEL[k]);
        if (k === 'baseColor') { mat.maps.baseColor = srcTex.id; continue; }
        if (mat.mapNotes?.[k]) continue;
        const existing = S.get(mat.maps[k]); const rec = existing && existing.materialId === mat.id ? existing : { name: mat.name + ' ' + MAP_LABEL[k], kind: 'map', mapType: k, materialId: mat.id, materialName: mat.name, projectId: mat.projectId };
        Object.assign(rec, { name: mat.name + ' ' + MAP_LABEL[k], colorSpace: MAP_SPACE[k], estimated: !gen || !['height', 'roughness', 'metallic', 'displacement', 'glossiness', 'emission'].includes(k), category: mat.category, projectId: mat.projectId, folder: S.defaultFolder('map', mat.projectId, mat.name) + (mat.projectId ? '' : '/' + ({ baseColor: 'BaseColor', normal: 'Normal', roughness: 'Roughness', metallic: 'Metallic', height: 'Height', displacement: 'Displacement', ao: 'AmbientOcclusion', opacity: 'Opacity', emission: 'Emission' }[k] || 'Other')) });
        const saved = await S.saveTexture(toCanvas(full[k]), rec); mat.maps[k] = saved.id;
      }
      for (const k of Object.keys(mat.maps)) if (!S0.enabled[k] && !mat.mapNotes?.[k]) { const tx = S.get(mat.maps[k]); if (tx?.materialId === mat.id) await S.trashTexture(tx); delete mat.maps[k]; }
      const isNew = !S.get(mat.id); await S.save(mat); dirty = false; t.done();
      await S.log('activity', (isNew ? 'Created' : 'Updated') + ' material "' + mat.name + '"', 'info', { ref: mat.id });
      toast('Material saved with ' + Object.keys(mat.maps).length + ' maps', 'ok'); if (isNew) history.replaceState(null, '', '#/pbr/' + mat.id); drawHead();
    } catch (e) { t.fail(e); toast('Save failed: ' + e.message, 'bad'); S.err('Material save', e); }
  }
  function drawHead() {
    clear(head);
    head.append(h('div', null, h('h1', null, mat.name), h('div', { class: 'sub' }, `Source: ${srcTex.name} . ${srcCanvas.width} x ${srcCanvas.height}`, ' ', mat.genBacked ? h('span', { class: 'badge ok' }, 'Procedural data') : h('span', { class: 'badge warn' }, 'Maps estimated from one image'))),
      h('div', { class: 'act' }, helpLink('pbr-maps', 'How PBR maps work'), academyLink('c2-pbr', 'PBR course'), h('button', { class: 'btn', disabled: !S.get(mat.id), onclick: () => nav.go('preview', mat.id) }, icon('cube'), '3D preview'), h('button', { class: 'btn', disabled: !S.get(mat.id), onclick: () => nav.go('export', 'mat:' + mat.id) }, icon('download'), 'Export'), h('button', { class: 'btn pri', onclick: save }, icon('save'), 'Save material')));
    if (!mat.genBacked) head.append(h('div', { class: 'callout warn', style: { width: '100%', margin: 0 } }, 'These maps are estimated from the colors of a single image. They approximate the surface and are not measured material data. Check them in 3D Preview and adjust or hand-paint where needed.'));
  }
  drawHead(); drawCtrl(); rebuild();
  return { save, exportArg: () => mat.id ? 'mat:' + mat.id : '', leave: async () => { if (dirty && S.get(mat.id) === undefined && Object.keys(mat.maps).length === 0) return confirmDlg('This material has not been saved. Leave anyway?', { ok: 'Leave' }); return true; } };
}

function listView(page) {
  let q = '';
  const grid = h('div', { class: 'tgrid', style: { '--tw': '190px' } });
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'PBR Materials'), h('div', { class: 'sub' }, 'Build complete material sets from a texture. Each map has its own controls.')),
    h('div', { class: 'act' }, h('input', { type: 'search', placeholder: 'Search materials', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }), helpLink('pbr-maps', 'PBR explained'), h('button', { class: 'btn pri', onclick: () => nav.go('pbr', 'new') }, icon('plus'), 'New material from texture'))), grid);
  const draw = () => {
    clear(grid); const list = S.all('material', m => !q || (m.name + m.category + (m.collection || '')).toLowerCase().includes(q)).sort((a, b) => b.modified - a.modified);
    if (!list.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'No materials yet. Generate a texture and choose "Save as PBR material", or start from any texture here.'));
    for (const m of list) { const b = S.get(m.maps?.baseColor); grid.append(h('div', { class: 'tile', onclick: () => nav.go('pbr', m.id) }, h('div', { class: 'im' }, b ? h('img', { src: b.thumb }) : icon('layers')), h('div', { class: 'meta' }, h('div', { class: 'nm' }, m.name), h('div', { class: 'sm' }, h('span', null, m.category), h('span', null, Object.keys(m.maps || {}).length + ' maps'), m.estimated ? h('span', { class: 'badge warn' }, 'estimated') : h('span', { class: 'badge ok' }, 'procedural'), m.collection ? h('span', null, m.collection) : null, h('span', null, fmtDate(m.modified)))))); }
  };
  draw();
}
