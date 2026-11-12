// Three.js material viewer used by 3D Preview and the product presentation generator.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/RoomEnvironment.js';

export const SHAPES = [['sphere', 'Sphere'], ['cube', 'Cube'], ['cylinder', 'Cylinder'], ['plane', 'Plane'], ['flat', 'Flat surface'], ['rounded', 'Rounded box'], ['capsule', 'Capsule'], ['torus', 'Torus knot']];
function roundedBox(w, h, d, r, seg) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = v.clone().clamp(inner.clone().negate(), inner); const n = v.clone().sub(c); if (n.length() > 0) n.setLength(r); p.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z); }
  g.computeVertexNormals(); return g;
}
function geometry(name) {
  switch (name) {
    case 'cube': return new THREE.BoxGeometry(1.5, 1.5, 1.5, 96, 96, 96);
    case 'cylinder': return new THREE.CylinderGeometry(0.8, 0.8, 1.8, 160, 80);
    case 'plane': { const g = new THREE.PlaneGeometry(3, 3, 256, 256); g.rotateX(-Math.PI / 2.6); return g; }
    case 'flat': return new THREE.PlaneGeometry(2.4, 2.4, 256, 256);
    case 'rounded': return roundedBox(1.5, 1.5, 1.5, 0.22, 64);
    case 'capsule': return new THREE.CapsuleGeometry(0.6, 1, 32, 96);
    case 'torus': return new THREE.TorusKnotGeometry(0.65, 0.24, 320, 48);
    default: return new THREE.SphereGeometry(1.05, 192, 128);
  }
}
export function parseOBJ(text) {
  const v = [], vt = [], vn = [], pos = [], uv = [], nor = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push(p.slice(1, 4).map(Number)); else if (p[0] === 'vt') vt.push(p.slice(1, 3).map(Number)); else if (p[0] === 'vn') vn.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'f') {
      const f = p.slice(1).map(s => s.split('/').map(x => x ? parseInt(x) : 0));
      for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) {
        const ix = k[0] < 0 ? v.length + k[0] : k[0] - 1; pos.push(...v[ix]);
        if (k[1]) { const t = vt[k[1] < 0 ? vt.length + k[1] : k[1] - 1]; uv.push(t[0], t[1]); } else uv.push(0, 0);
        if (k[2]) nor.push(...vn[k[2] < 0 ? vn.length + k[2] : k[2] - 1]);
      }
    }
  }
  if (!pos.length) throw new Error('No faces found in this OBJ file.');
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (nor.length === pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
  g.computeBoundingBox(); const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), s = 2.2 / Math.max(...b.getSize(new THREE.Vector3()).toArray()); g.translate(-c.x, -c.y, -c.z); g.scale(s, s, s);
  return { geometry: g, hasUV: vt.length > 0 };
}

