import * as THREE from 'three';
import { RenderSettings } from './settings';
import type { BotModel } from './botModel';
import { COUNTDOWN, type HitInfo, type Match } from '../sim/match';
import { ENTRY, hatchXZ, PRESENT } from '../sim/entrance';
import { J } from '../sim/body';
import { RefCount } from '../game/refCount';

/**
 * The referee: a little hovering drone that runs the fight from inside the ropes. Render only:
 * it reads the match (its phase, its events, and a ten count of its own kept from the same events
 * as the HUD's) and never touches the sim, so online fights stay in step.
 *
 * It's built like a pro broadcast drone (a glossy white crown, the referee's black-and-white
 * stripes round its middle, two ducted fans either side with navigation lights, an antenna
 * beacon) with a glass LED screen for a face and two small arms in white gloves to signal with.
 * Through a fight it:
 * - drops in from the rafters for the walk-outs and presents each robot as its lift arrives,
 * - counts 3-2-1 on its face, then chops the air for FIGHT! and backs off to watch,
 * - circles to the side of the action away from the camera, eyes on the exchange, flinching at
 *   big hits, throwing its hands up at finishers and torn-off parts, breaking up clinches,
 * - flies over to a robot that's down and counts it, the number on its face, its arm pumping
 *   with each count (in step with the HUD's count), and waves it on when the robot beats it,
 * - waves the fight off at a K.O. (K.O. on its face) and then raises the winner's hand with a
 *   happy spin, lit in the winner's colours.
 * Between fights it idles over the ring, blinking, glancing at the lens.
 *
 * One rigid-skinned mesh (nine bones: body, two fan pods, each arm's upper arm, forearm and
 * glove) in two draws: the body, whose stripes, crown, belly ring and LED face are all worked out
 * in its shader, and the fans' blur discs. The same drone flies in the Android app
 * (godot/render/referee/referee.gd).
 */

/** The hull ellipsoid's radii, the fan pods' centres, the shoulders (on the +X side, mirrored) and the arm bones' lengths. */
const HULL = new THREE.Vector3(0.235, 0.2, 0.225);
const POD = new THREE.Vector3(0.33, 0.035, -0.015);
const DUCT_R = 0.095;
/** What the arms keep clear of round each pod (its own frame): the rim's reach plus a little air, and the slab from under the rim to over the glow ring. */
const POD_R = DUCT_R + 0.037;
const POD_MID = 0.004;
const POD_HALF = 0.05;
const SHOULDER = new THREE.Vector3(0.175, -0.1, 0.085);
const UPPER = 0.12;
const FORE = 0.11;
/** Arm a's side: arm 0 on +X (the drone's left, the viewer's right when it faces you), arm 1 on -X. */
const SIDE = [1, -1];
const SCALE = 1.15;
/** How far from the centre it may fly (inside the ropes). */
const RING_R = 3.7;
/** Where it watches the fight from: this far out from between the robots. */
const WATCH_R = 2.7;
const BONES = 9;

/** Surfaces (the body shader's keys): hull, graphite, white, status glow, port and starboard lights, beacon, chrome, glossy white trim. */
const K_HULL = 0, K_GRAPHITE = 1, K_WHITE = 2, K_GLOW = 3, K_PORT = 4, K_STARBOARD = 5, K_BEACON = 6, K_CHROME = 7, K_HULL_WHITE = 8;

/** Face and status colours (linear, brightness included). */
const EYE_COL = new THREE.Color(0.85, 1.9, 2.7);
const IDLE_COL = new THREE.Color(0.9, 1.6, 2.2);
const COUNT_COL = new THREE.Color(2.8, 1.35, 0.25);
const WARN_COL = new THREE.Color(3.2, 0.35, 0.18);
const UP_COL = new THREE.Color(0.4, 2.8, 0.75);
const KO_COL = new THREE.Color(3.4, 0.2, 0.14);
const WIN_COL = new THREE.Color(2.9, 1.9, 0.45);
const COUNTDOWN_FACE = new THREE.Color(2.6, 2.4, 2.0);
const COUNTDOWN_STATUS = new THREE.Color(2, 2, 2);

/** The way an elbow bends: forward (and a little up), or up (a hand raised over the head). */
const FWD = new THREE.Vector3(0, 0.35, 1.0);
const UP = new THREE.Vector3(0, 1.0, 0.15);

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/** One arm's pose: where the upper arm points (body space), how far the elbow bends and which way, and what it's easing to. */
interface Arm {
  dir: THREE.Vector3;
  bend: number;
  hint: THREE.Vector3;
  wantDir: THREE.Vector3;
  wantBend: number;
  wantHint: THREE.Vector3;
  rate: number;
}

// ------------------------------------------------------------------ the mesh
/** Builds the mesh: vertices in their bone's own space, each tagged with its bone and surface. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  tag: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  vert(p: THREE.Vector3, n: THREE.Vector3, bone: number, key: number, u = 0, v = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.tag.push(bone, key);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  private at(i: number, out: THREE.Vector3) {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  /** A triangle facing the way its vertices' normals do (three's front faces wind anticlockwise). */
  tri(a: number, b: number, d: number) {
    const pa = this.at(a, new THREE.Vector3());
    const e1 = this.at(b, new THREE.Vector3()).sub(pa);
    const e2 = this.at(d, new THREE.Vector3()).sub(pa);
    let dot = 0;
    const c = e1.cross(e2);
    for (const k of [a, b, d]) dot += c.x * this.nor[k * 3] + c.y * this.nor[k * 3 + 1] + c.z * this.nor[k * 3 + 2];
    if (dot > 0) this.idx.push(a, b, d);
    else this.idx.push(a, d, b);
  }

  /** rows x cols quads; f(row, col) sets a position and normal. */
  grid(rows: number, cols: number, f: (r: number, k: number, p: THREE.Vector3, n: THREE.Vector3) => void, bone: number, key: number) {
    const base = this.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let r = 0; r <= rows; r++) {
      for (let k = 0; k <= cols; k++) {
        f(r, k, p, n);
        this.vert(p, n, bone, key);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const a = base + r * (cols + 1) + k;
        const d = a + cols + 1;
        this.tri(a, d, a + 1);
        this.tri(a + 1, d, d + 1);
      }
    }
  }

  ellipsoid(at: THREE.Vector3, radii: THREE.Vector3, bone: number, key: number, rows = 12, cols = 20) {
    this.grid(rows, cols, (r, k, p, n) => {
      const th = (Math.PI * r) / rows;
      const ph = (TAU * k) / cols;
      const ux = Math.sin(th) * Math.sin(ph), uy = Math.cos(th), uz = Math.sin(th) * Math.cos(ph);
      p.set(at.x + ux * radii.x, at.y + uy * radii.y, at.z + uz * radii.z);
      n.set(ux / radii.x, uy / radii.y, uz / radii.z).normalize();
    }, bone, key);
  }

  /** A ring round `axis` (a unit vector) through `at`; its section `small` across and `tall` along the axis (0: round). */
  torus(at: THREE.Vector3, axis: THREE.Vector3, big: number, small: number, bone: number, key: number, rows = 28, cols = 10, tall = 0) {
    const [bx, by, bz] = frame(axis);
    const h = tall <= 0 ? small : tall;
    const out = new THREE.Vector3();
    this.grid(rows, cols, (r, k, p, n) => {
      const a = (TAU * r) / rows;
      const t = (TAU * k) / cols;
      out.copy(bx).multiplyScalar(Math.cos(a)).addScaledVector(bz, Math.sin(a));
      n.copy(out).multiplyScalar(Math.cos(t) / small).addScaledVector(by, Math.sin(t) / h).normalize();
      p.copy(at).addScaledVector(out, big + Math.cos(t) * small).addScaledVector(by, Math.sin(t) * h);
    }, bone, key);
  }

  /** A rod with round ends from p to q. */
  capsule(p0: THREE.Vector3, q: THREE.Vector3, r: number, bone: number, key: number, cols = 12) {
    const [bx, by, bz] = frame(_v.subVectors(q, p0).normalize());
    const half = 4;
    this.grid(half * 2 + 1, cols, (row, k, p, n) => {
      // rows 0..half: the cap at q; half+1..: the cap at p (the band between is the rod)
      const top = row <= half;
      const th = (Math.PI * 0.5 * (top ? row : row - 1)) / half;
      const ph = (TAU * k) / cols;
      n.copy(by).multiplyScalar(Math.cos(th))
        .addScaledVector(bx, Math.sin(ph) * Math.sin(th))
        .addScaledVector(bz, Math.cos(ph) * Math.sin(th));
      p.copy(top ? q : p0).addScaledVector(n, r);
    }, bone, key);
  }

  /** A flat disc facing up (the fans' blur), UV -1..1 across it. */
  disc(at: THREE.Vector3, r: number, bone: number, key: number, segs = 24) {
    const up = new THREE.Vector3(0, 1, 0);
    const mid = this.vert(at, up, bone, key);
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    for (let k = 0; k <= segs; k++) {
      const a = (TAU * k) / segs;
      this.vert(p.set(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r), up, bone, key, Math.cos(a), Math.sin(a));
    }
    for (let k = 0; k < segs; k++) this.tri(mid, base + k, base + k + 1);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('refTag', new THREE.Float32BufferAttribute(this.tag, 2));
    g.setAttribute('refUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    // the bones carry it: keep it drawn wherever they put the parts
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, -0.8, -0.8), new THREE.Vector3(0.8, 0.8, 0.8));
    return g;
  }
}

