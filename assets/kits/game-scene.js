// ─────────────────────────────────────────────────────────────
//  game-scene.js — kit for the "게임 화면 재현" (show it in the game) approach.
//  Materials and machinery only: a three.js stage (renderer → bloom composer → 2D canvas), textures, a low-poly
//  prop library, a posable low-poly humanoid rig + its wireframe "ghost" twin, capsule mannequins and a grey
//  world-grid test map, per-frame pools (footprints, pulses, arrow), stun stars / aura, a camera rig with shake
//  and key paths, a time-remap helper (live → rewind → replay → slow → freeze), and 2D HUD / debug painters.
//
//  NOTHING here is a scene. Colours, which props exist and where, character looks, HUD layout, camera keys,
//  text and chapters all come from the page. Defaults are neutral greys so a forgotten parameter looks unfinished,
//  not like an old topic. Every frame must be a pure function of t: call stage.beginFrame() first, set everything
//  the frame needs, then stage.render(ctx). Randomness is seeded (rng). No network.
//
//  Copy to <project>/assets/kits/game-scene.js; a page loads it with
//    <script type="importmap">{"imports": {"three": "../assets/vendor/three/build/three.module.min.js",
//      "three/addons/": "../assets/vendor/three/examples/jsm/"}}</script>
//    import * as GS from '../assets/kits/game-scene.js';
//  STYLE.md next to this file documents the API, the knobs every topic must set itself, and pitfalls.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };

// ═════════════════════════════════════════════════════════════
//  math / easing / seeded random (same shapes as the skill's template)
// ═════════════════════════════════════════════════════════════
/** clamp(x, a=0, b=1) */
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** linear interpolation */
export const lerp = (a, b, t) => a + (b - a) * t;
/** progress of t through [s, s+d] → 0..1 */
export const p = (t, s, d) => clamp((t - s) / d);
/** ease-out cubic */
export const eo = t => 1 - Math.pow(1 - t, 3);
/** ease-in-out cubic */
export const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** ease-out with overshoot (pop) */
export const eback = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
/** window: fades in over f at s, out over f before e */
export const win = (t, s, e, f = .45) => Math.min(eo(p(t, s, f)), 1 - eio(p(t, e - f, f)));
/** trapezoid 0→1→0 over [a, b] with ramps r (s in any unit) */
export const ramp = (s, a, b, r = .15) => Math.min(clamp((s - a) / r), clamp((b - s) / r));
/** seeded PRNG (mulberry32): rng(seed)() → [0, 1) */
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
/** new THREE.Vector3 */
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** average fn over the last n samples spaced dt before s — smooths a camera that follows a sim (seek-safe: no state) */
export const avgS = (fn, s, n, dt) => { let a = 0; for (let j = 0; j < n; j++) a += fn(s - j * dt); return a / n; };
/** blend two plain numeric objects key by key (camera poses) */
export const mixCam = (a, b, k) => { const o = {}; for (const key in a) o[key] = lerp(a[key], b[key] ?? a[key], k); return o; };

// ═════════════════════════════════════════════════════════════
//  stage: renderer, scene, camera, bloom composer, lights, sky dome, colour grade
// ═════════════════════════════════════════════════════════════
/**
 * createStage(opts) → stage. Builds the offscreen WebGL renderer and composer (RenderPass → UnrealBloom → Output).
 * opts (all optional, neutral defaults):
 *   W, H            frame size in px (1920×1080)
 *   tone            'neutral' | 'aces' | 'agx' | 'none'      exposure (1)
 *   shadows         { size: 2048, extent: 20 (half-size of the sun's shadow box, m), near: 1, far: 90, bias, normalBias } or false
 *   fog             { color, near, far } (m) or null
 *   background      colour for scene.background (only used when sky is null)
 *   hemi            { sky, ground, intensity }      sun { color, intensity, offset: [x,y,z] m from the camera target }
 *   sky             { top, bottom, spread: 2.2, offset: .04, gamma: .7, radius: 500 } — gradient dome that follows the camera; null = none
 *   bloom           { strength, radius, threshold } (UnrealBloomPass)
 *   dim             { hemi, sun, sky } — how much stage.dim(1) subtracts (intensity units; sky 0..1 darkening)
 *   fov             default vertical fov in degrees for camSet (34)
 * stage: { gl, scene, camera, composer, bloom, hemi, sun, sky, W, H, beginFrame(), render(ctx), dim(k), transient(obj), onReset(fn) }
 */
export function createStage(o = {}) {
  const W = o.W || 1920, H = o.H || 1080;
  const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(W, H, false);
  const sh = o.shadows === false ? null : { size: 2048, extent: 20, near: 1, far: 90, bias: -.0005, normalBias: .03, ...(o.shadows || {}) };
  if (sh) { gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap; }
  gl.toneMapping = { neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping }[o.tone || 'neutral'];
  gl.toneMappingExposure = o.exposure ?? 1.0;
  const scene = new THREE.Scene();
  if (o.fog) scene.fog = new THREE.Fog(o.fog.color, o.fog.near, o.fog.far);
  if (o.background) scene.background = new THREE.Color(o.background);
  const fov = o.fov || 34;
  const camera = new THREE.PerspectiveCamera(fov, W / H, o.near || .1, o.far || 700);
  const composer = new EffectComposer(gl);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const b = { strength: .5, radius: .35, threshold: 1.0, ...(o.bloom || {}) };
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), b.strength, b.radius, b.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const hm = { sky: '#e8e8e8', ground: '#6a6a6a', intensity: 1, ...(o.hemi || {}) };
  const sn = { color: '#ffffff', intensity: 2, offset: [-10, 22, 12], ...(o.sun || {}) };
  const hemi = new THREE.HemisphereLight(hm.sky, hm.ground, hm.intensity);
  const sun = new THREE.DirectionalLight(sn.color, sn.intensity);
  if (sh) {
    sun.castShadow = true; sun.shadow.mapSize.set(sh.size, sh.size);
    Object.assign(sun.shadow.camera, { left: -sh.extent, right: sh.extent, top: sh.extent, bottom: -sh.extent, near: sh.near, far: sh.far });
    sun.shadow.bias = sh.bias; sun.shadow.normalBias = sh.normalBias;
  }
  scene.add(hemi, sun, sun.target);

  let sky = null;
  if (o.sky !== null) {
    const s = { top: '#9a9a9a', bottom: '#d0d0d0', spread: 2.2, offset: .04, gamma: .7, radius: 500, ...(o.sky || {}) };
    sky = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(s.top) }, bot: { value: new THREE.Color(s.bottom) }, dim: { value: 0 },
        spread: { value: s.spread }, offs: { value: s.offset }, gam: { value: s.gamma } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top, bot; uniform float dim, spread, offs, gam; varying vec3 vP; void main(){ float h = clamp(vP.y * spread + offs, 0., 1.); vec3 c = mix(bot, top, pow(h, gam)); gl_FragColor = vec4(c * (1. - .4 * dim), 1.); }',
    }));
    scene.add(sky);
  }

  const dimAmt = { hemi: 0, sun: 0, sky: 0, ...(o.dim || {}) };
  const base = { hemi: hm.intensity, sun: sn.intensity };
  const transients = [], resets = [];
  const stage = {
    W, H, gl, scene, camera, composer, bloom, hemi, sun, sky, fov,
    sunOffset: V(...sn.offset),
    /** hide every registered dynamic object (characters, pools, fx, transients). Call first in renderAt. */
    beginFrame() { for (const f of resets) f(); for (const t of transients) t.visible = false; },
    /** register an Object3D that is hidden at the start of every frame (show it in the frames that need it) */
    transient(obj) { transients.push(obj); return obj; },
    /** register a function run by beginFrame() */
    onReset(fn) { resets.push(fn); },
    /** darken the world for debug views: k 0..1 subtracts opts.dim from hemi / sun and darkens the sky */
    dim(k) {
      hemi.intensity = base.hemi - dimAmt.hemi * k; sun.intensity = base.sun - dimAmt.sun * k;
      if (sky) sky.material.uniforms.dim.value = dimAmt.sky * k;
    },
    /**
     * grade(g) — set the colour grade for this frame from a plain object (blend two with mixGrade):
     *   { exposure, fog: { color, near, far }, hemi: { sky, ground, intensity }, sun: { color, intensity }, sky: { top, bottom },
     *     bloom: { strength, radius, threshold }, background }
     * Fields left out keep their current value, so a page that grades in one chapter must grade in every chapter (seek-safe).
     * Intensities set here become the base that dim() subtracts from.
     */
    grade(g) {
      if (g.exposure !== undefined) gl.toneMappingExposure = g.exposure;
      if (g.fog && scene.fog) { if (g.fog.color) scene.fog.color.set(g.fog.color); if (g.fog.near !== undefined) scene.fog.near = g.fog.near; if (g.fog.far !== undefined) scene.fog.far = g.fog.far; }
      if (g.hemi) { if (g.hemi.sky) hemi.color.set(g.hemi.sky); if (g.hemi.ground) hemi.groundColor.set(g.hemi.ground); if (g.hemi.intensity !== undefined) hemi.intensity = base.hemi = g.hemi.intensity; }
      if (g.sun) { if (g.sun.color) sun.color.set(g.sun.color); if (g.sun.intensity !== undefined) sun.intensity = base.sun = g.sun.intensity; }
      if (g.sky && sky) { if (g.sky.top) sky.material.uniforms.top.value.set(g.sky.top); if (g.sky.bottom) sky.material.uniforms.bot.value.set(g.sky.bottom); }
      if (g.bloom) { if (g.bloom.strength !== undefined) bloom.strength = g.bloom.strength; if (g.bloom.radius !== undefined) bloom.radius = g.bloom.radius; if (g.bloom.threshold !== undefined) bloom.threshold = g.bloom.threshold; }
      if (g.background && scene.background) scene.background.set(g.background);
    },
    /** render the 3D frame and draw it onto a 2D context at (0, 0, W, H) */
    render(ctx) { composer.render(); if (ctx) ctx.drawImage(gl.domElement, 0, 0, W, H); },
  };
  return stage;
}

