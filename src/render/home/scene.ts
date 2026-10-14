import * as THREE from 'three';
import { G } from '../parts';
import type { Baker, Surface } from '../bake';
import type { LightLook } from '../stage';
import type { Fx } from '../fx';
import type { Sfx } from '../../audio/sfx';
import type { Actor } from './actor';

/** The home scene's camera, read by the Director in 'scene' mode. */
export interface SceneCam {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** Field of view as a multiple of the screen's base lens. */
  fov: number;
  roll: number;
  /** How quickly the lens follows (100 or more: exactly). */
  lambda: number;
  /** A hard cut this frame (the Director jumps instead of easing). */
  cut: boolean;
}

/** What a scene works with each frame. */
export interface SceneKit {
  actor: Actor;
  fx: Fx;
  sfx: Sfx | null;
  cam: SceneCam;
}

/**
 * An animated home screen background: a place, the robot doing something there, and a
 * cinematic way out to the arena when the player hits Fight.
 */
export interface HomeScene {
  readonly group: THREE.Group;
  readonly look: LightLook;
  /** Reflections for metal in this place (null keeps the stage's own). */
  readonly env: THREE.Texture | null;
  /** Crowd level heard here (the arena is somewhere off in the distance). */
  readonly crowd: number;
  /** (Re)start the idle performance with this actor. */
  start(k: SceneKit): void;
  update(dt: number, time: number, k: SceneKit): void;
  /** The player hit Fight: play the way out. */
  outro(k: SceneKit): void;
  /** The way out has reached its cut to the arena. */
  readonly over: boolean;
  /** Take the actor's props back (the actor is about to be replaced). */
  release(k: SceneKit): void;
}

// ------------------------------------------------------------------ helpers

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

export function texture(c: HTMLCanvasElement, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

/** Bake a (tapered) round bar from a to b: radius r0 at a, r1 at b. */
export function seg(b: Baker, a: THREE.Vector3, e: THREE.Vector3, r0: number, r1: number, s: Surface, sides = 10) {
  _d.subVectors(e, a);
  const len = _d.length();
  if (len < 1e-5) return;
  _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  _m.compose(_a.addVectors(a, e).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  b.geo(G.cyl(r1, r0, len, sides), _m, s);
}

/** Bake a box of size (w, h, d) at (x, y, z) turned by (rx, ry, rz). */
export function box(b: Baker, w: number, h: number, d: number, x: number, y: number, z: number, s: Surface, rx = 0, ry = 0, rz = 0, chamfer = 0) {
  _m.compose(_a.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(chamfer ? 1 : w, chamfer ? 1 : h, chamfer ? 1 : d));
  b.geo(chamfer ? G.cbox(w, h, d, chamfer) : UNIT_BOX, _m, s);
}
const _e = new THREE.Euler();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Bake any geometry at (x, y, z), turned and uniformly scaled. */
export function put(b: Baker, g: THREE.BufferGeometry, x: number, y: number, z: number, s: Surface, rx = 0, ry = 0, rz = 0, sc = 1) {
  _m.compose(_a.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sc, sc, sc));
  b.geo(g, _m, s);
}

/** Same, scaled per axis. */
export function putS(b: Baker, g: THREE.BufferGeometry, x: number, y: number, z: number, s: Surface, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
  _m.compose(_a.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  b.geo(g, _m, s);
}

/** Glowing geometry at (x, y, z). */
export function glowAt(b: Baker, g: THREE.BufferGeometry, x: number, y: number, z: number, c: THREE.Color, rx = 0, ry = 0, rz = 0, sc = 1) {
  _m.compose(_a.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sc, sc, sc));
  b.glow(g, _m, c);
}

/** Linear interpolation of two points into out. */
export const mixV = (out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, u: number) => out.lerpVectors(a, b, u);

export const smooth = (u: number) => {
  const k = u < 0 ? 0 : u > 1 ? 1 : u;
  return k * k * (3 - 2 * k);
};
/** 0 → 1 as t goes a → b, smoothly. */
export const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));

/** A camera shot to blend to: position and look point. */
export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

/** Blend the scene camera between two shots. */
export function blendShot(cam: SceneCam, a: Shot, b: Shot, u: number) {
  cam.pos.lerpVectors(a.pos, b.pos, u);
  cam.look.lerpVectors(a.look, b.look, u);
  cam.fov = a.fov + (b.fov - a.fov) * u;
}

export const shot = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov = 1): Shot => ({
  pos: new THREE.Vector3(px, py, pz),
  look: new THREE.Vector3(lx, ly, lz),
  fov,
});

/** Cheap deterministic hash noise in 0..1 (scenery placement). */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

