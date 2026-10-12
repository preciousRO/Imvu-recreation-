import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const OUT = '/tmp/claude-0/-home-user/8ce74c45-19d8-5146-9bdd-2efda729f259/scratchpad/loft';
const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
await ctx.route('**/*', (r) => (r.request().url().startsWith('http://localhost:4176') ? r.continue() : r.abort()));
const p = await ctx.newPage(); const logs = []; await p.addInitScript(() => { try { localStorage.setItem('loft.quality', 'high'); localStorage.removeItem('loft.local'); localStorage.removeItem('loft.token'); } catch {} });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text().slice(0, 300)); });
const shot = (n, clip) => p.screenshot({ path: `${OUT}/${n}.png`, timeout: 240000, clip });
const tab = async (t) => { await p.locator('.tab', { hasText: t }).click(); await p.waitForTimeout(4000); };
try {
  await p.goto('http://localhost:4176/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#lf', { timeout: 200000 });
  await p.fill('#ln', 'Looks'); await p.fill('#lp', 'secret1'); await p.click('#lcreate'); await p.waitForSelector('.side', { timeout: 120000 }); await p.waitForTimeout(5000);
  await shot('look-f-body'); await tab('Makeup'); await shot('look-f-face', { x: 150, y: 60, width: 560, height: 560 });
  await tab('Body'); await p.locator('.chip').getByText('Male', { exact: true }).click(); await p.waitForTimeout(6000); await shot('look-m-body');
  await tab('Face'); await shot('look-m-face', { x: 150, y: 60, width: 560, height: 560 });
  await p.click('#savelook'); await p.waitForTimeout(2000);
  for (const [room, d, pi, y] of []) { await p.goto(`http://localhost:4176/#/room/${room}`); await p.waitForSelector('#rlog', { timeout: 200000 }); await p.waitForTimeout(6000); await p.evaluate(([d, pi, y]) => { const c = window.loft.controls; c.dist = d; c.pitch = pi; c.yaw = y; c.snap(); }, [d, pi, y]); await p.waitForTimeout(2500); await shot(`room-high-${room}`); }
} catch (e) { console.error('FAIL', e.message.split('\n')[0]); }
console.log('console:', [...new Set(logs)].join(' | ') || 'none');
await browser.close(); server.kill(); process.exit(0);
