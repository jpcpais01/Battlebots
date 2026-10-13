import * as THREE from 'three';
import { RING_RADIUS } from './arena';

/** Falling oil drops in flight at once. */
const MAX_DROPS = 240;
/** Puddles and oily footprints on the canvas (one instanced draw). */
const MAX_POOLS = 96;
/** Drops that land inside this radius splat onto the canvas; the rest fall off the stage. */
const CANVAS_R = (RING_RADIUS + 0.5) * Math.cos(Math.PI / 8);
const POOL_MAX_R = 0.42;
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
    grad.addColorStop(0.72, 'rgba(255,255,255,1)');
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

interface Leak {
  prev: THREE.Vector3;
  /** Frame the leak last ran on, to tell a fresh start from a continuing one. */
  seen: number;
  pulse: number;
}

/**
 * Oil bleeding out of a wrecked chest or lower torso: glossy drops that dribble and spurt
 * from the wound, splat on the canvas and spread into puddles, which the robots then track
 * across the ring in oily footprints.
 *
 * Purely visual (Math.random is fine here): nothing in the sim reads any of it.
 */
export class Oil {
  readonly group = new THREE.Group();
  // drops: CPU simulated points
  private dPos = new Float32Array(MAX_DROPS * 3);
  private dVel = new Float32Array(MAX_DROPS * 3);
  private dSize = new Float32Array(MAX_DROPS);
  private dShown = new Float32Array(MAX_DROPS);
  private dLive = new Uint8Array(MAX_DROPS);
  private dNext = 0;
  private dropGeo = new THREE.BufferGeometry();
  private drops: THREE.Points;
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
  private pFade: Float32Array;
  private pUsed = 0;
  private pNext = 0;
  private settled = true;
  private leaks = new Map<number, Leak>();
  private frameNo = 0;
  // per foot: prints left to stamp, and where the last one went
  private oily = [0, 0, 0, 0];
  private lastPrint = [0, 1, 2, 3].map(() => new THREE.Vector3(1e9, 0, 0));

