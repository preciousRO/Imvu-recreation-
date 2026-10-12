// One interface, two implementations: Supabase (token based RPCs + realtime) and local (this browser only).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, START_CREDITS, DAILY_CREDITS } from './config.js';
import { ITEMS, STARTER, byId } from './catalog.js';

const TOKEN_KEY = 'loft.token';
const listeners = new Set();

class SupabaseBackend {
  constructor() { this.mode = 'supabase'; this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 20 } } }); this.token = null; this.user = null; }
  async rpc(fn, args) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(cleanError(error.message));
    return data;
  }
  _auth(res) { this.token = res.token; this.user = res.user; try { localStorage.setItem(TOKEN_KEY, this.token); } catch {} notify(); return this.user; }
  _user(u) { this.user = u; notify(); return u; }
  async restore() { let t = null; try { t = localStorage.getItem(TOKEN_KEY); } catch {} if (!t) return null; this.token = t; try { return this._user(await this.rpc('app_me', { p_token: t })); } catch { this.token = null; return null; } }
  register(name, pass, avatar) { return this.rpc('app_register', { p_name: name, p_pass: pass, p_avatar: avatar }).then((r) => this._auth(r)); }
  login(name, pass) { return this.rpc('app_login', { p_name: name, p_pass: pass }).then((r) => this._auth(r)); }
  async logout() { try { await this.rpc('app_logout', { p_token: this.token }); } catch {} this.token = null; this.user = null; try { localStorage.removeItem(TOKEN_KEY); } catch {} notify(); }
  me() { return this.rpc('app_me', { p_token: this.token }).then((u) => this._user(u)); }
  heartbeat() { return this.rpc('app_heartbeat', { p_token: this.token }).catch(() => {}); }
  saveAvatar(avatar, pic) { return this.rpc('app_save_avatar', { p_token: this.token, p_avatar: avatar, p_pic: pic || null }).then((u) => this._user(u)); }
  saveBio(bio) { return this.rpc('app_save_bio', { p_token: this.token, p_bio: bio }).then((u) => this._user(u)); }
  buy(item) { return this.rpc('app_buy', { p_token: this.token, p_item: item }).then((u) => this._user(u)); }
  gift(to, item) { return this.rpc('app_gift', { p_token: this.token, p_to: to, p_item: item }).then((u) => this._user(u)); }
  claimDaily() { return this.rpc('app_claim_daily', { p_token: this.token }).then((u) => this._user(u)); }
  profile(name) { return this.rpc('app_profile', { p_token: this.token, p_name: name }); }
  search(q) { return this.rpc('app_search', { p_token: this.token, p_q: q }); }
  friends() { return this.rpc('app_friends', { p_token: this.token }); }
  friendRequest(name) { return this.rpc('app_friend_request', { p_token: this.token, p_name: name }); }
  friendAccept(name) { return this.rpc('app_friend_accept', { p_token: this.token, p_name: name }); }
  friendRemove(name) { return this.rpc('app_friend_remove', { p_token: this.token, p_name: name }); }
  sendMessage(to, body) { return this.rpc('app_send_message', { p_token: this.token, p_to: to, p_body: body }); }
  inbox() { return this.rpc('app_inbox', { p_token: this.token }); }
  thread(name) { return this.rpc('app_thread', { p_token: this.token, p_name: name }); }
  pulsePost(body) { return this.rpc('app_pulse_post', { p_token: this.token, p_body: body }); }
  pulseFeed() { return this.rpc('app_pulse_feed', { p_token: this.token }); }
  roomSave(r) { return this.rpc('app_room_save', { p_token: this.token, p_name: r.name, p_template: r.template, p_private: !!r.is_private, p_decor: r.decor || [] }); }
  roomGet({ owner, invite }) { return this.rpc('app_room_get', { p_token: this.token, p_owner: owner || null, p_invite: invite || null }); }
  channel(name, config) { return this.sb.channel(name, { config }); }
}

// ---------- local mode ----------
const LS = 'loft.local';
function load() { try { return JSON.parse(localStorage.getItem(LS)) || { users: {}, friends: [], messages: [], pulse: [], rooms: {}, seq: 1 }; } catch { return { users: {}, friends: [], messages: [], pulse: [], rooms: {}, seq: 1 }; } }
function save(db) { try { localStorage.setItem(LS, JSON.stringify(db)); } catch {} }
const uid = () => Math.random().toString(36).slice(2, 10);

