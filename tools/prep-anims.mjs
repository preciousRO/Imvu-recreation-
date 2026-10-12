// Copies a curated set of Ready Player Me animations into public/anims, renaming clips and
// stripping forward root motion from locomotion clips so the game moves the avatar itself.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune } from '@gltf-transform/functions';
import fs from 'node:fs';
const A = '/tmp/claude-0/-home-user/8ce74c45-19d8-5146-9bdd-2efda729f259/scratchpad/anim';
const SET = {
  m: { idle: 'masculine/glb/idle/M_Standing_Idle_001', idle2: 'masculine/glb/idle/M_Standing_Idle_Variations_002', walk: 'masculine/glb/locomotion/M_Walk_001', run: 'masculine/glb/locomotion/M_Run_001', jump: 'masculine/glb/locomotion/M_Walk_Jump_001', dance: 'masculine/glb/dance/M_Dances_001', dance2: 'masculine/glb/dance/M_Dances_004', dance3: 'masculine/glb/dance/M_Dances_006', talk: 'masculine/glb/expression/M_Talking_Variations_001', talk2: 'masculine/glb/expression/M_Talking_Variations_005', emote1: 'masculine/glb/expression/M_Standing_Expressions_001', emote2: 'masculine/glb/expression/M_Standing_Expressions_002', emote3: 'masculine/glb/expression/M_Standing_Expressions_004', emote4: 'masculine/glb/expression/M_Standing_Expressions_007' },
  f: { idle: 'feminine/glb/idle/F_Standing_Idle_001', idle2: 'feminine/glb/idle/F_Standing_Idle_Variations_002', walk: 'feminine/glb/locomotion/F_Walk_002', run: 'feminine/glb/locomotion/F_Run_001', jump: 'feminine/glb/locomotion/F_Walk_Jump_001', dance: 'feminine/glb/dance/F_Dances_001', dance2: 'feminine/glb/dance/F_Dances_004', dance3: 'feminine/glb/dance/F_Dances_006', talk: 'feminine/glb/expression/F_Talking_Variations_001', talk2: 'feminine/glb/expression/F_Talking_Variations_003', emote1: 'feminine/glb/expression/M_Standing_Expressions_001', emote2: 'feminine/glb/expression/M_Standing_Expressions_002', emote3: 'feminine/glb/expression/M_Standing_Expressions_004', emote4: 'feminine/glb/expression/M_Standing_Expressions_007' },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const index = {};
for (const [g, clips] of Object.entries(SET)) {
  index[g] = {};
  for (const [name, rel] of Object.entries(clips)) {
    const doc = await io.read(`${A}/${rel}.glb`);
    const anim = doc.getRoot().listAnimations()[0];
    anim.setName(name);
    let speed = 0;
    for (const ch of anim.listChannels()) {
      if (ch.getTargetNode()?.getName() === 'Hips' && ch.getTargetPath() === 'translation') {
        const out = ch.getSampler().getOutput(); const inp = ch.getSampler().getInput();
        const arr = out.getArray().slice(); const n = out.getCount();
        const z0 = arr[2], z1 = arr[(n - 1) * 3 + 2]; const dur = inp.getMax([0])[0];
        if (/walk|run|jump/.test(name)) { speed = (z1 - z0) / dur; for (let i = 0; i < n; i++) { arr[i * 3 + 2] = z0; arr[i * 3] = arr[0]; } out.setArray(arr); }
      }
    }
    await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }));
    const out = `public/anims/${g}_${name}.glb`;
    await io.write(out, doc);
    index[g][name] = { file: `anims/${g}_${name}.glb`, speed: +speed.toFixed(3) };
    console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB', speed ? 'speed ' + speed.toFixed(2) + ' m/s' : '');
  }
}
fs.writeFileSync('public/anims/index.json', JSON.stringify(index, null, 1));
