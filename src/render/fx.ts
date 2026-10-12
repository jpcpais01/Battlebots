import * as THREE from 'three';
import { RenderSettings } from './settings';

const MAX_PARTICLES = 700;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

interface Flash {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  size: number;
}

/** Particles, impact flashes, swing trails and electric arcs. (Shockwaves are a screen warp: see ripple.ts.) */
export class Fx {
  readonly group = new THREE.Group();
  // particles (CPU simulated, one draw call)
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pVel = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private pLife = new Float32Array(MAX_PARTICLES);
  private pMax = new Float32Array(MAX_PARTICLES);
  private pSize = new Float32Array(MAX_PARTICLES);
  private pDrag = new Float32Array(MAX_PARTICLES);
  private pGrav = new Float32Array(MAX_PARTICLES);
  private pAlpha = new Float32Array(MAX_PARTICLES);
  private pNext = 0;
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private flashes: Flash[] = [];
  private tex = glowTexture();
  private arcs: THREE.LineSegments;
  private arcGeo: THREE.BufferGeometry;
  private arcSources: { pos: THREE.Vector3; t: number; color: THREE.Color }[] = [];
  private trails: Trail[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private flameUsed = 0;
  pixelScale = 600;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uTex: { value: this.tex } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.arcs = new THREE.LineSegments(
      this.arcGeo,
      new THREE.LineBasicMaterial({ color: new THREE.Color(0x9ad8ff).multiplyScalar(RenderSettings.glow(3)), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }),
    );
    this.arcs.frustumCulled = false;
    this.group.add(this.arcs);

    this.flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffa040).multiplyScalar(RenderSettings.glow(4)),
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameGeo = new THREE.ConeGeometry(0.07, 0.4, 10, 1, true);
    flameGeo.translate(0, -0.2, 0);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(flameGeo, this.flameMat);
      m.visible = false;
      this.flames.push(m);
      this.group.add(m);
    }
  }

  setPixelScale(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.5;
  }

  makeTrail(color: THREE.ColorRepresentation, width = 0.16): Trail {
    const t = new Trail(color, width);
    this.trails.push(t);
    this.group.add(t.mesh);
    return t;
  }

  private emit(
    p: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    life: number,
    size: number,
    drag = 2,
    grav = 9,
  ) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAX_PARTICLES;
    this.pPos[i * 3] = p.x;
    this.pPos[i * 3 + 1] = p.y;
    this.pPos[i * 3 + 2] = p.z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.pCol[i * 3] = color.r;
    this.pCol[i * 3 + 1] = color.g;
    this.pCol[i * 3 + 2] = color.b;
    this.pLife[i] = life;
    this.pMax[i] = life;
    this.pSize[i] = size;
    this.pDrag[i] = drag;
    this.pGrav[i] = grav;
  }

  sparks(p: THREE.Vector3, dir: THREE.Vector3, count: number, color: THREE.ColorRepresentation, speed = 6, spread = 1) {
    const c = new THREE.Color(color);
    const hot = new THREE.Color(0xfff2d0);
    for (let i = 0; i < count; i++) {
      const s = speed * (0.4 + Math.random() * 0.9);
      const vx = dir.x * s + (Math.random() - 0.5) * speed * spread;
      const vy = dir.y * s + (Math.random() - 0.3) * speed * spread;
      const vz = dir.z * s + (Math.random() - 0.5) * speed * spread;
      const col = Math.random() < 0.35 ? hot : c;
      this.emit(p, vx, vy, vz, col.clone().multiplyScalar(RenderSettings.glow(4)), 0.25 + Math.random() * 0.35, 0.05 + Math.random() * 0.05, 1.5, 9);
    }
  }

  dust(p: THREE.Vector3, count: number, strength = 1) {
    const c = new THREE.Color(0x8a93a6).multiplyScalar(0.35);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 1.8) * strength;
      _v.set(p.x + Math.cos(a) * 0.2, 0.05, p.z + Math.sin(a) * 0.2);
      this.emit(_v, Math.cos(a) * s, 0.3 + Math.random() * 0.8, Math.sin(a) * s, c, 0.8 + Math.random() * 0.6, 0.35 + Math.random() * 0.3, 2.5, -0.3);
    }
  }

  burst(p: THREE.Vector3, color: THREE.ColorRepresentation, count = 30, speed = 3) {
    const c = new THREE.Color(color).multiplyScalar(RenderSettings.glow(2));
    for (let i = 0; i < count; i++) {
      _v.randomDirection().multiplyScalar(speed * (0.5 + Math.random() * 0.5));
      this.emit(p, _v.x, _v.y, _v.z, c, 0.4 + Math.random() * 0.3, 0.06, 3, 0);
    }
  }

  /** Energy siphon: motes flowing from a to b. */
  siphon(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation) {
    const c = new THREE.Color(color).multiplyScalar(RenderSettings.glow(2));
    for (let i = 0; i < 12; i++) {
      _v.subVectors(b, a).multiplyScalar(1.6 + Math.random());
      _u.copy(a).add(_w.randomDirection().multiplyScalar(0.12));
      this.emit(_u, _v.x, _v.y + 0.6, _v.z, c, 0.5, 0.05, 0.5, 0);
    }
  }

  flash(p: THREE.Vector3, color: THREE.ColorRepresentation, size = 0.8, life = 0.14) {
    let f = this.flashes.find((x) => x.t >= x.life);
    if (!f) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      this.group.add(sprite);
      f = { sprite, t: 0, life, size };
      this.flashes.push(f);
    }
    f.t = 0;
    f.life = life;
    f.size = size;
    f.sprite.visible = true;
    f.sprite.position.copy(p);
    (f.sprite.material as THREE.SpriteMaterial).color.set(color).multiplyScalar(RenderSettings.glow(3.5));
  }

  arc(pos: THREE.Vector3, t = 0.4, color: THREE.ColorRepresentation = 0x9ad8ff) {
    this.arcSources.push({ pos: pos.clone(), t, color: new THREE.Color(color) });
  }

  /** Attach thruster flames for this frame. Call `beginFrame` first. */
  flame(at: THREE.Vector3, dir: THREE.Vector3, scale = 1) {
    if (this.flameUsed >= this.flames.length) return;
    const m = this.flames[this.flameUsed++];
    m.visible = true;
    m.position.copy(at);
    _q.setFromUnitVectors(_up, _v.copy(dir).normalize().negate());
    m.quaternion.copy(_q);
    const flick = 0.8 + Math.random() * 0.4;
    m.scale.set(scale, scale * flick, scale);
  }

  beginFrame() {
    this.flameUsed = 0;
    for (const f of this.flames) f.visible = false;
  }

  update(dt: number, camera: THREE.Camera) {
    // particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) {
        this.pAlpha[i] = 0;
        continue;
      }
      this.pLife[i] -= dt;
      const k = Math.max(0, this.pLife[i] / this.pMax[i]);
      const drag = Math.exp(-this.pDrag[i] * dt);
      this.pVel[i * 3] *= drag;
      this.pVel[i * 3 + 1] = this.pVel[i * 3 + 1] * drag - this.pGrav[i] * dt;
      this.pVel[i * 3 + 2] *= drag;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < 0.02) {
        this.pPos[i * 3 + 1] = 0.02;
        this.pVel[i * 3 + 1] *= -0.3;
      }
      this.pAlpha[i] = k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;

    for (const f of this.flashes) {
      if (f.t >= f.life) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      const s = f.size * (0.4 + k * 0.9);
      f.sprite.scale.set(s, s, s);
      (f.sprite.material as THREE.SpriteMaterial).opacity = 1 - k;
      if (f.t >= f.life) f.sprite.visible = false;
    }
    // electric arcs
    const arcPos = this.arcGeo.attributes.position as THREE.BufferAttribute;
    let n = 0;
    this.arcSources = this.arcSources.filter((a) => (a.t -= dt) > 0);
    for (const a of this.arcSources) {
      for (let b = 0; b < 4 && n < 390; b++) {
        _v.copy(a.pos);
        _w.randomDirection().multiplyScalar(0.07);
        for (let s = 0; s < 5 && n < 398; s++) {
          arcPos.setXYZ(n++, _v.x, _v.y, _v.z);
          _v.add(_w).add(_u.randomDirection().multiplyScalar(0.06));
          arcPos.setXYZ(n++, _v.x, _v.y, _v.z);
        }
      }
    }
    this.arcGeo.setDrawRange(0, n);
    arcPos.needsUpdate = true;
    for (const t of this.trails) t.update(dt, camera);
  }
}

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

