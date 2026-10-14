import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AX, AZ, FLOOR, RC, TUNNEL_GATE, TUNNEL_W } from './bowl';
import type { Role } from './crowd';
import { RenderSettings } from './settings';

/**
 * Fight night on the arena floor between the ring and the stands: each robot's pit crew with
 * carts, chargers and flight cases by its tunnel, the walkout carpets, ringside VIP seats in
 * the two south corners, photographers and camera operators, security and officials, cables
 * and uplights. Everything stands outside the camera's working space (9 m round the ring);
 * only flat things (carpets, cables) come closer. People are crowd sprites, so they cost
 * one more instance each; props are merged unlit boxes.
 */

type Uniforms = { uTime: { value: number }; uHype: { value: number } };

/** A person on the floor, placed in the crowd's instanced draw. */
export interface FloorPerson {
  x: number;
  y: number;
  z: number;
  row: number;
  a: number;
  role?: Role;
  team?: number;
  walk?: boolean;
}

const SX = AX - RC, SZ = AZ - RC;
/** Clear radius kept for the camera. */
const CAMERA_R = 9.3;

/** A point at offset d from the front-row outline, at angle `a` round the corner nearest it. */
function cornerPt(sx: number, sz: number, a: number, r: number): [number, number] {
  return [sx * SX + Math.cos(a) * r, sz * SZ + Math.sin(a) * r];
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Front of a robot charging station: four bays of charge bars and status lights. */
function chargerTexture(colour: string) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#0c0f15';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = colour;
  g.fillRect(0, 0, 128, 14);
  g.font = 'bold 11px Arial, sans-serif';
  g.fillStyle = '#05070b';
  g.textAlign = 'center';
  g.fillText('CHARGE', 64, 11);
  for (let i = 0; i < 4; i++) {
    const y = 26 + i * 56;
    g.fillStyle = '#151a24';
    g.fillRect(10, y, 108, 46);
    const level = [5, 3, 6, 4][i];
    for (let k = 0; k < 6; k++) {
      g.fillStyle = k < level ? (level < 4 ? '#ffb020' : '#3dff8a') : '#1e2530';
      g.fillRect(16 + k * 15, y + 10, 11, 26);
    }
    g.fillStyle = i === 1 ? '#ffb020' : '#3dff8a';
    g.beginPath();
    g.arc(110, y + 23, 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Front of a tool chest: team-coloured drawers with handles. */
function cartTexture(colour: string) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = colour;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) {
    const y = 6 + i * 20;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(4, y + 16, 120, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(4, y, 120, 2);
    g.fillStyle = '#c9ced8';
    g.fillRect(44, y + 7, 40, 4);
  }
  return tex(c);
}

/** Skirt of the ringside VIP seating. */
function vipTexture() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#0b0e16';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#c9a227';
  g.fillRect(0, 0, 512, 4);
  g.fillRect(0, 60, 512, 4);
  g.font = 'bold 30px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#e8d9a8';
  g.fillText('RINGSIDE  ★  VIP', 256, 34);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Soft round shadow for grounding people and props on the floor. */
function blobTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Box with baked face shading (lit from above and from the ring) in one colour. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rot: number, hex: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const c = new THREE.Color(hex);
  // faces: +x, -x, +y, -y, +z, -z
  const shade = [0.72, 0.72, 1.0, 0.35, 0.82, 0.62];
  const col: number[] = [];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) col.push(c.r * shade[f], c.g * shade[f], c.b * shade[f]);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

/** Thin bar between two points (cables, rails, tripod legs). */
function bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, hex: number, h = w) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const g = new THREE.BoxGeometry(w, h, a.distanceTo(b));
  const vertical = Math.abs(by - ay) > 0.99 * a.distanceTo(b);
  g.applyMatrix4(new THREE.Matrix4().lookAt(a, b, vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class FloorShow {
  readonly group = new THREE.Group();
  readonly people: FloorPerson[] = [];
  private flashMat: THREE.ShaderMaterial;
  private lampMat: THREE.ShaderMaterial;
  private t = 0;

  constructor(u: Uniforms) {
    const g = this.group;
    const props: THREE.BufferGeometry[] = [];
    const blobs: [number, number, number][] = [];
    const add = (p: FloorPerson) => {
      if (Math.hypot(p.x, p.z) < CAMERA_R) return;
      this.people.push(p);
      blobs.push([p.x, p.z, 0.5]);
    };
    const person = (x: number, z: number, role?: Role, team?: number, walk?: boolean) =>
      add({ x, y: FLOOR, z, row: 0, a: Math.atan2(z, x), role, team, walk });
    const F = FLOOR;

    // ------------------------------------------------------------ walkout carpets and pit areas
    for (const sx of [-1, 1]) {
      const team = sx < 0 ? 0 : 1;
      const hex = team === 0 ? 0xff7a1f : 0x22c8f0;
      const css = team === 0 ? '#ff7a1f' : '#22c8f0';
      // carpet from the tunnel (in as far as its gate) to the ring with glowing team edges
      const x0 = sx * 6.3, x1 = sx * (AX + TUNNEL_GATE);
      props.push(box(Math.abs(x1 - x0), 0.012, TUNNEL_W - 1.2, (x0 + x1) / 2, F + 0.006, 0, 0, 0x14161d));
      const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(RenderSettings.glow(1.2)), toneMapped: false });
      for (const ez of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.02, 0.05), edge);
        e.position.set((x0 + x1) / 2, F + 0.012, ez * (TUNNEL_W / 2 - 0.6));
        g.add(e);
      }
      // tool chest with drawers and kit on top
      const rot = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      const cx = sx * 11.3, cz = 2.8;
      props.push(box(0.95, 1.0, 0.6, cx, F + 0.55, cz, rot, 0x2a2e38));
      for (const [wx, wz] of [
        [-0.32, -0.22],
        [0.32, -0.22],
        [-0.32, 0.22],
        [0.32, 0.22],
      ])
        props.push(box(0.07, 0.1, 0.07, cx + wz * sx, F + 0.05, cz + wx, 0, 0x111318));
      props.push(box(0.25, 0.08, 0.18, cx, F + 1.09, cz - 0.2, 0.3, 0xb0b6c2));
      props.push(box(0.35, 0.12, 0.2, cx, F + 1.11, cz + 0.15, -0.2, 0x8a2a1a));
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.95), new THREE.MeshBasicMaterial({ map: cartTexture(css) }));
      front.position.set(cx - sx * 0.31, F + 0.55, cz);
      front.rotation.y = rot;
      g.add(front);
      blobs.push([cx, cz, 0.9]);
      // charging station with glowing charge bars
      const chx = sx * 11.2, chz = -2.9;
      props.push(box(0.85, 1.45, 0.55, chx, F + 0.725, chz, rot, 0x1a1e27));
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 1.3),
        new THREE.MeshBasicMaterial({ map: chargerTexture(css), color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.15)), toneMapped: false }),
      );
      panel.position.set(chx - sx * 0.28, F + 0.75, chz);
      panel.rotation.y = rot;
      g.add(panel);
      blobs.push([chx, chz, 0.9]);
      // workbench with a spare arm in the team colour
      const bx = sx * 11.6, bz = 4.3;
      props.push(box(1.7, 0.06, 0.75, bx, F + 0.9, bz, rot, 0x3a3f4a));
      for (const [lx, lz] of [
        [-0.75, -0.3],
        [0.75, -0.3],
        [-0.75, 0.3],
        [0.75, 0.3],
      ])
        props.push(box(0.05, 0.9, 0.05, bx + lz * sx, F + 0.45, bz + lx, 0, 0x1c1f26));
      props.push(box(0.6, 0.16, 0.18, bx, F + 1.01, bz - 0.25, rot + 0.3, hex));
      props.push(box(0.22, 0.2, 0.2, bx, F + 1.03, bz + 0.15, rot, 0x9aa0aa));
      props.push(box(0.12, 0.25, 0.12, bx + sx * 0.1, F + 1.05, bz + 0.45, 0, 0xd8d8d8));
      blobs.push([bx, bz, 1.2]);
      // flight cases: one stacked on another, one tipped on its side
      const fx = sx * 11.5, fz = -4.4;
      props.push(box(1.0, 0.6, 0.7, fx, F + 0.3, fz, rot + 0.1, 0x15171c));
      props.push(box(0.8, 0.5, 0.6, fx, F + 0.85, fz + 0.05, rot - 0.12, 0x1b1d23));
      props.push(box(0.6, 0.85, 0.45, fx - sx * 0.2, F + 0.425, fz + 0.9, rot + 0.4, 0x15171c));
      for (const [ex, ey, ez] of [
        [0, 0.6, 0],
        [0, 1.1, 0.05],
      ])
        props.push(bar(fx + ex - 0.45, F + ey, fz + ez, fx + ex + 0.45, F + ey, fz + ez, 0.03, 0x8a909c));
      blobs.push([fx, fz + 0.3, 1.3]);

      // the pit crew, the walkout camera and security at the tunnel
      person(sx * 10.2, 2.4, 'crew', team);
      person(sx * 10.7, 3.6, 'crew', team);
      person(sx * 10.0, -2.5, 'crew', team);
      person(sx * 10.6, -3.7, 'crew', team);
      person(sx * 9.6, 1.95, 'camera');
      // (security either side of the tunnel mouth, keeping the way out clear)
      person(sx * 12.0, 1.95, 'security');
      person(sx * 12.0, -1.95, 'security');
    }

    // ------------------------------------------------------------ ringside VIP seats in the south corners
    const vip = vipTexture();
    const vipMat = new THREE.MeshBasicMaterial({ map: vip, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const sz = -1;
      // corner angles from -15 to -75 degrees off the long side, mirrored to the west
      const ang = (deg: number) => (sx > 0 ? (-deg * Math.PI) / 180 : Math.PI + (deg * Math.PI) / 180);
      const N = 12;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const rr = 3.85;
      let s = 0;
      for (let i = 0; i <= N; i++) {
        const [x, z] = cornerPt(sx, sz, ang(15 + (60 * i) / N), rr);
        if (i) s += Math.hypot(x - pos[pos.length - 3], z - pos[pos.length - 1]);
        pos.push(x, F, z, x, F + 0.85, z);
        // the east arc winds the other way round, so its lettering runs back along u
        uv.push((-sx * s) / 5, 0, (-sx * s) / 5, 1);
        if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
        if (i < N) {
          const [nx, nz] = cornerPt(sx, sz, ang(15 + (60 * (i + 1)) / N), rr);
          props.push(bar(x, F + 0.87, z, nx, F + 0.87, nz, 0.14, 0x2a2418, 0.04));
        }
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      sg.setIndex(idx);
      g.add(new THREE.Mesh(sg, vipMat));
      // two rows of chairs, nearly all taken
      [4.4, 5.2].forEach((r, row) => {
        const n = row === 0 ? 7 : 8;
        for (let i = 0; i < n; i++) {
          const deg = 18 + ((57 - 3) * (i + 0.5)) / n;
          const [x, z] = cornerPt(sx, sz, ang(deg), r);
          const [bx2, bz2] = cornerPt(sx, sz, ang(deg), r + 0.28);
          const facing = Math.atan2(bx2 - x, bz2 - z);
          props.push(box(0.46, 0.5, 0.06, bx2, F + 0.72, bz2, facing, 0x14161c));
          props.push(box(0.46, 0.06, 0.44, (x + bx2) / 2, F + 0.46, (z + bz2) / 2, facing, 0x1a1c24));
          if ((i * 7 + row * 3) % 9 !== 4) add({ x, y: F, z, row: 0, a: Math.atan2(z, x) });
        }
      });
    }

    // ------------------------------------------------------------ photographers, corner cameras, officials
    for (const [sx, sz, deg] of [
      [1, 1, 18],
      [1, 1, 72],
      [-1, 1, 18],
      [-1, 1, 72],
      [1, -1, 6],
      [1, -1, 84],
      [-1, -1, 6],
      [-1, -1, 84],
    ]) {
      const a = Math.atan2(sz * Math.sin((deg * Math.PI) / 180), sx * Math.cos((deg * Math.PI) / 180));
      const [x, z] = cornerPt(sx, sz, a, 4.7);
      person(x, z, 'photo');
    }
    for (const sx of [-1, 1]) {
      // a camera on a tripod by each desk, with its operator
      const a = Math.atan2(Math.sin(Math.PI / 6), sx * Math.cos(Math.PI / 6));
      const [x, z] = cornerPt(sx, 1, a, 4.9);
      person(x, z, 'camera');
      const [tx, tz] = cornerPt(sx, 1, a, 4.35);
      for (let k = 0; k < 3; k++) {
        const la = (k / 3) * Math.PI * 2;
        props.push(bar(tx, F + 1.25, tz, tx + Math.cos(la) * 0.35, F, tz + Math.sin(la) * 0.35, 0.03, 0x2a2e36));
      }
      props.push(box(0.5, 0.28, 0.24, tx, F + 1.4, tz, Math.atan2(-tx, -tz) + Math.PI / 2, 0x16181d));
      blobs.push([tx, tz, 0.8]);
    }
    // officials: one by the judges, one walking the north-east corner
    {
      const a = Math.atan2(Math.sin((160 * Math.PI) / 180), Math.cos((160 * Math.PI) / 180));
      const [x, z] = cornerPt(-1, 1, a, 4.9);
      person(x, z, 'official');
      const [wx, wz] = cornerPt(1, 1, Math.PI / 3.2, 5.7);
      person(wx, wz, 'official', undefined, true);
      const [qx, qz] = cornerPt(-1, -1, -Math.PI / 2 - 0.1, 5.75);
      person(qx, qz, 'security', undefined, true);
    }

    // ------------------------------------------------------------ cables taped across the floor
    const cable = (pts: [number, number][]) => {
      for (let i = 0; i < pts.length - 1; i++) props.push(bar(pts[i][0], F + 0.012, pts[i][1], pts[i + 1][0], F + 0.012, pts[i + 1][1], 0.045, 0x07080b, 0.02));
    };
    for (const sx of [-1, 1]) {
      cable([
        [sx * 6.1, -1.6],
        [sx * 7.8, -1.9],
        [sx * 9.6, -2.6],
        [sx * 11.2, -2.9],
      ]);
      cable([
        [sx * 6.0, 2.0],
        [sx * 8.4, 2.3],
        [sx * 9.6, 1.95],
      ]);
      cable([
        [sx * 5.0, 3.6],
        [sx * 6.6, 5.4],
        [sx * 8.6, 6.6],
        [sx * 9.9, 7.0],
      ]);
      cable([
        [sx * 5.2, -3.4],
        [sx * 6.8, -5.6],
        [sx * 8.2, -6.9],
      ]);
    }

    const propMesh = new THREE.Mesh(mergeGeometries(props)!, new THREE.MeshBasicMaterial({ vertexColors: true }));
    g.add(propMesh);

    // ------------------------------------------------------------ contact shadows
    const sh: THREE.BufferGeometry[] = blobs.map(([x, z, r]) => new THREE.PlaneGeometry(r, r).rotateX(-Math.PI / 2).translate(x, F + 0.004, z));
    const blobMesh = new THREE.Mesh(
      mergeGeometries(sh)!,
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0xffffff }),
    );
    blobMesh.renderOrder = -1;
    g.add(blobMesh);

    // ------------------------------------------------------------ uplights at the foot of the boards
    const lampPos: number[] = [], lampCol: number[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.13;
      const x = Math.cos(a), z = Math.sin(a);
      // walk out to just inside the boards
      let r = 9;
      const inside = (px: number, pz: number) => {
        const qx = Math.abs(px) - SX, qz = Math.abs(pz) - SZ;
        const lim = RC - 0.85;
        return qx <= 0 ? qz <= lim : qz <= 0 ? qx <= lim : Math.hypot(qx, qz) <= lim;
      };
      while (inside(x * (r + 0.1), z * (r + 0.1))) r += 0.1;
      const col = new THREE.Color(k % 2 ? 0x3fe0ff : 0xff8a2a).multiplyScalar(0.8);
      lampPos.push(x * r, F + 0.12, z * r);
      lampCol.push(col.r, col.g, col.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lampCol, 3));
    this.lampMat = steadyPoints(u, 0.16);
    const lamps = new THREE.Points(lg, this.lampMat);
    lamps.frustumCulled = false;
    g.add(lamps);

    // ------------------------------------------------------------ photographers' flashes
    const fp: number[] = [];
    for (const p of this.people) if (p.role === 'photo') fp.push(p.x * 0.985, F + 1.55, p.z * 0.985);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    this.flashMat = flashPoints(u);
    const flashes = new THREE.Points(fg, this.flashMat);
    flashes.frustumCulled = false;
    g.add(flashes);
  }

  setPixelScale(h: number) {
    this.flashMat.uniforms.uScale.value = h;
    this.lampMat.uniforms.uScale.value = h;
  }

  /** Big moments set the photographers' flashes off. */
  event(type: string, data?: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    const big =
      type === 'knockdown' || type === 'ko' || type === 'decision' || type === 'fightStart' || (type === 'hit' && !d?.blocked && !d?.shielded && (d?.damage >= 45 || d?.crit));
    if (!big) return;
    const u = this.flashMat.uniforms;
    u.uBurst.value = this.t;
    u.uBurstK.value = type === 'ko' || type === 'knockdown' ? 1 : 0.55;
  }

  update(dt: number) {
    this.t += dt;
    this.flashMat.uniforms.uNow.value = this.t;
  }
}

