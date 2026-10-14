import * as THREE from 'three';
import { Baker, bakedGlowMaterial, surf, vertexPBR, type Surface } from '../bake';
import { G } from '../parts';
import { RenderSettings } from '../settings';
import { contactAO } from '../ao';
import type { LightLook, Quality } from '../stage';
import { J } from '../../sim/body';
import { PoseCh, sample } from './puppet';
import * as BP from './beachPoses';
import { box, canvas, glowAt, hash, put, putS, ramp, seg, smooth, texture, type HomeScene, type SceneKit } from './scene';

/** Water level, and the sun (direction towards it). */
const SEA = -0.12;
const SUN = new THREE.Vector3(0.42, 0.5, -0.76).normalize();

/** Sand height. The beach is flat round the lounger, shelves into the sea and rises into dunes behind. */
function sandH(x: number, z: number) {
  let h = 0;
  if (z < -3.2) h = Math.max(-6, (z + 3.2) * 0.075);
  h += smooth((z - 8) / 16) * 1.7 * (0.75 + 0.25 * Math.sin(x * 0.21 + 1.3));
  const r = Math.hypot(x, z + 0.2);
  h += 0.05 * Math.sin(x * 0.55 + z * 0.3) * Math.sin(z * 0.8 - x * 0.25) * smooth((z + 2) / 3) * smooth((r - 2.5) / 2.5);
  return h;
}

const LOOK: LightLook = {
  background: 0xbfdcef,
  fog: 0xcfe3ee,
  fogDensity: 0.0065,
  envIntensity: 0.85,
  hemi: { sky: 0xc4e2ff, ground: 0xe3cb9c, intensity: 0.95 },
  key: {
    color: 0xfff0d8,
    intensity: 3.3,
    pos: [SUN.x * 30, 0.5 + SUN.y * 30, SUN.z * 30],
    target: [0, 0.5, 0],
    angle: 1.15,
    penumbra: 0.12,
    near: 12,
    far: 52,
    focus: 0.27,
  },
  rims: [
    { color: 0xffd8a2, intensity: 5, distance: 8, pos: [1.6, 0.35, -2.4] },
    { color: 0x9ccaff, intensity: 7, distance: 10, pos: [-2.4, 3.2, 2.6] },
  ],
};

const COL = {
  zenith: new THREE.Color(0x2f7fd6),
  horizon: new THREE.Color(0xcfe3ee),
  sun: new THREE.Color(0xfff2d6),
  shallow: new THREE.Color(0x5fe0cf),
  mid: new THREE.Color(0x1aa3b8),
  deep: new THREE.Color(0x0b4d84),
  foam: new THREE.Color(0xf4fbff),
};

const S = {
  wood: surf(0xb98552, 0, 0.62),
  woodDark: surf(0x7c5434, 0, 0.7),
  white: surf(0xf1efe9, 0.05, 0.5),
  teal: surf(0x1fb3b0, 0.05, 0.6),
  coral: surf(0xff6b5a, 0.05, 0.6),
  yellow: surf(0xffc93c, 0.05, 0.55),
  chrome: surf(0xdfe4ea, 1, 0.16),
  steel: surf(0x8b929c, 0.8, 0.35),
  black: surf(0x16181c, 0.4, 0.45),
  rubber: surf(0x1d1f22, 0, 0.9),
  bark: surf(0x8a6c4a, 0, 0.86),
  barkDark: surf(0x6b5136, 0, 0.9),
  nut: surf(0x5d4127, 0, 0.8),
  nutGreen: surf(0x7e8f37, 0, 0.6),
  flesh: surf(0xf4f0e2, 0, 0.5),
  straw: surf(0xd9b26a, 0, 0.85),
  strawDark: surf(0xa77f45, 0, 0.9),
  bamboo: surf(0xc7a160, 0, 0.6),
  red: surf(0xe2342c, 0.1, 0.5),
  blue: surf(0x2a6fd6, 0.1, 0.5),
  sand: surf(0xe2c895, 0, 0.95),
  rock: surf(0x7d756b, 0, 0.9),
  island: surf(0x6f8a62, 0, 0.95),
  islandSand: surf(0xe6d3a8, 0, 0.95),
  sail: surf(0xf6f3ea, 0, 0.6),
  gold: surf(0xd8ad52, 1, 0.24),
  lens: surf(0x07080a, 0.9, 0.06),
  pink: surf(0xff7fb0, 0.05, 0.55),
};

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));

// ------------------------------------------------------------------ textures

function sandTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#d9c296';
  g.fillRect(0, 0, 512, 512);
  // wind ripples
  g.globalAlpha = 0.06;
  for (let y = 0; y < 512; y += 9) {
    g.strokeStyle = (y / 9) % 2 ? '#fff6dc' : '#9c8355';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + y * 0.3) * 4);
    g.stroke();
  }
  // grains
  g.globalAlpha = 1;
  for (let i = 0; i < 9000; i++) {
    const x = hash(i * 1.7) * 512, y = hash(i * 3.1 + 7) * 512;
    const k = hash(i * 5.3);
    g.fillStyle = k < 0.45 ? 'rgba(255,248,226,0.35)' : k < 0.9 ? 'rgba(120,96,60,0.25)' : 'rgba(60,50,40,0.4)';
    g.fillRect(x, y, 1 + (k > 0.97 ? 1 : 0), 1);
  }
  return texture(c, true);
}

function cloudTexture() {
  const { c, g } = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  for (let n = 0; n < 16; n++) {
    const cx = hash(n * 9.1) * 512, cy = hash(n * 4.7 + 2) * 512;
    const w = 50 + hash(n * 2.3) * 110;
    for (let i = 0; i < 22; i++) {
      const x = cx + (hash(n * 31 + i) - 0.5) * w * 2;
      const y = cy + (hash(n * 17 + i * 3) - 0.5) * w * 0.5;
      const r = w * (0.25 + hash(n * 7 + i * 5) * 0.4);
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.32)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  const t = texture(c, true, false);
  return t;
}

function leafTexture() {
  const { c, g } = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  // leaflets along the rib, tilted towards the tip, narrowing to the end
  for (let i = 0; i < 64; i++) {
    const v = 20 + i * 7.6;
    const span = 60 * Math.sin(Math.PI * Math.min(1, (v / 512) * 1.05)) + 6;
    for (const s of [-1, 1]) {
      g.strokeStyle = i % 3 ? '#3f7d2c' : '#4f9334';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(64, v);
      g.quadraticCurveTo(64 + s * span * 0.5, v + 8, 64 + s * span, v + 26);
      g.stroke();
      g.strokeStyle = 'rgba(160,210,110,0.35)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  g.strokeStyle = '#8c8a3c';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 512);
  g.stroke();
  return texture(c);
}

function stripeTexture(a: string, b: string, n: number) {
  const { c, g } = canvas(256, 32);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / n, 0, 256 / n + 1, 32);
  }
  return texture(c);
}

function footprintTexture() {
  const { c, g } = canvas(64, 128);
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,1)';
  // a robot's flat, treaded sole
  g.beginPath();
  g.roundRect(14, 12, 36, 104, 14);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let y = 22; y < 110; y += 12) g.fillRect(18, y, 28, 4);
  return texture(c);
}

