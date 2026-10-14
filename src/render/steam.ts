import * as THREE from 'three';

/**
 * High-pressure vapour blowing out of the hinges of wrecked parts. Once a part is badly
 * beaten its joint seals fail: pressure builds inside and blasts out of the hinge in hard,
 * hissing jets of white vapour, more often and for longer the closer the part is to failing,
 * and at once when the part takes another blow. A part that comes off stops venting.
 *
 * Render only: the sim never sees any of this, so it may use Math.random freely.
 */

/** Vapour puffs alive at once (one draw call). */
const MAX_PUFFS = 1400;
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

const _a = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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
          void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), a); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.points.visible = false;
    this.group.add(this.points);

  }

  setPixelScale(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.5;
  }

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
      for (let n = 0; n < 40; n++) this.puff(v, 9 + Math.random() * 4, n % 3 === 0);
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
      // a tight, fast core with thick billows rolling off it
      v.carry += (150 + k * 130) * env * dt;
      const speed = (9 + k * 5) * (0.45 + 0.55 * env);
      while (v.carry >= 1) {
        v.carry -= 1;
        this.puff(v, speed * (0.85 + Math.random() * 0.3), Math.random() < 0.6);
      }
    } else {
      v.carry += (3 + k * 8) * dt;
      while (v.carry >= 1) {
        v.carry -= 1;
        this.wisp(v);
      }
    }
    return started;
  }

  /** The part was hit: pressure spikes and the hinge blows on its next update. */
  kick(key: number) {
    const v = this.vents.get(key);
    if (v && v.burst <= 0) v.pressure = 1;
  }

  private slot(): number {
    if (this.live >= MAX_PUFFS) return -1;
    const i = this.next;
    this.next = (i + 1) % MAX_PUFFS;
    if (this.life[i] <= 0) this.live++;
    return i;
  }

  /**
   * One puff of a jet. A core puff is small, dense and flies far in a tight line (the
   * pressure); a billow is wider, slower and swells into the cloud around it.
   */
  private puff(v: Vent, speed: number, core: boolean) {
    const i = this.slot();
    if (i < 0) return;
    const sp = core ? 0.06 : 0.3;
    _v.set(v.dir.x + (Math.random() - 0.5) * sp, v.dir.y + (Math.random() - 0.5) * sp, v.dir.z + (Math.random() - 0.5) * sp);
    _v.normalize();
    const sp2 = core ? speed : speed * (0.35 + Math.random() * 0.3);
    // start a little way along the jet so it fills from the hinge outward
    const o = Math.random() * 0.03 * v.size;
    this.pos[i * 3] = v.pos.x + _v.x * o;
    this.pos[i * 3 + 1] = v.pos.y + _v.y * o;
    this.pos[i * 3 + 2] = v.pos.z + _v.z * o;
    this.vel[i * 3] = _v.x * sp2;
    this.vel[i * 3 + 1] = _v.y * sp2;
    this.vel[i * 3 + 2] = _v.z * sp2;
    const life = core ? 0.3 + Math.random() * 0.2 : 0.7 + Math.random() * 0.6;
    this.life[i] = life;
    this.max[i] = life;
    this.size0[i] = (core ? 0.035 : 0.06) * v.size;
    this.grow[i] = core ? 5 + Math.random() * 3 : 9 + Math.random() * 6;
    this.drag[i] = core ? 9 : 5;
    this.peak[i] = core ? 0.95 : 0.6 + Math.random() * 0.25;
  }

  /** A thin wisp seeping from the hinge between bursts. */
  private wisp(v: Vent) {
    const i = this.slot();
    if (i < 0) return;
    this.pos[i * 3] = v.pos.x;
    this.pos[i * 3 + 1] = v.pos.y;
    this.pos[i * 3 + 2] = v.pos.z;
    const s = 0.4 + Math.random() * 0.4;
    this.vel[i * 3] = v.dir.x * s + (Math.random() - 0.5) * 0.15;
    this.vel[i * 3 + 1] = v.dir.y * s + 0.2;
    this.vel[i * 3 + 2] = v.dir.z * s + (Math.random() - 0.5) * 0.15;
    const life = 1 + Math.random() * 0.6;
    this.life[i] = life;
    this.max[i] = life;
    this.size0[i] = 0.05 * v.size;
    this.grow[i] = 4 + Math.random() * 2;
    this.drag[i] = 1.5;
    this.peak[i] = 0.3;
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
      this.alpha[i] = this.peak[i] * Math.min(1, age * 20) * k;
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
    this.points.visible = false;
  }
}
