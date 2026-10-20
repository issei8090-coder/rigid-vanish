// 剛体消失 — 共通のリアル3D描画キット（ES Module）
// 使い方（ページ側に importmap で three と three/addons/ を定義しておく）:
//   import { createWorld, M, tex } from '../shared/real3d.js';
//   const W = await createWorld(stageElement, { camera: [0, 2, 8], target: [0, 1, 0] });
//   W.scene.add(new THREE.Mesh(geo, M.wood()));
//   W.onFrame(dt => { ... }); // 毎フレーム呼ばれる。描画は自動
//
// 方針: HDRI の映り込み + 影 + ほんのりブルーム + ACES トーンマップで「本物っぽい」見た目にそろえる。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const HDR_URL = new URL('../assets/hdr/studio_1k.hdr', import.meta.url).href;
export const ASSET = p => new URL('../assets/' + p, import.meta.url).href;

// ---------- 手続き的テクスチャ（画像ファイルなしで木目・石・コンクリートを作る） ----------
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function speckle(g, w, h, n, alpha, seed, light = false) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    const s = r() * 2.2 + 0.4;
    g.fillRect(r() * w, r() * h, s, s);
  }
}
export const tex = {
  wood(base = '#a8743f', dark = '#6e4421', seed = 7, repeat = [1, 1]) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const r = rand(seed);
      for (let i = 0; i < 120; i++) {
        // 横方向に周期的な波にして、タイルの継ぎ目が見えないようにする
        const y0 = r() * h, amp = 4 + r() * 10, f = (Math.PI * 2 / w) * (1 + Math.floor(r() * 4)), ph = r() * 6;
        g.strokeStyle = `rgba(${parseInt(dark.slice(1, 3), 16)},${parseInt(dark.slice(3, 5), 16)},${parseInt(dark.slice(5, 7), 16)},${0.18 + r() * 0.4})`;
        g.lineWidth = 0.6 + r() * 2.4;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3) * amp * 0.25);
        g.stroke();
      }
      speckle(g, w, h, 1800, 0.12, seed + 1);
    }, { repeat });
  },
  stone(base = '#787e86', seed = 3, repeat = [1, 1]) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const r = rand(seed);
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = r() * h, rad = 6 + r() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const d = r() > 0.5 ? 255 : 0;
        gr.addColorStop(0, `rgba(${d},${d},${d},${0.05 + r() * 0.08})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      speckle(g, w, h, 6000, 0.25, seed + 2); speckle(g, w, h, 3000, 0.2, seed + 5, true);
    }, { repeat });
  },
  concrete(seed = 11, repeat = [6, 6]) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#5b6168'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 14000, 0.18, seed); speckle(g, w, h, 6000, 0.12, seed + 3, true);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, { repeat });
  },
  // 物理実験室っぽい方眼の床
  labFloor(repeat = [8, 8]) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#2b3138'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, 0.14, 21); speckle(g, w, h, 4000, 0.08, 22, true);
      g.strokeStyle = 'rgba(160,190,220,.05)'; g.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { const p = (i / 8) * w; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      g.strokeStyle = 'rgba(160,190,220,.10)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    }, { repeat });
  },
  // 粗さマップ用のノイズ（色なし）
  roughNoise(seed = 5, repeat = [1, 1]) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, 0.35, seed); speckle(g, w, h, 5000, 0.35, seed + 1, true);
    }, { repeat, srgb: false });
  },
  // 文字や図を描いたラベル（ページ、メーター、看板など）
  label(draw, w = 512, h = 512) { return canvasTex(w, h, draw); }
};

// ---------- 質感（マテリアル） ----------
export const M = {
  wood: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: tex.wood(o.base, o.dark, o.seed), roughness: 0.62, metalness: 0 }, o.mat)),
  steel: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xc9ced6, roughness: 0.28, metalness: 1, roughnessMap: tex.roughNoise(9) }, o)),
  brass: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xd8a849, roughness: 0.3, metalness: 1 }, o)),
  chrome: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.06, metalness: 1 }, o)),
  rubber: (color = 0x222428, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o)),
  plastic: (color = 0xff7a45, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }, o)),
  paint: (color = 0x5cc8ff, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.45, clearcoat: 0.3 }, o)),
  stone: (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: tex.stone(o.base, o.seed), roughness: 0.9, metalness: 0, bumpMap: tex.roughNoise(o.seed || 3), bumpScale: 0.6 }, o.mat)),
  concrete: (repeat) => new THREE.MeshStandardMaterial({ map: tex.concrete(11, repeat), roughness: 0.95 }),
  // ゼリー・豆腐・ゴムのような「やわらかい物」— 光が中まで入る半透明
  jelly: (color = 0xff8a5c, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color, roughness: 0.18, metalness: 0, transmission: 0.82, thickness: 0.9, ior: 1.36,
    attenuationColor: new THREE.Color(color), attenuationDistance: 0.6, clearcoat: 1, clearcoatRoughness: 0.15
  }, o)),
  tofu: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: 0xf6f1e4, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), transmission: 0.12, thickness: 1 }, o)),
  glass: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: 0xffffff, roughness: 0.04, transmission: 1, thickness: 0.4, ior: 1.5 }, o)),
  cloth: (color = 0x3f5b7a, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9fb6d0), side: THREE.DoubleSide }, o)),
  paper: (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: 0xf3ead6, map: map || null, roughness: 0.92 }, o)),
  glow: (color = 0xffd166, intensity = 3) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
  water: (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: 0x9fd8ff, roughness: 0.05, transmission: 0.95, thickness: 1.2, ior: 1.33, attenuationColor: new THREE.Color(0x3fa0e0), attenuationDistance: 1.5 }, o))
};

// かたさ κ に応じて「かたい（青い金属光沢）→ やわらかい（オレンジの半透明）」へ色を寄せる
const C_RIGID = new THREE.Color(0x5cc8ff), C_SOFT = new THREE.Color(0xff7a45);
export function kappaColor(k, out = new THREE.Color()) { return out.copy(C_SOFT).lerp(C_RIGID, Math.max(0, Math.min(1, k))); }

// ---------- ワールド ----------
export async function createWorld(container, opt = {}) {
  const o = Object.assign({
    camera: [0, 2.5, 9], target: [0, 1, 0], fov: 40, controls: true, ground: true, groundSize: 60,
    groundMat: null, bloom: 0.35, exposure: 1.0, background: 0x111821, fog: true, shadows: true,
    envIntensity: 1.0, sun: [6, 10, 6], shadowBox: 12
  }, opt);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.shadowMap.enabled = o.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.background);
  if (o.fog) scene.fog = new THREE.Fog(o.background, o.groundSize * 0.18, o.groundSize * 0.5);

  const camera = new THREE.PerspectiveCamera(o.fov, 1, 0.05, 400);
  camera.position.set(...o.camera);

  // 映り込み用の環境光：まず即席の RoomEnvironment、HDRI が読めたら差し替え
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = o.envIntensity;
  new RGBELoader().loadAsync(HDR_URL).then(hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  }).catch(() => { /* RoomEnvironment のまま続行 */ });

  // 光：太陽（影あり）＋ 逆光のリムライト ＋ 弱い半球光
  const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
  sun.position.set(...o.sun);
  sun.castShadow = o.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sb = o.shadowBox;
  Object.assign(sun.shadow.camera, { left: -sb, right: sb, top: sb, bottom: -sb, near: 0.5, far: 60 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 0.9);
  rim.position.set(-6, 5, -8);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1410, 0.35));

  let ground = null;
  if (o.ground) {
    const gm = o.groundMat || new THREE.MeshStandardMaterial({ map: tex.labFloor([o.groundSize / 4, o.groundSize / 4]), roughness: 0.85, metalness: 0.05 });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(o.groundSize, o.groundSize), gm);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  let controls = null;
  if (o.controls) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...o.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1;
    controls.maxDistance = 60;
    controls.update();
  } else {
    camera.lookAt(...o.target);
  }

  // ポストエフェクト：ブルーム（光るものだけがにじむ程度）
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloom, 0.5, 0.85);
  if (o.bloom > 0) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const frameFns = [];
  const clock = new THREE.Clock();
  let alive = true;
  function frame() {
    if (!alive) return;
    const dt = Math.min(0.05, clock.getDelta());
    for (const f of frameFns) f(dt, clock.elapsedTime);
    controls && controls.update();
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // メッシュに影を落とす/受ける設定をまとめて付ける
  function shadow(obj, cast = true, receive = true) {
    obj.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
    return obj;
  }
  function add(obj, { cast = true, receive = true } = {}) { scene.add(shadow(obj, cast, receive)); return obj; }

  // 画面上の位置（ラベルを HTML で重ねるとき用）
  const _v = new THREE.Vector3();
  function toScreen(v3) {
    _v.copy(v3).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (_v.x + 1) / 2 * r.width, y: r.top + (1 - _v.y) / 2 * r.height, behind: _v.z > 1 };
  }

  return {
    THREE, renderer, scene, camera, controls, composer, bloom, sun, rim, ground,
    onFrame(fn) { frameFns.push(fn); return fn; },
    offFrame(fn) { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); },
    add, shadow, toScreen, resize,
    stop() { alive = false; }
  };
}

// 2D 物理（x 右, y 上, 角度 a [rad]）の結果を 3D メッシュへ写す。z は奥行き（既定 0）
export function sync2D(mesh, x, y, a = 0, z = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(0, 0, a);
}

// 角を丸めた箱（RoundedBoxGeometry の簡易版を addons から）
export async function roundedBox(w, h, d, r = 0.06, seg = 3) {
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

// GLTF モデル読み込み
export async function loadGLTF(url) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  return new GLTFLoader().loadAsync(url);
}
