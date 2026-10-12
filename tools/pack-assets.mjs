// Packs the GLB models of public/avatars, public/anims and public/props into dist/data/<category>.json (base64),
// for hosts that only serve data file types. Run after `VITE_ASSET_PACK=1 vite build`.
import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync('dist/data', { recursive: true });
for (const cat of ['avatars', 'anims']) {
  const pack = {};
  for (const f of fs.readdirSync(`public/${cat}`)) if (f.endsWith('.glb')) pack[`${cat}/${f}`] = fs.readFileSync(`public/${cat}/${f}`).toString('base64');
  const out = `dist/data/${cat}.json`; fs.writeFileSync(out, JSON.stringify(pack));
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', Object.keys(pack).length, 'models');
}
