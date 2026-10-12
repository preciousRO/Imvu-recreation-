// Rendering pipeline: MSAA, ground truth ambient occlusion, depth of field, bloom, vignette, SMAA, filmic output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 1, msaa: 0, ao: false, dof: false, bloom: false, smaa: true, shadow: 1024, reflections: false, water: false },
  high: { label: 'High', pixelRatio: 1.5, msaa: 4, ao: true, aoSamples: 12, dof: false, bloom: true, smaa: true, shadow: 2048, reflections: true, water: true },
  ultra: { label: 'Ultra', pixelRatio: 2, msaa: 4, ao: true, aoSamples: 16, dof: true, bloom: true, smaa: true, shadow: 4096, reflections: true, water: true },
};
export function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4; const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); const mem = navigator.deviceMemory || 8;
  if (mobile || cores <= 2 || mem <= 2) return 'low'; if (cores >= 8 && mem >= 8) return 'ultra'; return 'high';
}
const VignetteShader = { uniforms: { tDiffuse: { value: null }, offset: { value: 1.15 }, darkness: { value: 0.55 }, grain: { value: 0.018 }, time: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; uniform float grain; uniform float time; varying vec2 vUv; float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 uv = (vUv - 0.5) * vec2(offset); float v = clamp(1.0 - dot(uv, uv) * darkness, 0.0, 1.0); c.rgb *= v; c.rgb += (rnd(vUv) - 0.5) * grain * c.rgb; gl_FragColor = c; }' };

export class Pipeline {
  constructor(renderer, scene, camera, quality = 'high') { this.renderer = renderer; this.scene = scene; this.camera = camera; this.quality = QUALITY[quality] ? quality : 'high'; this.focusDist = 3; this.t = 0; this.build(); }
  get q() { return QUALITY[this.quality]; }
  setQuality(quality) { if (!QUALITY[quality]) quality = 'high'; this.quality = quality; this.build(); }
  build() {
    const q = this.q; const r = this.renderer; r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio)); r.setSize(innerWidth, innerHeight);
    const size = r.getDrawingBufferSize(new THREE.Vector2()); const w = size.x, h = size.y;
    this.composer?.dispose?.();
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
    const c = (this.composer = new EffectComposer(r, rt)); c.setPixelRatio(1); c.setSize(w, h);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) { const ao = (this.ao = new GTAOPass(this.scene, this.camera, w, h)); ao.output = GTAOPass.OUTPUT.Default; ao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1, thickness: 1, scale: 1.1, samples: q.aoSamples, distanceFallOff: 1, screenSpaceRadius: false }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 }); ao.blendIntensity = 0.9; c.addPass(ao); } else this.ao = null;
    if (q.dof) { this.bokeh = new BokehPass(this.scene, this.camera, { focus: this.focusDist, aperture: 0.0018, maxblur: 0.004 }); c.addPass(this.bokeh); } else this.bokeh = null;
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.14, 0.5, 1.0); c.addPass(this.bloom); } else this.bloom = null;
    this.vignette = new ShaderPass(VignetteShader); c.addPass(this.vignette);
    if (q.smaa) c.addPass(new SMAAPass());
    c.addPass(new OutputPass());
  }
  setFocus(d) { this.focusDist = d; if (this.bokeh) this.bokeh.uniforms['focus'].value = d; }
  setSize() { this.build(); }
  render(dt = 0.016) { this.t += dt; this.vignette.uniforms.time.value = this.t % 100; this.composer.render(); }
}
