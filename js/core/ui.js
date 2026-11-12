// Small DOM toolkit shared by every section.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (['value', 'checked', 'disabled', 'selected', 'multiple', 'hidden', 'indeterminate'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
// Make append() ignore null/false and flatten arrays everywhere in this app, so conditional UI never prints "null".
{ const orig = Element.prototype.append; Element.prototype.append = function (...k) { return orig.apply(this, k.flat(Infinity).filter(c => c != null && c !== false)); }; }
// append that skips null/false and flattens arrays
export const add = (el, ...kids) => { for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c); return el; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

const P = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  brush: 'M18.4 2.6a2 2 0 0 1 3 3L11 16l-4-4zM7 12c-2 0-4 2-4 4 0 1.5-1 3-1 3s3 1 5 0c2-1 3-2 3-4',
  layers: 'm12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  cube: 'M21 16V8l-9-5-9 5v8l9 5zM3.3 7 12 12l8.7-5M12 22V12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18',
  academy: 'M22 10 12 5 2 10l10 5zM6 12v5c3 2 9 2 12 0v-5M22 10v6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M17.9 17.9A10 10 0 0 1 12 20C5 20 1 12 1 12a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  chev: 'm6 9 6 6 6-6',
  right: 'm9 18 6-6-6-6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h0',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  eraser: 'm7 21-4-4 10-10 7 7-7 7zM14 21h7M5 15l6 6',
  stamp: 'M5 22h14M19 15H5v4h14zM14 15V9a3 3 0 1 0-4 0v6',
  heal: 'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z',
  select: 'M5 3H3v2M9 3h2M15 3h2M21 3v2M21 9v2M21 15v2M21 21h-2M15 21h-2M9 21H7M3 21v-2M3 15v-2M3 9V7',
  pick: 'm2 22 1-1h3l9-9M3 21v-3l9-9M15 6l3-3 3 3-3 3M12 9l3 3',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  flip: 'M12 3v18M16 7l4 5-4 5zM8 7l-4 5 4 5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sphere: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12c0 2.8 4.5 5 10 5s10-2.2 10-5',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  zip: 'M21 8v13H3V3h12zM10 3v2M12 5v2M10 7v2M12 9v2M10 11v3h2v-3',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  play: 'M5 3l14 9-14 9z',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  drag: 'M9 5h0M9 12h0M9 19h0M15 5h0M15 12h0M15 19h0',
  compare: 'M12 3v18M4 6h5v12H4zM15 6h5v12h-5z',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.dots); s.append(p); return s;
}

export function toast(msg, type = '', ms = 3200) {
  const t = h('div', { class: 'toast ' + type }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  return new Promise(resolve => {
    const close = v => { bg.remove(); document.removeEventListener('keydown', esc); onClose?.(); resolve(v); };
    const esc = e => { if (e.key === 'Escape') close(null); };
    const foot = h('div', { class: 'mf' }, actions.map(a => h('button', {
      class: 'btn ' + (a.cls || ''), onclick: async () => {
        if (a.run) { const r = await a.run(); if (r === false) return; close(r === undefined ? a.value : r); } else close(a.value);
      }
    }, a.label)));
    const m = h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('div', { class: 'mh' }, title, h('button', { class: 'btn ghost icon', style: { marginLeft: 'auto' }, onclick: () => close(null) }, icon('x'))),
      h('div', { class: 'mb' }, body), actions.length ? foot : null);
    const bg = h('div', { class: 'modal-bg', onmousedown: e => { if (e.target === bg) close(null); } }, m);
    document.body.append(bg); document.addEventListener('keydown', esc);
    setTimeout(() => m.querySelector('input,textarea,select')?.focus(), 30);
  });
}
export const confirmDlg = (msg, { title = 'Please confirm', ok = 'Confirm', danger = false } = {}) =>
  modal({ title, body: h('p', null, msg), actions: [{ label: 'Cancel', value: false }, { label: ok, value: true, cls: danger ? 'danger' : 'pri' }] }).then(v => !!v);
export function promptDlg(label, value = '', { title = 'Enter a value', ok = 'OK', type = 'text' } = {}) {
  const inp = h('input', { type, value, style: { width: '100%' }, onkeydown: e => { if (e.key === 'Enter') e.target.closest('.modal').querySelector('.btn.pri').click(); } });
  return modal({ title, body: h('div', { class: 'f' }, h('label', null, label), inp), actions: [{ label: 'Cancel', value: null }, { label: ok, cls: 'pri', run: () => inp.value }] });
}

