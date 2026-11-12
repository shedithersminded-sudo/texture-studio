import { h, icon, clear, select } from '../core/ui.js';
import * as S from '../core/store.js';
import { pickTextures, compareView } from '../core/widgets.js';
import { resize } from '../core/img.js';

export default function (el, arg) {
  let A = S.get(arg) || null, B = null, mode = 'texture', res = 512;
  const page = h('div', { class: 'page' }); el.append(page); const view = h('div');
  const draw = async () => {
    clear(page);
    page.append(h('div', { class: 'ph' }, h('div', null, h('h1', null, 'Texture Comparison'), h('div', { class: 'sub' }, 'Original vs edited, versions, resolutions, color variations or PBR maps.'))),
      h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('button', { class: 'btn', onclick: async () => { const t = await pickTextures({ title: 'Texture A' }); if (t) { A = t; draw(); } } }, 'A: ' + (A ? A.name + ' v' + (A.version || 1) : 'choose')),
        select(null, [['texture', 'Compare with another texture'], ['resolution', 'Compare with A at lower resolution'], ['source', 'Compare with A\'s original version']], mode, v => { mode = v; draw(); }),
        mode === 'texture' ? h('button', { class: 'btn', onclick: async () => { const t = await pickTextures({ title: 'Texture B' }); if (t) { B = t; draw(); } } }, 'B: ' + (B ? B.name + ' v' + (B.version || 1) : 'choose')) : null,
        mode === 'resolution' ? select(null, [128, 256, 512, 1024, 2048].map(r => [r, r + ' px']), res, v => { res = +v; draw(); }) : null), view);
    clear(view); if (!A) return view.append(h('div', { class: 'empty' }, 'Choose texture A.'));
    const a = await S.blobURL(A.blobId); let b, lb;
    if (mode === 'texture') { if (!B) return view.append(h('div', { class: 'empty' }, 'Choose texture B.')); b = await S.blobURL(B.blobId); lb = B.name + ' v' + (B.version || 1); }
    else if (mode === 'resolution') { const c = await S.textureCanvas(A); b = resize(resize(c, res, Math.round(res * c.height / c.width)), c.width, c.height, 'nearest').toDataURL(); lb = 'A at ' + res + ' px'; }
    else { const root = S.rootOf(A); b = await S.blobURL(root.blobId); lb = root.name + ' v' + (root.version || 1) + ' (' + root.kind + ')'; }
    view.append(compareView(a, b, { labels: [A.name + ' v' + (A.version || 1), lb], height: 560 }));
  };
  draw();
}
