// Avatar system: Ready Player Me style parts assembled onto one skeleton, recolourable skin,
// hair and outfits, procedural Nigerian hairstyles, and an animation state machine.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadGLTF, loadJSON } from './assets.js';

export const SKIN_TONES = ['#f3d6c0', '#e3bc9c', '#c99a73', '#a9764f', '#8a5a3a', '#6b4027', '#4e2c1a', '#36200f'];
export const HAIR_COLORS = ['#141414', '#2b1a10', '#4a2c17', '#7a3b1e', '#b0652a', '#d9a441', '#e8dcc5', '#8f8f8f', '#b3122f', '#2d4fd6', '#7b2fbf', '#e0459b'];
export const OUTFIT_COLORS = ['#111111', '#ffffff', '#c0392b', '#2980b9', '#8e44ad', '#16a085', '#f39c12', '#e84393', '#2c3e50', '#27ae60', '#f1c40f', '#7f8c8d', '#6d3b1e', '#ff6b35', '#00a8cc', '#d4af37'];

export const FACE_SLIDERS = [
  ['Head', [['headWidth', 'Head width'], ['headDepth', 'Head depth'], ['foreheadHeight', 'Forehead']]],
  ['Brows', [['browHeight', 'Brow height'], ['browDepth', 'Brow depth']]],
  ['Eyes', [['eyeSize', 'Eye size'], ['eyeSpacing', 'Eye spacing'], ['eyeHeight', 'Eye height']]],
  ['Nose', [['noseWidth', 'Nose width'], ['noseLength', 'Nose length'], ['noseBridge', 'Nose bridge'], ['noseTip', 'Nose tip']]],
  ['Cheeks', [['cheekbones', 'Cheekbones'], ['cheekFullness', 'Cheek fullness']]],
  ['Mouth', [['mouthWidth', 'Mouth width'], ['lipFullness', 'Lip fullness'], ['mouthHeight', 'Mouth height']]],
  ['Jaw and chin', [['jawWidth', 'Jaw width'], ['chinWidth', 'Chin width'], ['chinLength', 'Chin length'], ['chinForward', 'Chin forward']]],
  ['Ears', [['earSize', 'Ear size']]],
];
export const BODY_SLIDERS = [['height', 'Height'], ['weight', 'Weight'], ['muscle', 'Muscle'], ['shoulders', 'Shoulders'], ['chest', 'Chest'], ['waist', 'Waist'], ['hips', 'Hips'], ['butt', 'Behind'], ['legs', 'Legs']];
export const FACE_GAIN = 2.0, BODY_GAIN = 1.7; // sliders run -1..1; morph targets were baked at modest strength
export function randomFace(strength = 0.6) { const f = {}; for (const [, items] of FACE_SLIDERS) for (const [k] of items) f[k] = +((Math.random() * 2 - 1) * strength).toFixed(2); return f; }

export const HAIR_STYLES = {
  m: [['Short (model)', 'm2_hair'], ['Low cut', 'proc:low'], ['Fade', 'proc:fade'], ['Afro', 'proc:afro'], ['Locs', 'proc:locs'], ['Cap', 'proc:cap'], ['Clean shave', 'none']],
  f: [['Long (model)', 'f1_hair'], ['Braids', 'proc:braids'], ['Afro', 'proc:afro'], ['Bun', 'proc:bun'], ['Low cut', 'proc:low'], ['Hijab', 'proc:hijab'], ['Twists', 'proc:locs']],
};
export const FACES = { m: [['Face A', 'm2_head'], ['Face B', 'm1_head']], f: [['Face A', 'f1_head']] };
export const TOPS = { m: [['Polo shirt', 'm2_top'], ['Suit jacket', 'm1_top']], f: [['Dress', 'f1_top']] };
export const BOTTOMS = { m: [['Chinos', 'm2_bottom'], ['Suit trousers', 'm1_bottom']], f: [['Leggings', 'f1_bottom']] };
export const SHOES = { m: [['Sneakers', 'm2_shoes'], ['Dress shoes', 'm1_shoes']], f: [['Boots', 'f1_shoes']] };

export const MAKEUP_DEFAULT = { f: { brows: 0.8, lashes: 0.9, liner: 0.7, lips: '#b84a5e', gloss: 1, blush: 0.35, contour: 0.4, highlight: 0.8 }, m: { brows: 0.6, lashes: 0.25, liner: 0.15, lips: null, gloss: 0.3, blush: 0, contour: 0.2, highlight: 0.3 } };
export const BODY_PRESETS = {
  f: [['Hourglass', { hips: 0.9, butt: 0.85, waist: -0.75, chest: 0.55, legs: 0.5, height: 0.25, shoulders: -0.2 }], ['Curvy', { hips: 1, butt: 1, waist: -0.4, chest: 0.8, legs: 0.7, weight: 0.3, height: 0.1 }], ['Slim', { hips: 0.2, butt: 0.2, waist: -0.8, chest: 0.1, legs: -0.1, height: 0.4, weight: -0.5 }], ['Athletic', { hips: 0.4, butt: 0.6, waist: -0.6, chest: 0.3, legs: 0.3, muscle: 0.5, height: 0.3 }]],
  m: [['Athletic', { muscle: 0.9, shoulders: 0.8, waist: -0.35, chest: 0.3, height: 0.35, legs: 0.2 }], ['Bulky', { muscle: 1, shoulders: 1, weight: 0.5, chest: 0.6, height: 0.5, legs: 0.5 }], ['Slim', { muscle: 0.1, shoulders: 0.2, waist: -0.6, weight: -0.6, height: 0.4 }], ['Average', {}]],
};
export function defaultConfig(gender = 'f') {
  return gender === 'f'
    ? { gender: 'f', name: 'Aspirant', head: 'f1_head', hair: 'f1_hair', hairColor: '#141414', skin: '#8a5a3a', top: 'f1_top', topColor: '#111111', bottom: 'f1_bottom', bottomColor: '#111111', shoes: 'f1_shoes', shoesColor: null, beard: false, hat: false, glasses: false, chain: null, tattoos: {}, face: { lipFullness: 0.5, eyeSize: 0.35, cheekbones: 0.4, noseWidth: -0.2, chinWidth: -0.2, browHeight: 0.1 }, body: { ...BODY_PRESETS.f[0][1] }, makeup: { ...MAKEUP_DEFAULT.f } }
    : { gender: 'm', name: 'Aspirant', head: 'm2_head', hair: 'proc:locs', hairColor: '#141414', skin: '#6b4027', top: 'm2_top', topColor: '#111111', bottom: 'm2_bottom', bottomColor: '#111111', shoes: 'm2_shoes', shoesColor: '#ffffff', beard: false, hat: false, glasses: false, chain: 'silver', tattoos: { sleeves: true }, face: { jawWidth: 0.5, chinWidth: 0.3, browDepth: 0.4, lipFullness: 0.3 }, body: { ...BODY_PRESETS.m[0][1] }, makeup: { ...MAKEUP_DEFAULT.m } };
}
export const MAKEUP_SLIDERS = [['brows', 'Brows'], ['lashes', 'Lashes'], ['liner', 'Eyeliner'], ['blush', 'Blush'], ['contour', 'Contour'], ['highlight', 'Highlight'], ['gloss', 'Lip gloss']];
export const LIP_COLORS = ['#b84a5e', '#8e2a3c', '#d9777f', '#c7a08a', '#5a2a2a', '#e04a7a', '#9b4b7a', '#3b1f1f'];