/** An orthonormal frame with `axis` as its Y. */
function frame(axis: THREE.Vector3): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const y = axis.clone().normalize();
  const x = Math.abs(y.z) < 0.9 ? new THREE.Vector3(0, 0, -1).cross(y) : new THREE.Vector3(1, 0, 0).cross(y);
  x.normalize();
  return [x, y, x.clone().cross(y)];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ONE = (k: number) => new THREE.Vector3(k, k, k);

/** The drone, part by part, each in its bone's space. */
function build(b: Builder, f: Builder) {
  // the hull: crown, stripes, face and belly are all the shader's
  b.ellipsoid(V(0, 0, 0), HULL, 0, K_HULL, 26, 44);
  // the antenna and its beacon, raked back
  b.capsule(V(0, 0.185, -0.07), V(0, 0.275, -0.1), 0.0055, 0, K_GRAPHITE, 8);
  b.ellipsoid(V(0, 0.282, -0.102), ONE(0.012), 0, K_BEACON, 6, 8);
  // a sensor dome under the belly
  b.ellipsoid(V(0, -0.198, 0.03), V(0.035, 0.02, 0.035), 0, K_CHROME, 6, 12);
  const up = V(0, 1, 0);
  for (let a = 0; a < 2; a++) {
    const s = SIDE[a];
    const pod = 1 + a;
    // the strut out to the fan
    b.capsule(V(s * 0.19, 0.03, -0.015), V(s * (POD.x - DUCT_R - 0.01), POD.y, POD.z), 0.017, 0, K_GRAPHITE);
    // the duct (pod space: centred on the fan), its glowing lip, hub, spokes and nav light
    b.torus(V(0, 0, 0), up, DUCT_R, 0.024, pod, K_GRAPHITE, 32, 12, 0.042);
    b.torus(V(0, 0.04, 0), up, DUCT_R + 0.002, 0.007, pod, K_GLOW, 32, 6);
    b.torus(V(0, -0.026, 0), up, DUCT_R + 0.017, 0.012, pod, K_HULL_WHITE, 32, 8);
    b.ellipsoid(V(0, -0.006, 0), V(0.024, 0.02, 0.024), pod, K_CHROME, 6, 10);
    for (let k = 0; k < 3; k++) {
      const ang = (TAU * k) / 3 + 0.4;
      const ox = Math.cos(ang), oz = Math.sin(ang);
      b.capsule(V(ox * 0.02, -0.012, oz * 0.02), V(ox * (DUCT_R - 0.02), -0.012, oz * (DUCT_R - 0.02)), 0.005, pod, K_GRAPHITE, 6);
    }
    b.ellipsoid(V(s * (DUCT_R + 0.03), -0.026, 0), ONE(0.013), pod, s > 0 ? K_PORT : K_STARBOARD, 6, 8);
    f.disc(V(0, 0.004, 0), DUCT_R - 0.008, pod, 0);
    // the shoulder socket
    b.ellipsoid(V(s * SHOULDER.x, SHOULDER.y, SHOULDER.z), ONE(0.032), 0, K_GRAPHITE, 8, 12);
    // the arm: upper arm and elbow, forearm and cuff, then the glove (mitten and thumb)
    const ub = 3 + a * 3;
    b.capsule(V(0, 0, 0), V(0, -UPPER, 0), 0.02, ub, K_WHITE);
    b.ellipsoid(V(0, -UPPER, 0), ONE(0.024), ub, K_GRAPHITE, 8, 12);
    b.capsule(V(0, 0, 0), V(0, -FORE + 0.01, 0), 0.0185, ub + 1, K_WHITE);
    b.torus(V(0, -FORE + 0.012, 0), up, 0.021, 0.008, ub + 1, K_GRAPHITE, 16, 6);
    b.ellipsoid(V(0, -0.032, 0.002), V(0.033, 0.04, 0.026), ub + 2, K_WHITE, 10, 14);
    b.ellipsoid(V(-s * 0.026, -0.018, 0.012), V(0.011, 0.019, 0.011), ub + 2, K_WHITE, 6, 8);
  }
}

// ------------------------------------------------------------------ the shaders
/** Nine rigid bones; every vertex carries its bone in refTag.x and its surface in refTag.y. */
const BONES_VS = /* glsl */ `
uniform mat4 uRefBones[${BONES}];
attribute vec2 refTag;
attribute vec2 refUv;
varying vec3 vRefRest;
varying float vRefKey;
varying vec2 vRefUv;
varying float vRefSide;
`;
const BEGIN_VS = /* glsl */ `
int refB = int(refTag.x + 0.5);
vRefRest = position;
vRefKey = refTag.y;
vRefUv = refUv;
vRefSide = refB == 1 ? 1.0 : -1.0;
vec3 transformed = (uRefBones[refB] * vec4(position, 1.0)).xyz;
`;

function patchBones(sh: { vertexShader: string }, normals: boolean) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${BONES_VS}`).replace('#include <begin_vertex>', BEGIN_VS);
  if (normals) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = mat3(uRefBones[int(refTag.x + 0.5)]) * normal;');
}

/**
 * The hull's look, from where on it a pixel is: a glossy white crown, the referee's black-and-
 * white stripes round its middle, a graphite belly with the status ring, and in front a glass LED
 * screen that is its face (eyes, the count, K.O.). Then the trim, lights, gloves and chrome.
 */
const BODY_FS = /* glsl */ `
uniform vec4 uEyes;      // open, glad (^ ^), wide, stern
uniform vec2 uGaze;      // where the eyes look, -1..1 across and up the screen
uniform int uFaceMode;   // 0 eyes, 1 a number, 2 K.O.
uniform int uFaceNum;
uniform vec3 uFaceCol;
uniform vec3 uStatus;
uniform float uRefTime;
uniform float uSoftGlow;
varying vec3 vRefRest;
varying float vRefKey;

