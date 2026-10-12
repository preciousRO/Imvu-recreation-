import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Resolve asset URLs from this script's own location so hosting under any page URL works.
export const BASE = new URL('../', import.meta.url).href;
export const url = (p) => new URL(p, BASE).href;

const loader = new GLTFLoader();
const cache = new Map();
// Packed builds (VITE_ASSET_PACK=1) ship the models inside JSON files as base64, for hosts that only serve data types.
const PACKED = import.meta.env.VITE_ASSET_PACK === '1';
const packs = new Map();
function packFor(path) { const cat = path.split('/')[0]; if (!packs.has(cat)) packs.set(cat, loadJSON(`data/${cat}.json`)); return packs.get(cat); }
function b64ToBuffer(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; }
export function loadGLTF(path) {
  if (!cache.has(path)) {
    cache.set(path, PACKED
      ? packFor(path).then((pack) => { const b64 = pack[path]; if (!b64) throw new Error('Missing packed asset ' + path); return new Promise((res, rej) => loader.parse(b64ToBuffer(b64), '', res, rej)); })
      : loader.loadAsync(url(path)));
  }
  return cache.get(path);
}
export async function loadJSON(path) {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error('Failed to load ' + path);
  return r.json();
}

let props = null;
// KayKit city bits: one GLB with one scene per prop. Returns a factory: props('bench') -> fresh Object3D.
export async function loadProps() {
  if (props) return props;
  const gltf = await loadGLTF('props/kaykit.glb');
  const map = new Map();
  for (const scene of gltf.scenes) {
    const root = scene.children[0] || scene;
    map.set(root.name, root);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  props = (name) => { const src = map.get(name); if (!src) { console.warn('prop missing', name); return new THREE.Group(); } const c = src.clone(true); return c; };
  props.names = [...map.keys()];
  return props;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
