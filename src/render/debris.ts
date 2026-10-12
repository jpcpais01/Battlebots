import * as THREE from 'three';
import { ROPE_LINE, ropeSide, SIDE_NX, SIDE_NZ } from '../sim/body';
import type { Fx } from './fx';

/**
 * Torn-off robot parts: rigid pieces that fly off with the blow, tumble, bounce and skid
 * across the canvas, glance off the ropes, and get scuffed along by the robots' feet. They
 * trail smoke and spit sparks for a while. Purely visual: the fight never reads them.
 */
interface Piece {
  obj: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** Points on the hull (local) used for ground contact. */
  hull: THREE.Vector3[];
  /** Rough radius, for the ropes and feet. */
  radius: number;
  age: number;
  rest: number;
  /** Stand-in positions for the fighter's torn particles (the model draws them from here). */
  anchor: THREE.Vector3;
}

const GRAVITY = 9.81;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _lowest = new THREE.Vector3();

export class Debris {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];

  /**
   * Launch a piece (already placed in world space). `dir` is the blow's direction and
   * `strength` its damage before blocking.
   */
  spawn(obj: THREE.Group, dir: THREE.Vector3, strength: number): THREE.Vector3 {
    this.group.add(obj);
    // hull points from the geometry's bounds, a little inset so it rests on its plating
    const mesh = obj.children[0] as THREE.Mesh;
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    const hull: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      hull.push(
        new THREE.Vector3(
          i & 1 ? b.max.x : b.min.x,
          i & 2 ? b.max.y : b.min.y,
          i & 4 ? b.max.z : b.min.z,
        ).multiplyScalar(0.8),
      );
    }
    const radius = Math.max(0.06, b.getSize(_v).length() * 0.35);
    const speed = 1.6 + Math.min(3, strength * 0.022);
    const vel = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(speed);
    vel.y = 2 + Math.random() * 1.4 + strength * 0.008;
    vel.x += (Math.random() - 0.5) * 1.2;
    vel.z += (Math.random() - 0.5) * 1.2;
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 9);
    const anchor = obj.position.clone();
    this.pieces.push({ obj, vel, spin, hull, radius, age: 0, rest: 0, anchor });
    return anchor;
  }

  /** Step every piece. `feet` are world positions that kick pieces about (the robots' feet). */
  update(dt: number, fx: Fx, feet: readonly THREE.Vector3[], onLand: (p: THREE.Vector3, speed: number) => void) {
    dt = Math.min(dt, 1 / 30);
    for (const p of this.pieces) {
      p.age += dt;
      const o = p.obj;
      // the robots' feet scuff pieces along the canvas
      for (const f of feet) {
        const dx = o.position.x - f.x, dz = o.position.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d < p.radius + 0.12 && d > 1e-4 && f.y < o.position.y + p.radius + 0.1) {
          const push = (p.radius + 0.12 - d) * 14;
          p.vel.x += (dx / d) * push;
          p.vel.z += (dz / d) * push;
          p.spin.y += (Math.random() - 0.5) * 6;
          p.rest = 0;
        }
      }
      if (p.rest > 1.5) {
        p.anchor.copy(o.position);
        this.trail(p, fx, dt);
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      o.position.addScaledVector(p.vel, dt);
      const w = p.spin.length();
      if (w > 1e-4) {
        _q.setFromAxisAngle(_v.copy(p.spin).multiplyScalar(1 / w), w * dt);
        o.quaternion.premultiply(_q);
      }
      // ground: the lowest hull point stays on the canvas
      let low = Infinity;
      for (const h of p.hull) {
        _w.copy(h).applyQuaternion(o.quaternion).add(o.position);
        if (_w.y < low) {
          low = _w.y;
          _lowest.copy(_w);
        }
      }
      if (low < 0) {
        o.position.y -= low;
        if (p.vel.y < 0) {
          const impact = -p.vel.y;
          if (impact > 1.2) onLand(_lowest, impact);
          p.vel.y = impact > 0.6 ? impact * 0.32 : 0;
          // the contact corner drags: spin couples into sliding and dies down
          p.vel.x *= 0.72;
          p.vel.z *= 0.72;
          p.spin.multiplyScalar(0.6);
          // tip over the contact corner a little, like a real lump of metal
          _v.subVectors(o.position, _lowest).setY(0);
          p.spin.x += _v.z * impact * 6;
          p.spin.z -= _v.x * impact * 6;
          if (impact > 2) fx.sparks(_lowest, _v.set(p.vel.x, 0.5, p.vel.z).normalize(), 6, 0xffb060, 3, 1);
        } else {
          // sliding friction
          const k = Math.exp(-dt * 4);
          p.vel.x *= k;
          p.vel.z *= k;
          p.spin.multiplyScalar(Math.exp(-dt * 5));
        }
      }
      // the ropes bounce it back in
      const side = ropeSide(o.position.x, o.position.z);
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      const out = o.position.x * nx + o.position.z * nz - (ROPE_LINE - p.radius - 0.1);
      if (out > 0) {
        o.position.x -= nx * out;
        o.position.z -= nz * out;
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn > 0) {
          p.vel.x -= nx * vn * 1.5;
          p.vel.z -= nz * vn * 1.5;
        }
      }
      const moving = p.vel.lengthSq() + p.spin.lengthSq() * 0.01;
      p.rest = low < 0.01 && moving < 0.04 ? p.rest + dt : 0;
      p.anchor.copy(o.position);
      this.trail(p, fx, dt);
    }
  }

  /** Smoke and sparks off a torn piece, dying down over a few seconds. */
  private trail(p: Piece, fx: Fx, dt: number) {
    const heat = Math.max(0, 1 - p.age / 6);
    if (heat <= 0.05) {
      if (Math.random() < dt * 0.6) fx.smoke(p.obj.position, 1, 0.1);
      return;
    }
    if (Math.random() < dt * 14 * heat) fx.smoke(p.obj.position, 1, heat);
    if (Math.random() < dt * 5 * heat) fx.sparks(p.obj.position, _v.set(0, 1, 0), 3, 0xffa040, 2.5 * heat + 0.5, 1);
  }

  clear() {
    for (const p of this.pieces) {
      this.group.remove(p.obj);
      for (const c of p.obj.children) (c as THREE.Mesh).geometry.dispose();
    }
    this.pieces = [];
  }
}
