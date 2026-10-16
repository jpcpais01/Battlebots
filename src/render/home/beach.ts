import * as THREE from 'three';
import { Baker, bakedGlowMaterial, surf, vertexPBR, type Surface } from '../bake';
import { G } from '../parts';
import { RenderSettings } from '../settings';
import { contactAO } from '../ao';
import type { Quality } from '../stage';
import { J } from '../../sim/body';
import { PoseCh, sample } from './puppet';
import * as BP from './beachPoses';
import { box, canvas, hash, noiseTexture, put, putS, ramp, seg, smooth, texture, type HomeScene, type SceneKit } from './scene';
import { FLARE_FRAG, FLARE_VERT, LOOK, SUN, groundGeometry, groundH, inland, sandMaterial, shoreZ, skyMaterial, skyUniforms, waterGeometry, waterMaterial } from './beachWorld';
import { Grove, backlit, plants, type Palm } from './beachFlora';

/**
 * A quiet paradise beach: white coral sand on a turquoise lagoon, palms leaning out over the
 * water's edge, a thatched shade and a hammock strung between two palms, an outrigger pulled up on
 * the sand, the reef's surf far out and green islands on the horizon. The robot lies on its sun
 * lounger with a coconut. On Fight, its phone buzzes: the arena is calling. It answers, tosses the
 * coconut, flips its shades up with its eyes blazing, gets up and squares up to the camera.
 */

const S = {
  wood: surf(0xb98552, 0, 0.62),
  woodDark: surf(0x7c5434, 0, 0.7),
  woodB: surf(0xa9784a, 0, 0.66),
  woodC: surf(0xc69460, 0, 0.6),
  drift: surf(0xc9bba6, 0, 0.9),
  driftDark: surf(0x9a8b76, 0, 0.92),
  white: surf(0xf1efe9, 0.05, 0.5),
  teal: surf(0x1fb3b0, 0.05, 0.6),
  coral: surf(0xff6b5a, 0.05, 0.6),
  yellow: surf(0xffc93c, 0.05, 0.55),
  chrome: surf(0xdfe4ea, 1, 0.16),
  steel: surf(0x8b929c, 0.8, 0.35),
  black: surf(0x16181c, 0.4, 0.45),
  rubber: surf(0x1d1f22, 0, 0.9),
  nutGreen: surf(0x7e8f37, 0, 0.6),
  flesh: surf(0xf4f0e2, 0, 0.5),
  straw: surf(0xd9b26a, 0, 0.85),
  strawDark: surf(0xa77f45, 0, 0.9),
  rope: surf(0xd8c49a, 0, 0.9),
  red: surf(0xe2342c, 0.1, 0.5),
  blue: surf(0x2a6fd6, 0.1, 0.5),
  gold: surf(0xd8ad52, 1, 0.24),
  lens: surf(0x07080a, 0.9, 0.06),
  pink: surf(0xff7fb0, 0.05, 0.55),
  cream: surf(0xf2e6cc, 0, 0.75),
  shell: surf(0xf6ece0, 0, 0.5),
  orange: surf(0xff8a2a, 0.05, 0.5),
  page: surf(0xf4ecd8, 0, 0.8),
  canoe: surf(0x6b4a2e, 0, 0.6),
  canoeIn: surf(0x9a7048, 0, 0.75),
  paint: surf(0x2f9fa4, 0.05, 0.45),
  paintRed: surf(0xc84a32, 0.05, 0.5),
};

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));

/** The palms along the back of the beach near the lounger (drawn in full): x, distance inland, height, lean bearing (0: seaward), lean. */
const PALMS: readonly (readonly [number, number, number, number, number])[] = [
  [-38, 9, 8.6, 0.2, 2.2],
  [-31, 11, 9.4, -0.15, 1.3],
  [-24, 8.5, 8.0, 0.3, 2.8],
  [-17, 10.5, 9.8, 0.05, 1.2],
  [-11, 9, 8.4, -0.25, 2.4],
  [-6, 12.5, 10.2, 0.1, 1.0],
  [-1.5, 9.8, 8.8, 0.35, 2.0],
  // the hammock's two
  [5.2, 9.4, 8.2, -0.25, 1.5],
  [8.9, 10, 9.0, 0.3, 1.3],
  // the one leaning far out over the sand towards the water
  [13.5, 4.8, 7.6, 0.12, 4.6],
  [18, 11, 10.0, -0.1, 1.3],
  [23, 8.6, 8.4, 0.3, 2.5],
  [28.5, 10.4, 9.6, -0.05, 1.5],
  [33, 7.4, 7.8, 0.22, 3.4],
  [38.5, 11.5, 10.4, 0.0, 1.2],
  [43, 9, 8.6, 0.28, 2.6],
  // a second row, taller, behind
  [2.5, 16.5, 11.5, 0.1, 1.2],
  [11.5, 17, 12.2, -0.2, 0.9],
  [-9, 17.5, 11.8, 0.2, 1.1],
  [25, 18, 12.5, 0, 1],
];
const HAMMOCK = [7, 8] as const;

// ------------------------------------------------------------------ textures

/** The lounger's cushion canvas: soft aqua and linen stripes, the weave and a stitched border. */
function cushionTexture() {
  const { c, g } = canvas(256, 256);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 2 ? '#7fcfc8' : '#f5f0e4';
    g.fillRect((i * 256) / 9, 0, 256 / 9 + 1, 256);
  }
  g.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 1; i < 9; i++) g.fillRect((i * 256) / 9 - 1, 0, 2, 256);
  g.globalAlpha = 0.07;
  for (let y = 0; y < 256; y += 2) {
    g.fillStyle = y % 4 ? '#ffffff' : '#000000';
    g.fillRect(0, y, 256, 1);
  }
  g.fillStyle = '#000000';
  for (let x = 0; x < 256; x += 3) g.fillRect(x, 0, 1, 256);
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(60,50,40,0.4)';
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.strokeRect(9, 9, 238, 238);
  g.setLineDash([]);
  return texture(c);
}

function towelTexture(cols: string[]) {
  const { c, g } = canvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  const top = 14;
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * 128) / cols.length, top, 128 / cols.length + 1, 256 - 2 * top);
  });
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = hash(i * 1.3) > 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)';
    g.fillRect(hash(i * 2.7) * 128, top + hash(i * 3.9) * (256 - 2 * top), 1, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, top + 8, 128, 5);
  g.fillRect(0, 256 - top - 13, 128, 5);
  g.strokeStyle = '#f4efe2';
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 2; x < 128; x += 5) {
    g.moveTo(x, top);
    g.lineTo(x + (hash(x) - 0.5) * 3, top - 9 - hash(x * 3) * 4);
    g.moveTo(x, 256 - top);
    g.lineTo(x + (hash(x * 7) - 0.5) * 3, 256 - top + 9 + hash(x * 5) * 4);
  }
  g.stroke();
  return texture(c);
}

