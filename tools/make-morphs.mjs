// Sims style sculpting: adds face and body morph targets (shape keys) to every avatar part.
// Each morph is a smooth deformation field defined from landmarks (eye bones, nose tip, teeth, chin, bones),
// so the same slider deforms the head, eyes, teeth, beard and hair together, or the body and its clothes together.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const DIR = 'public/avatars';
const SOURCES = ['m1', 'm2', 'f1'];
const HEAD_PARTS = ['head', 'hair', 'beard', 'headwear'];
const BODY_PARTS = ['body', 'top', 'bottom'];

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const bell = (y, c, w) => Math.exp(-(((y - c) / w) ** 2));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

function bonePos(skin, name) {
  const joints = skin.listJoints(); const i = joints.findIndex((j) => j.getName() === name); if (i < 0) return null;
  const m = skin.getInverseBindMatrices().getArray().slice(i * 16, i * 16 + 16); const t = [m[12], m[13], m[14]];
  return [-(m[0] * t[0] + m[1] * t[1] + m[2] * t[2]), -(m[4] * t[0] + m[5] * t[1] + m[6] * t[2]), -(m[8] * t[0] + m[9] * t[1] + m[10] * t[2])];
}
function positions(doc, meshName) { const m = doc.getRoot().listMeshes().find((x) => x.getName() === meshName); return m ? m.listPrimitives()[0].getAttribute('POSITION').getArray() : null; }
function bbox(a) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[i + k]); mx[k] = Math.max(mx[k], a[i + k]); } return { mn, mx }; }

// ---- landmarks ----
async function landmarks(src) {
  const head = await io.read(`${DIR}/${src}_head.glb`); const body = await io.read(`${DIR}/${src}_body.glb`);
  const hs = head.getRoot().listSkins()[0], bs = body.getRoot().listSkins()[0];
  const le = bonePos(hs, 'LeftEye'), re = bonePos(hs, 'RightEye');
  const H = positions(head, 'Wolf3D_Head'), T = positions(head, 'Wolf3D_Teeth');
  const hb = bbox(H), tb = bbox(T); const eyeY = (le[1] + re[1]) / 2, eyeZ = (le[2] + re[2]) / 2, eyeX = Math.abs(le[0]);
  let nose = null; for (let i = 0; i < H.length; i += 3) { const x = H[i], y = H[i + 1], z = H[i + 2]; if (Math.abs(x) < 0.015 && y < eyeY - 0.015 && y > eyeY - 0.08 && (!nose || z > nose[2])) nose = [x, y, z]; }
  let chin = null; for (let i = 0; i < H.length; i += 3) { const x = H[i], y = H[i + 1], z = H[i + 2]; if (Math.abs(x) < 0.01 && y < tb.mn[1] - 0.01 && y > tb.mn[1] - 0.08 && z > nose[2] - 0.06 && (!chin || y < chin[1])) chin = [x, y, z]; }
  const mouthY = (tb.mn[1] + tb.mx[1]) / 2, mouthZ = tb.mx[2] + 0.008; const cz = (hb.mn[2] + eyeZ) / 2; const rx = hb.mx[0] - 0.012;
  const L = {
    eyeY, eyeZ, eyeX, le: [le[0], le[1], eyeZ], re: [re[0], re[1], eyeZ], cz, rx, top: hb.mx[1], earX: hb.mx[0] - 0.008,
    nose, noseC: [0, (eyeY + nose[1]) / 2 - 0.004, nose[2] - 0.022], bridge: [0, eyeY - 0.008, nose[2] - 0.035],
    mouth: [0, mouthY, mouthZ], chin: [0, chin[1] + 0.012, chin[2] - 0.004],
    jaw: (s) => [s * rx * 0.9, mouthY - 0.004, cz + 0.012], cheekbone: (s) => [s * rx * 0.85, eyeY - 0.026, eyeZ - 0.03], cheek: (s) => [s * rx * 0.75, mouthY + 0.014, eyeZ - 0.04],
    forehead: [0, eyeY + 0.058, eyeZ - 0.02], brow: (s) => [s * eyeX, eyeY + 0.017, eyeZ + 0.014], ear: (s) => [s * (hb.mx[0] - 0.008), eyeY - 0.012, cz - 0.008],
    // body polylines (left side; mirrored for right)
    hips: bonePos(bs, 'Hips'), neck: bonePos(bs, 'Neck'), arm: [bonePos(bs, 'LeftShoulder'), bonePos(bs, 'LeftArm'), bonePos(bs, 'LeftForeArm'), bonePos(bs, 'LeftHand')], leg: [bonePos(bs, 'LeftUpLeg'), bonePos(bs, 'LeftLeg'), bonePos(bs, 'LeftFoot')],
  };
  return L;
}