const _ca = new THREE.Color(), _cb = new THREE.Color();
/** mixGrade(a, b, k) — blend two grade objects (colours in linear RGB, numbers linearly); keys missing in b keep a's value */
export function mixGrade(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key] ?? x;
    if (typeof x === 'number') o[key] = lerp(x, y, k);
    else if (typeof x === 'string') o[key] = '#' + _ca.set(x).lerp(_cb.set(y), k).getHexString();
    else if (x && typeof x === 'object') o[key] = mixGrade(x, y, k);
  }
  return o;
}

// ═════════════════════════════════════════════════════════════
//  materials and canvas textures
// ═════════════════════════════════════════════════════════════
/** flatMat(color, opts) — low-poly MeshStandardMaterial (flat shading, rough, non-metal); opts override */
export const flatMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .92, metalness: 0, flatShading: true, ...o });
/** glowMat(color, k) — unlit material brightened by k so bloom picks it up (bulbs, orbs, markers) */
export const glowMat = (c, k = 2, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), fog: false, ...o });

/**
 * canvasTex(w, h, draw, rep) — CanvasTexture drawn by draw(g, w, h); rep = [rx, ry] makes it repeat.
 * tex.redraw() draws again (call it after fonts load when the texture has text).
 */
export function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  if (rep) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(rep[0], rep[1]); }
  tex.redraw = () => { draw(c.getContext('2d'), w, h); tex.needsUpdate = true; };
  tex.redraw();
  return tex;
}

/**
 * tileTexture(o) — paving / slab floor: a staggered grid of tiles with seeded hue/lightness jitter and grit.
 * o: { size 512, tiles 4 (per side), gap 3 (px), grout colour, hue [h, ±range], sat [s, range], light [l, range] (HSL, %),
 *      stagger true, grit 900 (specks), gritDark 'r,g,b', gritLight 'r,g,b', seed, rep [rx, ry] }
 */
export function tileTexture(o = {}) {
  const q = { size: 512, tiles: 4, gap: 3, grout: '#5a5a5a', hue: [0, 0], sat: [0, 0], light: [62, 8], stagger: true, grit: 900,
    gritDark: '40,40,40', gritLight: '255,255,255', seed: 3, rep: [100, 100], ...o };
  return canvasTex(q.size, q.size, (g, w, h) => {
    const R = rng(q.seed), n = q.tiles, cell = w / n, half = cell / 2;
    g.fillStyle = q.grout; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const l = q.light[0] + R() * q.light[1], off = q.stagger ? (j % 2) * half : 0;
      g.fillStyle = `hsl(${q.hue[0] + R() * q.hue[1]}, ${q.sat[0] + R() * q.sat[1]}%, ${l}%)`;
      g.fillRect(((i * cell + off) % w) + q.gap, j * cell + q.gap, cell - 2 * q.gap, cell - 2 * q.gap);
      if (off) g.fillRect(((i * cell + off) % w) - cell + q.gap, j * cell + q.gap, cell - 2 * q.gap, cell - 2 * q.gap);
    }
    for (let k = 0; k < q.grit; k++) { g.fillStyle = `rgba(${R() < .5 ? q.gritDark : q.gritLight},${.04 + R() * .06})`; g.fillRect(R() * w, R() * h, 2 + R() * 4, 2 + R() * 4); }
  }, q.rep);
}

/**
 * laneTexture(o) — a measured strip (running track, corridor, firing lane) with tick lines and labels along its length.
 * o: { x0, x1 (m covered by the texture), from 0, to x1 (m range that gets ticks), px 4096, py 234, base, grit 9000, gritDark, gritLight, edge (border colour),
 *      every 5 (m between ticks), major 10, tickMinor, tickMajor (colours), label: m => string | null, labelColor,
 *      font 'Pretendard, sans-serif', labelSize [minor, major], checkerAt: m (start line) | null, checker: [a, b], seed }
 * Labels need the font: call tex.redraw() after fonts load.
 */
export function laneTexture(o = {}) {
  const q = { x0: 0, x1: 100, px: 4096, py: 234, base: '#8a8a8a', grit: 9000, gritDark: '60,60,60', gritLight: '230,230,230', edge: '#666',
    every: 5, major: 10, tickMinor: 'rgba(240,240,240,.55)', tickMajor: 'rgba(245,245,245,.85)', label: m => m + 'm', labelColor: 'rgba(250,250,250,.92)',
    font: 'Pretendard, sans-serif', labelSize: [30, 40], checkerAt: null, checker: ['#f2f2f2', '#262626'], seed: 11, ...o };
  return canvasTex(q.px, q.py, (g, w, h) => {
    const R = rng(q.seed), ppm = w / (q.x1 - q.x0);
    g.fillStyle = q.base; g.fillRect(0, 0, w, h);
    for (let n = 0; n < q.grit; n++) { g.fillStyle = `rgba(${R() < .5 ? q.gritDark : q.gritLight},${.05 + R() * .08})`; g.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 3); }
    g.fillStyle = q.edge; g.fillRect(0, 0, w, 9); g.fillRect(0, h - 9, w, 9);
    for (let m = Math.max(q.from ?? 0, Math.ceil(q.x0 / q.every) * q.every); m <= (q.to ?? q.x1); m += q.every) {
      const X = (m - q.x0) * ppm, mj = !(m % q.major);
      g.fillStyle = mj ? q.tickMajor : q.tickMinor; g.fillRect(X - 2.5, 12, 5, h - 24);
      const lab = q.label && q.label(m);
      if (lab) { g.fillStyle = q.labelColor; g.font = `800 ${mj ? q.labelSize[1] : q.labelSize[0]}px ${q.font}`; g.textBaseline = 'alphabetic'; g.fillText(lab, X + 9, h - 22); }
    }
    if (q.checkerAt != null) for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? q.checker[0] : q.checker[1]; g.fillRect((q.checkerAt - q.x0) * ppm - 22 + j * 11, 12 + i * ((h - 24) / 12), 11, (h - 24) / 12); }
  });
}

/**
 * gridTexture(o) — engine-style world grid (light grey, 1 m minor lines, heavier line at the tile edge).
 * o: { size 256, base, minor, major, cells 8 (minor lines per tile), minorW 2, majorW 4 (px), rep [rx, ry] }
 */
export function gridTexture(o = {}) {
  const q = { size: 256, base: '#8e9093', minor: '#7d7f83', major: '#696b70', cells: 8, minorW: 2, majorW: 4, rep: [2.5, 2.5], ...o };
  return canvasTex(q.size, q.size, (g, w, h) => {
    g.fillStyle = q.base; g.fillRect(0, 0, w, h);
    const st = w / q.cells; g.fillStyle = q.minor; for (let k = 0; k < q.cells; k++) { g.fillRect(k * st, 0, q.minorW, h); g.fillRect(0, k * st, w, q.minorW); }
    g.fillStyle = q.major; g.fillRect(0, 0, w, q.majorW); g.fillRect(0, 0, q.majorW, h);
  }, q.rep);
}

/** ribTexture(o) — vertical ribs (shipping containers, corrugated walls, shutters). o: { base, dark, light, ribs 24, rep } */
export function ribTexture(o = {}) {
  const q = { base: '#888', dark: 'rgba(0,0,0,.28)', light: 'rgba(255,255,255,.12)', ribs: 24, rep: [1, 1], ...o };
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = q.base; g.fillRect(0, 0, w, h); const st = w / q.ribs;
    for (let i = 0; i < q.ribs; i++) { g.fillStyle = q.dark; g.fillRect(i * st, 0, st * .32, h); g.fillStyle = q.light; g.fillRect(i * st + st * .55, 0, st * .18, h); }
    g.fillStyle = q.dark; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  }, q.rep);
}

/** chevronTexture() — white chevron on transparent (footprints / input markers point along +x of the plane) */
export function chevronTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(20, 18); g.lineTo(72, 18); g.lineTo(112, 64); g.lineTo(72, 110); g.lineTo(20, 110); g.lineTo(60, 64); g.closePath(); g.fill();
  });
}

/** groundPlane(stage, mat, { size: [w, d], at: [x, y, z], shadow: true, parent }) — a flat floor (PlaneGeometry laid on xz) */
export function groundPlane(stage, mat, { size = [400, 400], at = [0, 0, 0], shadow = true, parent = null } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(...at); m.receiveShadow = shadow; (parent || stage.scene).add(m); return m;
}

/**
 * lightPool(stage, { color, radius 4, at: [x, y, z], strength .5, parent }) — additive radial glow decal on the floor
 * (lamp light, spawn pad, capture zone). Cheap stand-in for real lights.
 */
export function lightPool(stage, o = {}) {
  const tex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, w, h); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (o.radius || 4), 2 * (o.radius || 4)),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(o.color || '#ffffff').multiplyScalar(o.strength ?? .5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  m.rotation.x = -Math.PI / 2; m.position.set(...(o.at || [0, .02, 0])); (o.parent || stage.scene).add(m); return m;
}

// ═════════════════════════════════════════════════════════════
//  props: instancing + a low-poly prop library (geometry only; colours and placement from the page)
// ═════════════════════════════════════════════════════════════
const _o3 = new THREE.Object3D(), _col = new THREE.Color();
/**
 * instanced(stage, geo, mat, list, { cast, recv, colors, parent }) → InstancedMesh added to parent (default the scene).
 * list entries: [x, y, z, scale = 1, yaw = 0, [sx, sy, sz]?] (m, radians). colors: per-instance colour list (optional).
 * parent: a Group, so a whole map can be hidden / shown at once (e.g. game view vs. server view).
 */
export function instanced(stage, geo, mat, list, { cast = true, recv = true, colors = null, parent = null } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((q, i) => {
    _o3.position.set(q[0], q[1], q[2]); _o3.rotation.set(0, q[4] || 0, 0); _o3.scale.setScalar(q[3] || 1);
    if (q[5]) _o3.scale.multiply(_v3.set(...q[5]));
    _o3.updateMatrix(); m.setMatrixAt(i, _o3.matrix);
    if (colors) m.setColorAt(i, _col.set(colors[i % colors.length]));
  });
  m.castShadow = cast; m.receiveShadow = recv; (parent || stage.scene).add(m); return m;
}
const _v3 = new THREE.Vector3();

