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

// ------------------------------------------------------------------ procedural textures

/** Tileable value-noise fbm in 0..1: `size` pixels square, `base` cells across, each octave twice as fine. */
export function fbm(size: number, base: number, octaves: number, seed: number) {
  const out = new Float32Array(size * size);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = hash(seed * 97.3 + o * 13.1 + i * 0.731);
    const k = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * k, y0 = Math.floor(fy), ty = smooth(fy - y0), y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = x * k, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % cells;
        const p = lat[y0 * cells + x0], q = lat[y0 * cells + x1], r = lat[y1 * cells + x0], t = lat[y1 * cells + x1];
        out[y * size + x] += amp * (p + (q - p) * tx + (r - p) * ty + (p - q - r + t) * tx * ty);
      }
    }
    amp *= 0.5;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    lo = Math.min(lo, out[i]);
    hi = Math.max(hi, out[i]);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

/** Pixels into a repeating, linear (not colour) texture. */
export function dataTexture(w: number, h: number, fill: (i: number, px: Uint8ClampedArray) => void) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    fill(i, img.data);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c, true, false);
}

let _noise: THREE.Texture | null = null;
/** Three channels of tileable cloudy noise (shared, built once). */
export function noiseTexture() {
  return (_noise ??= buildNoise());
}
function buildNoise() {
  const n = 256;
  const r = fbm(n, 4, 6, 1), gr = fbm(n, 8, 5, 2), b = fbm(n, 4, 6, 3);
  return dataTexture(n, n, (i, px) => {
    px[i * 4] = r[i] * 255;
    px[i * 4 + 1] = gr[i] * 255;
    px[i * 4 + 2] = b[i] * 255;
  });
}

/** A normal map from a tileable w×h height field, slopes scaled by `k`. */
export function normalTexture(h: Float32Array, w: number, hh: number, k: number) {
  return dataTexture(w, hh, (i, px) => {
    const x = i % w, y = (i - x) / w;
    const dx = (h[y * w + ((x + 1) % w)] - h[y * w + ((x + w - 1) % w)]) * k;
    const dy = (h[((y + 1) % hh) * w + x] - h[((y + hh - 1) % hh) * w + x]) * k;
    const l = Math.hypot(dx, dy, 1);
    px[i * 4] = (-dx / l) * 127.5 + 127.5;
    // the canvas runs top-down, the texture's v bottom-up
    px[i * 4 + 1] = (dy / l) * 127.5 + 127.5;
    px[i * 4 + 2] = (1 / l) * 127.5 + 127.5;
  });
}

// ------------------------------------------------------------------ light shafts

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity, uTime, uSides;
  uniform sampler2D uNoise;
  varying vec2 vUv;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    // seen edge-on a sheet of light vanishes, so crossed sheets read as a soft volume
    float face = smoothstep(0.05, 0.55, abs(dot(normalize(vN), V)));
    float along = pow(clamp(vUv.y, 0.0, 1.0), 1.6);
    float sides = mix(1.0, smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x), uSides);
    // drifting dust thickens and thins the light
    float dust = texture2D(uNoise, vW.xz * 0.45 + vec2(vW.y * 0.3, uTime * 0.015)).r;
    dust = 0.55 + 0.9 * dust * dust;
    float nearCam = smoothstep(0.4, 1.6, length(cameraPosition - vW));
    gl_FragColor = vec4(uColor * (uOpacity * along * sides * face * dust * nearCam), 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * Additive light: a shaft from a window, a lamp's cone, light through a door. Bright where the
 * geometry's v is 1 (the source), fading away from it, with dust drifting through it.
 */
export function shaftMaterial(color: THREE.Color, opacity: number, sides: boolean, time: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uSides: { value: sides ? 1 : 0 },
      uNoise: { value: noiseTexture() },
      uTime: time,
    },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
