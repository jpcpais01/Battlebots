import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Pressure-relief valves on wrecked parts. Once a part is badly beaten a brass valve pops
 * out of its plating; pressure builds inside and vents in hissing jets of white vapour,
 * more often and for longer the closer the part is to failing, and at once when the part
 * takes another blow. A part that comes off takes its valve with it, and the venting stops.
 *
 * Render only: the sim never sees any of this, so it may use Math.random freely.
 */

/** Vapour puffs alive at once (one draw call). */
const MAX_PUFFS = 520;
/** Valves at once: every venting part of both robots (one instanced draw). */
const MAX_VALVES = 32;
/** How long a fresh valve takes to punch out of the plating, in seconds. */
const POP_TIME = 0.16;

interface Vent {
  /** Which way round the limb the valve faces (radians from the robot's front). */
  angle: number;
  /** Seconds since the valve popped out. */
  age: number;
  /** 0..1: the next burst fires when it reaches 1. */
  pressure: number;
  /** Seconds left of the current burst (0 when only seeping). */
  burst: number;
  /** Length of the current burst, for its envelope. */
  burstLen: number;
  /** 0..1 how wrecked the part is (from the last update). */
  k: number;
  /** Fractional puffs carried between frames. */
  carry: number;
  seen: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  size: number;
}

function puffTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/** A stubby relief valve along +y from the plating: flange, pipe, brass body, red handwheel, nozzle. */
function valveGeometry(): THREE.BufferGeometry {
  const paint = (geo: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo.toNonIndexed();
  };
  const steel = 0x8a9097;
  const brass = 0xc9932e;
  const red = 0xb3221a;
  const flange = new THREE.CylinderGeometry(0.034, 0.038, 0.012, 10).translate(0, 0.006, 0);
  const pipe = new THREE.CylinderGeometry(0.014, 0.014, 0.045, 8).translate(0, 0.034, 0);
  const body = new THREE.CylinderGeometry(0.024, 0.024, 0.034, 6).translate(0, 0.07, 0);
  const cap = new THREE.CylinderGeometry(0.012, 0.018, 0.014, 8).translate(0, 0.094, 0);
  const nozzle = new THREE.CylinderGeometry(0.008, 0.01, 0.018, 8).translate(0, 0.109, 0);
  // the handwheel stands off the side of the body on a short spindle
  const spindle = new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6).rotateZ(Math.PI / 2).translate(0.036, 0.07, 0);
  const wheel = new THREE.TorusGeometry(0.02, 0.0045, 5, 12).rotateY(Math.PI / 2).translate(0.052, 0.07, 0);
  const spoke = new THREE.BoxGeometry(0.004, 0.038, 0.004).translate(0.052, 0.07, 0);
  const spoke2 = new THREE.BoxGeometry(0.004, 0.004, 0.038).translate(0.052, 0.07, 0);
  const geo = mergeGeometries([
    paint(flange, steel),
    paint(pipe, steel),
    paint(body, brass),
    paint(cap, brass),
    paint(nozzle, steel),
    paint(spindle, steel),
    paint(wheel, red),
    paint(spoke, red),
    paint(spoke2, red),
  ])!;
  geo.computeVertexNormals();
  return geo;
}

const _a = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _sc = new THREE.Vector3();

