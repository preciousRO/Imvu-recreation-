// Room controls: WASD or tap to walk, drag to orbit, wheel or pinch to zoom; collisions against the room.
import * as THREE from 'three';
const WALK = 1.6, RUN = 3.6, RADIUS = 0.3;
export class Controls {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom; this.player = null; this.room = { colliders: [], bounds: { x1: -50, z1: -50, x2: 50, z2: 50 } };
    this.keys = new Set(); this.yaw = 0; this.pitch = 0.3; this.dist = 5; this.target = null; this.joy = { x: 0, y: 0, active: false };
    this.enabled = true; this.focus = null; this.onTap = null; this.onMove = null; this.runToggle = false;
    this.camPos = new THREE.Vector3(); this.lookAt = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._bind();
  }
  _typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }
  _bind() {
    const d = this.dom;
    window.addEventListener('keydown', (e) => { if (this._typing()) return; this.keys.add(e.code); if (e.code === 'ShiftLeft') this.runToggle = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'ShiftLeft') this.runToggle = false; });
    window.addEventListener('blur', () => this.keys.clear());
    let down = null, moved = false;
    d.addEventListener('pointerdown', (e) => { if (e.target !== d) return; down = { x: e.clientX, y: e.clientY, id: e.pointerId, b: e.button }; moved = false; d.setPointerCapture(e.pointerId); });
    d.addEventListener('pointermove', (e) => { if (!down || e.pointerId !== down.id) return; if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true; if (moved) { this.yaw -= (e.movementX || 0) * 0.0045; this.pitch = THREE.MathUtils.clamp(this.pitch + (e.movementY || 0) * 0.003, -0.1, 1.2); } });
    const up = (e) => { if (!down || e.pointerId !== down.id) return; if (!moved && down.b === 0) this._tap(e.clientX, e.clientY); down = null; };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', () => { down = null; });
    d.addEventListener('wheel', (e) => { this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.01, 1.2, 12); e.preventDefault(); }, { passive: false });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    let pinch = 0; d.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    d.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && pinch) { const p = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); this.dist = THREE.MathUtils.clamp(this.dist - (p - pinch) * 0.03, 1.2, 12); pinch = p; } }, { passive: true });
  }
  _tap(cx, cy) {
    if (!this.enabled) return;
    const r = this.dom.getBoundingClientRect(); const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    if (this.onTap && this.onTap(this.ray)) return;
    if (!this.player) return;
    const p = new THREE.Vector3(); if (this.ray.ray.intersectPlane(this.plane, p)) { const b = this.room.bounds; p.x = THREE.MathUtils.clamp(p.x, b.x1, b.x2); p.z = THREE.MathUtils.clamp(p.z, b.z1, b.z2); this.target = p; this.onMove?.(); }
  }
  move(pos, dx, dz) {
    const cs = this.room.colliders; const b = this.room.bounds;
    const step = (axis, delta) => { if (!delta) return; pos[axis] += delta; for (const c of cs) { if (pos.x + RADIUS > c.x1 && pos.x - RADIUS < c.x2 && pos.z + RADIUS > c.z1 && pos.z - RADIUS < c.z2) { if (axis === 'x') pos.x = delta > 0 ? c.x1 - RADIUS : c.x2 + RADIUS; else pos.z = delta > 0 ? c.z1 - RADIUS : c.z2 + RADIUS; } } pos.x = THREE.MathUtils.clamp(pos.x, b.x1, b.x2); pos.z = THREE.MathUtils.clamp(pos.z, b.z1, b.z2); };
    step('x', dx); step('z', dz); return pos;
  }
  // moves the player; returns true while walking
  update(dt) {
    const p = this.player; let walking = false;
    if (p && p.loaded) {
      const pos = p.group.position; let vx = 0, vz = 0;
      if (this.enabled && !this.focus && !p.seatLock) {
        const k = this.keys; let ix = 0, iz = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1; if (k.has('KeyS') || k.has('ArrowDown')) iz += 1; if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1; if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
        if (this.joy.active) { ix += this.joy.x; iz += this.joy.y; }
        const len = Math.hypot(ix, iz);
        if (len > 0.1) { this.target = null; this.onMove?.(); const n = Math.min(1, len); const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); const fx = -sy, fz = -cy, rx = cy, rz = -sy; const dx = (fx * -iz + rx * ix) / len, dz = (fz * -iz + rz * ix) / len; const sp = (this.runToggle ? RUN : WALK) * n; vx = dx * sp; vz = dz * sp; }
        else if (this.target) { const dx = this.target.x - pos.x, dz = this.target.z - pos.z; const d = Math.hypot(dx, dz); if (d < 0.25) { this.target = null; this.onArrive?.(); } else { const sp = d > 6 ? RUN : WALK; vx = (dx / d) * sp; vz = (dz / d) * sp; } }
      }
      const speed = Math.hypot(vx, vz);
      if (speed > 0.05) {
        walking = true; const before = pos.clone(); this.move(pos, vx * dt, vz * dt); const real = before.distanceTo(pos) / dt;
        if (real < 0.2 && this.target) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 1) { this.target = null; this.stuck = 0; this.onArrive?.(); } } else this.stuck = 0;
        const ang = Math.atan2(vx, vz); let diff = ang - p.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); p.group.rotation.y += diff * Math.min(1, dt * 12);
        p.setMoving(Math.min(speed, real + 0.3));
      } else p.setMoving(0);
    }
    // camera
    const f = this.focus; const dist = f ? f.dist : this.dist; const pitch = f ? f.pitch : this.pitch; const yaw = f ? f.yaw : this.yaw;
    const base = p ? p.group.position : new THREE.Vector3(); const look = f ? f.at.clone() : new THREE.Vector3(base.x, base.y + 1.3, base.z);
    const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    const want = look.clone().add(off); want.y = Math.max(want.y, 0.4);
    const k = f ? Math.min(1, dt * 4) : Math.min(1, dt * 9); this.camPos.lerp(want, k); this.lookAt.lerp(look, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.lookAt);
    return walking;
  }
  setFocus(at, { dist = 2.6, yaw = 0, pitch = 0.05 } = {}) { this.focus = at ? { at, dist, yaw, pitch } : null; }
  snap() { this.update(1); this.camPos.copy(this.camera.position); }
}
