// Academy mini games. Each game plays a few rounds and resolves to { score, max }.
// Images are generated live with the studio's own procedural engine, so every round is different.
import { h, icon, clear } from '../core/ui.js';
import { runGen } from '../core/widgets.js';
import { defaultParams } from '../core/procedural.js';
import { buildMaps, defaultPbr, toCanvas } from '../core/pbr.js';
import { newCanvas, fromData } from '../core/img.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const seed = () => 1 + Math.floor(Math.random() * 9999);
const gen = async (cat, size, extra = {}) => { const r = await runGen({ ...defaultParams(cat), width: size, height: size, seed: seed(), ...extra }); return { r, c: fromData(new ImageData(r.rgba, size, size)) }; };
const tile2 = (src, s = 200) => { const c = newCanvas(s, s), x = c.getContext('2d'); x.imageSmoothingEnabled = false; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) x.drawImage(src, i * s / 2, j * s / 2, s / 2, s / 2); c.className = 'g-img'; return c; };
const big = (src, s = 180, smooth = true) => { const c = newCanvas(s, s), x = c.getContext('2d'); x.imageSmoothingEnabled = smooth; x.drawImage(src, 0, 0, s, s); c.className = 'g-img'; return c; };
const NICE = { baseColor: 'Base color', normal: 'Normal', roughness: 'Roughness', ao: 'Ambient occlusion', height: 'Height', metallic: 'Metallic' };

// One multiple-choice round. Resolves true or false after the player answers.
function choice(box, { prompt, show, options, answer, why, cols }) {
  return new Promise(res => {
    const fb = h('div', { class: 'g-fb' });
    const btns = options.map((o, i) => h('button', { class: 'g-opt', onclick: () => {
      btns.forEach(b => b.disabled = true); btns[answer].classList.add('ok'); const ok = i === answer; if (!ok) btns[i].classList.add('bad');
      fb.className = 'g-fb ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? 'Nice! ' : 'Not quite. ') + (why || ''); res(ok);
    } }, o));
    box.append(h('div', { class: 'g-q' }, prompt), show ? h('div', { class: 'g-show' }, show) : null, h('div', { class: 'g-opts', style: cols ? { gridTemplateColumns: cols } : null }, btns), fb);
  });
}

async function rounds(el, title, n, round) {
  let score = 0;
  for (let i = 0; i < n; i++) {
    clear(el);
    const box = h('div', { class: 'g-box' });
    el.append(h('div', { class: 'g-head' }, h('b', null, title), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, `Round ${i + 1} of ${n}`), h('span', { class: 'g-score' }, icon('star'), String(score))),
      h('div', { class: 'prog', style: { margin: '6px 0 12px' } }, h('i', { style: { width: (i / n * 100) + '%' } })), box);
    box.append(h('div', { class: 'small muted' }, 'Getting the next round ready...'));
    const ok = await round(box, i); if (ok) score++;
    await wait(ok ? 1300 : 2300);
  }
  return { score, max: n };
}
const ready = box => clear(box);