const TRAIL_N = 14;

/** Camera-facing ribbon following a limb during strikes. */
export class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private alpha: Float32Array;
  active = false;
  constructor(color: THREE.ColorRepresentation, private width: number) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.alpha = new Float32Array(TRAIL_N * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(RenderSettings.glow(1.8)) } },
      vertexShader: /* glsl */ `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < TRAIL_N; i++) {
      this.pts.push(new THREE.Vector3());
      this.ages.push(99);
    }
  }
  push(p: THREE.Vector3) {
    const last = this.pts.pop()!;
    this.ages.pop();
    last.copy(p);
    this.pts.unshift(last);
    this.ages.unshift(0);
  }
  update(dt: number, camera: THREE.Camera) {
    let any = false;
    for (let i = 0; i < TRAIL_N; i++) {
      this.ages[i] += dt;
      if (this.ages[i] < 0.12) any = true;
    }
    this.mesh.visible = any;
    if (!any) return;
    const camPos = camera.position;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(TRAIL_N - 1, i + 1)];
      _v.subVectors(p, q);
      if (_v.lengthSq() < 1e-6) _v.set(0, 1, 0);
      _u.subVectors(camPos, p);
      _w.crossVectors(_v, _u).normalize();
      const k = 1 - i / (TRAIL_N - 1);
      const fade = Math.max(0, 1 - this.ages[i] / 0.12);
      const w = this.width * k;
      this.pos[i * 6] = p.x + _w.x * w;
      this.pos[i * 6 + 1] = p.y + _w.y * w;
      this.pos[i * 6 + 2] = p.z + _w.z * w;
      this.pos[i * 6 + 3] = p.x - _w.x * w;
      this.pos[i * 6 + 4] = p.y - _w.y * w;
      this.pos[i * 6 + 5] = p.z - _w.z * w;
      const a = k * fade * 0.8;
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}
