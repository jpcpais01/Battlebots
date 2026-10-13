import * as THREE from 'three';
import { RING_CORNER, ROPE_LINE, ropeSide, SIDE_NX, SIDE_NZ } from '../sim/body';
import { AX, AZ, BACK_D, FLOOR, RC, ROOF_Y, ROWS, TUNNEL_ROWS, TUNNEL_W } from './bowl';
import type { Fx } from './fx';

/**
 * Torn-off robot parts: rigid pieces that fly off with the blow, tumble, bounce and skid
 * across the canvas, glance off the ropes, and get scuffed along by the robots' feet. A piece
 * that sails over the top rope keeps going: off the apron, over the barrier and into the
 * stands, where it bounces down the rows and the fans around it go wild. They trail smoke and
 * spit sparks for a while. Purely visual: the fight never reads them.
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
  /** Which side of the ropes it was on last step (signed distance past the rope line). */
  ropeOut: number;
  /** Seconds left of stirring up the fans around it (it's out in the crowd). */
  stir: number;
  /** It has left the ring stage: it's the crowd's now. */
  loose: boolean;
}

/** Top rope: anything flying above it clears the ring. */
const TOP_ROPE = 1.35;
/** The canvas and the steel base under it (apothems of their octagons) and their heights. */
const CANVAS = (RING_CORNER + 0.55) * Math.cos(Math.PI / 8);
const BASE = (RING_CORNER + 0.75) * Math.cos(Math.PI / 8);
const SX = AX - RC;
const SZ = AZ - RC;
const TUNNEL_D = ROWS[TUNNEL_ROWS].d;

/** How far a point sits out from the bowl's front-row outline (the bowl.ts `outline(d)` offset). */
function bowlD(x: number, z: number) {
  return Math.hypot(Math.max(0, Math.abs(x) - SX), Math.max(0, Math.abs(z) - SZ)) - RC;
}

/**
 * Height of whatever is underfoot at (x, z), all the way out to the back wall: the canvas, the
 * stage base, the arena floor, the ringside barrier, the stepped rows of both tiers (the suite
 * wall between them is just the jump up to the upper tier) and the tunnel blocks.
 */
export function groundAt(x: number, z: number): number {
  const side = ropeSide(x, z);
  const oct = x * SIDE_NX[side] + z * SIDE_NZ[side];
  if (oct < CANVAS) return 0;
  if (oct < BASE) return -0.12;
  const d = bowlD(x, z);
  if (d < -0.6) return FLOOR;
  if (d < -0.35) return 0.42; // the barrier with its ad boards
  if (d < 0) return FLOOR;
  if (d >= BACK_D) return ROOF_Y;
  if (Math.abs(z) < TUNNEL_W / 2 && Math.abs(x) > AX && d < TUNNEL_D) return ROWS[TUNNEL_ROWS].y;
  for (let i = ROWS.length - 1; i >= 0; i--) if (ROWS[i].d <= d) return ROWS[i].y;
  return FLOOR;
}

/** Outward normal of the step/wall at (x, z): off the ring's octagon near it, the bowl's outline further out. */
function wallNormal(x: number, z: number, out: THREE.Vector3) {
  const side = ropeSide(x, z);
  if (x * SIDE_NX[side] + z * SIDE_NZ[side] < BASE + 0.3) return out.set(SIDE_NX[side], 0, SIDE_NZ[side]);
  const qx = Math.max(0, Math.abs(x) - SX) * Math.sign(x);
  const qz = Math.max(0, Math.abs(z) - SZ) * Math.sign(z);
  const l = Math.hypot(qx, qz);
  return l > 1e-4 ? out.set(qx / l, 0, qz / l) : out.set(Math.sign(x) || 1, 0, 0);
}

const GRAVITY = 9.81;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _lowest = new THREE.Vector3();
const _n = new THREE.Vector3();
const _prev = new THREE.Vector3();

