import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const OUT = '/tmp/claude-0/-home-user/8ce74c45-19d8-5146-9bdd-2efda729f259/scratchpad/loft';
const Q = process.env.Q || 'high';
const server = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
await ctx.route('**/*', (r) => (r.request().url().startsWith('http://localhost:4175') ? r.continue() : r.abort()));
const p = await ctx.newPage(); const logs = []; await p.addInitScript((q) => { try { localStorage.setItem('loft.quality', q); } catch {} }, Q);
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text().slice(0, 200)); });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png`, timeout: 240000 });
const cam = (dist, pitch, yaw) => p.evaluate(([d, pi, y]) => { const c = window.loft.controls; c.dist = d; c.pitch = pi; if (y !== null) c.yaw = y; c.snap(); }, [dist, pitch, yaw]);
try {
  await p.goto('http://localhost:4175/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#lf', { timeout: 200000 });
  await p.fill('#ln', 'Tester'); await p.fill('#lp', 'secret1'); await p.click('#lcreate'); await p.waitForSelector('.side', { timeout: 120000 }); await p.waitForTimeout(3000);
  for (const [room, d, pi, y] of (process.env.ROOMS || 'lounge,club,beach,rooftop,cafe').split(',').map((r) => ({ lounge: ['lounge', 4.5, 0.3, 0.5], club: ['club', 7, 0.35, 0], beach: ['beach', 7, 0.25, 0.6], rooftop: ['rooftop', 7, 0.3, 0], cafe: ['cafe', 6, 0.35, 0] })[r])) {
    await p.goto(`http://localhost:4175/#/room/${room}`); await p.waitForSelector('#rlog', { timeout: 200000 }); await p.waitForTimeout(5000);
    if (room === 'lounge') { await p.evaluate(() => { const s = window.loft.controller; const free = s.room.spots.find((x) => x.pose === 'sit' && !x.occupant); s.player.group.position.copy(free.pos).add({ x: 0.15, y: 0, z: 0.15 }); s.goingTo = free; s.controls.target = free.pos.clone(); }); await p.waitForTimeout(4000); const st = await p.evaluate(() => ({ spot: window.loft.controller.spot?.id, pose: window.loft.controller.player.pose })); console.log('seat', JSON.stringify(st)); }
    await cam(d, pi, y); await p.waitForTimeout(2500); await shot(`room-${Q}-${room}`);
  }
} catch (e) { console.error('FAIL', e.message.split('\n')[0]); }
console.log('console:', [...new Set(logs)].join(' | ') || 'none');
await browser.close(); server.kill(); process.exit(0);