/**
 * PROP — part recipes for low-poly props. Each kind is a list of parts { geo, y (offset × scale), dx, key (material key), cast }.
 * kinds: tree (trunk + two cones), pillar (shaft + cap + base), rock, tuft, bollard, box (unit cube, scale via [sx,sy,sz]),
 *        barrel, lamp (pole + arm + bulb), barrier (concrete jersey block), crate.
 * Use with addProp(stage, kind, list, mats).
 */
export const PROP = {
  tree: () => [
    { geo: new THREE.ConeGeometry(1.8, 5, 6), y: 4.6, key: 'leaf' },
    { geo: new THREE.ConeGeometry(1.4, 3.6, 6), y: 6.6, dx: .2, key: 'leaf2' },
    { geo: new THREE.CylinderGeometry(.22, .3, 2.4, 5), y: 1.2, key: 'trunk' }],
  pillar: () => [
    { geo: new THREE.CylinderGeometry(.55, .62, 5, 6), y: 2.5, key: 'shaft', abs: true },
    { geo: new THREE.BoxGeometry(1.5, .45, 1.5), y: 5.2, key: 'cap', abs: true },
    { geo: new THREE.BoxGeometry(1.5, .4, 1.5), y: .2, key: 'cap', abs: true }],
  rock: () => [{ geo: new THREE.IcosahedronGeometry(1, 0), y: 0, key: 'rock', keepY: true }],
  tuft: () => [{ geo: new THREE.ConeGeometry(.18, .5, 4), y: 0, key: 'tuft', keepY: true, cast: false }],
  bollard: () => [{ geo: new THREE.BoxGeometry(.32, .7, .32), y: .35, key: 'bollard', abs: true }],
  box: () => [{ geo: new THREE.BoxGeometry(1, 1, 1), y: 0, key: 'box', keepY: true }],
  crate: () => [{ geo: new THREE.BoxGeometry(1, 1, 1), y: .5, key: 'crate' }],
  barrel: () => [{ geo: new THREE.CylinderGeometry(.38, .38, 1.1, 10), y: .55, key: 'barrel' }],
  barrier: () => {
    const s = new THREE.Shape(); s.moveTo(-.38, 0); s.lineTo(.38, 0); s.lineTo(.14, .3); s.lineTo(.1, .82); s.lineTo(-.1, .82); s.lineTo(-.14, .3); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }); g.translate(0, 0, -1);
    return [{ geo: g, y: 0, key: 'barrier' }];
  },
  lamp: () => [
    { geo: new THREE.CylinderGeometry(.07, .1, 5, 6), y: 2.5, key: 'pole' },
    { geo: new THREE.BoxGeometry(1.1, .12, .16), y: 4.95, dx: .45, key: 'pole' },
    { geo: new THREE.BoxGeometry(.5, .12, .3), y: 4.86, dx: .9, key: 'bulb', cast: false }],
};
/**
 * addProp(stage, kind, list, mats, opts) → [InstancedMesh…]. list entries as in instanced(). The entry's y is used only by
 * ground-hugging kinds (rock, tuft, box); other kinds stand on y = 0 and their part heights scale with the entry's scale
 * (pillar and bollard keep fixed heights). Part x offsets (dx) turn with the entry's yaw but are not scaled.
 * mats: { [part key]: Material }. opts.colors: per-instance colours (same for all parts); opts.parent: Group.
 */
export function addProp(stage, kind, list, mats, opts = {}) {
  return PROP[kind]().map(part => {
    const mat = mats[part.key] || mats.default; if (!mat) throw new Error(`addProp(${kind}): no material for "${part.key}"`);
    const L = list.map(q => {
      const s = q[3] || 1, y = part.keepY ? q[1] : part.abs ? part.y : part.y * s;
      const yaw = q[4] || 0, dx = part.dx || 0;
      return [q[0] + dx * Math.cos(yaw), y, q[2] - dx * Math.sin(yaw), s, yaw, q[5]];
    });
    return instanced(stage, part.geo, mat, L, { cast: part.cast !== false, colors: opts.colors, parent: opts.parent });
  });
}

/**
 * buildPortcullis(stage, o) — a gate whose bars can drop (client view) plus a wireframe twin (server view).
 * o: { x, z = 0, halfSpan 3.35, height 4.2, stone, iron (materials), ghost: { fill, line } materials (from ghostMats) }
 * → { door (Group, posts + lintel + grate), grate (Group: move .position.y to raise/lower), twin (Group of ghost bars; .fill/.line) }
 * Both groups are registered as transients (hidden every frame until shown).
 */
export function buildPortcullis(stage, o) {
  const hs = o.halfSpan ?? 3.35, H = o.height ?? 4.2;
  const door = new THREE.Group(); stage.scene.add(door); door.position.set(o.x, 0, o.z || 0);
  const twin = new THREE.Group(); stage.scene.add(twin); twin.position.set(o.x, 0, o.z || 0);
  const grate = new THREE.Group(); door.add(grate);
  for (const z of [-hs, hs]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.7, H, .7), o.stone); m.position.set(0, H / 2, z); m.castShadow = true; door.add(m); }
  const lin = new THREE.Mesh(new THREE.BoxGeometry(.9, 3.6, hs * 2 + .7), o.stone); lin.position.y = H + 1.8; lin.castShadow = true; door.add(lin);
  const bars = [], inner = hs - .65;
  for (let z = -inner; z <= inner + .01; z += .6) bars.push(['v', z]);
  for (const y of [.6, 1.6, 2.6, 3.5]) bars.push(['h', y]);
  for (const [k, q] of bars) {
    const geo = k === 'v' ? new THREE.BoxGeometry(.12, H - .3, .12) : new THREE.BoxGeometry(.1, .12, inner * 2 + .6);
    const m = new THREE.Mesh(geo, o.iron); m.castShadow = true; if (k === 'v') m.position.set(0, (H - .3) / 2, q); else m.position.set(0, q, 0); grate.add(m);
    const gm = new THREE.Mesh(geo, o.ghost.fill); gm.position.copy(m.position); gm.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), o.ghost.line)); twin.add(gm);
  }
  twin.fill = o.ghost.fill; twin.line = o.ghost.line;
  stage.transient(door); stage.transient(twin);
  return { door, grate, twin };
}

/**
 * buildRobed(stage, o) — a robed NPC (caster, vendor, guard) from cones and an icosahedron head.
 * o: { at: [x, y, z], robe, dark, wood (materials), glow (material for eye + staff tip), staff: true, scale: 1 }
 * → Group (transient). Faces +x.
 */
export function buildRobed(stage, o) {
  const g = new THREE.Group(); stage.scene.add(g); g.position.set(...o.at); if (o.scale) g.scale.setScalar(o.scale);
  const b = new THREE.Mesh(new THREE.ConeGeometry(.75, 1.9, 6), o.robe); b.position.y = .95; b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, 0), o.dark); h.position.y = 2.05; h.castShadow = true; g.add(h);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(.42, .6, 6), o.robe); hood.position.y = 2.35; g.add(hood);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .3), o.glow); eye.position.set(.28, 2.07, 0); g.add(eye);
  if (o.staff !== false) {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 2.6, 5), o.wood); staff.position.set(.45, 1.3, .55); staff.castShadow = true; g.add(staff);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0), o.glow); tip.position.set(.45, 2.7, .55); g.add(tip);
  }
  return stage.transient(g);
}

// ═════════════════════════════════════════════════════════════
//  characters: low-poly humanoid rig, ghost (wireframe) twin, poses
// ═════════════════════════════════════════════════════════════
/**
 * Proportions (all multipliers, 1 = the base rig, ≈ 1.75 m tall facing +x):
 *   height (uniform scale), leg (thigh + shin length), arm (arm length), torso (torso length), head (head size),
 *   width (shoulder / hip spacing), bulk (torso girth), limb (limb thickness).
 * Styles: head 'hair' | 'helmet' | 'bald' · collar true/false · backpack true/false.
 * Material keys: skin, top, bottom, hair, boots, belt, collar, helmet, visor, pack (only those the style uses).
 */
const GEO_CACHE = new Map();
function charGeo(P, st) {
  const key = JSON.stringify([P, st]); if (GEO_CACHE.has(key)) return GEO_CACHE.get(key);
  const { leg: L, arm: A, torso: T, head: Hd, width: Wd, bulk: B, limb: Lb } = P;
  const g = {
    pelvis: new THREE.BoxGeometry(.36 * B, .2, .3 * Wd), belt: new THREE.BoxGeometry(.39 * B, .08, .33 * Wd), torso: new THREE.CylinderGeometry(.25 * B, .19 * B, .5 * T, 6),
    scarf: new THREE.CylinderGeometry(.2 * B, .24 * B, .11, 6), head: new THREE.BoxGeometry(.27 * Hd, .29 * Hd, .27 * Hd), hair: new THREE.BoxGeometry(.29 * Hd, .11 * Hd, .29 * Hd),
    hairB: new THREE.BoxGeometry(.09 * Hd, .2 * Hd, .29 * Hd), eye: new THREE.BoxGeometry(.02, .05 * Hd, .04 * Hd), uarm: new THREE.BoxGeometry(.12 * Lb, .3 * A, .12 * Lb),
    farm: new THREE.BoxGeometry(.1 * Lb, .27 * A, .1 * Lb), thigh: new THREE.BoxGeometry(.15 * Lb, .42 * L, .15 * Lb), shin: new THREE.BoxGeometry(.13 * Lb, .38 * L, .13 * Lb), boot: new THREE.BoxGeometry(.23 * Lb, .1, .15 * Lb),
    helmet: new THREE.BoxGeometry(.33 * Hd, .25 * Hd, .33 * Hd), visor: new THREE.BoxGeometry(.03, .07 * Hd, .25 * Hd), pack: new THREE.BoxGeometry(.18, .36 * T, .3 * Wd),
  };
  const edge = {}; for (const k in g) edge[k] = new THREE.EdgesGeometry(g[k], 25);
  const out = { g, edge }; GEO_CACHE.set(key, out); return out;
}
const P0 = { height: 1, leg: 1, arm: 1, torso: 1, head: 1, width: 1, bulk: 1, limb: 1 };