export function createViewer(container, { width = 800, height = 600 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (container) container.append(renderer.domElement);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 100); camera.position.set(0, 0.6, 3.6);
  const pmrem = new THREE.PMREMGenerator(renderer); const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(3, 4, 3); scene.add(key); const amb = new THREE.HemisphereLight(0xffffff, 0x223344, 0.25); scene.add(amb);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  let mesh = new THREE.Mesh(geometry('sphere'), mat); scene.add(mesh);
  const tex = {}; const P = { repeat: 1, offsetX: 0, offsetY: 0, rotation: 0, normalY: 'OpenGL', normalScale: 1 };
  const SLOT = { baseColor: 'map', normal: 'normalMap', roughness: 'roughnessMap', metallic: 'metalnessMap', ao: 'aoMap', displacement: 'displacementMap', height: 'displacementMap', opacity: 'alphaMap', emission: 'emissiveMap' };
  function applyUV() { for (const t of Object.values(tex)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(P.repeat, P.repeat); t.offset.set(P.offsetX, P.offsetY); t.center.set(0.5, 0.5); t.rotation = P.rotation * Math.PI / 180; t.needsUpdate = true; } }
  function setMaps(maps) {
    for (const t of Object.values(tex)) t.dispose(); for (const k in tex) delete tex[k];
    for (const s of new Set(Object.values(SLOT))) mat[s] = null;
    for (const [k, c] of Object.entries(maps)) {
      const slot = SLOT[k]; if (!slot || !c || (k === 'height' && maps.displacement)) continue;
      const t = new THREE.CanvasTexture(c); t.colorSpace = k === 'baseColor' || k === 'emission' ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex[k] = t; mat[slot] = t;
    }
    mat.transparent = !!maps.opacity; mat.alphaTest = maps.opacity ? 0.01 : 0; mat.emissive.set(maps.emission ? 0xffffff : 0x000000);
    mat.roughness = maps.roughness ? 1 : mat.roughness; mat.metalness = maps.metallic ? 1 : mat.metalness;
    applyUV(); setNormal(); mat.needsUpdate = true;
  }
  function setNormal() { mat.normalScale.set(P.normalScale, P.normalScale * (P.normalY === 'DirectX' ? -1 : 1)); }
  let raf = 0, alive = true, spin = false;
  const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop); if (spin) mesh.rotation.y += 0.005; controls.update(); renderer.render(scene, camera); };
  loop();
  const api = {
    renderer, scene, camera, controls, material: mat,
    setShape(name, custom) { mesh.geometry.dispose(); mesh.geometry = custom || geometry(name); mesh.rotation.set(0, 0, 0); },
    setMaps,
    set(o) {
      if (o.roughness != null) mat.roughness = o.roughness; if (o.metalness != null) mat.metalness = o.metalness; if (o.color) mat.color.set(o.color);
      if (o.displacement != null) mat.displacementScale = o.displacement, mat.displacementBias = -o.displacement / 2;
      if (o.ao != null) mat.aoMapIntensity = o.ao; if (o.emission != null) mat.emissiveIntensity = o.emission; if (o.env != null) scene.environmentIntensity = o.env;
      if (o.clearcoat != null) mat.clearcoat = o.clearcoat;
      if (o.light != null) key.intensity = o.light; if (o.lightColor) key.color.set(o.lightColor);
      if (o.azimuth != null || o.elevation != null) { const az = (o.azimuth ?? 45) * Math.PI / 180, el = (o.elevation ?? 40) * Math.PI / 180; key.position.set(Math.cos(el) * Math.sin(az) * 5, Math.sin(el) * 5, Math.cos(el) * Math.cos(az) * 5); }
      if (o.bg !== undefined) scene.background = o.bg ? new THREE.Color(o.bg) : null; if (o.envVisible != null) scene.background = o.envVisible ? envTex : scene.background;
      if (o.wire != null) mat.wireframe = o.wire; if (o.spin != null) spin = o.spin;
      for (const k of ['repeat', 'offsetX', 'offsetY', 'rotation']) if (o[k] != null) P[k] = o[k]; applyUV();
      if (o.normalScale != null) P.normalScale = o.normalScale; if (o.normalY) P.normalY = o.normalY; setNormal();
    },
    resetCamera() { camera.position.set(0, 0.6, 3.6); controls.target.set(0, 0, 0); controls.update(); },
    resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    snapshot(w, h, type = 'image/png') { const ow = renderer.domElement.width, oh = renderer.domElement.height; const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); api.resize(w, h); renderer.render(scene, camera); const url = renderer.domElement.toDataURL(type); renderer.setPixelRatio(pr); api.resize(ow / pr, oh / pr); return url; },
    dispose() { alive = false; cancelAnimationFrame(raf); for (const t of Object.values(tex)) t.dispose(); mesh.geometry.dispose(); mat.dispose(); envTex.dispose(); pmrem.dispose(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove(); },
  };
  return api;
}
// Load a material's map canvases (or a single texture as base color).
export async function loadMaterialCanvases(S, id) {
  const rec = S.get(id); if (!rec) return { maps: {}, rec: null };
  if (rec.type === 'texture') return { maps: { [rec.mapType && rec.mapType !== 'baseColor' ? rec.mapType : 'baseColor']: await S.textureCanvas(rec) }, rec };
  const maps = {}; for (const [k, tid] of Object.entries(rec.maps || {})) { const t = S.get(tid); if (t && !t.deleted) try { maps[k] = await S.textureCanvas(t); } catch { } }
  return { maps, rec };
}