const vec3 REF_HULL = vec3(${HULL.x}, ${HULL.y}, ${HULL.z});
// the screen on the hull, in radians round it (half width, half height), its centre's height and corner radius
const vec2 REF_SCREEN = vec2(0.64, 0.34);
const float REF_SCREEN_Y = 0.03;
const float REF_SCREEN_R = 0.2;
// LED pitch on the face, in face units (the screen is 2 tall)
const float REF_PITCH = 0.1;
// seven-segment digits, bit 0 = top (a) round to bit 6 = middle (g)
const int REF_SEG[10] = int[](63, 6, 91, 79, 102, 109, 125, 7, 127, 111);

float refRbox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float refSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// one eye, centred on p = 0; s is the side (+1 on the viewer's right)
float refEye(vec2 p, float s) {
  float wide = uEyes.z;
  vec2 hs = vec2(0.24 + 0.07 * wide, max(0.05, 0.46 * uEyes.x * (1.0 + 0.14 * wide)));
  float d = refRbox(p, hs, min(hs.x, hs.y) * 0.98);
  // glad: an upturned arc
  float arc = max(abs(length(p - vec2(0.0, -0.1)) - 0.25) - 0.1, -(p.y + 0.16));
  d = mix(d, arc, uEyes.y);
  // stern: the top cut down towards the nose
  float brow = p.y - (hs.y * 0.5 + 0.8 * s * p.x) - (1.0 - uEyes.w) * 2.0;
  return max(d, brow);
}

float refDigit(vec2 p, int n) {
  int m = REF_SEG[clamp(n, 0, 9)];
  const float W = 0.3;
  const float H = 0.64;
  float d = 1e3;
  if ((m & 1) != 0) d = min(d, refSeg(p, vec2(-W, H), vec2(W, H)));
  if ((m & 2) != 0) d = min(d, refSeg(p, vec2(W, H), vec2(W, 0.0)));
  if ((m & 4) != 0) d = min(d, refSeg(p, vec2(W, 0.0), vec2(W, -H)));
  if ((m & 8) != 0) d = min(d, refSeg(p, vec2(-W, -H), vec2(W, -H)));
  if ((m & 16) != 0) d = min(d, refSeg(p, vec2(-W, 0.0), vec2(-W, -H)));
  if ((m & 32) != 0) d = min(d, refSeg(p, vec2(-W, H), vec2(-W, 0.0)));
  if ((m & 64) != 0) d = min(d, refSeg(p, vec2(-W, 0.0), vec2(W, 0.0)));
  return d - 0.1;
}

// what the screen shows lit, as a distance (negative inside), in face units
float refFace(vec2 f) {
  if (uFaceMode == 0) {
    vec2 g = uGaze * vec2(0.34, 0.22);
    return min(refEye(f - vec2(0.6, 0.04) - g, 1.0), refEye(f - vec2(-0.6, 0.04) - g, -1.0));
  }
  if (uFaceMode == 1) {
    if (uFaceNum >= 10) return min(refDigit(f - vec2(-0.48, 0.0), 1), refDigit(f - vec2(0.48, 0.0), 0));
    return refDigit(f, uFaceNum);
  }
  if (uFaceMode == 2) {
    vec2 k = f + vec2(0.58, 0.0);
    float d = refSeg(k, vec2(-0.3, 0.66), vec2(-0.3, -0.66));
    d = min(d, refSeg(k, vec2(-0.22, -0.02), vec2(0.32, 0.66)));
    d = min(d, refSeg(k, vec2(-0.08, 0.16), vec2(0.34, -0.66)));
    vec2 o = f - vec2(0.56, 0.0);
    d = min(d, abs(refRbox(o, vec2(0.34, 0.66), 0.3)));
    return d - 0.1;
  }
  return 1e3;
}

