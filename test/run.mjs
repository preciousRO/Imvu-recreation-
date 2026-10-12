// Headless walkthrough of Loft in local mode.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user/8ce74c45-19d8-5146-9bdd-2efda729f259/scratchpad/loft';
fs.mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route('**/*', (r) => (r.request().url().startsWith('http://localhost:4174') ? r.continue() : r.abort()));
const p = await ctx.newPage(); const logs = []; await p.addInitScript(() => { try { localStorage.setItem('loft.quality', 'low'); } catch {} });
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`); }); p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const state = (fn) => p.evaluate(fn);
try {
  await p.goto('http://localhost:4174/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#lf', { timeout: 150000 }); await shot('01-login');
  await p.fill('#ln', 'Precious'); await p.fill('#lp', 'secret1'); await p.click('#lcreate'); await p.waitForSelector('.side', { timeout: 60000 }); await p.waitForTimeout(4000); await shot('02-dressup-body');
  await p.locator('.tab', { hasText: 'Face' }).click(); await p.waitForTimeout(2500); await shot('03-dressup-face');
  await p.locator('.tab', { hasText: 'Hair' }).click(); await p.waitForTimeout(800); await p.locator('.chip', { hasText: 'Box braids' }).click(); await p.waitForTimeout(600); await shot('04-dressup-hair-locked');
  await p.locator('.tab', { hasText: 'Clothes' }).click(); await p.waitForTimeout(800); await shot('05-dressup-clothes');
  await p.click('#savelook'); await p.waitForTimeout(1500);
  const u1 = await state(() => ({ pic: (window.loft.backend.user.pic || '').slice(0, 30), credits: window.loft.backend.user.credits, inv: window.loft.backend.user.inventory.length }));
  console.log('after save', JSON.stringify(u1));
  await p.goto('http://localhost:4174/#/home'); await p.waitForSelector('#daily', { timeout: 30000 }); await p.waitForTimeout(800); await shot('06-home');
  await p.click('#daily'); await p.waitForTimeout(800);
  await p.goto('http://localhost:4174/#/shop/hair'); await p.waitForSelector('.itemcard', { timeout: 30000 }); await p.waitForTimeout(3000);
  await p.locator('.itemcard', { hasText: 'Box braids' }).click(); await p.waitForTimeout(1500); await shot('07-shop-tryon');
  await p.locator('#buy').click({ timeout: 5000 }).catch(() => {}); await p.waitForSelector('#wear', { timeout: 15000 }); await p.locator('#wear').click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(1200);
  const u2 = await state(() => ({ credits: window.loft.backend.user.credits, hair: window.loft.backend.user.avatar.hair }));
  console.log('after buy+wear', JSON.stringify(u2));
  await p.goto('http://localhost:4174/#/rooms'); await p.waitForSelector('#roomlist', { timeout: 30000 }); await p.waitForTimeout(600); await shot('08-rooms');
  await p.goto('http://localhost:4174/#/room/lounge'); await p.waitForSelector('#rlog', { timeout: 60000 }); await p.waitForTimeout(6000); await shot('09-lounge');
  const seat = await state(() => { const s = window.loft.controller; const free = s.room.spots.find((x) => x.pose === 'sit' && !x.occupant); if (!free) return null; s.goingTo = free; s.controls.target = free.pos.clone(); return free.id; });
  console.log('walking to seat', seat); await p.waitForTimeout(6000);
  const seated = await state(() => { const s = window.loft.controller; return { spot: s.spot?.id, pose: s.player.pose, y: +s.player.root.position.y.toFixed(2), bots: s.bots.map((b) => [b.name, b.avatar.pose, b.avatar.loaded]) }; });
  console.log('seated', JSON.stringify(seated));
  await state(() => { const c = window.loft.controls; c.dist = 3.2; c.pitch = 0.15; c.yaw = Math.PI * 0.9; }); await p.waitForTimeout(1500); await shot('10-seated');
  await p.fill('#rinput', 'hello everybody'); await p.press('#rinput', 'Enter'); await p.waitForTimeout(1200); await shot('11-chat');
  await p.locator('#racts button', { hasText: 'Dance' }).first().click(); await p.waitForTimeout(1500); await shot('12-dance');
  } catch (e) { console.error('STEP FAIL (lounge)', e.message.split('\n')[0]); await shot('fail-lounge'); }
  try {
  await p.goto('http://localhost:4174/#/room/club'); await p.waitForSelector('#rlog', { timeout: 60000 }); await p.waitForTimeout(6000); await state(() => { const c = window.loft.controls; c.dist = 7; c.pitch = 0.35; }); await p.waitForTimeout(1200); await shot('13-club');
  await p.goto('http://localhost:4174/#/room/rooftop'); await p.waitForSelector('#rlog', { timeout: 60000 }); await p.waitForTimeout(5000); await shot('14-rooftop');
  await p.goto('http://localhost:4174/#/room/beach'); await p.waitForSelector('#rlog', { timeout: 60000 }); await p.waitForTimeout(5000); await shot('15-beach');
  } catch (e) { console.error('STEP FAIL (rooms)', e.message.split('\n')[0]); await shot('fail-rooms'); }
  try {
  await p.goto('http://localhost:4174/#/room/my'); await p.waitForSelector('#rdecorate', { timeout: 60000 }); await p.waitForTimeout(3000); await p.click('#rdecorate'); await p.waitForTimeout(500);
  await p.locator('[data-place]', { hasText: 'sofa' }).first().click(); await p.waitForTimeout(300);
  await state(() => { const s = window.loft.controller; s.decor.push({ item: 'fur_sofa', type: 'sofa', x: 0, z: -2, ry: 0 }); s.decor.push({ item: 'fur_lamp', type: 'lamp', x: 3, z: -2.5, ry: 0 }); s._rebuild(); });
  await p.waitForTimeout(1500); await p.click('#rsave'); await p.waitForTimeout(800); await shot('16-myroom-decorate');
  } catch (e) { console.error('STEP FAIL (myroom)', e.message.split('\n')[0]); await shot('fail-myroom'); }
  try {
  await p.goto('http://localhost:4174/#/pulse'); await p.waitForSelector('#pf', { timeout: 30000 }); await p.fill('#pbody', 'first post on the pulse!'); await p.press('#pbody', 'Enter'); await p.waitForTimeout(800); await shot('17-pulse');
  await p.goto('http://localhost:4174/#/friends'); await p.waitForSelector('#fq', { timeout: 30000 }); await p.waitForTimeout(500); await shot('18-friends');
  await p.goto('http://localhost:4174/#/profile/me'); await p.waitForSelector('#biof', { timeout: 30000 }); await p.waitForTimeout(500); await shot('19-profile');
  await p.goto('http://localhost:4174/#/inbox'); await p.waitForSelector('#newgo', { timeout: 30000 }); await p.waitForTimeout(500); await shot('20-inbox');
} catch (e) { console.error('TEST FAIL', e.message.split('\n')[0]); await shot('fail'); }
console.log('--- console ---'); console.log([...new Set(logs)].filter((l) => !/ERR_FAILED|THREE.Clock|PCFSoft/.test(l)).slice(0, 25).join('\n') || 'none');
await browser.close(); server.kill(); process.exit(0);
