import { h, icon, clear, toast, debounce, badge } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { COURSES, LEVELS } from '../content/academy-content.js';
import { runGen, quickProject } from '../core/widgets.js';
import { defaultParams } from '../core/procedural.js';
import { buildMaps, defaultPbr, toCanvas } from '../core/pbr.js';
import { newCanvas, fromData } from '../core/img.js';

const ALL = COURSES.flatMap(c => c.lessons.map(l => ({ ...l, course: c })));
async function progress() { let p = S.get('academy'); if (!p) p = { id: 'academy', type: 'academy', done: {}, notes: {}, quiz: {} }; p.done ||= {}; p.notes ||= {}; p.quiz ||= {}; return p; }

export default async function (el, arg) {
  const P = await progress(); const page = h('div', { class: 'page' }); el.append(page);
  const lesson = ALL.find(l => l.id === arg);
  if (lesson) return lessonView(page, lesson, P);
  let level = '', q = '';
  const list = h('div');
  const total = ALL.length, done = ALL.filter(l => P.done[l.id]).length;
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Texture Creator Academy'), h('div', { class: 'sub' }, `${COURSES.length} courses, ${total} lessons. Learn it, then do it with the linked tools.`)),
    h('div', { class: 'act' }, h('input', { type: 'search', placeholder: 'Search lessons', oninput: debounce(e => { q = e.target.value.toLowerCase(); draw(); }, 150) }))),
    h('div', { class: 'card', style: { marginBottom: '14px' } }, h('div', { class: 'row' }, h('b', null, 'Your progress'), h('span', { class: 'grow' }), h('span', { class: 'muted' }, done + ' of ' + total + ' lessons complete')), h('div', { class: 'prog', style: { marginTop: '8px', height: '8px' } }, h('i', { style: { width: (done / total * 100) + '%' } })),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Learning path:'), ['', ...LEVELS].map(lv => h('button', { class: 'btn sm' + (level === lv ? ' on' : ''), onclick: e => { level = lv; e.target.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('on')); e.target.classList.add('on'); draw(); } }, lv || 'All levels')),
        (() => { const next = ALL.find(l => !P.done[l.id]); return next ? h('button', { class: 'btn pri sm', style: { marginLeft: 'auto' }, onclick: () => nav.go('academy', next.id) }, icon('play'), 'Continue: ' + next.title) : badge('All lessons complete', 'ok'); })())), list);
  function draw() {
    clear(list);
    for (const c of COURSES) {
      const ls = c.lessons.filter(l => (!level || l.level === level) && (!q || (l.title + ' ' + l.summary + ' ' + l.body + ' ' + (l.steps || []).join(' ')).toLowerCase().includes(q))); if (!ls.length) continue;
      const cd = c.lessons.filter(l => P.done[l.id]).length;
      list.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, c.title), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, cd + ' / ' + c.lessons.length)), h('p', { class: 'muted small' }, c.desc), h('div', { class: 'prog', style: { marginBottom: '10px' } }, h('i', { style: { width: (cd / c.lessons.length * 100) + '%' } })),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '6px' } }, ls.map(l => h('a', { href: '#/academy/' + l.id, class: 'row', style: { padding: '8px 10px', borderRadius: '6px', background: 'var(--panel2)', textDecoration: 'none', color: 'var(--text)' } }, h('span', { class: 'dot', style: { background: P.done[l.id] ? 'var(--ok)' : 'var(--line2)' } }), h('span', { class: 'grow' }, l.title), h('span', { class: 'small dim' }, l.level))))));
    }
    if (!list.children.length) list.append(h('div', { class: 'empty' }, 'No lessons match.'));
  }
  draw();
}