  constructor() {
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dropGeo.setAttribute('size', new THREE.BufferAttribute(this.dShown, 1).setUsage(THREE.DynamicDrawUsage));
    this.drops = new THREE.Points(
      this.dropGeo,
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: /* glsl */ `
          attribute float size; uniform float uScale;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
        // each drop is a tiny glossy sphere: near-black with an amber rim and a hard glint
        fragmentShader: /* glsl */ `
          void main(){
            vec2 c = gl_PointCoord * 2. - 1.;
            float r2 = dot(c, c);
            if (r2 > 1.) discard;
            vec3 n = vec3(c.x, -c.y, sqrt(1. - r2));
            float spec = pow(max(0., dot(n, normalize(vec3(-0.35, 0.6, 0.72)))), 28.);
            vec3 col = vec3(0.02, 0.016, 0.012) + vec3(0.13, 0.075, 0.025) * pow(1. - n.z, 2.) + vec3(0.75, 0.68, 0.55) * spec;
            gl_FragColor = vec4(col, smoothstep(1., 0.8, r2));
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    this.group.add(this.drops);

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.pFade = new Float32Array(MAX_POOLS);
    geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.pFade, 1).setUsage(THREE.DynamicDrawUsage));
    // wet black oil: glossy enough to mirror the ring lights, with a faint rainbow film on top
    const mat = new THREE.MeshStandardMaterial({
      color: 0x060504,
      roughness: 0.12,
      metalness: 0.1,
      alphaMap: blobTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;\nvarying vec2 vOilUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFade = aFade;\nvOilUv = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;\nvarying vec2 vOilUv;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float graze = 1.0 - abs(dot(normalize(vViewPosition), normal));
            vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + graze * 1.6 + (vOilUv.x + vOilUv.y) * 1.3));
            totalEmissiveRadiance += film * 0.03 * vFade;
          }`,
        );
    };
    this.pools = new THREE.InstancedMesh(geo, mat, MAX_POOLS);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.frustumCulled = false;
    this.pools.count = 0;
    this.pools.receiveShadow = true;
    this.pools.renderOrder = -1;
    this.group.add(this.pools);
  }

  setPixelScale(h: number) {
    (this.drops.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.5;
  }

  private emit(p: THREE.Vector3, vx: number, vy: number, vz: number, size: number) {
    const i = this.dNext;
    this.dNext = (this.dNext + 1) % MAX_DROPS;
    this.dPos[i * 3] = p.x;
    this.dPos[i * 3 + 1] = p.y;
    this.dPos[i * 3 + 2] = p.z;
    this.dVel[i * 3] = vx;
    this.dVel[i * 3 + 1] = vy;
    this.dVel[i * 3 + 2] = vz;
    this.dSize[i] = size;
    this.dLive[i] = 1;
  }

  /**
   * Keep a wound bleeding for this frame. `id` names the wound (so its spurts keep their own
   * rhythm and it knows how fast it is moving), `out` is the unit direction it faces and
   * `k` 0..1 how bad it is: a slow dribble at first, then a steady stream that pumps out in
   * spurts as the part fails.
   */
  leak(id: number, at: THREE.Vector3, out: THREE.Vector3, k: number, dt: number) {
    if (dt <= 0) return;
    let L = this.leaks.get(id);
    if (!L) {
      L = { prev: at.clone(), seen: -1, pulse: Math.random() };
      this.leaks.set(id, L);
    }
    // the drops leave with the body's own motion, so a swaying robot flings them about
    if (L.seen === this.frameNo - 1) _bv.subVectors(at, L.prev).divideScalar(dt).clampLength(0, 6).multiplyScalar(0.75);
    else _bv.set(0, 0, 0);
    L.prev.copy(at);
    L.seen = this.frameNo;

    const rate = 2.5 + k * k * 22;
    let n = Math.floor(dt * rate);
    if (Math.random() < dt * rate - n) n++;
    for (let i = 0; i < n; i++) {
      const s = (0.15 + Math.random() * 0.5) * (0.4 + k);
      this.emit(
        _p.set(at.x + (Math.random() - 0.5) * 0.04, at.y + (Math.random() - 0.5) * 0.04, at.z + (Math.random() - 0.5) * 0.04),
        _bv.x + out.x * s + (Math.random() - 0.5) * 0.2,
        _bv.y + (Math.random() - 0.6) * 0.3,
        _bv.z + out.z * s + (Math.random() - 0.5) * 0.2,
        0.018 + Math.random() * 0.018 + k * 0.012,
      );
    }
    // a failing pump: rhythmic spurts once it is bad
    if (k > 0.35) {
      L.pulse -= dt * (0.9 + k * 1.1);
      if (L.pulse <= 0) {
        L.pulse += 0.7 + Math.random() * 0.6;
        const m = 3 + Math.round(k * 9);
        for (let i = 0; i < m; i++) {
          const s = (0.9 + Math.random() * 1.2) * (0.6 + k);
          this.emit(
            at,
            _bv.x + out.x * s + (Math.random() - 0.5) * 0.5,
            _bv.y + 0.4 + Math.random() * 0.9,
            _bv.z + out.z * s + (Math.random() - 0.5) * 0.5,
            0.016 + Math.random() * 0.024,
          );
        }
      }
    }
  }

  /** A blow to a bleeding part splashes oil out along the punch. */
  splash(p: THREE.Vector3, dir: THREE.Vector3, k: number) {
    const n = 6 + Math.round(k * 14);
    for (let i = 0; i < n; i++) {
      const s = 1.2 + Math.random() * 2.4;
      this.emit(p, dir.x * s + (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.8, dir.z * s + (Math.random() - 0.5) * 1.6, 0.016 + Math.random() * 0.026);
    }
  }

  /** A drop of size `s` lands at x, z: feed the puddle it fell in, or start a new one. */
  private splat(x: number, z: number, s: number) {
    const area = s * s * 2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.pUsed; i++) {
      if (this.pPrint[i]) continue;
      const dx = this.pX[i] - x, dz = this.pZ[i] - z;
      const d = dx * dx + dz * dz;
      const r = Math.max(0.04, this.pTarget[i] * 0.9);
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
    this.addPool(x, z, Math.max(0.035, Math.sqrt(area) * 1.3), 0.25 + Math.random() * 0.75, 0.92, false);
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
   */
  update(dt: number, feet: (THREE.Vector3 | null)[]) {
    this.frameNo++;
    if (dt <= 0) return;
    let any = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.dLive[i]) {
        this.dShown[i] = 0;
        continue;
      }
      any = true;
      const drag = Math.exp(-0.6 * dt);
      this.dVel[i * 3] *= drag;
      this.dVel[i * 3 + 1] = this.dVel[i * 3 + 1] * drag - 9.8 * dt;
      this.dVel[i * 3 + 2] *= drag;
      const x = (this.dPos[i * 3] += this.dVel[i * 3] * dt);
      const y = (this.dPos[i * 3 + 1] += this.dVel[i * 3 + 1] * dt);
      const z = (this.dPos[i * 3 + 2] += this.dVel[i * 3 + 2] * dt);
      const onCanvas = x * x + z * z < CANVAS_R * CANVAS_R;
      if (y <= 0.005 && onCanvas) {
        this.splat(x, z, this.dSize[i]);
        this.dLive[i] = 0;
        this.dShown[i] = 0;
      } else if (y < -3) {
        this.dLive[i] = 0;
        this.dShown[i] = 0;
      } else {
        // falling fast reads as a longer streak: a little bigger
        this.dShown[i] = this.dSize[i] * (1 + Math.min(0.6, Math.abs(this.dVel[i * 3 + 1]) * 0.08));
      }
    }
    this.drops.visible = any;
    if (any) {
      this.dropGeo.attributes.position.needsUpdate = true;
      this.dropGeo.attributes.size.needsUpdate = true;
    }

    // oily feet: stepping in a puddle leaves a trail of fading prints
    for (let f = 0; f < feet.length && f < 4; f++) {
      const p = feet[f];
      if (!p || p.y > PLANTED_Y) continue;
      for (let i = 0; i < this.pUsed; i++) {
        if (this.pPrint[i] || this.pR[i] < 0.06) continue;
        const dx = this.pX[i] - p.x, dz = this.pZ[i] - p.z;
        if (dx * dx + dz * dz < this.pR[i] * this.pR[i]) {
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

    if (this.settled) return;
    let moving = false;
    for (let i = 0; i < this.pUsed; i++) {
      this.pAge[i] += dt;
      const gap = this.pTarget[i] - this.pR[i];
      if (gap > 0.0005) {
        // oil creeps outward, quickly at first
        this.pR[i] += gap * Math.min(1, dt * 2.2);
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
  }

  /** A new match: a clean canvas. */
  clear() {
    this.dLive.fill(0);
    this.dShown.fill(0);
    this.drops.visible = false;
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
const _bv = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
