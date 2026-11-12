import { h, add, icon, clear, slider, select, check, colorIn, panel, toast, modal, confirmDlg, promptDlg, pickFiles, task, fmtDT } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { newCanvas, ctx, getData, fromData, cloneCanvas, resize, makeSeamless, offsetHalf, decodeFile, IMPORT_ACCEPT } from '../core/img.js';
import { pickTextures, compareView, helpLink } from '../core/widgets.js';

const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const BLEND_NAME = b => b === 'source-over' ? 'Normal' : b.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const ADJ0 = { exposure: 0, brightness: 0, contrast: 0, gamma: 1, saturation: 0, hue: 0, temperature: 0, tint: 0 };
const TOOLS = [['brush', 'brush', 'Paint brush (B)'], ['eraser', 'eraser', 'Eraser (E)'], ['clone', 'stamp', 'Clone brush (S). Alt+click sets the source.'], ['heal', 'heal', 'Healing brush (J). Alt+click sets the source. Matches color to the target.'], ['select', 'select', 'Rectangle selection (M)'], ['pick', 'pick', 'Eyedropper (I)'], ['pan', 'hand', 'Pan (H or hold Space)']];
let REV = 1;

export default async function (el, arg) {
  const st = S.settings();
  let doc = null, source = null, targetId = null, dirty = false, tool = 'brush', zoom = 1, ox = 0, oy = 0, tileView = false, space = false;
  const brush = { size: 40, hardness: 0.7, opacity: 1, flow: 0.6, spacing: 0.15, color: '#d08a4c', wrap: true };
  let cloneSrc = null, cloneOff = null, stroke = null, mouse = null, selDrag = null, panDrag = null, previewLayer = null;
  const hist = { list: [], idx: -1 };

  const view = h('canvas', { class: 'view', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', boxShadow: 'none', background: 'transparent' } });
  const stage = h('div', { class: 'stage' }, view);
  const vtools = h('div', { class: 'vtools' }); const topbar = h('div', { class: 'toolbar' }); const right = h('div', { class: 'r' }); const infoBar = h('div', { class: 'toolbar small muted' });
  const resizer = h('div', { class: 'resizer' }); right.append(resizer);
  const ws = h('div', { class: 'ws', style: { '--lw': '0px', '--rw': (st.editorPanelW || 320) + 'px' } }, h('div', { class: 'l' }), h('div', { class: 'c' }, topbar, h('div', { style: { display: 'flex', flex: 1, minHeight: 0 } }, vtools, stage), infoBar), right);
  el.append(h('div', { class: 'page full' }, ws));
  resizer.onpointerdown = e => { resizer.setPointerCapture(e.pointerId); const sx = e.clientX, sw = right.offsetWidth; resizer.onpointermove = ev => { ws.style.setProperty('--rw', Math.max(240, Math.min(560, sw - (ev.clientX - sx))) + 'px'); fit(false); }; resizer.onpointerup = () => { resizer.onpointermove = null; S.saveSettings({ editorPanelW: right.offsetWidth }); }; };

  // ---------------- document ----------------
  const mkLayer = (c, name, props = {}) => ({ id: S.uid('ly'), name, canvas: c, opacity: 1, blend: 'source-over', visible: true, adj: { ...ADJ0 }, rev: ++REV, ...props });
  const active = () => doc.layers[doc.active];
  const touch = L => { L.rev = ++REV; };
  async function openDoc(c, src, layersFromDoc) {
    doc = { w: c.width, h: c.height, layers: layersFromDoc || [mkLayer(c, 'Background')], active: 0, sel: null };
    doc.active = doc.layers.length - 1; source = src; targetId = null; dirty = false;
    hist.list = []; hist.idx = -1; commit('Open', true); fit(); drawAll();
  }
  async function loadTexture(t) {
    const tk = task('Opening ' + t.name);
    try {
      let layers = null;
      if (t.doc?.layers?.length) {
        layers = [];
        for (const l of t.doc.layers) { const b = await S.getBlob(l.blobId); if (!b) throw new Error('Layer data missing'); const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); const c = newCanvas(bmp.width, bmp.height); ctx(c).drawImage(bmp, 0, 0); layers.push(mkLayer(c, l.name, { opacity: l.opacity, blend: l.blend, visible: l.visible, adj: { ...ADJ0, ...l.adj } })); }
      }
      const c = layers ? layers[0].canvas : await S.textureCanvas(t);
      await openDoc(c, t, layers); S.touchRecent('texture', t.id); tk.done();
      nav.crumbs('Studio', 'Texture Editor', t.name);
    } catch (e) { tk.fail(e); toast('Could not open: ' + e.message, 'bad'); S.err('Editor open', e); }
  }

  // ---------------- compositing ----------------
  const adjCache = new WeakMap();
  const isAdj0 = a => Object.keys(ADJ0).every(k => a[k] === ADJ0[k]);
  function adjusted(L) {
    if (L === previewLayer?.layer) return previewLayer.canvas;
    if (isAdj0(L.adj)) return L.canvas;
    const key = L.rev + JSON.stringify(L.adj); const c = adjCache.get(L); if (c?.key === key) return c.canvas;
    const out = fromData(applyAdj(getData(L.canvas), L.adj)); adjCache.set(L, { key, canvas: out }); return out;
  }
  const comp = newCanvas(1, 1);
  function composite() {
    if (comp.width !== doc.w || comp.height !== doc.h) { comp.width = doc.w; comp.height = doc.h; }
    const x = comp.getContext('2d'); x.clearRect(0, 0, doc.w, doc.h);
    for (const L of doc.layers) { if (!L.visible) continue; x.globalAlpha = L.opacity; x.globalCompositeOperation = L.blend; x.drawImage(adjusted(L), 0, 0); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; return comp;
  }
  let raf = 0; const checker = (() => { const c = newCanvas(16, 16), x = c.getContext('2d'); x.fillStyle = '#2a2d35'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#1f2228'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); return c; })();
  function render(recomp = true) {
    if (recomp) needComp = true; if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; if (!doc) return; if (needComp) { composite(); needComp = false; }
      const W = stage.clientWidth, H = stage.clientHeight; if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
      const x = view.getContext('2d'); x.clearRect(0, 0, W, H); x.imageSmoothingEnabled = zoom < 2;
      const dw = doc.w * zoom, dh = doc.h * zoom, T = tileView ? 1 : 0;
      x.save(); x.fillStyle = x.createPattern(checker, 'repeat'); x.fillRect(ox - T * dw, oy - T * dh, dw * (2 * T + 1), dh * (2 * T + 1)); x.restore();
      for (let ty = -T; ty <= T; ty++) for (let tx = -T; tx <= T; tx++) x.drawImage(comp, ox + tx * dw, oy + ty * dh, dw, dh);
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.strokeRect(ox - .5, oy - .5, dw + 1, dh + 1);
      const s = selDrag?.rect || doc.sel;
      if (s) { x.setLineDash([5, 4]); x.strokeStyle = '#fff'; x.strokeRect(ox + s.x * zoom + .5, oy + s.y * zoom + .5, s.w * zoom, s.h * zoom); x.lineDashOffset = 4; x.strokeStyle = '#000'; x.strokeRect(ox + s.x * zoom + .5, oy + s.y * zoom + .5, s.w * zoom, s.h * zoom); x.setLineDash([]); }
      if (mouse && ['brush', 'eraser', 'clone', 'heal'].includes(tool)) { x.beginPath(); x.arc(mouse.sx, mouse.sy, Math.max(1, brush.size * zoom / 2), 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.8)'; x.stroke(); x.beginPath(); x.arc(mouse.sx, mouse.sy, Math.max(1, brush.size * zoom / 2) + 1, 0, Math.PI * 2); x.strokeStyle = 'rgba(0,0,0,.6)'; x.stroke(); }
      if (cloneSrc && (tool === 'clone' || tool === 'heal')) { const p = stroke && cloneOff ? { x: mouse.x + cloneOff.x, y: mouse.y + cloneOff.y } : cloneSrc; const sx = ox + p.x * zoom, sy = oy + p.y * zoom; x.strokeStyle = '#7cf'; x.beginPath(); x.moveTo(sx - 7, sy); x.lineTo(sx + 7, sy); x.moveTo(sx, sy - 7); x.lineTo(sx, sy + 7); x.stroke(); }
    });
  }
  let needComp = true;
  function fit(center = true) {
    if (!doc) return; const W = stage.clientWidth || 800, H = stage.clientHeight || 600;
    if (center) { zoom = Math.min((W - 60) / doc.w, (H - 60) / doc.h, 4); if (tileView) zoom /= 3; }
    ox = (W - doc.w * zoom) / 2; oy = (H - doc.h * zoom) / 2; render(false); drawInfo();
  }
  const ro = new ResizeObserver(() => fit(false)); ro.observe(stage);

  // ---------------- history (snapshot with shared unchanged layers) ----------------
  function snapshot() {
    const prev = hist.list[hist.idx]?.snap;
    return { w: doc.w, h: doc.h, active: doc.active, sel: doc.sel && { ...doc.sel }, layers: doc.layers.map(L => { const p = prev?.layers.find(x => x.id === L.id && x.rev === L.rev); return { id: L.id, name: L.name, opacity: L.opacity, blend: L.blend, visible: L.visible, adj: { ...L.adj }, rev: L.rev, data: p ? p.data : getData(L.canvas) }; }) };
  }
  function commit(label, initial) {
    hist.list = hist.list.slice(0, hist.idx + 1); hist.list.push({ label, snap: snapshot(), t: Date.now() }); hist.idx = hist.list.length - 1;
    const max = st.undoDepth || 40; while (hist.list.length > max + 1) { hist.list.shift(); hist.idx--; }
    let bytes = 0; const seen = new Set(); for (const e of hist.list) for (const l of e.snap.layers) if (!seen.has(l.data)) { seen.add(l.data); bytes += l.data.data.length; }
    while (bytes > 900e6 && hist.list.length > 2) { const e = hist.list.shift(); hist.idx--; for (const l of e.snap.layers) if (!hist.list.some(x => x.snap.layers.some(y => y.data === l.data))) bytes -= l.data.data.length; }
    if (!initial) dirty = true; drawHist(); nav.refresh(); render();
  }
  function restore(i) {
    if (i < 0 || i >= hist.list.length) return; const s = hist.list[i].snap; hist.idx = i;
    doc = { w: s.w, h: s.h, active: Math.min(s.active, s.layers.length - 1), sel: s.sel && { ...s.sel }, layers: s.layers.map(l => ({ id: l.id, name: l.name, opacity: l.opacity, blend: l.blend, visible: l.visible, adj: { ...l.adj }, rev: l.rev, canvas: fromData(l.data) })) };
    dirty = true; drawAll(); render(); nav.refresh();
  }
  const undo = () => { if (hist.idx > 0) restore(hist.idx - 1); };
  const redo = () => { if (hist.idx < hist.list.length - 1) restore(hist.idx + 1); };

  // ---------------- painting ----------------
  const toDoc = e => { const r = view.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, x: (sx - ox) / zoom, y: (sy - oy) / zoom }; };
  const wrapPt = p => tileView || brush.wrap ? { x: ((p.x % doc.w) + doc.w) % doc.w, y: ((p.y % doc.h) + doc.h) % doc.h } : p;
  function beginStroke(p) {
    const L = active(); if (!L.visible) { toast('The active layer is hidden', 'warn'); return false; }
    stroke = { base: cloneCanvas(L.canvas), buf: newCanvas(doc.w, doc.h), last: null, baseData: tool === 'heal' ? getData(L.canvas) : null };
    if (tool === 'clone' || tool === 'heal') { if (!cloneSrc) { toast('Alt+click to set a clone source first', 'warn'); stroke = null; return false; } cloneOff = { x: cloneSrc.x - p.x, y: cloneSrc.y - p.y }; }
    strokeTo(p); return true;
  }
  function strokeTo(p) {
    const step = Math.max(1, brush.size * brush.spacing); const pts = [];
    if (!stroke.last) pts.push(p); else { const dx = p.x - stroke.last.x, dy = p.y - stroke.last.y, d = Math.hypot(dx, dy); if (d < step) return; const n = Math.floor(d / step); for (let i = 1; i <= n; i++) pts.push({ x: stroke.last.x + dx * i / n, y: stroke.last.y + dy * i / n }); }
    for (const q of pts) dab(q); stroke.last = pts[pts.length - 1];
    const L = active(), x = L.canvas.getContext('2d'); x.save(); x.clearRect(0, 0, doc.w, doc.h); x.drawImage(stroke.base, 0, 0);
    if (doc.sel) { x.beginPath(); x.rect(doc.sel.x, doc.sel.y, doc.sel.w, doc.sel.h); x.clip(); }
    x.globalAlpha = brush.opacity; x.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; x.drawImage(stroke.buf, 0, 0); x.restore();
    touch(L); render();
  }
  function dab(p0) {
    const r = brush.size / 2, bx = stroke.buf.getContext('2d'); const wrap = brush.wrap || tileView;
    const p = wrap ? wrapPt(p0) : p0; const offs = [[0, 0]];
    if (wrap) { for (const dx of [-doc.w, 0, doc.w]) for (const dy of [-doc.h, 0, doc.h]) if ((dx || dy) && p.x + dx > -r && p.x + dx < doc.w + r && p.y + dy > -r && p.y + dy < doc.h + r) offs.push([dx, dy]); }
    for (const [dx, dy] of offs) {
      const X = p.x + dx, Y = p.y + dy;
      if (tool === 'brush' || tool === 'eraser') {
        const g = bx.createRadialGradient(X, Y, r * brush.hardness, X, Y, r); const c = tool === 'eraser' ? '0,0,0' : hexRgb(brush.color);
        g.addColorStop(0, `rgba(${c},${brush.flow})`); g.addColorStop(1, `rgba(${c},0)`); bx.fillStyle = g; bx.beginPath(); bx.arc(X, Y, r, 0, Math.PI * 2); bx.fill();
      } else {
        const d = Math.ceil(r * 2), sxp = p0.x + cloneOff.x - r, syp = p0.y + cloneOff.y - r; const t = newCanvas(d, d), tx = t.getContext('2d');
        if (tool === 'heal') {
          const sd = sample(stroke.baseData, Math.round(sxp), Math.round(syp), d), td = sample(stroke.baseData, Math.round(X - r), Math.round(Y - r), d);
          const ms = mean(sd), mt = mean(td); for (let i = 0; i < sd.data.length; i += 4) { sd.data[i] += mt[0] - ms[0]; sd.data[i + 1] += mt[1] - ms[1]; sd.data[i + 2] += mt[2] - ms[2]; } tx.putImageData(sd, 0, 0);
        } else { for (const ddx of [-doc.w, 0, doc.w]) for (const ddy of [-doc.h, 0, doc.h]) if (!(ddx || ddy) || wrap) tx.drawImage(stroke.base, -(sxp + ddx), -(syp + ddy)); }
        tx.globalCompositeOperation = 'destination-in'; const g = tx.createRadialGradient(r, r, r * brush.hardness, r, r, r); g.addColorStop(0, `rgba(0,0,0,${brush.flow})`); g.addColorStop(1, 'rgba(0,0,0,0)'); tx.fillStyle = g; tx.fillRect(0, 0, d, d);
        bx.drawImage(t, X - r, Y - r);
      }
    }
  }
  function sample(id, x0, y0, d) { const out = new ImageData(d, d); for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) { const sx = ((x0 + x) % id.width + id.width) % id.width, sy = ((y0 + y) % id.height + id.height) % id.height, s = (sy * id.width + sx) * 4, o = (y * d + x) * 4; out.data[o] = id.data[s]; out.data[o + 1] = id.data[s + 1]; out.data[o + 2] = id.data[s + 2]; out.data[o + 3] = id.data[s + 3]; } return out; }
  const mean = id => { let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < id.data.length; i += 4) { if (!id.data[i + 3]) continue; r += id.data[i]; g += id.data[i + 1]; b += id.data[i + 2]; n++; } return n ? [r / n, g / n, b / n] : [0, 0, 0]; };

  view.onpointerdown = e => {
    if (!doc) return; view.setPointerCapture(e.pointerId); const p = toDoc(e); mouse = p;
    if (e.button === 1 || tool === 'pan' || space) { panDrag = { sx: e.clientX, sy: e.clientY, ox, oy }; return; }
    if (e.button !== 0) return;
    if ((tool === 'clone' || tool === 'heal') && e.altKey) { cloneSrc = wrapPt({ x: p.x, y: p.y }); toast('Clone source set', '', 1200); render(false); return; }
    if (tool === 'pick') { const q = wrapPt(p); const d = composite().getContext('2d').getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data; brush.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); drawRight(); return; }
    if (tool === 'select') { selDrag = { x0: clampX(p.x), y0: clampY(p.y), rect: null }; return; }
    beginStroke(p);
  };
  view.onpointermove = e => {
    const p = toDoc(e); mouse = p;
    if (panDrag) { ox = panDrag.ox + e.clientX - panDrag.sx; oy = panDrag.oy + e.clientY - panDrag.sy; render(false); return; }
    if (selDrag) { const x1 = clampX(p.x), y1 = clampY(p.y); selDrag.rect = { x: Math.round(Math.min(selDrag.x0, x1)), y: Math.round(Math.min(selDrag.y0, y1)), w: Math.round(Math.abs(x1 - selDrag.x0)), h: Math.round(Math.abs(y1 - selDrag.y0)) }; render(false); drawInfo(); return; }
    if (stroke) strokeTo(p); else render(false);
    drawInfo();
  };
  view.onpointerup = () => {
    if (panDrag) { panDrag = null; return; }
    if (selDrag) { doc.sel = selDrag.rect && selDrag.rect.w > 1 && selDrag.rect.h > 1 ? selDrag.rect : null; selDrag = null; commit(doc.sel ? 'Select' : 'Deselect'); return; }
    if (stroke) { stroke = null; commit({ brush: 'Brush stroke', eraser: 'Erase', clone: 'Clone', heal: 'Heal' }[tool]); }
  };
  view.onpointerleave = () => { mouse = null; render(false); };
  view.onwheel = e => { e.preventDefault(); const p = toDoc(e); const f = e.deltaY < 0 ? 1.15 : 1 / 1.15; const nz = Math.min(32, Math.max(0.05, zoom * f)); ox = p.sx - p.x * nz; oy = p.sy - p.y * nz; zoom = nz; render(false); drawInfo(); };
  const clampX = x => Math.max(0, Math.min(doc.w, x)), clampY = y => Math.max(0, Math.min(doc.h, y));
  const onKey = e => {
    if (/input|textarea|select/i.test(document.activeElement?.tagName) || !doc) return;
    if (e.code === 'Space') { space = e.type === 'keydown'; e.preventDefault(); return; }
    if (e.type !== 'keydown') return; const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) { if (k === 'a') { e.preventDefault(); doc.sel = { x: 0, y: 0, w: doc.w, h: doc.h }; commit('Select all'); } if (k === 'd') { e.preventDefault(); doc.sel = null; commit('Deselect'); } return; }
    const map = { b: 'brush', e: 'eraser', s: 'clone', j: 'heal', m: 'select', i: 'pick', h: 'pan' }; if (map[k]) { tool = map[k]; drawTools(); drawRight(); }
    if (k === '[') { brush.size = Math.max(1, Math.round(brush.size / 1.2)); drawRight(); render(false); } if (k === ']') { brush.size = Math.min(1000, Math.round(brush.size * 1.2)); drawRight(); render(false); }
    if (k === 't') { tileView = !tileView; fit(); drawTop(); } if (k === 'delete' || k === 'backspace') clearSel();
  };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);

  // ---------------- operations ----------------
  function eachLayer(fn, label) { for (const L of doc.layers) { L.canvas = fn(L.canvas); touch(L); } doc.w = doc.layers[0].canvas.width; doc.h = doc.layers[0].canvas.height; doc.sel = null; commit(label); fit(); }
  const xform = (c, w, h, f) => { const n = newCanvas(w, h), x = ctx(n); f(x); x.drawImage(c, 0, 0); return n; };
  const OPS = {
    rotCW: () => eachLayer(c => xform(c, c.height, c.width, x => { x.translate(c.height, 0); x.rotate(Math.PI / 2); }), 'Rotate 90 CW'),
    rotCCW: () => eachLayer(c => xform(c, c.height, c.width, x => { x.translate(0, c.width); x.rotate(-Math.PI / 2); }), 'Rotate 90 CCW'),
    rot180: () => eachLayer(c => xform(c, c.width, c.height, x => { x.translate(c.width, c.height); x.rotate(Math.PI); }), 'Rotate 180'),
    flipH: () => eachLayer(c => xform(c, c.width, c.height, x => { x.translate(c.width, 0); x.scale(-1, 1); }), 'Flip horizontal'),
    flipV: () => eachLayer(c => xform(c, c.width, c.height, x => { x.translate(0, c.height); x.scale(1, -1); }), 'Flip vertical'),
    crop: () => { if (!doc.sel) return toast('Make a selection first (M)', 'warn'); const s = doc.sel; eachLayer(c => { const n = newCanvas(s.w, s.h); ctx(n).drawImage(c, -s.x, -s.y); return n; }, 'Crop'); },
    resize: async () => {
      const w = h('input', { type: 'number', value: doc.w, min: 1, max: 8192 }), hh = h('input', { type: 'number', value: doc.h, min: 1, max: 8192 }), lock = h('input', { type: 'checkbox', checked: true }), f = h('select', null, [['high', 'High quality'], ['bilinear', 'Bilinear'], ['nearest', 'Nearest (pixel art)']].map(([v, l]) => h('option', { value: v }, l)));
      w.oninput = () => { if (lock.checked) hh.value = Math.round(w.value * doc.h / doc.w); }; hh.oninput = () => { if (lock.checked) w.value = Math.round(hh.value * doc.w / doc.h); };
      const pres = h('div', { class: 'row wrap' }, [256, 512, 1024, 2048, 4096].map(n => h('button', { class: 'btn sm', onclick: () => { w.value = n; hh.value = lock.checked ? Math.round(n * doc.h / doc.w) : n; } }, n)));
      const ok = await modal({ title: 'Resize image', body: h('div', null, pres, h('div', { class: 'g2', style: { marginTop: '10px' } }, h('div', { class: 'f' }, h('label', null, 'Width'), w), h('div', { class: 'f' }, h('label', null, 'Height'), hh)), h('label', { class: 'chk' }, lock, 'Keep aspect ratio'), h('div', { class: 'f' }, h('label', null, 'Resampling'), f)), actions: [{ label: 'Cancel', value: false }, { label: 'Resize', cls: 'pri', value: true }] });
      if (ok) eachLayer(c => resize(c, Math.min(8192, +w.value), Math.min(8192, +hh.value), f.value), 'Resize to ' + w.value + 'x' + hh.value);
    },
    tile: async () => { const n = await promptDlg('Repeat the image N x N times (keeps the same pixel size)', '2', { title: 'Tile' }); const k = Math.max(1, Math.min(8, +n || 0)); if (!n || k < 2) return; eachLayer(c => { const t = newCanvas(c.width, c.height), x = ctx(t); for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) x.drawImage(c, i * c.width / k, j * c.height / k, c.width / k, c.height / k); return t; }, 'Tile ' + k + 'x' + k); },
    offset: () => eachLayer(c => offsetHalf(c), 'Offset by half'),
    seamless: async () => { const b = await promptDlg('Edge blend width (0.05 to 0.6). Applies to the active layer.', '0.25', { title: 'Seamless edge correction' }); if (b == null) return; const L = active(); L.canvas = makeSeamless(L.canvas, Math.max(0.05, Math.min(0.6, +b || 0.25))); touch(L); commit('Seamless edge correction'); },
    mirrorLR: () => layerOp(c => { const n = cloneCanvas(c), x = ctx(n); x.save(); x.beginPath(); x.rect(c.width / 2, 0, c.width / 2, c.height); x.clip(); x.clearRect(0, 0, c.width, c.height); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); x.restore(); return n; }, 'Mirror left to right'),
    mirrorTB: () => layerOp(c => { const n = cloneCanvas(c), x = ctx(n); x.save(); x.beginPath(); x.rect(0, c.height / 2, c.width, c.height / 2); x.clip(); x.clearRect(0, 0, c.width, c.height); x.translate(0, c.height); x.scale(1, -1); x.drawImage(c, 0, 0); x.restore(); return n; }, 'Mirror top to bottom'),
    mirrorQuad: () => { OPS.mirrorLR(); OPS.mirrorTB(); },
    layerFlipH: () => layerOp(c => xform(c, c.width, c.height, x => { x.translate(c.width, 0); x.scale(-1, 1); }), 'Flip layer horizontal'),
    layerFlipV: () => layerOp(c => xform(c, c.width, c.height, x => { x.translate(0, c.height); x.scale(1, -1); }), 'Flip layer vertical'),
    layerRotate: async () => { const a = await promptDlg('Angle in degrees', '45', { title: 'Rotate layer' }); if (a == null) return; layerOp(c => xform(c, c.width, c.height, x => { x.translate(c.width / 2, c.height / 2); x.rotate(+a * Math.PI / 180); x.translate(-c.width / 2, -c.height / 2); }), 'Rotate layer ' + a + ' deg'); },
  };
  function layerOp(fn, label) { const L = active(); L.canvas = fn(L.canvas); touch(L); commit(label); }
  function clearSel() { if (!doc.sel) return; const s = doc.sel, L = active(); ctx(L.canvas).clearRect(s.x, s.y, s.w, s.h); touch(L); commit('Clear selection'); }
  function fillSel() { const s = doc.sel || { x: 0, y: 0, w: doc.w, h: doc.h }, L = active(), x = ctx(L.canvas); x.fillStyle = brush.color; x.fillRect(s.x, s.y, s.w, s.h); touch(L); commit('Fill'); }

  // ---------------- filters (with live preview) ----------------
  const FILTERS = {
    blur: ['Blur', [['radius', 'Radius', 0.5, 50, 0.5, 4]], (id, o) => blurWrap(id, o.radius)],
    sharpen: ['Sharpen', [['amount', 'Amount', 0, 3, 0.05, 0.8], ['radius', 'Radius', 0.5, 6, 0.5, 1]], (id, o) => unsharp(id, o.radius, o.amount)],
    edge: ['Edge enhancement', [['amount', 'Amount', 0, 4, 0.05, 1.5]], (id, o) => unsharp(id, 0.7, o.amount)],
    detail: ['Detail enhancement', [['amount', 'Amount', 0, 2, 0.05, 0.6], ['radius', 'Radius', 2, 40, 1, 10]], (id, o) => unsharp(id, o.radius, o.amount)],
    noise: ['Noise', [['amount', 'Amount', 0, 1, 0.01, 0.15], ['mono', 'Monochrome (1=yes)', 0, 1, 1, 1]], (id, o) => noise(id, o.amount, o.mono)],
    grain: ['Grain', [['amount', 'Amount', 0, 1, 0.01, 0.25], ['size', 'Grain size', 1, 6, 0.5, 1.5]], (id, o) => grain(id, o.amount, o.size)],
    wave: ['Distortion: wave', [['amp', 'Amplitude (px)', 0, 60, 1, 8], ['waves', 'Waves across', 1, 20, 1, 4]], (id, o) => warp(id, (x, y, w, hh) => [x + o.amp * Math.sin(2 * Math.PI * o.waves * y / hh), y + o.amp * Math.sin(2 * Math.PI * o.waves * x / w)])],
    swirl: ['Distortion: swirl', [['angle', 'Angle', -720, 720, 5, 180], ['radius', 'Radius (fraction)', 0.1, 1, 0.01, 0.5]], (id, o) => warp(id, (x, y, w, hh) => { const cx = w / 2, cy = hh / 2, dx = x - cx, dy = y - cy, R = o.radius * Math.min(w, hh), d = Math.hypot(dx, dy); if (d >= R) return [x, y]; const a = (o.angle * Math.PI / 180) * (1 - d / R) ** 2, c = Math.cos(a), s = Math.sin(a); return [cx + dx * c - dy * s, cy + dx * s + dy * c]; })],
    displace: ['Displacement', [['amount', 'Amount (px)', 0, 80, 1, 12], ['scale', 'Noise scale', 1, 32, 1, 6], ['seed', 'Seed', 1, 999, 1, 7]], (id, o) => { const n = valueNoise(id.width, id.height, o.scale, o.seed), m = valueNoise(id.width, id.height, o.scale, o.seed + 50); return warp(id, (x, y, w) => { const i = (Math.floor(y) % id.height) * w + (Math.floor(x) % w); return [x + (n[i] - 0.5) * 2 * o.amount, y + (m[i] - 0.5) * 2 * o.amount]; }); }],
    invert: ['Invert colors', [], id => { const d = id.data; for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } return id; }],
    desat: ['Desaturate', [], id => { const d = id.data; for (let i = 0; i < d.length; i += 4) { const l = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722; d[i] = d[i + 1] = d[i + 2] = l; } return id; }],
    bw: ['Black and white (threshold)', [['t', 'Threshold', 0, 255, 1, 128]], (id, o) => { const d = id.data; for (let i = 0; i < d.length; i += 4) { const l = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722 >= o.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = l; } return id; }],
    autolevels: ['Auto levels', [], id => { const d = id.data; let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); } const k = 255 / Math.max(1, hi - lo); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - lo) * k; return id; }],
  };
  async function runFilter(key) {
    const [title, params, fn] = FILTERS[key]; const L = active(); const o = Object.fromEntries(params.map(p => [p[0], p[5]]));
    const apply = () => { const src = getData(L.canvas); let out = fn(new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), o); if (doc.sel) out = mergeSel(src, out, doc.sel); return fromData(out); };
    const upd = () => { previewLayer = { layer: L, canvas: apply() }; render(); };
    if (!params.length) { L.canvas = apply(); touch(L); commit(title); return; }
    const big = doc.w * doc.h > 2048 * 2048; let live = !big;
    const body = h('div', null, params.map(([k, label, mn, mx, stp, def]) => slider(label, def, mn, mx, stp, v => { o[k] = v; if (live) upd(); })), check('Live preview', live, v => { live = v; if (v) upd(); else { previewLayer = null; render(); } }), doc.sel ? h('div', { class: 'small muted' }, 'Applies inside the selection only.') : null);
    if (live) upd();
    const ok = await modal({ title, body, actions: [{ label: 'Cancel', value: false }, { label: 'Apply', cls: 'pri', value: true }] });
    previewLayer = null;
    if (ok) { const t = task(title); await new Promise(r => setTimeout(r, 10)); L.canvas = apply(); touch(L); commit(title); t.done(); } else render();
  }

  // ---------------- layers ----------------
  function addLayer(c, name) { const L = mkLayer(c || newCanvas(doc.w, doc.h), name || 'Layer ' + (doc.layers.length + 1)); if (L.canvas.width !== doc.w || L.canvas.height !== doc.h) L.canvas = resize(L.canvas, doc.w, doc.h); doc.layers.splice(doc.active + 1, 0, L); doc.active++; commit('Add layer'); drawRight(); }
  const LAYER_ACT = {
    add: () => addLayer(),
    fromTex: async () => { const t = await pickTextures({ title: 'Add texture as layer' }); if (t) addLayer(await S.textureCanvas(t), t.name); },
    fromFile: async () => { const [f] = await pickFiles({ accept: IMPORT_ACCEPT, multiple: false }); if (f) try { addLayer((await decodeFile(f)).canvas, f.name); } catch (e) { toast(e.message, 'bad'); } },
    dup: () => { const L = active(); addLayer(cloneCanvas(L.canvas), L.name + ' copy'); const N = active(); Object.assign(N, { opacity: L.opacity, blend: L.blend, adj: { ...L.adj } }); },
    del: () => { if (doc.layers.length < 2) return toast('A document needs at least one layer', 'warn'); doc.layers.splice(doc.active, 1); doc.active = Math.max(0, doc.active - 1); commit('Delete layer'); drawRight(); },
    up: () => { const i = doc.active; if (i >= doc.layers.length - 1) return; [doc.layers[i], doc.layers[i + 1]] = [doc.layers[i + 1], doc.layers[i]]; doc.active++; commit('Move layer up'); drawRight(); },
    down: () => { const i = doc.active; if (i <= 0) return; [doc.layers[i], doc.layers[i - 1]] = [doc.layers[i - 1], doc.layers[i]]; doc.active--; commit('Move layer down'); drawRight(); },
    merge: () => { const i = doc.active; if (i <= 0) return toast('Nothing below to merge into', 'warn'); const A = doc.layers[i], B = doc.layers[i - 1]; const c = cloneCanvas(adjusted(B)), x = ctx(c); x.globalAlpha = A.opacity; x.globalCompositeOperation = A.blend; if (A.visible) x.drawImage(adjusted(A), 0, 0); B.canvas = c; B.adj = { ...ADJ0 }; touch(B); doc.layers.splice(i, 1); doc.active = i - 1; commit('Merge down'); drawRight(); },
    flatten: () => { const c = cloneCanvas(composite()); doc.layers = [mkLayer(c, 'Flattened')]; doc.active = 0; commit('Flatten'); drawRight(); },
    bake: () => { const L = active(); if (isAdj0(L.adj)) return; L.canvas = fromData(applyAdj(getData(L.canvas), L.adj)); L.adj = { ...ADJ0 }; touch(L); commit('Apply adjustments'); drawRight(); },
  };

  // ---------------- saving ----------------
  async function save(asNew = false, auto = false) {
    if (!doc) return;
    if (!asNew && !targetId && source && !auto && st.editorSaveMode === 'ask') { /* reserved */ }
    const t = auto ? null : task('Saving texture');
    try {
      const flat = cloneCanvas(composite());
      let rec;
      if (targetId && !asNew) rec = S.get(targetId);
      else {
        const vers = source ? S.versionsOf(source) : []; const maxV = vers.reduce((a, v) => Math.max(a, v.version || 1), 0);
        rec = { id: S.uid('tex'), name: source ? source.name.replace(/ \(v\d+\)$/, '') : 'Untitled texture', kind: 'edited', parentId: source?.id || null, version: source ? maxV + 1 : 1, projectId: source?.projectId || null, category: source?.category || null, tags: [...(source?.tags || [])], description: source?.description || '', materialId: source?.materialId, mapType: source?.mapType, materialName: source?.materialName, folder: source ? S.defaultFolder(source.mapType ? 'map' : 'edited', source.projectId, source.materialName) : null };
        if (!source) { const n = await promptDlg('Texture name', 'Untitled texture', { title: 'Save new texture' }); if (!n) { t?.fail('cancelled'); return; } rec.name = n; }
      }
      const oldLayers = rec.doc?.layers || [];
      const layers = [];
      for (const L of doc.layers) { const bid = 'lay_' + rec.id + '_' + L.id + '_' + L.rev; const old = oldLayers.find(o => o.blobId === bid); if (!old) await S.putBlob(bid, await S.canvasToBlob(L.canvas)); layers.push({ id: L.id, name: L.name, opacity: L.opacity, blend: L.blend, visible: L.visible, adj: { ...L.adj }, blobId: bid }); }
      rec.doc = doc.layers.length > 1 || !isAdj0(doc.layers[0].adj) ? { layers } : null;
      for (const o of oldLayers) if (!layers.some(l => l.blobId === o.blobId)) await S.delBlob(o.blobId);
      if (!rec.doc) for (const l of layers) await S.delBlob(l.blobId);
      rec.editedAt = Date.now(); rec.history = hist.list.slice(-30).map(e => ({ label: e.label, t: e.t }));
      await S.saveTexture(flat, rec); targetId = rec.id; dirty = false;
      if (rec.materialId && rec.mapType && S.get(rec.materialId)) { const m = S.get(rec.materialId); m.maps[rec.mapType] = rec.id; m.mapNotes ||= {}; m.mapNotes[rec.mapType] = 'edited'; await S.save(m); }
      if (!auto) { await S.log('activity', `Saved "${rec.name}" v${rec.version}`, 'info', { ref: rec.id }); toast(`Saved "${rec.name}" as version ${rec.version}`, 'ok'); }
      nav.status((auto ? 'Autosaved ' : 'Saved ') + new Date().toLocaleTimeString());
      t?.done(); drawTop(); drawInfo();
    } catch (e) { t?.fail(e); toast('Save failed: ' + e.message, 'bad'); S.err('Editor save', e); }
  }
  async function saveOver() {
    if (!source) return save();
    const orig = source.kind === 'original';
    if (!(await confirmDlg(orig ? `"${source.name}" is an ORIGINAL import. Overwriting replaces the original pixels permanently. Older versions are not affected. Overwrite the original?` : `Replace version ${source.version} of "${source.name}" with the current image?`, { danger: true, ok: orig ? 'Overwrite original' : 'Replace version' }))) return;
    targetId = source.id; await save(false); if (orig) S.log('activity', 'Original overwritten with permission: ' + source.name, 'warn');
  }
  const autoTimer = setInterval(() => { if (dirty && doc && (targetId || source)) save(false, true); }, Math.max(15, st.autosaveSec || 60) * 1000);

  // ---------------- UI ----------------
  function menu(btn, items) {
    const m = h('div', { class: 'gres', style: { position: 'fixed', width: '240px', top: btn.getBoundingClientRect().bottom + 4 + 'px', left: btn.getBoundingClientRect().left + 'px' } }, items.map(it => it === '-' ? h('div', { class: 'hr', style: { margin: '4px 0' } }) : h('div', { class: 'row', onmousedown: e => { e.preventDefault(); m.remove(); it[1](); } }, it[0])));
    document.body.append(m); const close = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); } }; setTimeout(() => document.addEventListener('mousedown', close));
  }
  function drawTop() {
    clear(topbar); const has = !!doc;
    const b = (ic, label, fn, opts = {}) => h('button', { class: 'btn sm' + (opts.on ? ' on' : ''), onclick: fn, disabled: opts.needDoc !== false && !has, title: opts.title || '' }, ic ? icon(ic) : null, label);
    add(topbar, 
      b('plus', 'New', newDoc, { needDoc: false }), b('library', 'Open', async () => { const t = await pickTextures({ title: 'Open texture in editor' }); if (t) nav.go('editor', t.id); }, { needDoc: false }),
      b('save', 'Save', () => save(false), { title: targetId ? 'Update the version saved this session' : 'Save as a new version (the source is never overwritten)' }), b(null, 'Save as new version', () => save(true)), source ? b(null, 'Replace source...', saveOver, { title: 'Overwrite the opened version (asks first)' }) : null,
      h('div', { class: 'sep' }),
      h('button', { class: 'btn sm', disabled: !has, onclick: e => menu(e.currentTarget, [['Crop to selection', OPS.crop], ['Resize image...', OPS.resize], '-', ['Rotate 90 clockwise', OPS.rotCW], ['Rotate 90 counter-clockwise', OPS.rotCCW], ['Rotate 180', OPS.rot180], ['Flip horizontal', OPS.flipH], ['Flip vertical', OPS.flipV], '-', ['Tile N x N...', OPS.tile], ['Offset by half (check seams)', OPS.offset], ['Seamless edge correction...', OPS.seamless]]) }, 'Image', icon('chev')),
      h('button', { class: 'btn sm', disabled: !has, onclick: e => menu(e.currentTarget, [['Flip layer horizontal', OPS.layerFlipH], ['Flip layer vertical', OPS.layerFlipV], ['Rotate layer...', OPS.layerRotate], '-', ['Mirror left to right', OPS.mirrorLR], ['Mirror top to bottom', OPS.mirrorTB], ['Mirror four ways', OPS.mirrorQuad], '-', ['Fill selection with color', fillSel], ['Clear selection', clearSel], ['Select all (Ctrl+A)', () => { doc.sel = { x: 0, y: 0, w: doc.w, h: doc.h }; commit('Select all'); }], ['Deselect (Ctrl+D)', () => { doc.sel = null; commit('Deselect'); }]]) }, 'Layer', icon('chev')),
      h('button', { class: 'btn sm', disabled: !has, onclick: e => menu(e.currentTarget, Object.entries(FILTERS).map(([k, f]) => [f[0] + (f[1].length ? '...' : ''), () => runFilter(k)])) }, 'Filters', icon('chev')),
      h('div', { class: 'sep' }), b('grid', 'Tile view', () => { tileView = !tileView; fit(); drawTop(); }, { on: tileView, title: 'Shows 3x3 repeats. Painting wraps across edges. (T)' }),
      b(null, 'Fit', () => fit()), b(null, '100%', () => { zoom = 1; fit(false); }),
      b('compare', 'Compare', compare, { title: 'Compare with the source version' }),
      h('span', { class: 'grow' }), helpLink('editor-basics', 'Editor help'));
  }
  function drawTools() { clear(vtools); for (const [id, ic, tip] of TOOLS) vtools.append(h('button', { class: 'btn icon' + (tool === id ? ' on' : ''), title: tip, onclick: () => { tool = id; drawTools(); drawRight(); render(false); } }, icon(ic))); }
  let histEl, layersEl;
  function drawRight() {
    for (const c of [...right.children]) if (c !== resizer) c.remove();
    if (!doc) { right.append(h('div', { class: 'empty' }, 'Open or create a document to edit.')); return; }
    const toolOpts = [];
    if (['brush', 'eraser', 'clone', 'heal'].includes(tool)) {
      toolOpts.push(slider('Size', brush.size, 1, 500, 1, v => { brush.size = v; }, 'Shortcut: [ and ]'), slider('Hardness', brush.hardness, 0, 1, 0.01, v => brush.hardness = v), slider('Opacity', brush.opacity, 0.01, 1, 0.01, v => brush.opacity = v, 'Maximum coverage of one stroke.'), slider('Flow', brush.flow, 0.01, 1, 0.01, v => brush.flow = v, 'How much each dab adds. Low flow builds up gradually.'), slider('Spacing', brush.spacing, 0.02, 1, 0.01, v => brush.spacing = v, 'Distance between dabs as a fraction of size.', true), check('Wrap strokes across edges', brush.wrap, v => brush.wrap = v, 'Paint that crosses an edge continues on the opposite side, so the texture stays seamless.'));
      if (tool === 'brush') toolOpts.push(h('div', { class: 'row' }, h('label', { class: 'lbl' }, 'Color'), colorIn(brush.color, v => brush.color = v)));
      if (tool === 'clone' || tool === 'heal') toolOpts.push(h('div', { class: 'small muted' }, cloneSrc ? `Source: ${Math.round(cloneSrc.x)}, ${Math.round(cloneSrc.y)}. Alt+click to change.` : 'Alt+click on the image to set a source point.'));
    } else if (tool === 'select') toolOpts.push(h('div', { class: 'small muted' }, 'Drag to select. Filters, fills and crop use the selection. Ctrl+A selects all, Ctrl+D deselects.'));
    else if (tool === 'pick') toolOpts.push(h('div', { class: 'row' }, 'Picked color', colorIn(brush.color, v => brush.color = v)));
    right.append(panel('Tool: ' + TOOLS.find(t => t[0] === tool)[2].split(' (')[0], toolOpts, { iconName: TOOLS.find(t => t[0] === tool)[1] }));
    const L = active(); const adjSet = k => v => { L.adj[k] = v; render(); adjCommit(); };
    right.append(panel('Color correction (non-destructive)', [
      h('div', { class: 'small dim', style: { marginBottom: '6px' } }, 'Applies to layer "' + L.name + '". Stored as settings, so it can be changed later. Double-click a slider to reset.'),
      slider('Exposure', L.adj.exposure, -3, 3, 0.05, adjSet('exposure')), slider('Brightness', L.adj.brightness, -1, 1, 0.01, adjSet('brightness')), slider('Contrast', L.adj.contrast, -1, 2, 0.01, adjSet('contrast')),
      slider('Gamma', L.adj.gamma, 0.2, 3, 0.01, adjSet('gamma')), slider('Saturation', L.adj.saturation, -1, 2, 0.01, adjSet('saturation')), slider('Hue', L.adj.hue, -180, 180, 1, adjSet('hue')),
      slider('Temperature', L.adj.temperature, -1, 1, 0.01, adjSet('temperature'), null, true), slider('Tint', L.adj.tint, -1, 1, 0.01, adjSet('tint'), null, true),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => { L.adj = { ...ADJ0 }; commit('Reset adjustments'); drawRight(); } }, 'Reset'), h('button', { class: 'btn sm', onclick: LAYER_ACT.bake, title: 'Bake the adjustments into the pixels' }, 'Apply to pixels'),
        h('button', { class: 'btn sm', title: 'Save these settings as an editing preset', onclick: async () => { const n = await promptDlg('Preset name', 'My color grade'); if (n) { await S.save({ type: 'preset', kind: 'edit', name: n, data: { adj: { ...L.adj } } }); toast('Editing preset saved', 'ok'); } } }, icon('star')),
        select(null, [['', 'Load preset...'], ...S.all('preset', p => p.kind === 'edit').map(p => [p.id, p.name])], '', v => { if (!v) return; L.adj = { ...ADJ0, ...S.get(v).data.adj }; commit('Load editing preset'); drawRight(); })),
    ], { iconName: 'sun', open: false }));
    layersEl = h('div', { class: 'layers' }); drawLayers();
    const lb = (ic, t, f) => h('button', { class: 'btn ghost icon', title: t, onclick: f }, icon(ic));
    right.append(panel('Layers', [h('div', { class: 'row', style: { marginBottom: '6px' } }, lb('plus', 'New empty layer', LAYER_ACT.add), lb('library', 'Add texture as layer', LAYER_ACT.fromTex), lb('upload', 'Add file as layer', LAYER_ACT.fromFile), lb('copy', 'Duplicate', LAYER_ACT.dup), lb('chev', 'Move down', LAYER_ACT.down), h('span', { style: { transform: 'rotate(180deg)', display: 'inline-flex' } }, lb('chev', 'Move up', LAYER_ACT.up)), lb('trash', 'Delete', LAYER_ACT.del)),
      h('div', { class: 'g2' }, select(null, BLENDS.map(b => [b, BLEND_NAME(b)]), L.blend, v => { L.blend = v; commit('Blend mode'); }), h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Opacity'), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: L.opacity, oninput: e => { L.opacity = +e.target.value; render(); }, onchange: () => commit('Layer opacity') }))),
      layersEl, h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: LAYER_ACT.merge }, 'Merge down'), h('button', { class: 'btn sm', onclick: LAYER_ACT.flatten }, 'Flatten'))], { iconName: 'layers' }));
    histEl = h('div', { class: 'hist', style: { maxHeight: '220px', overflow: 'auto' } }); drawHist();
    right.append(panel('History', [histEl, h('div', { class: 'small dim', style: { marginTop: '4px' } }, 'Click a step to jump back. Up to ' + (st.undoDepth || 40) + ' steps.')], { iconName: 'undo', open: false }));
    if (source) { const vers = S.versionsOf(source); right.append(panel('Versions', vers.map(v => h('div', { class: 'row small', style: { padding: '2px 0' } }, h('img', { src: v.thumb, style: { width: '24px', height: '24px', borderRadius: '3px' } }), 'v' + (v.version || 1) + ' ' + v.kind, h('span', { class: 'grow' }), h('span', { class: 'muted' }, fmtDT(v.modified)), v.id !== source.id ? h('button', { class: 'btn ghost sm', onclick: () => nav.go('editor', v.id) }, 'Open') : h('span', { class: 'badge acc' }, 'open'))), { iconName: 'list', open: false })); }
  }
  let adjT; const adjCommit = () => { clearTimeout(adjT); adjT = setTimeout(() => commit('Adjust colors'), 500); };
  function drawLayers() {
    clear(layersEl);
    [...doc.layers].reverse().forEach(L => {
      const i = doc.layers.indexOf(L); const th = h('canvas', { width: 32, height: 32 }); th.getContext('2d').drawImage(L.canvas, 0, 0, 32, 32);
      layersEl.append(h('div', { class: 'ly' + (i === doc.active ? ' on' : ''), onclick: () => { doc.active = i; drawRight(); } },
        h('button', { class: 'btn ghost icon', onclick: e => { e.stopPropagation(); L.visible = !L.visible; commit(L.visible ? 'Show layer' : 'Hide layer'); drawRight(); } }, icon(L.visible ? 'eye' : 'eyeoff')), th,
        h('span', { class: 'nm', ondblclick: async e => { e.stopPropagation(); const n = await promptDlg('Layer name', L.name); if (n) { L.name = n; commit('Rename layer'); drawRight(); } } }, L.name),
        h('span', { class: 'small dim' }, Math.round(L.opacity * 100) + '%')));
    });
  }
  function drawHist() { if (!histEl) return; clear(histEl); hist.list.forEach((e, i) => histEl.append(h('div', { class: 'it' + (i === hist.idx ? ' on' : i > hist.idx ? ' future' : ''), onclick: () => restore(i) }, e.label))); histEl.scrollTop = histEl.scrollHeight; }
  function drawInfo() {
    clear(infoBar); if (!doc) return;
    add(infoBar, h('span', null, doc.w + ' x ' + doc.h + ' px'), h('span', null, Math.round(zoom * 100) + '%'), h('span', null, doc.layers.length + ' layer' + (doc.layers.length > 1 ? 's' : '')),
      mouse ? h('span', null, 'x ' + Math.floor(mouse.x) + '  y ' + Math.floor(mouse.y)) : null, doc.sel ? h('span', null, 'Selection ' + doc.sel.w + ' x ' + doc.sel.h) : null,
      h('span', { class: 'grow' }), h('span', null, source ? `Editing "${source.name}" v${source.version || 1}` + (targetId ? ' . saving to v' + S.get(targetId)?.version : ' . saves as a new version') : 'New document'), dirty ? h('span', { style: { color: 'var(--warn)' } }, 'Unsaved changes') : h('span', null, 'Saved'));
  }
  function drawAll() { drawTop(); drawTools(); drawRight(); drawInfo(); }
  async function newDoc() {
    const w = h('input', { type: 'number', value: st.defaultSize || 1024 }), hh = h('input', { type: 'number', value: st.defaultSize || 1024 }), bg = h('input', { type: 'color', value: '#808080' }), tr = h('input', { type: 'checkbox' });
    const ok = await modal({ title: 'New document', body: h('div', null, h('div', { class: 'row wrap' }, [256, 512, 1024, 2048, 4096].map(n => h('button', { class: 'btn sm', onclick: () => { w.value = hh.value = n; } }, n))), h('div', { class: 'g2', style: { marginTop: '10px' } }, h('div', { class: 'f' }, h('label', null, 'Width'), w), h('div', { class: 'f' }, h('label', null, 'Height'), hh)), h('div', { class: 'row' }, 'Background', bg, h('label', { class: 'chk', style: { margin: 0 } }, tr, 'Transparent'))), actions: [{ label: 'Cancel', value: false }, { label: 'Create', cls: 'pri', value: true }] });
    if (!ok) return; const c = newCanvas(Math.min(8192, +w.value), Math.min(8192, +hh.value)); if (!tr.checked) { const x = ctx(c); x.fillStyle = bg.value; x.fillRect(0, 0, c.width, c.height); }
    if (dirty && doc) await save(false, true);
    await openDoc(c, null); nav.crumbs('Studio', 'Texture Editor', 'New document');
  }
  async function compare() {
    const a = source ? await S.blobURL(source.blobId) : null; const b = composite().toDataURL();
    if (!a) return toast('A new document has no source to compare with', 'warn');
    modal({ title: 'Compare: source vs current', wide: true, body: compareView(a, b, { labels: [`Source v${source.version || 1}`, 'Current edit'] }) });
  }

  // ---------------- boot ----------------
  drawAll();
  if (arg && S.get(arg)?.type === 'texture') await loadTexture(S.get(arg));
  else if (nav.handoff.editorCanvas) { const c = nav.handoff.editorCanvas; nav.handoff.editorCanvas = null; await openDoc(c, null); }
  else {
    const rec = S.recent('texture').slice(0, 8);
    right.append(h('div', { class: 'card tight' }, h('h3', null, 'Start editing'), h('p', { class: 'muted small' }, 'Open a texture from the library or start a blank document.'), h('div', { class: 'row wrap' }, h('button', { class: 'btn pri', onclick: async () => { const t = await pickTextures({ title: 'Open texture in editor' }); if (t) nav.go('editor', t.id); } }, 'Open texture'), h('button', { class: 'btn', onclick: newDoc }, 'New blank')),
      rec.length ? [h('h4', { style: { marginTop: '12px' } }, 'Recent'), h('div', { class: 'tgrid', style: { '--tw': '80px' } }, rec.map(t => h('img', { src: t.thumb, title: t.name, style: { width: '100%', borderRadius: '6px', cursor: 'pointer' }, onclick: () => nav.go('editor', t.id) })))] : null));
  }
  return {
    save: () => save(false), undo, redo, canUndo: () => hist.idx > 0, canRedo: () => hist.idx < hist.list.length - 1,
    autosave: async () => { if (dirty && doc && (targetId || source)) await save(false, true); },
    exportArg: () => targetId || source?.id || '',
    destroy: () => { clearInterval(autoTimer); ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); },
  };
}