function lessonView(page, l, P) {
  nav.crumbs('Studio', 'Academy', l.course.title, l.title); S.touchRecent('lesson', l.id);
  const idx = ALL.findIndex(x => x.id === l.id), prev = ALL[idx - 1], next = ALL[idx + 1];
  const save = () => S.save(P, { silent: true });
  const doneBtn = h('button', { class: 'btn' + (P.done[l.id] ? ' on' : '') }); const setDone = v => { P.done[l.id] = v ? Date.now() : undefined; if (!v) delete P.done[l.id]; doneBtn.className = 'btn' + (v ? ' on' : ''); doneBtn.replaceChildren(icon('check'), v ? 'Completed' : 'Mark complete'); save(); };
  setDone(!!P.done[l.id]); doneBtn.onclick = () => setDone(!P.done[l.id]);
  const notes = h('textarea', { rows: 4, placeholder: 'Your notes for this lesson (saved automatically)' }); notes.value = P.notes[l.id] || ''; notes.oninput = debounce(() => { P.notes[l.id] = notes.value; save(); }, 400);
  const visual = h('div'); if (l.visual) drawVisual(l.visual, visual);
  const quiz = h('div'); drawQuiz();
  function drawQuiz() {
    clear(quiz);
    (l.quiz || []).forEach((qq, qi) => {
      const ans = P.quiz[l.id + ':' + qi];
      quiz.append(h('div', { class: 'card tight', style: { marginBottom: '8px' } }, h('b', null, qq.q), h('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } }, qq.options.map((o, oi) => h('button', { class: 'btn', style: { justifyContent: 'flex-start', borderColor: ans != null ? (oi === qq.a ? 'var(--ok)' : oi === ans ? 'var(--bad)' : null) : null }, onclick: () => { P.quiz[l.id + ':' + qi] = oi; save(); if (oi === qq.a && (l.quiz.length === 1 || l.quiz.every((_, k) => P.quiz[l.id + ':' + k] === l.quiz[k].a))) { setDone(true); toast('Correct. Lesson marked complete.', 'ok'); } drawQuiz(); } }, o))),
        ans != null ? h('div', { class: 'small', style: { marginTop: '6px', color: ans === qq.a ? 'var(--ok)' : 'var(--bad)' } }, (ans === qq.a ? 'Correct. ' : 'Not quite. ') + qq.why) : null));
    });
  }
  const tool = l.tool ? h('button', { class: 'btn pri', onclick: () => nav.go(l.tool[0], l.tool[0] === 'help' ? '' : '') }, icon('right'), l.tool[1]) : null;
  const ex = l.exercise ? h('div', { class: 'callout' }, h('b', null, 'Practical exercise: ' + l.exercise.title), h('p', { class: 'small', style: { margin: '4px 0 8px' } }, l.exercise.desc + ' A new project is created so your work is saved.'), h('button', { class: 'btn sm pri', onclick: async () => { const p = await quickProject('Academy: ' + l.exercise.title); if (!p) return; nav.handoff.genParams = { ...defaultParams(l.exercise.gen.category), ...l.exercise.gen }; nav.handoff.genProject = p.id; S.log('activity', 'Started exercise "' + l.exercise.title + '"', 'info', { ref: p.id }); nav.go('generate'); } }, icon('play'), 'Start exercise')) : null;
  page.append(h('div', { class: 'lesson' },
    h('div', { class: 'row', style: { marginBottom: '6px' } }, h('a', { href: '#/academy' }, 'Academy'), icon('right'), h('span', { class: 'muted' }, l.course.title), h('span', { class: 'grow' }), badge(l.level, l.level === 'Beginner' ? 'ok' : l.level === 'Intermediate' ? 'info' : 'warn')),
    h('h1', null, l.title), h('p', { style: { fontSize: '15px' } }, l.summary), visual,
    h('h2', null, 'Explanation'), h('p', null, l.body),
    l.steps?.length ? [h('h2', null, 'Step by step'), h('ol', null, l.steps.map(s => h('li', null, s)))] : null,
    l.example ? [h('h2', null, 'Practical example'), h('div', { class: 'callout' }, l.example)] : null,
    l.tips?.length ? [h('h2', null, 'Tips'), h('ul', null, l.tips.map((t, i) => h('li', null, h('span', { class: 'badge ' + (i === 0 ? 'ok' : 'info') }, i === 0 ? 'Beginner' : 'Advanced'), ' ', t.replace(/^Advanced:\s*/, ''))))] : null,
    l.mistakes?.length ? [h('h2', null, 'Common mistakes'), h('div', { class: 'callout warn' }, h('ul', { style: { margin: 0 } }, l.mistakes.map(m => h('li', null, m))))] : null,
    ex, h('div', { class: 'row', style: { margin: '14px 0' } }, tool),
    l.quiz?.length ? [h('h2', null, 'Knowledge check'), quiz] : null,
    h('h2', null, 'Notes'), notes,
    h('div', { class: 'row', style: { marginTop: '18px' } }, prev ? h('button', { class: 'btn', onclick: () => nav.go('academy', prev.id) }, 'Previous: ' + prev.title) : null, h('span', { class: 'grow' }), doneBtn, next ? h('button', { class: 'btn pri', onclick: () => { if (!P.done[l.id]) setDone(true); nav.go('academy', next.id); } }, 'Next: ' + next.title) : null)));
}

async function drawVisual(kind, el) {
  const box = h('div', { class: 'card tight', style: { margin: '10px 0', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' } }); el.append(box);
  const cap = (c, t) => h('div', null, c, h('div', { class: 'small muted', style: { textAlign: 'center', marginTop: '4px' } }, t));
  const tile2 = (src, s = 220) => { const c = newCanvas(s, s); const x = c.getContext('2d'); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.drawImage(src, i * s / 2, j * s / 2, s / 2, s / 2); return c; };
  try {
    if (kind === 'tiling') {
      const a = await runGen({ ...defaultParams('Stone'), width: 128, height: 128, seed: 4 }), b = await runGen({ ...defaultParams('Stone'), width: 128, height: 128, seed: 4, seamless: false });
      box.append(cap(tile2(fromData(new ImageData(b.rgba, 128, 128))), 'Not seamless: edges show'), cap(tile2(fromData(new ImageData(a.rgba, 128, 128))), 'Seamless: no visible edges'));
    } else if (kind === 'pbr') {
      const r = await runGen({ ...defaultParams('Brick'), width: 128, height: 128 }); const base = fromData(new ImageData(r.rgba, 128, 128)); const S0 = defaultPbr(); S0.roughMin = 0; S0.roughMax = 1; S0.metallicMode = 'procedural'; S0.heightBlur = 0;
      const maps = buildMaps(base, S0, { height: r.height, rough: r.rough, metal: r.metal }); for (const k of ['baseColor', 'normal', 'roughness', 'ao', 'height']) { const c = toCanvas(maps[k]); c.style.cssText = 'width:120px;height:120px;border-radius:6px'; box.append(cap(c, k)); }
    } else if (kind === 'resolution') {
      for (const n of [8, 16, 32, 128]) { const r = await runGen({ ...defaultParams('Wood'), width: n, height: n, seed: 2 }); const c = newCanvas(140, 140); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(fromData(new ImageData(r.rgba, n, n)), 0, 0, 140, 140); box.append(cap(c, n + ' x ' + n)); }
    } else if (kind === 'normal') {
      const s = 160, c = newCanvas(s, s), x = c.getContext('2d'), id = x.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let X = 0; X < s; X++) { const nx = (X / s) * 2 - 1, ny = -((y / s) * 2 - 1), d = nx * nx + ny * ny, i = (y * s + X) * 4; if (d > 1) { id.data[i + 3] = 0; continue; } const nz = Math.sqrt(1 - d); id.data[i] = (nx * .5 + .5) * 255; id.data[i + 1] = (ny * .5 + .5) * 255; id.data[i + 2] = (nz * .5 + .5) * 255; id.data[i + 3] = 255; }
      x.putImageData(id, 0, 0); box.append(cap(c, 'Normal colors on a dome (OpenGL)'), h('div', { class: 'small muted', style: { maxWidth: '300px' } }, 'Red is left-right slope, green is up-down slope, blue is facing you. Flat areas are (128, 128, 255), the typical light purple.'));
    } else if (kind === 'uv') {
      const r = await runGen({ ...defaultParams('Abstract patterns'), recipe: 'pattern', pattern: 'checker', colors: ['#20242c', '#7c9cff', '#e7e9ee'], width: 128, height: 128, scale: 4 }); const chk = fromData(new ImageData(r.rgba, 128, 128));
      const c = newCanvas(300, 160), x = c.getContext('2d'); x.fillStyle = '#0d0e11'; x.fillRect(0, 0, 300, 160);
      [[20, 50], [70, 50], [120, 50], [170, 50], [70, 0], [70, 100]].forEach(([X, Y]) => x.drawImage(chk, X, Y + 5, 50, 50));
      x.strokeStyle = '#fff6'; x.strokeRect(20, 5, 200, 150); x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.fillText('UV 0..1', 230, 20);
      box.append(cap(c, 'A cube unfolded into UV space'), h('div', { class: 'small muted', style: { maxWidth: '300px' } }, 'Each face of the cube becomes a square in the flat UV layout. The texture is painted in this layout and folded back onto the model.'));
    }
  } catch (e) { box.append(h('span', { class: 'muted small' }, 'Visual could not render: ' + e.message)); }
}
