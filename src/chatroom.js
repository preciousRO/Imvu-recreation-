// A chat room session: the 3D room, your avatar, seats and poses, the people in it, chat and actions, decorating.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { buildRoom, FURNITURE } from './rooms.js';
import { byId } from './catalog.js';
import { itemsOwned } from './backend.js';

const BOTS = {
  lounge: [{ name: 'Kemi', cfg: { gender: 'f', head: 'f1_head', hair: 'proc:braids', hairColor: '#2b1a10', skin: '#8a5a3a', top: 'f1_top', topColor: '#e84393', bottom: 'f1_bottom', bottomColor: '#111111', shoes: 'f1_shoes', face: { lipFullness: 0.5, eyeSize: 0.3 } }, lines: ['anybody watching the match tonight?', 'this sofa is the best seat in the house', 'brb getting zobo'] }, { name: 'Dayo', cfg: { gender: 'm', head: 'm2_head', hair: 'proc:fade', skin: '#4e2c1a', top: 'm2_top', topColor: '#2c3e50', bottom: 'm2_bottom', bottomColor: '#111111', shoes: 'm2_shoes', glasses: true, face: { jawWidth: 0.4 } }, lines: ['who has the aux?', 'lol', 'welcome welcome'] }],
  club: [{ name: 'DJ_Femi', cfg: { gender: 'm', head: 'm1_head', hair: 'proc:locs', skin: '#36200f', top: 'm2_top', topColor: '#111111', bottom: 'm2_bottom', bottomColor: '#111111', shoes: 'm2_shoes', shoesColor: '#ffffff', beard: true }, lines: ['make some noiseeee', 'this next one is for the real ones', 'hands up!'], spot: 'dj' }, { name: 'Lola', cfg: { gender: 'f', head: 'f1_head', hair: 'proc:afro', skin: '#6b4027', top: 'f1_top', topColor: '#f1c40f', bottom: 'f1_bottom', bottomColor: '#111111', shoes: 'f1_shoes', shoesColor: '#f1c40f', face: { cheekbones: 0.5 } }, lines: ['this song!!!', 'come and dance jare', 'the vibes are vibing'], spot: 'dance' }],
  rooftop: [{ name: 'Ada', cfg: { gender: 'f', head: 'f1_head', hair: 'proc:bun', skin: '#a9764f', top: 'f1_top', topColor: '#ffffff', bottom: 'f1_bottom', bottomColor: '#2c3e50', shoes: 'f1_shoes', face: { noseLength: 0.3 } }, lines: ['the view tonight though', 'abuja lights never miss', 'who else cannot sleep'] }],
  beach: [{ name: 'Tobi', cfg: { gender: 'm', head: 'm2_head', hair: 'proc:low', skin: '#8a5a3a', top: 'm2_top', topColor: '#00a8cc', bottom: 'm2_bottom', bottomColor: '#ffffff', shoes: 'm2_shoes', body: { muscle: 0.5 } }, lines: ['water is warm today', 'sun is sunning', 'anyone for volleyball'] }],
  cafe: [{ name: 'Zara', cfg: { gender: 'f', head: 'f1_head', hair: 'proc:hijab', skin: '#c99a73', top: 'f1_top', topColor: '#27ae60', bottom: 'f1_bottom', bottomColor: '#111111', shoes: 'f1_shoes' }, lines: ['the croissants here are elite', 'reading and vibing', 'quiet please, exams'] }],
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class RoomSession {
  constructor(ctx, { key, def, decor = [], meta = {} }) {
    Object.assign(this, ctx); // scene, camera, controls, renderer, backend, net, lobby, el (page root), toast, app
    this.key = key; this.def = def; this.decor = decor.map((d) => ({ ...d })); this.meta = meta; this.bots = []; this.spot = null; this.goingTo = null; this.decorating = false; this.selected = null; this.placing = null; this.t = 0; this.dirty = false;
  }
  async enter() {
    const u = this.backend.user;
    this.room = buildRoom(this.scene, this.def, this.decor, { renderer: this.renderer, defaultEnv: this.app.defaultEnv });
    this.controls.room = { colliders: this.room.colliders, bounds: this.room.bounds };
    this.player = new Avatar(this.scene, { ...u.avatar, name: u.name }, { tagClass: 'is-me' });
    this.player.group.position.copy(this.room.entrance); this.player.group.rotation.y = Math.PI; await this.player.load();
    this.controls.player = this.player; this.controls.yaw = 0; this.controls.pitch = 0.32; this.controls.dist = 5; this.controls.enabled = true; this.controls.snap();
    this.controls.onTap = (ray) => this._tap(ray); this.controls.onMove = () => this._standUp(); this.controls.onArrive = () => this._arrived();
    this._bindUi();
    // regulars (bots) in public rooms
    if (!this.meta.mine && BOTS[this.key]) for (const b of BOTS[this.key]) this._addBot(b);
    // network
    const getState = () => ({ p: [this.player.group.position.x, 0, this.player.group.position.z], r: this.player.group.rotation.y, a: this.player.loopName || 'idle', spot: this.spot?.id || null, pose: this.spot?.pose || null, h: this.spot?.h || 0 });
    const ok = this.net.join(this.key, { name: u.name, cfg: u.avatar }, getState, {
      onStatus: (s) => this._sys(s === 'connected' ? 'Connected to the room.' : 'Room chat is offline. You are here alone with the regulars.'),
      onChat: (m) => this._log(m.name, m.text, m.whisper ? 'whisper' : ''), onPeople: () => this._people(),
      onJoin: (r) => this._sys(r.name + ' walked in'), onLeave: (r) => { this._sys(r.name + ' left'); for (const s of this.room.spots) if (s.occupant === 'net:' + r.id) s.occupant = null; },
      onSpawn: (r) => this._people(), onRemoteState: (r) => this._remoteState(r),
    });
    if (!ok) this._sys(this.backend.mode === 'local' ? 'Local mode: only you and the regulars are here. Connect a backend to meet real people.' : 'Connecting…');
    this.lobby?.setRoom(this.key);
    this._people();
  }
  _addBot(b) {
    const av = new Avatar(this.scene, { ...b.cfg, name: b.name }, { tagClass: 'is-npc' });
    const bot = { name: b.name, avatar: av, lines: b.lines, next: 20 + Math.random() * 40, want: b.spot };
    av.load().then(() => { const s = this._freeSpot(b.spot === 'dj' ? 'dj' : b.spot === 'dance' ? 'dance' : 'sit'); if (s) this._occupy(s, 'bot:' + b.name, av); else av.group.position.copy(this.room.entrance).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, -1)); this._people(); });
    this.bots.push(bot);
  }
  _freeSpot(pose) { const list = this.room.spots.filter((s) => !s.occupant && s.pose === pose); return list[Math.floor(Math.random() * list.length)] || null; }
  _occupy(s, who, av) {
    for (const o of this.room.spots) if (o.occupant === who) o.occupant = null;
    s.occupant = who; av.group.position.copy(s.pos); av.group.rotation.y = s.ry; av.setMoving(0); av.setPose(s.pose === 'sit' ? 'sit' : s.pose === 'dance' ? 'dance' : s.pose === 'dj' ? 'dj' : 'stand', s.h);
    if (s.marker) s.marker.visible = false;
  }
  _release(who) { for (const s of this.room.spots) if (s.occupant === who) { s.occupant = null; if (s.marker) s.marker.visible = true; } }
  _remoteState(r) {
    const who = 'net:' + r.id;
    if (r.spot) { const s = this.room.spots.find((x) => x.id === r.spot); if (s && s.occupant !== who) { this._occupy(s, who, r.avatar); } }
    else { const had = this.room.spots.some((x) => x.occupant === who); if (had) { this._release(who); r.avatar.setPose(null); } }
  }
  // ---- seats ----
  _tap(ray) {
    if (this.decorating) return this._decorTap(ray);
    const hits = ray.intersectObjects(this.room.spots.filter((s) => s.marker.visible).map((s) => s.marker), false);
    if (hits.length) { const s = hits[0].object.userData.spot; if (s.occupant && s.occupant !== 'me') { this.toast('Someone is already there'); return true; } this._standUp(); this.goingTo = s; this.controls.target = s.pos.clone(); return true; }
    return false;
  }
  _arrived() { if (this.goingTo) { const s = this.goingTo; this.goingTo = null; if (s.occupant && s.occupant !== 'me') return; this._occupy(s, 'me', this.player); this.spot = s; this.player.seatLock = s.pose === 'sit'; } }
  _standUp() { if (!this.spot) return; this._release('me'); this.spot = null; this.player.seatLock = false; this.player.setPose(null); }
  // ---- chat and actions ----
  _bindUi() {
    const el = this.el; this.logEl = el.querySelector('#rlog'); const form = el.querySelector('#rform'); const inp = el.querySelector('#rinput');
    form.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); inp.value = ''; if (!v) return; this.say(v); };
    el.querySelector('#racts').onclick = (e) => { const b = e.target.closest('[data-action]'); if (!b) return; this.action(b.dataset.action, b.dataset.once === '1'); };
    el.querySelector('#rleave').onclick = () => this.app.go('#/rooms');
    const mic = el.querySelector('#rmic'); if (mic) mic.onclick = async () => { try { const on = await this.net.toggleVoice(); mic.classList.toggle('on', on); mic.textContent = on ? '🎤 Voice on' : '🎤 Voice off'; } catch (e) { this.toast(e.message); } };
    el.querySelector('#rstand')?.addEventListener('click', () => this._standUp());
    const dec = el.querySelector('#rdecorate'); if (dec) dec.onclick = () => this._toggleDecor();
    // mobile joystick
    const joy = el.querySelector('#joy'), knob = el.querySelector('#knob'); if (joy) { let id = null; const R = 40; const set = (dx, dy) => { const d = Math.hypot(dx, dy); const k = d > R ? R / d : 1; dx *= k; dy *= k; knob.style.transform = `translate(${dx}px,${dy}px)`; this.controls.joy.x = dx / R; this.controls.joy.y = dy / R; }; joy.onpointerdown = (e) => { id = e.pointerId; joy.setPointerCapture(id); this.controls.joy.active = true; const r = joy.getBoundingClientRect(); set(e.clientX - r.left - 55, e.clientY - r.top - 55); }; joy.onpointermove = (e) => { if (e.pointerId !== id) return; const r = joy.getBoundingClientRect(); set(e.clientX - r.left - 55, e.clientY - r.top - 55); }; const end = (e) => { if (e.pointerId !== id) return; id = null; this.controls.joy.active = false; this.controls.joy.x = this.controls.joy.y = 0; knob.style.transform = ''; }; joy.onpointerup = end; joy.onpointercancel = end; }
    this._sys('You walked into ' + this.def.name + '. Click a glowing spot to sit or stand there.');
  }
  say(text) {
    const m = text.match(/^\/w(?:hisper)?\s+(\S+)\s+(.+)/i); if (m) { this.net.sendChat(m[2], m[1]); this._log('You → ' + m[1], m[2], 'whisper'); return; }
    if (text.startsWith('*')) { const name = text.slice(1).trim().toLowerCase(); const act = itemsOwned().find((i) => i.action && i.name.toLowerCase().includes(name)); if (act) { this.action(act.action, !!act.once); return; } }
    this._log(this.backend.user.name, text); this.player.say(text); this.net.sendChat(text);
    for (const b of this.bots) if (Math.random() < 0.25 && b.avatar.loaded) setTimeout(() => this._botSay(b), 1500 + Math.random() * 2500);
  }
  action(name, once) { if (this.spot?.pose === 'sit') this._standUp(); if (once) this.player.play(name, { once: true }); else { if (this.player.loopName === name) this.player.play('idle'); else this.player.play(name); } this.net.sendAnim(name); }
  _log(name, text, cls = '') { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`; this.logEl.appendChild(d); while (this.logEl.children.length > 150) this.logEl.firstChild.remove(); this.logEl.scrollTop = this.logEl.scrollHeight; }
  _sys(text) { const d = document.createElement('div'); d.className = 'msg sys'; d.textContent = text; this.logEl?.appendChild(d); if (this.logEl) this.logEl.scrollTop = this.logEl.scrollHeight; }
  _botSay(b) { const line = b.lines[Math.floor(Math.random() * b.lines.length)]; b.avatar.say(line); this._log(b.name, line); }
  _people() {
    const list = this.el.querySelector('#rpeople'); if (!list) return; const me = this.backend.user;
    const rows = [{ name: me.name, me: true }, ...this.net.people().map((p) => ({ name: p.name })), ...this.bots.map((b) => ({ name: b.name, bot: true }))];
    list.innerHTML = rows.map((r) => `<div class="person"><span class="dot ${r.bot ? 'bot' : ''}"></span><b>${esc(r.name)}</b>${r.me ? ' <small>(you)</small>' : r.bot ? ' <small>regular</small>' : ` <a href="#/profile/${encodeURIComponent(r.name)}">profile</a> <a href="#" data-w="${esc(r.name)}">whisper</a>`}</div>`).join('');
    list.querySelectorAll('[data-w]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const inp = this.el.querySelector('#rinput'); inp.value = '/w ' + a.dataset.w + ' '; inp.focus(); }));
    const n = this.el.querySelector('#rcount'); if (n) n.textContent = rows.length;
  }
  // ---- decorating (own room) ----
  _toggleDecor() { this.decorating = !this.decorating; this.el.querySelector('#rdecorate').classList.toggle('on', this.decorating); this.el.querySelector('#rpalette').hidden = !this.decorating; this.el.querySelector('#rpeoplebox').hidden = this.decorating; if (this.decorating) this._palette(); else { this.selected = null; this.placing = null; this._highlight(null); } }
  _palette() {
    const box = this.el.querySelector('#rpalette'); const items = itemsOwned().filter((i) => i.furniture); const rooms = itemsOwned().filter((i) => i.room);
    box.innerHTML = `<div class="lbl">Place furniture (click one, then click the floor)</div><div class="chips">${items.map((i) => `<button class="chip" data-place="${i.id}">${esc(i.name)}</button>`).join('')}</div>
      <div class="lbl">Selected</div><div class="row" id="rsel"><button class="small" id="rrot">Rotate</button><button class="small" id="rremove">Remove</button><span class="muted" id="rselname">Click a placed item</span></div>
      <div class="lbl">Room</div><div class="row"><input id="rname" maxlength="40" value="${esc(this.meta.name || 'My Room')}" placeholder="Room name"><label class="muted"><input type="checkbox" id="rpriv" ${this.meta.is_private ? 'checked' : ''}> Private (invite only)</label></div>
      <div class="row"><select id="rtemplate">${rooms.map((r) => `<option value="${r.room}" ${this.meta.template === r.room ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select><button class="primary small" id="rsave">Save room</button></div>
      ${this.meta.invite ? `<div class="muted small">Invite link: <code>${location.origin + location.pathname}#/invite/${this.meta.invite}</code></div>` : ''}`;
    box.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => { this.placing = byId[b.dataset.place]; this.selected = null; box.querySelectorAll('[data-place]').forEach((x) => x.classList.toggle('sel', x === b)); this.toast('Now click the floor to place ' + this.placing.name); }));
    box.querySelector('#rrot').onclick = () => { if (!this.selected) return; const d = this.decor[this.selected.userData.decorIndex]; d.ry = ((d.ry || 0) + 45) % 360; this._rebuild(); };
    box.querySelector('#rremove').onclick = () => { if (!this.selected) return; this.decor.splice(this.selected.userData.decorIndex, 1); this.selected = null; this._rebuild(); };
    box.querySelector('#rsave').onclick = async () => { try { const r = await this.backend.roomSave({ name: box.querySelector('#rname').value, template: box.querySelector('#rtemplate').value, is_private: box.querySelector('#rpriv').checked, decor: this.decor }); this.meta = { ...this.meta, ...r }; this.toast('Room saved'); if (r.template !== this.def.key) this.app.go('#/room/my', true); } catch (e) { this.toast(e.message); } };
  }
  _decorTap(ray) {
    if (this.placing) { const p = new THREE.Vector3(); if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) { const b = this.room.bounds; this.decor.push({ item: this.placing.id, type: this.placing.furniture, x: +THREE.MathUtils.clamp(p.x, b.x1, b.x2).toFixed(2), z: +THREE.MathUtils.clamp(p.z, b.z1, b.z2).toFixed(2), ry: 0 }); this._rebuild(); } return true; }
    const hits = ray.intersectObjects(this.room.placed.filter((o) => o.userData.decorIndex !== undefined), true);
    if (hits.length) { let o = hits[0].object; while (o && o.userData.decorIndex === undefined) o = o.parent; this.selected = o; this._highlight(o); const n = this.el.querySelector('#rselname'); if (n) n.textContent = FURNITURE[o.userData.type]?.name || o.userData.type; return true; }
    return false;
  }
  _highlight(o) { this.room.placed.forEach((p) => p.traverse((m) => { if (m.isMesh && m.material?.emissive) { m.material.emissive.setHex(p === o ? 0x3366ff : (m.userData.baseEmissive ?? 0)); } })); }
  _rebuild() { const pos = this.player.group.position.clone(); this._standUp(); this.room.dispose(); this.room = buildRoom(this.scene, this.def, this.decor, { renderer: this.renderer, defaultEnv: this.app.defaultEnv }); this.controls.room = { colliders: this.room.colliders, bounds: this.room.bounds }; this.player.group.position.copy(pos); this.selected = null; this.placing = null; this.el.querySelectorAll('[data-place]').forEach((x) => x.classList.remove('sel')); }
  // ---- loop ----
  update(dt) {
    this.t += dt;
    if (this.player?.loaded) { const walking = this.controls.update(dt); if (walking && this.spot && this.spot.pose !== 'sit') this._standUp(); this.player.update(dt); }
    for (const b of this.bots) { if (!b.avatar.loaded) continue; b.avatar.update(dt); b.next -= dt; if (b.next <= 0) { b.next = 35 + Math.random() * 60; if (Math.random() < 0.6) this._botSay(b); else if (!b.avatar.pose || b.avatar.pose === 'stand') b.avatar.play('emote' + (1 + Math.floor(Math.random() * 4)), { once: true }); } }
    this.net.update(dt); this.room.update(dt);
    for (const s of this.room.spots) if (s.marker.visible) s.marker.material.opacity = 0.35 + 0.2 * Math.sin(this.t * 3 + s.pos.x);
    if (this.room.sun) { this.room.sun.target.position.copy(this.player.group.position); }
  }
  focusPoint() { const h = new THREE.Vector3(); this.player?.bones.get('Head')?.getWorldPosition(h); return this.player ? h : null; }
  leave() { this.net.leave(); this.lobby?.setRoom(null); for (const b of this.bots) b.avatar.dispose(); this.player?.dispose(); this.room?.dispose(); this.controls.player = null; this.controls.onTap = null; this.controls.onMove = null; this.controls.onArrive = null; }
}