/**
 * buildChar(stage, { mats, proportions, head, collar, backpack, ring, ghostLine, eyes }) → character.
 * mats: material per key (see above). ghostLine: LineBasicMaterial → wireframe twin (no shadows, no eyes).
 * ring: colour of the ground ring under the feet (selection / role marker; shown with setRing).
 * character: { root, hips, chest, head, sh[2], el[2], hp[2], kn[2], parts, ring, P, stride } — pose it with pose().
 * Registered with the stage: hidden every frame until posed.
 */
export function buildChar(stage, o) {
  const P = { ...P0, ...(o.proportions || {}) }, st = { head: o.head || 'hair', collar: o.collar !== false, backpack: !!o.backpack };
  const { g: GEO, edge: EDGE } = charGeo(P, st), mats = o.mats, ghostLine = o.ghostLine || null;
  const root = new THREE.Group(), parts = [];
  const mk = (key, m, x, y, z, parent) => {
    const me = new THREE.Mesh(GEO[key], m); me.position.set(x, y, z); parent.add(me);
    if (ghostLine) me.add(new THREE.LineSegments(EDGE[key], ghostLine)); else me.castShadow = true;
    parts.push(me); return me;
  };
  const { leg: L, arm: A, torso: T, head: Hd, width: Wd, bulk: B } = P;
  const hips = new THREE.Group(); root.add(hips);
  mk('pelvis', mats.bottom, 0, 0, 0, hips); mk('belt', mats.belt || mats.bottom, 0, .11, 0, hips);
  const chest = new THREE.Group(); chest.position.y = .14; hips.add(chest);
  mk('torso', mats.top, 0, .25 * T, 0, chest); if (st.collar) mk('scarf', mats.collar || mats.top, 0, .53 * T, 0, chest);
  if (st.backpack) mk('pack', mats.pack || mats.top, -.27 * B, .28 * T, 0, chest);
  const head = new THREE.Group(); head.position.y = .58 * T; chest.add(head);
  mk('head', mats.skin, 0, .16 * Hd, 0, head);
  if (st.head === 'hair') { mk('hair', mats.hair, -.01 * Hd, .33 * Hd, 0, head); mk('hairB', mats.hair, -.11 * Hd, .22 * Hd, 0, head); }
  if (st.head === 'helmet') { mk('helmet', mats.helmet || mats.top, -.01 * Hd, .25 * Hd, 0, head); mk('visor', mats.visor || mats.helmet, .165 * Hd, .2 * Hd, 0, head); }
  if (!ghostLine && o.eyes !== false && st.head !== 'helmet') { mk('eye', mats.hair || mats.skin, .136 * Hd, .17 * Hd, .06 * Hd, head); mk('eye', mats.hair || mats.skin, .136 * Hd, .17 * Hd, -.06 * Hd, head); }
  const sh = [], el = [], hp = [], kn = [];
  [1, -1].forEach(side => {
    const s = new THREE.Group(); s.position.set(0, .46 * T, side * .3 * Wd); chest.add(s); mk('uarm', mats.top, 0, -.14 * A, 0, s);
    const e = new THREE.Group(); e.position.y = -.28 * A; s.add(e); mk('farm', mats.skin, 0, -.12 * A, 0, e);
    const h = new THREE.Group(); h.position.set(0, -.06, side * .1 * Wd); hips.add(h); mk('thigh', mats.bottom, 0, -.21 * L, 0, h);
    const k = new THREE.Group(); k.position.y = -.42 * L; h.add(k); mk('shin', mats.bottom, 0, -.19 * L, 0, k); mk('boot', mats.boots || mats.bottom, .04, -.4 * L, 0, k);
    sh.push(s); el.push(e); hp.push(h); kn.push(k);
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 40), new THREE.MeshBasicMaterial({ color: o.ring || '#fff', transparent: true, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .035; ring.visible = false; root.add(ring);
  if (P.height !== 1) root.scale.setScalar(P.height);
  stage.scene.add(root);
  const c = { root, hips, chest, head, sh, el, hp, kn, parts, ring, P, hipY: .93 * L, stride: 1.9 * L * P.height };
  stage.onReset(() => { c.root.visible = false; c.ring.visible = false; });
  return c;
}

/**
 * pose(c, st) — set a character's whole pose from a plain state (pure; call every frame you show it).
 * st: { x, z (m), yaw (rad, 0 = facing +x), d (distance walked, drives the gait; default x), t (s, idle breathing / stun wobble),
 *       k 0..1 run blend, stun 0..1, aim 0..1 (arms raised forward), hit 0..1 (flinch back), crouch 0..1, y (m, lift) }
 */
export function pose(c, st) {
  const x = st.x, k = clamp(st.k || 0), stun = st.stun || 0, tt = st.t || 0, aim = st.aim || 0, hit = st.hit || 0, cr = st.crouch || 0;
  const ph = (st.d ?? x) / c.stride * Math.PI * 2;
  c.root.visible = true; c.root.position.set(x, st.y || 0, st.z || 0); c.root.rotation.y = st.yaw || 0;
  c.hips.position.y = c.hipY - .05 * k + .07 * k * Math.abs(Math.cos(ph)) + (1 - k) * .008 * Math.sin(tt * 2.4) - .05 * stun - .28 * cr * c.P.leg;
  c.hips.rotation.z = -.2 * k + .06 * stun - .25 * cr;
  c.chest.rotation.set(0, .18 * k * Math.sin(ph), -.05 * k + .12 * stun + .35 * hit + .2 * cr);
  c.head.rotation.set(stun * .25 * Math.sin(tt * 5), 0, .12 * k - .3 * stun + .25 * hit);
  for (let i = 0; i < 2; i++) {
    const q = ph + i * Math.PI, sq = Math.sin(q), cq = Math.cos(q), side = i ? -1 : 1;
    c.hp[i].rotation.z = .2 * k + .75 * k * sq + .9 * cr;
    c.kn[i].rotation.z = -k * (.18 + 1.05 * Math.max(0, cq)) - .1 * stun - 1.5 * cr;
    c.sh[i].rotation.set(-side * (.07 + .08 * (1 - k) + .15 * stun) * (1 - aim) + side * .28 * aim, 0, lerp(-.65 * k * sq, 1.42 - (i ? .12 : 0), aim));
    c.el[i].rotation.z = lerp(.2 + .95 * k - .15 * stun, i ? .55 : .12, aim);
  }
}

/** ghostMats(hex, k = 2.4, { fill: .16, line: .95 }) — translucent fill + bright (bloomed) edge materials for wireframe twins */
export function ghostMats(hex, k = 2.4, o = {}) {
  const fill = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o.fill ?? .16, depthWrite: false, fog: false });
  const line = new THREE.LineBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity: o.line ?? .95, depthWrite: false, fog: false });
  const mats = {}; for (const key of ['skin', 'top', 'bottom', 'hair', 'boots', 'belt', 'collar', 'helmet', 'visor', 'pack']) mats[key] = fill;
  return { fill, line, mats };
}
/**
 * buildGhost(stage, hex, { proportions, head, collar, backpack, k, ring }) — wireframe twin of a character
 * (server position, past position, prediction…). Same proportions as the solid one, so the two line up.
 */
export function buildGhost(stage, hex, o = {}) {
  const g = ghostMats(hex, o.k ?? 2.4);
  const c = buildChar(stage, { ...o, mats: g.mats, ghostLine: g.line, ring: o.ring || hex });
  c.fill = g.fill; c.line = g.line; return c;
}
/**
 * setGhost(g, st, a, near = 9, { fill: .17, line: .95, ring: .8 }) — pose a ghost at opacity a. near (m): distance to its
 * solid twin; the fill fades when they overlap (< 1.2 m) so the solid one stays readable.
 */
export function setGhost(g, st, a, near = 9, o = {}) {
  if (a <= .01) return; pose(g, st);
  g.fill.opacity = (o.fill ?? .17) * a * clamp(near / 1.2); g.line.opacity = (o.line ?? .95) * a;
  g.ring.visible = true; g.ring.material.opacity = (o.ring ?? .8) * a;
}
/** setRing(c, a) — show the ground ring under a character at opacity .85·a */
export function setRing(c, a) { c.ring.visible = a > .01; c.ring.material.opacity = .85 * a; }

// ═════════════════════════════════════════════════════════════
//  capsule mannequins + grey world-grid test map (engine "test level" look; hitboxes, server view)
// ═════════════════════════════════════════════════════════════
/** mannequinGeometry({ radius .34, length .95, head .23 }) — capsule body + sphere head merged, feet at y 0, ≈ 2.05 m */
export function mannequinGeometry({ radius = .34, length = .95, head = .23 } = {}) {
  const by = radius + length / 2 + .005, hy = by + length / 2 + radius + head * .8;     // defaults: body centre .82, head 1.82
  const body = new THREE.CapsuleGeometry(radius, length, 6, 12); body.translate(0, by, 0);
  const hd = new THREE.SphereGeometry(head, 14, 10); hd.translate(0, hy, 0);
  const a = body.toNonIndexed(), b = hd.toNonIndexed(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...a.attributes.normal.array, ...b.attributes.normal.array]), 3));
  return g;
}
/**
 * buildMannequin(stage, { mat | ghost: hex, geo, scale, ring }) → { root, mesh, ring, fill?, line? } (transient).
 * With ghost: hex, the mannequin is a translucent capsule with bright edges (a hitbox / rewound position).
 * Pose with poseMannequin().
 */
