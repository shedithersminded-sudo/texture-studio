// Product quality control. Automatic checks where the data allows it, manual sign-off for the rest.
import * as S from './store.js';
import { getData, seamScore, isPow2, alphaInfo } from './img.js';
import { MAP_SPACE } from './pbr.js';

export const QC_CHECKS = [
  ['integrity', 'File integrity', true], ['dimensions', 'Correct dimensions', true], ['resolution', 'Correct resolution', false], ['naming', 'Naming conventions', true],
  ['maps', 'Missing texture maps', true], ['colorspace', 'Color spaces', true], ['alpha', 'Transparency issues', false], ['seamless', 'Seamless tiling', true],
  ['stretch', 'Texture stretching', false], ['repetition', 'Visible repetition (manual)', true], ['artifacts', 'Compression artifacts', false], ['consistency', 'Material consistency', false],
  ['pbrcompat', 'PBR map compatibility', true], ['previews', 'Preview image quality', true], ['package', 'Package organization', true], ['docs', 'Documentation completeness', true],
];
const R = (id, status, msg) => ({ id, status, msg });
export async function runQC(p, onProgress) {
  const mats = (p.materialIds || []).map(S.get).filter(Boolean); const texs = (p.textureIds || []).map(S.get).filter(t => t && !t.deleted);
  const all = [...mats.flatMap(m => Object.entries(m.maps || {}).map(([k, id]) => ({ k, t: S.get(id), m }))), ...texs.map(t => ({ k: t.mapType || 'baseColor', t, m: null }))];
  const out = []; const data = new Map(); let i = 0;
  // integrity: decode every image
  const broken = [];
  for (const x of all) { onProgress?.(i++ / (all.length + 4)); if (!x.t || x.t.deleted) { broken.push((x.m?.name || '') + ' ' + x.k + ' (record missing)'); continue; } try { const c = await S.textureCanvas(x.t); data.set(x, c); } catch (e) { broken.push(x.t.name + ': ' + e.message); } }
  out.push(!all.length ? R('integrity', 'fail', 'The product has no materials or textures linked.') : broken.length ? R('integrity', 'fail', 'Unreadable: ' + broken.join('; ')) : R('integrity', 'pass', all.length + ' image(s) decoded without errors.'));
  const target = +p.targetResolution || 0; const dimsBad = [];
  for (const [x, c] of data) if (target && Math.max(c.width, c.height) < target) dimsBad.push(`${x.t.name} is ${c.width}x${c.height}`);
  out.push(dimsBad.length ? R('dimensions', 'fail', 'Below the target ' + target + ' px: ' + dimsBad.join('; ')) : R('dimensions', 'pass', target ? 'All images reach the target ' + target + ' px.' : 'No target resolution set; dimensions accepted.'));
  const np2 = [...data.keys()].filter(x => !isPow2(x.t.width) || !isPow2(x.t.height)); const small = [...data.keys()].filter(x => Math.max(x.t.width, x.t.height) < 1024);
  out.push(np2.length || small.length ? R('resolution', 'review', [np2.length ? np2.length + ' image(s) are not power-of-two (game engines prefer 512, 1024, 2048...)' : '', small.length ? small.length + ' image(s) are under 1024 px' : ''].filter(Boolean).join('. ')) : R('resolution', 'pass', 'All images are power-of-two and at least 1024 px.'));
  const badName = [p.name, ...mats.map(m => m.name)].filter(n => /[^\w \-]/.test(n || ''));
  out.push(badName.length ? R('naming', 'fail', 'Use letters, numbers, spaces, dash and underscore only: ' + badName.join(', ')) : R('naming', 'pass', 'Names are safe. Exported files use the preset naming template.'));
  const miss = [], rec = [];
  for (const m of mats) { for (const k of ['baseColor', 'normal', 'roughness']) if (!m.maps?.[k]) miss.push(m.name + ': ' + k); for (const k of ['ao', 'height']) if (!m.maps?.[k]) rec.push(m.name + ': ' + k); }
  out.push(miss.length ? R('maps', 'fail', 'Required maps missing: ' + miss.join(', ')) : rec.length ? R('maps', 'review', 'Recommended maps missing: ' + rec.join(', ')) : R('maps', 'pass', mats.length ? 'Every material has base color, normal, roughness, AO and height.' : 'No PBR materials; texture-only product.'));
  const cs = [...data.keys()].filter(x => x.t.colorSpace && MAP_SPACE[x.k] && x.t.colorSpace !== MAP_SPACE[x.k]);
  out.push(cs.length ? R('colorspace', 'fail', 'Wrong color space tag: ' + cs.map(x => x.t.name).join(', ')) : R('colorspace', 'pass', 'Base color and emission are sRGB; data maps are linear.'));
  const alphaWarn = []; for (const [x, c] of data) if (x.k === 'baseColor') { const a = alphaInfo(getData(c)); if (a.hasAlpha && !(x.m?.maps?.opacity)) alphaWarn.push(x.t.name + ' has ' + a.alphaKind + ' alpha but no opacity map'); }
  out.push(alphaWarn.length ? R('alpha', 'review', alphaWarn.join('; ')) : R('alpha', 'pass', 'No unexpected transparency found.'));
  onProgress?.((all.length + 1) / (all.length + 4));
  const seams = []; for (const [x, c] of data) if (x.k === 'baseColor' || x.k === 'normal') { const s = seamScore(getData(c)); if (s.ratio > 2.2) seams.push(`${x.t.name} (seam ${s.ratio.toFixed(1)}x normal)`); }
  out.push(p.notTileable ? R('seamless', 'pass', 'Product marked as not tileable (decals or atlases).') : seams.length ? R('seamless', 'fail', 'Edges do not match: ' + seams.join('; ') + '. Use Seamless edge correction in the editor.') : R('seamless', 'pass', 'Base color and normal maps tile without visible edges.'));
  const stretch = []; for (const m of mats) { const sizes = Object.values(m.maps || {}).map(S.get).filter(Boolean).map(t => (t.width / t.height).toFixed(3)); if (new Set(sizes).size > 1) stretch.push(m.name); }
  out.push(stretch.length ? R('stretch', 'review', 'Maps with different aspect ratios will stretch: ' + stretch.join(', ')) : R('stretch', 'pass', 'All maps of each material share one aspect ratio.'));
  out.push(R('repetition', 'review', 'Look at the material tiled 3x3 in 3D Preview (UV scale 3) and confirm no obvious repeating spots.'));
  const lossy = [...data.keys()].filter(x => ['JPG', 'WEBP'].includes(x.t.format)); out.push(lossy.length ? R('artifacts', 'review', 'Sourced from lossy files, check for blocky artifacts: ' + lossy.map(x => x.t.name).join(', ')) : R('artifacts', 'pass', 'All sources are lossless.'));
  const res = new Set(mats.map(m => m.width)); out.push(res.size > 1 ? R('consistency', 'review', 'Materials use different resolutions: ' + [...res].join(', ')) : R('consistency', 'pass', 'Materials share one resolution.'));
  const pbrBad = []; for (const [x, c] of data) { if (x.k === 'normal') { const d = getData(c).data; let b = 0, n = 0; for (let j = 2; j < d.length; j += 64) { b += d[j]; n++; } if (b / n < 150) pbrBad.push(x.t.name + ' does not look like a tangent-space normal map'); } if (['roughness', 'metallic', 'ao', 'height'].includes(x.k)) { const d = getData(c).data; for (let j = 0; j < d.length; j += 4000) if (Math.abs(d[j] - d[j + 1]) > 4 || Math.abs(d[j] - d[j + 2]) > 4) { pbrBad.push(x.t.name + ' should be grayscale'); break; } } }
  out.push(pbrBad.length ? R('pbrcompat', 'fail', pbrBad.join('; ')) : R('pbrcompat', 'pass', 'Normal maps and grayscale data maps look valid.'));
  const prev = (p.previewIds || []).map(S.get).filter(t => t && !t.deleted); const goodPrev = prev.filter(t => Math.min(t.width, t.height) >= 1024);
  out.push(!prev.length ? R('previews', 'fail', 'No preview images. Make some in Presentation or 3D Preview.') : goodPrev.length < Math.min(3, prev.length) ? R('previews', 'review', 'Some previews are under 1024 px.') : R('previews', 'pass', prev.length + ' preview image(s), sharp enough for listings.'));
  out.push(!all.length ? R('package', 'fail', 'Nothing to package.') : R('package', 'pass', 'Package uses the "' + (p.packageName || 'Standard texture pack') + '" layout with documentation and license folders.'));
  const docIssues = []; if ((p.description || '').length < 80) docIssues.push('description under 80 characters'); if (!p.licenseId) docIssues.push('no license attached'); if (!p.version) docIssues.push('no version number'); if (!(p.apps || []).length) docIssues.push('no supported applications listed');
  out.push(docIssues.length ? R('docs', 'fail', 'Fix: ' + docIssues.join(', ')) : R('docs', 'pass', 'Description, license, version and supported apps are set.'));
  onProgress?.(1);
  return { date: Date.now(), results: out };
}
// pass / fail / review taking manual sign-offs into account
export function verdict(qc, manual = {}) {
  if (!qc) return 'not run';
  let review = false;
  for (const r of qc.results) { const req = QC_CHECKS.find(c => c[0] === r.id)?.[2]; if (r.status === 'fail' && req) return 'fail'; if (r.status === 'review' && !manual[r.id]) review = true; if (r.status === 'fail' && !req && !manual[r.id]) review = true; }
  return review ? 'review' : 'pass';
}