// ---- deformation ops ----
// move: translate by v inside an ellipsoid (c, r); scale: scale about c by s inside the ellipsoid. gate: [y0, y1] ramps weight to 0 below y0.
function w(p, c, r, gate) {
  const d = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]); let k = smooth(1 - d);
  if (gate) k *= smooth((p[1] - gate[0]) / (gate[1] - gate[0]));
  return k;
}
const move = (c, r, v, gate) => (p) => { const k = w(p, c, r, gate); return [v[0] * k, v[1] * k, v[2] * k]; };
const scale = (c, r, s, gate) => (p) => { const k = w(p, c, r, gate); return [(p[0] - c[0]) * (s[0] - 1) * k, (p[1] - c[1]) * (s[1] - 1) * k, (p[2] - c[2]) * (s[2] - 1) * k]; };
const R3 = (r) => (typeof r === 'number' ? [r, r, r] : r);
const both = (fn) => (p) => { const a = fn(1)(p), b = fn(-1)(p); return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
const sum = (...fns) => (p) => fns.reduce((acc, f) => { const d = f(p); return [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]]; }, [0, 0, 0]);

function faceMorphs(L) {
  const gateHead = [L.eyeY - 0.15, L.eyeY - 0.08];
  const skull = [0, L.eyeY + 0.01, L.cz];
  return {
    headWidth: scale(skull, R3(0.32), [1.1, 1, 1], gateHead),
    headDepth: scale(skull, R3(0.32), [1, 1, 1.1], gateHead),
    foreheadHeight: move(L.forehead, [0.1, 0.07, 0.1], [0, 0.012, 0]),
    browHeight: both((s) => move(L.brow(s), R3(0.03), [0, 0.006, 0])),
    browDepth: both((s) => move(L.brow(s), [0.032, 0.02, 0.03], [0, 0, 0.005])),
    eyeSize: both((s) => scale(s > 0 ? L.le : L.re, R3(0.03), [1.18, 1.18, 1.12])),
    eyeSpacing: both((s) => move(s > 0 ? L.le : L.re, R3(0.032), [0.006 * Math.sign(s > 0 ? L.le[0] : L.re[0]), 0, 0])),
    eyeHeight: both((s) => move(s > 0 ? L.le : L.re, R3(0.032), [0, 0.005, 0])),
    noseWidth: scale(L.noseC, [0.03, 0.036, 0.03], [1.3, 1, 1]),
    noseLength: move([0, L.noseC[1] - 0.008, L.noseC[2]], [0.024, 0.032, 0.03], [0, -0.008, 0.002]),
    noseBridge: move(L.bridge, R3(0.026), [0, 0, 0.006]),
    noseTip: move(L.nose, R3(0.017), [0, 0, 0.007]),
    cheekbones: both((s) => move(L.cheekbone(s), R3(0.036), [0.006 * s, 0.001, 0.003])),
    cheekFullness: both((s) => move(L.cheek(s), R3(0.042), [0.007 * s, 0, 0.004])),
    mouthWidth: scale(L.mouth, [0.048, 0.026, 0.032], [1.18, 1, 1]),
    lipFullness: sum(move(L.mouth, [0.032, 0.013, 0.022], [0, 0, 0.004]), scale(L.mouth, [0.032, 0.013, 0.022], [1, 1.25, 1])),
    mouthHeight: move(L.mouth, [0.045, 0.03, 0.035], [0, 0.006, 0]),
    jawWidth: both((s) => move(L.jaw(s), [0.04, 0.045, 0.05], [0.008 * s, 0, 0])),
    chinWidth: scale(L.chin, [0.036, 0.03, 0.036], [1.25, 1, 1]),
    chinLength: move(L.chin, [0.042, 0.036, 0.042], [0, -0.01, 0]),
    chinForward: move(L.chin, [0.036, 0.03, 0.036], [0, 0, 0.008]),
    earSize: both((s) => scale(L.ear(s), R3(0.034), [1.25, 1.25, 1.25])),
  };
}