export const GAMES = {
  seams: {
    name: 'Seam Hunter', icon: 'grid', desc: 'Two textures, each tiled 2 x 2. Spot the one that tiles without visible edges.',
    play: el => rounds(el, 'Seam Hunter', 5, async box => {
      const cat = pick(['Stone', 'Concrete', 'Marble', 'Sand', 'Rust', 'Soil']);
      const s = seed(); const a = await runGen({ ...defaultParams(cat), width: 96, height: 96, seed: s }), b = await runGen({ ...defaultParams(cat), width: 96, height: 96, seed: s, seamless: false });
      const good = fromData(new ImageData(a.rgba, 96, 96)), bad = fromData(new ImageData(b.rgba, 96, 96)); const leftGood = Math.random() < .5; ready(box);
      const cg = tile2(good), cb = tile2(bad);
      const ok = await choice(box, { prompt: 'Which one is seamless?', show: h('div', { class: 'row wrap', style: { gap: '14px', justifyContent: 'center' } }, h('div', { class: 'g-cap' }, leftGood ? cg : cb, 'Left'), h('div', { class: 'g-cap' }, leftGood ? cb : cg, 'Right')),
        options: ['Left', 'Right'], answer: leftGood ? 0 : 1, why: 'The red lines show where the other one breaks. A seamless texture hides those joins.' });
      const x = cb.getContext('2d'); x.strokeStyle = '#ff4d4d'; x.lineWidth = 3; x.setLineDash([8, 6]); x.beginPath(); x.moveTo(cb.width / 2, 0); x.lineTo(cb.width / 2, cb.height); x.moveTo(0, cb.height / 2); x.lineTo(cb.width, cb.height / 2); x.stroke();
      return ok;
    }),
  },
  resolution: {
    name: 'Pixel Detective', icon: 'image', desc: 'Guess the resolution of a texture from how blocky it looks.',
    play: el => rounds(el, 'Pixel Detective', 5, async box => {
      const sizes = [8, 16, 32, 64], n = pick(sizes); const { c } = await gen(pick(['Wood', 'Stone', 'Fabric', 'Leather', 'Marble']), n); ready(box);
      return choice(box, { prompt: 'How many pixels wide is this texture?', show: big(c, 192, false), options: sizes.map(s => s + ' x ' + s), answer: sizes.indexOf(n), cols: 'repeat(4,1fr)', why: `It was ${n} x ${n}. Each visible block is one pixel.` });
    }),
  },
  maps: {
    name: 'Map Match', icon: 'layers', desc: 'Five maps from one material. Find the base color, normal, roughness, AO or height map.',
    play: async el => {
      let maps = null, order = null; const keys = ['baseColor', 'normal', 'roughness', 'ao', 'height'], asks = shuffle(keys).concat(shuffle(keys)).slice(0, 6);
      return rounds(el, 'Map Match', 6, async (box, i) => {
        if (!maps || i === 3) { const { r, c } = await gen(pick(['Brick', 'Stone', 'Wood', 'Leather']), 128); const P = defaultPbr(); P.roughMin = 0; P.roughMax = 1; P.heightBlur = 0; maps = buildMaps(c, P, { height: r.height, rough: r.rough, metal: r.metal }); order = shuffle(keys); }
        const k = asks[i], L = 'ABCDE'; ready(box);
        const hint = { baseColor: 'Base color is the only one with real colors and no lighting.', normal: 'The normal map is the purple-blue one. Its colors store surface direction.', roughness: 'Roughness is grayscale and often fairly even. White is matte, black is glossy.', ao: 'AO is mostly white, with dark lines in the cracks where light cannot reach.', height: 'Height is grayscale with soft slopes. White is high, black is low.' }[k];
        return choice(box, { prompt: h('span', null, 'Which one is the ', h('b', null, NICE[k].toLowerCase()), ' map?'), show: h('div', { class: 'row wrap', style: { gap: '10px', justifyContent: 'center' } }, order.map((m, j) => h('div', { class: 'g-cap' }, big(toCanvas(maps[m]), 110), L[j]))),
          options: order.map((_, j) => L[j]), answer: order.indexOf(k), cols: 'repeat(5,1fr)', why: hint });
      });
    },
  },
  normal: {
    name: 'Normal Compass', icon: 'sphere', desc: 'Read a normal map color and say which way the surface faces.',
    play: el => rounds(el, 'Normal Compass', 6, async (box, i) => {
      const dirs = [['Left', -1, 0], ['Right', 1, 0], ['Up', 0, 1], ['Down', 0, -1], ['Straight at you', 0, 0]]; const d = pick(dirs);
      const t = .75, nx = d[1] * t, ny = d[2] * t, nz = Math.sqrt(1 - nx * nx - ny * ny); const rgb = [nx, ny, nz].map(v => Math.round((v * .5 + .5) * 255));
      const sw = h('div', { class: 'g-swatch', style: { background: `rgb(${rgb})` } }, h('span', null, `R ${rgb[0]}  G ${rgb[1]}  B ${rgb[2]}`)); ready(box);
      return choice(box, { prompt: 'This flat patch of normal map (OpenGL style) faces which way?', show: sw, options: dirs.map(x => x[0]), answer: dirs.indexOf(d), cols: 'repeat(auto-fit,minmax(110px,1fr))',
        why: 'Red above 128 leans right, below leans left. Green above 128 leans up, below leans down. 128, 128, 255 faces you.' });
    }),
  },
  pack: {
    name: 'Channel Packer', icon: 'box', desc: 'Engines pack grayscale maps into the R, G, B and A channels. Know where each one goes.',
    play: el => {
      const facts = [['Unreal ORM', 'Red', 'Ambient occlusion'], ['Unreal ORM', 'Green', 'Roughness'], ['Unreal ORM', 'Blue', 'Metallic'], ['Godot ORM', 'Green', 'Roughness'],
        ['Unity HDRP Mask Map', 'Red', 'Metallic'], ['Unity HDRP Mask Map', 'Green', 'Ambient occlusion'], ['Unity HDRP Mask Map', 'Alpha', 'Smoothness'], ['Unity URP Metallic map', 'Red', 'Metallic'], ['Unity URP Metallic map', 'Alpha', 'Smoothness']];
      const opts = ['Ambient occlusion', 'Roughness', 'Metallic', 'Smoothness'], order = shuffle(facts).slice(0, 5);
      return rounds(el, 'Channel Packer', 5, async (box, i) => {
        const [fmt, ch, ans] = order[i]; const col = { Red: '#ef6262', Green: '#47c28a', Blue: '#5b8cff', Alpha: '#c9ccd3' }[ch];
        return choice(box, { prompt: h('span', null, 'In the ', h('b', null, fmt), ', which map goes in the ', h('b', { style: { color: col } }, ch), ' channel?'), options: opts, answer: opts.indexOf(ans), cols: 'repeat(2,1fr)', why: `${fmt}: ${ch} holds ${ans.toLowerCase()}.` + (ans === 'Smoothness' ? ' Smoothness is roughness flipped.' : '') });
      });
    },
  },
  colorspace: {
    name: 'Color or Data?', icon: 'eye', desc: 'Color maps use sRGB. Data maps must be Linear. Sort them fast.',
    play: el => {
      const items = shuffle([['Base color', 0], ['Emission', 0], ['Normal', 1], ['Roughness', 1], ['Metallic', 1], ['Ambient occlusion', 1], ['Height', 1], ['ORM packed map', 1], ['Opacity mask', 1]]).slice(0, 6);
      return rounds(el, 'Color or Data?', 6, async (box, i) => { const [n, lin] = items[i]; return choice(box, { prompt: h('span', null, 'Import setting for the ', h('b', null, n), ' map?'), options: ['sRGB (color)', 'Linear (data)'], answer: lin, cols: 'repeat(2,1fr)', why: lin ? `${n} stores numbers, not colors, so sRGB must be off.` : `${n} is a color people see, so it stays sRGB.` }); });
    },
  },
  format: {
    name: 'Format Picker', icon: 'file', desc: 'Pick the right file format for the job.',
    play: el => {
      const opts = ['PNG 8-bit', 'PNG 16-bit', 'JPG', 'EXR'];
      const items = shuffle([['Preview images for a store page, where small files matter', 'JPG', 'JPG is small and fine for photos people only look at.'], ['A height map with long smooth slopes that must not show steps', 'PNG 16-bit', '16 bits give 65,536 levels instead of 256, so gradients stay smooth.'],
        ['An HDR sky with light far brighter than white', 'EXR', 'EXR stores floating point values above 1.0.'], ['A color texture with transparency for a game', 'PNG 8-bit', 'PNG is lossless and keeps the alpha channel.'], ['A base color map to import into a game engine', 'PNG 8-bit', 'Lossless 8-bit PNG is the safe default. The engine compresses it on import.'], ['Film displacement that needs exact values, including negatives', 'EXR', 'EXR floats can store negative values and precise heights.']]).slice(0, 5);
      return rounds(el, 'Format Picker', 5, async (box, i) => { const [s, a, why] = items[i]; return choice(box, { prompt: s, options: opts, answer: opts.indexOf(a), cols: 'repeat(2,1fr)', why }); });
    },
  },
};