export function buildMannequin(stage, o = {}) {
  const geo = o.geo || mannequinGeometry(), root = new THREE.Group(); stage.scene.add(root);
  let mesh, fill = null, line = null;
  if (o.ghost) {
    const gm = ghostMats(o.ghost, o.k ?? 2.2); fill = gm.fill; line = gm.line;
    mesh = new THREE.Mesh(geo, fill); mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), line));
  } else { mesh = new THREE.Mesh(geo, o.mat); mesh.castShadow = true; }
  root.add(mesh); if (o.scale) mesh.scale.setScalar(o.scale);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .66, 40), new THREE.MeshBasicMaterial({ color: o.ring || o.ghost || '#fff', transparent: true, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.visible = false; root.add(ring);
  stage.transient(root); stage.onReset(() => { ring.visible = false; });
  return { root, mesh, ring, fill, line };
}
/** poseMannequin(m, { x, z, yaw, lean (rad, along facing), bob (m), a (ghost opacity), ring (0..1) }) */
export function poseMannequin(m, st) {
  m.root.visible = true; m.root.position.set(st.x, st.bob || 0, st.z || 0); m.root.rotation.set(0, st.yaw || 0, 0);
  m.mesh.rotation.z = -(st.lean || 0);
  if (m.fill) { const a = st.a ?? 1; m.fill.opacity = .16 * a; m.line.opacity = .95 * a; }
  if (st.ring) { m.ring.visible = true; m.ring.material.opacity = .85 * st.ring; }
}
/**
 * buildTestMap(stage, o) — the engine's default grey test level: a slab with a world-grid floor, edge lines,
 * box props, and an optional open grid floor around it.
 * o: { at: [x, y, z], size 20 (m), slab, edge, prop (colours), grid: gridTexture opts, boxes: [[x, y, z, w, h, d], …],
 *      openFloor: { radius 70, rep 20 } | null }
 * → { group, floor, open } (group stays visible; hide it yourself to switch maps).
 */
export function buildTestMap(stage, o = {}) {
  const S = o.size || 20, group = new THREE.Group(); group.position.set(...(o.at || [0, 0, 0])); stage.scene.add(group);
  const slabGeo = new THREE.BoxGeometry(S, 1.2, S);
  const slab = new THREE.Mesh(slabGeo, flatMat(o.slab || '#2a2c30', { roughness: .8, flatShading: false })); slab.position.y = -.6; slab.receiveShadow = true; group.add(slab);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), new THREE.LineBasicMaterial({ color: o.edge || '#7d8590', transparent: true, opacity: .8 })); e.position.y = -.6; group.add(e);
  const gt = gridTexture({ rep: [S / 8, S / 8], ...(o.grid || {}) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S - .4, S - .4), new THREE.MeshStandardMaterial({ map: gt, roughness: .85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .01; floor.receiveShadow = true; group.add(floor);
  const pm = flatMat(o.prop || '#a4a7ab', { roughness: .7, flatShading: false });
  for (const [x, y, z, w, h, d] of o.boxes || []) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pm); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; group.add(b); }
  let open = null;
  if (o.openFloor !== null) {
    const of = { radius: 70, rep: 20, ...(o.openFloor || {}) }, bt = gt.clone(); bt.repeat.set(of.rep, of.rep); bt.needsUpdate = true;
    open = new THREE.Mesh(new THREE.RingGeometry(S / 2 + .2, of.radius, 64, 1), new THREE.MeshStandardMaterial({ map: bt, roughness: .9 }));
    open.rotation.x = -Math.PI / 2; open.position.y = -.02; open.receiveShadow = true; group.add(open);
  }
  return { group, floor, open };
}

// ═════════════════════════════════════════════════════════════
//  per-frame FX: stun stars, aura, footprint / pulse pools, arrow, tracer
// ═════════════════════════════════════════════════════════════
/** makeStars(parent, { color, count 5, y 2.08, size .085, k 2 }) → Group circling above a head. Animate with setStars. */
export function makeStars(stage, parent, o = {}) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color || '#ffffff').multiplyScalar(o.k ?? 2), transparent: true, fog: false });
  for (let i = 0; i < (o.count || 5); i++) g.add(new THREE.Mesh(new THREE.OctahedronGeometry(o.size || .085, 0), mat));
  g.position.y = o.y ?? 2.08; g.visible = false; g.mat = mat; g.r = o.radius || .34; parent.add(g); stage.transient(g); return g;
}
/** setStars(g, t, a) — orbit the stars (t in s) at opacity a */
export function setStars(g, tt, a) {
  g.visible = a > .01; g.mat.opacity = a; const n = g.children.length;
  g.children.forEach((m, i) => { const an = tt * 4 + i * Math.PI * 2 / n; m.position.set(Math.cos(an) * g.r, Math.sin(tt * 6 + i) * .04, Math.sin(an) * g.r); m.rotation.y = tt * 5; });
}
/** makeAura(stage, parent, { color, k 1.6 }) → Group: hex ring at the feet, rising sparks, speed streaks behind (−x). setAura animates. */
export function makeAura(stage, parent, o = {}) {
  const aura = new THREE.Group(); parent.add(aura); aura.visible = false;
  const am = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color || '#ffffff').multiplyScalar(o.k ?? 1.6), transparent: true, opacity: .7, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const r = new THREE.Mesh(new THREE.RingGeometry(.42, .78, 6), am); r.rotation.x = -Math.PI / 2; r.position.y = .05; aura.add(r);
  for (let i = 0; i < 7; i++) aura.add(new THREE.Mesh(new THREE.TetrahedronGeometry(.07), am));
  for (let i = 0; i < 3; i++) aura.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, .025, .025), am));
  aura.mat = am; stage.transient(aura); return aura;
}
/** setAura(aura, t, a) */
export function setAura(aura, tt, a) {
  aura.visible = a > .01; aura.mat.opacity = .75 * a;
  aura.children.forEach((m, i) => {
    if (i === 0) { m.rotation.z = tt * 2; return; }
    if (i <= 7) { const q = (tt * .9 + i / 7) % 1, an = i * 2.4 + tt * 3; m.position.set(Math.cos(an) * .5, q * 1.8, Math.sin(an) * .5); m.scale.setScalar(1 - q); return; }
    const j = i - 8; m.position.set(-.9 - ((tt * 3 + j * .37) % 1) * .6, .55 + j * .35, (j - 1) * .22);
  });
}
/**
 * footPool(stage, n, { tex, size .42, y .03 }) → { put(x, z, col, a, scale, bright, yaw) } — ground markers (input seq,
 * footprints, waypoints). Emptied by beginFrame(); extra puts beyond n are dropped.
 */
export function footPool(stage, n = 64, o = {}) {
  const tex = o.tex || chevronTexture(), list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size || .42, o.size || .42), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; stage.scene.add(m); list.push(m);
  }
  let used = 0; stage.onReset(() => { for (const m of list) m.visible = false; used = 0; });
  return {
    put(x, z, col, a, sc = 1, bright = 1.5, yaw = 0) {
      if (used >= list.length || a <= .01) return; const m = list[used++];
      m.visible = true; m.position.set(x, o.y ?? .03, z); m.rotation.z = yaw; m.scale.setScalar(sc); m.material.color.set(col).multiplyScalar(bright); m.material.opacity = a;
    },
  };
}
/** pulsePool(stage, n) → { put(x, z, k, hex, r0 .4, r1 1.8, bright 2) } — expanding ground ring, k 0..1 (only drawn for 0 < k < 1) */
export function pulsePool(stage, n = 3) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; stage.scene.add(m); list.push(m);
  }
  let used = 0; stage.onReset(() => { for (const m of list) m.visible = false; used = 0; });
  return {
    put(x, z, k, hex, r0 = .4, r1 = 1.8, bright = 2) {
      if (k <= 0 || k >= 1 || used >= list.length) return; const m = list[used++];
      m.visible = true; m.position.set(x, .05, z); m.scale.setScalar(lerp(r0, r1, eo(k))); m.material.color.set(hex).multiplyScalar(bright); m.material.opacity = 1 - k;
    },
  };
}
/**
 * groundArrow(stage, color, { k 2.2, width .16, head .6 }) → { set(x0, z0, x1, z1, a) } — flat arrow on the ground from
 * (x0, z0) to (x1, z1) (correction vector, knock-back, path). Hidden by beginFrame().
 */
export function groundArrow(stage, color, o = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(o.k ?? 2.2), transparent: true, depthWrite: false, fog: false });
  const g = new THREE.Group(); stage.scene.add(g);
  const hl = o.head ?? .6;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1, .03, o.width ?? .16), mat); g.add(shaft);
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-hl, .34); s.lineTo(-hl, -.34); s.closePath();
  const head = new THREE.Mesh(new THREE.ShapeGeometry(s), mat); head.rotation.x = -Math.PI / 2; g.add(head);
  stage.transient(g);
  return {
    mat, group: g,
    set(x0, z0, x1, z1, a) {
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < .3 || a <= .01) return;
      g.visible = true; mat.opacity = a; g.position.set(x0, .06, z0);
      g.rotation.y = dz === 0 ? (dx < 0 ? Math.PI : 0) : -Math.atan2(dz, dx);
      shaft.scale.x = Math.max(.01, L - hl + .05); shaft.position.x = (L - hl + .05) / 2;
      head.position.set(L, 0, 0);
    },
  };
}
/**
 * tracer(stage, color, { k 3, width .05 }) → { set(a3, b3, a, k0 = 0, k1 = 1) } — a glowing beam between two 3D points
 * (shot, ray cast, line of sight); k0..k1 trims it so it can travel. Hidden by beginFrame().
 */
