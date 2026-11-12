import { h, icon, clear, toast, debounce, badge } from '../core/ui.js';
import * as S from '../core/store.js';
import { nav } from '../core/nav.js';
import { COURSES, LEVELS } from '../content/academy-content.js';
import { runGen, quickProject } from '../core/widgets.js';
import { defaultParams } from '../core/procedural.js';
import { buildMaps, defaultPbr, toCanvas } from '../core/pbr.js';
import { newCanvas, fromData } from '../core/img.js';
import { GAMES, playSteps, gameFor } from './academy-games.js';

const ALL = COURSES.flatMap(c => c.lessons.map(l => ({ ...l, course: c })));
async function progress() {
  let p = S.get('academy'); if (!p) p = { id: 'academy', type: 'academy' };
  for (const k of ['done', 'notes', 'quiz', 'stars', 'games', 'arcade', 'badges']) p[k] ||= {};
  p.xp ||= 0; p.days ||= []; return p;
}

// ---------- XP, levels, streaks, badges ----------
const TITLES = ['Pixel Rookie', 'Texture Apprentice', 'Material Maker', 'Map Wrangler', 'Shader Sorcerer', 'PBR Pro', 'Texture Master', 'Studio Legend'];
const PER_LEVEL = 300;
export const levelOf = xp => { const n = Math.floor(xp / PER_LEVEL) + 1; return { n, title: TITLES[Math.min(n - 1, TITLES.length - 1)], into: xp % PER_LEVEL, need: PER_LEVEL }; };
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = () => dayKey(new Date());
function streak(P) {
  const set = new Set(P.days); let n = 0; const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const ARCADE_ROUNDS = { seams: 5, resolution: 5, maps: 6, normal: 6, pack: 5, colorspace: 6, format: 5 };
const BADGES = [
  ['first', 'First Steps', 'Finish your first lesson', P => Object.keys(P.done).length >= 1],
  ['ten', 'On a Roll', 'Finish 10 lessons', P => Object.keys(P.done).length >= 10],
  ['half', 'Halfway There', 'Finish half of all lessons', P => Object.keys(P.done).length >= ALL.length / 2],
  ['all', 'Graduate', 'Finish every lesson', P => Object.keys(P.done).length >= ALL.length],
  ['perfect', 'Sharp Mind', 'Get 3 stars on 5 quizzes', P => Object.values(P.stars).filter(v => v >= 3).length >= 5],
  ['streak3', 'Warming Up', 'Learn 3 days in a row', P => streak(P) >= 3],
  ['streak7', 'Unstoppable', 'Learn 7 days in a row', P => streak(P) >= 7],
  ['arcade', 'Arcade Regular', 'Play every Arcade game', P => Object.keys(GAMES).every(k => P.arcade[k] != null)],
  ['flawless', 'Flawless', 'Get a perfect score in any Arcade game', P => Object.entries(P.arcade).some(([k, v]) => v >= ARCADE_ROUNDS[k])],
  ...COURSES.map((c, i) => ['course' + i, c.title, 'Finish every lesson in this course', P => c.lessons.every(l => P.done[l.id])]),
];
const BADGE_ICON = { first: 'play', ten: 'flame', half: 'chart', all: 'trophy', perfect: 'star', streak3: 'flame', streak7: 'flame', arcade: 'cube', flawless: 'star' };

async function reward(P, xp, why) {
  const before = levelOf(P.xp).n; P.xp += xp; if (!P.days.includes(today())) P.days.push(today()); P.days = P.days.slice(-60);
  if (xp > 0) toast('+' + xp + ' XP, ' + why, 'ok');
  const lv = levelOf(P.xp); let delay = 0;
  if (lv.n > before) { celebrate('Level ' + lv.n + '!', 'You are now a ' + lv.title + '.'); delay = 4600; }
  for (const [id, name, desc, test] of BADGES) if (!P.badges[id] && test(P)) { P.badges[id] = Date.now(); setTimeout(() => celebrate('Badge unlocked', name + '. ' + desc + '.'), delay); delay += 4600; }
  await S.save(P, { silent: true });
}
function celebrate(title, text) {
  const bits = Array.from({ length: 28 }, (_, i) => h('i', { style: { left: (Math.random() * 100) + '%', background: ['#7c9cff', '#47c28a', '#e7ad47', '#ef6262', '#c78bff'][i % 5], animationDelay: (Math.random() * .4) + 's' } }));
  const el = h('div', { class: 'celebrate', onclick: () => el.remove() }, h('div', { class: 'confetti' }, bits), h('div', { class: 'cele-card' }, icon('trophy'), h('h2', null, title), h('p', null, text), h('button', { class: 'btn pri' }, 'Nice')));
  document.body.append(el); setTimeout(() => el.remove(), 4500);
}
function playerCard(P) {
  const lv = levelOf(P.xp), st = streak(P), nb = Object.keys(P.badges).length;
  return h('div', { class: 'card player' },
    h('div', { class: 'pl-lv' }, h('div', { class: 'pl-n' }, lv.n), h('div', { class: 'small muted' }, 'Level')),
    h('div', { class: 'grow' }, h('div', { class: 'row' }, h('b', null, lv.title), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, lv.into + ' / ' + lv.need + ' XP')),
      h('div', { class: 'prog xp', style: { margin: '6px 0' } }, h('i', { style: { width: (lv.into / lv.need * 100) + '%' } })),
      h('div', { class: 'row wrap small' }, h('span', { class: 'pl-chip' }, icon('star'), P.xp + ' XP total'), h('span', { class: 'pl-chip' + (st ? ' hot' : '') }, icon('flame'), st + ' day streak'), h('span', { class: 'pl-chip' }, icon('trophy'), nb + ' of ' + BADGES.length + ' badges'))));
}
const starRow = (n, max = 3) => h('span', { class: 'stars' }, Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'on' : '' }, icon('star'))));

