// The classic client: pages, router, dress up studio, shop, rooms list, friends, inbox, pulse, profiles.
import * as THREE from 'three';
import { Avatar, defaultConfig, avatarPhoto, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, FACE_SLIDERS, BODY_SLIDERS, randomFace, FACES } from './avatar.js';
import { CATEGORIES, ITEMS, byId, itemsFor } from './catalog.js';
import { PUBLIC_ROOMS, MYROOM_TEMPLATES } from './rooms.js';
import { RoomSession } from './chatroom.js';
import { onUser, itemsOwned } from './backend.js';
import { APP_NAME, DAILY_CREDITS } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pic = (u, sm = false) => u?.pic ? `<img class="pic ${sm ? 'sm' : ''}" src="${u.pic}" alt="">` : `<div class="pic ph ${sm ? 'sm' : ''}">${esc((u?.name || '?')[0].toUpperCase())}</div>`;
const ago = (t) => { const d = (Date.now() - new Date(t)) / 1000; return d < 60 ? 'just now' : d < 3600 ? Math.floor(d / 60) + 'm ago' : d < 86400 ? Math.floor(d / 3600) + 'h ago' : Math.floor(d / 86400) + 'd ago'; };

// A small studio for dress up and the shop
class DressScene {
  constructor(app) { this.app = app; const s = app.scene; this.g = new THREE.Group(); s.add(this.g);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.6, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.g.add(floor);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 6, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: '#1f2330', side: THREE.BackSide, roughness: 1 })); back.position.y = 2.9; this.g.add(back);
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.g.add(key);
    const fill = new THREE.DirectionalLight('#9fc5ff', 0.8); fill.position.set(-3, 2, 2); this.g.add(fill);
    const rim = new THREE.PointLight('#ff5fc8', 6, 10); rim.position.set(-1, 2.5, -2); this.g.add(rim);
    this.g.add(new THREE.HemisphereLight('#aab6ff', '#2a2420', 0.5)); this.avatar = null; }
  async setAvatar(cfg) { if (this.avatar && this.avatar.config.gender === cfg.gender) { await this.avatar.setConfig(cfg); return this.avatar; } this.avatar?.dispose(); this.avatar = new Avatar(this.app.scene, { ...cfg }, { tagClass: 'is-me' }); this.avatar.group.rotation.y = Math.PI * 0.08; await this.avatar.load(); this.app.controls.player = null; return this.avatar; }
  focus(mode) { const c = this.app.controls; const a = this.avatar; const yaw = (a?.group.rotation.y || 0) + 0.05; if (mode === 'face' && a) { const h = new THREE.Vector3(); a.bones.get('Head')?.getWorldPosition(h); h.y += 0.07; c.setFocus(h, { dist: 0.8, yaw, pitch: 0 }); } else c.setFocus(new THREE.Vector3(0, 0.95, 0), { dist: 3.0, yaw, pitch: 0.03 }); }
  update(dt) { this.avatar?.update(dt); this.app.controls.update(dt); }
  dispose() { this.avatar?.dispose(); this.app.scene.remove(this.g); this.app.controls.setFocus(null); }
}

