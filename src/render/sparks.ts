import * as THREE from 'three';
import { groundAt } from './debris';
import { RenderSettings } from './settings';

const MAX = 640;

/**
 * Hot metal sparks as motion-blurred streaks. Each spark is one instance of a quad that the
 * vertex shader stretches on screen from where the spark is back along its velocity, so a fast
 * spark reads as a line in the direction it flies and a slow one as a dot. They start white
 * hot, cool through their tint to a dull ember, bounce and skid on whatever is underfoot, and
 * the whole pool is one draw call.
 */
export class Sparks {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  /** x: heat (1 fresh .. 0 dead), y: width in metres (0 = unused). */
  private misc = new Float32Array(MAX * 2);
  private life = new Float32Array(MAX);
  private max = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private next = 0;
  private live = 0;
  private uniforms = {
    uScale: { value: 600 },
    uHalf: { value: new THREE.Vector2(400, 300) },
    uStreak: { value: 0.028 },
    uGlow: { value: 1 },
  };

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    // x across the streak (-1..1), y along it (0 head .. 1 tail)
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const attr = (a: Float32Array, n: number) => new THREE.InstancedBufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', attr(this.pos, 3));
    g.setAttribute('iVel', attr(this.vel, 3));
    g.setAttribute('iCol', attr(this.col, 3));
    g.setAttribute('iMisc', attr(this.misc, 2));
    g.instanceCount = MAX;
    this.geo = g;
    this.uniforms.uGlow.value = RenderSettings.glow(4);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iCol; attribute vec2 iMisc;
        uniform float uScale; uniform vec2 uHalf; uniform float uStreak;
        varying vec3 vC; varying vec2 vUv; varying float vHeat;
        void main(){
          vec4 mh = modelViewMatrix * vec4(iPos, 1.);
          if (iMisc.y <= 0. || mh.z > -0.06) { gl_Position = vec4(2., 2., 2., 1.); return; }
          vec3 v = (modelViewMatrix * vec4(iVel, 0.)).xyz;
          vec4 mt = vec4(mh.xyz - v * uStreak, 1.);
          mt.z = min(mt.z, -0.06);
          vec4 ch = projectionMatrix * mh;
          vec4 ct = projectionMatrix * mt;
          vec2 sh = ch.xy / ch.w * uHalf;
          vec2 st = ct.xy / ct.w * uHalf;
          vec2 d = sh - st;
          float len = length(d);
          vec2 dir = len > 1e-3 ? d / len : vec2(0., 1.);
          vec2 perp = vec2(-dir.y, dir.x);
          // never thinner than a pixel and a bit, or it shimmers in and out
          float w = max(1.3, iMisc.y * projectionMatrix[1][1] * uHalf.y / -mh.z);
          vec2 px = mix(sh, st, position.y) + dir * w * 0.5 * (1. - 2. * position.y) + perp * w * 0.5 * position.x;
          float cw = mix(ch.w, ct.w, position.y);
          float cz = mix(ch.z / ch.w, ct.z / ct.w, position.y);
          gl_Position = vec4(px / uHalf * cw, cz * cw, cw);
          vC = iCol; vUv = position.xy; vHeat = iMisc.x;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow;
        varying vec3 vC; varying vec2 vUv; varying float vHeat;
        void main(){
          float across = 1. - vUv.x * vUv.x;
          float a = across * mix(1., 0.12, vUv.y) * smoothstep(0., 0.18, vHeat);
          if (a < 0.01) discard;
          // white hot, then the spark's own colour, then a dull red ember
          vec3 c = vHeat > 0.55 ? mix(vC, vec3(1., 0.96, 0.88), (vHeat - 0.55) / 0.45) : mix(vec3(0.85, 0.16, 0.03), vC, vHeat / 0.55);
          gl_FragColor = vec4(c * uGlow * (0.45 + 0.9 * vHeat) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setPixelScale(h: number) {
    this.uniforms.uScale.value = h * 0.5;
  }

  /** One spark at p flying with (vx, vy, vz). */
  emit(p: THREE.Vector3, vx: number, vy: number, vz: number, color: THREE.Color, life: number, width: number, drag = 1.4, grav = 9) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i3] = color.r;
    this.col[i3 + 1] = color.g;
    this.col[i3 + 2] = color.b;
    this.misc[i * 2] = 1;
    this.misc[i * 2 + 1] = width;
    this.life[i] = life;
    this.max[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.live = MAX;
  }

  /**
   * A spray of sparks thrown along `dir` in a cone (spread 0 = a jet, 1 = a wide fan). Most
   * are slow and a few are fast, the way grinding sparks come off.
   */
  spray(p: THREE.Vector3, dir: THREE.Vector3, count: number, color: THREE.Color, speed = 6, spread = 1, life = 1) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(spread);
      _v.add(dir).normalize();
      const s = speed * (0.35 + 1.0 * Math.pow(Math.random(), 1.8));
      this.emit(p, _v.x * s, _v.y * s + speed * 0.12, _v.z * s, color, (0.25 + Math.random() * 0.45) * life, 0.007 + Math.random() * 0.009);
    }
  }

  update(dt: number, camera: THREE.Camera) {
    if (!this.live) return;
    const cam = camera as THREE.PerspectiveCamera;
    const h = this.uniforms.uScale.value * 2;
    this.uniforms.uHalf.value.set((h * (cam.aspect || 1)) / 2, h / 2);
    this.uniforms.uGlow.value = RenderSettings.glow(4);
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.misc[i * 2 + 1] = 0;
        continue;
      }
      live++;
      const i3 = i * 3;
      this.life[i] -= dt;
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - this.grav[i] * dt;
      this.vel[i3 + 2] *= drag;
      const x = (this.pos[i3] += this.vel[i3] * dt);
      const y = (this.pos[i3 + 1] += this.vel[i3 + 1] * dt);
      const z = (this.pos[i3 + 2] += this.vel[i3 + 2] * dt);
      if (y < 1.5 && this.vel[i3 + 1] < 0) {
        const g = groundAt(x, z) + 0.01;
        if (y < g) {
          // hits the deck: a low skipping bounce, and it skids on
          this.pos[i3 + 1] = g;
          this.vel[i3 + 1] *= -(0.2 + Math.random() * 0.25);
          this.vel[i3] *= 0.7;
          this.vel[i3 + 2] *= 0.7;
          this.life[i] *= 0.85;
        }
      }
      this.misc[i * 2] = Math.max(0, this.life[i] / this.max[i]);
    }
    this.live = live;
    this.mesh.visible = live > 0;
    if (!live) return;
    const a = this.geo.attributes;
    a.iPos.needsUpdate = true;
    a.iVel.needsUpdate = true;
    a.iCol.needsUpdate = true;
    a.iMisc.needsUpdate = true;
  }
}

const _v = new THREE.Vector3();
