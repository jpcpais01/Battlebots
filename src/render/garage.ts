import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../sim/math';
import { Baker, bakedGlowMaterial, surf, vertexPBR, type GlowKey, type Surface, type Surfaces } from './bake';
import { buildFist, buildFoot, buildForearm, buildHead, buildShin, buildShinGuard, buildThigh, buildToe, buildTorso, buildUpperArm, G, type PB } from './parts';
import { RenderSettings } from './settings';
import { contactAO } from './ao';
import type { Fx } from './fx';
import type { LightLook, Quality } from './stage';

/** Room half-width (x), half-depth (z) and height. The robot stands at the origin. */
const W = 7;
const D = 6;
const H = 4.8;

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _l = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const S = {
  steel: surf(0x8b929c, 0.85, 0.32),
  dark: surf(0x2a2f37, 0.7, 0.45),
  black: surf(0x121418, 0.35, 0.6),
  rubber: surf(0x0b0c0e, 0, 0.92),
  chrome: surf(0xdfe4ea, 1, 0.14),
  yellow: surf(0xf0b21c, 0.25, 0.45),
  red: surf(0xc4262b, 0.45, 0.3),
  orange: surf(0xff6f1a, 0.3, 0.4),
  blue: surf(0x2f5d9e, 0.35, 0.42),
  slate: surf(0x3e4b5c, 0.4, 0.5),
  wood: surf(0x9a6a3e, 0, 0.62),
  crate: surf(0x8a6a44, 0, 0.8),
  cardboard: surf(0xa47a4c, 0, 0.88),
  white: surf(0xd9dce0, 0.1, 0.5),
  green: surf(0x2e6a40, 0.4, 0.4),
  ceiling: surf(0x15171b, 0.2, 0.9),
  door: surf(0xaab2bd, 0.55, 0.42),
  glass: surf(0x0c1218, 0.9, 0.08),
};

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));
const TUBE = 0xeef4ff;

/** Finishes for spare robot parts lying around the shop: grey primer, plus a few painted ones. */
function spare(primary: number, secondary: number): Surfaces {
  return {
    paint: surf(primary, 0.3, 0.5),
    paint2: surf(secondary, 0.35, 0.5),
    metal: surf(0x4a505a, 0.85, 0.34),
    chrome: surf(0xd9dee6, 1, 0.14),
    dark: surf(0x16191f, 0.45, 0.58),
    joint: surf(0x2b3039, 0.8, 0.38),
  };
}
const SPARES = [spare(0x7a7f87, 0x51565e), spare(0x7a7f87, 0x51565e), spare(0xff7a1a, 0x2a2f37), spare(0x2d6cdf, 0xd9dce0), spare(0xd9283e, 0x22252d)];
/** Spare parts are unpowered: their lights are dark glass. */
const DEAD: Record<GlowKey, THREE.Color> = { glow: new THREE.Color(0x1a2026), core: new THREE.Color(0x1c242c), rarity: new THREE.Color(0x20262c) };

/** Places primitives in nested local frames and bakes them (see Baker). */
class Kit {
  readonly b = new Baker();
  private stack = [new THREE.Matrix4()];
  /** Extra geometry for meshes with their own material (screens, signs, hazard tape...). */
  readonly extra = new Map<string, THREE.BufferGeometry[]>();

  private get top() {
    return this.stack[this.stack.length - 1];
  }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    this.stack.push(this.top.clone().multiply(new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.setScalar(1))));
    return this;
  }
  pop() {
    this.stack.pop();
    return this;
  }
  /** World matrix of a local placement. */
  mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().copy(this.top).multiply(_l.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  }
  /** A local point in world space. */
  point(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.top);
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, s: Surface, rx = 0, ry = 0, rz = 0) {
    this.b.geo(UNIT_BOX, this.mat(x, y, z, rx, ry, rz, w, h, d), s);
    return this;
  }
  cbox(w: number, h: number, d: number, x: number, y: number, z: number, s: Surface, c = 0.015, rx = 0, ry = 0, rz = 0) {
    this.b.geo(G.cbox(w, h, d, c), this.mat(x, y, z, rx, ry, rz), s);
    return this;
  }
  cyl(r: number, h: number, x: number, y: number, z: number, s: Surface, rx = 0, ry = 0, rz = 0, seg = 12, rTop = r) {
    this.b.geo(G.cyl(rTop, r, h, seg), this.mat(x, y, z, rx, ry, rz), s);
    return this;
  }
  geo(g: THREE.BufferGeometry, x: number, y: number, z: number, s: Surface, rx = 0, ry = 0, rz = 0, sc = 1) {
    this.b.geo(g, this.mat(x, y, z, rx, ry, rz, sc, sc, sc), s);
    return this;
  }
  glowBox(w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, rx = 0, ry = 0, rz = 0) {
    this.b.glow(UNIT_BOX, this.mat(x, y, z, rx, ry, rz, w, h, d), c);
    return this;
  }
  glowGeo(g: THREE.BufferGeometry, x: number, y: number, z: number, c: THREE.Color, rx = 0, ry = 0, rz = 0) {
    this.b.glow(g, this.mat(x, y, z, rx, ry, rz), c);
    return this;
  }
  part(pb: PB, x: number, y: number, z: number, rx: number, ry: number, rz: number, s: Surfaces, g = DEAD) {
    this.b.part(pb, this.mat(x, y, z, rx, ry, rz), s, g);
    return this;
  }
  /** A square bar from a to b (local points). */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, s: Surface, round = false) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const len = a.distanceTo(b);
    _a.subVectors(b, a).normalize();
    _q.setFromUnitVectors(_up, _a);
    const m = new THREE.Matrix4().copy(this.top).multiply(_l.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1, 1, 1)));
    if (round) this.b.geo(G.cyl(w / 2, w / 2, len, 10), m, s);
    else this.b.geo(UNIT_BOX, m.multiply(_l.makeScale(w, len, w)), s);
    return this;
  }
  /** Geometry for a mesh of its own, placed in the current frame. */
  add(key: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const out = g.index ? g.toNonIndexed() : g.clone();
    out.applyMatrix4(this.mat(x, y, z, rx, ry, rz));
    let list = this.extra.get(key);
    if (!list) this.extra.set(key, (list = []));
    list.push(out);
    return this;
  }
}

