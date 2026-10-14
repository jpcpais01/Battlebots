import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt } from './debris';

/** Slots per kind of bit. */
const PER = 40;
const LIFE = 5;

/** Chips of paint-coloured plating, hex nuts and bolts. */
const enum Kind {
  Chip,
  Nut,
  Bolt,
}

interface Bit {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  q: THREE.Quaternion;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  age: number;
  /** Half its thickness lying down, so it sits on the canvas, not in it. */
  rest: number;
  live: boolean;
}

/**
 * Small parts shaken loose by hits: flecks of plating, nuts and bolts that fly off the blow,
 * tumble, clink off the canvas and skitter to a stop, then fade after a few seconds. The more
 * battered the part that was hit, the more comes off, so they show the damage piling up.
 * Purely visual (the fight never reads them): three instanced meshes, one draw call each.
 */
export class Bits {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private bits: Bit[][] = [];
  private next = [0, 0, 0];
  private live = 0;
  /** A bit landed hard enough to hear: where, and how hard (0..1). */
  onClink: ((p: THREE.Vector3, k: number) => void) | null = null;

  constructor() {
    const chip = new THREE.BoxGeometry(1, 0.16, 0.7);
    // bend the chip a little: a torn-off fleck of plate, not a tile
    const cp = chip.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) + cp.getX(i) * cp.getX(i) * 0.3);
    chip.computeVertexNormals();
    const nut = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 6);
    const shaft = new THREE.CylinderGeometry(0.16, 0.16, 1, 6).translate(0, -0.1, 0);
    const head = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 6).translate(0, 0.5, 0);
    const bolt = mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed()])!;
    bolt.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.38, flatShading: true });
    for (const geo of [chip, nut, bolt]) {
      const m = new THREE.InstancedMesh(geo, mat, PER);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.visible = false;
      m.setColorAt(0, new THREE.Color());
      const list: Bit[] = [];
      for (let i = 0; i < PER; i++) {
        m.setMatrixAt(i, ZERO);
        list.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Vector3(), scale: new THREE.Vector3(), age: 0, rest: 0, live: false });
      }
      this.meshes.push(m);
      this.bits.push(list);
      this.group.add(m);
    }
  }

  /**
   * Throws `count` bits from p, mostly along `dir` (the way the blow travelled) and up.
   * `paint` colours the flecks of plating; the hardware is steel or brass.
   */
  spawn(p: THREE.Vector3, dir: THREE.Vector3, count: number, paint: number, speed = 3) {
    for (let n = 0; n < count; n++) {
      const r = Math.random();
      const kind = r < 0.5 ? Kind.Chip : r < 0.8 ? Kind.Nut : Kind.Bolt;
      const i = this.next[kind];
      this.next[kind] = (i + 1) % PER;
      const b = this.bits[kind][i];
      b.live = true;
      b.age = 0;
      b.pos.copy(p).addScaledVector(_v.randomDirection(), 0.04);
      const s = speed * (0.5 + Math.random() * 0.8);
      _v.set(Math.random() - 0.5, Math.random() * 0.6 + 0.35, Math.random() - 0.5).multiplyScalar(1.3).add(dir).normalize();
      b.vel.copy(_v).multiplyScalar(s);
      b.q.setFromEuler(_e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      b.spin.randomDirection().multiplyScalar(10 + Math.random() * 25);
      const m = this.meshes[kind];
      if (kind === Kind.Chip) {
        const k = 0.045 + Math.random() * 0.05;
        b.scale.set(k * (0.8 + Math.random() * 0.6), k, k * (0.6 + Math.random() * 0.6));
        b.rest = b.scale.y * 0.1;
        _c.set(paint).multiplyScalar(0.7 + Math.random() * 0.35);
        // some flecks are bare metal from under the paint
        if (Math.random() < 0.3) _c.setRGB(0.5, 0.52, 0.55);
      } else if (kind === Kind.Nut) {
        const k = 0.03 + Math.random() * 0.018;
        b.scale.set(k, k, k);
        b.rest = k * 0.21;
        _c.set(Math.random() < 0.25 ? 0xb08d57 : 0x8d939b);
      } else {
        const k = 0.045 + Math.random() * 0.03;
        b.scale.set(k, k, k);
        b.rest = k * 0.36;
        _c.set(Math.random() < 0.2 ? 0xb08d57 : 0x7d838b);
      }
      m.setColorAt(i, _c);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = true;
      this.live++;
    }
  }

  update(dt: number) {
    if (!this.live || dt <= 0) return;
    let live = 0;
    for (let kind = 0; kind < 3; kind++) {
      const m = this.meshes[kind];
      let any = false;
      for (let i = 0; i < PER; i++) {
        const b = this.bits[kind][i];
        if (!b.live) continue;
        b.age += dt;
        if (b.age > LIFE) {
          b.live = false;
          m.setMatrixAt(i, ZERO);
          continue;
        }
        any = true;
        live++;
        b.vel.y -= 9.8 * dt;
        b.vel.multiplyScalar(Math.exp(-0.3 * dt));
        b.pos.addScaledVector(b.vel, dt);
        const g = groundAt(b.pos.x, b.pos.z) + b.rest;
        let grounded = false;
        if (b.pos.y <= g) {
          b.pos.y = g;
          grounded = true;
          if (b.vel.y < -0.7) {
            const hit = -b.vel.y;
            // clink, bounce low, and tumble a different way
            if (hit > 1.4) this.onClink?.(b.pos, Math.min(1, hit / 6) * (kind === Kind.Chip ? 0.6 : 1));
            b.vel.y = hit * (0.25 + Math.random() * 0.2);
            b.vel.x *= 0.65;
            b.vel.z *= 0.65;
            b.spin.randomDirection().multiplyScalar(b.spin.length() * 0.6);
          } else {
            // sliding: friction and settling flat on the deck
            b.vel.y = 0;
            const f = Math.exp(-5 * dt);
            b.vel.x *= f;
            b.vel.z *= f;
            b.spin.multiplyScalar(Math.exp(-9 * dt));
          }
        }
        const w = b.spin.length();
        if (w > 1e-3) b.q.premultiply(_q.setFromAxisAngle(_v.copy(b.spin).divideScalar(w), w * dt));
        if (grounded && b.vel.y === 0) {
          // lie down: chips and nuts flat, a bolt on its side
          _a.set(0, 1, 0).applyQuaternion(b.q);
          if (kind === Kind.Bolt) _t.set(_a.x, 0, _a.z).normalize();
          else _t.set(0, _a.y >= 0 ? 1 : -1, 0);
          if (_t.lengthSq() > 0.5) b.q.premultiply(_q.setFromUnitVectors(_a, _v.copy(_a).lerp(_t, 1 - Math.exp(-10 * dt)).normalize()));
        }
        // shrink away at the end
        const fade = Math.min(1, (LIFE - b.age) / 0.5);
        _s.copy(b.scale).multiplyScalar(fade);
        m.setMatrixAt(i, _m.compose(b.pos, b.q, _s));
      }
      m.instanceMatrix.needsUpdate = true;
      if (!any) m.visible = false;
    }
    this.live = live;
  }

  clear() {
    for (let kind = 0; kind < 3; kind++) {
      for (let i = 0; i < PER; i++) {
        this.bits[kind][i].live = false;
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
