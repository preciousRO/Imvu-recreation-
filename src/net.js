// Room multiplayer over Supabase Realtime: presence per room, broadcast for movement, seats, chat and actions.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
const SEND_HZ = 8, VOICE_RANGE = 14;

export class RoomNet {
  constructor(scene, backend) { this.scene = scene; this.backend = backend; this.id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8); this.remotes = new Map(); this.channel = null; this.connected = false; this.acc = 0; this.lastSent = null; this.voice = { on: false, stream: null, peers: new Map() }; this.handlers = {}; }
  join(key, meta, getState, handlers = {}) {
    this.leave(); this.meta = meta; this.getState = getState; this.handlers = handlers;
    const ch = this.backend.channel('room:' + key, { presence: { key: this.id }, broadcast: { self: false, ack: false } });
    if (!ch) { this.connected = false; return false; }
    this.channel = ch;
    ch.on('presence', { event: 'sync' }, () => this._sync()).on('presence', { event: 'leave' }, ({ key }) => this._leave(key))
      .on('broadcast', { event: 'move' }, ({ payload }) => this._move(payload)).on('broadcast', { event: 'chat' }, ({ payload }) => this._chat(payload))
      .on('broadcast', { event: 'anim' }, ({ payload }) => { const r = this.remotes.get(payload.id); if (r?.avatar) { if (/dance/.test(payload.name)) r.avatar.play(payload.name); else r.avatar.play(payload.name, { once: true }); } })
      .on('broadcast', { event: 'cfg' }, ({ payload }) => { const r = this.remotes.get(payload.id); if (r?.avatar) { r.name = payload.cfg.name || r.name; if (payload.cfg.gender !== r.avatar.config.gender) { const old = r.avatar; r.avatar = null; old.dispose(); this._spawn(r, payload.cfg); } else r.avatar.setConfig(payload.cfg); } })
      .on('broadcast', { event: 'rtc' }, ({ payload }) => this._rtc(payload))
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') { this.connected = true; await this._track(); this.handlers.onStatus?.('connected'); } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { this.connected = false; this.handlers.onStatus?.('offline'); } });
    return true;
  }
  async _track() { if (!this.channel) return; const s = this.getState(); await this.channel.track({ name: this.meta.name, cfg: this.meta.cfg, p: s.p, r: s.r, spot: s.spot, voice: this.voice.on, t: Date.now() }).catch(() => {}); }
  leave() { if (this.channel) { try { this.backend.sb?.removeChannel(this.channel); } catch {} this.channel = null; } for (const k of [...this.remotes.keys()]) this._leave(k, true); this.connected = false; }
  _sync() {
    const state = this.channel.presenceState(); const ids = new Set();
    for (const [key, metas] of Object.entries(state)) { if (key === this.id) continue; ids.add(key); const m = metas[metas.length - 1]; if (!this.remotes.has(key)) this._join(key, m); else { const r = this.remotes.get(key); r.name = m.name; if (m.voice && !r.voice) { r.voice = true; this._maybeCall(key); } } }
    for (const key of [...this.remotes.keys()]) if (!ids.has(key)) this._leave(key);
    this.handlers.onPeople?.(this.people());
  }
  people() { return [...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, cfg: r.cfg })); }
  _join(key, m) { const r = { id: key, name: m.name || 'Guest', cfg: m.cfg || {}, avatar: null, target: new THREE.Vector3(...(m.p || [0, 0, 0])), rot: m.r || 0, anim: 'idle', spot: m.spot || null, pose: null, voice: !!m.voice }; this.remotes.set(key, r); this._spawn(r, r.cfg); this.handlers.onJoin?.(r); }
  _spawn(r, cfg) { const av = new Avatar(this.scene, { ...cfg, name: r.name }, { tagClass: 'is-remote' }); av.group.position.copy(r.target); av.group.rotation.y = r.rot; av.load().then(() => { if (!this.remotes.has(r.id)) { av.dispose(); return; } r.avatar = av; this.handlers.onSpawn?.(r); if (r.voice) this._maybeCall(r.id); }).catch((e) => console.warn(e)); }
  _leave(key, silent) { const r = this.remotes.get(key); if (!r) return; this.remotes.delete(key); r.avatar?.dispose(); this._hangup(key); if (!silent) { this.handlers.onLeave?.(r); this.handlers.onPeople?.(this.people()); } }
  _move(p) { const r = this.remotes.get(p.id); if (!r) return; r.target.set(p.p[0], 0, p.p[2]); r.rot = p.r; r.anim = p.a; r.spot = p.spot || null; r.pose = p.pose || null; r.h = p.h || 0; if (r.avatar) this.handlers.onRemoteState?.(r); }
  _chat(p) { const r = this.remotes.get(p.id); if (p.to && p.to !== this.meta.name) return; this.handlers.onChat?.({ name: p.name || r?.name || 'Someone', text: p.text, whisper: !!p.to, id: p.id }); r?.avatar?.say(p.text); }
  send(event, payload) { if (!this.connected || !this.channel) return; this.channel.send({ type: 'broadcast', event, payload: { id: this.id, ...payload } }).catch(() => {}); }
  sendChat(text, to = null) { this.send('chat', { name: this.meta.name, text, to }); }
  sendAnim(name) { this.send('anim', { name }); }
  updateConfig(cfg) { this.meta.cfg = cfg; this.send('cfg', { cfg }); this._track(); }
  update(dt) {
    if (this.connected && this.getState) { this.acc += dt; const s = this.getState(); const key = JSON.stringify([s.p.map((v) => +v.toFixed(2)), +s.r.toFixed(2), s.a, s.spot, s.pose]); if (this.acc >= 1 / SEND_HZ && (key !== this.lastSent || this.acc > 2)) { this.acc = 0; this.lastSent = key; this.send('move', s); } }
    for (const r of this.remotes.values()) {
      const av = r.avatar; if (!av) continue;
      if (r.spot) { /* seated remotes are positioned by the session */ } else { const pos = av.group.position; const d = pos.distanceTo(r.target); if (d > 6) pos.copy(r.target); else if (d > 0.02) pos.lerp(r.target, Math.min(1, dt * 10)); let diff = r.rot - av.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); av.group.rotation.y += diff * Math.min(1, dt * 10); if (r.anim === 'walk' || r.anim === 'run') av.setMoving(r.anim === 'run' ? 3.6 : 1.6); else if (av.loopName === 'walk' || av.loopName === 'run') av.setMoving(0); }
      av.update(dt);
      if (r.audio && this.getState) { const s = this.getState(); const dist = Math.hypot(s.p[0] - av.group.position.x, s.p[2] - av.group.position.z); r.audio.volume = THREE.MathUtils.clamp(1 - (dist - 3) / (VOICE_RANGE - 3), 0, 1); }
    }
  }
  // voice (WebRTC mesh signalled over the room channel)
  async toggleVoice() {
    if (this.voice.on) { this.voice.on = false; this.voice.stream?.getTracks().forEach((t) => t.stop()); this.voice.stream = null; for (const k of [...this.voice.peers.keys()]) this._hangup(k); await this._track(); return false; }
    try { this.voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); } catch { throw new Error('Microphone not allowed'); }
    this.voice.on = true; await this._track(); for (const [k, r] of this.remotes) if (r.voice) this._maybeCall(k); return true;
  }
  _maybeCall(key) { if (!this.voice.on || this.voice.peers.has(key)) return; if (this.id < key) this._call(key); }
  _pc(key) { const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] }); this.voice.stream?.getTracks().forEach((t) => pc.addTrack(t, this.voice.stream)); pc.onicecandidate = (e) => { if (e.candidate) this.send('rtc', { to: key, kind: 'ice', data: e.candidate.toJSON() }); }; pc.ontrack = (e) => { const r = this.remotes.get(key); if (!r) return; if (!r.audio) { r.audio = document.createElement('audio'); r.audio.autoplay = true; r.audio.playsInline = true; document.body.appendChild(r.audio); } r.audio.srcObject = e.streams[0]; r.audio.play().catch(() => {}); }; pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this._hangup(key, true); }; this.voice.peers.set(key, pc); return pc; }
  async _call(key) { const pc = this._pc(key); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); this.send('rtc', { to: key, kind: 'offer', data: pc.localDescription.toJSON() }); }
  async _rtc(p) { if (p.to !== this.id) return; const from = p.id; try { if (p.kind === 'offer') { if (!this.voice.on) return; this._hangup(from, true); const pc = this._pc(from); await pc.setRemoteDescription(p.data); const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); this.send('rtc', { to: from, kind: 'answer', data: pc.localDescription.toJSON() }); } else if (p.kind === 'answer') { const pc = this.voice.peers.get(from); if (pc) await pc.setRemoteDescription(p.data); } else if (p.kind === 'ice') { const pc = this.voice.peers.get(from); if (pc) await pc.addIceCandidate(p.data).catch(() => {}); } } catch (e) { console.warn('rtc', e); } }
  _hangup(key, retry = false) { const pc = this.voice.peers.get(key); if (pc) { pc.close(); this.voice.peers.delete(key); } const r = this.remotes.get(key); if (r?.audio) { r.audio.srcObject = null; r.audio.remove(); r.audio = null; } if (retry && r && this.voice.on && r.voice && this.id < key) setTimeout(() => this._maybeCall(key), 1500); }
}

// Lobby presence: who is in which room, for the room list counts.
export class Lobby {
  constructor(backend) { this.backend = backend; this.channel = null; this.counts = {}; this.room = null; this.id = Math.random().toString(36).slice(2, 10); this.onCounts = null; }
  start(name) {
    const ch = this.backend.channel('lobby', { presence: { key: this.id } }); if (!ch) return;
    this.channel = ch; this.name = name;
    ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(); const c = {}; for (const metas of Object.values(st)) { const m = metas[metas.length - 1]; if (m.room) c[m.room] = (c[m.room] || 0) + 1; } this.counts = c; this.total = Object.keys(st).length; this.onCounts?.(c, this.total); }).subscribe(async (s) => { if (s === 'SUBSCRIBED') await this._track(); });
  }
  async _track() { if (this.channel) await this.channel.track({ name: this.name, room: this.room }).catch(() => {}); }
  setRoom(key) { this.room = key; this._track(); }
}
