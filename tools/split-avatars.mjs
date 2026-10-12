// Splits Ready Player Me avatar GLBs into swappable part GLBs that share one skeleton layout.
// Each part keeps the full armature so it can be rebound to the base body's bones at runtime.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const S = '/tmp/claude-0/-home-user/8ce74c45-19d8-5146-9bdd-2efda729f259/scratchpad';
const OUT = path.resolve('public/avatars');
const SOURCES = [
  { id: 'm1', gender: 'm', file: `${S}/models/readyplayer.me.glb` },
  { id: 'm2', gender: 'm', file: `${S}/w_r3f-lipsync-tutorial/public/models/646d9dcdc8a5f5bddbfac913.glb` },
  { id: 'f1', gender: 'f', file: `${S}/w_r3f-virtual-girlfriend-frontend/public/models/64f1a714fe61576b46f27ca2.glb` },
];
// part name -> node names that belong to it
const PARTS = {
  body: ['Wolf3D_Body'],
  head: ['Wolf3D_Head', 'EyeLeft', 'EyeRight', 'Wolf3D_Teeth'],
  hair: ['Wolf3D_Hair'],
  top: ['Wolf3D_Outfit_Top'],
  bottom: ['Wolf3D_Outfit_Bottom'],
  shoes: ['Wolf3D_Outfit_Footwear'],
  beard: ['Wolf3D_Beard'],
  headwear: ['Wolf3D_Headwear'],
  glasses: ['Wolf3D_Glasses'],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest = { sources: {}, parts: [] };

async function meanColor(texture) {
  const img = sharp(Buffer.from(texture.getImage()));
  const { data, info } = await img.resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [r / n / 255, g / n / 255, b / n / 255].map(v => +v.toFixed(4));
}

for (const src of SOURCES) {
  const base = await io.read(src.file);
  const nodeNames = base.getRoot().listNodes().filter(n => n.getMesh()).map(n => n.getName());
  manifest.sources[src.id] = { gender: src.gender, meshNodes: nodeNames, ref: {} };
  // reference colours for recolouring (mean of base colour textures)
  for (const mat of base.getRoot().listMaterials()) {
    const t = mat.getBaseColorTexture();
    if (t) manifest.sources[src.id].ref[mat.getName()] = await meanColor(t);
  }
  for (const [part, keep] of Object.entries(PARTS)) {
    if (!keep.some(k => nodeNames.includes(k))) continue;
    const doc = await io.read(src.file);
    for (const node of doc.getRoot().listNodes()) {
      if (node.getMesh() && !keep.includes(node.getName())) node.setMesh(null);
    }
    // drop morph targets we never animate to keep files small (keep mouth/jaw/viseme/eye ones on head)
    for (const mesh of doc.getRoot().listMeshes()) {
      const names = mesh.getExtras()?.targetNames;
      if (!names) continue;
      const keepIdx = names.map((n, i) => (/mouthOpen|mouthSmile|jawOpen|viseme_aa|viseme_O|eyeBlink|browInnerUp/.test(n) ? i : -1)).filter(i => i >= 0);
      if (keepIdx.length === names.length) continue;
      for (const prim of mesh.listPrimitives()) {
        const targets = prim.listTargets();
        targets.forEach((t, i) => { if (!keepIdx.includes(i)) { prim.removeTarget(t); t.dispose(); } });
      }
      const w = mesh.getWeights();
      mesh.setWeights(keepIdx.map(i => (w && w[i]) || 0));
      mesh.setExtras({ ...mesh.getExtras(), targetNames: keepIdx.map(i => names[i]) });
    }
    await doc.transform(
      dedup(),
      prune({ keepLeaves: true, keepAttributes: false }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [1024, 1024] }),
    );
    const name = `${src.id}_${part}.glb`;
    await io.write(path.join(OUT, name), doc);
    const bytes = fs.statSync(path.join(OUT, name)).size;
    const morphs = doc.getRoot().listMeshes().map(m => m.getExtras()?.targetNames || []).flat();
    manifest.parts.push({ id: `${src.id}_${part}`, src: src.id, part, gender: src.gender, file: `avatars/${name}`, bytes, morphs: [...new Set(morphs)] });
    console.log(name, (bytes / 1024).toFixed(0) + 'KB', morphs.length ? 'morphs:' + [...new Set(morphs)].join(',') : '');
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('manifest written');