/** Plane with UVs cropped to a region (u0, v0, u1, v1) of an atlas. */
function atlasPlane(w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** Box whose UVs are in metres / `tile`, so a striped texture keeps its scale on any size. */
function tiledBox(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // faces: +x, -x (d × h), +y, -y (w × d), +z, -z (w × h); 4 vertices each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
  }
  return g;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft concrete mottling: many faint light and dark blotches. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rMax: number, alpha: number, rng: Rng) {
  for (let i = 0; i < n; i++) {
    const x = rng.next() * w, y = rng.next() * h, r = rng.range(rMax * 0.2, rMax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.chance(0.5) ? '255,255,255' : '0,0,0';
    gr.addColorStop(0, `rgba(${c},${alpha * rng.range(0.4, 1)})`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Polished shop concrete with expansion joints, the lift bay markings, stains and tyre scuffs. */
function floorTexture(size: number) {
  const { c, g } = canvas(size, size);
  const rng = new Rng(11);
  const ppm = size / 14; // the texture spans 14 × 14 m around the bay
  const X = (x: number) => (x + 7) * ppm;
  const Z = (z: number) => (z + 7) * ppm;
  g.fillStyle = '#4b4e53';
  g.fillRect(0, 0, size, size);
  mottle(g, size, size, 700, ppm * 1.2, 0.06, rng);
  // fine aggregate
  for (let i = 0; i < size * 30; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(rng.next() * size, rng.next() * size, 1.5, 1.5);
  }
  // cut expansion joints every 2 m
  g.strokeStyle = 'rgba(10,12,14,0.55)';
  g.lineWidth = Math.max(1, ppm * 0.012);
  for (let k = -6; k <= 6; k += 2) {
    g.beginPath();
    g.moveTo(X(k), 0);
    g.lineTo(X(k), size);
    g.moveTo(0, Z(k));
    g.lineTo(size, Z(k));
    g.stroke();
  }
  // oil stains under the benches, scuffs across the bay
  for (let i = 0; i < 26; i++) {
    const x = X(rng.range(-6, 6)), z = rng.chance(0.6) ? Z(rng.range(-5.6, -4.4)) : Z(rng.range(-5, 5));
    const r = rng.range(0.15, 0.5) * ppm;
    const gr = g.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, 'rgba(12,10,8,0.35)');
    gr.addColorStop(1, 'rgba(12,10,8,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, z, r, r * rng.range(0.5, 1), rng.next() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(14,14,16,${rng.range(0.08, 0.18)})`;
    g.lineWidth = ppm * rng.range(0.05, 0.1);
    const a = rng.next() * Math.PI, r = rng.range(1.8, 4);
    g.beginPath();
    g.arc(X(0), Z(0), r * ppm, a, a + rng.range(0.4, 1.2));
    g.stroke();
  }
  // cool night light spilling under the roll-up door (left wall)
  const spill = g.createLinearGradient(X(-6), 0, X(-3.6), 0);
  spill.addColorStop(0, 'rgba(120,170,255,0.22)');
  spill.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = spill;
  g.fillRect(X(-6), Z(-2.8), X(-3.6) - X(-6), Z(1.8) - Z(-2.8));

  // the work bay: painted lane lines with hazard corners
  const lane = (x0: number, z0: number, x1: number, z1: number) => {
    g.strokeStyle = 'rgba(240,178,28,0.82)';
    g.lineWidth = ppm * 0.08;
    g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  };
  lane(-3.6, -3.4, 3.6, 3.6);
  g.save();
  // turntable: brushed steel deck in the floor
  const R = 1.18;
  const deck = g.createRadialGradient(X(0), Z(0), 0, X(0), Z(0), R * ppm);
  deck.addColorStop(0, '#3a3f46');
  deck.addColorStop(0.85, '#30353b');
  deck.addColorStop(1, '#23272c');
  g.fillStyle = deck;
  g.beginPath();
  g.arc(X(0), Z(0), R * ppm, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let r = 0.1; r < R; r += 0.035) {
    g.beginPath();
    g.arc(X(0), Z(0), r * ppm, 0, Math.PI * 2);
    g.stroke();
  }
  // diamond tread studs
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = -R; x < R; x += 0.09) for (let z = -R; z < R; z += 0.09) {
    const ox = x + ((Math.round(z / 0.09) & 1) * 0.045);
    if (ox * ox + z * z > (R - 0.06) ** 2) continue;
    g.save();
    g.translate(X(ox), Z(z));
    g.rotate(Math.PI / 4);
    g.fillRect(-ppm * 0.012, -ppm * 0.004, ppm * 0.024, ppm * 0.008);
    g.restore();
  }
  g.strokeStyle = '#8c939b';
  g.lineWidth = ppm * 0.04;
  g.beginPath();
  g.arc(X(0), Z(0), R * ppm, 0, Math.PI * 2);
  g.stroke();
  // hazard ring
  g.beginPath();
  g.arc(X(0), Z(0), 1.62 * ppm, 0, Math.PI * 2);
  g.arc(X(0), Z(0), 1.42 * ppm, 0, Math.PI * 2, true);
  g.clip();
  g.fillStyle = '#e8ac1a';
  g.fillRect(X(-1.7), Z(-1.7), 3.4 * ppm, 3.4 * ppm);
  g.fillStyle = '#16181b';
  g.translate(X(0), Z(0));
  g.rotate(Math.PI / 4);
  for (let k = -2.6; k < 2.6; k += 0.2) g.fillRect(k * ppm, -2.6 * ppm, 0.1 * ppm, 5.2 * ppm);
  g.restore();
  // stencils, readable from the default camera side (+z)
  g.fillStyle = 'rgba(240,178,28,0.75)';
  g.font = `${Math.round(ppm * 0.34)}px "Russo One", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BAY 01', X(0), Z(2.25));
  g.font = `${Math.round(ppm * 0.16)}px "Rajdhani", sans-serif`;
  g.fillStyle = 'rgba(230,234,240,0.4)';
  g.fillText('KEEP CLEAR · ROBOT UNDER SERVICE', X(0), Z(2.62));
  // walkway arrows
  g.fillStyle = 'rgba(230,234,240,0.18)';
  for (const z of [-1.5, 0.5, 2.5]) {
    g.beginPath();
    g.moveTo(X(-5.3), Z(z - 0.25));
    g.lineTo(X(-4.9), Z(z));
    g.lineTo(X(-5.3), Z(z + 0.25));
    g.lineTo(X(-5.15), Z(z));
    g.fill();
  }
  // corners and wall bases darken (baked occlusion)
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || size, Math.abs(y1 - y0) || size);
  };
  edge(X(-7), 0, X(-6.2), 0);
  edge(X(7), 0, X(6.2), 0);
  edge(0, Z(-6), 0, Z(-5.1));
  edge(0, Z(6), 0, Z(5.2));
  return texture(c);
}

/** Painted block wall: dark wainscot, an orange stripe, light blocks above. Tiles every 4 m. */
function wallTexture() {
  const { c, g } = canvas(512, 614);
  const ppm = 128;
  const rng = new Rng(5);
  const y = (h: number) => 614 - h * ppm;
  g.fillStyle = '#5f656e';
  g.fillRect(0, 0, 512, 614);
  g.fillStyle = '#28323e';
  g.fillRect(0, y(1.2), 512, 1.2 * ppm);
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, y(1.27), 512, 0.07 * ppm);
  mottle(g, 512, 614, 260, 60, 0.05, rng);
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 1.5;
  for (let r = 0; r < 24; r++) {
    const yy = y(r * 0.2);
    g.beginPath();
    g.moveTo(0, yy);
    g.lineTo(512, yy);
    g.stroke();
    for (let k = 0; k < 11; k++) {
      const xx = (k * 0.4 + (r & 1 ? 0.2 : 0)) * ppm;
      g.beginPath();
      g.moveTo(xx, yy);
      g.lineTo(xx, yy - 0.2 * ppm);
      g.stroke();
    }
  }
  // light falls off towards the ceiling, and the floor joint is shadowed
  const v = g.createLinearGradient(0, 0, 0, 614);
  v.addColorStop(0, 'rgba(0,0,0,0.55)');
  v.addColorStop(0.35, 'rgba(0,0,0,0.1)');
  v.addColorStop(0.92, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = v;
  g.fillRect(0, 0, 512, 614);
  return texture(c, true);
}

function hazardTexture() {
  const { c, g } = canvas(64, 64);
  g.fillStyle = '#e8ac1a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16181b';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(32, 0);
  g.lineTo(0, 32);
  g.fill();
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 32);
  g.lineTo(32, 64);
  g.lineTo(0, 64);
  g.fill();
  return texture(c, true);
}

interface Silhouette {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}

/** Steel pegboard with a painted outline behind every tool (a shadow board). */
function pegboardTexture(w: number, h: number, outlines: Silhouette[]) {
  const ppm = 256;
  const { c, g } = canvas(Math.round(w * ppm), Math.round(h * ppm));
  g.fillStyle = '#394452';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#141920';
  const step = 0.025 * ppm;
  for (let x = step / 2; x < c.width; x += step) for (let y = step / 2; y < c.height; y += step) {
    g.beginPath();
    g.arc(x, y, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(236,226,206,0.5)';
  for (const o of outlines) {
    const pad = 0.012;
    const x = (o.x + w / 2 - o.w / 2 - pad) * ppm, y = (h - o.y - o.h / 2 - pad) * ppm;
    g.save();
    g.translate(x + ((o.w + pad * 2) * ppm) / 2, y + ((o.h + pad * 2) * ppm) / 2);
    g.rotate(-(o.r ?? 0));
    g.fillRect((-(o.w + pad * 2) * ppm) / 2, (-(o.h + pad * 2) * ppm) / 2, (o.w + pad * 2) * ppm, (o.h + pad * 2) * ppm);
    g.restore();
  }
  // frame shadow
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, c.width, c.height);
  return texture(c);
}

/** Neon shop sign on black (drawn additively, so black is see-through). */
function signTexture() {
  const { c, g } = canvas(1024, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 256);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '118px "Russo One", Impact, sans-serif';
  g.lineJoin = 'round';
  for (const [blur, col, lw] of [[40, 'rgba(255,110,20,0.9)', 14], [14, 'rgba(255,150,60,1)', 8], [0, '#ffe2c0', 3]] as [number, string, number][]) {
    g.shadowBlur = blur;
    g.shadowColor = col;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.strokeText('BOT GARAGE', 512, 112);
  }
  g.shadowBlur = 18;
  g.shadowColor = 'rgba(42,216,255,1)';
  g.strokeStyle = '#aef4ff';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(170, 205);
  g.lineTo(854, 205);
  g.stroke();
  g.font = '34px "Rajdhani", sans-serif';
  g.fillStyle = '#aef4ff';
  g.fillText('BUILD · TUNE · FIGHT', 512, 236);
  return texture(c);
}

/** Marker sketches of fight plans on a whiteboard. */
function whiteboardTexture() {
  const { c, g } = canvas(512, 280);
  g.fillStyle = '#e8ebee';
  g.fillRect(0, 0, 512, 280);
  const smear = g.createLinearGradient(0, 0, 512, 280);
  smear.addColorStop(0, 'rgba(120,130,140,0.08)');
  smear.addColorStop(1, 'rgba(120,130,140,0)');
  g.fillStyle = smear;
  g.fillRect(0, 0, 512, 280);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // robot doodle
  g.strokeStyle = '#1d4fb8';
  g.lineWidth = 4;
  g.strokeRect(70, 60, 50, 40);
  g.strokeRect(55, 108, 80, 80);
  g.beginPath();
  g.moveTo(55, 120);
  g.lineTo(25, 165);
  g.moveTo(135, 120);
  g.lineTo(170, 95);
  g.moveTo(75, 188);
  g.lineTo(70, 245);
  g.moveTo(115, 188);
  g.lineTo(122, 245);
  g.stroke();
  g.beginPath();
  g.arc(178, 88, 12, 0, Math.PI * 2);
  g.stroke();
  // impact star
  g.strokeStyle = '#d4282e';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.moveTo(200 + Math.cos(a) * 8, 80 + Math.sin(a) * 8);
    g.lineTo(200 + Math.cos(a) * 22, 80 + Math.sin(a) * 22);
  }
  g.stroke();
  g.fillStyle = '#1b1e22';
  g.font = '26px "Rajdhani", sans-serif';
  g.fillText('JAB → JAB → HOOK', 250, 70);
  g.fillText('watch the left kick', 250, 110);
  g.fillStyle = '#d4282e';
  g.fillText('TORQUE +12%', 250, 160);
  g.strokeStyle = '#1b8a4a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(250, 220);
  g.lineTo(290, 200);
  g.lineTo(330, 210);
  g.lineTo(370, 180);
  g.lineTo(410, 190);
  g.lineTo(460, 150);
  g.stroke();
  g.strokeStyle = '#1b1e22';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(250, 240);
  g.lineTo(470, 240);
  g.moveTo(250, 240);
  g.lineTo(250, 140);
  g.stroke();
  return texture(c);
}

/** Lighting for the workshop: a cool overhead work light on the bay, warm and cool work lamps on the gantry. */
const GARAGE_LOOK: LightLook = {
  background: 0x0b0d11,
  fog: 0x0d1015,
  fogDensity: 0.032,
  envIntensity: 0.62,
  hemi: { sky: 0xb4c4dc, ground: 0x2a2520, intensity: 0.85 },
  key: { color: 0xf2f6ff, intensity: 2.7, pos: [0.9, 4.3, 1.9], target: [0, 0.9, 0], angle: 0.78, penumbra: 0.75, near: 1, far: 10, focus: 0.85 },
  rims: [
    { color: 0xffa25a, intensity: 12, distance: 11, pos: [-2.0, 2.7, -1.15] },
    { color: 0x6cc8ff, intensity: 12, distance: 11, pos: [2.0, 2.6, -1.15] },
  ],
};

/**
 * The robotics workshop the garage screen happens in: a flush turntable bay under a yellow gantry,
 * workbenches and a shadow board, shelves of spare parts, a welding cell, a roll-up door and the
 * desk where the fights get planned.
 *
 * Everything static is baked into a handful of merged meshes (one per material), so the whole room
 * is about a dozen draw calls. It only exists while the garage is open: the arena and its crowd are
 * hidden and stop updating.
 */
export class Garage {
  readonly group = new THREE.Group();
  /** Gantry and bay props near the robot (cast shadows; dissolved when they block the view). */
  readonly near = new THREE.Group();
  private scan: THREE.Group;
  private scanMats: THREE.Material[] = [];
  private scanT = -1;
  private ledRing: THREE.MeshBasicMaterial;
  private blink: THREE.MeshBasicMaterial[] = [];
  private flicker: THREE.MeshBasicMaterial;
  private flickerT = 0;
  private tubeOn = glow(TUBE, 3.2);
  private tubeOff = glow(TUBE, 1.05);
  private screens: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; t: number; lines: string[]; graph: number[][] };
  private weld = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), on: false, t: 2, flash: 0 };
  private botName = '';
  private botPower = 0;
  private rng = new Rng(77);

  constructor(quality: Quality) {
    const near = new Kit();
    const far = new Kit();
    this.buildGantry(near);
    this.buildBay(far);
    this.buildCeiling(far);
    const pegTools: Silhouette[] = [];
    far.push(-2.6, 0, -D);
    this.buildBench(far, pegTools);
    far.pop();
    far.push(1.45, 0, -D);
    this.buildShelves(far, 2.4, 2.6, 0.55, 3);
    far.pop();
    far.push(3.35, 0, -D + 0.22);
    this.buildPillar(far);
    far.pop();
    far.push(4.7, 0, -D);
    this.buildToolChest(far);
    far.pop();
    far.push(6.25, 0, -D + 0.4, -0.5);
    this.buildCompressor(far);
    far.pop();
    far.push(-W, 0, 0, Math.PI / 2);
    this.buildDoorWall(far);
    far.pop();
    far.push(0, 0, D, Math.PI);
    this.buildDeskWall(far);
    far.pop();
    far.push(W, 0, 0, -Math.PI / 2);
    this.buildWeldWall(far);
    far.pop();

    // ---------------------------------------------------------------- meshes
    const g = this.group;
    const floorMat = contactAO.patch(new THREE.MeshStandardMaterial({ map: floorTexture(quality === 'high' ? 2048 : 1024), roughness: 0.55, metalness: 0.08 }), {
      spheres: true,
      floor: true,
      strength: 2,
      direct: 0.7,
    });
    const floorGeo = new THREE.PlaneGeometry(14, 14);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    g.add(floor);

    // walls: UVs in metres so the 4 m texture tile keeps its scale
    const walls: THREE.BufferGeometry[] = [];
    const wall = (len: number, x: number, z: number, ry: number) => {
      const p = new THREE.PlaneGeometry(len, H);
      const uv = p.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 4);
      p.rotateY(ry);
      p.translate(x, H / 2, z);
      walls.push(p);
    };
    wall(14, 0, -D, 0);
    wall(14, 0, D, Math.PI);
    wall(12, -W, 0, Math.PI / 2);
    wall(12, W, 0, -Math.PI / 2);
    const wallMat = contactAO.patch(new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.86, metalness: 0 }), { ground: { y: 0, height: 0.5, k: 0.4 } });
    const wallMesh = new THREE.Mesh(mergeGeometries(walls), wallMat);
    wallMesh.receiveShadow = true;
    g.add(wallMesh);

    const props = (k: Kit, cast: boolean, parent: THREE.Object3D, spheres: boolean) => {
      const { opaque, emissive } = k.b.build();
      if (opaque) {
        const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'garage-props'), { spheres, ground: { y: 0, height: 0.35, k: 0.45 }, direct: 0.5 }));
        m.castShadow = cast;
        m.receiveShadow = true;
        parent.add(m);
      }
      if (emissive) parent.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    };
    props(far, false, g, false);
    props(near, true, this.near, true);
    g.add(this.near);

    const extra = (k: Kit, key: string, mat: THREE.Material, parent: THREE.Object3D = g) => {
      const list = k.extra.get(key);
      if (!list?.length) return null;
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      parent.add(m);
      return m;
    };
    extra(far, 'peg', new THREE.MeshStandardMaterial({ map: pegboardTexture(4, 1.6, pegTools), roughness: 0.55, metalness: 0.45 }))!.receiveShadow = true;
    extra(far, 'board', new THREE.MeshStandardMaterial({ map: whiteboardTexture(), roughness: 0.3, metalness: 0 }));
    extra(
      far,
      'sign',
      new THREE.MeshBasicMaterial({ map: signTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(2.2)), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
    );
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.55, metalness: 0.2 });
    extra(far, 'hazard', hazard);
    const nearHazard = extra(near, 'hazard', hazard, this.near);
    if (nearHazard) nearHazard.castShadow = true;

    // monitors: one canvas, three screens
    const sc = canvas(768, 160);
    const tex = texture(sc.c);
    this.screens = { tex, g: sc.g, t: 0, lines: [], graph: [[], []] };
    extra(far, 'screens', new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.5)), toneMapped: false }));
    for (const key of ['blinkA', 'blinkB']) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      if (extra(far, key, mat)) this.blink.push(mat);
    }
    this.flicker = new THREE.MeshBasicMaterial({ color: glow(TUBE, 3.2), toneMapped: false });
    extra(far, 'flicker', this.flicker);
    this.ledRing = new THREE.MeshBasicMaterial({ color: glow(0x2ad8ff, 2.6), toneMapped: false });
    extra(far, 'ledRing', this.ledRing);

    // equip scan: a ring of light that sweeps up the robot
    this.scan = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: glow(0x6ff7ff, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sheetMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: glow(0x2ad8ff, 1.6) }, uA: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(uColor * vY * vY * uA, 1.0); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.008, 4, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.16, 48, 1, true), sheetMat);
    sheet.position.y = -0.08;
    this.scan.add(ring, sheet);
    this.scan.visible = false;
    this.scanMats = [ringMat, sheetMat];
    g.add(this.scan);

    g.visible = false;
    this.drawScreens(true);
  }

  // ------------------------------------------------------------------ build

  /** Gantry crane over the bay, with work lamps aimed at the robot. */
  private buildGantry(k: Kit) {
    for (const x of [-2.15, 2.15]) {
      k.box(0.62, 0.04, 0.62, x, 0.02, -1.35, S.dark);
      for (const [bx, bz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) k.cyl(0.022, 0.05, x + bx, 0.05, -1.35 + bz, S.chrome, 0, 0, 0, 6);
      k.cbox(0.24, 3.6, 0.24, x, 1.84, -1.35, S.yellow, 0.02);
      k.add('hazard', tiledBox(0.26, 0.5, 0.26, 0.2), x, 0.29, -1.35);
      // knee braces
      const s = Math.sign(x);
      k.rod(x - s * 0.1, 3.1, -1.35, x - s * 0.62, 3.62, -1.35, 0.08, S.yellow);
      // cable tray up the column
      k.box(0.06, 3.2, 0.04, x + s * 0.13, 1.7, -1.35, S.dark);
      // work lamp aimed at the robot
      k.push(x - s * 0.05, 2.7, -1.2, Math.atan2(-x, 1.2), 0.25);
      k.cbox(0.34, 0.22, 0.14, 0, 0, 0, S.dark, 0.02);
      k.glowBox(0.28, 0.16, 0.01, 0, 0, 0.072, glow(s < 0 ? 0xffc890 : 0xbfe6ff, 3));
      k.box(0.04, 0.12, 0.04, 0, -0.14, -0.04, S.steel);
      k.pop();
    }
    k.cbox(4.72, 0.3, 0.24, 0, 3.75, -1.35, S.yellow, 0.02);
    k.box(4.6, 0.04, 0.3, 0, 3.6, -1.35, S.dark);
    // trolley, chain hoist, hook
    k.cbox(0.4, 0.14, 0.34, 0.3, 3.52, -1.35, S.dark, 0.02);
    for (const z of [-0.12, 0.12]) k.cyl(0.04, 0.05, 0.3, 3.6, -1.35 + z, S.steel, Math.PI / 2, 0, 0, 10);
    k.cbox(0.3, 0.32, 0.24, 0.3, 3.28, -1.35, S.red, 0.04);
    k.cyl(0.07, 0.06, 0.3, 3.28, -1.22, S.dark, Math.PI / 2, 0, 0, 12);
    k.cyl(0.012, 0.7, 0.3, 2.77, -1.35, S.dark, 0, 0, 0, 6);
    k.cyl(0.012, 1.1, 0.42, 2.6, -1.35, S.dark, 0, 0, 0.02, 6);
    k.cbox(0.1, 0.12, 0.08, 0.3, 2.38, -1.35, S.dark, 0.02);
    k.geo(G.torus(0.06, 0.016, 6, 14, Math.PI * 1.5), 0.3, 2.26, -1.35, S.orange, 0, 0, Math.PI * 0.75);
  }

  /** Floor level of the bay: the turntable ring and a few low things (nothing tall, so the robot is never hidden). */
  private buildBay(k: Kit) {
    k.add('ledRing', new THREE.TorusGeometry(1.31, 0.014, 4, 96), 0, 0.006, 0, Math.PI / 2);
    k.geo(G.torus(1.2, 0.018, 4, 72), 0, 0.004, 0, S.steel, Math.PI / 2);
    // power cable from the right column to the bay
    k.cyl(0.018, 1.0, 1.6, 0.018, -1.0, S.rubber, Math.PI / 2, 0.7, 0, 6);
    k.cyl(0.018, 0.6, 1.95, 0.018, -1.3, S.rubber, 0, 0, Math.PI / 2, 6);
    k.push(-2.7, 0, 2.0, 0.4);
    k.cbox(0.46, 0.035, 1.0, 0, 0.1, 0, S.red, 0.012);
    k.box(0.4, 0.03, 0.2, 0, 0.13, 0.36, S.black);
    for (const [x, z] of [[-0.18, -0.4], [0.18, -0.4], [-0.18, 0.4], [0.18, 0.4]]) k.cyl(0.035, 0.07, x, 0.04, z, S.rubber, 0, 0, Math.PI / 2, 8);
    k.pop();
    k.push(2.55, 0, 1.75, -0.35);
    k.cbox(0.52, 0.22, 0.24, 0, 0.11, 0, S.red, 0.015);
    k.box(0.5, 0.01, 0.245, 0, 0.17, 0, S.dark);
    k.box(0.3, 0.025, 0.025, 0, 0.26, 0, S.chrome);
    k.box(0.025, 0.05, 0.025, -0.14, 0.235, 0, S.chrome);
    k.box(0.025, 0.05, 0.025, 0.14, 0.235, 0, S.chrome);
    k.pop();
    k.push(-3.05, 0, -2.6);
    k.box(0.3, 0.03, 0.3, 0, 0.015, 0, S.orange);
    k.geo(G.cone(0.13, 0.42, 14), 0, 0.24, 0, S.orange);
    k.cyl(0.085, 0.06, 0, 0.24, 0, S.white, 0, 0, 0, 14, 0.07);
    k.pop();
  }

  private buildCeiling(k: Kit) {
    k.box(2 * W, 0.06, 2 * D, 0, H + 0.03, 0, S.ceiling);
    for (const z of [-4.2, -1.4, 1.4, 4.2]) {
      k.box(2 * W, 0.03, 0.22, 0, H - 0.015, z, S.dark);
      k.box(2 * W, 0.3, 0.03, 0, H - 0.18, z, S.dark);
      k.box(2 * W, 0.03, 0.22, 0, H - 0.345, z, S.dark);
    }
    for (const x of [-4.2, 0, 4.2]) for (const z of [-2.8, 2.8]) {
      k.cbox(1.4, 0.09, 0.3, x, 3.95, z, S.white, 0.02);
      for (const ox of [-0.55, 0.55]) k.cyl(0.008, H - 0.35 - 4.0, x + ox, (H - 0.35 + 4.0) / 2, z, S.steel, 0, 0, 0, 5);
      for (const oz of [-0.07, 0.07]) {
        if (x === 4.2 && z === -2.8) k.add('flicker', new THREE.CylinderGeometry(0.022, 0.022, 1.3, 8), x, 3.885, z + oz, 0, 0, Math.PI / 2);
        else k.glowGeo(G.cyl(0.022, 0.022, 1.3, 8), x, 3.885, z + oz, glow(TUBE, 3.2), 0, 0, Math.PI / 2);
      }
    }
    // conduit runs along the walls
    for (const z of [-D + 0.08, D - 0.08]) k.cyl(0.03, 2 * W, 0, 4.25, z, S.steel, 0, 0, Math.PI / 2, 8);
    for (const x of [-W + 0.08, W - 0.08]) k.cyl(0.03, 2 * D, x, 4.3, 0, S.steel, Math.PI / 2, 0, 0, 8);
  }

  /** Long workbench with a shadow board of tools and the neon sign above it. Local +z is into the room. */
  private buildBench(k: Kit, outlines: Silhouette[]) {
    const len = 4, dep = 0.8, h = 0.92;
    for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) for (const z of [0.08, dep - 0.08]) k.box(0.06, h - 0.06, 0.06, x, (h - 0.06) / 2, z, S.dark);
    k.box(len, 0.08, 0.04, 0, h - 0.1, dep - 0.04, S.dark);
    k.box(len - 0.1, 0.03, dep - 0.1, 0, 0.2, dep / 2, S.slate);
    k.box(len, 0.06, dep, 0, h - 0.03, dep / 2, S.wood);
    k.box(len, 0.05, 0.05, 0, h + 0.025, 0.04, S.dark);
    for (let i = 0; i < 6; i++) k.glowBox(0.012, 0.012, 0.004, -1.6 + i * 0.6, h + 0.03, 0.067, glow(i % 2 ? 0xff5040 : 0x52ff6a, 2.4));
    // drawer stack under the right end
    k.box(0.8, 0.62, dep - 0.1, len / 2 - 0.5, 0.55, dep / 2, S.red);
    for (let i = 0; i < 3; i++) {
      const y = 0.32 + i * 0.2;
      k.box(0.76, 0.18, 0.02, len / 2 - 0.5, y, dep - 0.04, S.red);
      k.box(0.3, 0.02, 0.025, len / 2 - 0.5, y + 0.03, dep - 0.02, S.chrome);
    }
    // stuff under the bench
    k.cbox(0.5, 0.3, 0.4, -1.2, 0.37, 0.35, S.blue, 0.02);
    k.cbox(0.45, 0.25, 0.4, -0.6, 0.345, 0.35, S.cardboard, 0.01);
    // vise
    k.push(-len / 2 + 0.35, h, dep - 0.16);
    k.box(0.2, 0.06, 0.22, 0, 0.03, 0, S.slate);
    k.box(0.18, 0.12, 0.05, 0, 0.12, 0.09, S.slate);
    k.box(0.18, 0.12, 0.05, 0, 0.12, -0.04, S.slate);
    k.cyl(0.012, 0.3, 0, 0.1, 0.18, S.chrome, Math.PI / 2, 0, 0, 6);
    k.cyl(0.008, 0.2, 0, 0.1, 0.31, S.chrome, 0, 0, Math.PI / 2, 6);
    k.pop();
    // bench top: a fist being serviced, a spare head, a lamp, a laptop and parts trays
    k.part(buildFist(1, 1), -0.95, h + 0.08, 0.45, Math.PI / 2, 0.4, 0, SPARES[0]);
    k.part(buildForearm(1), -1.2, h + 0.06, 0.4, Math.PI / 2, 0.4 + Math.PI / 2, Math.PI / 2, SPARES[0]);
    k.part(buildHead(2), 0.4, h + 0.12, 0.42, 0, 0.5, 0, SPARES[3]);
    k.push(-0.2, h, 0.2);
    k.cyl(0.07, 0.02, 0, 0.01, 0, S.dark, 0, 0, 0, 12);
    k.rod(0, 0.02, 0, 0.06, 0.38, 0.1, 0.018, S.steel, true);
    k.rod(0.06, 0.38, 0.1, 0.22, 0.5, 0.25, 0.018, S.steel, true);
    k.geo(G.cone(0.07, 0.1, 12), 0.25, 0.47, 0.28, S.dark, 2.4, 0, 0);
    k.glowGeo(G.cyl(0.05, 0.05, 0.01, 12), 0.27, 0.43, 0.31, glow(0xfff0d0, 3), 2.4 - Math.PI, 0, 0);
    k.pop();
    k.push(1.1, h, 0.42, -0.3);
    k.box(0.34, 0.015, 0.24, 0, 0.008, 0, S.dark);
    k.box(0.34, 0.22, 0.012, 0, 0.12, -0.12, S.dark, -0.2);
    k.glowBox(0.3, 0.18, 0.002, 0, 0.12, -0.112, glow(0x3a9cff, 1.6), -0.2);
    k.pop();
    for (let i = 0; i < 3; i++) {
      k.box(0.24, 0.04, 0.16, -0.45 + i * 0.27, h + 0.02, 0.62, S.slate);
      for (let j = 0; j < 4; j++) k.cyl(0.012, 0.02, -0.5 + i * 0.27 + j * 0.035, h + 0.05, 0.62, S.chrome, 0, 0, 0, 6);
    }
    k.cyl(0.04, 0.16, -1.6, h + 0.08, 0.5, S.green, 0, 0, 0, 12);
    k.cyl(0.006, 0.12, -1.6, h + 0.22, 0.5, S.chrome, 0.4, 0, 0, 5);

    // shadow board with its tools; the texture paints an outline behind each one
    const by = 1.05; // bottom of the board
    k.add('peg', new THREE.PlaneGeometry(4, 1.6), 0, by + 0.8, 0.012);
    k.box(4.06, 0.04, 0.03, 0, by - 0.02, 0.02, S.dark);
    k.box(4.06, 0.04, 0.03, 0, by + 1.62, 0.02, S.dark);
    const t = (x: number, y: number, w: number, hh: number, r = 0) => outlines.push({ x, y, w, h: hh, r });
    const z = 0.035;
    for (let i = 0; i < 7; i++) {
      const L = 0.16 + i * 0.03, x = -1.8 + i * 0.1, y = 1.0;
      k.box(0.02, L, 0.008, x, by + y, z, S.chrome);
      k.cyl(0.024 + i * 0.002, 0.01, x, by + y + L / 2, z, S.chrome, Math.PI / 2, 0, 0, 10);
      k.cyl(0.018 + i * 0.002, 0.01, x, by + y - L / 2, z, S.chrome, Math.PI / 2, 0, 0, 8);
      t(x, y, 0.05 + i * 0.004, L + 0.04);
    }
    for (const [x, head] of [[-0.98, S.steel], [-0.78, S.rubber]] as [number, Surface][]) {
      k.box(0.032, 0.32, 0.03, x, by + 0.85, z, S.wood);
      k.box(0.14, 0.05, 0.05, x, by + 1.03, z, head);
      t(x, 0.9, 0.14, 0.4);
    }
    const handles = [S.red, S.yellow, S.blue, S.orange, S.red, S.yellow];
    for (let i = 0; i < 6; i++) {
      const x = -0.5 + i * 0.07;
      k.cyl(0.015, 0.1, x, by + 1.2, z, handles[i], 0, 0, 0, 8);
      k.cyl(0.004, 0.12 - (i % 3) * 0.02, x, by + 1.09 - (i % 3) * 0.01, z, S.chrome, 0, 0, 0, 5);
      t(x, 1.13, 0.035, 0.24);
    }
    for (const x of [0.12, 0.28]) {
      k.box(0.02, 0.22, 0.012, x - 0.012, by + 0.95, z, S.dark, 0, 0, 0.12);
      k.box(0.02, 0.22, 0.012, x + 0.012, by + 0.95, z + 0.004, S.dark, 0, 0, -0.12);
      k.box(0.022, 0.1, 0.016, x - 0.025, by + 0.88, z + 0.006, S.red, 0, 0, 0.12);
      k.box(0.022, 0.1, 0.016, x + 0.025, by + 0.88, z + 0.006, S.red, 0, 0, -0.12);
      t(x, 0.95, 0.09, 0.24);
    }
    k.box(0.36, 0.02, 0.012, 0.72, by + 1.08, z, S.dark);
    k.box(0.02, 0.14, 0.012, 0.55, by + 1.15, z, S.dark);
    k.box(0.02, 0.14, 0.012, 0.89, by + 1.15, z, S.dark);
    k.box(0.36, 0.02, 0.012, 0.72, by + 1.22, z, S.orange);
    k.box(0.1, 0.05, 0.02, 0.48, by + 1.08, z, S.black);
    t(0.7, 1.15, 0.5, 0.18);
    k.geo(G.torus(0.12, 0.016, 6, 24), 1.25, by + 1.2, z, S.orange);
    k.geo(G.torus(0.1, 0.014, 6, 24), 1.62, by + 1.18, z, S.black);
    t(1.25, 1.2, 0.27, 0.27);
    t(1.62, 1.18, 0.23, 0.23);
    // angle grinder and a tape measure low on the board
    k.cbox(0.26, 0.07, 0.07, 1.0, by + 0.45, z + 0.01, S.blue, 0.02);
    k.cyl(0.08, 0.01, 1.16, by + 0.45, z + 0.05, S.steel, Math.PI / 2, 0, 0, 16);
    t(1.04, 0.45, 0.34, 0.16);
    k.cbox(0.08, 0.08, 0.035, 1.5, by + 0.5, z, S.yellow, 0.015);
    t(1.5, 0.5, 0.08, 0.08);
    // top shelf with spray cans and jars
    k.box(4, 0.03, 0.2, 0, by + 1.62, 0.1, S.dark);
    for (let i = 0; i < 9; i++) {
      const x = -1.85 + i * 0.42;
      if (i % 3 === 0) k.cyl(0.05, 0.12, x, by + 1.695, 0.1, S.white, 0, 0, 0, 10);
      else k.cyl(0.032, 0.2, x, by + 1.735, 0.1, i % 2 ? S.red : S.blue, 0, 0, 0, 10);
    }
    // neon sign
    k.add('sign', new THREE.PlaneGeometry(2.6, 0.65), 0, 3.25, 0.03);
    k.box(2.7, 0.04, 0.02, 0, 2.9, 0.012, S.dark);
  }

  /** Steel shelving full of bins, boxes and spare robot parts. */
  private buildShelves(k: Kit, len: number, h: number, dep: number, seed: number) {
    const rng = new Rng(seed);
    for (const x of [-len / 2 + 0.03, len / 2 - 0.03]) for (const z of [0.04, dep - 0.03]) k.box(0.05, h, 0.05, x, h / 2, z, S.orange);
    const levels = [0.12, 0.72, 1.32, 1.92, 2.52];
    for (const y of levels) k.box(len, 0.035, dep, 0, y, dep / 2, S.slate);
    const bins = [S.blue, S.red, S.yellow, S.blue];
    for (let li = 0; li < levels.length - 1; li++) {
      const y = levels[li] + 0.0175;
      let x = -len / 2 + 0.1;
      while (x < len / 2 - 0.3) {
        const r = rng.next();
        if (r < 0.35) {
          const w = rng.range(0.28, 0.38), hh = rng.range(0.16, 0.24);
          k.box(w, hh, dep - 0.12, x + w / 2, y + hh / 2, dep / 2, rng.pick(bins));
          k.box(w * 0.6, 0.05, 0.005, x + w / 2, y + hh * 0.6, dep - 0.058, S.white);
          x += w + 0.04;
        } else if (r < 0.55) {
          const w = rng.range(0.3, 0.45), hh = rng.range(0.22, 0.4);
          k.cbox(w, hh, dep - 0.1, x + w / 2, y + hh / 2, dep / 2, S.cardboard, 0.008);
          x += w + 0.04;
        } else if (r < 0.72) {
          k.part(buildHead(rng.int(0, 4)), x + 0.13, y + 0.115, dep / 2, 0, rng.range(-0.6, 0.6), 0, rng.pick(SPARES));
          x += 0.3;
        } else if (r < 0.86) {
          k.part(buildFist(rng.int(0, 4), 1), x + 0.12, y + 0.075, dep / 2, Math.PI / 2, rng.range(-1, 1), 0, rng.pick(SPARES));
          x += 0.27;
        } else {
          // battery pack on charge
          k.cbox(0.26, 0.16, 0.32, x + 0.13, y + 0.08, dep / 2, S.black, 0.015);
          k.glowBox(0.12, 0.016, 0.004, x + 0.13, y + 0.11, dep / 2 + 0.162, glow(rng.chance(0.7) ? 0x52ff6a : 0xffb43a, 2.4));
          x += 0.32;
        }
      }
    }
    // top: a boxed robot and a spare foot
    k.cbox(0.6, 0.06, 0.4, -0.5, levels[4] + 0.05, dep / 2, S.cardboard, 0.008);
    k.part(buildFoot(2), 0.3, levels[4] + 0.1, dep / 2, 0, 0.5, 0, SPARES[2]);
    k.part(buildToe(2), 0.3 + 0.072 * Math.sin(0.5), levels[4] + 0.052, dep / 2 + 0.072 * Math.cos(0.5), 0, 0.5, 0, SPARES[2]);
  }

  private buildPillar(k: Kit) {
    k.box(0.44, H, 0.44, 0, H / 2, 0, surf(0x5a5e66, 0, 0.9));
    k.add('hazard', tiledBox(0.46, 1.0, 0.46, 0.2), 0, 0.5, 0);
    k.cbox(0.26, 0.36, 0.1, 0, 1.55, 0.27, S.red, 0.02);
    k.box(0.18, 0.18, 0.005, 0, 1.6, 0.323, S.white);
  }

  /** Big red rolling tool chest. */
  private buildToolChest(k: Kit) {
    const w = 1.4;
    k.box(w, 0.86, 0.62, 0, 0.53, 0.33, S.red);
    for (const [x, z] of [[-0.6, 0.1], [0.6, 0.1], [-0.6, 0.56], [0.6, 0.56]]) {
      k.box(0.04, 0.05, 0.04, x, 0.085, z, S.dark);
      k.cyl(0.045, 0.04, x, 0.045, z, S.rubber, 0, 0, Math.PI / 2, 10);
    }
    const rows = [0.16, 0.16, 0.12, 0.12, 0.1, 0.1];
    let y = 0.14;
    for (const rh of rows) {
      k.box(w - 0.04, rh - 0.015, 0.02, 0, y + rh / 2, 0.645, S.red);
      k.box(w - 0.2, 0.018, 0.03, 0, y + rh - 0.03, 0.66, S.chrome);
      y += rh;
    }
    k.box(w + 0.02, 0.03, 0.64, 0, 0.975, 0.33, S.black);
    k.box(w, 0.48, 0.5, 0, 1.23, 0.27, S.red);
    for (let i = 0; i < 3; i++) {
      k.box(w - 0.04, 0.13, 0.02, 0, 1.07 + i * 0.14, 0.525, S.red);
      k.box(w - 0.2, 0.016, 0.025, 0, 1.1 + i * 0.14, 0.54, S.chrome);
    }
    k.box(w + 0.02, 0.05, 0.52, 0, 1.495, 0.27, S.red);
    k.box(0.04, 0.04, 0.5, w / 2 + 0.06, 0.8, 0.33, S.chrome);
    k.cbox(0.4, 0.18, 0.2, -0.35, 1.61, 0.25, S.black, 0.02);
    k.cyl(0.045, 0.1, 0.35, 1.57, 0.3, S.white, 0, 0, 0, 12);
  }

  private buildCompressor(k: Kit) {
    k.cyl(0.22, 1.0, 0, 0.36, 0.35, S.red, 0, 0, Math.PI / 2, 18);
    k.geo(G.sphere(0.22, 14, 8), -0.5, 0.36, 0.35, S.red, 0, 0, 0, 1);
    k.geo(G.sphere(0.22, 14, 8), 0.5, 0.36, 0.35, S.red);
    k.cbox(0.34, 0.24, 0.26, 0.1, 0.68, 0.35, S.dark, 0.03);
    k.cyl(0.05, 0.03, -0.25, 0.62, 0.5, S.white, Math.PI / 2, 0, 0, 14);
    for (const x of [-0.4, 0.4]) k.cyl(0.08, 0.05, x, 0.08, 0.6, S.rubber, Math.PI / 2, 0, 0, 12);
    k.box(0.06, 0.16, 0.06, -0.4, 0.12, 0.15, S.dark);
  }

  /** Roll-up door with night light leaking in, the electrical panel, and the battery charging rack. */
  private buildDoorWall(k: Kit) {
    const dw = 4.4, dh = 3.6, cx = 0.5;
    k.box(dw, dh, 0.02, cx, dh / 2, 0.01, S.black);
    for (let i = 0; i < 18; i++) k.box(dw, 0.19, 0.05, cx, 0.1 + i * 0.2, 0.04, S.door);
    for (let i = 0; i < 6; i++) {
      const x = cx - dw / 2 + 0.45 + i * 0.7;
      k.box(0.5, 0.16, 0.02, x, 2.5, 0.066, S.dark);
      k.glowBox(0.44, 0.11, 0.01, x, 2.5, 0.072, glow(0x3b64a8, 1.4));
    }
    k.box(dw, 0.03, 0.07, cx, 0.015, 0.06, S.rubber);
    k.glowBox(dw, 0.012, 0.01, cx, 0.034, 0.072, glow(0x9cc4ff, 2.4));
    k.box(0.3, 0.04, 0.04, cx, 0.4, 0.08, S.chrome);
    for (const x of [cx - dw / 2 - 0.09, cx + dw / 2 + 0.09]) k.add('hazard', tiledBox(0.18, dh + 0.1, 0.12, 0.2), x, (dh + 0.1) / 2, 0.06);
    k.cbox(dw + 0.5, 0.5, 0.55, cx, dh + 0.35, 0.28, S.dark, 0.03);
    k.cbox(0.4, 0.3, 0.2, cx + dw / 2 + 0.5, 2.0, 0.1, S.slate, 0.02);
    k.glowBox(0.04, 0.04, 0.01, cx + dw / 2 + 0.42, 2.06, 0.205, glow(0x52ff6a, 2.4));
    k.glowBox(0.04, 0.04, 0.01, cx + dw / 2 + 0.58, 2.06, 0.205, glow(0xff4030, 2.4));
    // electrical panel
    k.push(4.25, 0, 0);
    k.cbox(0.62, 0.82, 0.14, 0, 1.6, 0.07, S.slate, 0.02);
    k.box(0.5, 0.06, 0.02, 0, 1.85, 0.145, S.yellow);
    for (let i = 0; i < 6; i++) k.glowBox(0.03, 0.03, 0.01, -0.2 + i * 0.08, 1.45, 0.148, glow(i === 4 ? 0xff4030 : 0x52ff6a, 2.6));
    k.box(0.06, 0.14, 0.06, 0.36, 1.6, 0.1, S.dark);
    for (const x of [-0.2, 0, 0.2]) k.cyl(0.025, H - 2.0, x, 2.0 + (H - 2.0) / 2, 0.05, S.steel, 0, 0, 0, 8);
    k.pop();
    // fire extinguisher
    k.push(3.3, 0, 0);
    k.cyl(0.085, 0.52, 0, 0.36, 0.13, S.red, 0, 0, 0, 14);
    k.geo(G.sphere(0.085, 12, 6), 0, 0.62, 0.13, S.red);
    k.box(0.05, 0.08, 0.08, 0, 0.72, 0.13, S.dark);
    k.box(0.12, 0.03, 0.06, 0, 0.5, 0.04, S.dark);
    k.box(0.24, 0.24, 0.01, 0, 1.3, 0.005, S.red);
    k.box(0.08, 0.14, 0.012, 0, 1.3, 0.008, S.white);
    k.pop();
    // battery charging rack
    k.push(-4.3, 0, 0);
    for (const x of [-0.9, 0.9]) for (const z of [0.05, 0.5]) k.box(0.05, 1.8, 0.05, x, 0.9, z, S.dark);
    for (const y of [0.3, 0.9, 1.5]) {
      k.box(1.85, 0.03, 0.5, 0, y, 0.275, S.steel);
      for (let i = 0; i < 4; i++) {
        const x = -0.63 + i * 0.42;
        k.cbox(0.32, 0.22, 0.38, x, y + 0.125, 0.27, S.black, 0.02);
        k.cyl(0.018, 0.03, x - 0.08, y + 0.25, 0.2, S.red, 0, 0, 0, 8);
        k.cyl(0.018, 0.03, x + 0.08, y + 0.25, 0.2, S.dark, 0, 0, 0, 8);
        k.glowBox(0.2, 0.022, 0.006, x, y + 0.16, 0.463, glow((i + y * 10) % 3 ? 0x52ff6a : 0xffb43a, 2.6));
      }
    }
    k.pop();
    // oil drums
    for (const [x, z, s] of [[-2.3, 0.45, S.blue], [-2.95, 0.4, S.blue], [-2.62, 0.95, S.yellow]] as [number, number, Surface][]) {
      k.cyl(0.29, 0.88, x, 0.44, z, s, 0, 0, 0, 18);
      for (const y of [0.25, 0.63]) k.geo(G.torus(0.29, 0.012, 4, 24), x, y, z, s, Math.PI / 2);
      k.cyl(0.27, 0.01, x, 0.885, z, S.dark, 0, 0, 0, 18);
    }
  }

  /** Planning desk with three monitors, the whiteboard, a server rack and lockers. */
  private buildDeskWall(k: Kit) {
    // desk (local x is world -x here)
    k.push(2.0, 0, 0);
    k.box(2.8, 0.04, 0.75, 0, 0.74, 0.4, S.dark);
    for (const x of [-1.35, 1.35]) for (const z of [0.08, 0.72]) k.box(0.05, 0.72, 0.05, x, 0.36, z, S.steel);
    k.box(0.45, 0.6, 0.65, 1.05, 0.32, 0.4, S.slate);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.68;
      const ry = (1 - i) * 0.22;
      k.push(x, 0.76, 0.22, ry);
      k.box(0.14, 0.01, 0.12, 0, 0.005, 0, S.black);
      k.box(0.04, 0.24, 0.03, 0, 0.13, -0.02, S.black);
      k.cbox(0.64, 0.4, 0.035, 0, 0.42, 0, S.black, 0.008);
      k.add('screens', atlasPlane(0.6, 0.36, i / 3, 0, (i + 1) / 3, 1), 0, 0.42, 0.019);
      k.pop();
    }
    k.box(0.46, 0.02, 0.15, 0, 0.77, 0.55, S.black);
    k.box(0.06, 0.02, 0.1, 0.36, 0.77, 0.56, S.black);
    k.cyl(0.04, 0.1, -0.9, 0.81, 0.55, S.white, 0, 0, 0, 12);
    // chair
    k.push(0.1, 0, 1.2, 0.3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box(0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, S.black, 0, -a, 0);
      k.geo(G.sphere(0.025, 8, 6), Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29, S.rubber);
    }
    k.cyl(0.025, 0.36, 0, 0.26, 0, S.chrome, 0, 0, 0, 8);
    k.cbox(0.5, 0.08, 0.48, 0, 0.48, 0, S.black, 0.03);
    k.cbox(0.46, 0.56, 0.06, 0, 0.86, 0.24, S.black, 0.03, -0.12);
    k.pop();
    k.pop();
    // clock
    k.push(2.0, 3.0, 0);
    k.cyl(0.19, 0.04, 0, 0, 0.02, S.white, Math.PI / 2, 0, 0, 24);
    k.geo(G.torus(0.19, 0.015, 6, 24), 0, 0, 0.04, S.dark);
    k.box(0.012, 0.12, 0.005, 0, 0.05, 0.045, S.black, 0, 0, -0.6);
    k.box(0.01, 0.15, 0.005, 0, 0.06, 0.047, S.black, 0, 0, 2.1);
    k.pop();
    // whiteboard
    k.push(-1.4, 0, 0);
    k.box(2.1, 1.14, 0.03, 0, 1.75, 0.015, S.steel);
    k.add('board', new THREE.PlaneGeometry(2.0, 1.06), 0, 1.75, 0.032);
    k.box(1.4, 0.03, 0.08, 0, 1.17, 0.05, S.steel);
    for (let i = 0; i < 3; i++) k.cyl(0.01, 0.12, -0.3 + i * 0.15, 1.2, 0.06, [S.blue, S.red, S.green][i], 0, 0, Math.PI / 2, 6);
    k.pop();
    // server rack with blinking lights
    k.push(-3.6, 0, 0);
    k.cbox(0.62, 2.0, 0.8, 0, 1.0, 0.42, S.black, 0.02);
    k.box(0.56, 1.9, 0.01, 0, 1.0, 0.825, S.glass);
    const rng = new Rng(9);
    for (let r = 0; r < 14; r++) {
      const y = 0.25 + r * 0.12;
      k.box(0.5, 0.08, 0.01, 0, y, 0.818, S.dark);
      for (let i = 0; i < 4; i++) {
        const c = glow(rng.pick([0x52ff6a, 0x52ff6a, 0x2ad8ff, 0xffb43a]), 2.6);
        const geo = new THREE.BoxGeometry(0.016, 0.012, 0.004);
        const col = new Float32Array(geo.attributes.position.count * 3);
        for (let v = 0; v < col.length; v += 3) col.set([c.r, c.g, c.b], v);
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        k.add(rng.chance(0.5) ? 'blinkA' : 'blinkB', geo, -0.2 + i * 0.03, y, 0.83);
      }
    }
    k.pop();
    // lockers
    for (let i = 0; i < 3; i++) {
      k.push(-4.75 - i * 0.6, 0, 0);
      k.box(0.58, 1.9, 0.5, 0, 0.95, 0.25, S.slate);
      for (let v = 0; v < 4; v++) k.box(0.3, 0.015, 0.005, 0, 1.6 + v * 0.05, 0.502, S.black);
      k.box(0.03, 0.12, 0.03, 0.21, 1.05, 0.51, S.chrome);
      k.box(0.12, 0.05, 0.005, 0, 1.4, 0.502, S.white);
      k.pop();
    }
  }

  /** Welding cell (a robot arm at work on a chassis), gas bottles, pallet racking and hanging spare arms. */
  private buildWeldWall(k: Kit) {
    // welding table with a chassis being built
    k.push(-1.6, 0, 0.8);
    k.box(2.0, 0.05, 1.0, 0, 0.84, 0, S.dark);
    for (const x of [-0.92, 0.92]) for (const z of [-0.42, 0.42]) k.box(0.07, 0.82, 0.07, x, 0.41, z, S.dark);
    k.box(1.9, 0.04, 0.9, 0, 0.18, 0, S.dark);
    k.cyl(0.04, 0.32, 0, 1.02, 0, S.chrome, 0, 0, 0, 8);
    k.cyl(0.16, 0.02, 0, 0.875, 0, S.dark, 0, 0, 0, 14);
    k.part(buildTorso(2), 0, 1.55, 0, 0, 0.35, 0, SPARES[1]);
    k.part(buildUpperArm(2, 1), -0.6, 0.94, 0.12, Math.PI / 2, 0.3, Math.PI / 2, SPARES[1]);
    k.part(buildThigh(2), 0.62, 0.92, 0.16, 0, 0.4, Math.PI / 2, SPARES[1]);
    k.part(buildShin(2).merge(buildShinGuard(2)), 0.55, 0.92, -0.18, 0, -0.2, Math.PI / 2, SPARES[1]);
    k.pop();
    // industrial welding arm (orange) reaching over to the chassis' shoulder
    k.push(-0.25, 0, 1.15);
    k.cyl(0.24, 0.16, 0, 0.08, 0, S.dark, 0, 0, 0, 18);
    k.cyl(0.17, 0.3, 0, 0.31, 0, S.orange, 0, 0, 0, 16);
    k.cyl(0.11, 0.24, 0, 0.55, 0, S.dark, Math.PI / 2, 0, 0, 14);
    k.rod(0, 0.55, 0, -0.15, 1.35, -0.15, 0.17, S.orange);
    k.cyl(0.09, 0.22, -0.15, 1.35, -0.15, S.dark, Math.PI / 2, 0, 0, 12);
    k.rod(-0.15, 1.35, -0.15, -0.72, 1.62, -0.3, 0.13, S.orange);
    k.cyl(0.06, 0.12, -0.72, 1.62, -0.3, S.dark, 0, 0, Math.PI / 2, 10);
    k.rod(-0.72, 1.62, -0.3, -0.92, 1.5, -0.3, 0.05, S.steel, true);
    k.rod(-0.92, 1.5, -0.3, -1.02, 1.42, -0.3, 0.025, S.chrome, true);
    this.weld.pos.copy(k.point(-1.04, 1.4, -0.3));
    this.weld.dir.copy(k.point(-0.74, 1.75, 0.3)).sub(this.weld.pos).normalize();
    k.pop();
    // gas bottles chained to the wall
    for (const [x, s] of [[0.35, S.green], [0.66, S.steel]] as [number, Surface][]) {
      k.cyl(0.12, 1.3, x, 0.65, 0.18, s, 0, 0, 0, 16);
      k.geo(G.sphere(0.12, 14, 7), x, 1.3, 0.18, s);
      k.cyl(0.03, 0.1, x, 1.45, 0.18, S.chrome, 0, 0, 0, 8);
    }
    k.box(0.7, 0.03, 0.03, 0.5, 1.0, 0.31, S.dark);
    // pallet racking
    k.push(2.9, 0, 0);
    for (const x of [-1.46, 1.46]) for (const z of [0.06, 0.86]) k.box(0.08, 3.0, 0.08, x, 1.5, z, S.orange);
    for (const y of [0.9, 1.9, 2.9]) {
      for (const z of [0.06, 0.86]) k.box(2.92, 0.1, 0.06, 0, y, z, S.blue);
      k.box(2.9, 0.02, 0.86, 0, y + 0.06, 0.46, S.steel);
    }
    const crate = (x: number, y: number, s: number) => {
      k.cbox(s, s * 0.8, 0.7, x, y + s * 0.4, 0.46, S.crate, 0.01);
      k.box(s + 0.01, 0.05, 0.71, x, y + s * 0.4, 0.46, S.cardboard);
    };
    crate(-0.9, 0, 0.75);
    crate(-0.1, 0, 0.6);
    k.cyl(0.42, 0.06, 0.75, 0.42, 0.26, S.wood, Math.PI / 2, 0, 0, 20);
    k.cyl(0.42, 0.06, 0.75, 0.42, 0.7, S.wood, Math.PI / 2, 0, 0, 20);
    k.cyl(0.33, 0.38, 0.75, 0.42, 0.48, S.black, Math.PI / 2, 0, 0, 18);
    crate(-0.85, 0.97, 0.6);
    k.part(buildThigh(0), 0.2, 1.08, 0.46, 0, 0, Math.PI / 2, SPARES[2]);
    k.part(buildShin(0).merge(buildShinGuard(0)), 0.64, 1.08, 0.46, 0, 0, Math.PI / 2, SPARES[2]);
    k.cbox(0.5, 0.3, 0.6, -0.8, 2.11, 0.46, S.cardboard, 0.01);
    k.cbox(0.45, 0.4, 0.6, -0.2, 2.16, 0.46, S.cardboard, 0.01);
    k.cbox(0.6, 0.35, 0.6, 0.65, 2.135, 0.46, S.cardboard, 0.01);
    k.pop();
    // spare arms hanging from a rail
    k.push(-4.3, 0, 0);
    k.box(1.9, 0.06, 0.06, 0, 2.55, 0.1, S.dark);
    for (let i = 0; i < 4; i++) {
      const x = -0.72 + i * 0.48;
      const s = SPARES[(i + 1) % SPARES.length];
      k.box(0.02, 0.1, 0.02, x, 2.47, 0.14, S.chrome);
      k.part(buildForearm(i), x, 2.4, 0.16, 0, 0, Math.PI, s);
      k.part(buildFist(i, 1), x, 2.4 - 0.33, 0.16, 0, 0, Math.PI, s);
    }
    k.pop();
  }

  // ------------------------------------------------------------------ life

  /** The monitors: robot schematic, live servo graphs and a scrolling log. */
  private drawScreens(full = false) {
    const s = this.screens;
    const g = s.g;
    const W3 = 256;
    const rng = this.rng;
    // screen 1: the robot on the lift
    if (full) {
      g.fillStyle = '#06121c';
      g.fillRect(0, 0, W3, 160);
      g.strokeStyle = 'rgba(42,216,255,0.85)';
      g.lineWidth = 2;
      g.strokeRect(108, 18, 40, 30);
      g.strokeRect(92, 52, 72, 54);
      g.beginPath();
      g.moveTo(92, 58);
      g.lineTo(70, 100);
      g.moveTo(164, 58);
      g.lineTo(186, 100);
      g.moveTo(108, 106);
      g.lineTo(102, 150);
      g.moveTo(148, 106);
      g.lineTo(154, 150);
      g.stroke();
      g.fillStyle = 'rgba(42,216,255,0.6)';
      g.font = '14px "Rajdhani", sans-serif';
      g.fillText('SYSTEM CHECK', 10, 18);
      g.fillStyle = '#ffb43a';
      g.font = '18px "Russo One", sans-serif';
      g.fillText(this.botName.toUpperCase().slice(0, 16), 10, 142);
      g.font = '14px "Rajdhani", sans-serif';
      g.fillStyle = '#52ff6a';
      g.fillText(this.botPower ? `PWR ${this.botPower}  ·  OK` : 'OK', 176, 18);
    }
    // screen 2: servo load graphs
    const x0 = W3;
    g.fillStyle = '#060e14';
    g.fillRect(x0, 0, W3, 160);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    for (let y = 20; y < 160; y += 20) {
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + W3, y);
      g.stroke();
    }
    s.graph.forEach((line, gi) => {
      line.push(Math.max(5, Math.min(70, (line.at(-1) ?? 35) + rng.range(-9, 9))));
      if (line.length > 32) line.shift();
      g.strokeStyle = gi ? '#ff7a1a' : '#52ff6a';
      g.lineWidth = 2;
      g.beginPath();
      line.forEach((v, i) => (i ? g.lineTo(x0 + i * 8, 20 + gi * 70 + v) : g.moveTo(x0 + i * 8, 20 + gi * 70 + v)));
      g.stroke();
    });
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '13px "Rajdhani", sans-serif';
    g.fillText('SERVO LOAD  L / R', x0 + 8, 14);
    // screen 3: log
    const x1 = W3 * 2;
    const words = ['torque', 'servo', 'gyro', 'hydraulics', 'core temp', 'actuator', 'firmware', 'balance', 'plating', 'reflex net'];
    s.lines.push(`> ${rng.pick(words)} ${rng.chance(0.85) ? 'ok' : 'tuned'} ${rng.int(10, 99)}.${rng.int(0, 9)}`);
    if (s.lines.length > 9) s.lines.shift();
    g.fillStyle = '#05100a';
    g.fillRect(x1, 0, W3, 160);
    g.font = '14px monospace';
    s.lines.forEach((l, i) => {
      g.fillStyle = i === s.lines.length - 1 ? '#b8ffcc' : 'rgba(82,255,106,0.7)';
      g.fillText(l, x1 + 8, 18 + i * 16);
    });
    s.tex.needsUpdate = true;
  }

  /** The bot on the lift, shown on the desk monitor; its accent colour lights the bay ring. */
  setBot(name: string, power: number, accent: number) {
    this.botName = name;
    this.botPower = power;
    this.ledRing.color.setHex(accent).multiplyScalar(RenderSettings.glow(2.6));
    this.drawScreens(true);
  }

  /** Sweep a scan ring up the robot (a part was fitted). */
  pulse() {
    this.scanT = 0;
  }

  enter(stage: { applyLook(l: LightLook): void }) {
    this.group.visible = true;
    stage.applyLook(GARAGE_LOOK);
  }

  exit() {
    this.group.visible = false;
    this.scan.visible = false;
    this.scanT = -1;
  }

  update(dt: number, time: number, fx: Fx) {
    const s = this.screens;
    s.t += dt;
    if (s.t > 0.3) {
      s.t = 0;
      this.drawScreens();
    }
    const blink = Math.floor(time * 2.3);
    this.blink.forEach((m, i) => m.color.setScalar((blink + i) % 3 ? 1 : 0.15));
    // one tube is on its way out
    this.flickerT -= dt;
    if (this.flickerT < 0) this.flickerT = Math.random() < 0.08 ? 0.05 + Math.random() * 0.12 : 0.4 + Math.random() * 3;
    const off = this.flickerT < 0.17 && Math.sin(time * 90) > 0;
    this.flicker.color.copy(off ? this.tubeOff : this.tubeOn);

    // the welding arm works in bursts
    const w = this.weld;
    w.t -= dt;
    if (w.t <= 0) {
      w.on = !w.on;
      w.t = w.on ? 0.8 + Math.random() * 1.6 : 2 + Math.random() * 4;
    }
    if (w.on) {
      if (Math.random() < 0.6) fx.sparks(w.pos, w.dir, 2 + ((Math.random() * 3) | 0), 0xffc070, 2.4, 1.3);
      w.flash -= dt;
      if (w.flash <= 0) {
        w.flash = 0.04 + Math.random() * 0.05;
        fx.flash(w.pos, 0xbfe3ff, 0.25 + Math.random() * 0.35, 0.07);
      }
    }

    if (this.scanT >= 0) {
      this.scanT += dt;
      const k = this.scanT / 0.85;
      if (k >= 1) {
        this.scanT = -1;
        this.scan.visible = false;
      } else {
        this.scan.visible = true;
        this.scan.position.y = 0.04 + k * 1.95;
        const a = Math.sin(Math.PI * Math.min(1, k * 1.15));
        (this.scanMats[0] as THREE.MeshBasicMaterial).opacity = a;
        (this.scanMats[1] as THREE.ShaderMaterial).uniforms.uA.value = a;
      }
    }
  }
}