// ======== pixel helpers ========
const hexRgb = s => { const n = parseInt(s.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
export function applyAdj(id, a) {
  const d = id.data, ex = Math.pow(2, a.exposure), lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) { let v = i / 255 * ex + a.brightness; v = (v - 0.5) * (1 + a.contrast) + 0.5; v = Math.pow(Math.max(0, v), 1 / a.gamma); lut[i] = v * 255; }
  const s = 1 + a.saturation, hr = a.hue * Math.PI / 180, c = Math.cos(hr), sn = Math.sin(hr);
  const M = [.213 + c * .787 - sn * .213, .715 - c * .715 - sn * .715, .072 - c * .072 + sn * .928, .213 - c * .213 + sn * .143, .715 + c * .285 + sn * .140, .072 - c * .072 - sn * .283, .213 - c * .213 - sn * .787, .715 - c * .715 + sn * .715, .072 + c * .928 + sn * .072];
  const tr = a.temperature * 30, tg = a.tint * 30;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]] + tr, g = lut[d[i + 1]] + tg, b = lut[d[i + 2]] - tr;
    if (a.hue) { const R = r, G = g, B = b; r = R * M[0] + G * M[1] + B * M[2]; g = R * M[3] + G * M[4] + B * M[5]; b = R * M[6] + G * M[7] + B * M[8]; }
    if (a.saturation) { const L = r * .2126 + g * .7152 + b * .0722; r = L + (r - L) * s; g = L + (g - L) * s; b = L + (b - L) * s; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return id;
}
function blurWrap(id, r) {
  const w = id.width, hh = id.height, big = newCanvas(w * 3, hh * 3), x = ctx(big), src = fromData(id);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.drawImage(src, i * w, j * hh);
  const out = newCanvas(w, hh), o = ctx(out); o.filter = `blur(${r}px)`; o.drawImage(big, -w, -hh); o.filter = 'none'; return getData(out);
}
function unsharp(id, r, amt) { const b = blurWrap(new ImageData(new Uint8ClampedArray(id.data), id.width, id.height), r).data, d = id.data; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (d[i + c] - b[i + c]) * amt; return id; }
function noise(id, amt, mono) { const d = id.data, k = amt * 255; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * k; for (let c = 0; c < 3; c++) d[i + c] += mono ? n : (Math.random() - 0.5) * k; } return id; }
function grain(id, amt, size) {
  const w = id.width, hh = id.height, gw = Math.max(1, Math.round(w / size)), gh = Math.max(1, Math.round(hh / size)), g = new ImageData(gw, gh);
  for (let i = 0; i < g.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; g.data[i] = g.data[i + 1] = g.data[i + 2] = v; g.data[i + 3] = 255; }
  const gd = getData(resize(fromData(g), w, hh, 'bilinear')).data, d = id.data;
  for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 765, wgt = 1 - Math.abs(L - 0.5) * 1.4, n = (gd[i] - 128) * amt * wgt; for (let c = 0; c < 3; c++) d[i + c] += n; }
  return id;
}
function warp(id, f) {
  const w = id.width, hh = id.height, s = id.data, out = new ImageData(w, hh), d = out.data;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let [sx, sy] = f(x, y, w, hh); sx = ((sx % w) + w) % w; sy = ((sy % hh) + hh) % hh;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = (x0 + 1) % w, y1 = (y0 + 1) % hh, fx = sx - x0, fy = sy - y0, o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) { const a = s[(y0 * w + x0) * 4 + c], b = s[(y0 * w + x1) * 4 + c], cc = s[(y1 * w + x0) * 4 + c], dd = s[(y1 * w + x1) * 4 + c]; d[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy; }
  }
  return out;
}
function valueNoise(w, hh, scale, seed) {
  const g = Math.max(1, Math.round(scale)), grid = new Float32Array(g * g); let s = seed * 9301 + 49297; for (let i = 0; i < grid.length; i++) { s = (s * 9301 + 49297) % 233280; grid[i] = s / 233280; }
  const out = new Float32Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const u = x / w * g, v = y / hh * g, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const G = (i, j) => grid[(j % g) * g + (i % g)]; out[y * w + x] = (G(x0, y0) * (1 - sx) + G(x0 + 1, y0) * sx) * (1 - sy) + (G(x0, y0 + 1) * (1 - sx) + G(x0 + 1, y0 + 1) * sx) * sy; }
  return out;
}
function mergeSel(src, out, s) { const r = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height); for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) { const i = (y * src.width + x) * 4; for (let c = 0; c < 4; c++) r.data[i + c] = out.data[i + c]; } return r; }
