import * as THREE from 'three';

/**
 * High-pressure vapour blowing out of the hinges of wrecked parts. Once a part is badly
 * beaten its joint seals fail: pressure builds inside and blasts out of the hinge in hard,
 * hissing jets of white vapour, more often and for longer the closer the part is to failing,
 * and at once when the part takes another blow. A part that comes off stops venting.
 *
 * Render only: the sim never sees any of this, so it may use Math.random freely.
 */

/** Vapour puffs alive at once (one instanced draw). */
const MAX_PUFFS = 1100;
/** Hinges venting at once: every venting part of both robots. */
const MAX_VENTS = 32;

interface Vent {
  /** Which way round the hinge the jet points (radians from the robot's front). */
  angle: number;
  /** 0..1: the next burst fires when it reaches 1. */
  pressure: number;
  /** Seconds left of the current burst (0 when only seeping). */
  burst: number;
  /** Length of the current burst, for its envelope. */
  burstLen: number;
  /** 0..1 how wrecked the part is (from the last update). */
  k: number;
  /** Fractional puffs carried between frames (jet core, billows). */
  carry: number;
  carryB: number;
  seen: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  size: number;
}

/** Puff kinds: the pressurised core streaking out, the cloud rolling off it, and a seep. */
const CORE = 0;
const BILLOW = 1;
const WISP = 2;

/**
 * Four tiles (2x2) of billowing vapour: lumpy, uneven clouds from fractal noise, each a
 * different shape, so puffs never read as the same round dot. Density in the red channel.
 */