export default async function (el, arg) {
  const P = await progress(); const page = h('div', { class: 'page' }); el.append(page);
  if (arg === 'arcade') return arcadeView(page, P);
  if (arg === 'badges') return badgesView(page, P);
  const lesson = ALL.find(l => l.id === arg);
  if (lesson) return lessonView(page, lesson, P);
  let level = '', q = '';
  const list = h('div');
  const total = ALL.length, done = ALL.filter(l => P.done[l.id]).length;
  const next = ALL.find(l => !P.done[l.id]);
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Texture Creator Academy'), h('div', { class: 'sub' }, `${COURSES.length} courses, ${total} lessons. Learn it, play it, then prove it in a quick quiz.`)),
    h('div', { class: 'act' }, h('input', { type: 'search', placeholder: 'Search lessons', oninput: debounce(e => { q = e.target.value.toLowerCase(); draw(); }, 150) }))),
    h('div', { class: 'acad-top' }, playerCard(P),
      h('div', { class: 'card acad-actions' }, next ? h('button', { class: 'btn pri', onclick: () => nav.go('academy', next.id) }, icon('play'), 'Continue: ' + next.title) : badge('All lessons complete', 'ok'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => nav.go('academy', 'arcade') }, icon('cube'), 'Arcade'), h('button', { class: 'btn', onclick: () => nav.go('academy', 'badges') }, icon('trophy'), 'Badges')),
        h('div', { class: 'small muted' }, done + ' of ' + total + ' lessons complete'))),
    h('div', { class: 'row wrap', style: { margin: '12px 0' } }, h('span', { class: 'small muted' }, 'Learning path:'), ['', ...LEVELS].map(lv => h('button', { class: 'btn sm' + (level === lv ? ' on' : ''), onclick: e => { level = lv; e.target.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('on')); e.target.classList.add('on'); draw(); } }, lv || 'All levels'))), list);
  function draw() {
    clear(list);
    for (const c of COURSES) {
      const ls = c.lessons.filter(l => (!level || l.level === level) && (!q || (l.title + ' ' + l.summary + ' ' + l.body + ' ' + (l.steps || []).join(' ')).toLowerCase().includes(q))); if (!ls.length) continue;
      const cd = c.lessons.filter(l => P.done[l.id]).length;
      list.append(h('div', { class: 'card', style: { marginBottom: '12px' } }, h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, c.title), h('span', { class: 'grow' }), cd === c.lessons.length ? badge('Course badge earned', 'ok') : null, h('span', { class: 'small muted' }, cd + ' / ' + c.lessons.length)), h('p', { class: 'muted small' }, c.desc), h('div', { class: 'prog', style: { marginBottom: '10px' } }, h('i', { style: { width: (cd / c.lessons.length * 100) + '%' } })),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '6px' } }, ls.map(l => h('a', { href: '#/academy/' + l.id, class: 'row lesson-link' }, h('span', { class: 'dot', style: { background: P.done[l.id] ? 'var(--ok)' : 'var(--line2)' } }), h('span', { class: 'grow' }, l.title), P.done[l.id] ? starRow(P.stars[l.id] || 0) : h('span', { class: 'small dim' }, l.level))))));
    }
    if (!list.children.length) list.append(h('div', { class: 'empty' }, 'No lessons match.'));
  }
  draw();
}