export class Steam {
  readonly group = new THREE.Group();
  private vents = new Map<number, Vent>();
  // vapour puffs (CPU simulated)
  private pos = new Float32Array(MAX_PUFFS * 3);
  private vel = new Float32Array(MAX_PUFFS * 3);
  private life = new Float32Array(MAX_PUFFS);
  private max = new Float32Array(MAX_PUFFS);
  private size0 = new Float32Array(MAX_PUFFS);
  private grow = new Float32Array(MAX_PUFFS);
  private drag = new Float32Array(MAX_PUFFS);
  private peak = new Float32Array(MAX_PUFFS);
  private shown = new Float32Array(MAX_PUFFS);
  private alpha = new Float32Array(MAX_PUFFS);
  private next = 0;
  private live = 0;
  private geo = new THREE.BufferGeometry();
  private points: THREE.Points;
  private valves: THREE.InstancedMesh;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.shown, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 }, uTex: { value: puffTexture() } },
        vertexShader: /* glsl */ `
          attribute float size; attribute float alpha; varying float vA; uniform float uScale;
          void main(){ vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uTex; varying float vA;
          void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.86, 0.89, 0.93), a); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.points.visible = false;
    this.group.add(this.points);

    this.valves = new THREE.InstancedMesh(
      valveGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.32 }),
      MAX_VALVES,
    );
    this.valves.count = 0;
    this.valves.frustumCulled = false;
    this.group.add(this.valves);
  }

  setPixelScale(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.5;
  }

  /**
   * Keep the valve of one wrecked part venting this frame. `a`→`b` is the segment the part
   * sits on, `t` how far along it the valve is, `radius` how far out the plating is.
   * `fwd` is the robot's facing; `side` (or null) pushes a limb's valve to its outer side.
   * `k` is 0 (just heavily damaged) to 1 (about to fail). Returns the length of a burst
   * that starts now (for its hiss), else 0.
   */
  vent(key: number, a: THREE.Vector3, b: THREE.Vector3, t: number, radius: number, fwd: THREE.Vector3, side: THREE.Vector3 | null, k: number, size: number, dt: number): number {
    let v = this.vents.get(key);
    let fresh = false;
    if (!v) {
      if (this.vents.size >= MAX_VALVES) return 0;
      v = {
        angle: (Math.random() - 0.5) * 2.6,
        age: 0,
        pressure: 1,
        burst: 0,
        burstLen: 0,
        k,
        carry: 0,
        seen: true,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        size,
      };
      this.vents.set(key, v);
      fresh = true;
    }
    v.seen = true;
    v.k = k;
    v.size = size;
    // a frame around the segment: its axis, the robot's front squared off against it, and the side
    _a.subVectors(b, a);
    if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
    _a.normalize();
    _r.copy(fwd).addScaledVector(_a, -fwd.dot(_a));
    if (_r.lengthSq() < 1e-6) _r.crossVectors(_a, Math.abs(_a.y) < 0.9 ? _up : _s.set(1, 0, 0));
    _r.normalize();
    _s.crossVectors(_a, _r);
    const c = Math.cos(v.angle);
    const s = Math.sin(v.angle);
    v.dir.copy(_r).multiplyScalar(c).addScaledVector(_s, s);
    if (side && v.dir.dot(side) < 0) v.dir.copy(_r).multiplyScalar(c).addScaledVector(_s, -s);
    v.pos.lerpVectors(a, b, t).addScaledVector(v.dir, radius);
    if (fresh) {
      // the valve punches out with a crack of vapour
      for (let n = 0; n < 10; n++) this.puff(v, 2.5 + Math.random() * 2, 0.35);
    }
    if (dt <= 0) return 0;
    v.age += dt;
    let started = 0;
    if (v.burst > 0) v.burst -= dt;
    else {
      // pressure builds faster the worse the part is: every few seconds at first, near constant at the end
      v.pressure += dt * (0.22 + k * 0.85) * (0.75 + Math.random() * 0.5);
      if (v.pressure >= 1) {
        v.pressure = Math.random() * 0.25;
        v.burstLen = v.burst = 0.3 + k * 0.8 + Math.random() * 0.35;
        started = v.burstLen;
      }
    }
    // a burst roars out, then sputters; between bursts the seals weep a thin wisp
    let rate: number;
    let speed: number;
    if (v.burst > 0) {
      const e = v.burst / v.burstLen;
      const env = Math.min(1, (1 - e) * 12) * (0.35 + 0.65 * Math.min(1, e * 2.5));
      rate = (55 + k * 70) * env;
      speed = (4 + k * 3) * (0.5 + 0.5 * env);
    } else {
      rate = 2 + k * 6;
      speed = 0.5;
    }
    v.carry += rate * dt;
    while (v.carry >= 1) {
      v.carry -= 1;
      this.puff(v, speed * (0.75 + Math.random() * 0.5), v.burst > 0 ? 0.5 : 0.18);
    }
    return started;
  }

  /** The part was hit: pressure spikes and the valve blows on its next update. */
  kick(key: number) {
    const v = this.vents.get(key);
    if (v && v.burst <= 0) v.pressure = 1;
  }

  private puff(v: Vent, speed: number, alpha: number) {
    if (this.live >= MAX_PUFFS) return;
    const i = this.next;
    this.next = (i + 1) % MAX_PUFFS;
    if (this.life[i] <= 0) this.live++;
    const sp = 0.16;
    _v.set(v.dir.x + (Math.random() - 0.5) * sp, v.dir.y + (Math.random() - 0.5) * sp, v.dir.z + (Math.random() - 0.5) * sp);
    _v.normalize();
    // out of the nozzle tip
    const tip = 0.11 * v.size;
    this.pos[i * 3] = v.pos.x + v.dir.x * tip;
    this.pos[i * 3 + 1] = v.pos.y + v.dir.y * tip;
    this.pos[i * 3 + 2] = v.pos.z + v.dir.z * tip;
    this.vel[i * 3] = _v.x * speed;
    this.vel[i * 3 + 1] = _v.y * speed + 0.15;
    this.vel[i * 3 + 2] = _v.z * speed;
    const life = speed > 1.5 ? 0.45 + Math.random() * 0.45 : 0.9 + Math.random() * 0.6;
    this.life[i] = life;
    this.max[i] = life;
    this.size0[i] = (speed > 1.5 ? 0.03 : 0.05) * v.size;
    this.grow[i] = speed > 1.5 ? 9 + Math.random() * 5 : 4 + Math.random() * 2;
    this.drag[i] = speed > 1.5 ? 4.5 : 1.5;
    this.peak[i] = alpha * (0.7 + Math.random() * 0.3);
  }

  update(dt: number) {
    if (dt > 0) {
      // valves that weren't refreshed went with their part (or the fight ended)
      for (const [key, v] of this.vents) {
        if (!v.seen) this.vents.delete(key);
        else v.seen = false;
      }
    }
    // the valves sit on their parts, rattling while they blow
    let n = 0;
    for (const v of this.vents.values()) {
      const p = Math.min(1, v.age / POP_TIME);
      const pop = p < 1 ? p * (1.35 - 0.35 * p) : 1;
      _q.setFromUnitVectors(_up, v.dir);
      if (v.burst > 0) {
        _qt.setFromAxisAngle(_v.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), (Math.random() - 0.5) * 0.12);
        _q.multiply(_qt);
      }
      _sc.setScalar(Math.max(0.001, pop * v.size));
      _m.compose(v.pos, _q, _sc);
      this.valves.setMatrixAt(n++, _m);
    }
    this.valves.count = n;
    if (n) this.valves.instanceMatrix.needsUpdate = true;

    if (!this.live) {
      this.points.visible = false;
      return;
    }
    let live = 0;
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      live++;
      const k = this.life[i] / this.max[i];
      const drag = Math.exp(-this.drag[i] * dt);
      // vapour is light: it slows hard, then billows upward
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.9 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const age = 1 - k;
      this.shown[i] = this.size0[i] * (1 + this.grow[i] * Math.sqrt(age));
      this.alpha[i] = this.peak[i] * Math.min(1, age * 14) * k * k;
    }
    this.live = live;
    this.points.visible = live > 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.vents.clear();
    this.life.fill(0);
    this.alpha.fill(0);
    this.live = 0;
    this.valves.count = 0;
    this.points.visible = false;
  }
}