function vapourAtlas(): THREE.CanvasTexture {
  const T = 128;
  const S = T * 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  // a fixed lattice of random values (render only, so Math.random is fine)
  const N = 64;
  const lat = new Float32Array(N * N);
  for (let i = 0; i < lat.length; i++) lat[i] = Math.random();
  const at = (x: number, y: number) => lat[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  const fbm = (x: number, y: number) => {
    let v = 0;
    let amp = 0.5;
    for (let o = 0; o < 5; o++) {
      v += noise(x, y) * amp;
      x = x * 2.03 + 17.1;
      y = y * 2.03 + 9.7;
      amp *= 0.5;
    }
    return v;
  };
  for (let t = 0; t < 4; t++) {
    const ox = (t & 1) * T;
    const oy = (t >> 1) * T;
    const sx = t * 13.7;
    const sy = t * 7.3;
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const u = (x + 0.5) / T - 0.5;
        const v = (y + 0.5) / T - 0.5;
        const r = Math.sqrt(u * u + v * v) * 2;
        const n = fbm(u * 4 + sx, v * 4 + sy);
        const n2 = fbm(u * 9 + sy, v * 9 + sx);
        // a lumpy edge: the noise pushes the cloud's outline in and out
        const edge = r + (n - 0.5) * 0.75;
        let d = 1 - Math.min(1, Math.max(0, (edge - 0.2) / 0.7));
        d = d * d * (3 - 2 * d);
        d *= 0.5 + 0.7 * n2;
        // always clear at the tile's border, so neighbours never bleed in
        d *= Math.min(1, Math.max(0, (1 - r) * 4));
        const val = Math.max(0, Math.min(255, Math.round(d * 255)));
        const k = ((oy + y) * S + ox + x) * 4;
        img.data[k] = val;
        img.data[k + 1] = val;
        img.data[k + 2] = val;
        img.data[k + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const _a = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Each puff is a camera-facing card cut from the vapour atlas. Fast puffs stretch along
 * their motion (the jet reads as a hard streak of pressure), slow ones turn and swell. The
 * cards are lit from above, and their thin parts erode away as they age, so the cloud
 * frays into wisps instead of just fading.
 */
const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iData; // size, alpha, spin angle, streak seconds
attribute vec3 iMisc; // age 0..1, atlas tile, heat
varying vec2 vUv;
varying vec2 vTile;
varying float vA;
varying float vAge;
varying float vShade;
varying float vHot;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 vv = (modelViewMatrix * vec4(iVel, 0.0)).xy;
  float sp = length(vv);
  float size = iData.x;
  float streak = sp * iData.w;
  vec2 rotAxis = vec2(cos(iData.z), sin(iData.z));
  vec2 velAxis = sp > 1e-4 ? vv / sp : rotAxis;
  vec2 axis = normalize(mix(rotAxis, velAxis, clamp(streak / size, 0.0, 1.0)) + vec2(1e-5, 0.0));
  vec2 perp = vec2(-axis.y, axis.x);
  float along = size + streak;
  vec2 off = axis * position.x * along + perp * position.y * size;
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  float t = iMisc.y;
  vTile = vec2(mod(t, 2.0), floor(t / 2.0)) * 0.5;
  // never let a puff right in front of the lens fill the screen
  vA = iData.y * smoothstep(0.2, 0.7, -mv.z);
  vAge = iMisc.x;
  vHot = iMisc.z;
  vShade = clamp(0.5 + off.y / max(along, size), 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec2 vTile;
varying float vA;
varying float vAge;
varying float vShade;
varying float vHot;
void main() {
  float d = texture2D(uTex, vTile + clamp(vUv, 0.0, 1.0) * 0.5).r;
  // thin vapour burns off first: the cloud frays into wisps as it ages
  float e = vAge * vAge * 0.6;
  float a = smoothstep(e, e + 0.3, d) * vA;
  if (a < 0.004) discard;
  // lit from the rig above, shadowed underneath; dense parts scatter more light
  float lit = clamp(vShade * 0.75 + d * 0.45, 0.0, 1.0);
  vec3 col = mix(vec3(0.42, 0.47, 0.55), vec3(1.0, 0.99, 0.97), lit);
  col = mix(col, vec3(1.05, 1.05, 1.08), vHot * 0.6);
  // premultiplied: the fresh core glows a little (adds light), the cloud mostly occludes
  gl_FragColor = vec4(col * a, a * (1.0 - vHot * 0.45));
}`;

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
  private kind = new Uint8Array(MAX_PUFFS);
  private rot = new Float32Array(MAX_PUFFS);
  private spin = new Float32Array(MAX_PUFFS);
  private seed = new Float32Array(MAX_PUFFS);
  private tile = new Uint8Array(MAX_PUFFS);
  private next = 0;
  private live = 0;
  private clock = 0;
  // what the GPU draws: the live puffs packed to the front
  private gPos = new Float32Array(MAX_PUFFS * 3);
  private gVel = new Float32Array(MAX_PUFFS * 3);
  private gData = new Float32Array(MAX_PUFFS * 4);
  private gMisc = new Float32Array(MAX_PUFFS * 3);
  private geo = new THREE.InstancedBufferGeometry();
  private mesh: THREE.Mesh;

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iVel', new THREE.InstancedBufferAttribute(this.gVel, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iData', new THREE.InstancedBufferAttribute(this.gData, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(this.gMisc, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: vapourAtlas() } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /** Kept for the stage's resize hook: the cards are sized in world units. */
  setPixelScale(_h: number) {}

  /**
   * Keep the hinge of one wrecked part venting this frame. `a`→`b` is the segment the jet
   * blows out across, `t` how far along it the hinge is, `radius` how far out its seal is.
   * `fwd` is the robot's facing; `side` (or null) turns a limb's jet to its outer side.
   * `k` is 0 (just heavily damaged) to 1 (about to fail). Returns the length of a burst
   * that starts now (for its hiss), else 0.
   */
  vent(key: number, a: THREE.Vector3, b: THREE.Vector3, t: number, radius: number, fwd: THREE.Vector3, side: THREE.Vector3 | null, k: number, size: number, dt: number): number {
    let v = this.vents.get(key);
    let fresh = false;
    if (!v) {
      if (this.vents.size >= MAX_VENTS) return 0;
      v = {
        angle: (Math.random() - 0.5) * 2.6,
        pressure: 1,
        burst: 0,
        burstLen: 0,
        k,
        carry: 0,
        carryB: 0,
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
      // the seal gives with a crack: one hard blast
      for (let n = 0; n < 14; n++) this.puff(v, CORE, 11 + Math.random() * 4);
      for (let n = 0; n < 10; n++) this.puff(v, BILLOW, 11 + Math.random() * 4);
    }
    if (dt <= 0) return 0;
    let started = 0;
    if (v.burst > 0) v.burst -= dt;
    else {
      // pressure builds faster the worse the part is: every few seconds at first, near constant at the end
      v.pressure += dt * (0.3 + k * 1.0) * (0.75 + Math.random() * 0.5);
      if (v.pressure >= 1) {
        v.pressure = Math.random() * 0.25;
        v.burstLen = v.burst = 0.45 + k * 0.9 + Math.random() * 0.4;
        started = v.burstLen;
      }
    }
    // a burst screams out at full pressure, then sputters; between bursts the hinge weeps a wisp
    if (v.burst > 0) {
      const e = v.burst / v.burstLen;
      const env = Math.min(1, (1 - e) * 20) * (0.3 + 0.7 * Math.min(1, e * 2.5));
      const speed = (10 + k * 5) * (0.45 + 0.55 * env);
      // a hard streak of pressure down the middle, with the cloud rolling off it
      v.carry += (70 + k * 50) * env * dt;
      v.carryB += (34 + k * 26) * env * dt;
      for (; v.carry >= 1; v.carry -= 1) this.puff(v, CORE, speed * (0.85 + Math.random() * 0.3));
      for (; v.carryB >= 1; v.carryB -= 1) this.puff(v, BILLOW, speed * (0.85 + Math.random() * 0.3));
    } else {
      v.carryB += (2.5 + k * 5) * dt;
      for (; v.carryB >= 1; v.carryB -= 1) this.puff(v, WISP, 0.5 + Math.random() * 0.4);
    }
    return started;
  }

  /** The part was hit: pressure spikes and the hinge blows on its next update. */
  kick(key: number) {
    const v = this.vents.get(key);
    if (v && v.burst <= 0) v.pressure = 1;
  }

  /**
   * One puff. The core is a tight, fast streak (the pressure) that flares into vapour a
   * hand's width out; billows are wider, slower and swell into the cloud around it; a wisp
   * seeps and curls upward.
   */
  private puff(v: Vent, kind: number, speed: number) {
    if (this.live >= MAX_PUFFS) return;
    const i = this.next;
    this.next = (i + 1) % MAX_PUFFS;
    if (this.life[i] <= 0) this.live++;
    const sp = kind === CORE ? 0.07 : kind === BILLOW ? 0.38 : 0.5;
    _v.set(v.dir.x + (Math.random() - 0.5) * sp, v.dir.y + (Math.random() - 0.5) * sp, v.dir.z + (Math.random() - 0.5) * sp);
    _v.normalize();
    const s = kind === BILLOW ? speed * (0.3 + Math.random() * 0.3) : speed;
    // billows bloom a little way out, where the jet starts to break up
    const o = (kind === BILLOW ? 0.04 + Math.random() * 0.08 : Math.random() * 0.02) * v.size;
    this.pos[i * 3] = v.pos.x + _v.x * o;
    this.pos[i * 3 + 1] = v.pos.y + _v.y * o;
    this.pos[i * 3 + 2] = v.pos.z + _v.z * o;
    this.vel[i * 3] = _v.x * s;
    this.vel[i * 3 + 1] = _v.y * s + (kind === WISP ? 0.25 : 0);
    this.vel[i * 3 + 2] = _v.z * s;
    let life: number;
    if (kind === CORE) {
      life = 0.22 + Math.random() * 0.14;
      this.size0[i] = 0.045 * v.size;
      this.grow[i] = 3.5 + Math.random() * 2;
      this.drag[i] = 6.5;
      this.peak[i] = 0.85;
    } else if (kind === BILLOW) {
      life = 0.9 + Math.random() * 0.7;
      this.size0[i] = (0.08 + Math.random() * 0.05) * v.size;
      this.grow[i] = 5 + Math.random() * 3;
      this.drag[i] = 3.6;
      this.peak[i] = 0.5 + Math.random() * 0.2;
    } else {
      life = 1.1 + Math.random() * 0.7;
      this.size0[i] = 0.06 * v.size;
      this.grow[i] = 3.5 + Math.random() * 1.5;
      this.drag[i] = 1.6;
      this.peak[i] = 0.3;
    }
    this.life[i] = life;
    this.max[i] = life;
    this.kind[i] = kind;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * (kind === CORE ? 0 : 2.4);
    this.seed[i] = Math.random() * 100;
    this.tile[i] = (Math.random() * 4) | 0;
  }

  update(dt: number) {
    if (dt > 0) {
      // hinges that weren't refreshed went with their part (or the fight ended)
      for (const [key, v] of this.vents) {
        if (!v.seen) this.vents.delete(key);
        else v.seen = false;
      }
    }
    if (!this.live) {
      this.mesh.visible = false;
      return;
    }
    this.clock += dt;
    const tc = this.clock;
    let n = 0;
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = this.life[i] / this.max[i];
      const age = 1 - k;
      const kind = this.kind[i];
      const drag = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      let vx = this.vel[i3] * drag;
      let vy = this.vel[i3 + 1] * drag;
      let vz = this.vel[i3 + 2] * drag;
      // vapour is light: once it slows it billows upward and curls in the air
      vy += (kind === CORE ? 0.3 : 1.1) * dt;
      if (kind !== CORE) {
        const sd = this.seed[i];
        const px = this.pos[i3];
        const py = this.pos[i3 + 1];
        const pz = this.pos[i3 + 2];
        const tb = 1.6 * dt;
        vx += Math.sin(py * 6.1 + tc * 2.3 + sd) * tb;
        vy += Math.sin(pz * 5.3 + tc * 1.7 + sd * 1.3) * tb * 0.6;
        vz += Math.sin(px * 5.7 + tc * 2.1 + sd * 0.7) * tb;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] += vy * dt;
      this.pos[i3 + 2] += vz * dt;
      this.rot[i] += this.spin[i] * dt * k;
      // swells fast, then slowly
      const swell = 1 - (1 - age) * (1 - age);
      const size = this.size0[i] * (1 + this.grow[i] * swell);
      // the core is clear right at the hinge and turns white as it condenses; all of it thins away
      const fadeIn = Math.min(1, age * (kind === CORE ? 7 : 12));
      const a = this.peak[i] * fadeIn * (kind === CORE ? k : Math.min(1, k * 1.6));
      const n3 = n * 3;
      const n4 = n * 4;
      this.gPos[n3] = this.pos[i3];
      this.gPos[n3 + 1] = this.pos[i3 + 1];
      this.gPos[n3 + 2] = this.pos[i3 + 2];
      this.gVel[n3] = vx;
      this.gVel[n3 + 1] = vy;
      this.gVel[n3 + 2] = vz;
      this.gData[n4] = size;
      this.gData[n4 + 1] = a;
      this.gData[n4 + 2] = this.rot[i];
      this.gData[n4 + 3] = kind === CORE ? 0.035 : kind === BILLOW ? 0.012 : 0;
      this.gMisc[n3] = age;
      this.gMisc[n3 + 1] = this.tile[i];
      this.gMisc[n3 + 2] = kind === CORE ? k : 0;
      n++;
    }
    this.live = n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (const name of ['iPos', 'iVel', 'iData', 'iMisc']) {
      const attr = this.geo.attributes[name] as THREE.InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  clear() {
    this.vents.clear();
    this.life.fill(0);
    this.live = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