function arcadeView(page, P) {
  nav.crumbs('Studio', 'Academy', 'Arcade');
  const stage = h('div'), card = h('div');
  const head = () => { clear(card); card.append(playerCard(P)); };
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Academy Arcade'), h('div', { class: 'sub' }, 'Quick games that drill the skills from the lessons. Beat your best score to earn XP.')), h('div', { class: 'act' }, h('a', { href: '#/academy', class: 'btn' }, 'Back to Academy'))), card, stage);
  const menu = () => {
    head(); clear(stage);
    stage.append(h('div', { class: 'arcade-grid' }, Object.entries(GAMES).map(([k, g]) => h('div', { class: 'card arcade-card' }, h('div', { class: 'row' }, icon(g.icon), h('b', null, g.name), h('span', { class: 'grow' }), P.arcade[k] != null ? h('span', { class: 'small muted' }, 'Best ' + P.arcade[k] + ' / ' + ARCADE_ROUNDS[k]) : badge('New', 'acc')),
      h('p', { class: 'small muted' }, g.desc), h('button', { class: 'btn pri sm', onclick: () => play(k) }, icon('play'), 'Play')))));
  };
  async function play(k) {
    clear(stage); const box = h('div', { class: 'card game' }); stage.append(box);
    const r = await GAMES[k].play(box); const best = P.arcade[k] ?? -1; const gain = Math.max(0, r.score - Math.max(best, 0)) * 10 + (best < 0 ? 15 : 0);
    if (r.score > best) P.arcade[k] = r.score;
    await reward(P, gain, GAMES[k].name); head();
    endScreen(box, r, r.score > best && best >= 0 ? 'New best score!' : null, [['Play again', () => play(k)], ['All games', menu]]);
  }
  menu();
}
function endScreen(box, r, note, actions) {
  clear(box); const pct = r.max ? r.score / r.max : 0;
  box.append(h('div', { class: 'g-end' }, h('div', { class: 'g-big' }, r.score + ' / ' + r.max), starRow(pct >= .99 ? 3 : pct >= .6 ? 2 : pct > 0 ? 1 : 0),
    h('p', null, pct >= .99 ? 'Perfect run!' : pct >= .6 ? 'Great job.' : 'Good practice. Try again to beat it.'), note ? badge(note, 'ok') : null,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } }, actions.map(([t, f], i) => h('button', { class: 'btn' + (i === 0 ? ' pri' : ''), onclick: f }, t)))));
}
function badgesView(page, P) {
  nav.crumbs('Studio', 'Academy', 'Badges');
  page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Badges'), h('div', { class: 'sub' }, Object.keys(P.badges).length + ' of ' + BADGES.length + ' unlocked')), h('div', { class: 'act' }, h('a', { href: '#/academy', class: 'btn' }, 'Back to Academy'))), playerCard(P),
    h('div', { class: 'badge-grid' }, BADGES.map(([id, name, desc]) => h('div', { class: 'card badge-card' + (P.badges[id] ? ' got' : '') }, h('div', { class: 'bc-ic' }, icon(BADGE_ICON[id] || 'academy')), h('b', null, name), h('div', { class: 'small muted' }, desc), P.badges[id] ? h('div', { class: 'small', style: { color: 'var(--ok)' } }, 'Unlocked') : h('div', { class: 'small dim' }, 'Locked')))));
}

// Quiz: the lesson's own question plus "good practice or common mistake?" cards from its tips and mistakes.
function quizFor(l) {
  const qs = (l.quiz || []).map(x => ({ ...x }));
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1); const tips = (l.tips || []).map(t => cap(t.replace(/^Advanced:\s*/, ''))), mis = l.mistakes || [];
  const opts = ['Good practice', 'Common mistake'], any = a => a[Math.floor(Math.random() * a.length)];
  if (tips.length) qs.push({ q: h('span', null, 'Good practice or common mistake?', h('div', { class: 'quote' }, any(tips))), options: opts, a: 0, why: 'This is one of the lesson tips.' });
  if (mis.length) qs.push({ q: h('span', null, 'Good practice or common mistake?', h('div', { class: 'quote' }, any(mis))), options: opts, a: 1, why: 'The lesson lists this as a mistake to avoid.' });
  return qs.slice(0, 3);
}