class LocalBackend {
  constructor() { this.mode = 'local'; this.token = null; this.user = null; this.db = load(); this.channels = new Map(); }
  _u(name) { return Object.values(this.db.users).find((u) => u.name.toLowerCase() === String(name || '').toLowerCase()); }
  _json(u) { const me = u.id; return { id: u.id, name: u.name, credits: u.credits, avatar: u.avatar, bio: u.bio, pic: u.pic, created_at: u.created_at, inventory: [...u.inventory], unread: this.db.messages.filter((m) => m.to === me && !m.read).length, requests: this.db.friends.filter((f) => f.to === me && f.status === 'pending').length, daily_available: u.last_daily !== today() }; }
  _card(meId, u) { const f = this.db.friends; return { id: u.id, name: u.name, pic: u.pic, bio: u.bio, avatar: u.avatar, created_at: u.created_at, online: u.id === meId, friend: f.some((x) => ((x.from === meId && x.to === u.id) || (x.from === u.id && x.to === meId)) && x.status === 'accepted'), requested: f.some((x) => x.from === meId && x.to === u.id && x.status === 'pending'), requests_me: f.some((x) => x.from === u.id && x.to === meId && x.status === 'pending'), room: this.db.rooms[u.id] ? { name: this.db.rooms[u.id].name, template: this.db.rooms[u.id].template, is_private: this.db.rooms[u.id].is_private } : null }; }
  _me() { if (!this.token) throw new Error('not signed in'); const u = this.db.users[this.token]; if (!u) throw new Error('not signed in'); return u; }
  _set() { save(this.db); this.user = this._json(this._me()); notify(); return this.user; }
  async restore() { let t = null; try { t = localStorage.getItem(TOKEN_KEY); } catch {} if (!t || !this.db.users[t]) return null; this.token = t; return this._set(); }
  async register(name, pass, avatar) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new Error('Name must be 3 to 20 letters, numbers or underscores');
    if ((pass || '').length < 4) throw new Error('Password must be at least 4 characters');
    if (this._u(name)) throw new Error('That name is taken');
    const id = uid(); this.db.users[id] = { id, name, pass, credits: START_CREDITS, avatar: avatar || {}, bio: '', pic: null, inventory: [...STARTER], created_at: new Date().toISOString(), last_daily: null };
    this.db.rooms[id] = { owner: id, name: 'My Room', template: 'studio', is_private: false, invite: uid(), decor: [] };
    this.token = id; try { localStorage.setItem(TOKEN_KEY, id); } catch {} return this._set();
  }
  async login(name, pass) { const u = this._u(name); if (!u || u.pass !== pass) throw new Error('Wrong name or password'); this.token = u.id; try { localStorage.setItem(TOKEN_KEY, u.id); } catch {} return this._set(); }
  async logout() { this.token = null; this.user = null; try { localStorage.removeItem(TOKEN_KEY); } catch {} notify(); }
  async me() { return this._set(); }
  async heartbeat() {}
  async saveAvatar(avatar, pic) { const u = this._me(); u.avatar = avatar; if (pic) u.pic = pic; return this._set(); }
  async saveBio(bio) { this._me().bio = String(bio || '').slice(0, 300); return this._set(); }
  async buy(item) { const u = this._me(); const it = byId[item]; if (!it) throw new Error('No such item'); if (u.inventory.includes(item)) throw new Error('You already own this'); if (u.credits < it.price) throw new Error('Not enough credits'); u.credits -= it.price; u.inventory.push(item); return this._set(); }
  async gift(to, item) { const u = this._me(); const o = this._u(to); const it = byId[item]; if (!o) throw new Error('No such person'); if (!it) throw new Error('No such item'); if (o.inventory.includes(item)) throw new Error('They already own this'); if (u.credits < it.price) throw new Error('Not enough credits'); u.credits -= it.price; o.inventory.push(item); this.db.messages.push({ id: this.db.seq++, from: u.id, to: o.id, body: '🎁 sent you a gift: ' + it.name, at: new Date().toISOString(), read: false }); return this._set(); }
  async claimDaily() { const u = this._me(); if (u.last_daily === today()) throw new Error('Come back tomorrow for more credits'); u.credits += DAILY_CREDITS; u.last_daily = today(); return this._set(); }
  async profile(name) { const o = this._u(name); if (!o) throw new Error('No such person'); return this._card(this._me().id, o); }
  async search(q) { const me = this._me(); return Object.values(this.db.users).filter((u) => u.id !== me.id && u.name.toLowerCase().includes(String(q || '').toLowerCase())).map((u) => this._card(me.id, u)); }
  async friends() { const me = this._me().id; const f = this.db.friends; const U = (id) => this.db.users[id]; return { friends: f.filter((x) => (x.from === me || x.to === me) && x.status === 'accepted').map((x) => this._card(me, U(x.from === me ? x.to : x.from))).filter(Boolean), requests: f.filter((x) => x.to === me && x.status === 'pending').map((x) => this._card(me, U(x.from))), sent: f.filter((x) => x.from === me && x.status === 'pending').map((x) => this._card(me, U(x.to))) }; }
  async friendRequest(name) { const me = this._me().id; const o = this._u(name); if (!o || o.id === me) throw new Error('No such person'); const back = this.db.friends.find((x) => x.from === o.id && x.to === me && x.status === 'pending'); if (back) back.status = 'accepted'; else if (!this.db.friends.some((x) => x.from === me && x.to === o.id)) this.db.friends.push({ from: me, to: o.id, status: 'pending' }); save(this.db); return this._card(me, o); }
  async friendAccept(name) { const me = this._me().id; const o = this._u(name); const r = this.db.friends.find((x) => x.from === o?.id && x.to === me); if (r) r.status = 'accepted'; save(this.db); notify(); return this._card(me, o); }
  async friendRemove(name) { const me = this._me().id; const o = this._u(name); this.db.friends = this.db.friends.filter((x) => !((x.from === me && x.to === o?.id) || (x.from === o?.id && x.to === me))); save(this.db); return this._card(me, o); }
  async sendMessage(to, body) { const me = this._me(); const o = this._u(to); if (!o) throw new Error('No such person'); if (!String(body || '').trim()) throw new Error('Empty message'); this.db.messages.push({ id: this.db.seq++, from: me.id, to: o.id, body: String(body).slice(0, 1000), at: new Date().toISOString(), read: false }); save(this.db); return { ok: true }; }
  async inbox() { const me = this._me().id; const t = {}; for (const m of this.db.messages) { if (m.from !== me && m.to !== me) continue; const other = this.db.users[m.from === me ? m.to : m.from]; if (!other) continue; const k = other.name; t[k] = t[k] || { name: other.name, pic: other.pic, last: m.at, unread: 0, preview: m.body }; if (m.at >= t[k].last) { t[k].last = m.at; t[k].preview = m.body; } if (m.to === me && !m.read) t[k].unread++; } return Object.values(t).sort((a, b) => (a.last < b.last ? 1 : -1)); }
  async thread(name) { const me = this._me().id; const o = this._u(name); if (!o) throw new Error('No such person'); const list = this.db.messages.filter((m) => (m.from === me && m.to === o.id) || (m.from === o.id && m.to === me)); list.forEach((m) => { if (m.to === me) m.read = true; }); save(this.db); notify(); return list.map((m) => ({ id: m.id, mine: m.from === me, body: m.body, at: m.at })); }
  async pulsePost(body) { const me = this._me(); if (!String(body || '').trim()) throw new Error('Say something first'); this.db.pulse.push({ id: this.db.seq++, user: me.id, body: String(body).slice(0, 500), at: new Date().toISOString() }); save(this.db); return this.pulseFeed(); }
  async pulseFeed() { const me = this._me().id; return this.db.pulse.slice(-60).reverse().map((p) => { const u = this.db.users[p.user]; return { id: p.id, name: u?.name, pic: u?.pic, body: p.body, at: p.at, mine: p.user === me }; }); }
  async roomSave(r) { const me = this._me().id; const cur = this.db.rooms[me] || { owner: me, invite: uid() }; this.db.rooms[me] = { ...cur, name: (r.name || 'My Room').slice(0, 40), template: r.template || 'studio', is_private: !!r.is_private, decor: r.decor || [] }; save(this.db); return this.roomGet({ owner: this._me().name }); }
  async roomGet({ owner, invite }) { const me = this._me().id; let r = invite ? Object.values(this.db.rooms).find((x) => x.invite === invite) : this.db.rooms[this._u(owner)?.id]; if (!r) throw new Error('No such room'); if (r.is_private && r.owner !== me && invite !== r.invite) throw new Error('This room is private'); return { id: r.owner, owner: this.db.users[r.owner]?.name, name: r.name, template: r.template, is_private: r.is_private, decor: r.decor, invite: r.owner === me ? r.invite : null, mine: r.owner === me }; }
  channel() { return null; }
}

function today() { return new Date().toISOString().slice(0, 10); }
function cleanError(m) { return String(m || 'Something went wrong').replace(/^.*?:\s*/, '').replace(/\s*\(SQLSTATE.*$/, ''); }
function notify() { for (const cb of listeners) { try { cb(backend.user); } catch (e) { console.warn(e); } } }
export function onUser(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export const backend = SUPABASE_URL && SUPABASE_KEY ? new SupabaseBackend() : new LocalBackend();
export function itemsOwned() { const inv = backend.user?.inventory || []; return ITEMS.filter((i) => inv.includes(i.id)); }