let manifest = null, animIndex = null;
export async function initAvatars() {
  if (!manifest) [manifest, animIndex] = await Promise.all([loadJSON('avatars/manifest.json'), loadJSON('anims/index.json')]);
}
export function animSpeed(gender, name) { return animIndex?.[gender]?.[name]?.speed || 1; }

const animCache = new Map();
async function loadAnims(gender) {
  if (!animCache.has(gender)) {
    animCache.set(gender, (async () => {
      const entries = Object.entries(animIndex[gender]);
      const gltfs = await Promise.all(entries.map(([, v]) => loadGLTF(v.file)));
      const clips = {};
      entries.forEach(([name], i) => { const c = gltfs[i].animations[0]; c.name = name; clips[name] = c; });
      return clips;
    })());
  }
  return animCache.get(gender);
}

// ---------- recolour shader ----------
function refColor(partId, matName) {
  const src = partId.split('_')[0];
  return manifest?.sources?.[src]?.ref?.[matName] || [0.5, 0.4, 0.35];
}
function tintable(mat, ref) {
  const m = mat.clone();
  m.color.set(0xffffff);
  const u = { uTint: { value: new THREE.Color(1, 1, 1) }, uRef: { value: new THREE.Color(ref[0], ref[1], ref[2]) }, uRefLum: { value: 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2] }, uMix: { value: 0 }, uMode: { value: 0 } };
  m.userData.tint = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform vec3 uRef; uniform float uRefLum; uniform float uMix; uniform float uMode;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 ratio = clamp(c * (uTint / max(uRef, vec3(0.03))), 0.0, 1.0);
        vec3 lumc = clamp(uTint * (lum / max(uRefLum, 0.03)), 0.0, 1.0);
        diffuseColor.rgb = mix(c, mix(ratio, lumc, uMode), uMix); }`);
  };
  m.customProgramCacheKey = () => 'bwari-tint';
  return m;
}
function setTint(mat, hex, mode) {
  const u = mat.userData.tint; if (!u) return;
  if (!hex) { u.uMix.value = 0; return; }
  u.uTint.value.set(hex); u.uMix.value = 1; u.uMode.value = mode;
}

export const SIT_POSE = { Hips: [0, 0, 0], Spine: [6, 0, 0], LeftUpLeg: [-82, 0, 6], RightUpLeg: [-82, 0, -6], LeftLeg: [84, 0, 0], RightLeg: [84, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-6, 0, 0], LeftArm: [0, 0, 10], RightArm: [0, 0, -10] };

// Renders a head and shoulders photo of an avatar from the current scene; returns a small JPEG data URL.
export function avatarPhoto(renderer, scene, avatar, size = 160) {
  const head = avatar.bones.get('Head'); const hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.copy(avatar.group.position).add(new THREE.Vector3(0, 1.6, 0));
  const dir = new THREE.Vector3(Math.sin(avatar.group.rotation.y), 0, Math.cos(avatar.group.rotation.y));
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 20); cam.position.copy(hp).add(dir.multiplyScalar(0.95)).add(new THREE.Vector3(0, 0.0, 0)); cam.lookAt(hp.x, hp.y + 0.02, hp.z);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace }); const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, cam); const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px); renderer.setRenderTarget(prev); rt.dispose();
  const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', 0.82);
}

// Physically based upgrades of the imported materials: skin gets peach fuzz sheen and a faint oily clearcoat,
// eyes a wet clearcoat, hair anisotropic highlights, cloth a soft sheen.
function physical(src, props = {}) { const m = new THREE.MeshPhysicalMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(m, src); for (const [k, v] of Object.entries(props)) { if (k === 'sheenColor' || k === 'specularColor') m[k] = new THREE.Color(v); else m[k] = v; } return m; }
const SKIN_PROPS = { roughness: 0.45, sheen: 0.1, sheenRoughness: 0.7, sheenColor: '#ffc9a8', clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.75, specularIntensity: 1.0 };
const HAIR_PROPS = { roughness: 0.58, anisotropy: 0.6, anisotropyRotation: Math.PI / 2, sheen: 0.04, sheenColor: '#ffffff', envMapIntensity: 0.3, specularIntensity: 0.55 };
const CLOTH_PROPS = { sheen: 0.12, sheenRoughness: 0.85, sheenColor: '#ffffff', envMapIntensity: 0.8 };
const EYE_PROPS = { roughness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 0.5, specularIntensity: 0.6 };
const PROC_MAT = (color, rough = 0.95, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, ...extra });
const HAIR_MAT = (color) => PROC_MAT(color, 0.7, { sheen: 0.15, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.6), anisotropy: 0.55, envMapIntensity: 0.4, specularIntensity: 0.9 });
const CLOTH_MAT = (color) => PROC_MAT(color, 0.85, { sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') });

// ---------- makeup and tattoos, painted onto the textures using the mesh's own UV layout ----------
// UV box of the vertices that pass the test, clustered around the median so stray texture islands do not stretch it
function uvRegion(geo, test, spread = 0.09) {
  const P = geo.attributes.position, U = geo.attributes.uv; if (!U) return null; const pts = [];
  for (let i = 0; i < P.count; i++) { if (test(P.getX(i), P.getY(i), P.getZ(i))) pts.push([U.getX(i), U.getY(i)]); }
  if (!pts.length) return null;
  const med = (k) => { const a = pts.map((p) => p[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }; const mu = med(0), mv = med(1);
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0, c = 0;
  for (const [u, v] of pts) { if (Math.abs(u - mu) > spread || Math.abs(v - mv) > spread) continue; c++; if (u < u0) u0 = u; if (v < v0) v0 = v; if (u > u1) u1 = u; if (v > v1) v1 = v; }
  return c ? { u0, v0, u1, v1, cx: (u0 + u1) / 2, cy: (v0 + v1) / 2, w: u1 - u0, h: v1 - v0 } : null;
}
function paintedTexture(srcTex, draw, scale = 1) {
  const img = srcTex?.image; const W = img ? Math.round((img.width || 1024) * scale) : 1024, H = img ? Math.round((img.height || 1024) * scale) : 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  if (img) { try { g.drawImage(img, 0, 0, W, H); } catch (e) { g.fillStyle = '#b07a5a'; g.fillRect(0, 0, W, H); } }
  draw(g, W, H); const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = srcTex?.colorSpace || THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; return t;
}
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rot, 0, Math.PI * 2); g.fill(); };
const soft = (g, x, y, r, color, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };

export class Avatar {
  constructor(scene, config, opts = {}) {
    this.scene = scene; this.config = { ...config }; this.opts = opts;
    this.group = new THREE.Group(); this.group.name = 'avatar';
    scene.add(this.group);
    this.parts = {}; this.bones = new Map(); this.mixer = null; this.actions = {}; this.current = null;
    this.loaded = false; this.formal = false; this.talkUntil = 0; this.mouth = []; this.headMeshes = [];
    this.moveSpeed = 0; this.t = Math.random() * 100; this.idleTimer = 8 + Math.random() * 10;
    this.label = null; this.bubble = null; this.oneShot = null; this.loopAction = null; this.blinkers = []; this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this._skinMats = []; this._hairMats = []; this._topMats = []; this._bottomMats = []; this._shoeMats = [];
  }

  async load() {
    const g = this.config.gender;
    const bodyId = g === 'f' ? 'f1_body' : 'm2_body';
    const [bodyGltf, clips] = await Promise.all([loadGLTF(`avatars/${bodyId}.glb`), loadAnims(g)]);
    // fresh skeleton for this avatar
    const src = bodyGltf.scene;
    const bones = []; const map = new Map();
    const cloneBone = (b, parent) => { const nb = new THREE.Bone(); nb.name = b.name; nb.position.copy(b.position); nb.quaternion.copy(b.quaternion); nb.scale.copy(b.scale); parent.add(nb); map.set(b.name, nb); bones.push(nb); b.children.forEach((c) => { if (c.isBone) cloneBone(c, nb); }); return nb; };
    this.root = new THREE.Group(); this.root.name = 'Armature';
    src.traverse((o) => { if (o.isBone && !o.parent.isBone) cloneBone(o, this.root); });
    this.bones = map; this.root.updateMatrixWorld(true);
    this.group.add(this.root);
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [name, clip] of Object.entries(clips)) {
      const a = this.mixer.clipAction(clip); a.clampWhenFinished = true; this.actions[name] = a;
    }
    this._addPart('body', bodyId, bodyGltf);
    await this.rebuildParts();
    this._makeLabels();
    this.play('idle', { fade: 0 });
    this.loaded = true;
    return this;
  }

  _bindMesh(srcMesh, partId) {
    const skel = srcMesh.skeleton;
    const bones = skel.bones.map((b) => this.bones.get(b.name) || this.bones.get('Hips'));
    const inverses = skel.boneInverses.map((m) => m.clone());
    const mesh = new THREE.SkinnedMesh(srcMesh.geometry, srcMesh.material);
    mesh.name = srcMesh.name;
    mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.partId = partId;
    return mesh;
  }

  _addPart(slot, partId, gltf) {
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const group = new THREE.Group(); group.name = slot;
    for (const src of meshes) {
      const mesh = this._bindMesh(src, partId);
      const matName = src.material.name;
      if (/Skin|Body/.test(matName)) { mesh.material = tintable(physical(src.material, SKIN_PROPS), refColor(partId, matName)); this._skinMats.push(mesh.material); if (/Body/.test(matName)) this.bodyMesh = mesh; }
      else if (/Hair|Beard/.test(matName)) { mesh.material = tintable(physical(src.material, HAIR_PROPS), refColor(partId, matName)); this._hairMats.push(mesh.material); }
      else if (/Top/.test(matName)) { mesh.material = tintable(physical(src.material, CLOTH_PROPS), refColor(partId, matName)); this._topMats.push(mesh.material); }
      else if (/Bottom/.test(matName)) { mesh.material = tintable(physical(src.material, CLOTH_PROPS), refColor(partId, matName)); this._bottomMats.push(mesh.material); }
      else if (/Footwear/.test(matName)) { mesh.material = tintable(physical(src.material, { clearcoat: 0.3, clearcoatRoughness: 0.4 }), refColor(partId, matName)); this._shoeMats.push(mesh.material); }
      else if (/Eye/.test(matName)) { mesh.material = physical(src.material, EYE_PROPS); }
      else if (/Teeth/.test(matName)) { mesh.material = physical(src.material, { roughness: 0.3, clearcoat: 0.5 }); }
      else { mesh.material = physical(src.material); }
      if (slot === 'head') { if (/Head/.test(mesh.name)) this.headMesh = mesh; this.headMeshes.push(mesh); if (mesh.morphTargetDictionary) { const d = mesh.morphTargetDictionary; const k = ['mouthOpen', 'jawOpen', 'viseme_aa'].find((n) => n in d); if (k !== undefined) this.mouth.push([mesh, d[k]]); const s = ['mouthSmile', 'mouthSmileLeft'].find((n) => n in d); if (s) mesh.userData.smile = d[s]; if ('eyeBlinkLeft' in d && 'eyeBlinkRight' in d) this.blinkers.push([mesh, d.eyeBlinkLeft, d.eyeBlinkRight]); } }
      group.add(mesh);
    }
    this.root.add(group);
    this.parts[slot] = group;
    return group;
  }

  _removePart(slot) {
    const g = this.parts[slot]; if (!g) return;
    g.traverse((o) => { if (o.isMesh) { if (o.material?.userData?.tint) { for (const arr of [this._skinMats, this._hairMats, this._topMats, this._bottomMats, this._shoeMats]) { const i = arr.indexOf(o.material); if (i >= 0) arr.splice(i, 1); } } if (!o.isSkinnedMesh) o.geometry.dispose(); o.material.dispose?.(); } });
    this.root.remove(g); delete this.parts[slot];
    if (slot === 'head') { this.headMeshes = []; this.mouth = []; this.blinkers = []; }
  }

  async rebuildParts() {
    const c = this.config;
    const wanted = { head: c.head, top: c.top, bottom: c.bottom, shoes: c.shoes, hair: c.wig || !c.hair || c.hair.startsWith('proc:') || c.hair === 'none' ? null : c.hair, beard: c.beard && c.gender === 'm' ? 'm1_beard' : null, hat: c.hat && c.gender === 'm' ? 'm1_headwear' : null };
    const loads = [];
    for (const [slot, id] of Object.entries(wanted)) {
      const cur = this.parts[slot]?.userData?.id;
      if (cur === id) continue;
      this._removePart(slot);
      if (id) loads.push(loadGLTF(`avatars/${id}.glb`).then((g) => { this._addPart(slot, id, g).userData.id = id; }));
    }
    await Promise.all(loads);
    if (c.hat && this.parts.hair) this.parts.hair.visible = false; else if (this.parts.hair) this.parts.hair.visible = true;
    this._buildProcedural();
    this.applyColors();
    this.applyMorphs();
    this.applyMakeup();
  }

  // Paints brows, lashes, liner, lips, blush, contour and highlight onto the face texture, and a clearcoat map so the
  // lips and highlights are glossy. Tattoos are painted onto the body texture.
  applyMakeup() {
    const mk = this.config.makeup || {}; const head = this.headMesh; const H = this._headMetrics();
    if (head && H && head.material.map) {
      const src = head.userData.baseMap || (head.userData.baseMap = head.material.map); const geo = head.geometry;
      const teeth = this.headMeshes.find((m) => /Teeth/.test(m.name)); let mouthY = H.eyeY - 0.09, mouthZ = H.front - 0.02; if (teeth) { const bb = new THREE.Box3().setFromBufferAttribute(teeth.geometry.attributes.position); mouthY = (bb.min.y + bb.max.y) / 2; mouthZ = bb.max.z; }
      const lips = uvRegion(geo, (x, y, z) => Math.abs(x) < 0.027 && Math.abs(y - mouthY) < 0.011 && z > mouthZ - 0.006, 0.06);
      const eyes = [H.le, H.re].map((e) => uvRegion(geo, (x, y, z) => Math.hypot(x - e.x, y - e.y, z - e.z) < 0.024 && z > H.eyeZ - 0.02));
      const brows = [H.le, H.re].map((e) => uvRegion(geo, (x, y, z) => Math.abs(x - e.x) < 0.022 && y > H.eyeY + 0.012 && y < H.eyeY + 0.032 && z > H.eyeZ - 0.02));
      const cheeks = [1, -1].map((s) => uvRegion(geo, (x, y, z) => x * s > 0.03 && x * s < 0.07 && y > H.eyeY - 0.05 && y < H.eyeY - 0.02 && z > H.eyeZ - 0.06));
      const bridge = uvRegion(geo, (x, y, z) => Math.abs(x) < 0.006 && y > H.eyeY - 0.03 && y < H.eyeY + 0.005 && z > H.eyeZ - 0.01);
      const gloss = document.createElement('canvas'); gloss.width = gloss.height = 512; const gg = gloss.getContext('2d'); gg.fillStyle = 'rgb(70,70,70)'; gg.fillRect(0, 0, 512, 512);
      head.material.map = paintedTexture(src, (g, W, Hh) => {
        const k = (v) => Math.max(0, Math.min(1, +v || 0)); const px = (r) => ({ x: r.cx * W, y: r.cy * Hh, w: r.w * W, h: r.h * Hh, x0: r.u0 * W, x1: r.u1 * W, y0: r.v0 * Hh, y1: r.v1 * Hh });
        for (const [bi, b] of brows.entries()) if (b && k(mk.brows)) { const p = px(b); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(35,22,14,${0.85 * k(mk.brows)})`; const inner = bi === 0 ? p.x0 : p.x1; ell(g, p.x + (inner - p.x) * 0.1, p.y + p.h * 0.1, p.w * 0.5, p.h * 0.22, bi === 0 ? -0.18 : 0.18); }
        for (const [ei, e] of eyes.entries()) if (e) { const p = px(e); const outer = ei === 0 ? p.x1 : p.x0; const inner = ei === 0 ? p.x0 : p.x1; const dir = ei === 0 ? 1 : -1; g.globalCompositeOperation = 'source-over';
          if (k(mk.liner)) { g.strokeStyle = `rgba(12,8,10,${0.9 * k(mk.liner)})`; g.lineCap = 'round'; g.lineWidth = p.h * 0.16 * k(mk.liner) + 1; g.beginPath(); g.moveTo(inner, p.y - p.h * 0.05); g.quadraticCurveTo(p.x, p.y0 - p.h * 0.08, outer, p.y - p.h * 0.1); g.lineTo(outer + dir * p.w * 0.22, p.y - p.h * 0.32); g.stroke(); }
          if (k(mk.lashes)) { g.strokeStyle = `rgba(10,8,10,${0.95 * k(mk.lashes)})`; g.lineWidth = Math.max(1, p.h * 0.05); for (let i = 0; i < 9; i++) { const t = 0.15 + (i / 8) * 0.8; const x = inner + (outer - inner) * t; const y = p.y0 + Math.sin(t * Math.PI) * -p.h * 0.1 - p.h * 0.02; const len = p.h * (0.25 + 0.3 * k(mk.lashes)) * (0.6 + 0.4 * Math.sin(t * Math.PI)); g.beginPath(); g.moveTo(x, y + p.h * 0.08); g.quadraticCurveTo(x + dir * len * 0.3, y - len * 0.6, x + dir * len * 0.7, y - len); g.stroke(); } g.lineWidth = Math.max(1, p.h * 0.03); for (let i = 0; i < 5; i++) { const t = 0.3 + (i / 4) * 0.6; const x = inner + (outer - inner) * t; g.beginPath(); g.moveTo(x, p.y1 - p.h * 0.1); g.lineTo(x + dir * p.h * 0.05, p.y1 + p.h * 0.12 * k(mk.lashes)); g.stroke(); } }
        }
        if (lips && mk.lips) { const p = px(lips); g.globalCompositeOperation = 'multiply'; g.fillStyle = mk.lips; g.globalAlpha = 0.85; ell(g, p.x, p.y, p.w * 0.5, p.h * 0.5); g.globalAlpha = 1; g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(255,255,255,${0.22 * k(mk.gloss)})`; ell(g, p.x, p.y - p.h * 0.18, p.w * 0.22, p.h * 0.1); }
        for (const [ci, c] of cheeks.entries()) if (c) { const p = px(c); if (k(mk.blush)) { g.globalCompositeOperation = 'multiply'; soft(g, p.x, p.y - p.h * 0.1, p.w * 0.6, 'rgba(225,95,120,A)', 0.55 * k(mk.blush)); } if (k(mk.contour)) { g.globalCompositeOperation = 'multiply'; soft(g, p.x + (ci === 0 ? 1 : -1) * p.w * 0.25, p.y + p.h * 0.35, p.w * 0.55, 'rgba(90,50,35,A)', 0.5 * k(mk.contour)); } if (k(mk.highlight)) { g.globalCompositeOperation = 'screen'; soft(g, p.x + (ci === 0 ? 1 : -1) * p.w * 0.15, p.y - p.h * 0.45, p.w * 0.35, 'rgba(255,240,225,A)', 0.35 * k(mk.highlight)); } }
        if (bridge && k(mk.highlight)) { const p = px(bridge); g.globalCompositeOperation = 'screen'; const gr = g.createLinearGradient(p.x - p.w, p.y, p.x + p.w, p.y); gr.addColorStop(0, 'rgba(255,245,230,0)'); gr.addColorStop(0.5, `rgba(255,245,230,${0.35 * k(mk.highlight)})`); gr.addColorStop(1, 'rgba(255,245,230,0)'); g.fillStyle = gr; g.fillRect(p.x - p.w, p.y0, p.w * 2, p.h); }
        g.globalCompositeOperation = 'source-over';
        // gloss map (same uv space, half size)
        const s = 512 / W; gg.fillStyle = 'rgb(80,80,80)'; gg.fillRect(0, 0, 512, 512);
        if (lips) { const p = px(lips); gg.fillStyle = `rgb(${Math.round(80 + 175 * k(mk.gloss))},${Math.round(80 + 175 * k(mk.gloss))},${Math.round(80 + 175 * k(mk.gloss))})`; ell(gg, p.x * s, p.y * s, p.w * 0.5 * s, p.h * 0.5 * s); }
        if (bridge) { const p = px(bridge); gg.fillStyle = `rgb(${Math.round(80 + 120 * k(mk.highlight))},${Math.round(80 + 120 * k(mk.highlight))},${Math.round(80 + 120 * k(mk.highlight))})`; ell(gg, p.x * s, p.y * s, p.w * 0.9 * s, p.h * 0.55 * s); }
        for (const c of cheeks) if (c) { const p = px(c); gg.fillStyle = `rgb(${Math.round(80 + 100 * k(mk.highlight))},${Math.round(80 + 100 * k(mk.highlight))},${Math.round(80 + 100 * k(mk.highlight))})`; ell(gg, p.x * s, (p.y - p.h * 0.4) * s, p.w * 0.4 * s, p.h * 0.3 * s); }
      });
      const gt = new THREE.CanvasTexture(gloss); gt.flipY = false; head.material.clearcoat = 1; head.material.clearcoatMap = gt; head.material.needsUpdate = true;
    }
    // tattoos on the body texture
    const body = this.bodyMesh; const tt = this.config.tattoos || {};
    if (body && body.material.map) {
      const src = body.userData.baseMap || (body.userData.baseMap = body.material.map); const geo = body.geometry;
      if (tt.sleeves || tt.chest) {
        const arms = [1, -1].map((s) => uvRegion(geo, (x, y, z) => x * s > 0.13 && x * s < 0.42 && y > 0.95 && y < 1.5)); const chest = uvRegion(geo, (x, y, z) => Math.abs(x) < 0.16 && y > 1.2 && y < 1.42 && z > 0.02);
        body.material.map = paintedTexture(src, (g, W, Hh) => { g.globalCompositeOperation = 'multiply'; const ink = 'rgba(28,30,40,0.82)'; const draw = (r, seed) => { if (!r) return; const x0 = r.u0 * W, y0 = r.v0 * Hh, w = r.w * W, h = r.h * Hh; let rs = seed; const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; }; g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round'; for (let i = 0; i < 22; i++) { g.lineWidth = 1 + rnd() * Math.min(w, h) * 0.03; g.beginPath(); const sx = x0 + rnd() * w, sy = y0 + rnd() * h; g.moveTo(sx, sy); g.bezierCurveTo(sx + (rnd() - 0.5) * w * 0.5, sy + (rnd() - 0.5) * h * 0.5, sx + (rnd() - 0.5) * w * 0.5, sy + (rnd() - 0.5) * h * 0.5, x0 + rnd() * w, y0 + rnd() * h); g.stroke(); } for (let i = 0; i < 8; i++) { const cx = x0 + rnd() * w, cy = y0 + rnd() * h, r = Math.min(w, h) * (0.03 + rnd() * 0.06); g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const rr = k % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); } };
          if (tt.sleeves) { draw(arms[0], 7); draw(arms[1], 13); } if (tt.chest) draw(chest, 29); g.globalCompositeOperation = 'source-over'; });
      } else if (body.material.map !== src) body.material.map = src;
      body.material.needsUpdate = true;
    }
  }

  // Sims style sculpting: face and body sliders drive the morph targets baked into every part.
  applyMorphs() {
    const vals = {}; for (const [k, v] of Object.entries(this.config.face || {})) vals[k] = THREE.MathUtils.clamp(+v || 0, -1, 1) * FACE_GAIN; for (const [k, v] of Object.entries(this.config.body || {})) if (k !== 'height') vals[k] = THREE.MathUtils.clamp(+v || 0, -1, 1) * BODY_GAIN;
    this.root.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) for (const k in vals) { const i = o.morphTargetDictionary[k]; if (i !== undefined) o.morphTargetInfluences[i] = vals[k]; } });
    this.group.scale.setScalar(1 + THREE.MathUtils.clamp(+(this.config.body?.height || 0), -1, 1) * 0.07);
  }

  // Rest-pose head measurements taken from the bind pose, so they do not depend on the current animation.
  _headMetrics() {
    const head = this.headMeshes.find((m) => /Head/.test(m.name));
    if (!head) return null;
    const sk = head.skeleton; const idx = (n) => sk.bones.findIndex((b) => b.name === n);
    const bindPos = (n) => { const i = idx(n); return i >= 0 ? new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()) : null; };
    const bb = new THREE.Box3().setFromBufferAttribute(head.geometry.attributes.position); const le = bindPos('LeftEye'), re = bindPos('RightEye');
    const eyeY = le && re ? (le.y + re.y) / 2 : bb.max.y - 0.11; const eyeZ = le && re ? (le.z + re.z) / 2 : bb.max.z - 0.06;
    const face = this.config.face || {};
    const g = FACE_GAIN; const cx = (bb.min.x + bb.max.x) / 2; const ry = (bb.max.y - (eyeY + 0.03)) * (1 + 0.14 * g * Math.max(0, face.foreheadHeight || 0)); const rx = ((bb.max.x - bb.min.x) / 2 - 0.012) * (1 + 0.1 * g * (face.headWidth || 0)); const rz = ((eyeZ - bb.min.z) / 2 + 0.018) * (1 + 0.1 * g * (face.headDepth || 0)); const cz = (bb.min.z + eyeZ) / 2 + 0.008;
    const hi = idx('Head');
    return { top: bb.max.y, eyeY, eyeZ, le, re, cx, cy: eyeY + 0.03, cz, rx, ry, rz, back: bb.min.z, front: bb.max.z, headInv: hi >= 0 ? sk.boneInverses[hi] : new THREE.Matrix4(), headBone: this.bones.get('Head') };
  }

  _clearProcedural() { for (const m of this.procMeshes || []) { m.parent?.remove(m); m.geometry.dispose(); } this.procMeshes = []; }

  _buildProcedural() {
    this._clearProcedural();
    const H = this._headMetrics(); if (!H || !H.headBone) return;
    const c = this.config; const style = (c.hair || '').replace('proc:', '');
    const hairMat = HAIR_MAT(c.hairColor || '#141414');
    const clothMat = CLOTH_MAT(c.topColor || '#8e44ad');
    const { cx, cy, cz, rx, ry, rz } = H; const Q = new THREE.Quaternion();
    // place a mesh given model-space position and scale, parented to the Head bone using the bind pose
    const add = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      const world = new THREE.Matrix4().compose(new THREE.Vector3(cx + x, cy + y, cz + z), Q, new THREE.Vector3(sx, sy, sz));
      H.headInv.clone().multiply(world).decompose(m.position, m.quaternion, m.scale);
      H.headBone.add(m); this.procMeshes.push(m); return m;
    };
    const unit = (phiStart, phiLength, thetaStart, thetaLength, seg = 32) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.6), phiStart, phiLength, thetaStart, thetaLength);
    const cap = (mat, k, theta, y = 0, z = 0) => add(unit(0, Math.PI * 2, 0, Math.PI * theta), mat, 0, y, z, rx * k, ry * k, rz * k);
    const backBand = (mat, k, t0, t1) => add(unit(Math.PI, Math.PI, Math.PI * t0, Math.PI * (t1 - t0)), mat, 0, 0, 0, rx * k, ry * k, rz * k);
    const strands = (mat, n, thick, len, k = 1.04) => {
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) / n * Math.PI * 2; const sx = -Math.cos(a), sz = Math.sin(a); // sphere param: phi=a
        if (sz > 0.45) continue; // leave the face free
        const t = Math.PI * 0.46; const x0 = cx + sx * rx * k * Math.sin(t), y0 = cy + ry * k * Math.cos(t), z0 = cz + sz * rz * k * Math.sin(t);
        const pts = [new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0 * 1.1 - cx * 0.1, y0 - len * 0.5, z0 + (sz < 0 ? -0.01 : 0)), new THREE.Vector3(x0 * 1.05 - cx * 0.05, y0 - len, z0 + (sz < 0 ? -0.02 : 0.01))];
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, thick, 7, false), mat); m.castShadow = true;
        H.headInv.clone().decompose(m.position, m.quaternion, m.scale); H.headBone.add(m); this.procMeshes.push(m);
      }
    };
    if (c.hair?.startsWith('proc:') && !c.hat && !c.wig) {
      if (style === 'low') { cap(hairMat, 1.07, 0.38, ry * 0.05); backBand(hairMat, 1.06, 0.38, 0.62); }
      else if (style === 'fade') { cap(hairMat, 1.06, 0.36, ry * 0.05); backBand(hairMat, 1.05, 0.36, 0.5); }
      else if (style === 'afro') {
        const fuzz = HAIR_MAT(c.hairColor || '#141414'); fuzz.sheen = 0.5; fuzz.roughness = 1; fuzz.anisotropy = 0; const m = add(new THREE.SphereGeometry(1, 48, 32), fuzz, 0, ry * 1.0, -rz * 0.3, rx * 1.7, ry * 1.5, rz * 1.4);
        const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const j = 1 + Math.sin(i * 12.9898 + 1) * Math.cos(i * 4.1) * 0.05; p.setXYZ(i, p.getX(i) * j, p.getY(i) * j, p.getZ(i) * j); } m.geometry.computeVertexNormals();
        backBand(hairMat, 1.06, 0.4, 0.62);
      }
      else if (style === 'bun') { cap(hairMat, 1.07, 0.44, ry * 0.05); backBand(hairMat, 1.06, 0.44, 0.6); add(new THREE.SphereGeometry(1, 24, 16), hairMat, 0, ry * 0.65, -rz * 1.1, ry * 0.55, ry * 0.5, ry * 0.55); }
      else if (style === 'braids') { cap(hairMat, 1.07, 0.46, ry * 0.05); backBand(hairMat, 1.06, 0.46, 0.6); strands(hairMat, 26, 0.0065, ry * 3.4, 1.06); }
      else if (style === 'locs') { cap(hairMat, 1.07, 0.46, ry * 0.05); backBand(hairMat, 1.06, 0.46, 0.6); strands(hairMat, 16, 0.011, ry * 2.4, 1.06); }
      else if (style === 'hijab') {
        const m = add(unit(Math.PI * 0.5 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.8), clothMat, 0, ry * 0.06, 0, rx * 1.26, ry * 1.32, rz * 1.26); m.material = clothMat.clone(); m.material.side = THREE.DoubleSide;
        add(unit(0, Math.PI * 2, 0, Math.PI * 0.3), clothMat, 0, ry * 0.06, 0, rx * 1.26, ry * 1.32, rz * 1.26);
        const d = add(new THREE.CylinderGeometry(1, 1.7, 1, 40, 1, true), clothMat, 0, -ry * 2.0, -rz * 0.1, rx * 1.3, ry * 2.2, rz * 1.3); d.material = clothMat.clone(); d.material.side = THREE.DoubleSide;
      }
      else if (style === 'cap') { const capMat = CLOTH_MAT(c.hairColor || '#2c3e50'); add(unit(0, Math.PI * 2, 0, Math.PI * 0.46), capMat, 0, ry * 0.08, -rz * 0.04, rx * 1.1, ry * 1.3, rz * 1.12); add(new THREE.BoxGeometry(rx * 1.6, 0.006, rz * 0.9), capMat, 0, ry * 0.12, rz * 1.35); add(new THREE.SphereGeometry(0.012, 10, 8), capMat, 0, ry * 1.38, -rz * 0.04); }
    }
    if (c.wig) {
      const wigMat = HAIR_MAT('#f0eadb'); cap(wigMat, 1.08, 0.46, ry * 0.05); backBand(wigMat, 1.07, 0.46, 0.62);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 12), wigMat, s * rx * 1.02, -ry * 0.25, -rz * 0.15, ry, ry, ry);
      add(new THREE.CylinderGeometry(0.42, 0.42, 1.7, 12), wigMat, 0, -ry * 0.7, -rz * 1.0, ry, ry, ry);
    }
    if (c.chain) {
      const metal = new THREE.MeshPhysicalMaterial({ color: c.chain === 'gold' ? '#e9c15a' : '#dfe3ea', metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });
      const body = this.parts.body?.children?.[0]; const sk = body?.skeleton; const idx = sk ? sk.bones.findIndex((b) => b.name === 'Spine2') : -1;
      if (sk && idx >= 0) {
        const inv = sk.boneInverses[idx]; const bind = inv.clone().invert(); const neck = new THREE.Vector3().setFromMatrixPosition(bind);
        const place = (geo, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, metal); m.castShadow = true; const world = new THREE.Matrix4().compose(new THREE.Vector3(neck.x + x, neck.y + y, neck.z + z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1)); inv.clone().multiply(world).decompose(m.position, m.quaternion, m.scale); sk.bones[idx].add(m); this.procMeshes.push(m); return m; };
        const links = 26; for (let i = 0; i < links; i++) { const a = (i / links) * Math.PI * 2; const r = 0.085; const x = Math.sin(a) * r * 1.05, zz = Math.cos(a) * r; if (zz < -0.03) continue; const y = 0.19 - Math.max(0, zz) * 0.7; const link = place(new THREE.TorusGeometry(0.011, 0.0038, 8, 14), x, y, zz + 0.05, 0); link.rotation.y += a; link.rotation.x += i % 2 ? Math.PI / 2 : 0; }
        place(new THREE.CylinderGeometry(0.018, 0.018, 0.005, 20), 0, 0.11, 0.135, Math.PI / 2);
      }
    }
    if (c.glasses && H.le && H.re) {
      const gm = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3, metalness: 0.6 });
      const lens = new THREE.MeshPhysicalMaterial({ color: '#8fb4d6', transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide });
      const lr = Math.min(0.024, Math.abs(H.re.x - H.le.x) * 0.4); const z = H.eyeZ + 0.03 - cz; const y = H.eyeY - cy;
      for (const e of [H.le, H.re]) { const x = e.x - cx; add(new THREE.TorusGeometry(lr, 0.0028, 8, 28), gm, x, y, z); add(new THREE.CircleGeometry(lr, 28), lens, x, y, z); const s = Math.sign(x) || 1; add(new THREE.BoxGeometry(0.003, 0.003, 0.12), gm, x + s * lr, y + 0.004, z - 0.06); }
      add(new THREE.BoxGeometry(Math.abs(H.re.x - H.le.x) - lr * 2 + 0.002, 0.003, 0.003), gm, (H.le.x + H.re.x) / 2 - cx, y + 0.004, z);
    }
  }

  applyColors() {
    const c = this.config;
    for (const m of this._skinMats) setTint(m, c.skin, 0);
    for (const m of this._hairMats) setTint(m, c.hairColor, 1);
    const f = this.formal;
    for (const m of this._topMats) setTint(m, f ? '#111111' : c.topColor, 1);
    for (const m of this._bottomMats) setTint(m, f ? '#111111' : c.bottomColor, 1);
    for (const m of this._shoeMats) setTint(m, f ? '#111111' : c.shoesColor, 1);
    if (this.label) this.label.element.textContent = c.name || 'Aspirant';
  }

  async setConfig(patch) {
    const needRebuild = ['head', 'top', 'bottom', 'shoes', 'hair', 'beard', 'hat', 'glasses', 'wig', 'chain'].some((k) => k in patch && patch[k] !== this.config[k]);
    const procRebuild = ['hairColor', 'topColor'].some((k) => k in patch && patch[k] !== this.config[k]);
    const headShape = 'face' in patch && (patch.face?.headWidth !== this.config.face?.headWidth || patch.face?.headDepth !== this.config.face?.headDepth);
    Object.assign(this.config, patch);
    if (needRebuild) await this.rebuildParts(); else if (procRebuild || headShape) this._buildProcedural();
    this.applyColors();
    if ('face' in patch || 'body' in patch) this.applyMorphs();
    if ('makeup' in patch || 'tattoos' in patch || 'skin' in patch) this.applyMakeup();
  }

  setFormal(on) { if (this.formal === !!on) return; this.formal = !!on; this.applyColors(); }

  // pose: null | 'sit' | 'dance' | 'dj' | 'stand'. Sitting is applied on top of the idle animation each frame.
  setPose(pose, seatH = 0.45) {
    this.pose = pose || null; this.seatH = seatH;
    if (pose === 'dance' || pose === 'dj') this.play(pose === 'dj' ? 'dance3' : 'dance');
    else { if (this.loopName && /dance/.test(this.loopName)) this.play('idle'); }
    if (pose !== 'sit') this.root.position.y = 0;
  }
  _applyPose() {
    if (this.pose !== 'sit') return;
    const hips = this.bones.get('Hips'); if (!hips) return;
    this.root.position.y = (this.seatH + 0.1) - hips.position.y;
    const rot = (name, x, y = 0, z = 0) => { const b = this.bones.get(name); if (!b) return; b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z)))); };
    const low = Math.max(0, 0.45 - this.seatH); // lower seats: knees come up so the feet stay on the floor
    for (const [name, e] of Object.entries(SIT_POSE)) { let x = e[0]; if (/UpLeg$/.test(name)) x -= low * 70; if (/Leg$/.test(name) && !/UpLeg$/.test(name)) x += low * 110; rot(name, x, e[1], e[2]); }
  }

  _makeLabels() {
    const el = document.createElement('div'); el.className = 'nametag'; el.textContent = this.config.name || 'Aspirant';
    if (this.opts.tagClass) el.classList.add(this.opts.tagClass);
    this.label = new CSS2DObject(el); this.label.position.set(0, 2.02, 0); this.group.add(this.label);
    const b = document.createElement('div'); b.className = 'bubble';
    this.bubble = new CSS2DObject(b); this.bubble.position.set(0, 2.28, 0); this.bubble.visible = false; this.group.add(this.bubble);
  }

  say(text, seconds = 6) {
    if (!this.bubble) return;
    this.bubble.element.textContent = text; this.bubble.visible = true;
    clearTimeout(this._bt); this._bt = setTimeout(() => { if (this.bubble) this.bubble.visible = false; }, seconds * 1000);
    this.talkUntil = performance.now() / 1000 + Math.min(seconds, 1.5 + text.length * 0.06);
    if (this.moveSpeed < 0.05 && !this.oneShot) this.play(Math.random() < 0.5 ? 'talk' : 'talk2', { loop: false, once: true });
  }

  // name: idle | walk | run | dance | dance2 | dance3 | talk | talk2 | emote1..4 | jump | idle2
  play(name, { fade = 0.25, loop = true, once = false } = {}) {
    const a = this.actions[name]; if (!a) return;
    if (once) {
      if (this.oneShot && this.oneShot !== a) { this.oneShot.fadeOut(fade); }
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
      if (this.current && this.current !== a) this.current.fadeOut(fade);
      this.oneShot = a; this.current = a;
      return;
    }
    if (this.current === a && !this.oneShot) return;
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.enabled = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.oneShot = null; this.current = a; this.loopName = name;
  }
  stopOneShot() { if (this.oneShot) { this.oneShot.fadeOut(0.2); this.oneShot = null; this.current = null; } }
  isBusy() { return !!this.oneShot || (this.loopName && /dance/.test(this.loopName)); }
  setDancing(n = 1) { this.play(['dance', 'dance2', 'dance3'][(n - 1) % 3]); }

  // speed in m/s; drives walk/run blending
  setMoving(speed) {
    this.moveSpeed = speed;
    if (speed > 0.05) {
      const run = speed > 3; const name = run ? 'run' : 'walk';
      if (this.oneShot) { this.stopOneShot(); }
      this.play(name);
      const a = this.actions[name]; if (a) a.timeScale = THREE.MathUtils.clamp(speed / animSpeed(this.config.gender, name), 0.6, 1.6);
    } else if (this.loopName === 'walk' || this.loopName === 'run' || (!this.current)) {
      this.play('idle');
    }
  }

  update(dt) {
    if (!this.loaded) return;
    this.t += dt;
    if (this.oneShot && !this.oneShot.isRunning()) { this.oneShot = null; this.play('idle'); }
    if (this.loopName === 'idle' && !this.oneShot) { this.idleTimer -= dt; if (this.idleTimer <= 0) { this.idleTimer = 12 + Math.random() * 14; this.play('idle2', { once: true }); } }
    this.mixer.update(dt);
    this._applyPose();
    const now = performance.now() / 1000; const talking = now < this.talkUntil;
    if (this.blinkers.length) { this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkT = 2.5 + Math.random() * 4; this.blink = 0.18; } if (this.blink > 0) { this.blink -= dt; const v = Math.sin(Math.PI * Math.max(0, 1 - this.blink / 0.18)); for (const [m, l, r] of this.blinkers) { m.morphTargetInfluences[l] = v; m.morphTargetInfluences[r] = v; } } }
    for (const [mesh, idx] of this.mouth) {
      const v = talking ? 0.12 + 0.3 * Math.abs(Math.sin(this.t * 13) * Math.sin(this.t * 5.3 + 1)) : 0;
      mesh.morphTargetInfluences[idx] += (v - mesh.morphTargetInfluences[idx]) * Math.min(1, dt * 18);
    }
  }

  dispose() {
    this._clearProcedural();
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.material?.dispose?.(); if (!o.isSkinnedMesh) o.geometry?.dispose?.(); } });
    this.label?.element?.remove(); this.bubble?.element?.remove(); clearTimeout(this._bt);
  }
}