function holoTexture() {
  const { c, g } = canvas(512, 256);
  g.clearRect(0, 0, 512, 256);
  g.strokeStyle = '#7ff4ff';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(10, 10, 492, 236, 28);
  g.stroke();
  g.fillStyle = 'rgba(40,190,255,0.18)';
  g.fill();
  g.fillStyle = '#bff8ff';
  g.textAlign = 'center';
  g.font = '600 34px Rajdhani, sans-serif';
  g.fillText('INCOMING CALL', 256, 70);
  g.font = '64px "Russo One", sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText('THE ARENA', 256, 145);
  g.font = '600 30px Rajdhani, sans-serif';
  g.fillStyle = '#ffd36b';
  g.fillText('YOUR FIGHT IS ON', 256, 205);
  return texture(c);
}

// ------------------------------------------------------------------ shaders

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun, uZenith, uHorizon, uSunCol;
  uniform sampler2D uClouds;
  uniform float uTime;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
    float s = max(dot(d, uSun), 0.0);
    col += uSunCol * (pow(s, 1400.0) * 24.0 + pow(s, 90.0) * 0.5 + pow(s, 7.0) * 0.18);
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.1) * 0.16 + vec2(uTime * 0.0025, uTime * 0.0008);
      float a = texture2D(uClouds, uv).a + texture2D(uClouds, uv * 2.1 + 0.37).a * 0.5;
      a = smoothstep(0.18, 0.9, a) * smoothstep(0.0, 0.2, h);
      vec3 cc = vec3(1.05, 1.04, 1.02) + uSunCol * pow(s, 5.0) * 0.5;
      col = mix(col, cc, a * 0.9);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const SEA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float off = smoothstep(4.0, 30.0, -w.z);
    w.y += (sin(w.x * 0.31 + uTime * 1.05) * 0.5 + sin(w.z * 0.47 - uTime * 1.35 + w.x * 0.11) * 0.5) * 0.07 * off;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const SEA_FRAG = /* glsl */ `
  uniform vec3 uSun, uSunCol, uHorizon, uZenith, uShallow, uMid, uDeep, uFoam;
  uniform float uTime, uSeaY;
  varying vec3 vW;
  float sandH(vec2 p) { return p.y < -3.2 ? max(-6.0, (p.y + 3.2) * 0.075) : 0.0; }
  void main() {
    vec2 p = vW.xz;
    float t = uTime;
    // the swash: the water's edge runs up the sand and back
    float wl = uSeaY + 0.05 * sin(t * 0.55) + 0.02 * sin(t * 1.3 + p.x * 0.15);
    float depth = wl - sandH(p);
    if (depth < -0.01) discard;
    // ripples: a few travelling waves, slope by slope
    vec2 g = vec2(0.0);
    g += vec2(0.31, 0.0) * cos(p.x * 0.31 + t * 1.05) * 0.035;
    g += vec2(0.11, 0.47) * cos(p.y * 0.47 - t * 1.35 + p.x * 0.11) * 0.035;
    g += vec2(1.7, 1.1) * cos(dot(p, vec2(1.7, 1.1)) + t * 2.1) * 0.012;
    g += vec2(-1.3, 2.3) * cos(dot(p, vec2(-1.3, 2.3)) - t * 2.6) * 0.01;
    g += vec2(3.1, -0.8) * cos(dot(p, vec2(3.1, -0.8)) + t * 3.3) * 0.006;
    g += vec2(0.7, 4.1) * cos(dot(p, vec2(0.7, 4.1)) - t * 3.9) * 0.005;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vW);
    float dist = length(vW.xz - cameraPosition.xz);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
    vec3 water = mix(uShallow, uMid, smoothstep(0.05, 0.9, depth));
    water = mix(water, uDeep, smoothstep(1.0, 5.0, depth));
    water *= 0.62 + 0.5 * max(dot(n, uSun), 0.0);
    vec3 col = mix(water, sky, fres);
    float rs = max(dot(R, uSun), 0.0);
    col += uSunCol * (pow(rs, 500.0) * 26.0 + pow(rs, 40.0) * 0.35) * smoothstep(0.0, 0.3, depth);
    // foam: the edge of the swash, and broken waves rolling in over the shallows
    float edge = smoothstep(0.06, 0.0, depth);
    float roll = sin(-p.y * 2.4 + t * 1.5 + sin(p.x * 0.6) * 0.9);
    float bands = smoothstep(0.7, 1.0, roll) * smoothstep(0.55, 0.06, depth);
    float speck = 0.55 + 0.45 * sin(p.x * 9.0 + sin(p.y * 7.0) * 2.0) * sin(p.y * 11.0 + t);
    float foam = clamp(edge * (0.7 + 0.3 * speck) + bands * speck, 0.0, 1.0) * smoothstep(40.0, 8.0, dist);
    col = mix(col, uFoam, foam * 0.85);
    // haze out to the horizon (the far edge melts into the sky's horizon colour)
    col = mix(col, uHorizon, smoothstep(25.0, 105.0, dist));
    float a = smoothstep(-0.01, 0.16, depth) * mix(0.6, 1.0, smoothstep(0.1, 1.4, depth));
    a = max(a, foam * 0.9);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Non-uniform grid coordinates: fine near `c`, opening out towards both ends. */
function axis(lo: number, hi: number, nLo: number, nHi: number, k = 1.8) {
  const out: number[] = [];
  for (let i = nLo; i > 0; i--) out.push(lo * Math.pow(i / nLo, k));
  out.push(0);
  for (let i = 1; i <= nHi; i++) out.push(hi * Math.pow(i / nHi, k));
  return out;
}

// ------------------------------------------------------------------ the scene

/**
 * A tropical beach: the robot on a sun lounger under palms, coconut in hand and shades on, the
 * sea running up the sand. On Fight, its phone buzzes: the arena is calling. It answers, tosses
 * the coconut, flips its shades up with its eyes blazing, gets up and squares up to the camera.
 */
export class Beach implements HomeScene {
  readonly group = new THREE.Group();
  readonly look = LOOK;
  readonly env: THREE.Texture;
  readonly crowd = 0;
  over = false;
  /** Lounger, tables and parasol: scaled with the robot, so any size of bot fits the lounger. */
  private near = new THREE.Group();
  private sky: THREE.ShaderMaterial;
  private sea: THREE.ShaderMaterial;
  private sway = { value: 0 };
  private phone = new THREE.Group();
  private screen: THREE.MeshBasicMaterial;
  private coconut: THREE.Mesh;
  private glasses: THREE.Mesh;
  private holo: THREE.Mesh;
  private holoMat: THREE.MeshBasicMaterial;
  private gullBody: THREE.InstancedMesh;
  private gullWing: THREE.InstancedMesh;
  private boat = new THREE.Group();
  private pose = new Float32Array(PoseCh.N);
  private mode: 'idle' | 'outro' = 'idle';
  private t = 0;
  private size = 1;
  private coco = { held: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), resting: false, bounced: 0 };
  private phoneHeld = false;
  private phoneDrop = -1;
  private lastHand = new THREE.Vector3();
  private handVel = new THREE.Vector3();
  private beats = new Set<string>();
  private nextRing = 0;
  private eyes = 1;

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    const g = this.group;
    g.visible = false;

    // ------------------------------------------------------------ sky
    const clouds = cloudTexture();
    this.sky = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: SUN },
        uZenith: { value: COL.zenith },
        uHorizon: { value: COL.horizon },
        uSunCol: { value: COL.sun },
        uClouds: { value: clouds },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.sky);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    g.add(dome);

    // ------------------------------------------------------------ sand
    const xs = axis(-90, 90, 30, 30);
    const zs = axis(-16, 80, 18, 34);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const dry = new THREE.Color(0xf0dcae), wet = new THREE.Color(0xb59866), under = new THREE.Color(0x9c8a62), tmp = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = xs[i], z = zs[j];
        const y = sandH(x, z);
        pos.set([x, y, z], k * 3);
        uv.set([x / 1.6, z / 1.6], k * 2);
        // wet below where the swash reaches, a touch of variation everywhere
        const w = smooth((SEA + 0.12 - y) / 0.12);
        tmp.copy(dry).lerp(wet, w);
        if (y < SEA - 0.05) tmp.lerp(under, smooth((SEA - 0.05 - y) / 0.4));
        tmp.multiplyScalar(0.94 + 0.08 * hash(i * 13 + j * 7));
        col.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const sandGeo = new THREE.BufferGeometry();
    sandGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sandGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sandGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    sandGeo.setIndex(idx);
    sandGeo.computeVertexNormals();
    const sandMat = contactAO.patch(new THREE.MeshStandardMaterial({ map: sandTexture(), vertexColors: true, roughness: 0.96, metalness: 0 }), {
      spheres: true,
      strength: 1.6,
      direct: 0.6,
    });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.receiveShadow = true;
    g.add(sand);

    // ------------------------------------------------------------ sea
    this.sea = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: SUN },
        uSunCol: { value: COL.sun },
        uHorizon: { value: COL.horizon },
        uZenith: { value: COL.zenith },
        uShallow: { value: COL.shallow },
        uMid: { value: COL.mid },
        uDeep: { value: COL.deep },
        uFoam: { value: COL.foam },
        uTime: { value: 0 },
        uSeaY: { value: SEA },
      },
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const seaGeo = new THREE.PlaneGeometry(240, 120, 48, 30);
    seaGeo.rotateX(-Math.PI / 2);
    seaGeo.translate(0, SEA + 0.08, -3.6 - 60);
    const sea = new THREE.Mesh(seaGeo, this.sea);
    sea.renderOrder = -1;
    sea.frustumCulled = false;
    g.add(sea);

    // ------------------------------------------------------------ scenery (static, baked)
    const far = new Baker();
    const near = new Baker();
    const fronds = { pos: [] as number[], uv: [] as number[], sway: [] as number[], idx: [] as number[] };
    const palms: [number, number, number, number, number][] = [
      // x, z, height, lean yaw, lean
      [-3.3, 2.9, 6.2, 2.4, 1.3],
      [4.4, 4.6, 7.4, -0.5, 1.6],
      [-7.4, 6.8, 8.2, 2.9, 1.0],
      [9.6, 1.2, 6.6, -1.4, 1.9],
      [1.8, 10.5, 9.0, 0.3, 0.8],
      [-12.5, -0.8, 7.0, 1.9, 1.7],
      [15, 8, 8.6, -0.9, 1.1],
      [-18, 9, 9.4, 2.2, 0.9],
    ];
    palms.forEach(([x, z, h, ly, lean], i) => this.palm(far, fronds, new THREE.Vector3(x, sandH(x, z) - 0.1, z), h, ly, lean, i));
    this.bar(far, 6.8, 7.8);
    this.lifeguard(far, -9.5, 3.4);
    this.dunes(far);
    this.shoreBits(far);
    this.islands(far);
    this.lounger(near);
    // two more loungers and a parasol down the beach
    this.spareLounger(far, -4.6, -0.6, 0.15);
    this.spareLounger(far, 5.6, -1.3, -0.25);

    const props = (b: Baker, cast: boolean, parent: THREE.Object3D, key: string) => {
      const { opaque, emissive } = b.build();
      if (opaque) {
        const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), key), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
        m.castShadow = cast;
        m.receiveShadow = true;
        parent.add(m);
      }
      if (emissive) parent.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    };
    props(far, true, g, 'beach-far');
    props(near, true, this.near, 'beach-near');
    g.add(this.near);

    // stripy cushions and canopy: their own textured meshes
    this.cushions();
    this.parasol(-1.0, 0.6, 2.15, 1.25, 0.12);

    // palm fronds: one swaying, alpha-tested mesh for every palm
    const leaf = leafTexture();
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fronds.pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fronds.uv, 2));
    fg.setAttribute('sway', new THREE.Float32BufferAttribute(fronds.sway, 1));
    fg.setIndex(fronds.idx);
    fg.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    const sway = this.sway;
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float sw = sway * sway;
          transformed += vec3(sin(uSway * 1.3 + position.x * 0.4 + position.z * 0.2), 0.5 * sin(uSway * 2.1 + position.z * 0.5), cos(uSway * 1.1 + position.x * 0.3)) * 0.09 * sw;`,
        );
    };
    fm.customProgramCacheKey = () => 'palm-frond';
    const fmesh = new THREE.Mesh(fg, fm);
    fmesh.castShadow = true;
    fmesh.receiveShadow = true;
    fmesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.5 });
    g.add(fmesh);

    // robot footprints in the sand, from the beach bar to the lounger
    this.footprints();

    // ------------------------------------------------------------ props the robot handles
    const pb = new Baker();
    box(pb, 0.078, 0.011, 0.155, 0, 0, 0, S.black, 0, 0, 0, 0.004);
    box(pb, 0.07, 0.003, 0.012, 0, -0.006, -0.06, S.steel);
    const pg = pb.build().opaque!;
    this.phone.add(new THREE.Mesh(pg, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-phone')));
    this.screen = new THREE.MeshBasicMaterial({ color: glow(0x2a6a8a, 1), toneMapped: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.135), this.screen);
    scr.rotation.x = -Math.PI / 2;
    scr.position.y = 0.0062;
    this.phone.add(scr);
    g.add(this.phone);

    const cb = new Baker();
    putS(cb, G.sphere(0.1, 14, 10), 0, 0, 0, S.nutGreen, 1, 1.12, 1);
    put(cb, G.cyl(0.055, 0.06, 0.012, 12), 0, 0.105, 0, S.flesh);
    seg(cb, new THREE.Vector3(0.012, 0.1, 0), new THREE.Vector3(0.05, 0.27, 0.02), 0.006, 0.006, S.pink, 6);
    seg(cb, new THREE.Vector3(-0.02, 0.1, 0.01), new THREE.Vector3(-0.07, 0.22, 0.03), 0.003, 0.003, S.woodDark, 5);
    put(cb, G.cone(0.075, 0.04, 8), -0.075, 0.235, 0.03, S.coral, 0, 0, 0.35);
    this.coconut = new THREE.Mesh(cb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-coconut'));
    this.coconut.castShadow = true;
    g.add(this.coconut);

    // shades: worn on the head bone, so they turn with it
    const sb = new Baker();
    for (const s of [-1, 1]) {
      box(sb, 0.082, 0.042, 0.01, s * 0.048, 0.012, 0.155, S.lens, 0, 0, 0, 0.012);
      box(sb, 0.09, 0.008, 0.012, s * 0.048, 0.036, 0.155, S.gold);
      seg(sb, new THREE.Vector3(s * 0.094, 0.032, 0.152), new THREE.Vector3(s * 0.112, 0.03, 0.02), 0.004, 0.004, S.gold, 5);
    }
    box(sb, 0.018, 0.006, 0.01, 0, 0.03, 0.157, S.gold);
    this.glasses = new THREE.Mesh(sb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-shades'));

    this.holoMat = new THREE.MeshBasicMaterial({ map: holoTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), this.holoMat);
    this.holo.visible = false;
    g.add(this.holo);

    // ------------------------------------------------------------ life: gulls and a sailing boat
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7 });
    const bodyGeo = new THREE.SphereGeometry(0.09, 8, 6);
    bodyGeo.scale(0.8, 0.7, 2.2);
    this.gullBody = new THREE.InstancedMesh(bodyGeo, white, 4);
    const wingGeo = new THREE.BoxGeometry(0.42, 0.012, 0.13);
    wingGeo.translate(0.21, 0, 0);
    this.gullWing = new THREE.InstancedMesh(wingGeo, white, 8);
    this.gullBody.frustumCulled = this.gullWing.frustumCulled = false;
    g.add(this.gullBody, this.gullWing);

    const bb = new Baker();
    putS(bb, G.sphere(1, 12, 6), 0, 0.12, 0, S.white, 0.42, 0.22, 1.6);
    box(bb, 0.7, 0.08, 2.6, 0, 0.3, 0, S.wood);
    seg(bb, new THREE.Vector3(0, 0.3, 0.3), new THREE.Vector3(0, 4.2, 0.3), 0.04, 0.03, S.steel, 6);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0, 3.7);
    sail.lineTo(1.9, 0);
    sail.closePath();
    const sailGeo = new THREE.ShapeGeometry(sail);
    sailGeo.rotateY(Math.PI / 2);
    bb.geo(sailGeo, new THREE.Matrix4().makeTranslation(0.02, 0.45, 0.25), S.sail);
    bb.geo(sailGeo, new THREE.Matrix4().makeTranslation(-0.02, 0.45, 0.25).multiply(new THREE.Matrix4().makeScale(-1, 1, 1)), S.sail);
    const boat = new THREE.Mesh(bb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-boat'));
    this.boat.add(boat);
    this.boat.position.set(-24, SEA, -46);
    this.boat.rotation.y = 1.1;
    g.add(this.boat);

    // reflections for the robot's metal: this sky over this sand
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.sky));
    const groundGeo = new THREE.CircleGeometry(9, 24);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ color: 0x8d7b5c }));
    ground.position.y = -1.2;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
    groundGeo.dispose();
    void quality;
  }

  // ------------------------------------------------------------------ building

  /** A palm: a ringed, curving trunk and a crown of arching fronds. */
  private palm(b: Baker, fr: { pos: number[]; uv: number[]; sway: number[]; idx: number[] }, base: THREE.Vector3, h: number, ly: number, lean: number, seed: number) {
    const dir = new THREE.Vector3(Math.sin(ly), 0, Math.cos(ly));
    const top = base.clone().addScaledVector(dir, lean).add(new THREE.Vector3(0, h, 0));
    const mid = base.clone().addScaledVector(dir, lean * 0.15).add(new THREE.Vector3(0, h * 0.55, 0));
    const at = (s: number, out: THREE.Vector3) =>
      out.set(0, 0, 0).addScaledVector(base, (1 - s) * (1 - s)).addScaledVector(mid, 2 * s * (1 - s)).addScaledVector(top, s * s);
    const N = 12;
    const a = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      at(i / N, a);
      at((i + 1) / N, e);
      const r0 = 0.2 - (0.08 * i) / N, r1 = 0.2 - (0.08 * (i + 1)) / N;
      seg(b, a, e, r0 * 1.12, r1, i % 2 ? S.bark : S.barkDark, 9);
    }
    // coconuts under the crown
    for (let i = 0; i < 4; i++) {
      const ang = seed + i * 1.7;
      put(b, G.sphere(0.12, 8, 6), top.x + Math.cos(ang) * 0.17, top.y - 0.2 - (i % 2) * 0.08, top.z + Math.sin(ang) * 0.17, i % 3 ? S.nutGreen : S.nut);
    }
    put(b, G.sphere(0.16, 8, 6), top.x, top.y, top.z, S.barkDark);
    const n = 11;
    for (let k = 0; k < n; k++) {
      const yaw = (k / n) * Math.PI * 2 + hash(seed * 11 + k) * 0.5;
      const len = 2.3 + hash(seed * 5 + k) * 0.9;
      const lift = 0.25 + hash(seed * 3 + k * 7) * 0.45;
      const droop = 0.75 + hash(seed * 13 + k) * 0.4;
      this.frond(fr, top, yaw, len, lift, droop, 0.42 + hash(k + seed) * 0.12);
    }
  }

  private frond(fr: { pos: number[]; uv: number[]; sway: number[]; idx: number[] }, base: THREE.Vector3, yaw: number, len: number, lift: number, droop: number, width: number) {
    const N = 9;
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const start = fr.pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const p = base.clone().addScaledVector(d, len * s).add(new THREE.Vector3(0, (lift * s - droop * s * s) * len, 0));
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.04)), 0.7);
      const fold = 0.45;
      for (const [k, u] of [[-1, 0], [0, 0.5], [1, 1]] as const) {
        fr.pos.push(p.x + side.x * w * k, p.y - (k ? w * fold : 0), p.z + side.z * w * k);
        fr.uv.push(u, s);
        fr.sway.push(s);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = start + i * 3;
      const b = a + 3;
      fr.idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
  }

  /** The beach bar: bamboo posts under a thatched roof, a counter, stools and string lights. */
  private bar(b: Baker, x: number, z: number) {
    const y = sandH(x, z);
    const posts = [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]];
    for (const [px, pz] of posts) seg(b, new THREE.Vector3(x + px, y - 0.1, z + pz), new THREE.Vector3(x + px, y + 2.5, z + pz), 0.07, 0.065, S.bamboo, 8);
    put(b, G.cone(2.55, 1.25, 12), x, y + 3.05, z, S.straw);
    put(b, G.cone(2.3, 1.0, 12), x, y + 3.35, z, S.strawDark, 0, 0.26);
    put(b, G.cyl(2.6, 2.6, 0.06, 12), x, y + 2.43, z, S.strawDark);
    // counter facing the sea
    box(b, 2.8, 1.05, 0.5, x, y + 0.52, z - 0.95, S.bamboo);
    box(b, 3.0, 0.07, 0.62, x, y + 1.08, z - 0.98, S.wood);
    for (let i = 0; i < 6; i++) box(b, 0.05, 1.0, 0.03, x - 1.25 + i * 0.5, y + 0.5, z - 1.215, S.woodDark);
    for (let i = 0; i < 3; i++) {
      const sx = x - 0.9 + i * 0.9, sz = z - 1.65;
      put(b, G.cyl(0.19, 0.19, 0.06, 10), sx, y + 0.72, sz, S.wood);
      seg(b, new THREE.Vector3(sx, y, sz), new THREE.Vector3(sx, y + 0.7, sz), 0.035, 0.035, S.chrome, 6);
    }
    // bottles on a shelf
    box(b, 2.4, 0.04, 0.3, x, y + 1.55, z + 0.6, S.wood);
    const bottle = [S.teal, S.coral, S.yellow, S.blue, S.red];
    for (let i = 0; i < 10; i++) put(b, G.cyl(0.04, 0.05, 0.26, 7), x - 1.05 + i * 0.23, y + 1.7, z + 0.6, bottle[i % 5]);
    // string lights round the eaves
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 2.45;
      const sag = 0.08 * Math.abs(Math.sin(a * 4));
      glowAt(b, G.sphere(0.045, 6, 4), x + Math.cos(a) * r, y + 2.32 - sag, z + Math.sin(a) * r, glow(i % 3 === 0 ? 0xff6fb0 : i % 3 === 1 ? 0xffd36b : 0x7ff4ff, 2.2));
    }
    // surfboards stuck in the sand beside it
    const boards: [number, Surface, number][] = [[-2.35, S.coral, 0.12], [-2.85, S.teal, -0.1], [-3.3, S.yellow, 0.05]];
    for (const [ox, s, tilt] of boards) {
      putS(b, G.sphere(1, 14, 8), x + ox, y + 0.95, z + 0.4, s, 0.27, 1.05, 0.045, 0, 0.3, tilt);
      putS(b, G.sphere(1, 14, 8), x + ox, y + 0.95, z + 0.4, S.white, 0.06, 1.0, 0.05, 0, 0.3, tilt);
    }
  }

  /** A lifeguard tower: stilts, a striped hut, a ramp and a flag. */
  private lifeguard(b: Baker, x: number, z: number) {
    const y = sandH(x, z);
    for (const [px, pz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) seg(b, new THREE.Vector3(x + px, y - 0.1, z + pz), new THREE.Vector3(x + px * 0.8, y + 2.2, z + pz * 0.8), 0.07, 0.06, S.white, 8);
    box(b, 1.9, 0.1, 1.9, x, y + 2.2, z, S.wood);
    box(b, 1.6, 1.25, 1.5, x, y + 2.9, z + 0.1, S.white);
    for (let i = 0; i < 3; i++) box(b, 1.62, 0.16, 1.52, x, y + 2.5 + i * 0.36, z + 0.1, S.red);
    box(b, 1.2, 0.5, 0.02, x, y + 3.05, z - 0.66, S.black);
    box(b, 2.0, 0.1, 1.9, x, y + 3.6, z + 0.1, S.red, 0.12, 0, 0);
    box(b, 0.7, 0.06, 2.6, x, y + 1.1, z - 1.9, S.wood, -0.75, 0, 0);
    seg(b, new THREE.Vector3(x + 0.7, y + 3.6, z + 0.7), new THREE.Vector3(x + 0.7, y + 4.7, z + 0.7), 0.025, 0.02, S.steel, 6);
    box(b, 0.5, 0.32, 0.02, x + 0.95, y + 4.5, z + 0.7, S.red, 0, 0, 0);
  }

  /** Grassy dunes behind the beach. */
  private dunes(b: Baker) {
    const grass = surf(0x8ea055, 0, 0.9);
    for (let i = 0; i < 70; i++) {
      const x = (hash(i * 3.3) - 0.5) * 70;
      const z = 12 + hash(i * 7.7) * 22;
      const y = sandH(x, z);
      for (let k = 0; k < 5; k++) {
        const a = hash(i * 13 + k) * Math.PI * 2;
        seg(b, new THREE.Vector3(x, y - 0.05, z), new THREE.Vector3(x + Math.cos(a) * 0.3, y + 0.55 + hash(i + k) * 0.3, z + Math.sin(a) * 0.3), 0.025, 0.004, grass, 3);
      }
    }
  }

  /** Rocks, shells, a sandcastle with its bucket and spade. */
  private shoreBits(b: Baker) {
    for (let i = 0; i < 9; i++) {
      const x = -14 - hash(i) * 8, z = -2 - hash(i * 3) * 5;
      putS(b, G.ico(1), x, sandH(x, z), z, S.rock, 0.5 + hash(i * 5) * 0.9, 0.35 + hash(i * 7) * 0.5, 0.5 + hash(i * 9) * 0.8, hash(i) * 3, hash(i * 2) * 3, 0);
    }
    for (let i = 0; i < 30; i++) {
      const x = (hash(i * 9.1) - 0.5) * 18, z = -2.4 - hash(i * 4.3) * 2.2;
      putS(b, G.sphere(0.035, 6, 4), x, sandH(x, z) + 0.01, z, i % 3 ? S.white : S.pink, 1, 0.45, 1.2, 0, hash(i) * 6, 0);
    }
    const cx = 2.6, cz = -2.6, cy = sandH(cx, cz);
    put(b, G.cyl(0.42, 0.5, 0.26, 12), cx, cy + 0.12, cz, S.sand);
    put(b, G.cyl(0.28, 0.32, 0.2, 12), cx, cy + 0.34, cz, S.sand);
    put(b, G.cone(0.2, 0.22, 10), cx, cy + 0.55, cz, S.sand);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      put(b, G.cyl(0.08, 0.09, 0.22, 8), cx + Math.cos(a) * 0.42, cy + 0.32, cz + Math.sin(a) * 0.42, S.sand);
    }
    put(b, G.cyl(0.13, 0.1, 0.2, 10), cx + 0.85, cy + 0.1, cz + 0.2, S.red);
    box(b, 0.06, 0.4, 0.02, cx + 0.65, cy + 0.22, cz - 0.45, S.blue, 0.2, 0, 0.5);
  }

  /** Islands out on the horizon. */
  private islands(b: Baker) {
    putS(b, G.sphere(1, 16, 8), -70, -4, -96, S.island, 28, 9, 12);
    putS(b, G.sphere(1, 16, 8), -70, -1.2, -94, S.islandSand, 30, 2, 13);
    putS(b, G.sphere(1, 16, 8), 58, -3, -104, S.island, 20, 7, 10);
    putS(b, G.sphere(1, 16, 8), 82, -2, -98, S.island, 12, 4.5, 8);
  }

  /** The robot's lounger and its side table (bot frame: world z is the robot's -z). */
  private lounger(b: Baker) {
    const L = BP.LOUNGER;
    const z0 = -L.seatZ0, z1 = -L.seatZ1;
    const hw = L.halfW;
    // side rails and legs
    for (const s of [-1, 1]) {
      box(b, 0.05, 0.07, z0 - z1 + 0.1, s * (hw + 0.02), 0.3, (z0 + z1) / 2, S.wood);
      for (const z of [z0 - 0.05, z1 + 0.08]) box(b, 0.05, 0.3, 0.05, s * (hw + 0.02), 0.15, z, S.wood);
      // backrest rails
      const a = L.backAngle;
      const c = new THREE.Vector3(s * (hw + 0.02), L.seatY - 0.06 + (Math.sin(a) * L.backLen) / 2, z0 + (Math.cos(a) * L.backLen) / 2);
      box(b, 0.05, L.backLen, 0.06, c.x, c.y, c.z, S.wood, Math.PI / 2 - a, 0, 0);
      // and its prop
      seg(b, new THREE.Vector3(s * (hw + 0.02), 0.3, z0), new THREE.Vector3(s * (hw + 0.02), 0.62, z0 + 0.62), 0.018, 0.018, S.woodDark, 6);
    }
    for (let i = 0; i < 12; i++) box(b, hw * 2, 0.02, 0.07, 0, 0.335, z1 + 0.06 + i * 0.112, S.wood);
    // wheels at the foot end
    for (const s of [-1, 1]) put(b, G.cyl(0.07, 0.07, 0.04, 12), s * (hw + 0.06), 0.07, z1 + 0.05, S.rubber, 0, 0, Math.PI / 2);
    // the side table with the phone, and a towel
    const [tx, , tz] = BP.TABLE_L;
    put(b, G.cyl(0.23, 0.23, 0.035, 18), tx, 0.49, -tz, S.white);
    seg(b, new THREE.Vector3(tx, 0, -tz), new THREE.Vector3(tx, 0.48, -tz), 0.025, 0.025, S.chrome, 8);
    put(b, G.cyl(0.16, 0.18, 0.025, 14), tx, 0.012, -tz, S.chrome);
    // a sun cream bottle and a book
    put(b, G.cyl(0.03, 0.035, 0.15, 8), tx - 0.1, 0.585, -tz + 0.08, S.yellow);
    box(b, 0.14, 0.03, 0.2, tx + 0.02, 0.523, -tz - 0.1, S.blue, 0, 0.4, 0);
    // a boombox in the sand
    const bx = 1.05, bz = 0.95;
    box(b, 0.46, 0.24, 0.16, bx, 0.12, bz, S.black, 0, -0.5, 0, 0.02);
    for (const s of [-1, 1]) put(b, G.cyl(0.075, 0.075, 0.02, 14), bx + Math.cos(-0.5) * s * 0.13, 0.12, bz - Math.sin(-0.5) * s * 0.13 - 0.07, S.steel, Math.PI / 2, -0.5, 0);
    seg(b, new THREE.Vector3(bx - 0.17, 0.24, bz + 0.09), new THREE.Vector3(bx + 0.17, 0.24, bz - 0.09), 0.012, 0.012, S.chrome, 6);
    glowAt(b, G.box(0.1, 0.03, 0.01), bx - 0.04, 0.17, bz - 0.06, glow(0x7ff4ff, 2.4), 0, -0.5, 0);
    // flip-flops
    for (const s of [-1, 1]) putS(b, G.sphere(1, 10, 6), -0.55 + s * 0.08, 0.012, -1.15, S.coral, 0.05, 0.012, 0.13, 0, 0.3, 0);
  }

  /** A spare lounger further down the beach, its own parasol over it. */
  private spareLounger(b: Baker, x: number, z: number, ry: number) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
    for (const sx of [-1, 1]) {
      const [ax, az] = at(sx * 0.36, -0.4);
      box(b, 0.05, 0.07, 1.6, ax, 0.3, az, S.white, 0, ry, 0);
    }
    const [cx, cz] = at(0, -0.4);
    box(b, 0.7, 0.08, 1.4, cx, 0.38, cz, S.teal, 0, ry, 0);
    const [bx, bz] = at(0, 0.6);
    box(b, 0.7, 0.07, 0.8, bx, 0.62, bz, S.teal, 0.8, ry, 0);
    for (const [lx, lz] of [[-0.36, -1.1], [0.36, -1.1], [-0.36, 0.3], [0.36, 0.3]]) {
      const [px, pz] = at(lx, lz);
      box(b, 0.05, 0.3, 0.05, px, 0.15, pz, S.white, 0, ry, 0);
    }
    const [ux, uz] = at(-0.8, 0.2);
    seg(b, new THREE.Vector3(ux, -0.1, uz), new THREE.Vector3(ux, 2.2, uz), 0.025, 0.025, S.white, 6);
    put(b, G.cone(1.15, 0.38, 10), ux, 2.25, uz, ry > 0 ? S.coral : S.yellow);
  }

  /** Striped cushions on the robot's lounger. */
  private cushions() {
    const L = BP.LOUNGER;
    const tex = stripeTexture('#f6f2e8', '#20b6b4', 9);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
    const seatLen = L.seatZ1 - L.seatZ0;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(L.halfW * 2 - 0.02, 0.07, seatLen), mat);
    seat.position.set(0, L.seatY - 0.035, -(L.seatZ0 + L.seatZ1) / 2);
    // stripes run across the seat: turn the box's UVs on its top face
    const back = new THREE.Mesh(new THREE.BoxGeometry(L.halfW * 2 - 0.02, L.backLen, 0.07), mat);
    const a = L.backAngle;
    back.position.set(0, L.seatY + (Math.sin(a) * L.backLen) / 2 + 0.01, -L.seatZ0 + (Math.cos(a) * L.backLen) / 2 + 0.02);
    back.rotation.x = Math.PI / 2 - a;
    for (const m of [seat, back]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.near.add(m);
    }
    // a towel draped over the backrest top
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.4), new THREE.MeshStandardMaterial({ map: stripeTexture('#ff7a5c', '#ffd36b', 6), roughness: 0.9 }));
    towel.position.set(0.05, L.seatY + Math.sin(a) * L.backLen + 0.02, -L.seatZ0 + Math.cos(a) * L.backLen + 0.08);
    towel.rotation.set(0.4, 0.2, 0);
    towel.castShadow = true;
    this.near.add(towel);
  }

  /** The robot's parasol, tilted over the side table. */
  private parasol(x: number, z: number, h: number, r: number, tilt: number) {
    const b = new Baker();
    const top = new THREE.Vector3(x + tilt * h * 0.5, h, z);
    seg(b, new THREE.Vector3(x, -0.15, z), top, 0.022, 0.02, S.wood, 8);
    const pole = new THREE.Mesh(b.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-pole'));
    pole.castShadow = true;
    this.near.add(pole);
    const canopyGeo = new THREE.ConeGeometry(r, r * 0.32, 16, 1, true);
    const tex = stripeTexture('#ff5f4f', '#fff4e4', 16);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.75 }));
    canopy.position.copy(top).add(new THREE.Vector3(0, 0.02, 0));
    canopy.rotation.z = -tilt;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.near.add(canopy);
  }

  private footprints() {
    const tex = footprintTexture();
    const geos: THREE.BufferGeometry[] = [];
    const a = new THREE.Vector2(5.4, 5.6), b = new THREE.Vector2(1.15, 0.2);
    const d = b.clone().sub(a);
    const n = 13;
    const yaw = Math.atan2(d.x, d.y);
    for (let i = 0; i < n; i++) {
      const p = a.clone().addScaledVector(d, i / (n - 1));
      const side = i % 2 ? 1 : -1;
      const x = p.x + Math.cos(yaw) * side * 0.13, z = p.y - Math.sin(yaw) * side * 0.13;
      const g = new THREE.PlaneGeometry(0.17, 0.3);
      g.rotateX(-Math.PI / 2);
      g.rotateY(yaw);
      g.translate(x, sandH(x, z) + 0.006, z);
      geos.push(g);
    }
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    geos.forEach((g, k) => {
      const p = g.attributes.position as THREE.BufferAttribute, u = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        uv.push(u.getX(i), u.getY(i));
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + k * 4);
      g.dispose();
    });
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex, color: 0x6e5534, transparent: true, opacity: 0.32, depthWrite: false }));
    m.renderOrder = 1;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ playing

  /** Robot frame (on the lounger) to world, at the robot's size. */
  private at(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x * this.size, y * this.size, -z * this.size);
  }

  start(k: SceneKit) {
    const a = k.actor;
    this.size = a.size;
    this.near.scale.setScalar(this.size);
    this.mode = 'idle';
    this.t = 0;
    this.over = false;
    this.beats.clear();
    this.coco.held = true;
    this.coco.resting = false;
    this.phoneHeld = false;
    this.phoneDrop = -1;
    this.eyes = 1;
    this.holo.visible = false;
    this.screen.color.setHex(0x2a6a8a);
    for (const o of [this.phone, this.coconut, this.holo]) o.scale.setScalar(this.size);
    this.at(BP.PHONE_AT[0], BP.PHONE_AT[1], BP.PHONE_AT[2], this.phone.position);
    this.phone.rotation.set(0, 0.3, 0);
    const p = a.puppet;
    p.root.set(0, 0, 0);
    p.yaw = Math.PI;
    a.liveOn = false;
    a.liveW = 0;
    a.walk = null;
    a.lookAt = null;
    a.model.glowBoost = 1;
    // the shades go on the head
    a.model.hulls.head.bone.add(this.glasses);
    this.glasses.position.set(0, 0, 0);
    this.glasses.rotation.set(0, 0, 0);
    k.sfx?.homeScene('beach');
    this.idleCam(k, 0, true);
  }

  release(k: SceneKit) {
    this.glasses.parent?.remove(this.glasses);
    void k;
  }

  outro(k: SceneKit) {
    if (this.mode === 'outro') return;
    this.mode = 'outro';
    this.t = 0;
    this.nextRing = 0;
    void k;
  }

  private once(id: string, when: number) {
    if (this.t < when || this.beats.has(id)) return false;
    this.beats.add(id);
    return true;
  }

  private idleCam(k: SceneKit, time: number, snap = false) {
    const z = this.size;
    const a = Math.PI + 0.72 + 0.26 * Math.sin(time * 0.055);
    const r = 3.75 * z;
    const c = k.cam;
    c.look.set(-0.05 * z, 0.8 * z, 0.15 * z);
    c.pos.set(c.look.x + Math.sin(a) * r, (1.55 + 0.12 * Math.sin(time * 0.09)) * z, c.look.z + Math.cos(a) * r);
    c.fov = 1;
    c.roll = 0;
    c.lambda = 1.5;
    c.cut = snap;
  }

  update(dt: number, time: number, k: SceneKit) {
    this.t += dt;
    const t = this.t;
    const a = k.actor;
    const z = this.size;
    this.sky.uniforms.uTime.value = time;
    this.sea.uniforms.uTime.value = time;
    this.sway.value = time;
    this.life(time);

    const o = this.pose;
    if (this.mode === 'idle') {
      sample(o, BP.IDLE, t % BP.IDLE_LEN);
      // breathing, a nod along to the music, a tapping foot
      o[PoseCh.SPINE] += 0.018 * Math.sin(time * 1.6);
      o[PoseCh.HEAD + 1] += 0.22 * Math.sin(time * 0.21) * (1 - ramp(t % BP.IDLE_LEN, 5.6, 6.3) + ramp(t % BP.IDLE_LEN, 8.2, 8.9));
      o[PoseCh.HEAD] += 0.04 * Math.max(0, Math.sin(time * Math.PI * 1.7));
      o[PoseCh.FLEX + 1] += 0.3 * Math.max(0, Math.sin(time * Math.PI * 1.7));
      this.idleCam(k, time);
    } else this.outroStep(dt, time, k);

    if (t < BP.CALL.stand + 0.6 || this.mode === 'idle') a.puppet.solve(o);
    a.step(dt);
    a.draw(time);
    this.props(dt, time, k);
    void z;
  }

  private outroStep(dt: number, time: number, k: SceneKit) {
    const t = this.t;
    const a = k.actor;
    const C = BP.CALL;
    const z = this.size;
    const cam = k.cam;
    const o = this.pose;
    if (t < C.stand + 0.6) sample(o, BP.OUTRO, t);

    // ringing until it's picked up
    if (t < C.grab && t >= this.nextRing) {
      this.nextRing = t + 1.0;
      k.sfx?.ring();
    }
    if (this.once('music', 0.3)) k.sfx?.homeMusic(false);
    if (this.once('answer', C.ear)) k.sfx?.phoneBeep();
    if (this.once('grab', C.grab)) this.phoneHeld = true;
    if (this.once('down', C.putDown)) {
      this.phoneHeld = false;
      this.phoneDrop = 0;
    }
    if (this.once('toss', C.toss)) {
      const c = this.coco;
      c.held = false;
      c.pos.copy(this.coconut.position);
      c.vel.copy(this.handVel).multiplyScalar(0.5).add(new THREE.Vector3(0.9, 3.3, 1.9).multiplyScalar(Math.sqrt(z)));
      c.spin.set(5, 2, 3);
      k.sfx?.whoosh(false, false, 0.8);
    }
    if (this.once('shades', C.shades)) {
      k.sfx?.charge(false);
      k.fx.flash(a.model.joints[J.Head], a.spec.paint.accent, 0.6 * z, 0.25);
    }
    // the shades flip up onto the forehead, and the eyes light up
    const flip = ramp(t, C.shades, C.shades + 0.22);
    this.glasses.position.set(0, flip * 0.1, flip * -0.03);
    this.glasses.rotation.x = -flip * 1.25;
    this.eyes = 1 + 1.9 * ramp(t, C.shades + 0.05, C.shades + 0.25) - 0.6 * ramp(t, C.shades + 0.6, C.shades + 1.4);
    a.model.glowBoost = this.eyes;
    if (this.once('swing', C.swing)) k.sfx?.whoosh(false, true, 0.6);
    if (this.once('feet', 4.0)) {
      k.sfx?.step(0);
      k.fx.dust(this.at(BP.STAND_AT[0] - 0.1, 0.02, BP.STAND_AT[2], new THREE.Vector3()), 10, 0.4);
    }

    // the live fighter takes over once it's up
    const standW = this.at(BP.STAND_AT[0], 0, BP.STAND_AT[2], new THREE.Vector3());
    const hero = new THREE.Vector3(3.15 * z, 0.48 * z, -1.05 * z);
    if (this.once('live', C.live)) {
      a.placeLive(standW, Math.PI - BP.STAND_YAW);
      a.face(hero);
      a.lookAt = hero;
    }
    a.liveW = ramp(t, C.live, C.live + 0.45);
    if (this.once('emote', C.emote)) a.show.preview('gloveTap', Math.atan2(hero.x - standW.x, hero.z - standW.z));
    if (this.once('cutWhite', C.cut)) this.over = true;

    // camera
    cam.cut = false;
    cam.roll = 0;
    if (t < 1.35) {
      cam.pos.set(-1.6 * z, 1.32 * z, -1.3 * z);
      cam.look.set(-0.3 * z, 0.95 * z, 0.22 * z);
      cam.fov = 0.82;
      cam.lambda = 1.7;
    } else if (t < C.shades - 0.05) {
      cam.pos.set(-1.15 * z, 1.22 * z, -0.78 * z);
      cam.look.set(-0.15 * z, 1.08 * z, 0.32 * z);
      cam.fov = 0.7;
      cam.lambda = 1.6;
    } else if (t < 3.4) {
      const first = this.once('cutFace', 0);
      cam.pos.set(0.12 * z, 1.36 * z, (-1.05 + 0.18 * ramp(t, C.shades, 3.4)) * z);
      cam.look.set(0.02 * z, 1.38 * z, 0.05 * z);
      cam.fov = 0.56;
      cam.lambda = first ? 100 : 6;
      cam.cut = first;
    } else if (t < C.live - 0.05) {
      const first = this.once('cutWide', 0);
      cam.pos.set(3.3 * z, 1.05 * z, -2.0 * z);
      cam.look.set(0.65 * z, 0.82 * z, -0.1 * z);
      cam.fov = 0.95;
      cam.lambda = first ? 100 : 1;
      cam.cut = first;
    } else {
      const first = this.once('cutHero', 0);
      const u = ramp(t, C.live, C.cut);
      cam.pos.copy(hero).lerp(new THREE.Vector3(2.55 * z, 0.55 * z, -0.82 * z), u);
      cam.look.set(standW.x, 1.2 * z, standW.z);
      cam.fov = 0.8 - 0.08 * u;
      cam.lambda = first ? 100 : 8;
      cam.cut = first;
    }
    void dt;
    void time;
  }

  /** The phone, the coconut and the hologram follow the hands. */
  private props(dt: number, time: number, k: SceneKit) {
    const a = k.actor;
    const j = a.model.joints;
    const z = this.size;
    // the right hand's speed (for the toss)
    if (dt > 0) this.handVel.subVectors(j[J.HandR], this.lastHand).multiplyScalar(1 / dt);
    this.lastHand.copy(j[J.HandR]);

    const c = this.coco;
    if (c.held) {
      const fore = new THREE.Vector3().subVectors(j[J.HandR], j[J.ElR]).normalize();
      this.coconut.position.copy(j[J.HandR]).addScaledVector(fore, 0.07 * z).y += 0.02 * z;
      // upright, tipping its straw to the mouth when it's lifted to drink
      const toHead = new THREE.Vector3().subVectors(j[J.Head], this.coconut.position);
      const near = 1 - smooth((toHead.length() / z - 0.25) / 0.2);
      const up = new THREE.Vector3(0, 1, 0).lerp(toHead.normalize(), near * 0.8).normalize();
      this.coconut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    } else if (!c.resting) {
      c.vel.y -= 9.8 * dt;
      c.pos.addScaledVector(c.vel, dt);
      this.coconut.rotation.x += c.spin.x * dt;
      this.coconut.rotation.z += c.spin.z * dt;
      const floor = sandH(c.pos.x, c.pos.z) + 0.1 * z;
      if (c.pos.y < floor) {
        c.pos.y = floor;
        if (Math.abs(c.vel.y) > 1) {
          k.fx.dust(c.pos, 8, 0.45);
          k.sfx?.thud(0.15);
        }
        c.vel.y = -c.vel.y * 0.3;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.5);
        if (++c.bounced > 3 || c.vel.lengthSq() < 0.05) c.resting = true;
      }
      this.coconut.position.copy(c.pos);
    }

    // the phone: buzzing on the table, at the ear, then dropped on the cushion
    const C = BP.CALL;
    const ringing = this.mode === 'outro' && this.t < C.grab;
    if (this.phoneHeld) {
      const fore = new THREE.Vector3().subVectors(j[J.HandL], j[J.ElL]).normalize();
      this.phone.position.copy(j[J.HandL]).addScaledVector(fore, 0.05 * z);
      this.phone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fore);
    } else if (this.phoneDrop >= 0) {
      this.phoneDrop += dt;
      const rest = this.at(-0.28, BP.LOUNGER.seatY + 0.008, 0.4, new THREE.Vector3());
      this.phone.position.lerp(rest, 1 - Math.exp(-dt * 14));
      this.phone.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.6, 0)), 1 - Math.exp(-dt * 12));
    } else if (ringing) {
      this.at(BP.PHONE_AT[0], BP.PHONE_AT[1], BP.PHONE_AT[2], this.phone.position);
      const buzz = Math.sin(time * 70) * 0.004 * z * (Math.sin(this.t * Math.PI * 2) > -0.2 ? 1 : 0);
      this.phone.position.x += buzz;
      this.phone.rotation.y = 0.3 + buzz * 4;
    }
    const lit = ringing ? 0.6 + 0.4 * Math.sin(this.t * 12) : this.phoneHeld ? 0.8 : 0;
    this.screen.color.setHex(0x2fd0ff).multiplyScalar(RenderSettings.glow(0.4 + lit * 2.2)).lerp(new THREE.Color(0x0c1a22), lit > 0 ? 0 : 1);

    // the call hovers over the phone as a hologram
    const h = this.mode === 'outro' ? ramp(this.t, 0.05, 0.3) * (1 - ramp(this.t, C.grab + 0.1, C.grab + 0.45)) : 0;
    this.holo.visible = h > 0.01;
    if (this.holo.visible) {
      this.holo.position.copy(this.phone.position).add(new THREE.Vector3(0.05 * z, (0.24 + 0.02 * Math.sin(time * 3)) * z, -0.05 * z));
      this.holo.quaternion.copy(k.cam.pos.clone().sub(this.holo.position).normalize().z !== 0 ? this.billboard(k) : this.holo.quaternion);
      this.holo.scale.setScalar(z * (0.6 + 0.4 * h));
      this.holoMat.color.setScalar(RenderSettings.glow(1.8) * h * (0.85 + 0.15 * Math.sin(time * 40)));
    }
  }

  private _bq = new THREE.Quaternion();
  private _bm = new THREE.Matrix4();
  /** Face the hologram at the camera. */
  private billboard(k: SceneKit) {
    this._bm.lookAt(k.cam.pos, this.holo.position, new THREE.Vector3(0, 1, 0));
    return this._bq.setFromRotationMatrix(this._bm);
  }

  /** Gulls circling, the boat bobbing at anchor. */
  private life(time: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 4; i++) {
      const r = 9 + i * 3;
      const a = time * (0.16 + i * 0.03) + i * 1.9;
      p.set(-4 + Math.cos(a) * r, 8 + i * 1.3 + Math.sin(time * 0.4 + i) * 0.6, -14 + Math.sin(a) * r * 0.6);
      const heading = Math.atan2(-Math.sin(a), Math.cos(a) * 0.6) + Math.PI / 2;
      e.set(0, heading, 0.25);
      q.setFromEuler(e);
      m.compose(p, q, one);
      this.gullBody.setMatrixAt(i, m);
      const flap = Math.sin(time * 6 + i * 2) * 0.55 * (0.5 + 0.5 * Math.sin(time * 0.7 + i));
      for (const s of [0, 1]) {
        e.set(0, heading + (s ? Math.PI : 0), s ? -flap + 0.25 : flap + 0.25);
        q.setFromEuler(e);
        m.compose(p, q, one);
        this.gullWing.setMatrixAt(i * 2 + s, m);
      }
    }
    this.gullBody.instanceMatrix.needsUpdate = true;
    this.gullWing.instanceMatrix.needsUpdate = true;
    this.boat.position.y = SEA + Math.sin(time * 0.8) * 0.12;
    this.boat.rotation.z = Math.sin(time * 0.6) * 0.06;
    this.boat.rotation.x = Math.sin(time * 0.5 + 1) * 0.04;
  }
}