void refSurface(inout vec3 alb, inout float met, inout float rgh, inout vec3 emi) {
  int key = int(vRefKey + 0.5);
  alb = vec3(0.86);
  met = 0.0;
  rgh = 0.3;
  emi = vec3(0.0);
  if (key == 0) {
    vec3 n = vRefRest / REF_HULL;
    float u = atan(n.x, n.z);
    float v = asin(clamp(n.y, -1.0, 1.0));
    vec2 q = vec2(u, v - REF_SCREEN_Y);
    float sd = refRbox(q, REF_SCREEN, REF_SCREEN_R);
    float aa = max(fwidth(sd), 1e-4);
    if (sd < 0.045) {
      // the face: dark glass with an LED dot matrix behind it, in a chrome bezel
      vec2 f = q / REF_SCREEN.y;
      vec2 cell = (floor(f / REF_PITCH) + 0.5) * REF_PITCH;
      float px = max(fwidth(f.x), 1e-4);
      float litDot = smoothstep(0.04, -0.04, refFace(cell));
      float dotK = smoothstep(0.4 * REF_PITCH + px, 0.4 * REF_PITCH - px, length(f - cell));
      // far off the dots are under a pixel: show the shape they make, at their average glow
      float litFar = smoothstep(px, -px, refFace(f)) * 0.55;
      float near = smoothstep(2.0, 4.5, REF_PITCH / px);
      float lit = mix(litFar, litDot * dotK, near);
      float off = mix(0.012, 0.03 * dotK, near);
      float glass = smoothstep(aa, -aa, sd);
      alb = mix(vec3(0.72), vec3(0.008, 0.01, 0.014), glass);
      met = mix(1.0, 0.0, glass);
      rgh = mix(0.16, 0.04, glass);
      // (the glass edge darkens a touch, as if the screen sat back in the hull)
      float edge = smoothstep(-0.07, 0.0, sd);
      emi = uFaceCol * (lit + off) * glass * (1.0 - edge * 0.6);
    } else if (n.y < -0.48) {
      // graphite belly and its status ring
      alb = vec3(0.035, 0.037, 0.042);
      met = 0.55;
      rgh = 0.38;
      float lat = asin(clamp(n.y, -1.0, 1.0));
      float rw = max(fwidth(lat), 1e-4);
      float ring = smoothstep(rw, -rw, abs(lat + 0.98) - 0.035);
      emi = uStatus * ring * 0.8;
      alb *= 1.0 - ring;
      float trim = smoothstep(0.01, 0.0, abs(n.y + 0.49) - 0.012);
      alb = mix(alb, vec3(0.75), trim);
      met = mix(met, 1.0, trim);
    } else if (n.y > 0.6) {
      // the glossy white crown
      alb = vec3(0.88);
      rgh = 0.2;
      float trim = smoothstep(0.01, 0.0, abs(n.y - 0.61) - 0.012);
      alb = mix(alb, vec3(0.75), trim);
      met = trim;
      rgh = mix(rgh, 0.15, trim);
    } else {
      // the referee's shirt: black and white stripes
      float s = u / (2.0 * PI) * 16.0;
      float w = max(fwidth(s), 1e-4);
      float black = smoothstep(-w, w, abs(fract(s) - 0.5) - 0.25);
      alb = mix(vec3(0.86), vec3(0.025), black);
      rgh = mix(0.24, 0.42, black);
    }
  } else if (key == 1) {
    // graphite: ducts, joints, struts
    alb = vec3(0.045, 0.048, 0.055);
    met = 0.6;
    rgh = 0.34;
  } else if (key == 2) {
    // white gloves and arms
    alb = vec3(0.9);
    rgh = 0.42;
  } else if (key == 3) {
    alb = vec3(0.0);
    emi = uStatus;
  } else if (key == 4 || key == 5) {
    // navigation lights, red to port and green to starboard, with a double flash
    float t = fract(uRefTime * 0.8 + (key == 4 ? 0.0 : 0.5));
    float flash = (t < 0.06 || (t > 0.14 && t < 0.2)) ? 1.0 : 0.22;
    alb = vec3(0.0);
    emi = (key == 4 ? vec3(3.0, 0.12, 0.08) : vec3(0.15, 3.0, 0.4)) * flash;
  } else if (key == 6) {
    // the beacon on the antenna
    float t = fract(uRefTime * 0.55);
    alb = vec3(0.0);
    emi = vec3(2.6, 2.4, 2.1) * (t < 0.05 ? 1.6 : 0.18);
  } else if (key == 7) {
    // chrome
    alb = vec3(0.8);
    met = 1.0;
    rgh = 0.14;
  } else {
    // glossy white trim
    alb = vec3(0.88);
    rgh = 0.2;
  }
  // without bloom, bright lights are kept to readable colours instead of glowing
  float pk = max(max(emi.r, emi.g), emi.b);
  if (uSoftGlow > 0.5 && pk > 1.0) emi *= (1.0 + (pk - 1.0) * 0.12) / pk;
}
`;

/** The fans: a disc in each duct, drawn as the blur of a spinning two-blade prop, with the slow strobing turn a camera's shutter gives it. */
const ROTOR_FS = /* glsl */ `
uniform float uRefTime;
varying vec2 vRefUv;
varying float vRefSide;
`;
const ROTOR_ALPHA = /* glsl */ `
{
  float r = length(vRefUv);
  float a = atan(vRefUv.y, vRefUv.x) - uRefTime * 2.3 * vRefSide;
  float blade = pow(abs(cos(a)), 10.0);
  float ghost = pow(abs(cos(a + 0.5 * vRefSide)), 6.0) * 0.4;
  float disc = smoothstep(1.0, 0.94, r) * smoothstep(0.16, 0.24, r);
  float tip = smoothstep(0.08, 0.0, abs(r - 0.93)) * 0.25;
  diffuseColor.a = clamp((0.07 + 0.3 * max(blade, ghost)) * disc + tip, 0.0, 1.0) * 0.8;
}
`;

// ------------------------------------------------------------------ the referee
export class Referee {
  readonly group = new THREE.Group();
  private rig = new THREE.Group();
  private bones = Array.from({ length: BONES }, () => new THREE.Matrix4());
  private u = {
    uRefBones: { value: this.bones },
    uEyes: { value: new THREE.Vector4(1, 0, 0, 0) },
    uGaze: { value: new THREE.Vector2() },
    uFaceMode: { value: 0 },
    uFaceNum: { value: 0 },
    uFaceCol: { value: new THREE.Color().copy(EYE_COL) },
    uStatus: { value: new THREE.Color().copy(IDLE_COL) },
    uRefTime: { value: 0 },
    uSoftGlow: { value: 0 },
  };
  private arms: Arm[] = [0, 1].map(() => ({
    dir: V(0.3, -1, 0.3).normalize(),
    bend: 1,
    hint: FWD.clone(),
    wantDir: V(0.3, -1, 0.3).normalize(),
    wantBend: 1,
    wantHint: FWD.clone(),
    rate: 7,
  }));
  /** The drone's own ten count, fed the same events as the HUD's. */
  private count = new RefCount();
  private match: Match | null = null;

  /** Where it is and how it's moving (world), the way it faces, and its lean. */
  private pos = V(0, 2.2, 0);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  /** What's left of a celebratory turn (radians). */
  private spin = 0;
  /** Squash and stretch (+ taller), and its spring's speed. */
  private squash = 0;
  private squashV = 0;
  private podTilt = [0, 0];
  private t = 0;
  /** The drone's frame (world from body), and back. */
  private world = new THREE.Matrix4();
  private inv = new THREE.Matrix4();
  private campos = new THREE.Vector3();

  // the face
  private eyes = new THREE.Vector4(1, 0, 0, 0);
  private gaze = new THREE.Vector2();
  private faceCol = EYE_COL.clone();
  private status = IDLE_COL.clone();
  private blinkIn = 2;
  private blinkT = -1;
  /** A quick glance somewhere (a dodge): seconds left, and where. */
  private dart = 0;
  private dartTo = new THREE.Vector2();
  private idleLook = new THREE.Vector3();
  private idleLookIn = 3;

  // the fight, as its events told it
  private accent = [new THREE.Color(0.2, 0.8, 1), new THREE.Color(1, 0.4, 0.1)];
  /** Which side of the robots it watches from (+1 / -1 across their line), and its angle round them. */
  private side = 1;
  private az = 0;
  private azOk = false;
  /** A gesture over everything else: its name, seconds into it, its length. */
  private act = '';
  private actT = 0;
  private actLen = 0;
  /** Eyes wide after a big hit nearby, seconds left; and that hit's spot. */
  private wide = 0;
  private hitAt = new THREE.Vector3();
  private hitLook = 0;
  private clinch = false;
  private clinchT = 0;
  /** The countdown number on its face, and seconds since it last changed. */
  private cdN = -1;
  private cdT = 9;
  /** The ten count: the number it last called, seconds since, and how long the robot's been up. */
  private countN = -1;
  private countT = 9;
  private upT = -1;
  /** Seconds since the fight was stopped (K.O. or the final bell), -1 before; and its result. */
  private koT = -1;
  private winner = -1;
  private loser = -1;
  private decision = false;
  private wonSpun = false;

  // what stopped() worked out for the end of the fight
  private ko = {
    target: new THREE.Vector3(),
    look: new THREE.Vector3(),
    lam: 2.3,
    eyes: new THREE.Vector4(1, 0, 0, 0),
    face: 0,
    col: EYE_COL.clone(),
    status: IDLE_COL.clone(),
  };

  constructor() {
    this.group.name = 'referee';
    const body = new Builder();
    const fans = new Builder();
    build(body, fans);
    const u = this.u;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
    bodyMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      patchBones(sh, true);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${BODY_FS}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nrefSurface(diffuseColor.rgb, metalnessFactor, roughnessFactor, totalEmissiveRadiance);');
    };
    bodyMat.customProgramCacheKey = () => 'referee-body';
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      patchBones(sh, false);
    };
    depthMat.customProgramCacheKey = () => 'referee-depth';
    const hull = new THREE.Mesh(body.geometry(), bodyMat);
    hull.customDepthMaterial = depthMat;
    hull.castShadow = true;

    const rotorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.68, 0.74), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    rotorMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      patchBones(sh, false);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${ROTOR_FS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${ROTOR_ALPHA}`);
    };
    rotorMat.customProgramCacheKey = () => 'referee-rotor';
    const rotors = new THREE.Mesh(fans.geometry(), rotorMat);

    for (const o of [hull, rotors]) {
      o.frustumCulled = false; // its bones move the parts far from the base geometry
      this.rig.add(o);
    }
    this.rig.scale.setScalar(SCALE);
    this.group.add(this.rig);
    this.poseBones();
  }

  // ---------------------------------------------------------------- the fight
  /** A new fight: it drops in from the rafters for the walk-outs. */
  private start(m: Match) {
    this.match = m;
    for (let i = 0; i < 2; i++) this.accent[i].setHex(m.specs[i].paint.accent);
    this.pos.set(0, 7.5, 0);
    this.vel.set(0, 0, 0);
    this.azOk = false;
    this.act = '';
    this.wide = 0;
    this.clinch = false;
    this.cdN = -1;
    this.countN = -1;
    this.countT = 9;
    this.upT = -1;
    this.koT = -1;
    this.winner = -1;
    this.loser = -1;
    this.decision = false;
    this.wonSpun = false;
    this.spin = 0;
    this.count.begin(m);
    // (a replay joined mid-fight: past the knockout already)
    if (m.phase === 'ko' || m.phase === 'end') {
      this.koT = 3;
      this.winner = m.winner ? m.winner.index : -1;
      this.loser = this.winner < 0 ? -1 : 1 - this.winner;
      this.decision = m.result === 'Decision' || m.result === 'Draw';
      this.pos.set(0, 2.4, 0);
    }
  }

  /** The fight's gone from the screen: back to idling over the ring. */
  private stop() {
    this.match = null;
    this.act = '';
    this.koT = -1;
    this.countN = -1;
    this.count.end();
  }

  /**
   * A match event: what it reacts to. `quiet` steps (a seek, an online catch-up) only keep its
   * count and the result straight.
   */
  event(type: string, data: any, m: Match, quiet = false) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (m !== this.match) return;
    switch (type) {
      case 'knockdown':
        this.count.knockdown(m, (data as HitInfo).defender);
        break;
      case 'ko':
      case 'decision':
        this.count.end();
        this.koT = 0;
        this.winner = data.winner ? data.winner.index : -1;
        this.loser = type === 'ko' ? data.loser.index : this.winner < 0 ? -1 : 1 - this.winner;
        this.decision = type === 'decision';
        this.act = '';
        return;
    }
    if (quiet) return;
    switch (type) {
      case 'fightStart':
        this.gesture('chop', 1.0);
        break;
      case 'fistBump':
        this.gesture('clap', 0.8);
        break;
      case 'hit': {
        const h = data as HitInfo;
        if (h.shielded || h.blocked) return;
        if (h.damage >= 32 || h.crit || h.knockdown) this.flinch(h.point, Math.min(1, 0.35 + h.damage / 90 + (h.crit ? 0.3 : 0)));
        else if (h.damage >= 12) {
          this.hitAt.copy(h.point);
          this.hitLook = 0.5;
        }
        break;
      }
      case 'knockdown':
        this.gesture('whoa', 0.7);
        break;
      case 'stagger':
      case 'getupFail':
        this.gesture('wince', 0.7);
        break;
      case 'detach':
        this.gesture('whoa', 1.3);
        this.wide = 1.2;
        this.squashV -= 2;
        break;
      case 'dodge':
        this.dart = 0.35;
        this.dartTo.set(rand(-1, 1), rand(-0.3, 0.4));
        break;
      case 'clinch':
        this.clinch = true;
        this.clinchT = 0;
        break;
      case 'clinchBreak':
        this.clinch = false;
        break;
      case 'finisher':
        this.gesture('whoa', 1.8);
        this.wide = 1.8;
        break;
      case 'finisherBlow':
        this.flinch(data.point, 1);
        break;
    }
  }

  private gesture(name: string, length: number) {
    // a quick wince doesn't cut short a bigger signal
    if (this.act && this.actT < this.actLen && (name === 'wince' || name === 'clap') && this.act !== 'wince' && this.act !== 'clap') return;
    this.act = name;
    this.actT = 0;
    this.actLen = length;
  }

  /** A big blow near it: it jumps back from it, eyes wide. */
  private flinch(at: THREE.Vector3, k: number) {
    this.hitAt.copy(at);
    this.hitLook = 0.8;
    this.wide = Math.max(this.wide, 0.4 + k * 0.4);
    this.squashV -= 3 * k;
    const away = _v.subVectors(this.pos, at);
    const d = away.length();
    if (d < 3.5 && d > 1e-3) this.vel.addScaledVector(away.divideScalar(d).add(_w.set(0, 0.4, 0)), 1.8 * k * (1 - d / 3.5));
    if (k > 0.7) this.gesture('whoa', 0.6);
  }

  // ---------------------------------------------------------------- the frame
  /**
   * Fly, look, signal. `dt` runs with the fight (its slow motion and the player's speed); `m` is
   * the match on screen (null between fights) and `models` its robots as posed this frame.
   */
  update(dt: number, camera: THREE.Camera, m: Match | null, models: readonly BotModel[]) {
    if (!this.group.visible) return;
    if (m !== this.match) {
      if (m) this.start(m);
      else this.stop();
    }
    dt = clamp(dt, 0, 0.05);
    this.t += dt;
    this.u.uRefTime.value = this.t;
    this.u.uSoftGlow.value = RenderSettings.bloom ? 0 : 1;
    const campos = this.campos.copy(camera.position);
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    let lam = 2.3;
    const eyes = new THREE.Vector4(1, 0, 0, 0);
    let face = 0;
    let num = 0;
    const fcol = EYE_COL.clone();
    const status = IDLE_COL.clone();
    for (let a = 0; a < 2; a++) this.rest(a);
    this.actT += dt;
    if (this.act && this.actT >= this.actLen) this.act = '';
    this.wide = Math.max(0, this.wide - dt);
    this.hitLook = Math.max(0, this.hitLook - dt);
    this.dart = Math.max(0, this.dart - dt);
    this.cdT += dt;
    this.countT += dt;
    if (this.clinch) this.clinchT += dt;
    if (m) this.count.update(m);

    const fight = !!m && models.length === 2;
    if (!fight) {
      // idling over the ring between fights: drifting, glancing round, now and then at the lens
      target.set(Math.sin(this.t * 0.21) * 0.7, 2.05 + Math.sin(this.t * 0.37) * 0.15, Math.cos(this.t * 0.17) * 0.55);
      this.idleLookIn -= dt;
      if (this.idleLookIn <= 0) {
        this.idleLookIn = rand(2.5, 5);
        if (Math.random() < 0.5) this.idleLook.copy(campos);
        else this.idleLook.set(rand(-6, 6), rand(0.5, 4), rand(-6, 6));
      }
      look.copy(this.idleLook.lengthSq() > 0 ? this.idleLook : campos);
      lam = 1.2;
    } else {
      const p0 = joint(models, 0, J.Pelvis);
      const p1 = joint(models, 1, J.Pelvis);
      const h0 = joint(models, 0, J.Head);
      const h1 = joint(models, 1, J.Head);
      const top = Math.max(h0.y, h1.y);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      mid.y = 0;
      const ax = new THREE.Vector2(p1.x - p0.x, p1.z - p0.z);
      if (ax.length() > 0.05) ax.normalize();
      else ax.set(1, 0);
      const perp = new THREE.Vector2(-ax.y, ax.x);
      const cd = new THREE.Vector2(campos.x - mid.x, campos.z - mid.z);
      if (cd.length() > 0.05) cd.normalize();
      else cd.set(0, 1);
      const phase = m!.phase;
      const watch = h0.clone().add(h1).multiplyScalar(0.5);
      look.copy(watch);
      if (this.koT >= 0) this.koT += dt;
      if (phase === 'intro') {
        // presenting each robot as it rides up out of its corner
        const i = m!.presenting;
        target.set(-cd.x * 0.9, Math.max(2.6, top + 0.6), -cd.y * 0.9);
        lam = 1.6;
        if (i >= 0 && i < 2) {
          const hx = hatchXZ(i);
          const te = m!.phaseTime - i * PRESENT;
          if (te > ENTRY.arrive - 0.3) look.copy(joint(models, i, J.Head));
          else look.set(hx[0], 0.3, hx[1]);
          if (te > ENTRY.arrive - 0.15) {
            this.point(this.nearArm(look), _w.copy(look).add(_v.set(0, 0.5, 0)), 0.2, 9);
            if (te < ENTRY.arrive + 1.4) eyes.set(1, 1, 0, 0);
          }
        }
      } else if (phase === 'countdown') {
        // 3, 2, 1 on its face, to the camera, a finger raised with each
        const n = COUNTDOWN - Math.floor(m!.phaseTime);
        if (n !== this.cdN) {
          this.cdN = n;
          this.cdT = 0;
          this.squashV += 1.2;
        }
        if (n >= 1) {
          face = 1;
          num = n;
        }
        // (back past the robots, so the screen's big numbers don't hide it)
        target.set(mid.x - cd.x * 1.5, Math.max(2.55, top + 0.6), mid.z - cd.y * 1.5);
        look.copy(campos);
        // (the arm jumps up with each number and settles)
        this.raise(0, 14, 0.25, 0.85 - 0.5 * (1 - smooth(0, 0.3, this.cdT)));
        fcol.copy(COUNTDOWN_FACE);
        status.copy(COUNTDOWN_STATUS);
      } else {
        // the fight (and the greet before it): watching from the side away from the lens
        if (perp.dot(cd) * this.side > 0.2) this.side = -this.side;
        const wantAz = Math.atan2(perp.y * this.side, perp.x * this.side) + Math.sin(this.t * 0.19) * 0.35;
        const curAz = Math.atan2(this.pos.z - mid.z, this.pos.x - mid.x);
        if (!this.azOk) {
          this.az = curAz;
          this.azOk = true;
        }
        this.az += clamp(wrap(wantAz - this.az), -1.5 * dt, 1.5 * dt);
        let r = WATCH_R;
        let h = Math.max(2.35, top + 0.4);
        if (this.clinch && this.clinchT > 0.6) {
          // in close to break them up
          r = 1.9;
          h = Math.max(2.15, top + 0.2);
        }
        if (this.act === 'whoa') {
          r += 0.6;
          h += 0.3;
        }
        target.set(mid.x + Math.cos(this.az) * r, h, mid.z + Math.sin(this.az) * r);
        if (phase === 'greet' && this.act === 'chop') target.set(mid.x - cd.x * 0.6, Math.max(2.45, top + 0.45), mid.z - cd.y * 0.6);
        if (this.hitLook > 0) look.copy(this.hitAt);
        const c = this.count.cur;
        if (this.koT < 0 && c) {
          // a robot's down: over to it, and count
          const i = c.f.index;
          const pd = joint(models, i, J.Pelvis);
          const po = joint(models, 1 - i, J.Pelvis);
          const away = new THREE.Vector2(pd.x - po.x, pd.z - po.z);
          if (away.length() > 0.05) away.normalize();
          else away.copy(ax);
          const across = new THREE.Vector2(-away.y, away.x);
          if (across.dot(cd) > 0) across.negate();
          const dir = away.multiplyScalar(0.45).add(across).normalize();
          target.set(pd.x + dir.x * 1.35, 1.55, pd.z + dir.y * 1.35);
          look.copy(joint(models, i, J.Head));
          lam = 3.2;
          if (!c.upAt) {
            const cn = c.n;
            if (cn !== this.countN) {
              this.countN = cn;
              this.countT = 0;
              this.squashV += 0.8;
            }
            this.upT = -1;
            if (cn >= 1) {
              face = 1;
              num = cn;
            } else eyes.set(1, 0, 0.6, 0.4);
            fcol.copy(cn >= 8 ? WARN_COL : COUNT_COL);
            status.copy(fcol);
            const a = this.nearArm(look);
            if (this.countT < 0.14) this.raise(a, 20, 0.35, 0.6);
            else this.point(a, look, 0.15, 16);
            this.pose(1 - a, _v.set(SIDE[1 - a] * 0.75, -0.55, -0.2), 1.7, 6);
          } else {
            // it beat the count: glad, green, and the wave to fight on
            if (this.upT < 0) this.upT = 0;
            this.upT += dt;
            eyes.set(1, 1, 0, 0);
            fcol.copy(UP_COL);
            status.copy(UP_COL);
            for (let a = 0; a < 2; a++) {
              const s = SIDE[a];
              if (this.upT < 0.35) this.pose(a, _v.set(-s * 0.45, -0.15, 0.9), 0.15, 16);
              else this.pose(a, _v.set(s, 0.05, 0.3), 0.1, 10);
            }
          }
        } else this.countN = -1;
      }
      if (this.koT >= 0) {
        this.stopped(models, mid, cd, top);
        const k = this.ko;
        target.copy(k.target);
        look.copy(k.look);
        lam = k.lam;
        eyes.copy(k.eyes);
        face = k.face;
        fcol.copy(k.col);
        status.copy(k.status);
      }
      // the gestures over the top
      if (this.act && this.koT < 0) {
        const k = this.actT / this.actLen;
        switch (this.act) {
          case 'chop':
            // FIGHT!: the arm high, then down between them
            if (this.actT < 0.3) this.raise(0, 14);
            else this.pose(0, _v.set(0, -0.35, 1), 0, 22);
            eyes.set(1, 0, 0, 1);
            look.copy(watch);
            break;
          case 'clap': {
            const clap = 0.12 + 0.12 * Math.cos(this.actT * 18);
            for (let a = 0; a < 2; a++) this.pose(a, _v.set(-SIDE[a] * clap, -0.35, 0.95), 0.35, 20);
            eyes.set(1, 1, 0, 0);
            break;
          }
          case 'whoa':
            for (let a = 0; a < 2; a++) this.pose(a, _v.set(SIDE[a] * 0.85, 0.1, 0.45), 1.25, 14, UP);
            eyes.set(1, 0, 1, 0);
            break;
          case 'wince':
            eyes.set(0.4 + 0.3 * k, 0, 0, 0.5);
            break;
        }
      }
      if (this.clinch && this.clinchT > 0.6 && this.koT < 0 && !this.act) {
        // break it up: both hands pushing between them
        for (let a = 0; a < 2; a++) this.pose(a, _v.set(SIDE[a] * 0.3, -0.15, 1), 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 9)), 10);
        eyes.set(1, 0, 0, 1);
      }
      if (this.wide > 0 && face === 0) {
        eyes.z = Math.max(eyes.z, Math.min(1, this.wide * 2.5));
        eyes.y = 0;
      }
      // clear of both robots, and inside the ropes
      for (let j = 0; j < 2; j++) {
        const c = joint(models, j, J.Chest);
        const dx = new THREE.Vector2(target.x - c.x, target.z - c.z);
        if (dx.length() < 1.15 && target.y < top + 0.3) {
          if (dx.length() > 0.01) dx.normalize();
          else dx.copy(perp);
          target.x = c.x + dx.x * 1.15;
          target.z = c.z + dx.y * 1.15;
        }
      }
    }
    const hr = Math.hypot(target.x, target.z);
    if (hr > RING_R) {
      target.x *= RING_R / hr;
      target.z *= RING_R / hr;
    }

    // fly there, a damped spring with a top speed
    const acc = target.clone().sub(this.pos).multiplyScalar(lam * lam).addScaledVector(this.vel, -2 * lam);
    this.vel.addScaledVector(acc, dt);
    const sp = this.vel.length();
    if (sp > 4.5) this.vel.multiplyScalar(4.5 / sp);
    this.pos.addScaledVector(this.vel, dt);
    // keep off the lens
    const off = _v.subVectors(this.pos, campos);
    const dcam = off.length();
    if (dcam < 1.5 && dcam > 1e-3) this.pos.addScaledVector(off, ((1.5 - dcam) / dcam) * Math.min(1, dt * 8));

    // face what it watches, leaning into its moves
    const to = _v.subVectors(look, this.pos);
    const wantYaw = Math.atan2(to.x, to.z);
    this.yaw += wrap(wantYaw - this.yaw) * Math.min(1, dt * 4.5);
    if (this.spin > 0) {
      const s = Math.min(this.spin, dt * 7.5);
      this.yaw += s;
      this.spin -= s;
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const af = acc.x * fx + acc.z * fz;
    const ar = acc.x * fz - acc.z * fx;
    const lk = Math.min(1, dt * 6);
    this.pitch += (clamp(af * 0.045, -0.4, 0.4) + Math.sin(this.t * 0.9) * 0.03 - this.pitch) * lk;
    this.roll += (clamp(-ar * 0.045, -0.4, 0.4) + Math.sin(this.t * 1.3 + 1) * 0.03 - this.roll) * lk;
    const vf = this.vel.x * fx + this.vel.z * fz;
    for (let a = 0; a < 2; a++) {
      const tilt = clamp(vf * 0.22, -0.45, 0.45) + Math.sin(this.t * 2.1 + a * 1.7) * 0.05;
      this.podTilt[a] += (tilt - this.podTilt[a]) * Math.min(1, dt * 5);
    }
    this.squashV += (-this.squash * 140 - this.squashV * 9) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.25, 0.25);
    const rig = this.rig;
    rig.position.set(this.pos.x, this.pos.y + Math.sin(this.t * 1.7) * 0.025, this.pos.z);
    rig.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    rig.updateMatrix();
    this.world.copy(rig.matrix);
    this.inv.copy(this.world).invert();

    // the face: blinks, and the eyes follow what it watches
    if (face === 0 && eyes.y < 0.5) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkIn = rand(1.8, 4.5);
        this.blinkT = 0;
      }
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT < 0.16) eyes.x *= 1 - Math.sin((Math.PI * this.blinkT) / 0.16) * 0.92;
      else this.blinkT = -1;
    }
    this.eyes.lerp(eyes, Math.min(1, dt * 14));
    const local = _w.copy(look).sub(this.pos).applyMatrix4(_m.extractRotation(this.inv));
    const g = new THREE.Vector2(
      clamp(Math.atan2(local.x, local.z) / 0.7, -1, 1),
      clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)) / 0.6, -1, 1),
    );
    if (this.dart > 0) g.copy(this.dartTo);
    this.gaze.lerp(g, Math.min(1, dt * 12));
    this.faceCol.lerp(fcol, Math.min(1, dt * 8));
    this.status.lerp(status, Math.min(1, dt * 4));
    const u = this.u;
    u.uEyes.value.copy(this.eyes);
    u.uGaze.value.copy(this.gaze);
    u.uFaceMode.value = face;
    u.uFaceNum.value = num;
    // K.O. blinks
    u.uFaceCol.value.copy(this.faceCol);
    if (face === 2 && this.t % 0.5 > 0.36) u.uFaceCol.value.multiplyScalar(0.15);
    u.uStatus.value.copy(this.status);

    for (const arm of this.arms) {
      const k = 1 - Math.exp(-arm.rate * dt);
      slerpUnit(arm.dir, arm.wantDir, k);
      arm.bend += (arm.wantBend - arm.bend) * k;
      arm.hint.lerp(arm.wantHint, k);
    }
    this.poseBones();
  }

  /** The fight's over: wave it off over the fallen robot (K.O. on the face), then raise the winner's hand. On points: a beat in the middle, then the winner. A draw: both hands up. */
  private stopped(models: readonly BotModel[], mid: THREE.Vector3, cd: THREE.Vector2, top: number) {
    const k = this.ko;
    k.lam = 2.6;
    k.eyes.set(1, 0, 0, 0);
    k.face = 0;
    k.col.copy(EYE_COL);
    k.status.copy(IDLE_COL);
    const first = this.decision ? 1.3 : 2.3;
    if (this.koT < first || this.winner < 0) {
      if (this.decision) {
        // the final bell: in the middle, hands crossing at the waist
        k.target.set(mid.x - cd.x * 0.5, Math.max(2.4, top + 0.45), mid.z - cd.y * 0.5);
        k.look.copy(joint(models, 0, J.Head)).lerp(joint(models, 1, J.Head), 0.5);
        const w = Math.sin(this.koT * TAU * 1.4);
        for (let a = 0; a < 2; a++) {
          const s = SIDE[a];
          // a draw: both hands up
          if (this.winner < 0) this.raise(a, 10, 0, 0.85 + 0.2 * w);
          else this.pose(a, _v.set(s * (0.1 + 0.6 * w), -0.15, 0.85), 0.1, 14);
        }
        if (this.winner < 0) k.eyes.set(1, 0.6, 0, 0);
        return;
      }
      // K.O.: over the robot that's out, waving it off
      const i = Math.max(0, this.loser);
      const pd = joint(models, i, J.Pelvis);
      const po = joint(models, 1 - i, J.Pelvis);
      const away = new THREE.Vector2(pd.x - po.x, pd.z - po.z);
      if (away.length() > 0.05) away.normalize();
      else away.set(1, 0);
      const across = new THREE.Vector2(-away.y, away.x);
      if (across.dot(cd) > 0) across.negate();
      const dir = away.multiplyScalar(0.4).add(across).normalize();
      k.target.set(pd.x + dir.x * 1.3, 1.7, pd.z + dir.y * 1.3);
      k.look.copy(joint(models, i, J.Head));
      k.lam = 3.2;
      k.face = 2;
      k.col.copy(KO_COL);
      k.status.copy(KO_COL);
      const wave = Math.sin(this.koT * TAU * 1.5);
      // forearms swinging over its head, crossing
      for (let a = 0; a < 2; a++) this.pose(a, _v.set(SIDE[a] * 0.8, 0.45, 0.3), 1.15 + 0.6 * wave, 16, UP);
      return;
    }
    // the winner: alongside it, its hand raised high, a happy spin when it gets there
    const w = this.winner;
    const pw = joint(models, w, J.Pelvis);
    const hw = joint(models, w, J.Head);
    const pl = joint(models, 1 - w, J.Pelvis);
    const away = new THREE.Vector2(pw.x - pl.x, pw.z - pl.z);
    if (away.length() > 0.05) away.normalize();
    else away.set(1, 0);
    const across = new THREE.Vector2(-away.y, away.x);
    if (across.dot(cd) > 0) across.negate();
    const dir = across.multiplyScalar(0.9).add(away.multiplyScalar(0.3)).normalize();
    k.target.set(pw.x + dir.x * 1.15, hw.y + 0.3, pw.z + dir.y * 1.15);
    k.look.copy(hw);
    if (this.pos.distanceTo(k.target) < 0.5 && !this.wonSpun) {
      this.wonSpun = true;
      this.spin = TAU;
      this.squashV += 1.5;
    }
    // then to the crowd: to the camera
    if (this.wonSpun && this.spin <= 0) k.look.lerp(this.campos, 0.6);
    const a = this.nearArm(hw);
    this.raise(a, 12, 0.06 * Math.sin(this.koT * 7));
    // ...and the other hand presents it: this one!
    this.point(1 - a, hw, 0.15, 8);
    k.eyes.set(1, 1, 0, 0);
    k.col.copy(WIN_COL);
    k.status.copy(this.accent[w]).multiplyScalar(2.6);
  }

  // ---------------------------------------------------------------- the arms
  /** The arm on the side of a point (world). */
  private nearArm(at: THREE.Vector3) {
    return _x.copy(at).applyMatrix4(this.inv).x >= 0 ? 0 : 1;
  }

  /** Hands hanging relaxed, elbows a little bent. */
  private rest(a: number) {
    this.pose(a, _y.set(SIDE[a] * 0.35, -1, 0.28), 1 + 0.12 * Math.sin(this.t * 1.3 + a * 2), 5);
  }

  private pose(a: number, dir: THREE.Vector3, bend: number, rate: number, hint = FWD) {
    const arm = this.arms[a];
    arm.wantDir.copy(dir).normalize();
    arm.wantBend = bend;
    arm.wantHint.copy(hint);
    arm.rate = rate;
  }

  /** Arm a's hand raised over its head: the upper arm out and up past the hull, the forearm upright. */
  private raise(a: number, rate: number, lean = 0, bend = 0.85) {
    this.pose(a, _y.set(SIDE[a] * 0.62, 0.62, 0.42 + lean), bend, rate, UP);
  }

  /** Arm a pointing at a spot in the world. */
  private point(a: number, at: THREE.Vector3, bend: number, rate: number) {
    const sh = _x.set(SHOULDER.x * SIDE[a], SHOULDER.y, SHOULDER.z).applyMatrix4(this.world);
    const d = _y.subVectors(at, sh).applyMatrix4(_m.extractRotation(this.inv));
    if (d.length() < 1e-4) return;
    this.pose(a, d, bend, rate);
  }

  /** The bones from the arms' poses, the fans' tilt and the squash. */
  private poseBones() {
    const sq = this.squash;
    const b0 = new THREE.Matrix4().makeScale(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.bones[0].copy(b0);
    for (let a = 0; a < 2; a++) {
      const s = SIDE[a];
      this.bones[1 + a].multiplyMatrices(b0, _r.makeRotationX(this.podTilt[a]).setPosition(POD.x * s, POD.y, POD.z));
      const arm = this.arms[a];
      const dir = this.clearPod(a, arm.dir, arm.bend, arm.hint);
      const up = this.bones[3 + a * 3].multiplyMatrices(b0, armBasis(dir, arm.hint, _r).setPosition(SHOULDER.x * s, SHOULDER.y, SHOULDER.z));
      const fore = this.bones[4 + a * 3].multiplyMatrices(up, _r.makeRotationX(-arm.bend).setPosition(0, -UPPER, 0));
      this.bones[5 + a * 3].multiplyMatrices(fore, _r.makeRotationX(-arm.bend * 0.3).setPosition(0, -FORE, 0));
    }
  }

  /**
   * The arm's direction swung forward just enough that the arm and glove pass in front of its fan
   * pod instead of through the duct (raises, waves and the shrug all lift the arm past it). The
   * least swing that clears, so the arm slides round the pod as it moves.
   */
  private clearPod(a: number, d: THREE.Vector3, bend: number, hint: THREE.Vector3) {
    if (!this.hitsPod(a, d, bend, hint)) return d;
    const out = _cleared[a];
    let lo = 0, hi = 3;
    if (this.hitsPod(a, this.swung(d, hi, _swing), bend, hint)) return this.swung(d, hi, out);
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      if (this.hitsPod(a, this.swung(d, mid, _swing), bend, hint)) lo = mid;
      else hi = mid;
    }
    return this.swung(d, hi, out);
  }

  /**
   * Whether arm a, posed so, touches its fan pod (the duct ring and its rim, a flat cylinder in
   * the pod's tilted frame), sampling the upper arm, elbow, forearm and glove with their thickness.
   */
  private hitsPod(a: number, d: THREE.Vector3, bend: number, hint: THREE.Vector3) {
    const s = SIDE[a];
    const sh = _hp.sh.set(SHOULDER.x * s, SHOULDER.y, SHOULDER.z);
    const bUp = armBasis(d, hint, _hp.up);
    const bFore = _hp.fore.multiplyMatrices(bUp, _r.makeRotationX(-bend));
    const bHand = _hp.hand.multiplyMatrices(bFore, _r.makeRotationX(-bend * 0.3));
    const elbow = _hp.elbow.set(0, -UPPER, 0).applyMatrix4(bUp).add(sh);
    const wrist = _hp.wrist.set(0, -FORE, 0).applyMatrix4(bFore).add(elbow);
    const podInv = _hp.pod.makeRotationX(-this.podTilt[a]);
    const p = _hp.p;
    // (each sample is a ball at p of radius r, taken into the pod's frame)
    const touches = (r: number) => {
      p.x -= POD.x * s;
      p.y -= POD.y;
      p.z -= POD.z;
      p.applyMatrix4(podInv);
      return Math.abs(p.y - POD_MID) < POD_HALF + r && Math.hypot(p.x, p.z) < POD_R + r;
    };
    p.addVectors(sh, elbow).multiplyScalar(0.5);
    if (touches(0.02)) return true;
    p.copy(elbow);
    if (touches(0.024)) return true;
    p.addVectors(elbow, wrist).multiplyScalar(0.5);
    if (touches(0.019)) return true;
    p.copy(wrist);
    if (touches(0.021)) return true;
    p.set(0, -0.032, 0).applyMatrix4(bHand).add(wrist);
    if (touches(0.034)) return true;
    p.set(0, -0.068, 0).applyMatrix4(bHand).add(wrist);
    return touches(0.02);
  }

  /** The arm's direction swung forward by k (the pod clearance search). */
  private swung(d: THREE.Vector3, k: number, out: THREE.Vector3) {
    return out.set(d.x, d.y, d.z + k).normalize();
  }
}