export class Debris {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];

  /**
   * Launch a piece (already placed in world space). `dir` is the blow's direction and
   * `strength` its damage before blocking. `canFly` lets a big blow send it out of the ring
   * (off in the garage, which has no stands to land in).
   */
  spawn(obj: THREE.Group, dir: THREE.Vector3, strength: number, canFly = true): THREE.Vector3 {
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
    // most pieces drop in the ring; a big enough blow sends one sailing out over the ropes
    const big = canFly && Math.random() < Math.min(0.6, 0.2 + strength * 0.0035);
    const speed = big ? 5.5 + Math.random() * 3 + Math.min(2.5, strength * 0.012) : 1.6 + Math.min(3, strength * 0.022);
    const vel = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(speed);
    vel.y = big ? 4 + Math.random() * 1.8 : 2 + Math.random() * 1.4 + strength * 0.008;
    vel.x += (Math.random() - 0.5) * 1.2;
    vel.z += (Math.random() - 0.5) * 1.2;
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 9);
    const anchor = obj.position.clone();
    const s0 = ropeSide(anchor.x, anchor.z);
    const ropeOut = anchor.x * SIDE_NX[s0] + anchor.z * SIDE_NZ[s0] - ROPE_LINE;
    this.pieces.push({ obj, vel, spin, hull, radius, age: 0, rest: 0, anchor, ropeOut, stir: 0, loose: false });
    return anchor;
  }

  /**
   * Step every piece. `feet` are world positions that kick pieces about (the robots' feet).
   * `onCrowd` fires while a piece is out among the fans: where it is and how wild they go (0..1).
   */
  update(
    dt: number,
    fx: Fx,
    feet: readonly THREE.Vector3[],
    onLand: (p: THREE.Vector3, speed: number) => void,
    onCrowd?: (p: THREE.Vector3, k: number, first: boolean) => void,
  ) {
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
      if (p.loose && p.stir > 0) {
        p.stir -= dt;
        onCrowd?.(o.position, Math.min(1, p.stir / 3), false);
      }
      if (p.rest > 1.5) {
        p.anchor.copy(o.position);
        this.trail(p, fx, dt);
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      _prev.copy(o.position);
      o.position.addScaledVector(p.vel, dt);
      const w = p.spin.length();
      if (w > 1e-4) {
        _q.setFromAxisAngle(_v.copy(p.spin).multiplyScalar(1 / w), w * dt);
        o.quaternion.premultiply(_q);
      }
      // ground: the lowest hull point stays on whatever is under it (canvas, floor, a row of seats)
      let low = Infinity;
      for (const h of p.hull) {
        _w.copy(h).applyQuaternion(o.quaternion).add(o.position);
        if (_w.y < low) {
          low = _w.y;
          _lowest.copy(_w);
        }
      }
      let floor = groundAt(o.position.x, o.position.z);
      // ran into a step or wall (the ground here is above where its underside just was): back out and bounce off
      if (low < floor && _prev.y - (o.position.y - low) < floor - 0.05) {
        o.position.x = _prev.x;
        o.position.z = _prev.z;
        wallNormal(o.position.x, o.position.z, _n);
        // flip the part of its motion that went into the wall, whichever way the wall faces
        const vn = p.vel.x * _n.x + p.vel.z * _n.z;
        p.vel.x -= _n.x * vn * 1.45;
        p.vel.z -= _n.z * vn * 1.45;
        p.spin.multiplyScalar(0.7);
        if (Math.abs(vn) > 1.5) {
          onLand(o.position, Math.abs(vn));
          fx.sparks(o.position, _v.set(-_n.x * Math.sign(vn), 0.4, -_n.z * Math.sign(vn)).normalize(), 5, 0xffb060, 2.5, 1);
        }
        floor = groundAt(o.position.x, o.position.z);
        low = Infinity;
        for (const h of p.hull) {
          _w.copy(h).applyQuaternion(o.quaternion).add(o.position);
          if (_w.y < low) {
            low = _w.y;
            _lowest.copy(_w);
          }
        }
      }
      if (low < floor) {
        o.position.y += floor - low;
        _lowest.y = floor;
        low = floor;
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
      // the ropes catch anything below the top rope, from either side; above it, it sails clean over
      const side = ropeSide(o.position.x, o.position.z);
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      const past = o.position.x * nx + o.position.z * nz - ROPE_LINE;
      const below = o.position.y < TOP_ROPE + p.radius * 0.5;
      if (below && p.ropeOut <= 0 && past > -p.radius - 0.1 && floor >= 0) {
        // inside: the ropes bounce it back in
        const out = past + p.radius + 0.1;
        o.position.x -= nx * out;
        o.position.z -= nz * out;
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn > 0) {
          p.vel.x -= nx * vn * 1.5;
          p.vel.z -= nz * vn * 1.5;
        }
      } else if (below && p.ropeOut > 0 && past < p.radius + 0.1) {
        // outside (on the apron): the ropes keep it out
        const back = p.radius + 0.1 - past;
        o.position.x += nx * back;
        o.position.z += nz * back;
        const vn = p.vel.x * nx + p.vel.z * nz;
        if (vn < 0) {
          p.vel.x -= nx * vn * 1.5;
          p.vel.z -= nz * vn * 1.5;
        }
      } else p.ropeOut = past;
      // off the stage: into the crowd's hands
      if (!p.loose && bowlD(o.position.x, o.position.z) > -2.5 && low <= floor + 0.05) {
        p.loose = true;
        p.stir = 6;
        onCrowd?.(o.position, 1, true);
      }
      const moving = p.vel.lengthSq() + p.spin.lengthSq() * 0.01;
      p.rest = low < floor + 0.01 && moving < 0.04 ? p.rest + dt : 0;
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
