import { h, icon, clear, slider, select, check, colorIn, panel, toast, debounce, task, pickFiles, promptDlg, tabs, modal, text } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { CATEGORY_DEFAULTS, PATTERNS, defaultParams, interpretPrompt, randomParams } from '../core/procedural.js';
import { runGen, pickTextures, projectOptions, helpLink, academyLink } from '../core/widgets.js';
import { newCanvas, ctx, fromData, getData, resize, makeSeamless, decodeFile, IMPORT_ACCEPT } from '../core/img.js';
import { libFolder } from './import.js';

export const RES_PRESETS = [256, 512, 1024, 2048, 4096, 8192];
const PALETTES = { 'Category default': null, 'Warm earth': ['#4a2c1a', '#8a5a36', '#d2a46c'], 'Cool stone': ['#3c434a', '#7a838c', '#c3cad1'], 'Forest': ['#14280f', '#355e22', '#8bb04c'], 'Desert': ['#7a5530', '#c2955a', '#ead2a0'], 'Neon': ['#120024', '#7a00ff', '#00f0ff'], 'Monochrome': ['#111111', '#777777', '#eeeeee'], 'Rust & steel': ['#4d1f0c', '#9c4d22', '#8a9096'] };
const SURFACES = { 'As category': {}, 'Smooth': { realism: 0.6, imperfections: 0.05, roughness: 0.3 }, 'Rough': { roughness: 0.9, imperfections: 0.3 }, 'Polished': { roughness: 0.1, reflectivity: 0.9 }, 'Bumpy': { detail: 7, realism: 1 }, 'Worn': { age: 0.5, weathering: 0.5, imperfections: 0.5 }, 'Cracked': { imperfections: 0.8, weathering: 0.4 } };