/** Scratch for hitsPod (it runs a dozen times a frame while an arm slides round a pod). */
const _hp = {
  sh: new THREE.Vector3(),
  elbow: new THREE.Vector3(),
  wrist: new THREE.Vector3(),
  p: new THREE.Vector3(),
  up: new THREE.Matrix4(),
  fore: new THREE.Matrix4(),
  hand: new THREE.Matrix4(),
  pod: new THREE.Matrix4(),
};
const _swing = new THREE.Vector3();
const _cleared = [new THREE.Vector3(), new THREE.Vector3()];

/** A robot's joint as drawn this frame (the joints are in the model's space; its root rides the corner lift in the intro). */
function joint(models: readonly BotModel[], i: number, j: number) {
  const md = models[i];
  return md.joints[j].clone().add(md.root.position);
}

/** The upper arm's frame: its -Y down the arm towards `d`, its +Z (the way the elbow bends) as near `hint` as that allows. */
function armBasis(d: THREE.Vector3, hint: THREE.Vector3, out: THREE.Matrix4) {
  const y = _y.copy(d).normalize().negate();
  const z = _z.copy(hint).addScaledVector(y, -hint.dot(y));
  if (z.lengthSq() < 1e-4) z.set(0, 1, 0).addScaledVector(y, -y.y);
  z.normalize();
  const x = _x.crossVectors(y, z);
  return out.makeBasis(x, y, z);
}

/** Turn unit vector `a` towards unit vector `b` by fraction k, along the great circle. */
function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, k: number) {
  _q.setFromUnitVectors(a, b);
  a.applyQuaternion(_q2.identity().slerp(_q, k)).normalize();
}