export class App {
  constructor(ctx) { Object.assign(this, ctx); this.controller = null; this.page = ''; onUser(() => this._chrome()); }
  start() { window.addEventListener('hashchange', () => this.route()); this.route(); setInterval(() => this.backend.user && this.backend.heartbeat(), 60000); if (this.lobby) this.lobby.onCounts = () => { if (this.page === 'rooms') this._roomCounts(); }; }
  go(hash, replace) { if (replace) location.replace(hash); else location.hash = hash; if (location.hash === hash) this.route(); }
  toast(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._x); t._x = setTimeout(() => (t.style.display = 'none'), 2800); }
  _chrome() { const u = this.backend.user; $('topbar').hidden = !u; if (!u) return; $('credits').textContent = u.credits.toLocaleString(); $('mename').textContent = u.name; const img = $('mepic'); if (u.pic) { img.src = u.pic; img.style.display = ''; } else img.style.display = 'none'; const b1 = $('b-inbox'); b1.hidden = !u.unread; b1.textContent = u.unread; const b2 = $('b-req'); b2.hidden = !u.requests; b2.textContent = u.requests; }
  _teardown() { if (this.controller) { this.controller.leave?.(); this.controller.dispose?.(); this.controller = null; } this.controls.player = null; this.controls.onTap = null; $('gl').classList.add('off'); $('page').classList.remove('full'); this.lobby?.setRoom(null); }
  async route() {
    const hash = location.hash || '#/home'; const [, page, ...rest] = hash.split('/'); const arg = rest.map(decodeURIComponent).join('/');
    const u = this.backend.user;
    if (!u && page !== 'login') { this.after = hash; return this.go('#/login', true); }
    this._teardown(); this.page = page; this._chrome();
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('sel', a.dataset.page === page));
    const P = $('page'); P.innerHTML = '';
    try {
      if (page === 'login') return this.pLogin(P);
      if (page === 'home') return this.pHome(P);
      if (page === 'rooms') return this.pRooms(P);
      if (page === 'room') return this.pRoom(P, arg);
      if (page === 'visit') return this.pRoom(P, 'visit:' + arg);
      if (page === 'invite') return this.pRoom(P, 'invite:' + arg);
      if (page === 'shop') return this.pShop(P, arg);
      if (page === 'dressup') return this.pDressUp(P);
      if (page === 'friends') return this.pFriends(P);
      if (page === 'inbox') return arg ? this.pThread(P, arg) : this.pInbox(P);
      if (page === 'pulse') return this.pPulse(P);
      if (page === 'profile') return this.pProfile(P, arg === 'me' ? u.name : arg);
      this.go('#/home', true);
    } catch (e) { console.error(e); P.innerHTML = `<div class="card">${esc(e.message)}</div>`; }
  }
  // ---------- login ----------
  pLogin(P) {
    const local = this.backend.mode === 'local';
    P.innerHTML = `<div class="grid wide" style="max-width:900px;margin:30px auto"><div class="card"><div class="logo big">${APP_NAME}</div><p class="muted">A classic 3D avatar chat. Make your avatar, dress up from the shop, sit down in a room and talk to people.</p>
      ${local ? '<p class="small" style="color:var(--gold)">Local mode: no backend is configured, so your account lives in this browser only and rooms show just you and the regulars.</p>' : ''}
      <form class="login" id="lf"><label>Avatar name<br><input id="ln" maxlength="20" placeholder="letters, numbers, underscores" autocomplete="username" required></label><label>Password<br><input id="lp" type="password" minlength="4" autocomplete="current-password" required></label><div class="row"><button class="primary" id="lsignin">Sign in</button><button type="button" id="lcreate">Create account</button></div><div class="small" id="lerr" style="color:var(--red)"></div></form></div>
      <div class="card"><h2>What you can do</h2><ul class="muted" style="padding-left:18px;line-height:1.8"><li>Sculpt a face and body, pick hair and clothes</li><li>Shop with credits, 500 free every day</li><li>Sit in public rooms, chat, dance, whisper</li><li>Decorate your own room and invite friends</li><li>Friends, inbox and a Pulse feed</li></ul></div></div>`;
    const err = $('lerr'); const run = async (fn) => { err.textContent = ''; try { await fn(); this.go(this.after && !this.after.startsWith('#/login') ? this.after : '#/home', true); this.after = null; } catch (e) { err.textContent = e.message; } };
    $('lf').onsubmit = (e) => { e.preventDefault(); run(() => this.backend.login($('ln').value.trim(), $('lp').value)); };
    $('lcreate').onclick = () => run(async () => { await this.backend.register($('ln').value.trim(), $('lp').value, defaultConfig('f')); this.after = '#/dressup'; this.toast('Welcome! Make your avatar yours.'); });
  }
  // ---------- home ----------
  async pHome(P) {
    const u = this.backend.user;
    P.innerHTML = `<div class="grid wide"><div class="grid"><div class="card avatarcard">${pic(u)}<div><h1>Hi ${esc(u.name)}</h1><div class="muted">Member since ${new Date(u.created_at).toLocaleDateString()}</div><div class="row" style="margin-top:8px"><a href="#/dressup"><button class="small">Dress up</button></a><a href="#/room/my"><button class="small">My Room</button></a><button class="small primary" id="daily" ${u.daily_available ? '' : 'disabled'}>${u.daily_available ? 'Claim ' + DAILY_CREDITS + ' free credits' : 'Daily credits claimed'}</button></div></div></div>
      <div class="card"><h2>Chat Rooms</h2><div class="grid cols" id="homerooms"></div></div>
      <div class="card"><h2>Pulse</h2><div id="homepulse" class="muted">Loading…</div><a href="#/pulse">See all</a></div></div>
      <div class="grid"><div class="card"><h2>Friends</h2><div id="homefriends" class="list muted">Loading…</div><a href="#/friends">Find people</a></div><div class="card"><h2>Inbox</h2><div class="muted">${u.unread ? u.unread + ' unread message' + (u.unread > 1 ? 's' : '') : 'No new messages'}</div><a href="#/inbox">Open inbox</a></div></div></div>`;
    $('daily').onclick = async () => { try { await this.backend.claimDaily(); this.toast('+' + DAILY_CREDITS + ' credits'); this.route(); } catch (e) { this.toast(e.message); } };
    $('homerooms').innerHTML = Object.entries(PUBLIC_ROOMS).slice(0, 3).map(([k, r]) => this._roomCard(k, r)).join('');
    this.backend.friends().then((f) => { $('homefriends').innerHTML = f.friends.length ? f.friends.slice(0, 6).map((p) => `<div class="item">${pic(p, true)}<div class="grow"><b>${esc(p.name)}</b><small><span class="online ${p.online ? 'on' : ''}"></span>${p.online ? 'online' : 'offline'}</small></div><a href="#/profile/${encodeURIComponent(p.name)}">view</a></div>`).join('') : 'No friends yet. Meet people in the rooms.'; }).catch(() => {});
    this.backend.pulseFeed().then((f) => { $('homepulse').innerHTML = f.length ? f.slice(0, 3).map((p) => `<div class="post">${pic(p, true)}<div class="body"><b>${esc(p.name)}</b> <time>${ago(p.at)}</time><div>${esc(p.body)}</div></div></div>`).join('') : 'Nothing on the Pulse yet. Be the first to post.'; }).catch(() => {});
  }
  _roomCard(k, r) { const n = this.lobby?.counts?.[k] || 0; const bg = { lounge: 'linear-gradient(135deg,#5b6b8a,#2a2f3f)', club: 'linear-gradient(135deg,#ff2d9b,#1c1b24)', rooftop: 'linear-gradient(135deg,#1b2350,#f7b267)', beach: 'linear-gradient(135deg,#f9d4a0,#1f7fb8)', cafe: 'linear-gradient(135deg,#e8dcc0,#4a3320)', my: 'linear-gradient(135deg,#3d8bff,#ff5fc8)' }[k] || '#333'; return `<a class="roomcard" href="#/room/${k}"><div class="thumb" style="background:${bg}"><span>👥 ${n}</span><i>${esc(r.cat || 'Your room')}</i></div><div class="body"><b>${esc(r.name)}</b><span class="muted">${esc(r.tagline || '')}</span></div></a>`; }
  _roomCounts() { document.querySelectorAll('.roomcard').forEach((c) => { const k = c.getAttribute('href').split('/').pop(); const s = c.querySelector('.thumb span'); if (s) s.textContent = '👥 ' + (this.lobby?.counts?.[k] || 0); }); }
  // ---------- rooms ----------
  pRooms(P) {
    P.innerHTML = `<h1>Chat Rooms</h1><p class="muted">${this.lobby?.total ? this.lobby.total + ' people online' : 'Pick a room and walk in'}</p><div class="grid cols" id="roomlist"></div>
      <h2 style="margin-top:18px">Your room and friends' rooms</h2><div class="grid cols"><a class="roomcard" href="#/room/my"><div class="thumb" style="background:linear-gradient(135deg,#3d8bff,#ff5fc8)"><i>Yours</i></div><div class="body"><b>My Room</b><span class="muted">Decorate it, invite people</span></div></a>
      <div class="card"><b>Visit someone's room</b><div class="row" style="margin-top:8px"><input id="visitname" placeholder="avatar name"><button class="small" id="visitgo">Visit</button></div><b style="display:block;margin-top:12px">Got an invite code?</b><div class="row" style="margin-top:8px"><input id="invcode" placeholder="code"><button class="small" id="invgo">Enter</button></div></div></div>`;
    $('roomlist').innerHTML = Object.entries(PUBLIC_ROOMS).map(([k, r]) => this._roomCard(k, r)).join('');
    $('visitgo').onclick = () => { const n = $('visitname').value.trim(); if (n) this.go('#/visit/' + encodeURIComponent(n)); };
    $('invgo').onclick = () => { const c = $('invcode').value.trim().replace(/.*#\/invite\//, ''); if (c) this.go('#/invite/' + encodeURIComponent(c)); };
  }
  async pRoom(P, key) {
    let def, decor = [], meta = {}, netKey = key;
    if (key in PUBLIC_ROOMS) { def = { key, ...PUBLIC_ROOMS[key] }; }
    else { let r; if (key === 'my') r = await this.backend.roomGet({ owner: this.backend.user.name }); else if (key.startsWith('visit:')) r = await this.backend.roomGet({ owner: key.slice(6) }); else if (key.startsWith('invite:')) r = await this.backend.roomGet({ invite: key.slice(7) }); else throw new Error('No such room'); const t = MYROOM_TEMPLATES[r.template] || MYROOM_TEMPLATES.studio; def = { key: r.template, ...t, name: r.name + ' · ' + r.owner }; decor = r.decor || []; meta = r; netKey = 'user:' + r.id; }
    P.classList.add('full'); $('gl').classList.remove('off');
    const owned = itemsOwned().filter((i) => i.action);
    P.innerHTML = `<div class="roompage"><div class="rhint">${esc(def.name)} · click a glowing spot to sit · drag to look around</div>
      <div class="rchat"><div class="rlog" id="rlog"></div><form class="rform" id="rform" autocomplete="off"><input id="rinput" maxlength="200" placeholder="Say something… (/w name message to whisper, *wave for actions)"><button class="primary">Send</button></form>
      <div class="racts" id="racts">${owned.map((a) => `<button data-action="${a.action}" data-once="${a.once ? 1 : 0}">${esc(a.name)}</button>`).join('')}<button id="rstand">Stand up</button><button id="rmic">🎤 Voice off</button></div></div>
      <div class="rside"><div class="row" style="justify-content:space-between"><b>${esc(def.name)}</b><button class="small" id="rleave">Leave</button></div><div id="rpeoplebox"><div class="lbl">In this room (<span id="rcount">1</span>)</div><div id="rpeople"></div></div>${meta.mine ? '<button id="rdecorate">Decorate my room</button><div id="rpalette" hidden></div>' : ''}<div class="lbl">Tips</div><div class="muted small">Blue spots are seats, pink are standing spots, gold are dance spots. Shift to run. Enter to chat.</div></div>
      <div class="joy" id="joy"><div class="knob" id="knob"></div></div></div>`;
    const session = new RoomSession({ app: this, scene: this.scene, camera: this.camera, controls: this.controls, renderer: this.renderer, backend: this.backend, net: this.net, lobby: this.lobby, el: P, toast: (m) => this.toast(m) }, { key: netKey, def, decor, meta });
    this.controller = session; await session.enter();
  }
  // ---------- shop ----------
  async pShop(P, cat) {
    cat = cat && CATEGORIES.some(([c]) => c === cat) ? cat : 'hair'; const u = this.backend.user; const g = u.avatar.gender || 'f';
    P.classList.add('full'); $('gl').classList.remove('off');
    const studio = new DressScene(this); this.controller = studio; await studio.setAvatar({ ...u.avatar, name: u.name }); studio.focus(cat === 'hair' || cat === 'accessories' ? 'face' : 'body');
    const render = (selId) => {
      const list = itemsFor(cat, g); const u = this.backend.user;
      P.innerHTML = `<div class="side"><div><div class="row" style="justify-content:space-between"><h1>Shop</h1><span class="credits">${this.backend.user.credits.toLocaleString()}</span></div><div class="tabs">${CATEGORIES.map(([c, l]) => `<button class="tab ${c === cat ? 'sel' : ''}" data-cat="${c}">${l}</button>`).join('')}</div></div>
        <div class="scroll"><div class="items">${list.map((i) => `<div class="itemcard ${i.id === selId ? 'sel' : ''} ${u.inventory.includes(i.id) ? 'owned' : ''}" data-id="${i.id}"><b>${esc(i.name)}</b>${u.inventory.includes(i.id) ? '<span class="owned">Owned</span>' : `<span class="price">${i.price ? i.price.toLocaleString() + ' cr' : 'Free'}</span>`}</div>`).join('')}</div></div>
        <div id="shopbuy" class="row"><span class="muted">Click an item to try it on</span></div></div>`;
      P.querySelectorAll('.tab').forEach((t) => (t.onclick = () => this.go('#/shop/' + t.dataset.cat, true)));
      P.querySelectorAll('.itemcard').forEach((c) => (c.onclick = () => select(byId[c.dataset.id])));
      if (selId) select(byId[selId], true);
    };
    const select = async (item, keep) => {
      if (!keep) render(item.id);
      const u = this.backend.user; const box = $('shopbuy'); const owned = u.inventory.includes(item.id);
      if (item.apply) await studio.avatar.setConfig(item.apply); if (item.toggle) await studio.avatar.setConfig({ [item.toggle]: true });
      box.innerHTML = `<b>${esc(item.name)}</b> <span class="price" style="color:var(--gold)">${owned ? 'Owned' : item.price ? item.price.toLocaleString() + ' credits' : 'Free'}</span> ${owned ? (item.apply || item.toggle ? '<button class="primary small" id="wear">Wear it</button>' : item.furniture ? '<a href="#/room/my"><button class="small">Place it in My Room</button></a>' : item.room ? '<button class="small" id="useroom">Use this room</button>' : '<span class="muted">Use it from the actions bar in any room</span>') : `<button class="primary small" id="buy" ${u.credits < item.price ? 'disabled' : ''}>Buy</button>`} <button class="small" id="gift">Gift</button>`;
      const buy = $('buy'); if (buy) buy.onclick = async () => { try { await this.backend.buy(item.id); this.toast('Bought ' + item.name); select(item); } catch (e) { this.toast(e.message); } };
      const wear = $('wear'); if (wear) wear.onclick = async () => { const cfg = { ...u.avatar, ...(item.apply || {}), ...(item.toggle ? { [item.toggle]: true } : {}) }; await this.backend.saveAvatar(cfg, avatarPhoto(this.renderer, this.scene, studio.avatar)); this.toast('You are wearing it'); };
      const useroom = $('useroom'); if (useroom) useroom.onclick = async () => { try { const r = await this.backend.roomGet({ owner: u.name }); await this.backend.roomSave({ ...r, template: item.room }); this.toast('My Room is now the ' + item.name); } catch (e) { this.toast(e.message); } };
      $('gift').onclick = async () => { const to = prompt('Gift ' + item.name + ' to which avatar name?'); if (!to) return; try { await this.backend.gift(to.trim(), item.id); this.toast('Gift sent to ' + to); } catch (e) { this.toast(e.message); } };
    };
    render(null);
  }
  // ---------- dress up ----------
  async pDressUp(P) {
    const u = this.backend.user; P.classList.add('full'); $('gl').classList.remove('off');
    const studio = new DressScene(this); this.controller = studio; let cfg = { ...defaultConfig(u.avatar.gender || 'f'), ...u.avatar, name: u.name }; await studio.setAvatar(cfg); studio.focus('body');
    let tab = 'body'; const inv = u.inventory;
    const render = () => {
      const g = cfg.gender; const own = (id) => inv.includes(id);
      const chipsOf = (items, key) => items.map((i) => { const v = i.apply[key]; const sel = cfg[key] === v; return `<button class="chip ${sel ? 'sel' : ''} ${own(i.id) ? '' : 'locked'}" data-k="${key}" data-v="${esc(v)}" data-id="${i.id}">${esc(i.name)}${own(i.id) ? '' : ' 🔒'}</button>`; }).join('');
      const sw = (label, list, key, allowNone) => `<div class="lbl">${label}</div><div class="swatches">${allowNone ? `<button class="sw none ${cfg[key] == null ? 'sel' : ''}" data-sw="${key}" data-c="">` + '</button>' : ''}${list.map((c) => `<button class="sw ${cfg[key] === c ? 'sel' : ''}" style="background:${c}" data-sw="${key}" data-c="${c}"></button>`).join('')}</div>`;
      const sliders = (group, items) => `<div class="sliders">${items.map(([k, l]) => { const v = cfg[group]?.[k] || 0; return `<div class="slider"><span>${l}</span><input type="range" min="-1" max="1" step="0.02" value="${v}" data-g="${group}" data-k="${k}"><b>${v.toFixed(2)}</b></div>`; }).join('')}</div>`;
      let body = '';
      if (tab === 'body') body = `<div class="lbl">Gender</div><div class="chips"><button class="chip ${g === 'f' ? 'sel' : ''}" data-gender="f">Female</button><button class="chip ${g === 'm' ? 'sel' : ''}" data-gender="m">Male</button></div>${sw('Skin tone', SKIN_TONES, 'skin')}<div class="lbl">Body shape</div>${sliders('body', BODY_SLIDERS)}<div class="row" style="margin-top:8px"><button class="small" id="resetbody">Reset body</button></div>`;
      if (tab === 'face') body = `<div class="lbl">Face</div><div class="chips">${FACES[g].map(([l, v]) => `<button class="chip ${cfg.head === v ? 'sel' : ''}" data-k="head" data-v="${v}" data-id="free">${l}</button>`).join('')}</div><div class="row" style="margin-top:8px"><button class="small" id="randface">Randomise face</button><button class="small" id="resetface">Reset face</button></div>${FACE_SLIDERS.map(([s, items]) => `<div class="lbl">${s}</div>${sliders('face', items)}`).join('')}`;
      if (tab === 'hair') body = `<div class="lbl">Hair</div><div class="chips">${chipsOf(itemsFor('hair', g), 'hair')}</div>${sw(cfg.hair === 'proc:cap' ? 'Cap colour' : 'Hair colour', HAIR_COLORS, 'hairColor')}${cfg.hair === 'proc:hijab' ? '<div class="muted small" style="margin-top:6px">The hijab takes your top colour.</div>' : ''}<div class="lbl">Accessories</div><div class="chips">${itemsFor('accessories', g).map((i) => `<button class="chip ${cfg[i.toggle] ? 'sel' : ''} ${own(i.id) ? '' : 'locked'}" data-toggle="${i.toggle}" data-id="${i.id}">${esc(i.name)}${own(i.id) ? '' : ' 🔒'}</button>`).join('')}</div>`;
      if (tab === 'clothes') body = `<div class="lbl">Tops</div><div class="chips">${chipsOf(itemsFor('tops', g), 'top')}</div>${sw('Top colour', OUTFIT_COLORS, 'topColor', true)}<div class="lbl">Bottoms</div><div class="chips">${chipsOf(itemsFor('bottoms', g), 'bottom')}</div>${sw('Bottom colour', OUTFIT_COLORS, 'bottomColor', true)}<div class="lbl">Shoes</div><div class="chips">${chipsOf(itemsFor('shoes', g), 'shoes')}</div>${sw('Shoe colour', OUTFIT_COLORS, 'shoesColor', true)}`;
      P.innerHTML = `<div class="side"><div><div class="row" style="justify-content:space-between"><h1>Dress Up</h1><a href="#/shop" class="small">Shop for more</a></div><div class="tabs">${[['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['clothes', 'Clothes']].map(([t, l]) => `<button class="tab ${tab === t ? 'sel' : ''}" data-tab="${t}">${l}</button>`).join('')}</div></div><div class="scroll">${body}</div><div class="row"><button class="primary" id="savelook">Save my look</button><span class="muted small">Locked items are in the shop</span></div></div>`;
      P.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { tab = t.dataset.tab; studio.focus(tab === 'face' || tab === 'hair' ? 'face' : 'body'); render(); }));
      P.querySelectorAll('[data-gender]').forEach((b) => (b.onclick = async () => { if (b.dataset.gender === g) return; cfg = { ...defaultConfig(b.dataset.gender), name: u.name, skin: cfg.skin, hairColor: cfg.hairColor, face: cfg.face, body: cfg.body }; await studio.setAvatar(cfg); studio.focus('body'); render(); }));
      P.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => { if (b.dataset.id !== 'free' && !own(b.dataset.id)) { this.toast('You do not own that yet. Find it in the shop.'); return; } cfg[b.dataset.k] = b.dataset.v; await studio.avatar.setConfig({ [b.dataset.k]: b.dataset.v }); render(); }));
      P.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => { if (!own(b.dataset.id)) { this.toast('You do not own that yet. Find it in the shop.'); return; } cfg[b.dataset.toggle] = !cfg[b.dataset.toggle]; await studio.avatar.setConfig({ [b.dataset.toggle]: cfg[b.dataset.toggle] }); render(); }));
      P.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = async () => { const v = b.dataset.c || null; cfg[b.dataset.sw] = v; await studio.avatar.setConfig({ [b.dataset.sw]: v }); render(); }));
      P.querySelectorAll('input[type=range]').forEach((r) => { r.oninput = () => { const gr = r.dataset.g, k = r.dataset.k; cfg[gr] = { ...(cfg[gr] || {}), [k]: +r.value }; r.nextElementSibling.textContent = (+r.value).toFixed(2); Object.assign(studio.avatar.config, { [gr]: cfg[gr] }); studio.avatar.applyMorphs(); }; r.onchange = () => studio.avatar.setConfig({ [r.dataset.g]: cfg[r.dataset.g] }); });
      const rf = $('randface'); if (rf) rf.onclick = async () => { cfg.face = randomFace(); await studio.avatar.setConfig({ face: cfg.face }); render(); };
      const rs = $('resetface'); if (rs) rs.onclick = async () => { cfg.face = {}; await studio.avatar.setConfig({ face: {} }); render(); };
      const rb = $('resetbody'); if (rb) rb.onclick = async () => { cfg.body = {}; await studio.avatar.setConfig({ body: {} }); render(); };
      $('savelook').onclick = async () => { try { const { name, ...avatar } = cfg; studio.focus('face'); const photo = avatarPhoto(this.renderer, this.scene, studio.avatar); await this.backend.saveAvatar(avatar, photo); this.toast('Look saved'); studio.focus(tab === 'face' || tab === 'hair' ? 'face' : 'body'); } catch (e) { this.toast(e.message); } };
    };
    render();
  }
  // ---------- friends ----------
  async pFriends(P) {
    const f = await this.backend.friends();
    const card = (p, actions) => `<div class="item">${pic(p, true)}<div class="grow"><a href="#/profile/${encodeURIComponent(p.name)}"><b>${esc(p.name)}</b></a><small><span class="online ${p.online ? 'on' : ''}"></span>${p.online ? 'online' : 'offline'}${p.bio ? ' · ' + esc(p.bio) : ''}</small></div>${actions}</div>`;
    P.innerHTML = `<h1>Friends</h1><div class="grid wide"><div class="grid"><div class="card"><h2>Your friends (${f.friends.length})</h2><div class="list" id="fl">${f.friends.length ? f.friends.map((p) => card(p, `<a href="#/inbox/${encodeURIComponent(p.name)}"><button class="small">Message</button></a> <a href="#/visit/${encodeURIComponent(p.name)}"><button class="small">Visit room</button></a> <button class="small ghost" data-remove="${esc(p.name)}">Remove</button>`)).join('') : '<div class="muted">No friends yet. Search for people below or meet them in a room.</div>'}</div></div>
      <div class="card"><h2>Requests (${f.requests.length})</h2><div class="list">${f.requests.length ? f.requests.map((p) => card(p, `<button class="small primary" data-accept="${esc(p.name)}">Accept</button> <button class="small ghost" data-remove="${esc(p.name)}">Ignore</button>`)).join('') : '<div class="muted">No requests waiting.</div>'}</div>${f.sent.length ? `<div class="lbl">Sent</div><div class="list">${f.sent.map((p) => card(p, '<span class="muted small">pending</span>')).join('')}</div>` : ''}</div></div>
      <div class="card"><h2>Find people</h2><div class="row"><input id="fq" placeholder="search by name"><button class="small" id="fgo">Search</button></div><div class="list" id="fres"></div></div></div>`;
    const act = (sel, fn) => P.querySelectorAll(sel).forEach((b) => (b.onclick = async () => { try { await fn(b); this.route(); } catch (e) { this.toast(e.message); } }));
    act('[data-accept]', (b) => this.backend.friendAccept(b.dataset.accept)); act('[data-remove]', (b) => this.backend.friendRemove(b.dataset.remove));
    const search = async () => { const res = await this.backend.search($('fq').value.trim()); $('fres').innerHTML = res.length ? res.map((p) => card(p, p.friend ? '<span class="muted small">friends</span>' : p.requested ? '<span class="muted small">requested</span>' : `<button class="small primary" data-add="${esc(p.name)}">${p.requests_me ? 'Accept' : 'Add friend'}</button>`)).join('') : '<div class="muted">Nobody found.</div>'; act('[data-add]', (b) => this.backend.friendRequest(b.dataset.add)); };
    $('fgo').onclick = search; $('fq').onkeydown = (e) => { if (e.key === 'Enter') search(); };
  }
  // ---------- inbox ----------
  async pInbox(P) {
    const t = await this.backend.inbox();
    P.innerHTML = `<h1>Inbox</h1><div class="card"><div class="row" style="margin-bottom:8px"><input id="newto" placeholder="avatar name"><button class="small" id="newgo">New message</button></div><div class="list">${t.length ? t.map((x) => `<a class="item" href="#/inbox/${encodeURIComponent(x.name)}">${pic(x, true)}<div class="grow"><b>${esc(x.name)}</b>${x.unread ? ` <span class="badge">${x.unread}</span>` : ''}<small>${esc(x.preview)}</small></div><span class="muted small">${ago(x.last)}</span></a>`).join('') : '<div class="muted">No conversations yet.</div>'}</div></div>`;
    $('newgo').onclick = () => { const n = $('newto').value.trim(); if (n) this.go('#/inbox/' + encodeURIComponent(n)); };
  }
  async pThread(P, name) {
    const msgs = await this.backend.thread(name); await this.backend.me();
    P.innerHTML = `<a href="#/inbox">← Inbox</a><h1>${esc(name)}</h1><div class="card"><div class="thread" id="thread">${msgs.length ? msgs.map((m) => `<div class="bubbleline ${m.mine ? 'mine' : ''}">${esc(m.body)}<div class="small" style="opacity:.7">${ago(m.at)}</div></div>`).join('') : '<div class="muted">Say hello.</div>'}</div><form class="row" id="tf"><input id="tbody" style="flex:1" maxlength="1000" placeholder="Write a message"><button class="primary">Send</button></form><div class="row" style="margin-top:8px"><a href="#/profile/${encodeURIComponent(name)}">View profile</a> · <a href="#/visit/${encodeURIComponent(name)}">Visit their room</a></div></div>`;
    const th = $('thread'); th.scrollTop = th.scrollHeight;
    $('tf').onsubmit = async (e) => { e.preventDefault(); try { await this.backend.sendMessage(name, $('tbody').value); this.route(); } catch (err) { this.toast(err.message); } };
  }
  // ---------- pulse ----------
  async pPulse(P) {
    const feed = await this.backend.pulseFeed();
    P.innerHTML = `<h1>Pulse</h1><div class="card"><form class="row" id="pf"><input id="pbody" style="flex:1" maxlength="500" placeholder="What's on your mind?"><button class="primary">Post</button></form></div><div class="card" style="margin-top:12px">${feed.length ? feed.map((p) => `<div class="post">${pic(p, true)}<div class="body"><a href="#/profile/${encodeURIComponent(p.name)}"><b>${esc(p.name)}</b></a> <time>${ago(p.at)}</time><div>${esc(p.body)}</div></div></div>`).join('') : '<div class="muted">Quiet for now.</div>'}</div>`;
    $('pf').onsubmit = async (e) => { e.preventDefault(); try { await this.backend.pulsePost($('pbody').value); this.route(); } catch (err) { this.toast(err.message); } };
  }
  // ---------- profile ----------
  async pProfile(P, name) {
    const me = this.backend.user; const p = await this.backend.profile(name); const mine = p.name === me.name;
    P.innerHTML = `<div class="card avatarcard" style="max-width:720px">${pic(p)}<div style="flex:1"><h1>${esc(p.name)} ${mine ? '<span class="muted small">(you)</span>' : `<span class="online ${p.online ? 'on' : ''}"></span><span class="muted small">${p.online ? 'online' : 'offline'}</span>`}</h1><div class="muted">Member since ${new Date(p.created_at).toLocaleDateString()}${p.room ? ' · Room: ' + esc(p.room.name) + (p.room.is_private ? ' (private)' : '') : ''}</div>
      ${mine ? `<form id="biof" class="row" style="margin-top:8px"><input id="bio" style="flex:1" maxlength="300" value="${esc(p.bio)}" placeholder="Say something about yourself"><button class="small">Save</button></form>` : `<p>${esc(p.bio) || '<span class="muted">No bio yet.</span>'}</p>`}
      <div class="row" style="margin-top:10px">${mine ? '<a href="#/dressup"><button class="small">Dress up</button></a><a href="#/room/my"><button class="small">My Room</button></a><button class="small" id="relogin">Log out</button>' : `${p.friend ? '<span class="muted small">Friends</span>' : p.requested ? '<span class="muted small">Request sent</span>' : `<button class="small primary" id="addf">${p.requests_me ? 'Accept friend request' : 'Add friend'}</button>`} <a href="#/inbox/${encodeURIComponent(p.name)}"><button class="small">Message</button></a> ${p.room && !p.room.is_private ? `<a href="#/visit/${encodeURIComponent(p.name)}"><button class="small">Visit room</button></a>` : ''} <button class="small" id="giftb">Send a gift</button>`}</div></div></div>`;
    const bf = $('biof'); if (bf) bf.onsubmit = async (e) => { e.preventDefault(); try { await this.backend.saveBio($('bio').value); this.toast('Saved'); } catch (err) { this.toast(err.message); } };
    const rl = $('relogin'); if (rl) rl.onclick = () => this.logout();
    const af = $('addf'); if (af) af.onclick = async () => { try { await this.backend.friendRequest(p.name); this.toast(p.requests_me ? 'You are now friends' : 'Request sent'); this.route(); } catch (e) { this.toast(e.message); } };
    const gb = $('giftb'); if (gb) gb.onclick = async () => { const list = ITEMS.filter((i) => i.price > 0 && (!i.gender || i.gender === (p.avatar?.gender || 'f'))); const pick = prompt('Which gift? Type the item name:\n' + list.map((i) => `${i.name} (${i.price})`).join('\n')); if (!pick) return; const it = list.find((i) => i.name.toLowerCase() === pick.trim().toLowerCase()); if (!it) return this.toast('No such item'); try { await this.backend.gift(p.name, it.id); this.toast('Gift sent'); } catch (e) { this.toast(e.message); } };
  }
  async logout() { await this.backend.logout(); this.go('#/login', true); }
  update(dt) { this.controller?.update?.(dt); }
}