// closest point on a polyline
function closest(p, line) {
  let best = null, bd = Infinity;
  for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1]; const ab = sub(b, a); const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2))); const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]; const d = len(sub(p, q)); if (d < bd) { bd = d; best = { q, d, t: i + t }; } }
  return best;
}
function bodyMorphs(L) {
  const mirror = (pts) => pts.map((p) => [-p[0], p[1], p[2]]);
  const torso = [[0, 0.72, L.hips[2]], [0, L.neck[1] + 0.05, L.hips[2]]];
  const arms = [L.arm, mirror(L.arm)], legs = [L.leg, mirror(L.leg)];
  // which structure a vertex belongs to, and the radial vector from its axis
  const part = (p) => {
    const t = closest(p, torso), a = closest(p, arms[p[0] < 0 ? 1 : 0]), l = closest(p, legs[p[0] < 0 ? 1 : 0]);
    const isArm = a.d < t.d && Math.abs(p[0]) > 0.14 && p[1] > 0.95; const isLeg = p[1] < 0.9 && Math.abs(p[0]) > 0.03;
    return isArm ? { kind: 'arm', ...a } : isLeg ? { kind: 'leg', ...l } : { kind: 'torso', ...t };
  };
  const radial = (p, s, cond) => { const r = part(p); const k = cond(r, p); if (!k) return [0, 0, 0]; const d = sub(p, r.q); return [d[0] * (s[0] - 1) * k, d[1] * (s[1] - 1) * k, d[2] * (s[2] - 1) * k]; };
  const noHands = (r) => (r.kind === 'arm' ? smooth(1 - (r.t - 1.9) / 0.5) : r.kind === 'leg' ? smooth(1 - (r.t - 1.2) / 0.4) : 1);
  return {
    weight: (p) => radial(p, [1.22, 1, 1.22], (r) => noHands(r) * (r.kind === 'torso' ? (0.45 + 0.55 * bell(p[1], 1.0, 0.24)) : r.kind === 'arm' ? 0.55 : 0.5 + 0.3 * bell(p[1], 0.8, 0.15))),
    muscle: (p) => radial(p, [1.14, 1, 1.14], (r) => noHands(r) * (r.kind === 'torso' ? 0.8 * bell(p[1], 1.32, 0.16) : r.kind === 'arm' ? 0.5 + 0.6 * bell(r.t, 1.5, 0.5) : 0.5)),
    shoulders: (p) => radial(p, [1.12, 1, 1.03], (r) => (Math.abs(p[0]) < 0.28 ? bell(p[1], L.neck[1] - 0.05, 0.08) : 0)),
    chest: (p) => radial(p, [1.05, 1, 1.22], (r) => (r.kind === 'torso' && p[2] > L.hips[2] ? bell(p[1], L.neck[1] - 0.2, 0.08) : 0)),
    waist: (p) => radial(p, [1.14, 1, 1.12], (r) => (r.kind === 'torso' ? bell(p[1], 1.13, 0.07) : 0)),
    hips: (p) => radial(p, [1.16, 1, 1.08], (r) => (r.kind === 'torso' || (r.kind === 'leg' && p[1] > 0.8) ? bell(p[1], 0.94, 0.09) : 0)),
    butt: (p) => radial(p, [1.05, 1, 1.25], (r) => (r.kind !== 'arm' && p[2] < L.hips[2] ? bell(p[1], 0.9, 0.09) : 0)),
    legs: (p) => radial(p, [1.16, 1, 1.16], (r) => (r.kind === 'leg' ? noHands(r) : 0)),
  };
}

// ---- apply to a document ----
function computeNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
async function addMorphs(file, morphs) {
  const doc = await io.read(file); const buffer = doc.getRoot().listBuffers()[0];
  let added = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    const names = (mesh.getExtras()?.targetNames || []).slice(); const weights = (mesh.getWeights() || []).slice();
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION'); const pos = posAcc.getArray(); const idx = prim.getIndices()?.getArray(); const n = pos.length / 3;
      const base = computeNormals(pos, idx);
      for (const [name, fn] of Object.entries(morphs)) {
        if (names.includes(name)) continue;
        const d = new Float32Array(pos.length); let touched = 0;
        for (let i = 0; i < n; i++) { const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; const v = fn(p); if (v[0] || v[1] || v[2]) { touched++; d[i * 3] = v[0]; d[i * 3 + 1] = v[1]; d[i * 3 + 2] = v[2]; } }
        const morphed = new Float32Array(pos.length); for (let i = 0; i < pos.length; i++) morphed[i] = pos[i] + d[i];
        const nm = computeNormals(morphed, idx); const dn = new Float32Array(pos.length); for (let i = 0; i < pos.length; i++) dn[i] = d[Math.floor(i / 3) * 3] || d[Math.floor(i / 3) * 3 + 1] || d[Math.floor(i / 3) * 3 + 2] ? nm[i] - base[i] : 0;
        const sparse = touched < n * 0.5;
        const target = doc.createPrimitiveTarget(name);
        target.setAttribute('POSITION', doc.createAccessor(name + '_p').setType('VEC3').setArray(d).setBuffer(buffer).setSparse(sparse));
        target.setAttribute('NORMAL', doc.createAccessor(name + '_n').setType('VEC3').setArray(dn).setBuffer(buffer).setSparse(sparse));
        prim.addTarget(target); added++;
      }
    }
    const all = Object.keys(morphs).filter((k) => !names.includes(k));
    mesh.setExtras({ ...mesh.getExtras(), targetNames: [...names, ...all] }); mesh.setWeights([...weights, ...all.map(() => 0)]);
  }
  await io.write(file, doc);
  return { added, bytes: fs.statSync(file).size };
}

for (const src of SOURCES) {
  const L = await landmarks(src); const fm = faceMorphs(L), bm = bodyMorphs(L);
  for (const part of HEAD_PARTS) { const f = `${DIR}/${src}_${part}.glb`; if (!fs.existsSync(f)) continue; const r = await addMorphs(f, fm); console.log(f, 'face morphs', r.added, (r.bytes / 1024).toFixed(0) + 'KB'); }
  for (const part of BODY_PARTS) { const f = `${DIR}/${src}_${part}.glb`; if (!fs.existsSync(f)) continue; const r = await addMorphs(f, bm); console.log(f, 'body morphs', r.added, (r.bytes / 1024).toFixed(0) + 'KB'); }
}
const manifest = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`));
manifest.faceMorphs = Object.keys(faceMorphs(await landmarks('m2'))); manifest.bodyMorphs = Object.keys(bodyMorphs(await landmarks('m2')));
fs.writeFileSync(`${DIR}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log('done');