export function tracer(stage, color, o = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(o.k ?? 3), transparent: true, depthWrite: false, fog: false });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(o.width ?? .05, o.width ?? .05, 1, 6, 1, true), mat); stage.scene.add(m); stage.transient(m);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    mat, mesh: m,
    set(a3, b3, a, k0 = 0, k1 = 1) {
      if (a <= .01 || k1 <= k0) return;
      A.set(...a3); B.set(...b3); const P0 = A.clone().lerp(B, k0), P1 = A.clone().lerp(B, k1), L = P0.distanceTo(P1); if (L < 1e-3) return;
      m.visible = true; mat.opacity = a; m.position.copy(P0).add(P1).multiplyScalar(.5); m.scale.set(1, L, 1);
      m.quaternion.setFromUnitVectors(up, P1.clone().sub(P0).normalize());
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  camera: pose → camera, shake, key paths, projection
// ═════════════════════════════════════════════════════════════
const _tgt = new THREE.Vector3();
/**
 * camSet(stage, c, { shake 0..1, tt }) — place the camera from a plain pose (interpolate poses freely; mixCam / camPath):
 *   fx, ty, fz        target point (m)
 *   dist              distance from the target (m)
 *   yaw, h            direction as a vector (yaw, h, 1) — x and y offsets per unit z, camera on the +z side (the classic arena side view)
 *   az, el            OR an orbit: azimuth (rad, 0 = +z side, +π/2 = +x side) and elevation (rad); used when az is given
 *   fov               vertical fov (deg; default stage.fov)
 *   sx, sy            screen offset of the target in px (setViewOffset): positive sx moves the subject right
 * shake: hand-held jolt amplitude (0..1) driven by tt (s); deterministic. The sun and sky follow the target.
 */
export function camSet(stage, c, { shake = 0, tt = 0 } = {}) {
  const { camera, sun, sky, W, H } = stage;
  const d = c.az !== undefined ? V(Math.sin(c.az) * Math.cos(c.el), Math.sin(c.el), Math.cos(c.az) * Math.cos(c.el)) : V(c.yaw, c.h, 1).normalize();
  _tgt.set(c.fx, c.ty, c.fz || 0);
  camera.position.copy(_tgt).addScaledVector(d, c.dist);
  if (shake > 0) { camera.position.x += shake * Math.sin(tt * 97.1) * .22; camera.position.y += shake * Math.sin(tt * 71.3 + 1) * .16; }
  camera.lookAt(_tgt);
  camera.fov = c.fov || stage.fov;
  camera.setViewOffset(W, H, -(c.sx || 0), c.sy || 0, W, H);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  sun.target.position.copy(_tgt); sun.position.copy(_tgt).add(stage.sunOffset); sun.target.updateMatrixWorld();
  if (sky) sky.position.copy(camera.position);
}
/**
 * camPath(keys, t) — Catmull-Rom through camera keys [{ t, ...pose }] (numeric fields), so the camera keeps moving through
 * a key instead of stopping at it. Before the first / after the last key it holds. Add hold: true to a key to ease into it.
 */
export function camPath(keys, t) {
  if (t <= keys[0].t) return strip(keys[0]);
  const n = keys.length; if (t >= keys[n - 1].t) return strip(keys[n - 1]);
  let i = 0; while (i < n - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  let u = (t - k1.t) / (k2.t - k1.t); if (k2.hold) u = eio(u);
  const o = {};
  for (const key in k1) {
    if (key === 't' || key === 'hold') continue;
    const a = k0[key] ?? k1[key], b = k1[key], c = k2[key] ?? b, d = k3[key] ?? c;
    o[key] = .5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  }
  return o;
}
/**
 * camFrom(eye, target, extra) → a camSet pose (az / el form) that puts the camera at eye looking at target ([x, y, z] m).
 * extra adds fov / sx / sy. Poses from camFrom interpolate with camPath / mixCam like any other.
 */
export function camFrom(eye, target, extra = {}) {
  const dx = eye[0] - target[0], dy = eye[1] - target[1], dz = eye[2] - target[2], dist = Math.hypot(dx, dy, dz);
  return { fx: target[0], ty: target[1], fz: target[2], dist, az: Math.atan2(dx, dz), el: Math.asin(dy / dist), ...extra };
}
const strip = k => { const o = { ...k }; delete o.t; delete o.hold; return o; };
const _pv = new THREE.Vector3();
/** proj(stage, x, y, z) → [X, Y] screen px of a world point (after camSet). Also returns behind = true if behind the camera. */
export function proj(stage, x, y, z) { _pv.set(x, y, z).project(stage.camera); const r = [(_pv.x + 1) / 2 * stage.W, (1 - _pv.y) / 2 * stage.H]; r.behind = _pv.z > 1; return r; }

// ═════════════════════════════════════════════════════════════
//  time remap: chapter time u → sim time s (live, rewind, replay, slow, freeze)
// ═════════════════════════════════════════════════════════════
/**
 * timeRemap(segments) → fn(u) = s, with fn.label(u) and fn.mode(u). Segments run back to back from u = 0, s = 0:
 *   { until, rate = 1 }                 play at rate (1 live/replay, .35 slow-mo …)
 *   { until, rewindTo, ease = eio }     scrub s back to rewindTo over the segment
 *   { until, freeze: true }             hold s
 *   last segment may omit until (runs forever). Each may carry label (text for the HUD) and mode (any string).
 * Example (the "show it, rewind, replay slower, freeze on the moment" beat):
 *   const tm = timeRemap([{ until: 4.4, mode: 'live' }, { until: 5, rewindTo: 1.4, label: '◀◀' },
 *     { until: 6.8, label: 'REPLAY ×1' }, { until: 7.37, rate: .35, label: 'SLOW ×0.35' }, { until: 8.1, freeze: true, label: '❚❚' }, { rate: .5 }]);
 */
export function timeRemap(segs) {
  const S = []; let u0 = 0, s0 = 0;
  for (const g of segs) {
    const u1 = g.until ?? Infinity, seg = { ...g, u0, u1, s0 };
    seg.s1 = g.freeze ? s0 : g.rewindTo !== undefined ? g.rewindTo : s0 + (u1 - u0) * (g.rate ?? 1);
    S.push(seg); u0 = u1; s0 = seg.s1;
  }
  const find = u => S.find(g => u < g.u1) || S[S.length - 1];
  const fn = u => {
    const g = find(u);
    if (g.freeze) return g.s0;
    if (g.rewindTo !== undefined) return lerp(g.s0, g.rewindTo, (g.ease || eio)(p(u, g.u0, g.u1 - g.u0)));
    return g.s0 + (u - g.u0) * (g.rate ?? 1);
  };
  fn.label = u => find(u).label ?? null;
  fn.mode = u => find(u).mode ?? (find(u).freeze ? 'freeze' : find(u).rewindTo !== undefined ? 'rewind' : 'play');
  fn.segments = S;
  return fn;
}

// ═════════════════════════════════════════════════════════════
//  2D painter: text, panels, chips + scrims / freeze / rewind effects
// ═════════════════════════════════════════════════════════════
/**
 * painter(ctx, { W, H, sans, mono, theme }) → 2D helpers bound to one canvas.
 * theme: { text, dim, faint, panel (fill), line (stroke), chipFill, chipInk (text on solid chips), shadow, scrim 'r,g,b', ok }
 * Returns { rgba, rr, font, tw, txt, panel, chip, dot, check, cross, line, burst, scrims, freezeFX, rewindFX, theme }.
 */
export function painter(ctx, o = {}) {
  const W = o.W || 1920, H = o.H || 1080, SANS = o.sans || 'sans-serif', MONO = o.mono || 'monospace';
  const T = { text: '#f2f2f2', dim: '#b8b8b8', faint: '#7a7a7a', panel: 'rgba(12,12,14,.84)', line: 'rgba(200,200,200,.3)', chipFill: 'rgba(12,12,14,.86)',
    chipInk: '#0c0c0e', shadow: 'rgba(0,0,0,.75)', scrim: '8,8,10', ok: '#9be38a', ...(o.theme || {}) };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const font = (sz, wt = 500, mono = false) => { ctx.font = `${wt} ${sz}px ${mono ? MONO : SANS}`; };
  const tw = (s, size, weight = 500, mono = false) => { font(size, weight, mono); return ctx.measureText(s).width; };
  /** txt(s, x, y, { size, weight, color, align, base, alpha, mono, ls (letter spacing px), sh (shadow blur px) }) */
  function txt(s, x, y, q = {}) {
    const { size = 32, weight = 500, color = T.text, align = 'left', base = 'alphabetic', alpha = 1, mono = false, ls = 0, sh = 0 } = q;
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha; font(size, weight, mono);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    if (ls) ctx.letterSpacing = ls + 'px';
    if (sh) { ctx.shadowColor = T.shadow; ctx.shadowBlur = sh; ctx.shadowOffsetY = 2; }
    ctx.fillText(s, x, y); ctx.restore();
  }
  /** panel(x, y, w, h, { r, fill, stroke, alpha, lw }) */
  function panel(x, y, w, h, q = {}) {
    const { r = 12, fill = T.panel, stroke = T.line, alpha = 1, lw = 1.5 } = q;
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha; rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } ctx.restore();
  }
  /** chip(label, x, y, color, { alpha, size, align, solid, r }) → width. y is the chip's centre line. */
  function chip(label, x, y, color, q = {}) {
    const { alpha = 1, size = 22, align = 'left', solid = false, r = 7 } = q;
    if (alpha <= 0) return 0;
    font(size, 700, true);
    const w = ctx.measureText(label).width + size * 1.1, h = size * 1.65;
    const X = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.save(); ctx.globalAlpha *= alpha;
    rr(X, y - h / 2, w, h, r); ctx.fillStyle = solid ? color : T.chipFill; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = solid ? T.chipInk : color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, X + w / 2, y + 1); ctx.restore();
    return w;
  }
  function dot(x, y, r, color, a = 1, glow = 14) {
    ctx.save(); ctx.globalAlpha *= a; ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }
  function check(x, y, s, color, a = 1) {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = s * .16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * .36, y); ctx.lineTo(x - s * .1, y + s * .26); ctx.lineTo(x + s * .38, y - s * .28); ctx.stroke(); ctx.restore();
  }
  function cross(x, y, s, color, a = 1) {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = s * .16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * .3, y - s * .3); ctx.lineTo(x + s * .3, y + s * .3);
    ctx.moveTo(x + s * .3, y - s * .3); ctx.lineTo(x - s * .3, y + s * .3); ctx.stroke(); ctx.restore();
  }
  function line(x0, y0, x1, y1, color, lw = 2, a = 1, dash = null) {
    if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  }
  /** burst(x, y, k, col) — expanding ring, k 0..1 */
  function burst(x, y, k, col = T.text) {
    if (k <= 0 || k >= 1) return;
    ctx.save(); ctx.globalAlpha *= 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 14 + 40 * eo(k), 0, 7); ctx.stroke(); ctx.restore();
  }
  /** scrims(top, bot, left, { topH 290, botH 380, leftW 1250, right }) — gradients that keep text readable over the scene */
  function scrims(top = 1, bot = 1, left = 0, q = {}) {
    const c = T.scrim, th = q.topH ?? 290, bh = q.botH ?? 380, lw = q.leftW ?? 1250;
    if (top > 0) { const g = ctx.createLinearGradient(0, 0, 0, th); g.addColorStop(0, `rgba(${c},${.78 * top})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, th); }
    if (bot > 0) { const g = ctx.createLinearGradient(0, H - bh, 0, H); g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(.55, `rgba(${c},${.62 * bot})`); g.addColorStop(1, `rgba(${c},${.88 * bot})`); ctx.fillStyle = g; ctx.fillRect(0, H - bh, W, bh); }
    if (left > 0) { const g = ctx.createLinearGradient(0, 0, lw, 0); g.addColorStop(0, `rgba(${c},${.82 * left})`); g.addColorStop(.6, `rgba(${c},${.45 * left})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, lw, H); }
    const right = q.right || 0;
    if (right > 0) { const g = ctx.createLinearGradient(W, 0, W - lw, 0); g.addColorStop(0, `rgba(${c},${.82 * right})`); g.addColorStop(.6, `rgba(${c},${.45 * right})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(W - lw, 0, lw, H); }
  }
  /** freezeFX(a, { inner 300, outer 1150, color '0,0,0' }) — vignette that marks a freeze-frame */
  function freezeFX(a, q = {}) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a * .5;
    const g = ctx.createRadialGradient(W / 2, H / 2, q.inner ?? 300, W / 2, H / 2, q.outer ?? 1150); g.addColorStop(0, `rgba(${q.color || '0,0,0'},0)`); g.addColorStop(1, `rgba(${q.color || '0,0,0'},.9)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  /** rewindFX(a, u, { label, tint, lines 'r,g,b', y, size }) — tape-rewind look: tint, seeded scan bars (from u), big label */
  function rewindFX(a, u, q = {}) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = q.tint || 'rgba(10,10,14,.35)'; ctx.fillRect(0, 0, W, H);
    const R = rng(Math.floor(u * 30)); for (let i = 0; i < 9; i++) { ctx.fillStyle = `rgba(${q.lines || '235,235,235'},${.05 + R() * .1})`; ctx.fillRect(0, R() * H, W, 2 + R() * 10); }
    if (q.label) txt(q.label, W / 2, q.y ?? 560, { size: q.size ?? 64, weight: 800, align: 'center', mono: true, sh: 18 });
    ctx.restore();
  }
  return { ctx, W, H, theme: T, rgba, rr, font, tw, txt, panel, chip, dot, check, cross, line, burst, scrims, freezeFX, rewindFX };
}

/**
 * labels(stage, P) → world-anchored labels collected during the scene pass and drawn in the overlay pass.
 *   tag(x, y, z, text, col, a, y3 = .05, size = 22)  text under a ground point (drawn 40 px below its projection)
 *   wchip(x, y, z, text, col, a, size)               chip at a world point
 *   hchip(X, Y, text, col, a, size)                  chip at a screen point; chips stack upward instead of overlapping
 *   reset() (also run by beginFrame), drawTags(), drawHChips()
 */
export function labels(stage, P) {
  let tags = [], chips = [], hc = [];
  const L = {
    reset() { tags = []; chips = []; hc = []; },
    tag(x, z, text, col, a = 1, y = .05, size = 22) { tags.push([x, y, z, text, col, a, size]); },
    wchip(x, y, z, text, col, a = 1, size = 22) { chips.push([x, y, z, text, col, a, size]); },
    hchip(X, Y, text, col, a = 1, size = 22) { if (a > .01) hc.push([X, Y, text, col, a, size]); },
    drawTags() {
      for (const [x, y, z, text, col, a, size] of tags) { const [X, Y] = proj(stage, x, y, z); if (a <= 0) continue; P.txt(text, X, Y + 40, { size, weight: 700, mono: true, color: col, align: 'center', alpha: a, sh: 6 }); }
      for (const [x, y, z, text, col, a, size] of chips) { const [X, Y] = proj(stage, x, y, z); P.chip(text, X, Y, col, { align: 'center', size, alpha: a }); }
    },
    drawHChips() {
      const placed = [];
      for (let [X, Y0, text, col, a, size] of hc) {
        const w = P.tw(text, size, 700, true) + size * 1.1, h = size * 1.65; let Y = Y0; X = clamp(X, w / 2 + 12, stage.W - w / 2 - 12);
        for (let guard = 0; guard < 8; guard++) {
          const hit = placed.find(r => Math.abs(r[0] - X) < (r[2] + w) / 2 + 6 && Math.abs(r[1] - Y) < (r[3] + h) / 2 + 4);
          if (!hit) break; Y = hit[1] - (hit[3] + h) / 2 - 6;
        }
        placed.push([X, Y, w, h]); P.chip(text, X, Y, col, { align: 'center', size, alpha: a });
      }
    },
  };
  stage.onReset(() => L.reset());
  return L;
}

// ═════════════════════════════════════════════════════════════
//  game HUD widgets (what the player sees) and the debug panel (what the engineer sees)
//  Every widget draws only when called, at the position and in the colours given. No default layout.
// ═════════════════════════════════════════════════════════════
const ICONS = {
  blade: g => { g.moveTo(-14, 14); g.lineTo(14, -14); g.moveTo(-6, 4); g.lineTo(-14, -4); },
  ring: g => { g.arc(0, 0, 14, 0, 7); },
  tri: g => { g.moveTo(-12, 10); g.lineTo(0, -14); g.lineTo(12, 10); g.closePath(); },
  plus: g => { g.moveTo(-14, 0); g.lineTo(14, 0); g.moveTo(0, -14); g.lineTo(0, 14); },
  x: g => { g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); },
  square: g => { g.moveTo(-10, -12); g.lineTo(10, -12); g.lineTo(10, 12); g.lineTo(-10, 12); g.closePath(); },
  bolt: g => { g.moveTo(4, -15); g.lineTo(-8, 2); g.lineTo(2, 2); g.lineTo(-4, 15); g.lineTo(9, -3); g.lineTo(-1, -3); g.closePath(); },
  shield: g => { g.moveTo(0, -14); g.lineTo(12, -8); g.lineTo(10, 6); g.lineTo(0, 14); g.lineTo(-10, 6); g.lineTo(-12, -8); g.closePath(); },
  grenade: g => { g.arc(0, 3, 10, 0, 7); g.moveTo(-4, -7); g.lineTo(4, -7); g.lineTo(4, -13); g.lineTo(-4, -13); g.closePath(); },
  dash: g => { g.moveTo(-14, -8); g.lineTo(2, -8); g.moveTo(-10, 0); g.lineTo(14, 0); g.moveTo(-14, 8); g.lineTo(2, 8); },
};
/**
 * gameHUD(P) → widgets drawn with painter P. Each takes one options object; positions in px, colours from the page.
 *   minimap({ x, y, r, shape 'circle'|'square', fill, ring, ringW, content(ctx, x, y, r), player: { col, yaw, x, y }, north: { text, col, size } })
 *   ping({ x, y, ms, bars 4, lit 4, col, off, size 26, unit ' ms' })        x, y = left / baseline of the bars
 *   unitFrame({ x, y, r 40, fill, ring, portrait(ctx, x, y), name, nameSize, hp, mp (0..1), w 300, hpCol, mpCol, back })
 *   skillBar({ cx, y, n, s 70, g 10, fill, stroke, icons: [{ shape | draw(ctx), col }], keys: true | [labels], keyCol, cooldown: [0..1], cdCol })
 *   crosshair({ x, y, col, size 14, gap 7, w 3, style 'cross'|'dot'|'circle'|'chevron', spread 0, dot })
 *   hitMarker({ x, y, k 0..1, col, size 18, w 4 })
 *   ammo({ x, y, cur, max, col, dim, size 64, label, align 'right' })
 *   healthBar({ x, y, w, h, value 0..1, segments, col, back, label, labelCol })
 *   killFeed({ x, y, rows: [{ a, b, mid, colA, colB, alpha }], size 22, align 'right', fill })
 *   scoreBar({ cx, y, left: { text, col }, right: { text, col }, mid, size, fill })
 *   badge(text, x, y, col, opts) = P.chip
 *   netPanel(a, { x, y (required), w 440, title, statusCol, mode, modeCol, rows: [[label, value, col]], rowH 48, labelSize 24, valueSize 30 }) → bottom y
 */
