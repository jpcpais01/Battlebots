import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from './settings';
import { RING_CORNER, ROPE_LINE, ropeSide as sideOf, SIDE_NX, SIDE_NZ } from '../sim/body';
import { Venue } from './venue';
import { contactAO } from './ao';
import { FLOOR } from './bowl';

export const RING_RADIUS = RING_CORNER; // corner radius of the octagon
const SIDES = 8;
const ROPE_HEIGHTS = [0.55, 0.95, 1.35];
const ROPES = SIDES * ROPE_HEIGHTS.length;
/** Half the length of one side's ropes, post to post. */
const ROPE_HALF = RING_RADIUS * Math.sin(Math.PI / SIDES);
/** Rough armour radius around each physics joint, for pressing into the ropes. */
const PRESS_RADII = [0.3, 0.36, 0.14, 0.24, 0.2, 0.13, 0.16, 0.2, 0.13, 0.16, 0.17, 0.14, 0.12, 0.17, 0.14, 0.12];
/** Rope spring: stiffness (wobbles about 3.5 times a second) and damping. */
const ROPE_K = 480;
const ROPE_C = 5;

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
  // baked ambient occlusion: the canvas darkens towards the apron and pools around each post base
  const px = cx / (RING_RADIUS + 0.55); // pixels per metre
  g.globalCompositeOperation = 'multiply';
  const rim = g.createRadialGradient(cx, cx, ROPE_LINE * 0.55 * px, cx, cx, cx);
  rim.addColorStop(0, '#ffffff');
  rim.addColorStop(0.7, '#c4c4c8');
  rim.addColorStop(1, '#7a7a82');
  g.fillStyle = rim;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * RING_RADIUS * px, y = cx + Math.sin(a) * RING_RADIUS * px;
    const pool = g.createRadialGradient(x, y, 0.1 * px, x, y, 0.75 * px);
    pool.addColorStop(0, '#303034');
    pool.addColorStop(0.35, '#8a8a90');
    pool.addColorStop(1, '#ffffff');
    g.fillStyle = pool;
    g.fillRect(x - px, y - px, 2 * px, 2 * px);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Arena {
  readonly group = new THREE.Group();
  readonly venue: Venue;
  private ropeMat: THREE.MeshBasicMaterial;
  private ropeBase = new THREE.Color(0x52e6ff).multiplyScalar(0.9);
  private ropeFlash = 0;
  /**
   * Per rope (side * 3 + height): where along it the push lands (0..1 post to post),
   * how far it is bowed out, and how much it is swinging free (sine) rather than
   * pressed into a V by a body. Packed as vec4s for the vertex shader.
   */
  private ropeU = { value: new Float32Array(ROPES * 4) };
  private ropeVel = new Float32Array(ROPES);
  private ropePress = new Float32Array(ROPES);
  private ropeAt = new Float32Array(ROPES);
  readonly uniforms = { uTime: { value: 0 }, uHype: { value: 0.3 } };
  private hype = 0.3;

  constructor(quality: 'low' | 'med' | 'high') {
    const g = this.group;
    // the arena around the ring: stands, crowd, boards, roof (added to the scene beside `group`)
    this.venue = new Venue(quality, this.uniforms);

    // stage: base + canvas
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(RING_RADIUS + 0.75, RING_RADIUS + 0.95, 0.5, SIDES, 1),
      contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x1a1e27, metalness: 0.7, roughness: 0.45 }), {
        ground: { y: FLOOR, height: 0.4, k: 0.55 },
      }),
    );
    base.rotation.y = Math.PI / 8;
    base.position.y = -0.37;
    base.receiveShadow = true;
    g.add(base);
    // the robots' contact shadows land here; the edges and post bases are baked into the texture
    const mat = contactAO.patch(new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.78, metalness: 0.05 }), {
      spheres: true,
      floor: true,
      strength: 2,
      direct: 0.7,
    });
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
    // ropes: 16 segments each so they can bow; the vertex shader bends them
    for (let i = 0; i < SIDES; i++) {
      const p0 = corners[i];
      const p1 = corners[(i + 1) % SIDES];
      const len = p0.distanceTo(p1);
      // side i runs between corners i and i+1, so it faces halfway between them
      const side = (i + 1) % SIDES;
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      for (let h = 0; h < ROPE_HEIGHTS.length; h++) {
        const rope = new THREE.CylinderGeometry(0.016, 0.016, len, 6, 16, true);
        rope.rotateZ(Math.PI / 2);
        rope.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x));
        rope.translate((p0.x + p1.x) / 2, ROPE_HEIGHTS[h], (p0.z + p1.z) / 2);
        const pos = rope.attributes.position;
        const n = pos.count;
        const idx = new Float32Array(n).fill(side * ROPE_HEIGHTS.length + h);
        const t = new Float32Array(n);
        const out = new Float32Array(n * 2);
        for (let v = 0; v < n; v++) {
          const u = -pos.getX(v) * nz + pos.getZ(v) * nx;
          t[v] = Math.min(1, Math.max(0, (u + ROPE_HALF) / (2 * ROPE_HALF)));
          out[v * 2] = nx;
          out[v * 2 + 1] = nz;
        }
        rope.setAttribute('aRope', new THREE.BufferAttribute(idx, 1));
        rope.setAttribute('aT', new THREE.BufferAttribute(t, 1));
        rope.setAttribute('aOut', new THREE.BufferAttribute(out, 2));
        ropeGeos.push(rope);
      }
    }
    for (let k = 0; k < ROPES; k++) {
      this.ropeU.value[k * 4] = 0.5;
      this.ropeU.value[k * 4 + 2] = 1;
    }
    const posts = new THREE.Mesh(
      mergeGeometries(postGeos)!,
      contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x2b303b, metalness: 0.8, roughness: 0.35 }), {
        ground: { y: 0, height: 0.6, k: 0.6 },
      }),
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
    const ropeU = this.ropeU;
    this.ropeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uRope = ropeU;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aRope; attribute float aT; attribute vec2 aOut; uniform vec4 uRope[${ROPES}];`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 rp = uRope[int(aRope + 0.5)];
           // pressed: straight lines from each post to the contact (a V); free: a swinging arc
           float s = clamp(rp.x, 0.08, 0.92);
           float vee = aT < s ? aT / s : (1.0 - aT) / (1.0 - s);
           float shape = mix(vee, sin(3.14159265 * aT), rp.z);
           transformed.xz += aOut * rp.y * shape;`,
        );
    };
    const ropes = new THREE.Mesh(mergeGeometries(ropeGeos)!, this.ropeMat);
    // bowing ropes reach past the merged bounds; they ring the camera's subject anyway
    ropes.frustumCulled = false;
    ropes.name = 'ropes';
    g.add(ropes);

    // overhead rig: truss ring + beams
    const truss = new THREE.Mesh(
      new THREE.TorusGeometry(6.5, 0.12, 6, 48),
      new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.8, roughness: 0.4 }),
    );
    truss.rotation.x = Math.PI / 2;
    truss.position.y = 8.5;
    g.add(truss);

    // light beams (fake volumetrics)
    if (quality !== 'low') g.add(this.buildBeams());
  }

  /**
   * Six shafts of light from the truss, slanting down towards the ring, as one draw.
   *
   * The glow is brightest at the lamp and fades with distance, so the lower half of a shaft was
   * nearly invisible yet, being the widest part and the part closest to the camera, it covered
   * most of the pixels. The cones now stop above the robots' heads (fading out on the way) and
   * draw only their front faces: one layer of blending per pixel instead of two, over a fraction
   * of the area. Each shaft sways from its lamp in the vertex shader.
   */
  private buildBeams() {
    const CUT = 0.6; // fraction of the way from the lamp to the floor that the shaft is drawn
    const R_TOP = 0.15;
    const R_FLOOR = 1.6;
    const geos: THREE.BufferGeometry[] = [];
    const down = new THREE.Vector3(0, -1, 0);
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 6.3, 8.4, Math.sin(a) * 6.3);
      const bottom = new THREE.Vector3(Math.cos(a + 0.6) * 1.6, 0, Math.sin(a + 0.6) * 1.6);
      const dir = bottom.clone().sub(top);
      const len = dir.length() * CUT;
      dir.normalize();
      const geo = new THREE.CylinderGeometry(R_TOP, R_TOP + (R_FLOOR - R_TOP) * CUT, len, 16, 1, true);
      geo.deleteAttribute('uv');
      // lamp at the origin, shaft hanging along -Y, then aimed and moved onto the truss
      geo.translate(0, -len / 2, 0);
      // 0 at the lamp, 1 at the cut
      const pos = geo.attributes.position;
      const along = new Float32Array(pos.count);
      for (let v = 0; v < pos.count; v++) along[v] = -pos.getY(v) / len;
      geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
      geo.applyMatrix4(m.compose(top, q.setFromUnitVectors(down, dir), new THREE.Vector3(1, 1, 1)));
      const sway = new Float32Array(pos.count * 4);
      for (let v = 0; v < pos.count; v++) sway.set([top.x, top.y, top.z, i], v * 4);
      geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 4));
      geos.push(geo);
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xbfdfff) }, uTime: this.uniforms.uTime, uCut: { value: CUT } },
      vertexShader: /* glsl */ `
        attribute float aAlong;
        attribute vec4 aSway;
        uniform float uTime;
        uniform float uCut;
        varying float vY; varying vec3 vN; varying vec3 vV;
        // rotate about axis k (unit) by angle a
        vec3 rot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
        void main() {
          // the lamp pans side to side around the ring
          vec3 k = normalize(vec3(aSway.x, 0.0, aSway.z));
          float ang = sin(uTime * 0.3 + aSway.w) * 0.03;
          vec3 p = aSway.xyz + rot(position - aSway.xyz, k, ang);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * rot(normal, k, ang));
          vV = normalize(-mv.xyz);
          // 1 at the lamp, 0 on the floor (where the shaft would land if it went all the way)
          vY = 1.0 - aAlong * uCut;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uCut;
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main() {
          // brightest looking through the middle of the shaft, nothing at its edges
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float k = edge * (0.03 + 0.12 * vY * vY);
          // the two faces of the old double-sided cone, in one; fading out before the cut
          float a = 2.0 * k * k * smoothstep(1.0 - uCut, 1.0 - uCut + 0.22, vY);
          gl_FragColor = vec4(uColor * a, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      side: THREE.FrontSide,
    });
    const beams = new THREE.Mesh(mergeGeometries(geos)!, mat);
    // swaying pushes the shafts a little past the merged bounds
    beams.frustumCulled = false;
    beams.name = 'beams';
    return beams;
  }

  setPixelScale(h: number) {
    this.venue.setPixelScale(h);
  }

  flashRopes(k = 1) {
    this.ropeFlash = Math.min(1.5, this.ropeFlash + k);
  }

  /** A fighter slammed into the ropes: that side's ropes twang outwards. */
  ropeHit(x: number, z: number, strength: number) {
    const side = sideOf(x, z);
    const at = (-x * SIDE_NZ[side] + z * SIDE_NX[side] + ROPE_HALF) / (2 * ROPE_HALF);
    for (let h = 0; h < ROPE_HEIGHTS.length; h++) {
      const k = side * ROPE_HEIGHTS.length + h;
      this.ropeVel[k] += Math.min(3, strength) * (h === 1 ? 0.5 : 0.35);
      this.ropeU.value[k * 4] = Math.min(0.92, Math.max(0.08, at));
    }
  }

  /**
   * Let the fighters' bodies press into the ropes. Each joint is treated as a ball
   * the size of the armour around it; where it crosses a rope's line, that rope is
   * pushed out to meet it. Cheap: 32 balls against the 3 ropes of their nearest side.
   */
  pressRopes(bodies: readonly (readonly THREE.Vector3[])[], sizes: readonly number[] = []) {
    const press = this.ropePress.fill(0);
    const at = this.ropeAt;
    const nH = ROPE_HEIGHTS.length;
    bodies.forEach((joints, b) => {
      const z = sizes[b] ?? 1;
      for (let j = 0; j < joints.length; j++) {
        const p = joints[j];
        const rad = (PRESS_RADII[j] ?? 0.15) * z;
        const side = sideOf(p.x, p.z);
        const nx = SIDE_NX[side], nz = SIDE_NZ[side];
        const reach = p.x * nx + p.z * nz - ROPE_LINE;
        // clear of them on the inside, or already well out past them (thrown over the top)
        if (reach + rad <= 0 || reach - rad > 0.3) continue;
        const along = (-p.x * nz + p.z * nx + ROPE_HALF) / (2 * ROPE_HALF);
        for (let h = 0; h < nH; h++) {
          const dy = p.y - ROPE_HEIGHTS[h];
          if (Math.abs(dy) >= rad) continue;
          // the ball's width at the rope's height
          const d = reach + Math.sqrt(rad * rad - dy * dy);
          const k = side * nH + h;
          if (d > press[k]) {
            press[k] = d;
            at[k] = along;
          }
        }
      }
    });
    // the ropes are tied together at the posts and sag together: neighbours follow a little
    for (let side = 0; side < SIDES; side++) {
      const k = side * nH;
      const mid = press[k + 1];
      if (press[k] < mid * 0.35) {
        press[k] = mid * 0.35;
        at[k] = at[k + 1];
      }
      if (press[k + 2] < mid * 0.35) {
        press[k + 2] = mid * 0.35;
        at[k + 2] = at[k + 1];
      }
      const hi = Math.max(press[k], press[k + 2]);
      if (press[k + 1] < hi * 0.35) {
        press[k + 1] = hi * 0.35;
        at[k + 1] = press[k] > press[k + 2] ? at[k] : at[k + 2];
      }
    }
  }

  private updateRopes(dt: number) {
    if (dt <= 0) return;
    const u = this.ropeU.value;
    const step = Math.min(dt, 1 / 30);
    for (let k = 0; k < ROPES; k++) {
      let x = u[k * 4 + 1];
      let v = this.ropeVel[k];
      const press = this.ropePress[k];
      // springs back (overshooting a touch into the ring), then settles
      v += (-ROPE_K * x - ROPE_C * v) * step;
      x += v * step;
      if (press > x) {
        // a body is leaning on it: the rope stays wrapped against the armour
        v = Math.max(v, Math.min(4, (press - x) / step));
        x = press;
        u[k * 4] += (this.ropeAt[k] - u[k * 4]) * Math.min(1, step * 20);
        u[k * 4 + 2] = Math.max(0, u[k * 4 + 2] - step * 8);
      } else {
        // let go: it swings in its natural arc
        u[k * 4 + 2] = Math.min(1, u[k * 4 + 2] + step * 2.5);
      }
      if (x > 0.7) {
        x = 0.7;
        v = Math.min(v, 0);
      } else if (x < -0.2) {
        x = -0.2;
        v = Math.max(v, 0);
      }
      u[k * 4 + 1] = x;
      this.ropeVel[k] = v;
    }
  }

  excite(k: number) {
    this.hype = Math.min(1.5, this.hype + k);
    if (k >= 1) this.venue.strobe(k * 0.6);
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    this.hype += (0.3 - this.hype) * Math.min(1, dt * 0.5);
    this.uniforms.uHype.value = this.hype;
    this.venue.update(dt, time, this.hype);
    this.ropeFlash = Math.max(0, this.ropeFlash - dt * 3);
    this.ropeMat.color.copy(this.ropeBase).multiplyScalar(1 + this.ropeFlash * 1.6);
    this.updateRopes(dt);
  }
}

