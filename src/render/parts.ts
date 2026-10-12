import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural robot parts. Every part is assembled from primitives and merged per
 * material, so a whole limb costs one or two draw calls.
 *
 * Conventions: torso/pelvis/head groups use X = bot's left, Y = up, Z = forward.
 * Limb segments start at their proximal joint and extend along +Y.
 */
export type MatKey = 'paint' | 'paint2' | 'metal' | 'chrome' | 'dark' | 'glow' | 'rarity' | 'core';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    geoCache.set(key, g);
  }
  return g;
}

export const G = {
  rbox: (w: number, h: number, d: number, r = 0.03, seg = 2) =>
    cached(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.45))),
  box: (w: number, h: number, d: number) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 12, open = false) =>
    cached(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, ws = 14, hs = 10) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  hemi: (r: number) => cached(`h${r}`, () => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  torus: (r: number, t: number, rs = 8, ts = 20) => cached(`t${r},${t},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts)),
  cone: (r: number, h: number, seg = 10) => cached(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  octa: (r: number) => cached(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  ico: (r: number) => cached(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)),
  capsule: (r: number, l: number) => cached(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10)),
};

interface Entry {
  geo: THREE.BufferGeometry;
  key: MatKey;
  m: THREE.Matrix4;
}

export class PB {
  entries: Entry[] = [];
  add(
    geo: THREE.BufferGeometry,
    key: MatKey,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    this.entries.push({ geo, key, m: new THREE.Matrix4().compose(_p, _q, _s) });
    return this;
  }
  /** Mirror an entry across X (left/right symmetric details). */
  addSym(geo: THREE.BufferGeometry, key: MatKey, x: number, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.add(geo, key, x, y, z, rx, ry, rz, sx, sy, sz);
    this.add(geo, key, -x, y, z, rx, -ry, -rz, sx, sy, sz);
    return this;
  }
  build(mats: Record<MatKey, THREE.Material>, shadows = true): THREE.Group {
    const group = new THREE.Group();
    const byKey = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const e of this.entries) {
      const g = e.geo.clone().applyMatrix4(e.m);
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key)!.push(g);
    }
    for (const [key, list] of byKey) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, mats[key]);
      const glowy = key === 'glow' || key === 'rarity' || key === 'core';
      mesh.castShadow = shadows && !glowy;
      mesh.receiveShadow = false;
      group.add(mesh);
    }
    return group;
  }
}

void _m;

// ------------------------------------------------------------------- HEADS
export function buildHead(look: number): PB {
  const b = new PB();
  switch (look) {
    case 0: // Sentinel Visor
      b.add(G.rbox(0.27, 0.27, 0.27, 0.07), 'paint', 0, 0.02, 0);
      b.add(G.rbox(0.25, 0.07, 0.06, 0.025), 'dark', 0, 0.04, 0.12);
      b.add(G.rbox(0.21, 0.035, 0.02, 0.012), 'glow', 0, 0.045, 0.152);
      b.addSym(G.cyl(0.045, 0.045, 0.05, 12), 'metal', 0.15, 0.02, 0, 0, 0, Math.PI / 2);
      b.addSym(G.cyl(0.012, 0.012, 0.14, 6), 'chrome', 0.16, 0.12, -0.03, 0, 0, -0.25);
      b.add(G.rbox(0.18, 0.04, 0.2, 0.015), 'paint2', 0, 0.165, -0.01);
      b.add(G.box(0.12, 0.012, 0.012), 'rarity', 0, -0.06, 0.136);
      break;
    case 1: // Hawkeye Optic
      b.add(G.rbox(0.25, 0.25, 0.27, 0.05), 'paint', 0, 0.02, 0);
      b.add(G.cyl(0.075, 0.08, 0.06, 18), 'dark', 0.04, 0.04, 0.14, Math.PI / 2, 0, 0);
      b.add(G.cyl(0.05, 0.05, 0.02, 18), 'glow', 0.04, 0.04, 0.17, Math.PI / 2, 0, 0);
      b.add(G.torus(0.074, 0.012, 6, 18), 'rarity', 0.04, 0.04, 0.17);
      b.add(G.cyl(0.03, 0.03, 0.04, 12), 'glow', -0.075, 0.07, 0.14, Math.PI / 2, 0, 0);
      b.add(G.rbox(0.03, 0.12, 0.2, 0.012), 'paint2', 0, 0.18, -0.02, -0.2, 0, 0);
      b.add(G.rbox(0.2, 0.05, 0.08, 0.02), 'dark', 0, -0.09, 0.1);
      break;
    case 2: // Oracle Dome
      b.add(G.hemi(0.155), 'paint', 0, 0.0, 0);
      b.add(G.cyl(0.158, 0.13, 0.1, 20), 'dark', 0, -0.045, 0);
      b.add(G.torus(0.158, 0.014, 6, 28), 'glow', 0, 0.0, 0, Math.PI / 2, 0, 0);
      b.add(G.sphere(0.022, 8, 6), 'glow', 0, 0.06, 0.14);
      b.addSym(G.sphere(0.016, 8, 6), 'glow', 0.06, 0.05, 0.13);
      b.add(G.torus(0.09, 0.008, 6, 20), 'rarity', 0, 0.13, 0, Math.PI / 2, 0, 0);
      b.add(G.cyl(0.015, 0.02, 0.06, 8), 'chrome', 0, 0.175, 0);
      break;
    case 3: // Bulwark Helm
      b.add(G.rbox(0.31, 0.29, 0.29, 0.05), 'paint', 0, 0.02, -0.01);
      b.add(G.rbox(0.24, 0.13, 0.05, 0.02), 'dark', 0, -0.04, 0.13);
      for (let i = 0; i < 4; i++) b.add(G.box(0.2, 0.012, 0.02), 'chrome', 0, -0.085 + i * 0.03, 0.16);
      b.addSym(G.box(0.07, 0.02, 0.02), 'glow', 0.06, 0.07, 0.145, 0, 0, 0.12);
      b.addSym(G.rbox(0.05, 0.22, 0.24, 0.02), 'paint2', 0.16, -0.01, 0.0);
      b.add(G.rbox(0.08, 0.06, 0.3, 0.02), 'paint2', 0, 0.175, -0.01);
      b.add(G.box(0.07, 0.012, 0.012), 'rarity', 0, 0.21, 0.13);
      break;
    default: {
      // Berserker Crest
      b.add(G.rbox(0.25, 0.25, 0.27, 0.04), 'paint', 0, 0.02, 0);
      b.add(G.rbox(0.22, 0.09, 0.08, 0.02), 'paint2', 0, -0.085, 0.1, 0.25, 0, 0);
      b.addSym(G.box(0.08, 0.022, 0.02), 'glow', 0.055, 0.05, 0.14, 0, 0, -0.38);
      for (let i = 0; i < 4; i++) b.add(G.cone(0.03, 0.12 - i * 0.012, 4), 'rarity', 0, 0.17 - i * 0.008, 0.08 - i * 0.065, -0.5, 0, 0);
      b.addSym(G.cone(0.025, 0.1, 6), 'metal', 0.14, 0.09, -0.02, 0, 0, -1.0);
      break;
    }
  }
  return b;
}

// ------------------------------------------------------------------- TORSO
export function buildTorso(look: number): PB {
  const b = new PB();
  // spine/waist base shared
  b.add(G.rbox(0.32, 0.16, 0.24, 0.05), 'metal', 0, -0.27, -0.01);
  b.add(G.cyl(0.075, 0.09, 0.12, 12), 'metal', 0, 0.21, -0.01);
  switch (look) {
    case 0: // Plated
      b.add(G.rbox(0.6, 0.42, 0.36, 0.07), 'paint', 0, 0.02, 0);
      b.add(G.rbox(0.42, 0.26, 0.06, 0.03), 'paint2', 0, -0.0, 0.17);
      b.addSym(G.rbox(0.14, 0.12, 0.05, 0.02), 'paint2', 0.21, 0.12, 0.16);
      b.add(G.rbox(0.36, 0.16, 0.12, 0.04), 'dark', 0, 0.08, -0.2);
      b.add(G.box(0.3, 0.014, 0.012), 'rarity', 0, -0.17, 0.19);
      break;
    case 1: // Reactive
      b.add(G.rbox(0.56, 0.4, 0.34, 0.05), 'paint2', 0, 0.02, 0);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) b.add(G.rbox(0.17, 0.13, 0.06, 0.025), 'paint', (i - 0.5) * 0.36, 0.1 - j * 0.16, 0.17);
      b.addSym(G.rbox(0.1, 0.3, 0.3, 0.03), 'paint', 0.27, 0.03, 0);
      b.add(G.rbox(0.32, 0.2, 0.1, 0.03), 'dark', 0, 0.06, -0.19);
      for (let i = 0; i < 3; i++) b.add(G.box(0.24, 0.012, 0.012), 'rarity', 0, 0.12 - i * 0.05, -0.245);
      break;
    case 2: // Juggernaut
      b.add(G.rbox(0.72, 0.48, 0.42, 0.09), 'paint', 0, 0.03, -0.01);
      b.add(G.cyl(0.24, 0.24, 0.46, 18, false), 'paint2', 0, 0.03, 0.08, 0, 0, 0, 1, 1, 0.55);
      b.add(G.rbox(0.5, 0.1, 0.3, 0.04), 'dark', 0, 0.26, -0.02);
      for (let i = 0; i < 5; i++) b.add(G.sphere(0.014, 6, 4), 'chrome', -0.16 + i * 0.08, -0.18, 0.2);
      b.add(G.rbox(0.42, 0.22, 0.14, 0.04), 'metal', 0, 0.06, -0.24);
      b.add(G.box(0.34, 0.014, 0.012), 'rarity', 0, 0.2, 0.22);
      break;
    case 3: // Aero
      b.add(G.cyl(0.32, 0.17, 0.42, 4), 'paint', 0, 0.02, 0, 0, Math.PI / 4, 0, 1, 1, 0.62);
      b.add(G.cyl(0.24, 0.12, 0.3, 4), 'paint2', 0, 0.05, 0.05, 0, Math.PI / 4, 0, 1, 1, 0.55);
      b.addSym(G.rbox(0.03, 0.26, 0.16, 0.012), 'paint', 0.08, 0.1, -0.22, 0, 0, 0.15);
      b.addSym(G.box(0.012, 0.22, 0.012), 'rarity', 0.12, 0.0, 0.14, 0, 0, -0.35);
      b.add(G.rbox(0.26, 0.14, 0.1, 0.03), 'dark', 0, 0.1, -0.18);
      break;
    default: // Counter Plate
      b.add(G.rbox(0.62, 0.42, 0.36, 0.05), 'paint2', 0, 0.02, 0);
      b.add(G.rbox(0.08, 0.46, 0.05, 0.02), 'paint', 0, 0.02, 0.18, 0, 0, 0.75);
      b.add(G.rbox(0.08, 0.46, 0.05, 0.02), 'paint', 0, 0.02, 0.18, 0, 0, -0.75);
      b.addSym(G.cone(0.04, 0.12, 4), 'metal', 0.3, 0.22, 0.0, 0, 0, -0.6);
      b.add(G.rbox(0.38, 0.18, 0.1, 0.03), 'dark', 0, 0.06, -0.2);
      b.add(G.box(0.012, 0.32, 0.012), 'rarity', 0, 0.02, 0.205);
      break;
  }
  return b;
}

/** Shoulder armor shape follows the chest item; attached to the upper arm. */
export function buildUpperArm(chestLook: number, side: number): PB {
  const b = new PB();
  b.add(G.sphere(0.1, 12, 10), 'metal', 0, 0, 0);
  b.add(G.rbox(0.14, 0.24, 0.14, 0.05), 'paint2', 0, 0.17, 0);
  b.add(G.cyl(0.07, 0.07, 0.05, 10), 'metal', 0, 0.3, 0);
  const sx = side; // +1 on bot's left side (local X)
  switch (chestLook) {
    case 0:
      b.add(G.rbox(0.26, 0.15, 0.26, 0.06), 'paint', sx * 0.02, -0.04, 0, 0, 0, sx * 0.25);
      break;
    case 1:
      b.add(G.rbox(0.24, 0.1, 0.24, 0.04), 'paint', sx * 0.02, -0.06, 0, 0, 0, sx * 0.2);
      b.add(G.rbox(0.2, 0.08, 0.22, 0.03), 'paint', sx * 0.05, 0.03, 0, 0, 0, sx * 0.4);
      break;
    case 2:
      b.add(G.hemi(0.18), 'paint', sx * 0.02, -0.06, 0, 0, 0, sx * 0.4, 1, 0.8, 1);
      b.add(G.torus(0.17, 0.018, 6, 20), 'paint2', sx * 0.02, -0.05, 0, Math.PI / 2, 0, sx * 0.4);
      break;
    case 3:
      b.add(G.rbox(0.2, 0.08, 0.2, 0.03), 'paint', sx * 0.03, -0.05, 0, 0, 0, sx * 0.35);
      b.add(G.rbox(0.03, 0.16, 0.14, 0.01), 'paint2', sx * 0.08, -0.04, -0.04, 0, 0, sx * -0.3);
      break;
    default:
      b.add(G.rbox(0.25, 0.13, 0.25, 0.04), 'paint', sx * 0.02, -0.05, 0, 0, 0, sx * 0.3);
      b.add(G.cone(0.05, 0.16, 4), 'metal', sx * 0.1, -0.13, 0, 0, 0, sx * 0.9);
      break;
  }
  return b;
}

// ------------------------------------------------------------------- CORE
export function buildCore(look: number): PB {
  const b = new PB();
  b.add(G.cyl(0.1, 0.1, 0.05, 20), 'dark', 0, 0.04, 0.17, Math.PI / 2, 0, 0);
  switch (look) {
    case 0:
      b.add(G.sphere(0.06, 14, 10), 'core', 0, 0.04, 0.2);
      b.add(G.torus(0.085, 0.012, 6, 22), 'rarity', 0, 0.04, 0.2);
      break;
    case 1:
      for (let i = -1; i <= 1; i++) b.add(G.rbox(0.03, 0.12, 0.03, 0.01), 'core', i * 0.045, 0.04, 0.2);
      b.add(G.torus(0.09, 0.01, 4, 4), 'rarity', 0, 0.04, 0.2, 0, 0, Math.PI / 4);
      break;
    case 2:
      b.add(G.cyl(0.07, 0.07, 0.03, 6), 'core', 0, 0.04, 0.2, Math.PI / 2, 0, 0);
      b.add(G.torus(0.085, 0.01, 6, 6), 'rarity', 0, 0.04, 0.2, 0, 0, Math.PI / 6);
      break;
    case 3:
      b.add(G.octa(0.07), 'core', 0, 0.04, 0.21, 0, 0, 0, 0.8, 1.1, 0.6);
      b.add(G.torus(0.085, 0.01, 6, 20), 'rarity', 0, 0.04, 0.2);
      break;
    default:
      b.add(G.ico(0.062), 'core', 0, 0.04, 0.21);
      b.add(G.torus(0.09, 0.008, 6, 20), 'rarity', 0, 0.04, 0.21, 0.5, 0.4, 0);
      break;
  }
  // back reactor
  b.add(G.cyl(0.07, 0.08, 0.1, 14), 'metal', 0, 0.06, -0.25, Math.PI / 2, 0, 0);
  b.add(G.cyl(0.05, 0.05, 0.02, 14), 'core', 0, 0.06, -0.305, Math.PI / 2, 0, 0);
  return b;
}

// ------------------------------------------------------------------- FISTS
/** Forearm (static part), origin at elbow, +Y towards the fist. +Z is the back of the hand. */
export function buildForearm(look: number): PB {
  const b = new PB();
  b.add(G.sphere(0.085, 12, 10), 'metal', 0, 0, 0);
  switch (look) {
    case 0:
      b.add(G.rbox(0.16, 0.24, 0.16, 0.05), 'paint', 0, 0.16, 0);
      b.add(G.box(0.012, 0.16, 0.012), 'rarity', 0, 0.16, 0.085);
      break;
    case 1:
      b.add(G.rbox(0.13, 0.22, 0.13, 0.04), 'paint2', 0, 0.15, 0);
      b.addSym(G.cyl(0.022, 0.022, 0.22, 8), 'chrome', 0.07, 0.15, 0.04);
      b.addSym(G.cyl(0.03, 0.03, 0.06, 8), 'metal', 0.07, 0.05, 0.04);
      b.add(G.box(0.012, 0.14, 0.012), 'rarity', 0, 0.15, 0.07);
      break;
    case 2:
      b.add(G.rbox(0.14, 0.24, 0.14, 0.04), 'paint2', 0, 0.15, 0);
      for (let i = 0; i < 3; i++) b.add(G.torus(0.085, 0.014, 6, 16), 'glow', 0, 0.08 + i * 0.07, 0, Math.PI / 2, 0, 0);
      break;
    case 3:
      b.add(G.cyl(0.085, 0.075, 0.22, 14), 'paint', 0, 0.12, 0);
      b.addSym(G.cyl(0.02, 0.02, 0.05, 8), 'glow', 0.07, 0.04, -0.03, 0.3, 0, 0);
      b.add(G.torus(0.08, 0.012, 6, 16), 'rarity', 0, 0.2, 0, Math.PI / 2, 0, 0);
      break;
    default:
      b.add(G.rbox(0.2, 0.26, 0.2, 0.06), 'paint', 0, 0.15, 0);
      b.add(G.rbox(0.22, 0.06, 0.22, 0.02), 'metal', 0, 0.06, 0);
      b.add(G.box(0.014, 0.16, 0.014), 'rarity', 0, 0.16, 0.105);
      break;
  }
  return b;
}

/** Fist/gauntlet, centred on the hand particle; knuckles point +Y, back of hand +Z. */
export function buildFist(look: number): PB {
  const b = new PB();
  switch (look) {
    case 0:
      b.add(G.rbox(0.21, 0.19, 0.22, 0.06), 'paint', 0, 0, 0);
      for (let i = 0; i < 4; i++) b.add(G.rbox(0.045, 0.04, 0.06, 0.015), 'metal', -0.07 + i * 0.047, 0.095, 0.05);
      b.add(G.rbox(0.17, 0.05, 0.05, 0.02), 'paint2', 0, -0.02, 0.105);
      break;
    case 1:
      b.add(G.rbox(0.18, 0.17, 0.19, 0.05), 'paint2', 0, 0, 0);
      b.add(G.rbox(0.15, 0.05, 0.12, 0.02), 'paint', 0, 0.075, 0.03);
      b.add(G.torus(0.085, 0.016, 6, 16), 'chrome', 0, -0.09, 0, Math.PI / 2, 0, 0);
      break;
    case 2:
      b.add(G.rbox(0.2, 0.19, 0.21, 0.05), 'paint', 0, 0, 0);
      b.add(G.rbox(0.17, 0.03, 0.05, 0.012), 'glow', 0, 0.095, 0.05);
      b.addSym(G.cone(0.018, 0.06, 4), 'chrome', 0.05, 0.12, 0.05);
      break;
    case 3:
      b.add(G.rbox(0.2, 0.2, 0.2, 0.05), 'paint', 0, 0, 0);
      b.addSym(G.rbox(0.02, 0.1, 0.1, 0.01), 'paint2', 0.11, -0.02, -0.02);
      b.add(G.rbox(0.16, 0.04, 0.03, 0.01), 'metal', 0, 0.1, 0.05);
      break;
    default:
      b.add(G.rbox(0.28, 0.25, 0.28, 0.07), 'paint', 0, 0.01, 0);
      b.add(G.rbox(0.3, 0.06, 0.12, 0.025), 'metal', 0, 0.12, 0.04);
      b.add(G.cyl(0.11, 0.11, 0.05, 14), 'paint2', 0, -0.12, 0);
      break;
  }
  return b;
}

// ------------------------------------------------------------------- LEGS
export function buildPelvis(look: number): PB {
  const b = new PB();
  b.add(G.rbox(0.36, 0.17, 0.26, 0.05), 'paint2', 0, -0.04, 0);
  b.add(G.rbox(0.38, 0.05, 0.28, 0.02), 'dark', 0, 0.04, 0);
  b.add(G.rbox(0.12, 0.12, 0.06, 0.02), 'paint', 0, -0.07, 0.13);
  if (look === 2) b.addSym(G.rbox(0.08, 0.16, 0.2, 0.03), 'paint', 0.2, -0.05, 0);
  if (look === 4) b.add(G.box(0.2, 0.012, 0.012), 'rarity', 0, 0.04, 0.145);
  else b.add(G.box(0.012, 0.06, 0.012), 'rarity', 0, -0.07, 0.165);
  return b;
}

export function buildThigh(look: number): PB {
  const b = new PB();
  b.add(G.sphere(0.1, 12, 10), 'metal', 0, 0, 0);
  switch (look) {
    case 0:
      b.add(G.rbox(0.19, 0.32, 0.2, 0.06), 'paint', 0, 0.22, 0);
      break;
    case 1:
      b.add(G.rbox(0.15, 0.3, 0.16, 0.05), 'paint', 0, 0.21, 0);
      b.add(G.rbox(0.1, 0.2, 0.04, 0.015), 'paint2', 0, 0.2, 0.08);
      break;
    case 2:
      b.add(G.rbox(0.24, 0.34, 0.24, 0.07), 'paint', 0, 0.22, 0);
      b.add(G.rbox(0.25, 0.06, 0.25, 0.02), 'dark', 0, 0.36, 0);
      break;
    case 3:
      b.add(G.rbox(0.18, 0.32, 0.18, 0.05), 'paint2', 0, 0.22, 0);
      b.add(G.cyl(0.022, 0.022, 0.28, 8), 'chrome', 0.0, 0.22, 0.11);
      b.add(G.cyl(0.035, 0.035, 0.1, 8), 'metal', 0.0, 0.12, 0.11);
      break;
    default:
      b.add(G.cyl(0.1, 0.075, 0.34, 6), 'paint', 0, 0.22, 0);
      b.add(G.box(0.012, 0.26, 0.012), 'glow', 0, 0.22, 0.09);
      break;
  }
  return b;
}

export function buildShin(legLook: number, kickLook: number): PB {
  const b = new PB();
  b.add(G.sphere(0.085, 12, 10), 'metal', 0, 0, 0);
  b.add(G.rbox(0.13, 0.1, 0.08, 0.03), 'paint', 0, 0.0, 0.08);
  switch (legLook) {
    case 0:
      b.add(G.rbox(0.16, 0.34, 0.17, 0.05), 'paint2', 0, 0.24, 0);
      break;
    case 1:
      b.add(G.rbox(0.12, 0.34, 0.13, 0.04), 'paint2', 0, 0.24, 0);
      for (let i = 0; i < 4; i++) b.add(G.torus(0.045, 0.011, 6, 12), 'chrome', 0, 0.12 + i * 0.06, -0.09, Math.PI / 2, 0, 0);
      break;
    case 2:
      b.add(G.cyl(0.12, 0.14, 0.36, 12), 'paint2', 0, 0.25, 0);
      b.add(G.torus(0.13, 0.014, 6, 18), 'dark', 0, 0.12, 0, Math.PI / 2, 0, 0);
      break;
    case 3:
      b.add(G.rbox(0.15, 0.34, 0.16, 0.05), 'paint2', 0, 0.24, 0);
      b.add(G.cyl(0.02, 0.02, 0.28, 8), 'chrome', 0, 0.24, 0.1);
      break;
    default:
      b.add(G.cyl(0.075, 0.055, 0.36, 6), 'paint2', 0, 0.24, 0);
      b.add(G.box(0.01, 0.26, 0.01), 'glow', 0, 0.24, 0.07);
      break;
  }
  // shin guard from the kick item
  switch (kickLook) {
    case 0:
      b.add(G.rbox(0.13, 0.18, 0.04, 0.02), 'paint', 0, 0.32, 0.095);
      break;
    case 1:
      b.add(G.rbox(0.05, 0.3, 0.05, 0.02), 'paint', 0, 0.26, 0.1);
      b.add(G.box(0.01, 0.24, 0.012), 'rarity', 0, 0.26, 0.128);
      break;
    case 2:
      b.add(G.rbox(0.18, 0.12, 0.05, 0.02), 'paint', 0, 0.36, 0.09);
      break;
    case 3:
      b.add(G.rbox(0.12, 0.2, 0.04, 0.02), 'paint', 0, 0.3, 0.095);
      b.add(G.sphere(0.02, 8, 6), 'glow', 0, 0.3, 0.12);
      break;
    default:
      b.add(G.cyl(0.05, 0.06, 0.12, 12), 'metal', 0, 0.06, -0.08, -Math.PI / 2.4, 0, 0);
      b.add(G.cyl(0.04, 0.04, 0.01, 12), 'glow', 0, 0.04, -0.14, -Math.PI / 2.4, 0, 0);
      break;
  }
  return b;
}

/** Foot: origin at the ankle, +Y up the shin, +Z towards the toes. */
export function buildFoot(look: number): PB {
  const b = new PB();
  switch (look) {
    case 0:
      b.add(G.rbox(0.19, 0.12, 0.32, 0.04), 'paint', 0, -0.025, 0.06);
      b.add(G.rbox(0.2, 0.03, 0.33, 0.012), 'dark', 0, -0.08, 0.06);
      break;
    case 1:
      b.add(G.rbox(0.16, 0.11, 0.3, 0.04), 'paint', 0, -0.03, 0.06);
      b.add(G.cone(0.06, 0.1, 4), 'paint2', 0, -0.03, 0.24, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.7);
      b.add(G.rbox(0.17, 0.025, 0.32, 0.01), 'dark', 0, -0.08, 0.07);
      break;
    case 2:
      b.add(G.rbox(0.23, 0.1, 0.34, 0.04), 'paint', 0, -0.035, 0.06);
      b.add(G.cone(0.035, 0.1, 4), 'metal', 0, -0.03, -0.14, -Math.PI / 2, 0, 0);
      b.add(G.box(0.2, 0.012, 0.012), 'rarity', 0, 0.02, 0.22);
      break;
    case 3:
      b.add(G.rbox(0.18, 0.12, 0.31, 0.04), 'paint', 0, -0.025, 0.06);
      b.add(G.sphere(0.045, 10, 8), 'glow', 0, -0.03, -0.1);
      b.add(G.rbox(0.02, 0.1, 0.12, 0.01), 'paint2', 0, 0.06, -0.06);
      break;
    default:
      b.add(G.rbox(0.19, 0.12, 0.31, 0.04), 'paint', 0, -0.025, 0.06);
      b.add(G.cyl(0.045, 0.055, 0.06, 12), 'metal', 0, -0.06, -0.08);
      b.add(G.cyl(0.035, 0.035, 0.01, 12), 'glow', 0, -0.092, -0.08);
      break;
  }
  return b;
}

/** Telescoping inner piston for rocket fists: unit height along +Y. */
export function pistonGeometry() {
  const g = new THREE.CylinderGeometry(0.045, 0.045, 1, 10);
  g.translate(0, 0.5, 0);
  return g;
}

/** Generic segment for spine and neck: unit height along +Y. */
export function segmentGeometry(r: number) {
  const g = new THREE.CylinderGeometry(r, r, 1, 10);
  g.translate(0, 0.5, 0);
  return g;
}