// ---------- form fields ----------
export const tipEl = t => t ? h('span', { class: 'tip', 'data-tip': t }, '?') : null;
export function slider(label, value, min, max, step, oninput, tip, adv) {
  const v = h('span', { class: 'v' }, fmtNum(value, step));
  const inp = h('input', { type: 'range', min, max, step, value, oninput: e => { v.textContent = fmtNum(+e.target.value, step); oninput(+e.target.value, e); } });
  inp.addEventListener('dblclick', () => { inp.value = inp.defaultValue; inp.dispatchEvent(new Event('input')); });
  const el = h('div', { class: 'f' + (adv ? ' adv' : '') }, h('label', null, label, tipEl(tip), v), inp);
  el.set = x => { inp.value = x; v.textContent = fmtNum(x, step); };
  return el;
}
const fmtNum = (x, step) => (step < 1 ? (+x).toFixed(String(step).split('.')[1]?.length || 2) : String(x));
export function select(label, options, value, onchange, tip, adv) {
  const s = h('select', { onchange: e => onchange(e.target.value, e) },
    options.map(o => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val, selected: String(val) === String(value) }, txt); }));
  return label == null ? s : h('div', { class: 'f' + (adv ? ' adv' : '') }, h('label', null, label, tipEl(tip)), s);
}
export function field(label, input, tip, adv) { return h('div', { class: 'f' + (adv ? ' adv' : '') }, h('label', null, label, tipEl(tip)), input); }
export function text(label, value, onchange, opts = {}) {
  const i = h(opts.area ? 'textarea' : 'input', { type: opts.type || 'text', value: value ?? '', placeholder: opts.ph || '', rows: opts.rows || 3, oninput: e => onchange(e.target.value, e) });
  if (opts.area) i.value = value ?? '';
  return label == null ? i : field(label, i, opts.tip, opts.adv);
}
export function check(label, value, onchange, tip, adv) {
  return h('label', { class: 'chk' + (adv ? ' adv' : '') }, h('input', { type: 'checkbox', checked: !!value, onchange: e => onchange(e.target.checked) }), label, tipEl(tip));
}
export function colorIn(value, oninput) { return h('input', { type: 'color', value, oninput: e => oninput(e.target.value) }); }
export function panel(title, body, { open = true, iconName, adv, extra } = {}) {
  const p = h('div', { class: 'panel' + (open ? '' : ' closed') + (adv ? ' adv' : '') },
    h('div', { class: 'hd', onclick: e => { if (!e.target.closest('button,input,select')) p.classList.toggle('closed'); } }, iconName ? icon(iconName) : null, title, extra || null, icon('chev', 'chev')),
    h('div', { class: 'bd' }, body));
  return p;
}
export function tabs(list, active, onpick) {
  const el = h('div', { class: 'tabs' });
  const draw = a => { clear(el); list.forEach(([id, label]) => el.append(h('button', { class: id === a ? 'on' : '', onclick: () => { draw(id); onpick(id); } }, label))); };
  draw(active); return el;
}
export function badge(t, cls = '') { return h('span', { class: 'badge ' + cls }, t); }
export function progressBar(p) { return h('div', { class: 'prog' }, h('i', { style: { width: Math.round(p * 100) + '%' } })); }

export const fmtBytes = b => b == null ? '-' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
export const fmtDate = t => t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
export const fmtDT = t => t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
export const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(+n || 0).toFixed(2);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- background task tracker ----------
const tasks = new Map(); const taskListeners = new Set(); let tid = 0;
export const taskList = () => [...tasks.values()];
export const onTasks = f => { taskListeners.add(f); return () => taskListeners.delete(f); };
const emitTasks = () => taskListeners.forEach(f => f(taskList()));
export function task(label) {
  const t = { id: ++tid, label, p: 0, state: 'running', started: Date.now() };
  tasks.set(t.id, t); emitTasks();
  return {
    update(p, l) { t.p = p; if (l) t.label = l; emitTasks(); },
    done() { t.state = 'done'; t.p = 1; emitTasks(); setTimeout(() => { tasks.delete(t.id); emitTasks(); }, 1500); },
    fail(e) { t.state = 'failed'; t.error = String(e?.message || e); emitTasks(); setTimeout(() => { tasks.delete(t.id); emitTasks(); }, 6000); },
  };
}
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
export function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise(res => { const i = h('input', { type: 'file', accept, multiple }); i.onchange = () => res([...i.files]); i.click(); });
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
