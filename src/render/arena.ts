import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from './settings';

export const RING_RADIUS = 5.0; // corner radius of the octagon
const SIDES = 8;

function matTexture(): THREE.CanvasTexture {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const cx = s / 2;
  const grad = g.createRadialGradient(cx, cx, 40, cx, cx, cx);
  grad.addColorStop(0, '#2b3448');
  grad.addColorStop(0.7, '#1c2333');
  grad.addColorStop(1, '#121722');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // subtle canvas weave
  g.globalAlpha = 0.05;
  for (let i = 0; i < s; i += 4) {
    g.fillStyle = i % 8 ? '#000' : '#fff';
    g.fillRect(0, i, s, 1);
    g.fillRect(i, 0, 1, s);
  }
  g.globalAlpha = 1;
  // center logo rings
  g.strokeStyle = 'rgba(255,140,40,0.85)';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(cx, cx, 150, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(80,220,255,0.6)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cx, 172, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = 'bold 92px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BB', cx, cx + 4);
  g.font = 'bold 30px "Rajdhani", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillText('BATTLEBOTS ARENA', cx, cx + 92);
  // outer octagon line and corner marks
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 0; i <= SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2 + Math.PI / 8;
    const r = cx * 0.86;
    const x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function screenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, '#ff6a1a');
  grad.addColorStop(1, '#ffb43a');
  g.fillStyle = '#0b0f1a';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = grad;
  g.font = 'bold 74px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BATTLE', 256, 92);
  g.fillStyle = '#5fe3ff';
  g.fillText('BOTS', 256, 172);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Arena {
  readonly group = new THREE.Group();
  private crowdMat: THREE.MeshLambertMaterial | null = null;
  private lightsMat: THREE.ShaderMaterial | null = null;
  private ropeMat: THREE.MeshBasicMaterial;
  private ropeBase = new THREE.Color(0x52e6ff).multiplyScalar(0.9);
  private ropeFlash = 0;
  private beams: THREE.Mesh[] = [];
  readonly uniforms = { uTime: { value: 0 }, uHype: { value: 0.3 } };
  private hype = 0.3;

  constructor(quality: 'low' | 'med' | 'high') {
    const g = this.group;
    // ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a0d15, roughness: 0.85, metalness: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.62;
    g.add(ground);

    // stage: base + canvas
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(RING_RADIUS + 0.75, RING_RADIUS + 0.95, 0.5, SIDES, 1),
      new THREE.MeshStandardMaterial({ color: 0x1a1e27, metalness: 0.7, roughness: 0.45 }),
    );
    base.rotation.y = Math.PI / 8;
    base.position.y = -0.37;
    base.receiveShadow = true;
    g.add(base);
    const mat = new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.78, metalness: 0.05 });
    const floorGeo = new THREE.CircleGeometry(RING_RADIUS + 0.55, SIDES);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.rotateY(Math.PI / 8);
    // planar UVs
    const pos = floorGeo.attributes.position;
    const uv = floorGeo.attributes.uv;
    const R = RING_RADIUS + 0.55;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * R) + 0.5, -pos.getZ(i) / (2 * R) + 0.5);
    const floor = new THREE.Mesh(floorGeo, mat);
    floor.receiveShadow = true;
    floor.position.y = 0.0;
    g.add(floor);
    // apron glow edge
    const edgeGeos: THREE.BufferGeometry[] = [];
    const edgeR = RING_RADIUS + 0.62;
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((i + 1) / SIDES) * Math.PI * 2 + Math.PI / 8;
      const p0 = new THREE.Vector3(Math.cos(a0) * edgeR, -0.1, Math.sin(a0) * edgeR);
      const p1 = new THREE.Vector3(Math.cos(a1) * edgeR, -0.1, Math.sin(a1) * edgeR);
      const len = p0.distanceTo(p1);
      const box = new THREE.BoxGeometry(len, 0.05, 0.05);
      box.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x));
      box.translate((p0.x + p1.x) / 2, -0.12, (p0.z + p1.z) / 2);
      edgeGeos.push(box);
    }
    const edge = new THREE.Mesh(
      mergeGeometries(edgeGeos)!,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(RenderSettings.glow(3)), toneMapped: false }),
    );
    g.add(edge);

    // corner posts + ropes
    const postGeos: THREE.BufferGeometry[] = [];
    const capGeos: THREE.BufferGeometry[] = [];
    const ropeGeos: THREE.BufferGeometry[] = [];
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2 + Math.PI / 8;
      corners.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS));
    }
    for (const c of corners) {
      const post = new THREE.CylinderGeometry(0.1, 0.13, 1.7, 12);
      post.translate(c.x, 0.85, c.z);
      postGeos.push(post);
      const pad = new THREE.CylinderGeometry(0.16, 0.16, 1.2, 12);
      pad.translate(c.x, 0.95, c.z);
      postGeos.push(pad);
      const cap = new THREE.SphereGeometry(0.11, 12, 8);
      cap.translate(c.x, 1.76, c.z);
      capGeos.push(cap);
    }
    const heights = [0.55, 0.95, 1.35];
    for (let i = 0; i < SIDES; i++) {
      const p0 = corners[i];
      const p1 = corners[(i + 1) % SIDES];
      const len = p0.distanceTo(p1);
      for (const h of heights) {
        const rope = new THREE.CylinderGeometry(0.016, 0.016, len, 6, 1, true);
        rope.rotateZ(Math.PI / 2);
        rope.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x));
        rope.translate((p0.x + p1.x) / 2, h, (p0.z + p1.z) / 2);
        ropeGeos.push(rope);
      }
    }
    const posts = new THREE.Mesh(
      mergeGeometries(postGeos)!,
      new THREE.MeshStandardMaterial({ color: 0x2b303b, metalness: 0.8, roughness: 0.35 }),
    );
    posts.castShadow = true;
    g.add(posts);
    g.add(
      new THREE.Mesh(
        mergeGeometries(capGeos)!,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(RenderSettings.glow(3.2)), toneMapped: false }),
      ),
    );
    this.ropeMat = new THREE.MeshBasicMaterial({ color: this.ropeBase.clone(), toneMapped: false });
    g.add(new THREE.Mesh(mergeGeometries(ropeGeos)!, this.ropeMat));

    // stands + crowd
    this.buildCrowd(quality);

    // overhead rig: truss ring + screen + beams
    const truss = new THREE.Mesh(
      new THREE.TorusGeometry(6.5, 0.12, 6, 48),
      new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.8, roughness: 0.4 }),
    );
    truss.rotation.x = Math.PI / 2;
    truss.position.y = 8.5;
    g.add(truss);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false });
    const screen = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), screenMat);
      p.position.set(Math.sin((i * Math.PI) / 2) * 1.31, 0, Math.cos((i * Math.PI) / 2) * 1.31);
      p.rotation.y = (i * Math.PI) / 2;
      screen.add(p);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x111319, metalness: 0.6, roughness: 0.5 }));
    box.scale.set(0.99, 1.05, 0.99);
    screen.add(box);
    screen.position.y = 10.5;
    g.add(screen);

    // light beams (fake volumetrics)
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xbfdfff) }, uTime: this.uniforms.uTime },
      vertexShader: /* glsl */ `
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = edge * (0.03 + 0.12 * vY * vY); gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    if (quality !== 'low') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.6, 9, 20, 1, true), beamMat);
        const top = new THREE.Vector3(Math.cos(a) * 6.3, 8.4, Math.sin(a) * 6.3);
        const bottom = new THREE.Vector3(Math.cos(a + 0.6) * 1.6, 0, Math.sin(a + 0.6) * 1.6);
        beam.position.copy(top).add(bottom).multiplyScalar(0.5);
        beam.lookAt(bottom);
        beam.rotateX(-Math.PI / 2);
        beam.scale.y = top.distanceTo(bottom) / 9;
        this.beams.push(beam);
        g.add(beam);
      }
    }
  }

  private buildCrowd(quality: 'low' | 'med' | 'high') {
    const g = this.group;
    // tiered stands
    const standMat = new THREE.MeshStandardMaterial({ color: 0x141821, metalness: 0.3, roughness: 0.8 });
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const r0 = 9 + t * 1.1;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.1, r0 + 1.1, 0.55 + t * 0.6, 32, 1, true), standMat);
      ring.position.y = -0.6 + (0.55 + t * 0.6) / 2;
      g.add(ring);
      const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.1, 32), standMat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = -0.6 + 0.55 + t * 0.6;
      g.add(top);
    }
    const count = quality === 'low' ? 380 : quality === 'med' ? 700 : 1100;
    const person = mergeGeometries([
      new THREE.CapsuleGeometry(0.22, 0.45, 3, 8).translate(0, 0.45, 0),
      new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.0, 0),
    ])!;
    this.crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const uniforms = this.uniforms;
    this.crowdMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uHype = uniforms.uHype;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uHype;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float seed = float(gl_InstanceID) * 12.9898;
           float ph = fract(sin(seed) * 43758.5453) * 6.283;
           float sp = 3.0 + fract(sin(seed * 1.7) * 9631.1) * 4.0;
           transformed.y += max(0.0, sin(uTime * sp + ph)) * (0.04 + 0.22 * uHype);`,
        );
    };
    const crowd = new THREE.InstancedMesh(person, this.crowdMat, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const shirt = [0x2a3550, 0x3a2a40, 0x1f3a3a, 0x4a3326, 0x30303a, 0x50202a, 0x203050];
    let n = 0;
    const lightPos: number[] = [];
    const lightCol: number[] = [];
    for (let t = 0; t < tiers && n < count; t++) {
      const r = 9.5 + t * 1.1;
      const per = Math.floor(count / tiers);
      for (let i = 0; i < per && n < count; i++) {
        const a = (i / per) * Math.PI * 2 + Math.random() * 0.05 + t * 0.3;
        const rr = r + Math.random() * 0.4;
        const y = -0.6 + 0.55 + t * 0.6;
        dummy.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
        dummy.lookAt(0, y + 0.5, 0);
        const s = 0.85 + Math.random() * 0.3;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        crowd.setMatrixAt(n, dummy.matrix);
        color.setHex(shirt[Math.floor(Math.random() * shirt.length)]).multiplyScalar(0.22 + Math.random() * 0.16);
        crowd.setColorAt(n, color);
        n++;
        if (Math.random() < 0.18) {
          lightPos.push(dummy.position.x * 0.98, y + 1.25, dummy.position.z * 0.98);
          const hue = Math.random();
          color.setHSL(hue < 0.5 ? 0.08 : hue < 0.8 ? 0.53 : 0.9, 0.9, 0.6);
          lightCol.push(color.r, color.g, color.b);
        }
      }
    }
    crowd.count = n;
    crowd.instanceMatrix.needsUpdate = true;
    g.add(crowd);

    // twinkling light sticks / phones as points
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
    this.lightsMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uHype: this.uniforms.uHype, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime; uniform float uHype; uniform float uScale;
        void main(){ vC = color; float s = fract(sin(dot(position.xz, vec2(12.9898,78.233))) * 43758.5453);
          vA = 0.45 + 0.55 * sin(uTime * (2.0 + s * 3.0) + s * 40.0) * (0.5 + uHype);
          vec4 mv = modelViewMatrix * vec4(position + vec3(0., max(0., sin(uTime*5.0+s*30.0))*0.2*uHype, 0.), 1.0);
          gl_PointSize = uScale * 0.06 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; float a = smoothstep(0.25, 0.0, r) * vA; gl_FragColor = vec4(vC * 2.0 * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(lg, this.lightsMat);
    pts.frustumCulled = false;
    g.add(pts);
  }

  setPixelScale(h: number) {
    if (this.lightsMat) this.lightsMat.uniforms.uScale.value = h;
  }

  flashRopes(k = 1) {
    this.ropeFlash = Math.min(1.5, this.ropeFlash + k);
  }

  excite(k: number) {
    this.hype = Math.min(1.5, this.hype + k);
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    this.hype += (0.3 - this.hype) * Math.min(1, dt * 0.5);
    this.uniforms.uHype.value = this.hype;
    this.ropeFlash = Math.max(0, this.ropeFlash - dt * 3);
    this.ropeMat.color.copy(this.ropeBase).multiplyScalar(1 + this.ropeFlash * 1.6);
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.rotation.z = Math.sin(time * 0.3 + i) * 0.04;
    }
  }
}