export default function (el, arg) {
  let P = nav.handoff.genParams || defaultParams('Wood'); nav.handoff.genParams = null;
  let mode = 'procedural', last = null, tiled = false, prompt = '', negative = '', notes = [];
  const view = h('canvas', { style: { maxWidth: '100%', maxHeight: '100%', imageRendering: 'auto', boxShadow: '0 4px 30px rgba(0,0,0,.5)', background: 'var(--checker)' } });
  const info = h('div', { class: 'small muted' });
  const stage = h('div', { class: 'stage', style: { display: 'grid', placeItems: 'center', padding: '20px' } }, view);
  const right = h('div', { class: 'r' }); const outBar = h('div', { class: 'toolbar' });
  el.append(h('div', { class: 'page full' }, h('div', { class: 'ws', style: { '--lw': '0px', '--rw': '360px' } }, h('div', { class: 'l' }), h('div', { class: 'c' }, outBar, stage, h('div', { class: 'toolbar' }, info)), right)));

  view.style.visibility = 'hidden';
  const showCanvas = c => {
    view.style.visibility = 'visible'; const s = tiled ? 2 : 1; view.width = c.width * s; view.height = c.height * s; const x = view.getContext('2d');
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) x.drawImage(c, i * c.width, j * c.height);
    const max = Math.min(stage.clientWidth - 40, stage.clientHeight - 40, 900); view.style.width = view.style.height = Math.max(200, max) + 'px';
  };
  let pv = 0;
  const preview = debounce(async () => {
    if (mode === 'image' || mode === 'ai') return; const my = ++pv; info.textContent = 'Rendering preview...';
    try { const r = await runGen({ ...P, width: 320, height: Math.round(320 * P.height / P.width) }); if (my !== pv) return; const c = fromData(new ImageData(r.rgba, r.width, r.height_px)); showCanvas(c); info.textContent = 'Live preview at 320 px. Generate at full resolution to save. ' + (P.seamless ? 'Seamless: on.' : 'Seamless: off.'); }
    catch (e) { info.textContent = 'Preview failed: ' + e.message; }
  }, 200);
  const upd = (k) => v => { P[k] = v; preview(); };

  async function generateFull() {
    if (P.width * P.height > 4096 * 4096 && !(await (await import('../core/ui.js')).confirmDlg('8K generation needs a lot of memory and can take a minute or more. Continue?'))) return;
    const t = task('Generating ' + P.category + ' ' + P.width + 'x' + P.height);
    try {
      const r = await runGen({ ...P }, p => t.update(p)); t.done();
      const c = fromData(new ImageData(r.rgba, r.width, r.height_px)); last = { canvas: c, gen: { height: r.height, rough: r.rough, metal: r.metal, emis: r.emis }, params: { ...P }, source: 'procedural' };
      showCanvas(c); info.textContent = `Generated ${c.width} x ${c.height}. Not saved yet.`; drawOut();
    } catch (e) { t.fail(e); toast('Generation failed: ' + e.message, 'bad'); S.err('Generation', e); }
  }
  async function saveResult(asMaterial) {
    if (!last) return toast('Generate a texture first', 'warn');
    const name = h('input', { type: 'text', value: (prompt || P.category).slice(0, 40) + ' ' + (P.seed || '') }); const proj = h('select', null, projectOptions().map(([v, l]) => h('option', { value: v, selected: v === nav.handoff.genProject }, l)));
    const ok = await modal({ title: asMaterial ? 'Save as PBR material' : 'Save texture', body: h('div', null, h('div', { class: 'f' }, h('label', null, 'Name'), name), h('div', { class: 'f' }, h('label', null, 'Project'), proj), asMaterial ? h('p', { class: 'small muted' }, last.gen ? 'Height, roughness, metallic and emission maps come straight from the procedural data. Normal and AO are computed from that height.' : 'Maps will be estimated from the image.') : null), actions: [{ label: 'Cancel', value: false }, { label: 'Save', cls: 'pri', value: true }] });
    if (!ok) return;
    const t = task('Saving'); try {
      const tex = await S.saveTexture(last.canvas, { name: name.value.trim() || 'Generated', kind: last.source === 'import' ? 'edited' : 'generated', projectId: proj.value || null, category: P.category, format: 'PNG', description: prompt ? 'Prompt: ' + prompt + (negative ? ' | Negative: ' + negative : '') : '', genParams: last.source === 'procedural' ? last.params : null, genSource: last.source, tags: [P.category.toLowerCase()], folder: proj.value ? null : '03_TEXTURE_LIBRARY/' + libFolder(P.category) });
      await S.log('activity', 'Generated texture "' + tex.name + '"', 'info', { ref: tex.id });
      if (asMaterial) { nav.handoff.pbrFrom = { textureId: tex.id, gen: last.gen, params: last.params }; t.done(); nav.go('pbr', 'new'); return; }
      t.done(); toast('Saved to library', 'ok'); last.savedId = tex.id; drawOut();
    } catch (e) { t.fail(e); toast(e.message, 'bad'); }
  }
  function drawOut() {
    clear(outBar);
    outBar.append(h('button', { class: 'btn pri', onclick: generateFull, disabled: mode === 'image' || mode === 'ai' }, icon('wand'), 'Generate ' + P.width + 'x' + P.height),
      h('button', { class: 'btn', disabled: !last, onclick: () => saveResult(false) }, icon('save'), 'Save texture'),
      h('button', { class: 'btn', disabled: !last, onclick: () => saveResult(true) }, icon('layers'), 'Save as PBR material'),
      h('button', { class: 'btn', disabled: !last?.savedId, onclick: () => nav.go('editor', last.savedId), title: last?.savedId ? '' : 'Save first' }, icon('brush'), 'Open in editor'),
      h('div', { class: 'sep' }), h('button', { class: 'btn' + (tiled ? ' on' : ''), onclick: () => { tiled = !tiled; drawOut(); last ? showCanvas(last.canvas) : preview(); }, title: 'Show 2x2 tiles to check seams' }, icon('grid'), 'Tile 2x2'),
      h('span', { class: 'grow' }), helpLink('seamless', 'Seamless tips'), academyLink('c1-procedural', 'Procedural lesson'));
  }
  function drawRight() {
    clear(right);
    right.append(tabs([['procedural', 'Procedural'], ['prompt', 'Text to texture'], ['pattern', 'Pattern'], ['image', 'From image'], ['ai', 'AI']], mode, m => { mode = m; if (m === 'pattern') P.recipe = 'pattern'; else if (P.recipe === 'pattern') P.recipe = CATEGORY_DEFAULTS[P.category][0]; drawRight(); drawOut(); preview(); }));
    if (mode === 'prompt') right.append(promptPanel());
    if (mode === 'image') return right.append(imagePanel());
    if (mode === 'ai') return right.append(aiPanel());
    if (mode === 'pattern') right.append(panel('Pattern', [select('Pattern type', PATTERNS, P.pattern, upd('pattern'))]));
    right.append(...controls());
  }
  function promptPanel() {
    const notesEl = h('div', { class: 'small muted' }, notes.join(' . '));
    return panel('Prompt editor', [
      h('div', { class: 'callout', style: { marginTop: 0 } }, 'Text prompts are read locally by keyword matching and turned into procedural settings. This is not AI. For AI images, use the AI tab once an API is connected.'),
      text('Prompt', prompt, v => prompt = v, { area: true, rows: 3, ph: 'weathered red brick wall, dirty, fine mortar' }),
      text('Negative prompt (exclude)', negative, v => negative = v, { area: true, rows: 2, ph: 'no dirt, no scratches', tip: 'Words here remove details: dirt, scratches, aging, glow, repetition, noise, or color names.' }),
      h('button', { class: 'btn pri', onclick: () => { const r = interpretPrompt(prompt, negative, P); P = { ...r.params, width: P.width, height: P.height }; notes = r.notes; drawRight(); preview(); } }, icon('wand'), 'Apply prompt'), notesEl,
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => savePreset('prompt', { prompt, negative }) }, icon('star'), 'Save prompt preset')),
    ]);
  }
  function controls() {
    const cats = S.categories().filter(c => CATEGORY_DEFAULTS[c]);
    const userPal = Object.fromEntries(S.all('preset', p => p.kind === 'palette').map(p => ['Saved: ' + p.name, p.data.colors]));
    const pals = { ...PALETTES, ...userPal };
    const colorRow = h('div', { class: 'row' }, P.colors.map((c, i) => colorIn(c, v => { P.colors[i] = v; preview(); })), select(null, Object.keys(pals), 'Category default', v => { P.colors = (pals[v] || CATEGORY_DEFAULTS[P.category][1]).slice(); drawRight(); preview(); }), h('button', { class: 'btn ghost icon', title: 'Save palette', onclick: async () => { const n = await promptDlg('Palette name', P.category + ' palette'); if (n) { await S.save({ type: 'preset', kind: 'palette', name: n, data: { colors: P.colors.slice() } }); toast('Palette saved', 'ok'); drawRight(); } } }, icon('star')));
    const sizeSel = select('Resolution', [...RES_PRESETS.map(r => [r, r + ' x ' + r]), ['custom', 'Custom...']], RES_PRESETS.includes(P.width) && P.width === P.height ? P.width : 'custom', async v => { if (v === 'custom') { const r = await promptDlg('Width x height in pixels (max 8192)', P.width + 'x' + P.height); const m = r?.match(/(\d+)\s*[x*, ]\s*(\d+)/); if (m) { P.width = Math.min(8192, Math.max(16, +m[1])); P.height = Math.min(8192, Math.max(16, +m[2])); } } else P.width = P.height = +v; drawRight(); drawOut(); preview(); }, 'Final output size. Preview always renders small for speed.');
    return [
      panel('Material', [
        select('Texture category', cats, P.category, v => { const d = defaultParams(v); Object.assign(P, { category: v, recipe: mode === 'pattern' ? 'pattern' : d.recipe, colors: d.colors, roughness: d.roughness, metallic: d.metallic }); drawRight(); preview(); }, 'Selects the procedural recipe and default palette.'),
        select('Surface appearance', Object.keys(SURFACES), 'As category', v => { Object.assign(P, SURFACES[v]); drawRight(); preview(); }),
        h('div', { class: 'f' }, h('label', null, 'Color palette'), colorRow),
        sizeSel, h('div', { class: 'small dim' }, P.width + ' x ' + P.height + ' px'),
      ], { iconName: 'wand' }),
      panel('Pattern & detail', [
        slider('Texture scale', P.scale, 1, 16, 1, upd('scale'), 'How many pattern repeats fit across the tile. Higher means smaller features.'),
        slider('Pattern density', P.density, 0, 1, 0.01, upd('density')),
        slider('Detail level (octaves)', P.detail, 1, 8, 1, upd('detail'), 'Layers of noise. More layers add finer detail and cost more time.'),
        slider('Realism', P.realism, 0, 1, 0.01, upd('realism'), 'Low values posterize into flat, stylized color bands. High values add micro detail.'),
        slider('Organic vs artificial', P.organic, 0, 1, 0.01, upd('organic'), '0 is regular and geometric, 1 is wavy and natural.'),
        slider('Variation', P.variation, 0, 1, 0.01, upd('variation'), 'Large scale color shifts that hide repetition when tiled.'),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, slider('Seed', P.seed, 1, 9999, 1, upd('seed'))), h('button', { class: 'btn icon', title: 'New seed', onclick: () => { P.seed = 1 + Math.floor(Math.random() * 9999); drawRight(); preview(); } }, icon('restore'))),
        check('Seamless / tileable', P.seamless, v => { P.seamless = v; preview(); }, 'All noise wraps at the edges so the texture tiles without seams.'),
      ], { iconName: 'grid' }),
      panel('Surface response', [
        slider('Roughness', P.roughness, 0, 1, 0.01, upd('roughness')),
        slider('Reflectivity', P.reflectivity, 0, 1, 0.01, upd('reflectivity'), 'Shifts roughness down for a more reflective look.'),
        slider('Metallic', P.metallic, 0, 1, 0.01, upd('metallic')),
        slider('Lighting appearance (baked)', P.lighting, 0, 1, 0.01, upd('lighting'), 'Bakes soft directional light into the color. Keep at 0 for PBR use, raise for flat 2D art.'),
        h('div', { class: 'row adv' }, h('label', { class: 'lbl' }, 'Emission color'), colorIn(P.emissionColor, upd('emissionColor'))),
        slider('Emission strength', P.emissionStrength, 0, 2, 0.01, upd('emissionStrength'), 'Only used by glowing recipes (fantasy, sci-fi).', true),
      ], { iconName: 'sun', open: false }),
      panel('Wear & age', [
        slider('Surface imperfections', P.imperfections, 0, 1, 0.01, upd('imperfections'), 'Scratches and spots.'),
        slider('Weathering', P.weathering, 0, 1, 0.01, upd('weathering'), 'Dirt that collects in low areas.'),
        slider('Age & deterioration', P.age, 0, 1, 0.01, upd('age'), 'Fades and yellows colors, adds wear.'),
      ], { iconName: 'restore', open: false }),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => { P = { ...randomParams(), width: P.width, height: P.height }; drawRight(); preview(); } }, icon('restore'), 'Randomize'), h('button', { class: 'btn', onclick: () => savePreset('generation', P) }, icon('star'), 'Save preset'), h('button', { class: 'btn', onclick: loadPreset }, 'Load preset')),
    ];
  }
  function imagePanel() {
    let src = null, blend = 0.25, size = 1024; const prev = h('div', { class: 'small muted' }, 'No reference chosen.');
    const useCanvas = (c, label) => { src = c; prev.textContent = label + ' (' + c.width + 'x' + c.height + ')'; showCanvas(c); };
    return h('div', null,
      h('p', { class: 'small muted' }, 'Turn a photo or reference into a tileable texture, or borrow its colors for a procedural material.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => { const t = await pickTextures(); if (t) useCanvas(await S.textureCanvas(t), t.name); } }, icon('library'), 'From library'),
        h('button', { class: 'btn', onclick: async () => { const [f] = await pickFiles({ accept: IMPORT_ACCEPT, multiple: false }); if (f) try { const r = await decodeFile(f); useCanvas(r.canvas, f.name); } catch (e) { toast(e.message, 'bad'); } } }, icon('upload'), 'From file')), prev,
      panel('Make tileable', [select('Output size', RES_PRESETS.slice(0, 5), size, v => size = +v), slider('Edge blend width', blend, 0.05, 0.6, 0.01, v => blend = v, 'How far in from each edge the image is cross-faded with its offset copy.'),
        h('button', { class: 'btn pri', onclick: () => { if (!src) return toast('Choose a reference first', 'warn'); const s = Math.min(src.width, src.height); const sq = newCanvas(s, s); ctx(sq).drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, s, s); const out = makeSeamless(resize(sq, size, size), blend); last = { canvas: out, gen: null, params: { ...P }, source: 'import' }; showCanvas(out); info.textContent = 'Tileable version made from the reference image. Use Tile 2x2 to check it.'; drawOut(); } }, icon('grid'), 'Create tileable texture')]),
      panel('Use reference colors', [h('p', { class: 'small muted' }, 'Finds the three main colors of the image and applies them to the procedural generator.'),
        h('button', { class: 'btn', onclick: () => { if (!src) return toast('Choose a reference first', 'warn'); P.colors = palette(src); mode = 'procedural'; drawRight(); drawOut(); preview(); toast('Palette applied to procedural settings', 'ok'); } }, 'Extract palette')]));
  }
  function aiPanel() {
    const ai = S.settings().ai; const on = ai.enabled && ai.key;
    const pr = h('textarea', { rows: 4, placeholder: 'seamless tileable texture of mossy cobblestones, top-down, even lighting' }); pr.value = prompt;
    const neg = h('textarea', { rows: 2, placeholder: 'shadows, perspective, text' }); neg.value = negative;
    const btn = h('button', { class: 'btn pri', disabled: !on }, icon('wand'), 'Generate with AI');
    btn.onclick = async () => {
      const t = task('AI generation'); btn.disabled = true;
      try {
        const full = pr.value + (neg.value ? '. Avoid: ' + neg.value : '');
        const res = await fetch(ai.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key }, body: JSON.stringify({ model: ai.model, prompt: full, size: ai.size, n: 1 }) });
        const j = await res.json(); if (!res.ok) throw new Error(j.error?.message || res.status + ' ' + res.statusText);
        const d = j.data?.[0]; let blob; if (d?.b64_json) blob = await (await fetch('data:image/png;base64,' + d.b64_json)).blob(); else if (d?.url) blob = await (await fetch(d.url)).blob(); else throw new Error('The API response had no image.');
        const bmp = await createImageBitmap(blob); const c = newCanvas(bmp.width, bmp.height); ctx(c).drawImage(bmp, 0, 0);
        last = { canvas: c, gen: null, params: { ...P }, source: 'ai' }; prompt = pr.value; negative = neg.value; showCanvas(c); info.textContent = 'AI image from ' + new URL(ai.endpoint).host + '. Check seams with Tile 2x2; use From image to make it tileable if needed.'; drawOut(); t.done();
        S.log('activity', 'AI texture generated');
      } catch (e) { t.fail(e); toast('AI request failed: ' + e.message, 'bad', 7000); S.err('AI generation', e); }
      btn.disabled = false;
    };
    return h('div', null, h('div', { class: 'callout' + (on ? '' : ' warn') }, on ? 'AI generation is enabled. Requests go to ' + new URL(ai.endpoint).host + ' with your prompt only. No studio files are sent.' : 'AI generation is not connected. Add an API endpoint and key in Admin Panel, Integrations. Until then this tab cannot generate.'),
      h('div', { class: 'f' }, h('label', null, 'Prompt'), pr), h('div', { class: 'f' }, h('label', null, 'Negative prompt'), neg), btn, !on ? h('button', { class: 'btn', style: { marginLeft: '6px' }, onclick: () => nav.go('admin', 'integrations') }, 'Set up integration') : null);
  }
  async function savePreset(kind, data) { const name = await promptDlg('Preset name', kind === 'prompt' ? (prompt.slice(0, 30) || 'Prompt') : P.category + ' look'); if (!name) return; await S.save({ type: 'preset', kind, name, data: structuredClone(data) }); toast('Preset saved', 'ok'); }
  async function loadPreset() {
    const list = S.all('preset', p => p.kind === 'generation' || p.kind === 'prompt'); if (!list.length) return toast('No generation presets saved yet', 'warn');
    const r = await modal({ title: 'Load preset', body: h('div', null, list.map(p => h('div', { class: 'row', style: { padding: '4px 0' } }, h('b', null, p.name), h('span', { class: 'badge' }, p.kind), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: e => { e.target.closest('.modal-bg').querySelector('.mh button').click(); setTimeout(() => apply(p)); } }, 'Load')))) });
    function apply(p) { if (p.kind === 'prompt') { prompt = p.data.prompt; negative = p.data.negative; mode = 'prompt'; } else P = { ...defaultParams(p.data.category), ...p.data }; drawRight(); drawOut(); preview(); }
    return r;
  }
  if (arg && S.get(arg)?.type === 'preset') { const p = S.get(arg); if (p.kind === 'prompt') { prompt = p.data.prompt; negative = p.data.negative; mode = 'prompt'; } else P = { ...defaultParams(p.data.category), ...p.data }; }
  drawRight(); drawOut(); setTimeout(preview, 50);
  return { exportArg: () => last?.savedId || '' };
}
// k-means on a downscaled copy to find 3 dominant colors, sorted dark to light
function palette(c) {
  const s = resize(c, 64, 64), d = getData(s).data, px = []; for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  let cent = [px[0], px[Math.floor(px.length / 2)], px[px.length - 1]].map(x => x.slice());
  for (let it = 0; it < 10; it++) { const sum = cent.map(() => [0, 0, 0, 0]); for (const p of px) { let b = 0, bd = 1e9; cent.forEach((c, i) => { const dd = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (dd < bd) { bd = dd; b = i; } }); sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++; } cent = sum.map((s, i) => s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cent[i]); }
  return cent.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])).map(c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