/** Steady round glows (uplight lenses). */
function steadyPoints(u: Uniforms, size: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uSize: { value: size }, uGlow: { value: RenderSettings.glow(1.6) }, uHype: u.uHype },
    vertexShader: /* glsl */ `
      attribute vec3 color; varying vec3 vC;
      uniform float uScale, uSize;
      void main() {
        vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uScale * uSize / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow, uHype; varying vec3 vC;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.0, r);
        gl_FragColor = vec4(vC * a * uGlow * (0.8 + 0.3 * uHype), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Camera flashes: each photographer fires a few frames after a big moment (staggered, a couple
 * of shots each), and now and then on their own.
 */
function flashPoints(u: Uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uNow: { value: 0 },
      uBurst: { value: -99 },
      uBurstK: { value: 0 },
      uScale: { value: 600 },
      uGlow: { value: RenderSettings.glow(2.2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uNow, uBurst, uBurstK, uScale;
      varying float vA;
      float h(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float s = h(dot(position.xz, vec2(12.9898, 78.233)));
        float dt = uNow - uBurst;
        float a = 0.0;
        // two shots each, spread over the first second, only for the keener ones on smaller moments
        for (int k = 0; k < 2; k++) {
          float at = h(s * 17.0 + float(k) * 3.1) * 0.9 + float(k) * 0.35;
          a = max(a, step(s, 0.35 + uBurstK) * smoothstep(0.09, 0.0, abs(dt - at - 0.045)));
        }
        // the odd shot during a lull
        a = max(a, step(0.9975, h(floor(uTime * 10.0) + s * 91.0)));
        vA = a;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = a > 0.0 ? uScale * 0.3 / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
        float a = pow(smoothstep(0.25, 0.0, r), 1.6) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * uGlow, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