/** The hammock's woven cotton: cream, a band of soft stripes down each edge, the weave. */
function hammockTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#f3ead8';
  g.fillRect(0, 0, 256, 256);
  for (const [x, w, col] of [[14, 10, '#e98e6e'], [30, 5, '#5fb7b0'], [40, 4, '#e9c16a']] as const) {
    g.fillStyle = col;
    g.fillRect(x, 0, w, 256);
    g.fillRect(256 - x - w, 0, w, 256);
  }
  g.globalAlpha = 0.1;
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = '#6b5a40';
    g.fillRect(0, y, 256, 1);
  }
  for (let x = 0; x < 256; x += 3) {
    g.fillStyle = '#ffffff';
    g.fillRect(x, 0, 1, 256);
  }
  g.globalAlpha = 1;
  return texture(c, true);
}

/** Palm-leaf thatch: straw strands hanging down, sun-bleached and silvered, ragged along the hem (alpha). */
function thatchTexture() {
  const W = 512, H = 256;
  const { c, g } = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#7d6440';
  g.fillRect(0, 0, W, H * 0.55);
  const tones = ['#c9a96b', '#b39058', '#dcc390', '#9d8058', '#cdb88e', '#a89a80'];
  g.lineCap = 'round';
  for (let i = 0; i < 1500; i++) {
    const x = hash(i * 1.31) * W;
    const len = H * (0.55 + 0.42 * hash(i * 2.77));
    g.strokeStyle = tones[Math.floor(hash(i * 3.9) * tones.length)];
    g.lineWidth = 1.5 + hash(i * 4.3) * 2.2;
    g.beginPath();
    g.moveTo(x, hash(i * 5.1) * H * 0.3);
    g.lineTo(x + (hash(i * 6.7) - 0.5) * 10, len);
    g.stroke();
  }
  // shadowed lines where each course of thatch is tied on
  g.fillStyle = 'rgba(60,45,25,0.5)';
  for (const y of [40, 90]) g.fillRect(0, y, W, 3);
  return texture(c, true);
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

// ------------------------------------------------------------------ building helpers

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _tm = new THREE.Matrix4();

/** A tapered bar from a to e like seg, on its own uncached cylinder. */
function tube(b: Baker, a: THREE.Vector3, e: THREE.Vector3, r0: number, r1: number, s: Surface, sides = 8) {
  _ta.subVectors(e, a);
  const len = _ta.length();
  if (len < 1e-5) return;
  _tq.setFromUnitVectors(UP, _ta.multiplyScalar(1 / len));
  _tm.compose(_tb.addVectors(a, e).multiplyScalar(0.5), _tq, ONE);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides);
  b.geo(g, _tm, s);
  g.dispose();
}

/** A local frame on the sand: at (x, y, z), facing yaw (its +z), scaled. */
function frame(x: number, y: number, z: number, yaw: number, sc = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sc, sc, sc));
}

const _lm = new THREE.Matrix4();
const _lw = new THREE.Matrix4();
const _lq = new THREE.Quaternion();
const _le = new THREE.Euler();
const _lp = new THREE.Vector3();
const _ls = new THREE.Vector3();
const _ia = new THREE.Vector3();
const _ib = new THREE.Vector3();

/** Bake geometry within the local frame f: offset, turned and scaled in it. */
function putIn(b: Baker, f: THREE.Matrix4, g: THREE.BufferGeometry, s: Surface, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _lm.compose(_lp.set(x, y, z), _lq.setFromEuler(_le.set(rx, ry, rz)), _ls.set(sx, sy, sz));
  b.geo(g, _lw.multiplyMatrices(f, _lm), s);
}

/** A tapered bar between two points of the local frame f (radii scale with it). */
function tubeIn(b: Baker, f: THREE.Matrix4, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, s: Surface, sides = 6) {
  const k = f.getMaxScaleOnAxis();
  tube(b, _ia.set(ax, ay, az).applyMatrix4(f), _ib.set(bx, by, bz).applyMatrix4(f), r0 * k, r1 * k, s, sides);
}

