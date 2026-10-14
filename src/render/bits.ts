import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt } from './debris';
import { RenderSettings } from './settings';

/** Slots per kind of fragment. */
const PER = 64;
/** How long a fragment lies on the canvas before it's swept away (s). */
const LIFE = 11;

/**
 * Kinds of fragment, each its own instanced mesh. Every geometry is built at unit size with
 * its thin axis along y, so "lying flat" is the same rule for all of them.
 */
const enum Kind {
  /** Torn, jagged pieces of armour plate (three random outlines). */
  ShardA,
  ShardB,
  ShardC,
  /** A curled strip of sheet metal peeled off an edge. */
  Strip,
  Nut,
  Bolt,
  Washer,
}
const KINDS = 7;

interface Frag {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  q: THREE.Quaternion;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  age: number;
  /** Glow of a freshly torn edge (1 = orange hot .. 0 = cold). */
  heat: number;
  /** Air drag: sheet metal flutters and slows, a nut flies like a bullet. */
  drag: number;
  /** Half its thickness lying down, so it sits on the canvas, not in it. */
  rest: number;
  live: boolean;
  settled: boolean;
}

/** A sheet of steel torn into an irregular outline: a star-shaped jagged polygon, bent a little. */
function shardGeo(seed: number): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 5 + Math.floor(rnd() * 4);
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = ((i + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
    // the odd deep notch is where it tore
    const r = (rnd() < 0.25 ? 0.18 + rnd() * 0.12 : 0.36 + rnd() * 0.2) * (i % 2 ? 1 : 1.15);
    const x = Math.cos(a) * r * 1.25, y = Math.sin(a) * r * 0.8;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  g.translate(0, 0, -0.03);
  g.rotateX(-Math.PI / 2);
  // buckled by the blow
  const p = g.attributes.position as THREE.BufferAttribute;
  const bx = (rnd() - 0.5) * 0.9, bz = (rnd() - 0.5) * 0.6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) + bx * x * x + bz * z * z + (rnd() - 0.5) * 0.015);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

