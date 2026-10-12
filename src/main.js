import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initAvatars, Avatar, defaultConfig } from './avatar.js';
import { Controls } from './controls.js';
import { backend } from './backend.js';
import { RoomNet, Lobby } from './net.js';
import { App } from './app.js';

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const labels = new CSS2DRenderer({ element: $('labels') }); labels.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#15171b');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 300);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); });
const controls = new Controls(camera, $('gl'));
const net = new RoomNet(scene, backend); const lobby = new Lobby(backend);
const app = new App({ scene, camera, renderer, labels, controls, backend, net, lobby });
$('logout').onclick = () => app.logout();

async function boot() {
  const load = (f, m) => { $('loadbar').style.width = Math.round(f * 100) + '%'; if (m) $('loadmsg').textContent = m; };
  load(0.1, 'Loading avatars…'); await initAvatars();
  load(0.4, 'Signing you in…'); const u = await backend.restore();
  load(0.6, 'Warming up…'); await Promise.all(['f', 'm'].map((g) => new Avatar(scene, defaultConfig(g)).load().then((a) => a.dispose())));
  if (u) lobby.start(u.name);
  load(1, 'Ready'); setTimeout(() => ($('loading').style.display = 'none'), 150);
  app.start();
}
const clock = new THREE.Clock();
function loop() { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.1); app.update(dt); if (!$('gl').classList.contains('off')) { renderer.render(scene, camera); labels.render(scene, camera); } }
window.loft = { app, backend, scene, camera, controls, net, lobby, get controller() { return app.controller; } };
boot().catch((e) => { console.error(e); $('loadmsg').textContent = 'Failed to load: ' + e.message; });
loop();