/** Wood grain running along one axis of the mesh. */
function woodGrain(m: THREE.MeshStandardMaterial, along: 'x' | 'z') {
  const prev = m.onBeforeCompile;
  const swz = along === 'x' ? 'vWoodP.zyx' : 'vWoodP.xyz';
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uWoodNoise = { value: noiseTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWoodP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWoodP;\nuniform sampler2D uWoodNoise;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 wq = ${swz};
          float warp = texture2D(uWoodNoise, vec2(wq.z * 0.4, (wq.x + wq.y) * 1.7)).r;
          float rings = 0.5 + 0.5 * sin((wq.x * 0.6 + wq.y) * 210.0 + warp * 14.0 + wq.z * 2.0);
          float streak = texture2D(uWoodNoise, vec2(wq.z * 0.08, (wq.x * 0.6 + wq.y) * 6.0)).g;
          diffuseColor.rgb *= (0.84 + 0.2 * rings * rings) * (0.88 + 0.24 * streak);
        }`,
      );
  };
  m.customProgramCacheKey = () => `beach-wood-${along}`;
  return m;
}

/** A box whose two big faces (across `thin`) puff out like a cushion's, edges staying put. */
function pillow(w: number, h: number, d: number, puff: number, thin: 'y' | 'z') {
  const g = thin === 'y' ? new THREE.BoxGeometry(w, h, d, 10, 1, 14) : new THREE.BoxGeometry(w, h, d, 10, 14, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = Math.min(1, Math.abs(p.getX(i) / (w / 2)));
    if (thin === 'y') {
      const z = Math.min(1, Math.abs(p.getZ(i) / (d / 2)));
      p.setY(i, p.getY(i) + Math.sign(p.getY(i)) * puff * (1 - Math.pow(x, 6)) * (1 - Math.pow(z, 6)));
    } else {
      const y = Math.min(1, Math.abs(p.getY(i) / (h / 2)));
      p.setZ(i, p.getZ(i) + Math.sign(p.getZ(i)) * puff * (1 - Math.pow(x, 6)) * (1 - Math.pow(y, 6)));
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A grid of points (from `at`, i along, j across) as one double-sided cloth surface, with uvs. */
function clothGeo(nu: number, nv: number, at: (i: number, j: number, p: THREE.Vector3) => void) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      at(i, j, p);
      pos.push(p.x, p.y, p.z);
      uv.push(j / nv, i / nu);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the scene

export class Beach implements HomeScene {
  readonly group = new THREE.Group();
  readonly look = LOOK;
  readonly env: THREE.Texture;
  readonly crowd = 0;
  over = false;
  /** The robot's corner (lounger, table, shade, the things on the sand), scaled to its size. */
  private near = new THREE.Group();
  private time = { value: 0 };
  /** The sun's direction in view space (for leaves glowing against it). */
  private sunView = { value: new THREE.Vector3(0, 0, -1) };
  private sway = { value: 0 };
  private phone = new THREE.Group();
  private screen: THREE.MeshBasicMaterial;
  private coconut: THREE.Mesh;
  private glasses: THREE.Mesh;
  private holo: THREE.Mesh;
  private holoMat: THREE.MeshBasicMaterial;
  private birds: THREE.InstancedMesh;
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
    const noise = noiseTexture();
    const low = quality === 'low';

    // ------------------------------------------------------------ sky, water, sand
    const sky = skyUniforms(this.time);
    sky.uNoise.value = noise;
    const skyMat = skyMaterial(sky);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    g.add(dome);
    g.add(this.flare(sky));

    const sand = new THREE.Mesh(groundGeometry(), contactAO.patch(sandMaterial(noise, this.time), { spheres: true, strength: 1.6, direct: 0.6 }));
    sand.receiveShadow = true;
    g.add(sand);

    const water = new THREE.Mesh(waterGeometry(), waterMaterial(sky, low));
    water.renderOrder = -1;
    water.frustumCulled = false;
    g.add(water);

    // ------------------------------------------------------------ palms and plants
    const grove = new Grove();
    const heroPalms: Palm[] = PALMS.map(([x, l, h, yaw, lean], i) => ({ x, z: shoreZ(x) + l, h, yaw, lean, seed: i * 3.7 + 1.3 }));
    heroPalms.forEach((p) => grove.add(p, true));
    // and on round the bay to the headlands, and dotted up through the jungle on the hills
    let seed = 100;
    for (const sgn of [1, -1]) {
      for (let x = 48; x < 104; x += 4.2 + hash(seed) * 3.5) {
        seed += 1.7;
        const l = 7.5 + hash(seed * 1.3) * 6;
        grove.add({ x: sgn * x, z: shoreZ(sgn * x) + l, h: 8 + hash(seed * 2.1) * 3, yaw: sgn * 0.25 + (hash(seed * 3.3) - 0.5) * 0.7, lean: 1 + hash(seed * 4.1) * 3, seed }, false);
      }
    }
    for (let i = 0, n = 0; i < 400 && n < (low ? 28 : 55); i++) {
      const x = -100 + hash(i * 5.31 + 0.4) * 200, z = -40 + hash(i * 7.13 + 0.8) * 140;
      const l = inland(x, z);
      if (l < 18 || Math.hypot(x, z) > 100) continue;
      n++;
      grove.add({ x, z, h: 11 + hash(i * 3.7) * 5, yaw: hash(i * 1.9) * 6.28, lean: 0.5 + hash(i * 2.3) * 1.5, seed: 300 + i }, false);
    }
    g.add(grove.build(this.sway, this.sunView, quality));
    const sunView = this.sunView.value;
    dome.onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
      sunView.copy(SUN).transformDirection(cam.matrixWorldInverse);
    };

    const [ha, hb] = [heroPalms[HAMMOCK[0]], heroPalms[HAMMOCK[1]]];
    const clear = (x: number, z: number) => {
      for (const f of grove.feet) if (Math.abs(f.x - x) < 0.9 && Math.abs(f.z - z) < 0.9) return true;
      // the hammock, and the path up the beach to it
      const hx = (ha.x + hb.x) / 2, hz = (ha.z + hb.z) / 2;
      if (Math.abs(x - hx) < 3 && Math.abs(z - hz) < 1.8) return true;
      return false;
    };
    g.add(plants(quality, this.sway, this.sunView, clear));

    // ------------------------------------------------------------ the robot's corner, and the beach round it
    const near = new Baker();
    const world = new Baker();
    this.lounger(near);
    this.cushions(near);
    this.cocktail(near);
    this.sandBits(near);
    this.shade(1.3, 1.6);
    this.hammock(world, ha, hb);
    this.canoe(world, 10.5, 0.2, -1.95);
    this.driftwood(world);
    this.shells(world);
    const props = (b: Baker, parent: THREE.Object3D, key: string) => {
      const { opaque, emissive } = b.build();
      if (opaque) {
        const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), key), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
      }
      if (emissive) parent.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    };
    props(near, this.near, 'beach-near');
    props(world, g, 'beach-world');
    g.add(this.near);
    this.footprints();

    // ------------------------------------------------------------ props the robot handles
    const pb = new Baker();
    box(pb, 0.078, 0.011, 0.155, 0, 0, 0, S.black, 0, 0, 0, 0.004);
    box(pb, 0.07, 0.003, 0.012, 0, -0.006, -0.06, S.steel);
    this.phone.add(new THREE.Mesh(pb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-phone')));
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

    // ------------------------------------------------------------ frigatebirds, gliding high on the breeze
    this.birds = this.frigatebirds();
    g.add(this.birds);

    // reflections for the robot's metal: this sky over this sand
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
    const groundGeo = new THREE.CircleGeometry(9, 24);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ccb4) }));
    ground.position.y = -1.2;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
    groundGeo.dispose();
    this.flyBirds(0);
  }

  /** The sun's lens flare: glows, rings and ghosts along the line through the middle of the screen. */
  private flare(sky: ReturnType<typeof skyUniforms>) {
    // along the line (0 sun, 1 centre, 2 mirrored), size, shape (0 glow, 1 ring, 2 ghost, 3 streak), strength, colour
    const els: [number, number, number, number, number][] = [
      [0, 0.45, 0, 0.14, 0xfff1dc],
      [0, 0.14, 0, 0.36, 0xfffaf0],
      [0, 0.08, 3, 0.16, 0xfff0dc],
      [0.22, 0.04, 2, 0.05, 0xffe0b0],
      [0.38, 0.075, 2, 0.035, 0xa8f0d0],
      [0.52, 0.03, 0, 0.07, 0xfff0d0],
      [0.68, 0.14, 1, 0.025, 0xa8b8ff],
      [0.86, 0.055, 2, 0.04, 0x9ad0ff],
      [1.08, 0.2, 1, 0.02, 0xffd8b8],
      [1.28, 0.09, 2, 0.025, 0xffe8b0],
    ];
    const pos: number[] = [], corner: number[] = [], el: number[] = [], tint: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    els.forEach(([along, size, shape, k, hex], i) => {
      c.setHex(hex);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(0, 0, 0);
        corner.push(u, v);
        el.push(along, size, shape, k);
        tint.push(c.r, c.g, c.b);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    geo.setAttribute('el', new THREE.Float32BufferAttribute(el, 4));
    geo.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: sky,
      vertexShader: FLARE_VERT,
      fragmentShader: FLARE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 100;
    return mesh;
  }

  // ------------------------------------------------------------------ the robot's corner

  /** A sunset cocktail on the side table, umbrella and all. */
  private cocktail(b: Baker) {
    const V = THREE.Vector3;
    const x = -0.91, y = 0.5075, z = -0.08;
    put(b, G.cyl(0.028, 0.03, 0.008, 12), x, y + 0.004, z, S.chrome);
    seg(b, new V(x, y + 0.008, z), new V(x, y + 0.06, z), 0.005, 0.005, S.chrome, 6);
    put(b, G.cyl(0.042, 0.022, 0.07, 12), x, y + 0.095, z, S.orange);
    put(b, G.cyl(0.043, 0.042, 0.012, 12), x, y + 0.126, z, S.yellow);
    put(b, G.cyl(0.032, 0.032, 0.006, 10), x + 0.04, y + 0.13, z, S.nutGreen, Math.PI / 2, 0, 0);
    seg(b, new V(x - 0.012, y + 0.1, z), new V(x - 0.035, y + 0.22, z + 0.01), 0.004, 0.004, S.pink, 5);
    seg(b, new V(x + 0.012, y + 0.1, z - 0.01), new V(x + 0.04, y + 0.2, z - 0.02), 0.002, 0.002, S.woodDark, 4);
    put(b, G.cone(0.052, 0.022, 8), x + 0.042, y + 0.205, z - 0.021, S.teal, 0, 0, -0.3);
  }

  /** The robot's lounger and its side table (bot frame: world z is the robot's -z). */
  private lounger(b: Baker) {
    const L = BP.LOUNGER;
    const z0 = -L.seatZ0, z1 = -L.seatZ1;
    const hw = L.halfW;
    // the frame and slats are their own meshes, with grain running along each board
    const wz = new Baker(), wx = new Baker();
    const tones = [S.wood, S.woodB, S.woodC];
    for (const s of [-1, 1]) {
      box(wz, 0.05, 0.07, z0 - z1 + 0.1, s * (hw + 0.02), 0.3, (z0 + z1) / 2, S.wood, 0, 0, 0, 0.01);
      for (const z of [z0 - 0.05, z1 + 0.08]) box(wz, 0.05, 0.3, 0.05, s * (hw + 0.02), 0.15, z, S.woodB, 0, 0, 0, 0.008);
      const a = L.backAngle;
      const c = new THREE.Vector3(s * (hw + 0.02), L.seatY - 0.06 + (Math.sin(a) * L.backLen) / 2, z0 + (Math.cos(a) * L.backLen) / 2);
      box(wz, 0.05, L.backLen, 0.06, c.x, c.y, c.z, S.wood, Math.PI / 2 - a, 0, 0, 0.01);
      seg(b, new THREE.Vector3(s * (hw + 0.02), 0.3, z0), new THREE.Vector3(s * (hw + 0.02), 0.62, z0 + 0.62), 0.018, 0.018, S.woodDark, 6);
      for (let k = 0; k < 4; k++) box(b, 0.02, 0.018, 0.03, s * (hw + 0.035), 0.345, z0 - 0.08 - k * 0.07, S.woodDark);
      for (let k = 0; k < 6; k++) put(b, G.cyl(0.008, 0.008, 0.006, 6), s * (hw + 0.047), 0.3, z1 + 0.1 + k * 0.24, S.gold, 0, 0, Math.PI / 2);
    }
    for (const z of [z0 - 0.08, (z0 + z1) / 2, z1 + 0.1]) box(wx, hw * 2 + 0.02, 0.04, 0.04, 0, 0.275, z, S.woodB, 0, 0, 0, 0.006);
    for (let i = 0; i < 12; i++) box(wx, hw * 2, 0.02, 0.075, 0, 0.335, z1 + 0.06 + i * 0.112, tones[Math.floor(hash(i * 3.7) * 3)], 0, 0, 0, 0.006);
    const woodMesh = (bk: Baker, along: 'x' | 'z') => {
      const m = new THREE.Mesh(
        bk.build().opaque!,
        contactAO.patch(woodGrain(vertexPBR(new THREE.MeshStandardMaterial(), 'beach-wood'), along), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }),
      );
      m.castShadow = true;
      m.receiveShadow = true;
      this.near.add(m);
    };
    woodMesh(wz, 'z');
    woodMesh(wx, 'x');
    for (const s of [-1, 1]) {
      put(b, G.cyl(0.07, 0.07, 0.04, 14), s * (hw + 0.06), 0.07, z1 + 0.05, S.rubber, 0, 0, Math.PI / 2);
      put(b, G.cyl(0.035, 0.035, 0.046, 10), s * (hw + 0.06), 0.07, z1 + 0.05, S.woodDark, 0, 0, Math.PI / 2);
    }
    // the side table: a round teak top on a turned leg, the phone, the cocktail and sun cream on it
    const [tx, , tz] = BP.TABLE_L;
    put(b, G.cyl(0.23, 0.22, 0.035, 22), tx, 0.49, -tz, S.woodC);
    put(b, G.torus(0.225, 0.01, 5, 26), tx, 0.49, -tz, S.wood, Math.PI / 2, 0, 0);
    seg(b, new THREE.Vector3(tx, 0, -tz), new THREE.Vector3(tx, 0.48, -tz), 0.03, 0.024, S.wood, 10);
    put(b, G.sphere(0.04, 10, 6), tx, 0.3, -tz, S.wood);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      seg(b, new THREE.Vector3(tx, 0.12, -tz), new THREE.Vector3(tx + Math.cos(a) * 0.17, 0.01, -tz + Math.sin(a) * 0.17), 0.016, 0.013, S.woodB, 6);
    }
    put(b, G.cyl(0.03, 0.035, 0.15, 8), tx - 0.1, 0.585, -tz + 0.08, S.yellow);
    put(b, G.cyl(0.018, 0.022, 0.03, 8), tx - 0.1, 0.675, -tz + 0.08, S.coral);
    // the book, put down on the sand by the table, out of the phone's way
    for (const y of [0.0025, 0.0275]) box(b, 0.14, 0.005, 0.2, -0.6, y, 0.3, S.blue, 0, 0.9, 0);
    box(b, 0.132, 0.021, 0.192, -0.602, 0.015, 0.3, S.page, 0, 0.9, 0);
  }

  /** Puffed-up cushions on the robot's lounger, piped round the edges, and a towel thrown over the backrest. */
  private cushions(pb: Baker) {
    const L = BP.LOUNGER;
    const mat = new THREE.MeshStandardMaterial({ map: cushionTexture(), roughness: 0.85, metalness: 0 });
    const w = L.halfW * 2 - 0.02;
    const seatLen = L.seatZ1 - L.seatZ0;
    const seat = new THREE.Mesh(pillow(w, 0.07, seatLen, 0.008, 'y'), mat);
    seat.position.set(0, L.seatY - 0.035, -(L.seatZ0 + L.seatZ1) / 2);
    const back = new THREE.Mesh(pillow(w, L.backLen, 0.07, 0.008, 'z'), mat);
    const a = L.backAngle;
    back.position.set(0, L.seatY + (Math.sin(a) * L.backLen) / 2 + 0.01, -L.seatZ0 + (Math.cos(a) * L.backLen) / 2 + 0.02);
    back.rotation.x = Math.PI / 2 - a;
    for (const m of [seat, back]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.updateMatrix();
      this.near.add(m);
    }
    const V = THREE.Vector3;
    const pipe = (m: THREE.Mesh, hx: number, hy: number, hz: number) => {
      const P = (x: number, y: number, z: number) => new V(x, y, z).applyMatrix4(m.matrix);
      for (const sy of [-1, 1]) {
        for (const sx of [-1, 1]) seg(pb, P(sx * hx, sy * hy, -hz), P(sx * hx, sy * hy, hz), 0.007, 0.007, S.cream, 5);
        for (const sz of [-1, 1]) seg(pb, P(-hx, sy * hy, sz * hz), P(hx, sy * hy, sz * hz), 0.007, 0.007, S.cream, 5);
      }
    };
    pipe(seat, w / 2, 0.035, seatLen / 2);
    const P = (x: number, y: number, z: number) => new V(x, y, z).applyMatrix4(back.matrix);
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) seg(pb, P(sx * (w / 2), -L.backLen / 2, sz * 0.035), P(sx * (w / 2), L.backLen / 2, sz * 0.035), 0.007, 0.007, S.cream, 5);
      for (const sy of [-1, 1]) seg(pb, P(-w / 2, sy * (L.backLen / 2), sz * 0.035), P(w / 2, sy * (L.backLen / 2), sz * 0.035), 0.007, 0.007, S.cream, 5);
    }
    for (const bz of [-0.98, -0.6]) for (const bxx of [-0.17, 0, 0.17]) putS(pb, G.sphere(0.012, 6, 4), bxx, L.seatY + 0.004, bz, S.cream, 1, 0.45, 1);

    // a towel thrown over the top of the backrest, hanging down behind it and stirring in the breeze
    back.updateMatrixWorld();
    const yDir = new V(0, 1, 0).applyQuaternion(back.quaternion);
    const zDir = new V(0, 0, 1).applyQuaternion(back.quaternion);
    const topC = back.position.clone().addScaledVector(yDir, L.backLen / 2);
    const path = new THREE.CatmullRomCurve3([
      topC.clone().addScaledVector(zDir, -0.05).addScaledVector(yDir, -0.03),
      topC.clone().addScaledVector(yDir, 0.045),
      topC.clone().addScaledVector(zDir, 0.07).addScaledVector(yDir, 0.01),
      topC.clone().addScaledVector(zDir, 0.09).add(new V(0, -0.16, 0)),
      topC.clone().addScaledVector(zDir, 0.11).add(new V(0, -0.5, 0)),
    ]);
    const NU = 9, NV = 18, W = 0.56;
    const pos: number[] = [], uv: number[] = [], hang: number[] = [], idx: number[] = [];
    const pt = new V(), tan = new V(), nrm = new V();
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      path.getPointAt(v, pt);
      path.getTangentAt(v, tan);
      nrm.crossVectors(tan, new V(1, 0, 0)).normalize();
      const h = smooth((v - 0.25) / 0.3);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        const x = (u - 0.5) * W + 0.03;
        const fold = h * (0.018 * Math.sin(x * 23 + 1.3) + 0.008 * Math.sin(x * 51));
        pos.push(x, pt.y + nrm.y * fold - h * v * 0.03 * Math.sin(x * 9 + 0.4), pt.z + nrm.z * fold);
        uv.push(u, 1 - v);
        hang.push(h * v);
      }
    }
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const q = j * (NU + 1) + i;
        idx.push(q, q + NU + 1, q + 1, q + 1, q + NU + 1, q + NU + 2);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.setAttribute('hang', new THREE.Float32BufferAttribute(hang, 1));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tm = new THREE.MeshStandardMaterial({ map: towelTexture(['#f7b9a2', '#fbeee0', '#f7b9a2', '#f6d9a0', '#f7b9a2', '#fbeee0']), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 });
    const sway = this.sway;
    tm.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float hang;\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += hang * (0.03 + 0.02 * sin(uSway * 1.9 + position.x * 7.0));
          transformed.x += hang * 0.01 * sin(uSway * 2.6 + position.y * 9.0);`,
        );
    };
    tm.customProgramCacheKey = () => 'beach-towel-hang';
    const towel = new THREE.Mesh(tg, tm);
    towel.castShadow = true;
    towel.receiveShadow = true;
    this.near.add(towel);
  }

  /** Things on the sand by the lounger: a straw tote, flip-flops, a starfish, shells. */
  private sandBits(b: Baker) {
    const BOX = G.box(1, 1, 1);
    const bf = frame(-1.35, 0, 0.62, 0.4);
    putIn(b, bf, BOX, S.straw, 0, 0.13, 0, 0, 0, 0, 0.26, 0.26, 0.13);
    for (const y of [0.05, 0.11, 0.17]) putIn(b, bf, BOX, S.strawDark, 0, y, 0, 0, 0, 0, 0.264, 0.018, 0.134);
    putIn(b, bf, BOX, S.coral, 0, 0.235, 0, 0, 0, 0, 0.266, 0.03, 0.136);
    for (const z of [-0.045, 0.045]) putIn(b, bf, G.torus(0.07, 0.008, 4, 12, Math.PI), S.strawDark, 0, 0.26, z);
    putIn(b, bf, G.cyl(0.04, 0.04, 0.2, 10), S.teal, -0.05, 0.3, 0, 0, 0, 0.3);
    putIn(b, bf, G.cyl(0.041, 0.041, 0.03, 10), S.white, -0.04, 0.33, 0, 0, 0, 0.3);
    // flip-flops, kicked off at the foot of the lounger
    for (const s of [-1, 1]) {
      const fx = -0.55 + s * 0.08, fz = -1.15;
      putS(b, G.sphere(1, 10, 6), fx, 0.012, fz, S.coral, 0.05, 0.012, 0.13, 0, 0.3 + s * 0.15, 0);
      const ff = frame(fx, 0.02, fz, 0.3 + s * 0.15);
      for (const k of [-1, 1]) tubeIn(b, ff, 0, 0.004, -0.07, k * 0.045, 0.004, 0.015, 0.006, 0.006, S.white, 4);
      tubeIn(b, ff, 0, -0.004, -0.07, 0, 0.012, -0.07, 0.006, 0.006, S.white, 4);
    }
    // a starfish
    const sx = -1.05, sz = -0.75;
    putS(b, G.sphere(0.04, 8, 4), sx, 0.006, sz, S.orange, 1, 0.4, 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      putS(b, G.cone(0.032, 0.1, 5), sx + Math.cos(a) * 0.055, 0.008, sz + Math.sin(a) * 0.055, S.orange, 0.45, 1, 1, 0, -a, -Math.PI / 2);
    }
    // a few shells
    for (let i = 0; i < 16; i++) {
      const x = -2.1 + hash(i * 3.17 + 0.5) * 1.5, z = -1.1 + hash(i * 5.71 + 0.2) * 2.1;
      if (Math.hypot(x + 1.35, z - 0.62) < 0.25 || Math.hypot(x - sx, z - sz) < 0.15 || x > -0.5) continue;
      const k = hash(i * 7.3), a = hash(i * 2.9) * Math.PI * 2;
      if (k < 0.5) putS(b, G.sphere(0.025, 7, 4), x, 0.005, z, k < 0.3 ? S.shell : S.pink, 1, 0.4, 1.3, 0, a, 0);
      else put(b, G.cone(0.016, 0.05, 6), x, 0.01, z, S.shell, Math.PI / 2, a, 0);
    }
  }

  /** A thatched shade behind the lounger: a crooked pole and three courses of palm thatch, its hem stirring. */
  private shade(x: number, z: number) {
    const V = THREE.Vector3;
    const b = new Baker();
    const top = 2.72;
    // the pole, a little crooked, and the ribs under the thatch
    const pts = [new V(x, -0.3, z), new V(x + 0.03, 0.9, z - 0.02), new V(x - 0.02, 1.9, z + 0.01), new V(x, top + 0.05, z)];
    for (let i = 0; i < pts.length - 1; i++) tube(b, pts[i], pts[i + 1], 0.065 - i * 0.008, 0.06 - i * 0.008, S.woodB, 9);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      tube(b, new V(x, top - 0.02, z), new V(x + Math.cos(a) * 1.5, 1.98, z + Math.sin(a) * 1.5), 0.02, 0.016, S.drift, 5);
    }
    putS(b, G.sphere(1, 10, 6), x, top + 0.08, z, S.strawDark, 0.12, 0.14, 0.12);
    const pole = new THREE.Mesh(b.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-shade'));
    pole.castShadow = true;
    pole.receiveShadow = true;
    this.near.add(pole);

    const tex = thatchTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
    const sway = this.sway;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float hem = 1.0 - uv.y;
          float ta = atan(position.z, position.x);
          float k = 1.0 + hem * 0.012 * sin(uSway * 2.2 + ta * 7.0);
          transformed.xz *= k;
          transformed.y += hem * 0.01 * sin(uSway * 2.9 + ta * 11.0);`,
        );
    };
    mat.customProgramCacheKey = () => 'beach-thatch';
    backlit(mat, 0.5, this.sunView);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    // courses from the top down, each overlapping the one below, ragged and a little wavy
    const tiers: [number, number, number, number][] = [
      [0.12, 0.72, top + 0.06, top - 0.3],
      [0.55, 1.18, top - 0.2, 2.2],
      [1.0, 1.66, 2.3, 1.9],
    ];
    tiers.forEach(([r0, r1, y0, y1], i) => {
      const cg = new THREE.CylinderGeometry(r0, r1, y0 - y1, 56, 3, true);
      const p = cg.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < p.count; j++) {
        const a = Math.atan2(p.getZ(j), p.getX(j));
        const w = 1 + 0.025 * Math.sin(a * 5 + i * 1.7) + 0.015 * Math.sin(a * 13 + i);
        p.setXYZ(j, p.getX(j) * w, p.getY(j) + 0.02 * Math.sin(a * 3 + i), p.getZ(j) * w);
      }
      const uvs = cg.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uvs.count; j++) uvs.setX(j, uvs.getX(j) * (3 + i * 2));
      cg.computeVertexNormals();
      const m = new THREE.Mesh(cg, mat);
      m.position.set(x, (y0 + y1) / 2, z);
      m.rotation.y = i * 0.7;
      m.castShadow = true;
      m.receiveShadow = true;
      m.customDepthMaterial = depth;
      this.near.add(m);
    });
  }

  /** A hammock strung between two palms: spreader bars, cords fanning to them, the cloth sagging. */
  private hammock(b: Baker, pa: Palm, pb: Palm) {
    const V = THREE.Vector3;
    const at = (p: Palm, y: number) => {
      // where the trunk passes height y over the ground
      const q = new V();
      let lo = 0, hi = 0.5;
      const base = groundH(p.x, p.z);
      for (let i = 0; i < 20; i++) {
        const m = (lo + hi) / 2;
        Grove.trunkAt(p, m, q);
        if (q.y - base < y) lo = m;
        else hi = m;
      }
      return q;
    };
    const A = at(pa, 1.45), E = at(pb, 1.45);
    const dir = new V().subVectors(E, A);
    const span = dir.length();
    dir.normalize();
    const side = new V().crossVectors(dir, UP).normalize();
    // the trunks are thick: tie off on their faces
    A.addScaledVector(dir, 0.2);
    E.addScaledVector(dir, -0.2);
    for (const P of [A, E]) {
      const tor = G.torus(0.21, 0.014, 5, 16);
      const m = new THREE.Matrix4().compose(P, new THREE.Quaternion(), ONE);
      b.geo(tor, m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), S.rope);
    }
    const bar = 0.55, inset = 0.62;
    const sA = A.clone().addScaledVector(dir, inset).add(new V(0, -0.2, 0));
    const sE = E.clone().addScaledVector(dir, -inset).add(new V(0, -0.2, 0));
    for (const [P, S0] of [[A, sA], [E, sE]] as const) {
      tube(b, S0.clone().addScaledVector(side, -bar), S0.clone().addScaledVector(side, bar), 0.022, 0.022, S.wood, 7);
      for (let k = 0; k <= 6; k++) tube(b, P, S0.clone().addScaledVector(side, -bar + (2 * bar * k) / 6), 0.005, 0.005, S.rope, 3);
    }
    const len = sE.distanceTo(sA);
    const sag = 0.62;
    const geo = clothGeo(22, 10, (i, j, p) => {
      const u = i / 22, v = j / 10;
      const w = (v - 0.5) * 2;
      // the cloth gathers at the bars and opens out in the middle, its edges curling up
      const open = 0.45 + 0.55 * Math.sin(Math.PI * u);
      p.copy(sA).addScaledVector(dir, u * len).addScaledVector(side, w * bar * open);
      p.y += -sag * 4 * u * (1 - u) + 0.12 * w * w * Math.sin(Math.PI * u);
    });
    const mat = new THREE.MeshStandardMaterial({ map: hammockTexture(), side: THREE.DoubleSide, roughness: 0.9 });
    const cloth = new THREE.Mesh(geo, mat);
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    this.group.add(cloth);
    void span;
  }

  /** An outrigger canoe pulled up on the sand: a dugout hull with a painted band, booms out to its float, a paddle across it. */
  private canoe(b: Baker, x: number, l: number, yaw: number) {
    const z = shoreZ(x) + 2.4 + l;
    const f = frame(x, groundH(x, z) + 0.02, z, yaw);
    const L = 4.4, N = 26, M = 9;
    // the hull: an open U section lofted along its length, ends sweeping up
    const half = (u: number) => 0.27 * Math.pow(Math.sin(Math.PI * u), 0.55);
    const deep = (u: number) => 0.3 * Math.pow(Math.sin(Math.PI * u), 0.35);
    const rise = (u: number) => 0.1 * Math.pow(2 * u - 1, 4) * 1.6;
    const shell = (inset: number, s: Surface) => {
      const pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const u = 0.02 + (i / N) * 0.96;
        const w = Math.max(half(u) - inset, 0.005), d = Math.max(deep(u) - inset, 0.005);
        for (let j = 0; j <= M; j++) {
          const a = -Math.PI / 2 + (j / M) * Math.PI;
          pos.push(Math.sin(a) * w, 0.32 - Math.cos(a) * d + rise(u), (u - 0.5) * L);
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const a = i * (M + 1) + j, c = a + M + 1;
          if (inset > 0) idx.push(a, a + 1, c, a + 1, c + 1, c);
          else idx.push(a, c, a + 1, a + 1, c, c + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      b.geo(g, f, s);
    };
    shell(0, S.canoe);
    shell(0.03, S.canoeIn);
    // a band of paint just under the gunwale, and the gunwale's rail
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = 0.06 + (i / 16) * 0.88;
        pts.push(new THREE.Vector3(s * half(u) * 0.995, 0.3 + rise(u), (u - 0.5) * L).applyMatrix4(f));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        tube(b, pts[i], pts[i + 1], 0.018, 0.018, S.woodDark, 5);
        tube(b, pts[i].clone().add(new THREE.Vector3(0, -0.06, 0)), pts[i + 1].clone().add(new THREE.Vector3(0, -0.06, 0)), 0.02, 0.02, i % 4 === 1 ? S.paintRed : S.paint, 5);
      }
    }
    // two booms out to the float on the port side, lashed, with pegs down to it
    const ox = -1.45;
    for (const bz of [-0.85, 0.75]) {
      tubeIn(b, f, 0.32, 0.36, bz, ox, 0.3, bz + 0.05, 0.03, 0.026, S.drift, 6);
      for (const k of [0.25, -0.25]) putIn(b, f, G.torus(0.035, 0.008, 4, 10), S.rope, k, 0.36, bz, 0, 0, Math.PI / 2);
      tubeIn(b, f, ox, 0.3, bz + 0.05, ox, 0.1, bz + 0.05, 0.022, 0.022, S.driftDark, 5);
    }
    tubeIn(b, f, ox, 0.09, -1.55, ox, 0.09, 1.45, 0.07, 0.07, S.drift, 8);
    putIn(b, f, G.cone(0.07, 0.28, 8), S.drift, ox, 0.09, 1.59, Math.PI / 2, 0, 0);
    putIn(b, f, G.cone(0.07, 0.28, 8), S.drift, ox, 0.09, -1.69, -Math.PI / 2, 0, 0);
    // a paddle laid across it
    tubeIn(b, f, -0.45, 0.42, -0.2, 0.55, 0.38, 0.45, 0.016, 0.016, S.woodB, 6);
    putIn(b, f, G.box(0.16, 0.012, 0.4), S.woodB, 0.68, 0.37, 0.53, 0, -0.98, 0);
  }

  /** A bleached driftwood log at the top of the beach, and a coconut or two fallen on the sand. */
  private driftwood(b: Baker) {
    const V = THREE.Vector3;
    const x = -6.5, z = shoreZ(-6.5) + 6.8;
    const y = groundH(x, z);
    const a = new V(x - 1.3, y + 0.08, z - 0.2), e = new V(x + 1.2, y + 0.12, z + 0.35);
    tube(b, a, e, 0.17, 0.12, S.drift, 10);
    tube(b, e, e.clone().add(new V(0.5, 0.25, 0.2)), 0.07, 0.03, S.drift, 6);
    tube(b, a, a.clone().add(new V(-0.3, 0.35, -0.3)), 0.09, 0.04, S.driftDark, 6);
    putS(b, G.sphere(1, 10, 6), a.x, a.y, a.z, S.driftDark, 0.2, 0.18, 0.2);
    for (const [cx, cl, s] of [[3.6, 8.2, 0], [-2.2, 9.4, 1], [15.5, 7.6, 1]] as const) {
      const cz = shoreZ(cx) + cl;
      putS(b, G.sphere(1, 10, 7), cx, groundH(cx, cz) + 0.1, cz, s ? surf(0x6a4a2a, 0, 0.85) : surf(0x8a7a3a, 0, 0.6), 0.12, 0.11, 0.135, 0.3, cx, 0.2);
    }
  }

  /** Shells and pieces of coral along the high-water mark, either side of the robot. */
  private shells(b: Baker) {
    for (let i = 0; i < 90; i++) {
      const x = -22 + hash(i * 2.3) * 44;
      const z = shoreZ(x) + 1.5 + hash(i * 5.9) * 0.7 + (hash(i * 1.1) > 0.8 ? hash(i * 3.3) * 2.5 : 0);
      if (Math.abs(x) < 2.6 && z > -2) continue;
      const y = groundH(x, z);
      const k = hash(i * 8.1), a = hash(i * 4.4) * 6.28;
      if (k < 0.45) putS(b, G.sphere(0.03, 6, 4), x, y + 0.006, z, k < 0.3 ? S.shell : S.pink, 1, 0.4, 1.3, 0, a, 0);
      else if (k < 0.75) put(b, G.cone(0.02, 0.06, 6), x, y + 0.012, z, S.shell, Math.PI / 2, a, 0);
      else putS(b, G.ico(1), x, y + 0.01, z, S.cream, 0.05, 0.025, 0.035, 0, a, 0);
    }
  }

  /** The robot's footprints up from the water's edge to the lounger: it's been for a swim. */
  private footprints() {
    const tex = footprintTexture();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const a = new THREE.Vector2(3.6, shoreZ(3.6) + 0.95), b = new THREE.Vector2(1.25, -0.55);
    const d = b.clone().sub(a);
    const n = Math.round(d.length() / 0.36);
    const yaw = Math.atan2(d.x, d.y);
    const g = new THREE.PlaneGeometry(0.17, 0.3);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i <= n; i++) {
      const p = a.clone().addScaledVector(d, i / n);
      const side = i % 2 ? 1 : -1;
      const x = p.x + Math.cos(yaw) * side * 0.13, z = p.y - Math.sin(yaw) * side * 0.13;
      const q = g.clone();
      q.rotateY(yaw + (hash(i * 3.1) - 0.5) * 0.15);
      q.translate(x, groundH(x, z) + 0.006, z);
      const pp = q.attributes.position as THREE.BufferAttribute, uu = q.attributes.uv as THREE.BufferAttribute;
      const base = pos.length / 3;
      for (let k = 0; k < pp.count; k++) {
        pos.push(pp.getX(k), pp.getY(k), pp.getZ(k));
        uv.push(uu.getX(k), uu.getY(k));
      }
      const ix = q.index!;
      for (let k = 0; k < ix.count; k++) idx.push(ix.getX(k) + base);
      q.dispose();
    }
    g.dispose();
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex, color: 0x8a7556, transparent: true, opacity: 0.3, depthWrite: false }));
    m.renderOrder = 1;
    this.group.add(m);
  }

  /** Frigatebirds: long, angular black wings and a forked tail, soaring in slow circles. */
  private frigatebirds() {
    const pos = [
      // wings: a long crook at the wrist on each side
      0, 0, 0.12, 0.38, 0.06, 0.02, 0, 0, -0.1,
      0.38, 0.06, 0.02, 1.0, -0.04, -0.18, 0.36, 0.05, -0.08,
      0, 0, 0.12, 0, 0, -0.1, -0.38, 0.06, 0.02,
      -0.38, 0.06, 0.02, -0.36, 0.05, -0.08, -1.0, -0.04, -0.18,
      // body and the forked tail
      0, -0.02, 0.38, 0.06, 0, -0.1, -0.06, 0, -0.1,
      0, 0, -0.1, 0.12, 0, -0.62, 0.03, 0, -0.2,
      0, 0, -0.1, -0.03, 0, -0.2, -0.12, 0, -0.62,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(geo, mat, 3);
    m.frustumCulled = false;
    return m;
  }

  private _bm = new THREE.Matrix4();
  private _bq = new THREE.Quaternion();
  private _bp = new THREE.Vector3();
  private _bs = new THREE.Vector3();
  private _be = new THREE.Euler();
  /** The birds wheel slowly on the breeze, high over the bay, now and then tilting into a turn. */
  private flyBirds(time: number) {
    const rings: [number, number, number, number, number, number][] = [
      [55, -14, 24, 16, 0.07, 0],
      [70, 4, 30, 22, -0.05, 2],
      [-35, -20, 27, 14, 0.06, 4],
    ];
    rings.forEach(([cx, cz, y, r, w, ph], i) => {
      const a = time * w + ph;
      const s = Math.sign(w);
      this._bp.set(cx + Math.cos(a) * r, y + 1.5 * Math.sin(time * 0.13 + i), cz + Math.sin(a) * r);
      const heading = Math.atan2(-Math.sin(a) * s, Math.cos(a) * s);
      this._be.set(0, Math.PI / 2 - heading, -s * (0.32 + 0.08 * Math.sin(time * 0.4 + i)), 'YXZ');
      this._bq.setFromEuler(this._be);
      this._bm.compose(this._bp, this._bq, this._bs.setScalar(1.05));
      this.birds.setMatrixAt(i, this._bm);
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the performance

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
    this.coco.bounced = 0;
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

  /** From the robot's left, swung about 10 degrees round towards its back, the lagoon off to the left, drifting slowly. */
  private idleCam(k: SceneKit, time: number, snap = false) {
    const z = this.size;
    // the robot's left is the world's -x, its back (the backrest end) the world's +z
    const a = 0.17 + 0.06 * Math.sin(time * 0.06);
    const r = (3.3 + 0.1 * Math.sin(time * 0.045)) * z;
    const c = k.cam;
    c.look.set(0, 0.8 * z, -0.12 * z);
    c.pos.set(-Math.cos(a) * r, (1.5 + 0.06 * Math.sin(time * 0.09)) * z, c.look.z + Math.sin(a) * r);
    c.fov = 1;
    c.roll = 0;
    c.lambda = 1.5;
    c.cut = snap;
  }

  update(dt: number, time: number, k: SceneKit) {
    this.t += dt;
    const t = this.t;
    const a = k.actor;
    this.time.value = time;
    this.sway.value = time;
    this.flyBirds(time);

    const o = this.pose;
    if (this.mode === 'idle') {
      sample(o, BP.IDLE, t % BP.IDLE_LEN);
      // breathing, a slow nod along to the music, a lazily tapping foot. The nod eases in and out
      // of each beat (a clipped sine starts it with a kick, and the hand holding the coconut to
      // the mouth, placed off the head, would kick with it) and rests while it drinks.
      const u = t % BP.IDLE_LEN;
      const lounging = 1 - ramp(u, 5.6, 6.3) + ramp(u, 8.2, 8.9);
      const beat = Math.max(0, Math.sin(time * Math.PI * 1.3));
      o[PoseCh.SPINE] += 0.018 * Math.sin(time * 1.3);
      o[PoseCh.HEAD + 1] += 0.22 * Math.sin(time * 0.17) * lounging;
      o[PoseCh.HEAD] += 0.03 * beat * beat * lounging;
      o[PoseCh.FLEX + 1] += 0.22 * Math.max(0, Math.sin(time * Math.PI * 1.3));
      this.idleCam(k, time);
    } else this.outroStep(k);

    if (t < BP.CALL.stand + 0.6 || this.mode === 'idle') a.puppet.solve(o);
    a.step(dt);
    a.draw(time);
    this.props(dt, time, k);
  }

  private outroStep(k: SceneKit) {
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
      // cut round to the front as the phone rings (the idle shot is from the robot's side), then push in
      const first = this.once('cutRing', 0);
      if (first) cam.pos.set(-2.2 * z, 1.45 * z, -1.95 * z);
      else cam.pos.set(-1.6 * z, 1.32 * z, -1.3 * z);
      cam.look.set(-0.3 * z, 0.95 * z, 0.22 * z);
      cam.fov = 0.82;
      cam.lambda = first ? 100 : 1.7;
      cam.cut = first;
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
      const floor = groundH(c.pos.x, c.pos.z) + 0.1 * z;
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
      this.holo.quaternion.copy(this.billboard(k));
      this.holo.scale.setScalar(z * (0.6 + 0.4 * h));
      this.holoMat.color.setScalar(RenderSettings.glow(1.8) * h * (0.85 + 0.15 * Math.sin(time * 40)));
    }
  }

  private _hq = new THREE.Quaternion();
  private _hm = new THREE.Matrix4();
  /** Face the hologram at the camera. */
  private billboard(k: SceneKit) {
    this._hm.lookAt(k.cam.pos, this.holo.position, UP);
    return this._hq.setFromRotationMatrix(this._hm);
  }
}

