import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR, ROOF_Y, outline } from './bowl';
import { RenderSettings } from './settings';

/**
 * The arena's production show: moving-head beams on the roof catwalk, flame cannons and spark
 * fountains round the stage, and confetti from the rig when a fight is won.
 *
 * Everything is animated on the GPU from a handful of uniforms, so the CPU only eases a few
 * numbers per frame: the beams are one instanced draw, the pyro and the confetti are one point
 * draw each and are hidden whenever nothing is firing.
 */

type Uniforms = { uTime: { value: number }; uHype: { value: number } };

const ORANGE = new THREE.Color(0xff7a1f);
const CYAN = new THREE.Color(0x3fe0ff);
const WHITE = new THREE.Color(0xfff4e0);

/** Moving heads on the inner catwalk. */
const HEADS = 20;
/** Pyro positions round the stage: even = spark fountain (gerb), odd = flame cannon. */
const EMITTERS = 8;
const PYRO_R = 7.4;
/** Longest particle life of any kind (the smoke), for knowing when the pyro has burnt out. */
const PYRO_LIFE = 2.6;
const CONFETTI_LIFE = 18;

/** Where the show is aiming at a given phase of the night. */
interface Look {
  level: number;
  /** 0 = sweeping the stands, 1 = a rotating fan (ballyhoo). */
  fan: number;
  /** Pull every beam onto the ring. */
  focus: number;
  strobe: number;
  /** 0 = the two corner colours, 1 = everything in `mono`. */
  mono: number;
}

const LOOKS: Record<string, Look> = {
  menu: { level: 0.55, fan: 0, focus: 0, strobe: 0, mono: 0 },
  intro: { level: 0.95, fan: 1, focus: 0, strobe: 0, mono: 1 },
  countdown: { level: 0.85, fan: 0, focus: 1, strobe: 0, mono: 0 },
  // while they fight the beams stay out over the crowd, low, out of the camera's way
  greet: { level: 0.3, fan: 0, focus: 0, strobe: 0, mono: 0 },
  fight: { level: 0.17, fan: 0, focus: 0, strobe: 0, mono: 0 },
  ko: { level: 1, fan: 0, focus: 1, strobe: 1, mono: 1 },
  end: { level: 1, fan: 1, focus: 0, strobe: 0, mono: 1 },
};

export class ArenaShow {
  readonly group = new THREE.Group();
  private beams: THREE.ShaderMaterial | null = null;
  /** Fire and smoke points plus the spark streaks, shown only while something is burning. */
  private pyro = new THREE.Group();
  private fireMat: THREE.ShaderMaterial;
  private confetti: THREE.Points;
  private confettiMat: THREE.ShaderMaterial;
  private emit: THREE.Vector4[] = [];
  /** Last time any emitter is still burning (in uTime seconds). */
  private pyroUntil = -1;
  private look: Look = { ...LOOKS.menu };
  private phase = 'menu';
  private presenting = -1;
  private winner = -1;
  private kick = 0;
  private koAt = -99;
  private time = 0;
  private mono = new THREE.Color();

  constructor(quality: 'low' | 'med' | 'high', private u: Uniforms) {
    if (quality !== 'low') this.buildBeams();
    for (let i = 0; i < EMITTERS; i++) this.emit.push(new THREE.Vector4(0, 0, -99, 0));
    this.fireMat = this.buildPyro(quality);
    const confetti = this.buildConfetti(quality === 'low' ? 700 : quality === 'med' ? 1300 : 2000);
    this.confetti = confetti[0];
    this.confettiMat = confetti[1];
  }

  // ------------------------------------------------------------------ beams