/** A strip peeled off a panel edge, curled into a hook and twisted. */
function stripGeo(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 0.035, 0.2, 10, 1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.5;
    const ang = x * x * 2.4;
    const r = 0.42;
    const y = p.getY(i);
    // roll it up around a centre: the further along, the tighter
    p.setXYZ(i, Math.sin(ang) * (r - y) - 0.2, r - Math.cos(ang) * (r - y) - 0.15, p.getZ(i) * (1 - x * 0.45) + x * x * 0.08);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

function hexShape(r: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function holed(shape: THREE.Shape, r: number) {
  const h = new THREE.Path();
  h.absarc(0, 0, r, 0, Math.PI * 2, true);
  shape.holes.push(h);
  return shape;
}

/** Hex nut with its threaded hole. */
function nutGeo() {
  const g = new THREE.ExtrudeGeometry(holed(hexShape(0.5), 0.24), { depth: 0.48, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -0.24);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Hex-head bolt, its shank stretched and a little bent from being ripped out. */
function boltGeo() {
  const head = new THREE.ExtrudeGeometry(hexShape(0.26), { depth: 0.16, bevelEnabled: false });
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0.42, 0);
  const shank = new THREE.CylinderGeometry(0.1, 0.1, 0.85, 8, 4).translate(0, 0, 0);
  const p = shank.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.pow(Math.max(0, -p.getY(i)), 2) * 0.25);
  const g = mergeGeometries([head.toNonIndexed(), shank.toNonIndexed()])!;
  g.computeVertexNormals();
  return g;
}

function washerGeo() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  const g = new THREE.ExtrudeGeometry(holed(s, 0.24), { depth: 0.09, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -0.045);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Half-thickness of each kind lying flat, at unit scale. */
const REST = [0.035, 0.035, 0.035, 0.05, 0.28, 0.24, 0.05];

/**
 * Metal torn loose by hits: jagged shards of armour plate, curled strips, nuts, bolts and
 * washers. They're real-world sized (a nut is under 2 cm), come off hard and fast with the
 * blow, and the freshly torn ones glow orange at first, trailing sparks and a wisp of smoke
 * while they cool. They clatter down, skid and lie on the canvas, piling up as a fight wears
 * on, so a battered bot visibly sheds itself. Purely visual: the fight never reads them.
 */
export class Bits {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private heatAttr: THREE.InstancedBufferAttribute[] = [];
  private frags: Frag[][] = [];
  private next = new Array(KINDS).fill(0);
  private live = 0;
  private uGlow = { value: 3 };
  /** A fragment landed hard enough to hear: where, and how hard (0..1). */
  onClink: ((p: THREE.Vector3, k: number) => void) | null = null;

  constructor() {
    const geos = [shardGeo(11), shardGeo(4057), shardGeo(90211), stripGeo(), nutGeo(), boltGeo(), washerGeo()];
    const plate = this.material(0.75, 0.42);
    const hardware = this.material(0.9, 0.3);
    geos.forEach((geo, kind) => {
      const heat = new THREE.InstancedBufferAttribute(new Float32Array(PER), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('heat', heat);
      const m = new THREE.InstancedMesh(geo, kind <= Kind.Strip ? plate : hardware, PER);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.visible = false;
      m.setColorAt(0, new THREE.Color());
      const list: Frag[] = [];
      for (let i = 0; i < PER; i++) {
        m.setMatrixAt(i, ZERO);
        list.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), scale: new THREE.Vector3(), age: 0, heat: 0, drag: 0, rest: 0, live: false, settled: false });
      }
      this.meshes.push(m);
      this.heatAttr.push(heat);
      this.frags.push(list);
      this.group.add(m);
    });
  }

  /** Lit metal that glows from inside where an instance's `heat` is up: a freshly torn edge. */
  private material(metalness: number, roughness: number) {
    const mat = new THREE.MeshStandardMaterial({ metalness, roughness, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHeatGlow = this.uGlow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float heat;\nvarying float vHeat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHeat;\nuniform float uHeatGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          // a black-body ramp: dull red, then orange, then yellow-white at the hottest
          `#include <emissivemap_fragment>
          float hh = clamp(vHeat, 0., 1.);
          vec3 hot = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.06), smoothstep(0.15, 0.6, hh));
          hot = mix(hot, vec3(1.0, 0.85, 0.55), smoothstep(0.75, 1.0, hh));
          totalEmissiveRadiance += hot * hh * hh * uHeatGlow;
          diffuseColor.rgb *= 1.0 - 0.6 * hh;`,
        );
    };
    return mat;
  }

  /**
   * Tears `count` fragments loose at p, thrown along `dir` (the way the blow went) and out
   * sideways. `power` 0..1 sets how fast and how hot; `paint` colours the plating.
   */
  spawn(p: THREE.Vector3, dir: THREE.Vector3, count: number, paint: number, power = 0.5) {
    const pw = Math.min(1, Math.max(0, power));
    for (let n = 0; n < count; n++) {
      const r = Math.random();
      const kind: Kind =
        r < 0.5 ? ((Math.random() * 3) | 0) as Kind : r < 0.62 ? Kind.Strip : r < 0.8 ? Kind.Nut : r < 0.92 ? Kind.Bolt : Kind.Washer;
      const i = this.next[kind];
      this.next[kind] = (i + 1) % PER;
      const f = this.frags[kind][i];
      f.live = true;
      f.settled = false;
      f.age = 0;
      f.pos.copy(p).addScaledVector(_v.randomDirection(), 0.03);
      // mostly on through with the blow, the rest bursting out across the plate
      _v.set(Math.random() * 2 - 1, Math.random() * 1.4 - 0.2, Math.random() * 2 - 1).multiplyScalar(0.9).addScaledVector(dir, 1.1).normalize();
      const s = (4 + pw * 9) * (0.35 + Math.pow(Math.random(), 0.7) * 0.95);
      f.vel.copy(_v).multiplyScalar(s);
      f.q.setFromEuler(_e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      const plate = kind <= Kind.Strip;
      f.spin.randomDirection().multiplyScalar((plate ? 25 : 15) + Math.random() * 40 * (0.5 + pw));
      // freshly torn plate is hot; hardware just gets ripped out
      f.heat = plate && Math.random() < 0.3 + pw * 0.5 ? 0.55 + Math.random() * 0.45 : plate ? Math.random() * 0.25 : 0;
      let k: number;
      if (plate) {
        k = (kind === Kind.Strip ? 0.035 : 0.022) + Math.random() * 0.03 + (Math.random() < pw * 0.25 ? 0.03 : 0);
        f.scale.set(k * (0.85 + Math.random() * 0.3), k * (0.7 + Math.random() * 0.6), k * (0.85 + Math.random() * 0.3));
        f.drag = 1.1 + Math.random() * 0.8;
        // scuffed paint, or bare and blued steel where it sheared
        const bare = Math.random() < 0.35;
        if (bare) _c.setRGB(0.32, 0.33, 0.35).multiplyScalar(0.7 + Math.random() * 0.5);
        else _c.set(paint).multiplyScalar(0.45 + Math.random() * 0.3).lerp(_g.setRGB(0.18, 0.18, 0.18), 0.25);
      } else {
        k = kind === Kind.Nut ? 0.015 + Math.random() * 0.007 : kind === Kind.Bolt ? 0.032 + Math.random() * 0.018 : 0.016 + Math.random() * 0.01;
        f.scale.set(k, k, k);
        f.drag = 0.12;
        const t = Math.random();
        // zinc plate, black oxide, or the odd brass fitting
        if (t < 0.5) _c.setRGB(0.55, 0.56, 0.58);
        else if (t < 0.88) _c.setRGB(0.09, 0.09, 0.1);
        else _c.setRGB(0.62, 0.45, 0.22);
      }
      f.rest = REST[kind] * f.scale.y;
      const m = this.meshes[kind];
      m.setColorAt(i, _c);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = true;
      this.live++;
    }
  }

  /**
   * `trail` gets a call for each hot fragment in flight (where it is, its velocity and heat)
   * so the effects layer can stream sparks and smoke behind it.
   */
  update(dt: number, trail?: (p: THREE.Vector3, v: THREE.Vector3, heat: number) => void) {
    if (!this.live || dt <= 0) return;
    this.uGlow.value = RenderSettings.glow(3.2);
    let live = 0;
    for (let kind = 0; kind < KINDS; kind++) {
      const m = this.meshes[kind];
      const heatArr = this.heatAttr[kind].array as Float32Array;
      let any = false;
      for (let i = 0; i < PER; i++) {
        const f = this.frags[kind][i];
        if (!f.live) continue;
        f.age += dt;
        if (f.age > LIFE) {
          f.live = false;
          heatArr[i] = 0;
          m.setMatrixAt(i, ZERO);
          continue;
        }
        any = true;
        live++;
        // cools fast in the air, then slowly on the deck
        f.heat = Math.max(0, f.heat - dt * (f.settled ? 0.35 : 0.6));
        if (!f.settled) {
          const sp = f.vel.length();
          // quadratic-ish air drag: a flat shard brakes hard, a nut barely
          f.vel.multiplyScalar(Math.exp(-f.drag * dt * (0.4 + sp * 0.08)));
          f.vel.y -= 9.8 * dt;
          f.pos.addScaledVector(f.vel, dt);
          if (f.heat > 0.3 && sp > 2.5) trail?.(f.pos, f.vel, f.heat);
          const g = groundAt(f.pos.x, f.pos.z) + f.rest;
          if (f.pos.y <= g) {
            f.pos.y = g;
            const down = -f.vel.y;
            if (down > 0.9) {
              // a hard landing: clank, a low dead bounce, and it skids on
              if (down > 1.6) this.onClink?.(f.pos, Math.min(1, down / 7) * (kind <= Kind.Strip ? 0.7 : 1));
              f.vel.y = down * (kind <= Kind.Strip ? 0.12 + Math.random() * 0.12 : 0.2 + Math.random() * 0.15);
              f.vel.x *= 0.55;
              f.vel.z *= 0.55;
              f.spin.multiplyScalar(0.5).add(_v.randomDirection().multiplyScalar(down * 3));
            } else {
              f.vel.y = 0;
              // a bolt rolls, flat metal grinds to a stop
              const fr = Math.exp(-(kind === Kind.Bolt ? 2.2 : kind <= Kind.Strip ? 9 : 4.5) * dt);
              f.vel.x *= fr;
              f.vel.z *= fr;
              f.spin.multiplyScalar(Math.exp(-12 * dt));
              if (f.vel.x * f.vel.x + f.vel.z * f.vel.z < 0.0004 && f.spin.lengthSq() < 0.05) f.settled = true;
            }
            if (f.vel.y === 0 || f.settled) {
              // lie down: plate and nuts flat, a bolt on its side
              _a.set(0, 1, 0).applyQuaternion(f.q);
              if (kind === Kind.Bolt) _t.set(_a.x, 0, _a.z).normalize();
              else _t.set(0, _a.y >= 0 ? 1 : -1, 0);
              if (_t.lengthSq() > 0.5) f.q.premultiply(_q.setFromUnitVectors(_a, _v.copy(_a).lerp(_t, 1 - Math.exp(-14 * dt)).normalize()));
            }
          }
          const w = f.spin.length();
          if (w > 1e-3) f.q.premultiply(_q.setFromAxisAngle(_v.copy(f.spin).divideScalar(w), w * dt));
        }
        heatArr[i] = f.heat;
        // swept off at the end: a quick shrink once it's long cold and still
        const fade = Math.min(1, (LIFE - f.age) / 0.4);
        _s.copy(f.scale).multiplyScalar(fade);
        m.setMatrixAt(i, _m.compose(f.pos, f.q, _s));
      }
      m.instanceMatrix.needsUpdate = true;
      this.heatAttr[kind].needsUpdate = true;
      if (!any) m.visible = false;
    }
    this.live = live;
  }

  clear() {
    for (let kind = 0; kind < KINDS; kind++) {
      for (let i = 0; i < PER; i++) {
        this.frags[kind][i].live = false;
        this.meshes[kind].setMatrixAt(i, ZERO);
      }
      this.meshes[kind].instanceMatrix.needsUpdate = true;
      this.meshes[kind].visible = false;
    }
    this.live = 0;
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _g = new THREE.Color();
