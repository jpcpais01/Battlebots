import * as THREE from 'three';
import { RING_RADIUS } from './arena';

/** Oil drops alive at once (hanging from a wound or in flight). */
const MAX_DROPS = 320;
/** Puddles and oily footprints on the canvas (one instanced draw). */
const MAX_POOLS = 110;
/** Drops that land inside this radius splat onto the canvas; the rest fall off the stage. */
const CANVAS_R = (RING_RADIUS + 0.5) * Math.cos(Math.PI / 8);
const POOL_MAX_R = 0.5;
/** A planted foot is this close to the floor (the foot particle's radius plus a little). */
const PLANTED_Y = 0.13;

/** A soft-cornered, irregular blob with a few satellite droplets: the shape of a splash of oil. */
function blobTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  // the alpha map reads the green channel: white blob on black
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const dot = (x: number, y: number, r: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.82, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // fixed layout (no randomness): instances vary by rotation and stretch instead
  dot(64, 64, 34);
  dot(80, 56, 24);
  dot(50, 74, 22);
  dot(70, 82, 18);
  dot(46, 50, 16);
  dot(96, 76, 7);
  dot(26, 66, 6);
  dot(84, 28, 5);
  dot(38, 98, 4);
  dot(106, 50, 3.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const FILM_NOISE = /* glsl */ `
float oilHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oilNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(oilHash(i), oilHash(i + vec2(1, 0)), f.x), mix(oilHash(i + vec2(0, 1)), oilHash(i + vec2(1, 1)), f.x), f.y);
}
// thin-film interference: the oil-slick rainbow, shifting with the film's thickness and the view angle
vec3 oilFilm(float t) { return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
`;

/**
 * Wet motor oil: near-black, almost mirror-glossy (it picks up the ring lights and the
 * arena), with a thin-film rainbow that swirls over it and brightens at grazing angles.
 */
function oilMaterial(opts: { alphaMap?: THREE.Texture; film: number; puddle: boolean }) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x020203,
    roughness: 0.05,
    metalness: 0.25,
    envMapIntensity: 1.6,
    alphaMap: opts.alphaMap ?? null,
    transparent: opts.puddle,
    depthWrite: !opts.puddle,
    polygonOffset: opts.puddle,
    polygonOffsetFactor: opts.puddle ? -2 : 0,
    polygonOffsetUnits: opts.puddle ? -2 : 0,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vOilW;${opts.puddle ? '\nattribute float aFade;\nvarying float vFade;' : ''}`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 ow = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            ow = instanceMatrix * ow;
          #endif
          vOilW = (modelMatrix * ow).xyz;
        }
        ${opts.puddle ? 'vFade = aFade;' : ''}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vOilW;${opts.puddle ? '\nvarying float vFade;' : ''}\n${FILM_NOISE}`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>${opts.puddle ? '\ndiffuseColor.a *= vFade;' : ''}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float graze = 1.0 - abs(dot(normalize(vViewPosition), normal));
          float thick = oilNoise(vOilW.xz * 9.0) * 0.9 + oilNoise(vOilW.xz * 23.0 + 4.0) * 0.4 + graze * 1.4;
          float k = ${opts.film.toFixed(3)} * (0.35 + graze * graze * 1.6);
          totalEmissiveRadiance += oilFilm(thick) * k${opts.puddle ? ' * vFade' : ''};
        }`,
      );
  };
  mat.customProgramCacheKey = () => `oil-${opts.puddle ? 'pool' : 'drop'}`;
  return mat;
}

interface Leak {
  at: THREE.Vector3;
  vel: THREE.Vector3;
  /** Frame the leak last ran on, to tell a fresh start from a continuing one. */
  seen: number;
  pulse: number;
}

/**
 * Oil bleeding out of wrecked robots: thick glossy drops that bead at the wound, stretch and
 * let go, string out as they fall, splat on the canvas and spread into slick puddles, which
 * the robots then track across the ring in oily footprints.
 *
 * Purely visual (Math.random is fine here): nothing in the sim reads any of it.
 */
export class Oil {
  readonly group = new THREE.Group();
  // drops
  private dPos = new Float32Array(MAX_DROPS * 3);
  private dVel = new Float32Array(MAX_DROPS * 3);
  private dSize = new Float32Array(MAX_DROPS);
  /** Seconds left hanging from its wound before it lets go (0 = falling). */
  private dHang = new Float32Array(MAX_DROPS);
  private dHangMax = new Float32Array(MAX_DROPS);
  private dLeak: (Leak | null)[] = Array.from({ length: MAX_DROPS }, () => null);
  private dLive = new Uint8Array(MAX_DROPS);
  private dNext = 0;
  private drops: THREE.InstancedMesh;
  // puddles
  private pools: THREE.InstancedMesh;
  private pX = new Float32Array(MAX_POOLS);
  private pZ = new Float32Array(MAX_POOLS);
  private pR = new Float32Array(MAX_POOLS);
  private pTarget = new Float32Array(MAX_POOLS);
  private pRot = new Float32Array(MAX_POOLS);
  private pAspect = new Float32Array(MAX_POOLS);
  private pAge = new Float32Array(MAX_POOLS);
  private pPeak = new Float32Array(MAX_POOLS);
  /** Footprints don't grow and can't be stepped in again. */
  private pPrint = new Uint8Array(MAX_POOLS);
  private pFade = new Float32Array(MAX_POOLS);
  private pUsed = 0;
  private pNext = 0;
  private settled = true;
  private leaks = new Map<number, Leak>();
  private frameNo = 0;
  // per foot: prints left to stamp, and where the last one went
  private oily = [0, 0, 0, 0];
  private lastPrint = [0, 1, 2, 3].map(() => new THREE.Vector3(1e9, 0, 0));

  constructor() {
    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), oilMaterial({ film: 0.05, puddle: false }), MAX_DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.group.add(this.drops);

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.pFade, 1).setUsage(THREE.DynamicDrawUsage));
    this.pools = new THREE.InstancedMesh(geo, oilMaterial({ alphaMap: blobTexture(), film: 0.07, puddle: true }), MAX_POOLS);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.frustumCulled = false;
    this.pools.count = 0;
    this.pools.receiveShadow = true;
    this.pools.renderOrder = -1;
    this.group.add(this.pools);
  }

  /** Kept for the Game's resize hook (the drops are real meshes now, sized in world units). */
  setPixelScale(_h: number) {}

  private emit(p: THREE.Vector3, vx: number, vy: number, vz: number, size: number, hang = 0, leak: Leak | null = null) {
    const i = this.dNext;
    this.dNext = (this.dNext + 1) % MAX_DROPS;
    this.dPos[i * 3] = p.x;
    this.dPos[i * 3 + 1] = p.y;
    this.dPos[i * 3 + 2] = p.z;
    this.dVel[i * 3] = vx;
    this.dVel[i * 3 + 1] = vy;
    this.dVel[i * 3 + 2] = vz;
    this.dSize[i] = size;
    this.dHang[i] = hang;
    this.dHangMax[i] = hang;
    this.dLeak[i] = leak;
    this.dLive[i] = 1;
  }

  /**
   * Keep a wound bleeding for this frame. `id` names the wound (so its spurts keep their own
   * rhythm and it knows how fast it is moving), `out` is the unit direction it faces and
   * `k` how bad it is: below 1 a dribble that beads and drips, getting heavier, and from
   * about 1 a gushing stream that pumps out in spurts (a freshly torn socket).
   */
  leak(id: number, at: THREE.Vector3, out: THREE.Vector3, k: number, dt: number) {
    if (dt <= 0) return;
    let L = this.leaks.get(id);
    if (!L) {
      L = { at: at.clone(), vel: new THREE.Vector3(), seen: -1, pulse: Math.random() };
      this.leaks.set(id, L);
    }
    // the drops leave with the body's own motion, so a swaying robot flings them about
    if (L.seen === this.frameNo - 1) L.vel.subVectors(at, L.at).divideScalar(dt).clampLength(0, 6).multiplyScalar(0.75);
    else L.vel.set(0, 0, 0);
    L.at.copy(at);
    L.seen = this.frameNo;
    const bv = L.vel;

    // thick drops bead on the wound, stretch under their own weight, then let go
    const rate = 1.6 + k * k * 9;
    let n = Math.floor(dt * rate);
    if (Math.random() < dt * rate - n) n++;
    for (let i = 0; i < n; i++) {
      this.emit(at, 0, 0, 0, 0.014 + Math.random() * 0.012 + Math.min(1, k) * 0.008, 0.25 + Math.random() * 0.45 / (0.6 + k), L);
    }
    // a steady stream once it's bad
    if (k > 0.45) {
      const sr = (k - 0.45) * 30;
      let m = Math.floor(dt * sr);
      if (Math.random() < dt * sr - m) m++;
      for (let i = 0; i < m; i++) {
        const s = (0.2 + Math.random() * 0.4) * k;
        this.emit(
          _p.set(at.x + (Math.random() - 0.5) * 0.03, at.y + (Math.random() - 0.5) * 0.03, at.z + (Math.random() - 0.5) * 0.03),
          bv.x + out.x * s + (Math.random() - 0.5) * 0.1,
          bv.y - 0.1,
          bv.z + out.z * s + (Math.random() - 0.5) * 0.1,
          0.012 + Math.random() * 0.012,
        );
      }
    }
    // a failing pump: rhythmic spurts
    if (k > 0.35) {
      L.pulse -= dt * (0.9 + k * 1.1);
      if (L.pulse <= 0) {
        L.pulse += 0.7 + Math.random() * 0.6;
        const m = 4 + Math.round(k * 10);
        for (let i = 0; i < m; i++) {
          const s = (0.8 + Math.random() * 1.1) * (0.6 + k * 0.7);
          this.emit(
            at,
            bv.x + out.x * s + (Math.random() - 0.5) * 0.35,
            bv.y + out.y * s + 0.3 + Math.random() * 0.7,
            bv.z + out.z * s + (Math.random() - 0.5) * 0.35,
            0.012 + Math.random() * 0.02,
          );
        }
      }
    }
  }

  /** Oil thrown out of a wound by a blow or a tear: `n` drops along `dir`. */
  splash(p: THREE.Vector3, dir: THREE.Vector3, k: number, n = 8 + Math.round(k * 16), speed = 1) {
    for (let i = 0; i < n; i++) {
      const s = (1 + Math.random() * 2.6) * speed;
      this.emit(
        p,
        dir.x * s + (Math.random() - 0.5) * 1.6 * speed,
        dir.y * s * 0.5 + 0.4 + Math.random() * 1.6 * speed,
        dir.z * s + (Math.random() - 0.5) * 1.6 * speed,
        0.01 + Math.random() * 0.026,
      );
    }
  }

  /** A drop of size `s` lands at x, z: feed the puddle it fell in, or start a new one. */
  private splat(x: number, z: number, s: number) {
    const area = s * s * 2.4;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.pUsed; i++) {
      if (this.pPrint[i]) continue;
      const dx = this.pX[i] - x, dz = this.pZ[i] - z;
      const d = dx * dx + dz * dz;
      const r = Math.max(0.05, this.pTarget[i] * 0.95);
      if (d < r * r && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best >= 0) {
      const t = this.pTarget[best];
      this.pTarget[best] = Math.min(POOL_MAX_R, Math.sqrt(t * t + area));
      this.settled = false;
      return;
    }
    this.addPool(x, z, Math.max(0.035, Math.sqrt(area) * 1.3), Math.random(), 0.95, false);
  }

  private addPool(x: number, z: number, target: number, aspect: number, peak: number, print: boolean, rot = Math.random() * Math.PI * 2) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAX_POOLS;
    this.pUsed = Math.max(this.pUsed, i + 1);
    this.pX[i] = x;
    this.pZ[i] = z;
    this.pR[i] = print ? target : target * 0.4;
    this.pTarget[i] = target;
    this.pAspect[i] = 0.75 + aspect * 0.5;
    this.pRot[i] = rot;
    this.pAge[i] = 0;
    this.pPeak[i] = peak;
    this.pPrint[i] = print ? 1 : 0;
    this.settled = false;
  }

  /**
   * Fly the drops, spread the puddles, and let feet that step in oil track it about.
   * `feet` holds every foot still attached (null for a lost leg), in a fixed order.
   * Returns a bit per foot that stepped into a puddle this frame.
   */
  update(dt: number, feet: (THREE.Vector3 | null)[]) {
    this.frameNo++;
    if (dt <= 0) return 0;
    let n = 0;
    const drag = Math.exp(-0.5 * dt);
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.dLive[i]) continue;
      const s = this.dSize[i];
      if (this.dHang[i] > 0) {
        // beading on the wound: swells and sags, following the robot, then drops
        const L = this.dLeak[i]!;
        this.dHang[i] -= dt;
        const t = 1 - this.dHang[i] / this.dHangMax[i];
        const sag = t * t * s * 2.2;
        this.dPos[i * 3] = L.at.x;
        this.dPos[i * 3 + 1] = L.at.y - sag;
        this.dPos[i * 3 + 2] = L.at.z;
        if (this.dHang[i] <= 0) {
          this.dVel[i * 3] = L.vel.x;
          this.dVel[i * 3 + 1] = L.vel.y - 0.2;
          this.dVel[i * 3 + 2] = L.vel.z;
          this.dLeak[i] = null;
        }
        const g = 0.35 + 0.65 * t;
        _s.set(s * g, s * g * (1 + t * 1.3), s * g);
        _m.compose(_p.set(this.dPos[i * 3], this.dPos[i * 3 + 1], this.dPos[i * 3 + 2]), _qi, _s);
        this.drops.setMatrixAt(n++, _m);
        continue;
      }
      this.dVel[i * 3] *= drag;
      this.dVel[i * 3 + 1] = this.dVel[i * 3 + 1] * drag - 9.8 * dt;
      this.dVel[i * 3 + 2] *= drag;
      const x = (this.dPos[i * 3] += this.dVel[i * 3] * dt);
      const y = (this.dPos[i * 3 + 1] += this.dVel[i * 3 + 1] * dt);
      const z = (this.dPos[i * 3 + 2] += this.dVel[i * 3 + 2] * dt);
      const onCanvas = x * x + z * z < CANVAS_R * CANVAS_R;
      if (y <= 0.004 && onCanvas) {
        this.splat(x, z, s);
        this.dLive[i] = 0;
        continue;
      }
      if (y < -3) {
        this.dLive[i] = 0;
        continue;
      }
      // thick oil strings out along its fall
      _v.set(this.dVel[i * 3], this.dVel[i * 3 + 1], this.dVel[i * 3 + 2]);
      const sp = _v.length();
      if (sp > 1e-4) _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / sp));
      else _q.identity();
      const st = 1 + Math.min(2.6, sp * 0.45);
      _s.set(s / Math.sqrt(st), s * st, s / Math.sqrt(st));
      _m.compose(_p.set(x, y, z), _q, _s);
      this.drops.setMatrixAt(n++, _m);
    }
    this.drops.count = n;
    if (n) this.drops.instanceMatrix.needsUpdate = true;

    // oily feet: stepping in a puddle leaves a trail of fading prints
    let stepped = 0;
    for (let f = 0; f < feet.length && f < 4; f++) {
      const p = feet[f];
      if (!p || p.y > PLANTED_Y) continue;
      for (let i = 0; i < this.pUsed; i++) {
        if (this.pPrint[i] || this.pR[i] < 0.06) continue;
        const dx = this.pX[i] - p.x, dz = this.pZ[i] - p.z;
        if (dx * dx + dz * dz < this.pR[i] * this.pR[i]) {
          if (this.oily[f] < 5) stepped |= 1 << f;
          this.oily[f] = 6;
          break;
        }
      }
      const last = this.lastPrint[f];
      const dx = p.x - last.x, dz = p.z - last.z;
      const d2 = dx * dx + dz * dz;
      if (this.oily[f] > 0 && d2 > 0.3 * 0.3) {
        if (d2 < 1.5 * 1.5 && p.x * p.x + p.z * p.z < CANVAS_R * CANVAS_R) {
          // stretched along the stride
          this.addPool(p.x, p.z, 0.075, 0, 0.22 + this.oily[f] * 0.09, true, Math.atan2(dx, dz));
          this.oily[f]--;
        }
        last.set(p.x, 0, p.z);
      } else if (d2 > 0.3 * 0.3) last.set(p.x, 0, p.z);
    }

    if (this.settled) return stepped;
    let moving = false;
    for (let i = 0; i < this.pUsed; i++) {
      this.pAge[i] += dt;
      const gap = this.pTarget[i] - this.pR[i];
      if (gap > 0.0005) {
        // oil is thick: it creeps outward, quickly at first, then slowly
        this.pR[i] += gap * Math.min(1, dt * 1.4);
        moving = true;
      }
      if (this.pAge[i] < 0.2) moving = true;
      const r = this.pR[i];
      _q.setFromAxisAngle(_up, this.pRot[i]);
      // prints are long and narrow; puddles a little oval
      if (this.pPrint[i]) _s.set(r * 1.1, 1, r * 2.4);
      else _s.set(r * this.pAspect[i] * 2, 1, (r * 2) / this.pAspect[i]);
      _m.compose(_p.set(this.pX[i], 0.003, this.pZ[i]), _q, _s);
      this.pools.setMatrixAt(i, _m);
      this.pFade[i] = this.pPeak[i] * Math.min(1, this.pAge[i] * 8);
    }
    this.pools.count = this.pUsed;
    this.pools.instanceMatrix.needsUpdate = true;
    (this.pools.geometry.attributes.aFade as THREE.BufferAttribute).needsUpdate = true;
    this.settled = !moving;
    return stepped;
  }

  /** A new match: a clean canvas. */
  clear() {
    this.dLive.fill(0);
    this.dLeak.fill(null);
    this.drops.count = 0;
    this.pUsed = 0;
    this.pNext = 0;
    this.pools.count = 0;
    this.settled = true;
    this.leaks.clear();
    this.oily.fill(0);
    for (const l of this.lastPrint) l.set(1e9, 0, 0);
  }
}

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