  private buildBeams() {
    // a unit open cone: lamp at the origin, mouth at y = -1, aimed per instance in the shader
    const cone = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, -0.5, 0);
    cone.deleteAttribute('uv');
    cone.deleteAttribute('normal');
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = cone.index;
    geo.setAttribute('position', cone.attributes.position);
    const o = outline(5);
    const total = o[o.length - 1].s;
    const pos = new Float32Array(HEADS * 3), id = new Float32Array(HEADS * 2);
    const heads: THREE.BufferGeometry[] = [];
    let j = 0;
    for (let i = 0; i < HEADS; i++) {
      const s = ((i + 0.5) / HEADS) * total;
      while (j < o.length - 2 && o[j + 1].s < s) j++;
      const a = o[j], b = o[j + 1], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = ROOF_Y + 0.15;
      pos.set([x, y, z], i * 3);
      id.set([i, x < 0 ? 0 : 1], i * 2);
      // the fixture: a yoke under the catwalk with a drum in it
      heads.push(new THREE.BoxGeometry(0.5, 0.12, 0.3).translate(x, y + 0.4, z));
      heads.push(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 8).translate(x, y + 0.1, z));
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aId', new THREE.InstancedBufferAttribute(id, 2));
    geo.instanceCount = HEADS;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.u.uTime,
        uHype: this.u.uHype,
        uLevel: { value: 0 },
        uFan: { value: 0 },
        uFocus: { value: 0 },
        uStrobe: { value: 0 },
        uMono: { value: 0 },
        uWhite: { value: 0 },
        uColA: { value: ORANGE.clone() },
        uColB: { value: CYAN.clone() },
        uColM: { value: WHITE.clone() },
        uGlow: { value: RenderSettings.glow(1.6) },
        uScale: { value: 600 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec2 aId;
        uniform float uTime, uHype, uLevel, uFan, uFocus, uStrobe, uMono, uWhite;
        uniform vec3 uColA, uColB, uColM;
        varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vC;
        // the height of the stands at offset d out from the front row
        float standY(float d) { return d < 13.5 ? -0.1 + d * 0.47 : 9.4 + (d - 13.5) * 0.66; }
        void main() {
          float i = aId.x, dirn = mod(i, 2.0) * 2.0 - 1.0;
          float t = uTime * (0.6 + 0.6 * uHype);
          // sweeping the seats, each head on its own lazy loop
          float a = i * 0.314 + t * 0.11 * dirn + 0.6 * sin(t * 0.17 + i);
          float d = 8.0 + 9.0 * (0.5 + 0.5 * sin(t * 0.23 + i * 1.7));
          vec3 sweep = vec3(cos(a) * (13.0 + d), standY(d), sin(a) * (10.0 + d));
          // ballyhoo: a fan of beams wheeling round under the roof
          float b = i * 1.2566 + uTime * 0.9 * dirn;
          float s = 0.55 + 0.45 * sin(uTime * 1.3 + i * 0.7);
          vec3 fan = aPos + normalize(vec3(cos(b) * s, -1.0, sin(b) * s)) * 34.0;
          // on the ring, circling just off the centre
          float c = i * 2.39996 + uTime * 1.4;
          vec3 ring = vec3(cos(c) * 1.4, 0.4, sin(c) * 1.4);
          vec3 tgt = mix(mix(sweep, fan, uFan), ring, uFocus);
          vec3 dv = tgt - aPos;
          float len = length(dv) * 1.1;
          vec3 dir = dv / length(dv);
          vec3 ref = abs(dir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 u = normalize(cross(ref, dir)), w = cross(dir, u);
          float along = -position.y;
          vec3 radial = u * position.x + w * position.z;
          vec3 p = aPos + dir * along * len + radial * (0.1 + along * len * 0.045);
          vT = along;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * radial);
          vV = normalize(-mv.xyz);
          vec3 col = mix(mix(uColA, uColB, aId.y), uColM, uMono);
          float strobe = mix(1.0, step(0.45, fract(uTime * 6.0 + i * 0.37)), uStrobe);
          float flick = 0.75 + 0.25 * sin(uTime * 0.7 + i * 2.1);
          vC = mix(col, vec3(1.0), uWhite) * uLevel * strobe * flick * (1.0 + uWhite);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow;
        varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vC;
        void main() {
          // brightest through the middle of the shaft, nothing at its edges
          float edge = abs(dot(normalize(vN), normalize(vV)));
          edge *= edge;
          // hot at the lens, thinning out through the haze
          float k = (0.06 + 0.5 * (1.0 - vT) * (1.0 - vT)) * (1.0 - smoothstep(0.82, 1.0, vT));
          gl_FragColor = vec4(vC * edge * k * 0.42 * uGlow, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = 'showBeams';
    this.beams = mat;
    this.group.add(mesh);
    this.group.add(new THREE.Mesh(mergeGeometries(heads)!, new THREE.MeshBasicMaterial({ color: 0x14171d })));
    // the lenses: points that take the beams' colour and level
    const lens = new THREE.BufferGeometry();
    lens.setAttribute('position', new THREE.BufferAttribute(pos.map((v, k) => (k % 3 === 1 ? v - 0.12 : v)), 3));
    lens.setAttribute('aId', new THREE.BufferAttribute(id, 2));
    const lensMat = new THREE.ShaderMaterial({
      uniforms: mat.uniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aId;
        uniform float uTime, uLevel, uStrobe, uMono, uWhite, uScale;
        uniform vec3 uColA, uColB, uColM;
        varying vec3 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float strobe = mix(1.0, step(0.45, fract(uTime * 6.0 + aId.x * 0.37)), uStrobe);
          vC = mix(mix(mix(uColA, uColB, aId.y), uColM, uMono), vec3(1.0), 0.5 + 0.5 * uWhite) * (0.25 + uLevel) * strobe;
          gl_PointSize = uScale * 0.55 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow; varying vec3 vC;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
          gl_FragColor = vec4(vC * uGlow * smoothstep(0.25, 0.02, r), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lenses = new THREE.Points(lens, lensMat);
    lenses.frustumCulled = false;
    this.group.add(lenses);
  }

  // ------------------------------------------------------------------ pyro

  /**
   * Flame cannons and gerbs. The fire is one point draw of flame and smoke sprites with
   * premultiplied blending, so the flames add light while the smoke after them darkens what is
   * behind it. The sparks are one instanced draw of streaks stretched along their motion.
   */
  private buildPyro(quality: 'low' | 'med' | 'high'): THREE.ShaderMaterial {
    for (let i = 0; i < EMITTERS; i++) {
      const a = (i / EMITTERS) * Math.PI * 2;
      this.emit[i].set(Math.cos(a) * PYRO_R, Math.sin(a) * PYRO_R, -99, 0);
    }
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const k = quality === 'low' ? 0.5 : 1;

    // the hardware on the floor: a squat cannon or a gerb tube in a weighted base
    const kit: THREE.BufferGeometry[] = [];
    this.emit.forEach((e, i) => {
      if (i % 2) {
        kit.push(new THREE.BoxGeometry(0.55, 0.22, 0.55).translate(e.x, FLOOR + 0.11, e.y));
        kit.push(new THREE.CylinderGeometry(0.11, 0.15, 0.3, 10).translate(e.x, FLOOR + 0.37, e.y));
      } else {
        kit.push(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 10).translate(e.x, FLOOR + 0.06, e.y));
        kit.push(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8).translate(e.x, FLOOR + 0.23, e.y));
      }
    });
    this.group.add(new THREE.Mesh(mergeGeometries(kit)!, new THREE.MeshBasicMaterial({ color: 0x16181d })));

    const common = /* glsl */ `
      uniform float uTime, uFloor;
      uniform vec4 uEmit[EMITTERS];
      float hash(float n) { return fract(sin(n) * 43758.5453); }
    `;

    // ---- fire and smoke
    const flamePer = Math.round(90 * k), smokePer = Math.round(26 * k);
    const per = flamePer + smokePer;
    const n = per * (EMITTERS / 2);
    const geo = new THREE.BufferGeometry();
    // positions are made in the shader; this only gives the draw its vertex count
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const e = new Float32Array(n), r = new Float32Array(n * 4), kind = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      e[i] = Math.floor(i / per) * 2 + 1;
      kind[i] = i % per < flamePer ? 0 : 1;
      r.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    }
    geo.setAttribute('aE', new THREE.BufferAttribute(e, 1));
    geo.setAttribute('aR', new THREE.BufferAttribute(r, 4));
    geo.setAttribute('aK', new THREE.BufferAttribute(kind, 1));
    const fireMat = new THREE.ShaderMaterial({
      defines: { EMITTERS },
      uniforms: {
        uTime: this.u.uTime,
        uEmit: { value: this.emit },
        uScale: { value: 600 },
        uGlow: { value: RenderSettings.glow(2.2) },
        uFloor: { value: FLOOR },
      },
      vertexShader: /* glsl */ `
        ${common}
        attribute float aE, aK; attribute vec4 aR;
        uniform float uScale;
        varying float vHeat, vA, vSmoke, vSeed, vK;
        void main() {
          vec4 em = uEmit[int(aE + 0.5)];
          float L = aK > 0.5 ? 2.4 : 0.95;
          float age = uTime - em.z;
          // a steady stream for as long as the cannon burns: each particle relaunches every L seconds
          float tau = mod(age - aR.x * L, L);
          float born = age - tau;
          float alive = step(0.0, born) * step(born, em.w);
          float k = tau / L;
          vec3 base = vec3(em.x, uFloor + 0.5, em.y);
          vec3 p; float size;
          if (aK < 0.5) {
            // a jet that leaves the nozzle tight and fast, slows, and blooms into a rolling ball
            float rise = 15.0 * tau - 7.0 * tau * tau;
            float spread = 0.06 + 1.5 * k * k + 0.25 * k;
            float a = aR.y * 6.2831853 + tau * (2.5 + aR.z * 3.0);
            float rr = spread * sqrt(aR.z);
            p = base + vec3(cos(a) * rr, rise + (aR.w - 0.5) * 0.6 * k, sin(a) * rr);
            size = 0.32 + 2.1 * k * (0.7 + 0.6 * aR.w);
            // hottest in the jet's core, cooling as it climbs and spreads
            vHeat = (1.0 - k) * (1.15 - 0.5 * sqrt(aR.z));
            vA = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.55, 1.0, k));
            vSmoke = 0.0;
          } else {
            // the smoke the fireball leaves behind, rising and spreading out
            float a = aR.y * 6.2831853;
            float rr = 0.4 + 1.3 * k * aR.z;
            p = base + vec3(cos(a) * rr, 5.5 + 3.0 * tau + aR.w * 0.8, sin(a) * rr);
            size = 1.2 + 2.6 * k;
            vHeat = 0.25 * (1.0 - smoothstep(0.0, 0.2, k));
            vA = smoothstep(0.0, 0.18, k) * (1.0 - k) * 0.55;
            vSmoke = 1.0;
          }
          vSeed = aR.y * 37.0 + aR.w * 11.0;
          vK = k;
          vA *= alive;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = alive * uScale * size / -mv.z;
          gl_Position = alive > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow, uTime;
        varying float vHeat, vA, vSmoke, vSeed, vK;
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y);
        }
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          d.y = -d.y;
          // billowing edge: the sprite's outline and its inside both churn as it rises
          vec2 q = d * 3.0 + vec2(vSeed, vSeed * 0.7 - uTime * 2.0);
          float n = noise(q) * 0.65 + noise(q * 2.3 + 5.0) * 0.35;
          float r = length(d) * 2.0 + (n - 0.5) * 0.55;
          float body = 1.0 - smoothstep(0.45, 1.0, r);
          if (body <= 0.0) discard;
          if (vSmoke > 0.5) {
            float a = body * vA * (0.6 + 0.6 * n);
            vec3 c = mix(vec3(0.05, 0.05, 0.055), vec3(0.9, 0.35, 0.08), vHeat) * (0.5 + 0.5 * n);
            gl_FragColor = vec4(c * a, a);
            return;
          }
          // temperature to colour: deep red, orange, yellow, white-hot core
          float t = clamp(vHeat * (0.55 + 0.75 * body) * (0.75 + 0.5 * n), 0.0, 1.2);
          vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.3, 0.02), smoothstep(0.0, 0.35, t));
          c = mix(c, vec3(1.0, 0.72, 0.18), smoothstep(0.35, 0.7, t));
          c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.1, t));
          float a = body * vA;
          // light adds up; the cooler outer flame and soot hold back a little of what is behind
          gl_FragColor = vec4(c * a * uGlow * (0.45 + 0.55 * t), a * 0.25 * (1.0 - t * 0.6) + a * 0.35 * vK * vK);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const fire = new THREE.Points(geo, fireMat);
    fire.frustumCulled = false;
    fire.name = 'fire';
    // after the beams and boards, so the smoke can darken them
    fire.renderOrder = 2;
    this.pyro.add(fire);

    // ---- sparks: gerb fountains on the even emitters, embers off the flames on the odd ones
    const sparkPer = Math.round(170 * k), emberPer = Math.round(40 * k);
    const sn = (sparkPer + emberPer) * (EMITTERS / 2);
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = quad.index;
    sg.setAttribute('position', quad.attributes.position);
    const se = new Float32Array(sn), sr = new Float32Array(sn * 4);
    let w = 0;
    for (let i = 0; i < EMITTERS; i++)
      for (let j = 0; j < (i % 2 ? emberPer : sparkPer); j++) {
        se[w] = i;
        sr.set([rnd(), rnd(), rnd(), rnd()], w * 4);
        w++;
      }
    sg.setAttribute('aE', new THREE.InstancedBufferAttribute(se, 1));
    sg.setAttribute('aR', new THREE.InstancedBufferAttribute(sr, 4));
    sg.instanceCount = sn;
    const sparkMat = new THREE.ShaderMaterial({
      defines: { EMITTERS },
      uniforms: { uTime: this.u.uTime, uEmit: { value: this.emit }, uFloor: { value: FLOOR }, uGlow: { value: RenderSettings.glow(2.4) } },
      vertexShader: /* glsl */ `
        ${common}
        attribute float aE; attribute vec4 aR;
        varying vec3 vC; varying float vA; varying float vV;
        // where a spark launched at the nozzle is tau seconds later
        vec3 at(vec3 base, vec3 v, float tau, float drag, float g) {
          float f = (1.0 - exp(-drag * tau)) / drag;
          return base + vec3(v.x * f, v.y * f - g * (tau - f) / drag, v.z * f);
        }
        void main() {
          vec4 em = uEmit[int(aE + 0.5)];
          bool ember = mod(aE, 2.0) > 0.5;
          float L = ember ? 1.8 : 1.25 + aR.w * 0.45;
          float age = uTime - em.z;
          float tau = mod(age - aR.x * L, L);
          float born = age - tau;
          float alive = step(0.0, born) * step(born, em.w);
          float k = tau / L;
          float a = aR.y * 6.2831853;
          vec3 base, v; float drag, g;
          if (ember) {
            // embers flung from the fireball, drifting up in its heat
            base = vec3(em.x, uFloor + 2.5 + aR.z * 3.0, em.y);
            float s = 1.0 + aR.z * 3.0;
            v = vec3(cos(a) * s, 2.0 + aR.w * 4.0, sin(a) * s);
            drag = 1.6; g = -1.5;
          } else {
            // a tight, tall fountain with a few wild ones
            float s = (0.15 + 0.9 * aR.z * aR.z) * (aR.w > 0.92 ? 3.0 : 1.0);
            base = vec3(em.x, uFloor + 0.36, em.y);
            v = vec3(cos(a) * s, 9.5 + aR.w * 4.0, sin(a) * s);
            drag = 0.55; g = 9.8;
          }
          vec3 head = at(base, v, tau, drag, g);
          vec3 tail = at(base, v, max(0.0, tau - (ember ? 0.06 : 0.045)), drag, g);
          alive *= step(uFloor, head.y);
          vec4 hv = modelViewMatrix * vec4(head, 1.0), tv = modelViewMatrix * vec4(tail, 1.0);
          vec4 pv = mix(tv, hv, position.x);
          // widen across the streak in view space, so it always faces the camera
          vec2 dir = hv.xy - tv.xy;
          float len = length(dir);
          vec2 side = len > 1e-4 ? vec2(-dir.y, dir.x) / len : vec2(1.0, 0.0);
          float width = ember ? 0.022 : 0.014 + 0.01 * (1.0 - k);
          pv.xy += side * position.y * width;
          gl_Position = alive > 0.0 ? projectionMatrix * pv : vec4(2.0, 2.0, 2.0, 1.0);
          vV = position.x;
          // white-hot when fresh, gold, then orange and crackling out at the end
          vC = ember ? mix(vec3(1.0, 0.6, 0.2), vec3(0.9, 0.18, 0.02), k) : mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.5, 0.1), smoothstep(0.2, 1.0, k));
          float crackle = mix(1.0, step(0.45, hash(aR.y * 91.0 + floor(uTime * 24.0))) * 1.8, smoothstep(0.6, 0.8, k));
          vA = alive * (1.0 - k * k) * crackle;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow;
        varying vec3 vC; varying float vA; varying float vV;
        void main() {
          // bright at the head, fading along the tail
          gl_FragColor = vec4(vC * vA * uGlow * (0.25 + 0.75 * vV), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const sparks = new THREE.Mesh(sg, sparkMat);
    sparks.frustumCulled = false;
    sparks.name = 'sparks';
    this.pyro.add(sparks);

    this.pyro.visible = false;
    this.pyro.name = 'pyro';
    this.group.add(this.pyro);
    return fireMat;
  }

  // ------------------------------------------------------------------ confetti

  private buildConfetti(n: number): [THREE.Points, THREE.ShaderMaterial] {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const r = new Float32Array(n * 4);
    let seed = 0x2545f491;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < n; i++) r.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    geo.setAttribute('aR', new THREE.BufferAttribute(r, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.u.uTime,
        uStart: { value: -99 },
        uScale: { value: 600 },
        uCol: { value: ORANGE.clone() },
        uFloor: { value: FLOOR },
        uLife: { value: CONFETTI_LIFE },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aR;
        uniform float uTime, uStart, uScale, uFloor, uLife;
        uniform vec3 uCol;
        varying vec3 vC; varying float vSpin;
        void main() {
          // released over the first two seconds from the rig, spread over the ring and the floor
          float tau = uTime - uStart - aR.x * 2.0;
          float alive = step(0.0, tau) * step(tau, uLife);
          float rad = sqrt(aR.y) * 15.0, a = aR.z * 6.2831853;
          float fall = 1.6 + aR.w * 1.2;
          float y0 = 22.0 + aR.x * 2.0;
          float ground = rad < 5.6 ? 0.03 : uFloor + 0.02;
          float y = max(ground, y0 - fall * tau);
          float air = step(ground + 0.001, y);
          // fluttering: drifting side to side and flipping while it falls
          float sway = sin(tau * (1.5 + aR.w) + aR.y * 40.0) * 0.6 * min(tau, (y0 - ground) / fall);
          vec3 p = vec3(cos(a) * rad + sway, y, sin(a) * rad + cos(tau * 1.1 + aR.z * 30.0) * 0.4);
          vSpin = mix(1.0, abs(sin(tau * (6.0 + aR.w * 6.0) + aR.x * 50.0)), air);
          float pick = fract(aR.w * 7.13);
          vec3 col = pick < 0.45 ? uCol : pick < 0.7 ? vec3(1.0, 0.82, 0.3) : pick < 0.9 ? vec3(0.95) : uCol * 0.6 + 0.4;
          // a flash of the light from above as a piece turns face-up
          vC = col * (0.55 + 0.45 * vSpin) * (1.0 - 0.35 * (1.0 - air));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = alive * uScale * 0.075 / -mv.z;
          gl_Position = alive > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vSpin;
        void main() {
          // a little rectangle that narrows as it turns edge-on
          vec2 d = abs(gl_PointCoord - 0.5);
          if (d.y > 0.5 * max(0.18, vSpin) || d.x > 0.32) discard;
          gl_FragColor = vec4(vC, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.name = 'confetti';
    this.group.add(pts);
    return [pts, mat];
  }

  // ------------------------------------------------------------------ cues

  /** Light the emitters picked by `which` for `dur` seconds, `delay` from now. */
  private fire(which: (i: number) => boolean, dur: number, delay = 0) {
    const t = this.time + delay;
    for (let i = 0; i < EMITTERS; i++) {
      if (!which(i)) continue;
      const e = this.emit[i];
      // already burning: stretch the current burst rather than restarting the particles
      if (e.z <= t && t <= e.z + e.w) e.w = Math.max(e.w, t + dur - e.z);
      else e.set(e.x, e.y, t, dur);
    }
    this.pyroUntil = Math.max(this.pyroUntil, t + dur + PYRO_LIFE);
    this.pyro.visible = true;
  }

  private static gerb = (i: number) => i % 2 === 0;
  private static flame = (i: number) => i % 2 === 1;

  /** Match events. */
  event(type: string, data?: unknown) {
    const d = data as { winner?: { index: number } | null } | undefined;
    switch (type) {
      case 'fightStart':
        // FIGHT!: every cannon at once, twice
        this.fire(ArenaShow.flame, 0.35);
        this.fire(ArenaShow.flame, 0.35, 0.55);
        this.kick = 1;
        break;
      case 'knockdown':
        this.kick = Math.max(this.kick, 0.8);
        break;
      case 'finisher':
        this.fire(ArenaShow.flame, 0.5);
        this.kick = 1;
        break;
      case 'ko':
        this.winner = d?.winner ? d.winner.index : -1;
        this.koAt = this.time;
        this.fire(ArenaShow.flame, 0.45, 0.1);
        this.fire(ArenaShow.flame, 0.45, 0.8);
        this.fire(ArenaShow.gerb, 4, 0.4);
        this.kick = 1;
        break;
      case 'end':
      case 'decision': {
        if (d?.winner) this.winner = d.winner.index;
        const m = this.confettiMat.uniforms;
        if (this.time - m.uStart.value < 4) break;
        m.uStart.value = this.time + 0.3;
        (m.uCol.value as THREE.Color).copy(this.winner === 1 ? CYAN : this.winner === 0 ? ORANGE : WHITE);
        this.confetti.visible = true;
        this.fire(ArenaShow.gerb, 5, 0.3);
        break;
      }
    }
  }

  /** What the night is at: a match phase, or 'menu' when no fight is on. */
  setPhase(phase: string, presenting = -1) {
    if (phase !== this.phase) {
      // the first bot walks out to a wall of sparks
      if (phase === 'intro') this.fire(ArenaShow.gerb, 2.5, 0.2);
      if (phase === 'menu' || phase === 'intro') this.winner = -1;
      this.phase = phase;
    }
    // each bot gets its own sparks as it is presented
    if (presenting !== this.presenting && presenting === 1) this.fire(ArenaShow.gerb, 2.5, 0.1);
    this.presenting = presenting;
  }

  setPixelScale(h: number) {
    this.fireMat.uniforms.uScale.value = h;
    this.confettiMat.uniforms.uScale.value = h;
    if (this.beams) this.beams.uniforms.uScale.value = h;
  }

  update(dt: number, time: number, hype: number) {
    this.time = time;
    if (this.pyro.visible && time > this.pyroUntil) this.pyro.visible = false;
    if (this.confetti.visible && time - this.confettiMat.uniforms.uStart.value > CONFETTI_LIFE + 2.5) this.confetti.visible = false;
    const b = this.beams;
    if (!b) return;
    const want = LOOKS[this.phase] ?? LOOKS.menu;
    // the KO strobe gives way to a steady wash in the winner's colour
    const strobe = this.phase === 'ko' && time - this.koAt > 2.5 ? 0 : want.strobe;
    const ease = 1 - Math.exp(-dt * 2.2);
    const L = this.look;
    L.level += (want.level * (0.85 + 0.25 * Math.min(1, hype)) - L.level) * ease;
    L.fan += (want.fan - L.fan) * ease;
    L.focus += (want.focus - L.focus) * ease;
    L.strobe = strobe;
    L.mono += (want.mono - L.mono) * ease;
    this.kick = Math.max(0, this.kick - dt * 1.6);
    // the colour everything turns to: the presented bot's corner, then the winner's
    const side = this.phase === 'intro' ? this.presenting : this.winner;
    this.mono.lerp(side === 0 ? ORANGE : side === 1 ? CYAN : WHITE, ease);
    const u = b.uniforms;
    u.uLevel.value = Math.min(1.4, L.level + this.kick * 0.5);
    u.uFan.value = L.fan;
    u.uFocus.value = Math.min(1, L.focus + this.kick * 0.6);
    u.uStrobe.value = L.strobe;
    u.uMono.value = L.mono;
    u.uWhite.value = this.kick * 0.6;
    (u.uColM.value as THREE.Color).copy(this.mono);
  }
}