// Step Sorter works for any lesson: click the steps in the right order.
export function playSteps(el, steps) {
  return new Promise(res => {
    let next = 0, misses = 0; let order = shuffle(steps.map((s, i) => [s, i]));
    for (let t = 0; t < 5 && steps.length > 1 && order.every(([, i], j) => i === j); t++) order = shuffle(order);
    const placed = h('ol', { class: 'g-placed' }), fb = h('div', { class: 'g-fb' });
    const btns = order.map(([s, i]) => { const b = h('button', { class: 'g-opt g-step', onclick: () => {
      if (i === next) { b.disabled = true; b.classList.add('ok'); placed.append(h('li', null, s)); next++; fb.className = 'g-fb ok'; fb.textContent = next === steps.length ? 'All in order!' : 'Yes! What comes next?'; if (next === steps.length) setTimeout(() => res({ score: Math.max(0, steps.length - misses), max: steps.length }), 900); }
      else { misses++; b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 500); fb.className = 'g-fb bad'; fb.textContent = 'Not that one yet. Try another.'; }
    } }, s); return b; });
    clear(el); el.append(h('div', { class: 'g-head' }, h('b', null, 'Step Sorter'), h('span', { class: 'grow' }), h('span', { class: 'small muted' }, 'Click the steps in the order you would do them')), h('div', { class: 'g-opts', style: { gridTemplateColumns: '1fr' } }, btns), fb, placed);
  });
}

export function gameFor(lessonId) { return LESSON_GAME[lessonId] || null; }
const LESSON_GAME = {
  'c1-seamless': 'seams', 'c1-tiling': 'seams', 'c3-environment': 'seams', 'c7-procedural': 'seams', 'c1-procedural': 'seams',
  'c1-pixels': 'resolution', 'c3-texel': 'resolution', 'c3-optimize': 'resolution', 'c3-performance': 'resolution',
  'c2-pbr': 'maps', 'c2-sets': 'maps', 'c2-basecolor': 'maps', 'c2-roughness': 'maps', 'c2-height': 'maps', 'c2-ao': 'maps', 'c2-displacement': 'maps', 'c2-metallic': 'maps', 'c7-photo': 'maps', 'c1-materials': 'maps',
  'c2-normal': 'normal',
  'c4-unreal': 'pack', 'c4-unity': 'pack', 'c4-godot': 'pack', 'c4-engines': 'pack',
  'c4-colorspace': 'colorspace', 'c4-blender': 'colorspace', 'c2-lighting': 'colorspace',
  'c4-format': 'format', 'c4-bitdepth': 'format', 'c4-export': 'format', 'c3-compression': 'format',
};