function lessonView(page, l, P) {
  nav.crumbs('Studio', 'Academy', l.course.title, l.title); S.touchRecent('lesson', l.id);
  const idx = ALL.findIndex(x => x.id === l.id), prev = ALL[idx - 1], next = ALL[idx + 1];
  const save = () => S.save(P, { silent: true });
  const notes = h('textarea', { rows: 4, placeholder: 'Your notes for this lesson (saved automatically)' }); notes.value = P.notes[l.id] || ''; notes.oninput = debounce(() => { P.notes[l.id] = notes.value; save(); }, 400);
  const visual = h('div'); if (l.visual) drawVisual(l.visual, visual);
  const status = h('span');
  const drawStatus = () => { clear(status); status.append(P.done[l.id] ? h('span', { class: 'row' }, badge('Completed', 'ok'), starRow(P.stars[l.id] || 0)) : badge('Not completed yet', '')); };
  drawStatus();

  // Mini game: a topic game when the lesson has one, otherwise Step Sorter with the lesson's own steps.
  const gk = gameFor(l.id), gameBox = h('div', { class: 'card game' });
  const gameIntro = () => {
    clear(gameBox); const g = gk ? GAMES[gk] : null; const best = P.games[l.id];
    gameBox.append(h('div', { class: 'row' }, icon(g ? g.icon : 'list'), h('b', null, g ? g.name : 'Step Sorter'), h('span', { class: 'grow' }), best ? h('span', { class: 'small muted' }, 'Best ' + best.score + ' / ' + best.max) : null),
      h('p', { class: 'small muted' }, g ? g.desc : 'Put this lesson\'s steps in the right order.'), h('button', { class: 'btn pri sm', onclick: playGame }, icon('play'), best ? 'Play again' : 'Play'));
  };
  async function playGame() {
    const r = gk ? await GAMES[gk].play(gameBox) : await playSteps(gameBox, l.steps || []);
    const old = P.games[l.id]; const oldPct = old ? old.score / old.max : 0, pct = r.max ? r.score / r.max : 0;
    if (!old || pct > oldPct) P.games[l.id] = r;
    await reward(P, Math.round(Math.max(0, pct - oldPct) * 30), 'mini game');
    endScreen(gameBox, r, null, [['Take the quiz', () => { quizCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (!quizRunning) runQuiz(); }], ['Play again', playGame]]);
  }
  if (gk || l.steps?.length) gameIntro();

  // Quiz, one question at a time.
  const quizCard = h('div', { class: 'card game' }); let quizRunning = false;
  function quizIntro() { clear(quizCard); quizCard.append(h('div', { class: 'row' }, icon('check'), h('b', null, 'Quick quiz'), h('span', { class: 'grow' }), P.stars[l.id] != null ? starRow(P.stars[l.id]) : null), h('p', { class: 'small muted' }, 'A few quick questions. Get 2 right to complete the lesson.'), h('button', { class: 'btn pri sm', onclick: runQuiz }, icon('play'), P.done[l.id] ? 'Retake quiz' : 'Start quiz')); }
  async function runQuiz() {
    quizRunning = true; const qs = quizFor(l); let right = 0;
    for (let i = 0; i < qs.length; i++) {
      const qq = qs[i]; clear(quizCard);
      const ok = await new Promise(res => {
        const fb = h('div', { class: 'g-fb' });
        const btns = qq.options.map((o, oi) => h('button', { class: 'g-opt', onclick: () => { btns.forEach(b => b.disabled = true); btns[qq.a].classList.add('ok'); if (oi !== qq.a) btns[oi].classList.add('bad'); fb.className = 'g-fb ' + (oi === qq.a ? 'ok' : 'bad'); fb.textContent = (oi === qq.a ? 'Correct! ' : 'Not quite. ') + qq.why; setTimeout(() => res(oi === qq.a), oi === qq.a ? 1100 : 2600); } }, o));
        quizCard.append(h('div', { class: 'g-head' }, h('b', null, 'Quick quiz'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, 'Question ' + (i + 1) + ' of ' + qs.length)), h('div', { class: 'prog', style: { margin: '6px 0 12px' } }, h('i', { style: { width: (i / qs.length * 100) + '%' } })), h('div', { class: 'g-q' }, qq.q), h('div', { class: 'g-opts', style: { gridTemplateColumns: qq.options.length === 2 ? '1fr 1fr' : '1fr' } }, btns), fb);
      });
      if (ok) right++;
    }
    const n = qs.length, stars = right >= n ? 3 : right >= 2 ? 2 : right >= 1 ? 1 : 0, passed = right >= Math.min(2, n);
    const firstPass = passed && !P.done[l.id]; const oldStars = P.stars[l.id] || 0;
    if (stars > oldStars) P.stars[l.id] = stars;
    if (firstPass) P.done[l.id] = Date.now();
    await reward(P, (firstPass ? 50 : 0) + Math.max(0, stars - oldStars) * 10, firstPass ? 'lesson complete' : 'quiz');
    drawStatus(); quizRunning = false;
    endScreen(quizCard, { score: right, max: n }, passed ? (firstPass ? 'Lesson complete' : null) : 'Get 2 right to complete it', [...(next ? [['Next lesson', () => nav.go('academy', next.id)]] : []), ['Retake quiz', runQuiz]]);
  }
  quizIntro();

  const tool = l.tool ? h('button', { class: 'btn', onclick: () => nav.go(l.tool[0]) }, icon('right'), l.tool[1]) : null;
  const ex = l.exercise ? h('div', { class: 'callout' }, h('b', null, 'Practical exercise: ' + l.exercise.title), h('p', { class: 'small', style: { margin: '4px 0 8px' } }, l.exercise.desc + ' A new project is created so your work is saved.'), h('button', { class: 'btn sm pri', onclick: async () => { const p = await quickProject('Academy: ' + l.exercise.title); if (!p) return; nav.handoff.genParams = { ...defaultParams(l.exercise.gen.category), ...l.exercise.gen }; nav.handoff.genProject = p.id; S.log('activity', 'Started exercise "' + l.exercise.title + '"', 'info', { ref: p.id }); nav.go('generate'); } }, icon('play'), 'Start exercise')) : null;
  page.append(h('div', { class: 'lesson' },
    h('div', { class: 'row', style: { marginBottom: '6px' } }, h('a', { href: '#/academy' }, 'Academy'), icon('right'), h('span', { class: 'muted' }, l.course.title), h('span', { class: 'grow' }), status, badge(l.level, l.level === 'Beginner' ? 'ok' : l.level === 'Intermediate' ? 'info' : 'warn')),
    h('div', { class: 'lesson-path' }, h('span', null, '1. Learn'), icon('right'), h('span', null, '2. Play'), icon('right'), h('span', null, '3. Quiz')),
    h('h1', null, l.title), h('p', { style: { fontSize: '15px' } }, l.summary), visual,
    h('h2', null, 'Explanation'), h('p', null, l.body),
    l.steps?.length ? [h('h2', null, 'Step by step'), h('ol', null, l.steps.map(s => h('li', null, s)))] : null,
    l.example ? [h('h2', null, 'Practical example'), h('div', { class: 'callout' }, l.example)] : null,
    l.tips?.length ? [h('h2', null, 'Tips'), h('ul', null, l.tips.map((t, i) => h('li', null, h('span', { class: 'badge ' + (i === 0 ? 'ok' : 'info') }, i === 0 ? 'Beginner' : 'Advanced'), ' ', (t => t.charAt(0).toUpperCase() + t.slice(1))(t.replace(/^Advanced:\s*/, '')))))] : null,
    l.mistakes?.length ? [h('h2', null, 'Common mistakes'), h('div', { class: 'callout warn' }, h('ul', { style: { margin: 0 } }, l.mistakes.map(m => h('li', null, m))))] : null,
    ex, tool ? h('div', { class: 'row', style: { margin: '14px 0' } }, tool) : null,
    gk || l.steps?.length ? [h('h2', null, 'Mini game'), gameBox] : null,
    h('h2', null, 'Quiz'), quizCard,
    h('h2', null, 'Notes'), notes,
    h('div', { class: 'row', style: { marginTop: '18px' } }, prev ? h('button', { class: 'btn', onclick: () => nav.go('academy', prev.id) }, 'Previous: ' + prev.title) : null, h('span', { class: 'grow' }), next ? h('button', { class: 'btn pri', onclick: () => nav.go('academy', next.id) }, 'Next: ' + next.title) : null)));
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