export function gameHUD(P) {
  const { ctx, txt, rr, chip, panel, line, dot, theme: T } = P;
  function minimap(o) {
    const { x: mx, y: my, r } = o, sq = o.shape === 'square';
    const path = () => { ctx.beginPath(); if (sq) ctx.roundRect(mx - r, my - r, 2 * r, 2 * r, o.corner ?? 10); else ctx.arc(mx, my, r, 0, 7); };
    ctx.save(); path(); ctx.fillStyle = o.fill || 'rgba(16,16,18,.72)'; ctx.fill(); ctx.clip();
    if (o.content) o.content(ctx, mx, my, r);
    ctx.restore();
    path(); ctx.strokeStyle = o.ring || 'rgba(235,235,235,.6)'; ctx.lineWidth = o.ringW || 3; ctx.stroke();
    if (o.player) {
      ctx.save(); ctx.translate(mx + (o.player.x || 0), my + (o.player.y || 0)); if (o.player.yaw) ctx.rotate(o.player.yaw);
      ctx.fillStyle = o.player.col || T.text; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-9, -10); ctx.lineTo(-4, 0); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (o.north) txt(o.north.text ?? 'N', mx, my - r + 26, { size: o.north.size || 20, weight: 800, align: 'center', color: o.north.col || T.text });
  }
  function ping(o) {
    const n = o.bars ?? 4, lit = o.lit ?? n;
    for (let i = 0; i < n; i++) { ctx.fillStyle = i < lit ? (o.col || T.ok) : (o.off || 'rgba(255,255,255,.2)'); ctx.fillRect(o.x + i * 10, o.y - (i + 1) * 7, 6, (i + 1) * 7); }
    txt(o.ms + (o.unit ?? ' ms'), o.x + n * 10 + 8, o.y, { size: o.size || 26, weight: 700, mono: true, color: o.textCol || T.text, sh: 6 });
  }
  function unitFrame(o) {
    const { x, y } = o, r = o.r || 40, w = o.w || 300, bx = x + 56;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = o.fill || '#444'; ctx.fill(); ctx.strokeStyle = o.ring || 'rgba(240,240,240,.8)'; ctx.lineWidth = 3; ctx.stroke();
    if (o.portrait) o.portrait(ctx, x, y);
    if (o.name) txt(o.name, bx, y - 18, { size: o.nameSize || 26, weight: 800, sh: 6, color: o.nameCol || T.text });
    rr(bx, y - 6, w, 16, 4); ctx.fillStyle = o.back || 'rgba(0,0,0,.5)'; ctx.fill(); rr(bx, y - 6, w * (o.hp ?? 1), 16, 4); ctx.fillStyle = o.hpCol || T.ok; ctx.fill();
    if (o.mp != null) { rr(bx, y + 16, w, 10, 3); ctx.fillStyle = o.back || 'rgba(0,0,0,.5)'; ctx.fill(); rr(bx, y + 16, w * o.mp, 10, 3); ctx.fillStyle = o.mpCol || T.dim; ctx.fill(); }
  }
  function skillBar(o) {
    const n = o.n || o.icons.length, s = o.s || 70, g = o.g ?? 10, x0 = o.cx - (n * s + (n - 1) * g) / 2, y0 = o.y;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (s + g), ic = o.icons[i] || {};
      rr(x, y0, s, s, o.r ?? 8); ctx.fillStyle = o.fill || 'rgba(14,14,16,.8)'; ctx.fill(); ctx.strokeStyle = o.stroke || 'rgba(240,240,240,.4)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(x + s / 2, y0 + s / 2); ctx.strokeStyle = ic.col || T.text; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); if (ic.draw) ic.draw(ctx); else if (ICONS[ic.shape]) ICONS[ic.shape](ctx); ctx.stroke(); ctx.restore();
      const cd = o.cooldown && o.cooldown[i];
      if (cd > 0) { ctx.save(); rr(x, y0, s, s, o.r ?? 8); ctx.clip(); ctx.beginPath(); ctx.moveTo(x + s / 2, y0 + s / 2); ctx.arc(x + s / 2, y0 + s / 2, s, -Math.PI / 2, -Math.PI / 2 + cd * Math.PI * 2); ctx.closePath(); ctx.fillStyle = o.cdCol || 'rgba(0,0,0,.6)'; ctx.fill(); ctx.restore(); }
      if (o.keys !== false) txt(Array.isArray(o.keys) ? o.keys[i] : String(i + 1), x + 8, y0 + 20, { size: 16, weight: 700, mono: true, color: o.keyCol || T.dim });
    }
  }
  function crosshair(o) {
    const { x, y } = o, s = o.size || 14, gp = (o.gap ?? 7) + (o.spread || 0), w = o.w || 3, st = o.style || 'cross';
    ctx.save(); ctx.strokeStyle = o.col || T.text; ctx.fillStyle = o.col || T.text; ctx.lineWidth = w; ctx.lineCap = 'butt';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 4; ctx.beginPath();
    if (st === 'cross') { ctx.moveTo(x - gp - s, y); ctx.lineTo(x - gp, y); ctx.moveTo(x + gp, y); ctx.lineTo(x + gp + s, y); ctx.moveTo(x, y - gp - s); ctx.lineTo(x, y - gp); ctx.moveTo(x, y + gp); ctx.lineTo(x, y + gp + s); }
    else if (st === 'circle') { ctx.arc(x, y, gp + s / 2, 0, 7); }
    else if (st === 'chevron') { ctx.moveTo(x - s, y + gp + s * .6); ctx.lineTo(x, y + gp); ctx.lineTo(x + s, y + gp + s * .6); }
    ctx.stroke();
    if (st === 'dot' || o.dot) { ctx.beginPath(); ctx.arc(x, y, Math.max(2, w * .9), 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function hitMarker(o) {
    const k = o.k ?? 1; if (k <= 0 || k >= 1) return;
    const s = (o.size || 18) * (1 + .25 * (1 - k)), g = 6 + 4 * k;
    ctx.save(); ctx.globalAlpha *= 1 - k * k; ctx.strokeStyle = o.col || T.text; ctx.lineWidth = o.w || 4; ctx.lineCap = 'round'; ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(o.x + dx * g, o.y + dy * g); ctx.lineTo(o.x + dx * (g + s * .7), o.y + dy * (g + s * .7)); }
    ctx.stroke(); ctx.restore();
  }
  function ammo(o) {
    const al = o.align || 'right', sz = o.size || 64;
    const mw = P.tw(' / ' + o.max, sz * .45, 700, true);
    txt(String(o.cur), al === 'right' ? o.x - mw : o.x, o.y, { size: sz, weight: 800, mono: true, color: o.col || T.text, align: al, sh: 8 });
    txt(' / ' + o.max, al === 'right' ? o.x : o.x + P.tw(String(o.cur), sz, 800, true), o.y, { size: sz * .45, weight: 700, mono: true, color: o.dim || T.dim, align: al === 'right' ? 'right' : 'left', sh: 6 });
    if (o.label) txt(o.label, o.x, o.y + sz * .45, { size: 18, weight: 700, mono: true, color: o.dim || T.dim, align: al, ls: 2 });
  }
  function healthBar(o) {
    const { x, y, w, h = 18 } = o, n = o.segments || 1, gap = n > 1 ? 4 : 0, sw = (w - gap * (n - 1)) / n, v = clamp(o.value ?? 1);
    for (let i = 0; i < n; i++) {
      const sx = x + i * (sw + gap), f = clamp(v * n - i);
      ctx.fillStyle = o.back || 'rgba(0,0,0,.5)'; ctx.fillRect(sx, y, sw, h);
      if (f > 0) { ctx.fillStyle = o.col || T.ok; ctx.fillRect(sx, y, sw * f, h); }
    }
    if (o.label) txt(o.label, x, y - 10, { size: o.labelSize || 22, weight: 800, mono: true, color: o.labelCol || T.text, sh: 6 });
  }
  function killFeed(o) {
    const sz = o.size || 22, rh = sz * 1.75, al = o.align || 'right';
    (o.rows || []).forEach((r, i) => {
      const a = r.alpha ?? 1; if (a <= 0) return;
      const mid = r.mid ?? '›', parts = [[r.a, r.colA || T.text, 700], [' ' + mid + ' ', T.dim, 500], [r.b, r.colB || T.text, 700]];
      const wsum = parts.reduce((q, [s, , wt]) => q + P.tw(s, sz, wt), 0), y = o.y + i * rh, x0 = al === 'right' ? o.x - wsum : o.x;
      ctx.save(); ctx.globalAlpha *= a; panel(x0 - 12, y - sz * 1.05, wsum + 24, sz * 1.5, { r: 6, fill: o.fill || 'rgba(0,0,0,.45)', stroke: null }); ctx.restore();
      let x = x0; for (const [s, col, wt] of parts) { txt(s, x, y, { size: sz, weight: wt, color: col, alpha: a }); x += P.tw(s, sz, wt); }
    });
  }
  function scoreBar(o) {
    const sz = o.size || 30, h = sz * 1.6, wl = P.tw(o.left.text, sz, 800, true) + sz, wr = P.tw(o.right.text, sz, 800, true) + sz, wm = o.mid ? P.tw(o.mid, sz * .8, 700, true) + sz : 12;
    const x0 = o.cx - wm / 2 - wl;
    panel(x0, o.y - h / 2, wl + wm + wr, h, { r: 6, fill: o.fill || 'rgba(0,0,0,.55)', stroke: null });
    rr(x0, o.y - h / 2, wl, h, 6); ctx.fillStyle = P.rgba(o.left.col, .85); ctx.fill();
    rr(x0 + wl + wm, o.y - h / 2, wr, h, 6); ctx.fillStyle = P.rgba(o.right.col, .85); ctx.fill();
    txt(o.left.text, x0 + wl / 2, o.y + sz * .36, { size: sz, weight: 800, mono: true, align: 'center', color: o.ink || T.chipInk });
    txt(o.right.text, x0 + wl + wm + wr / 2, o.y + sz * .36, { size: sz, weight: 800, mono: true, align: 'center', color: o.ink || T.chipInk });
    if (o.mid) txt(o.mid, o.cx, o.y + sz * .3, { size: sz * .8, weight: 700, mono: true, align: 'center', color: T.text });
  }
  function netPanel(a, o = {}) {
    if (o.x === undefined || o.y === undefined) throw new Error('netPanel: x and y are required (place it where it does not cover the action)');
    const { x, y, w = 440, title = 'DEBUG', mode = null, modeCol = T.text, rows = [], rowH = 48, labelSize = 24, valueSize = 30, statusCol = T.ok } = o;
    if (a <= 0) return y;
    const h = 76 + rows.length * rowH;
    panel(x, y, w, h, { alpha: a, r: o.r ?? 10 });
    ctx.save(); ctx.globalAlpha *= a;
    dot(x + 26, y + 33, 6, statusCol, 1, 10);
    txt(title, x + 42, y + 42, { size: 24, weight: 800, mono: true });
    if (mode) chip(mode, x + w - 16, y + 34, modeCol, { align: 'right', size: 19 });
    line(x + 16, y + 62, x + w - 16, y + 62, T.line, 1.5);
    rows.forEach(([lab, val, col], i) => {
      const yy = y + 102 + i * rowH;
      txt(lab, x + 24, yy, { size: labelSize, mono: true, color: T.dim });
      txt(val, x + w - 24, yy, { size: valueSize, weight: 700, mono: true, color: col || T.text, align: 'right' });
    });
    ctx.restore();
    return y + h;
  }
  return { minimap, ping, unitFrame, skillBar, crosshair, hitMarker, ammo, healthBar, killFeed, scoreBar, netPanel, badge: chip, ICONS };
}
