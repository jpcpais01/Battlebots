import * as THREE from 'three';
import { CITY_Y, ISLAND, LAKE, SITES, height, siteGround } from './layout';
import { DECK_Y, NEON, type Plan } from './plan';
import { MAP_GLSL, MAP_OUT, Mesher, glowMaterial, litMaterial, mapMaterial, type MapUniforms } from './kit';
import { EVENTS } from '../../game/events';

/**
 * The event venues as they look on the map: the domed Grand Arena downtown, the ring on top of
 * the Skydeck tower, the container-yard ring at the docks, the shrine clearing in the Lantern
 * Grove, the platform by the Cascade Falls dam and the beach ring on Coral Island (with the
 * ferry running out to it). Each has a soft light pillar in its event's colour so it can be found
 * from anywhere on the map.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** The top of the Skydeck tower (see plan.ts). */
export const SKYDECK_Y = CITY_Y + 252;

export interface Sites {
  group: THREE.Group;
  /** Where each event's pin points (world space). */
  anchors: Record<string, THREE.Vector3>;
  /** Extra shadow casters for the shadow map. */
  shadows: { x: number; z: number; w: number; d: number; top: number }[];
  /** Red warning lights (x, y, z flat). */
  beacons: number[];
  update(dt: number, t: number): void;
  /** Light up one site's pillar (the event card is open on it), or none. */
  highlight(id: string | null): void;
}

class Kit {
  lit = new Mesher();
  glow = new Mesher();
  box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1).translate(0, 0.5, 0);
  cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).translate(0, 0.5, 0);
  sphere = new THREE.SphereGeometry(0.5, 8, 6);
  place(g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number, rot = 0, glow = false, rx = 0, rz = 0) {
    _q.setFromEuler(_e.set(rx, rot, rz));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    (glow ? this.glow : this.lit).add(g, _m, _c.setHex(col));
  }
  /** A fight ring at map scale: canvas, apron, posts with lit tops, ropes glowing in `accent`. */
  ring(x: number, y: number, z: number, size: number, rot: number, accent: number) {
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const at = (lx: number, lz: number): [number, number] => [x + lx * ca + lz * sa, z - lx * sa + lz * ca];
    this.place(this.box, x, y, z, size + 3, 1.6, size + 3, 0x2a2d33, rot);
    this.place(this.box, x, y + 1.6, z, size, 0.3, size, 0xe9e4da, rot);
    const h = size / 2;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const [px, pz] = at(sx * h, sz * h);
        this.place(this.cyl, px, y + 1.6, pz, 0.6, 3.4, 0.6, 0x3a3d44);
        this.place(this.sphere, px, y + 5.1, pz, 0.9, 0.9, 0.9, sx * sz > 0 ? 0xff7a2a : 0x2ad8ff, 0, true);
      }
    for (let k = 0; k < 3; k++) {
      const ry = y + 2.6 + k * 0.85;
      for (const s of [-1, 1]) {
        let [px, pz] = at(0, s * h);
        this.place(this.box, px, ry, pz, size, 0.18, 0.18, accent, rot, true);
        [px, pz] = at(s * h, 0);
        this.place(this.box, px, ry, pz, 0.18, 0.18, size, accent, rot, true);
      }
    }
  }
  /** A floodlight mast with a lit head, leaning in towards (tx, tz). */
  mast(x: number, y: number, z: number, h: number, tx: number, tz: number) {
    this.place(this.cyl6, x, y, z, 0.9, h, 0.9, 0x8d9196);
    const rot = Math.atan2(tx - x, tz - z);
    this.place(this.box, x, y + h, z, 4.5, 2.2, 1.2, 0x30333a, rot);
    this.place(this.box, x + Math.sin(rot) * 0.65, y + h + 0.2, z + Math.cos(rot) * 0.65, 4, 1.6, 0.2, 0xfff3d6, rot, true);
  }
}

export function buildSites(u: MapUniforms, plan: Plan): Sites {
  const k = new Kit();
  const group = new THREE.Group();
  const anchors: Record<string, THREE.Vector3> = {};
  const shadows: Sites['shadows'] = [];
  const beacons: number[] = [];
  const color = (id: string) => EVENTS.find((e) => e.id === id)?.color ?? 0xffffff;

  // ---------------------------------------------------------------- the Grand Arena: a stadium with a halo roof
  {
    const { x, z } = SITES.grand;
    const y = siteGround('grand');
    // the plaza round it
    k.place(k.cyl, x, y - 0.6, z, 190, 0.75, 170, 0xcfc5b4);
    // the bowl: a ribbed oval wall, stepping in as it rises
    const ribs = 56;
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2;
      const rx = 64, rz = 54;
      const px = x + Math.cos(a) * rx, pz = z + Math.sin(a) * rz;
      const rot = Math.atan2(Math.cos(a) / rx, Math.sin(a) / rz);
      k.place(k.box, px, y, pz, 7.4, 24, 3.2, i % 2 ? 0xf1ece2 : 0xe2dbcf, rot);
      // glass between the ribs, lit from inside
      k.place(k.box, x + Math.cos(a) * (rx - 1.2), y + 3, z + Math.sin(a) * (rz - 1.2), 7.8, 18, 0.4, 0xffd9a8, rot, true);
    }
    // the seating, sloping down to the floor, in the home colours
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const f = 1 - t / tiers;
      const segs = 48;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const rx = 22 + 38 * f, rz = 18 + 32 * f;
        const rot = Math.atan2(Math.cos(a) / rx, Math.sin(a) / rz);
        k.place(k.box, x + Math.cos(a) * rx, y, z + Math.sin(a) * rz, 8.5 * (rx / 60), 4 + 18 * f, 6.5, t % 2 ? 0x2f4a7a : 0x3b5d96, rot);
      }
    }
    k.place(k.cyl, x, y, z, 44, 0.6, 36, 0x24262b);
    k.ring(x, y + 0.6, z, 16, 0, color('grand'));
    // the halo: a ring roof on slender columns, its underside lit gold
    const torus = new THREE.TorusGeometry(1, 0.11, 6, 64).rotateX(Math.PI / 2);
    _m.compose(_p.set(x, y + 34, z), _q.identity(), _s.set(62, 30, 52));
    k.lit.add(torus, _m, _c.setHex(0xf4f1ea));
    _m.compose(_p.set(x, y + 31.5, z), _q.identity(), _s.set(60, 6, 50));
    k.glow.add(new THREE.TorusGeometry(1, 0.025, 4, 64).rotateX(Math.PI / 2), _m, _c.setHex(color('grand')));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.place(k.cyl6, x + Math.cos(a) * 62, y + 22, z + Math.sin(a) * 52, 1.4, 12, 1.4, 0xe9e6df);
    }
    // light masts at the four corners of the plaza
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.mast(x + sx * 78, y, z + sz * 66, 44, x, z);
    anchors.grand = new THREE.Vector3(x, y + 40, z);
    shadows.push({ x, z, w: 120, d: 100, top: y + 24 });
    beacons.push(x, y + 46, z);
  }

  // ---------------------------------------------------------------- Skydeck 88: a ring on the tower top
  {
    const { x, z } = SITES.rooftop;
    const y = SKYDECK_Y;
    k.place(k.box, x, y, z, 28, 0.6, 28, 0x34373f);
    k.ring(x, y + 0.6, z, 12, Math.PI / 4, color('rooftop'));
    // glass balustrade lit along its top edge
    for (const s of [-1, 1]) {
      k.place(k.box, x, y + 0.6, z + s * 14.6, 30, 1.6, 0.3, 0x9fc3d6);
      k.place(k.box, x + s * 14.6, y + 0.6, z, 0.3, 1.6, 30, 0x9fc3d6);
      k.place(k.box, x, y + 2.2, z + s * 14.6, 30, 0.25, 0.4, color('rooftop'), 0, true);
      k.place(k.box, x + s * 14.6, y + 2.2, z, 0.4, 0.25, 30, color('rooftop'), 0, true);
    }
    // holo pylons at the corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      k.place(k.cyl6, x + sx * 12, y + 0.6, z + sz * 12, 0.8, 9, 0.8, 0x2a2d33);
      k.place(k.box, x + sx * 12, y + 6, z + sz * 12, 0.3, 4, 3.5, NEON[(sx + sz + 4) % 5], Math.atan2(sx, sz), true);
    }
    anchors.rooftop = new THREE.Vector3(x, y + 8, z);
    beacons.push(x + 13, y + 10, z + 13);
  }

  // ---------------------------------------------------------------- Pier 9: a ring among the containers
  {
    const { x, z } = SITES.harbor;
    const y = siteGround('harbor');
    k.place(k.box, x, y - 1, z, 70, 1.05, 60, 0x8f8a80);
    k.ring(x, y, z, 14, 0, color('harbor'));
    // stands made of stacked containers on three sides, open to the bay
    const cols = [0xc0392b, 0x2b6cb0, 0xe0a82e, 0x2f855a, 0xd35d3a, 0x8e44ad];
    let n = 0;
    for (const [cx, cz, rot] of [
      [x, z - 22, 0],
      [x - 24, z, Math.PI / 2],
      [x + 24, z, Math.PI / 2],
    ] as const) {
      for (let row = 0; row < 3; row++)
        for (let i = -2; i <= 2; i++) {
          const along = i * 6.4, back = row * 2.7;
          const ox = rot === 0 ? along : (cx > x ? back : -back);
          const oz = rot === 0 ? -back : along;
          k.place(k.box, cx + ox, y + row * 2.6, cz + oz, 6, 2.55, 2.4, cols[n++ % cols.length], rot);
        }
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.mast(x + sx * 30, y, z + sz * 25, 26, x, z);
    // strings of festoon lights across the yard
    for (let i = 0; i < 36; i++) {
      const t = i / 35;
      for (const s of [-1, 1]) k.place(k.sphere, x - 30 + t * 60, y + 16 - Math.sin(t * Math.PI) * 4, z + s * 12, 0.7, 0.7, 0.7, i % 3 ? 0xffc46b : 0xff7ab0, 0, true);
    }
    anchors.harbor = new THREE.Vector3(x, y + 18, z);
    shadows.push({ x, z: z - 24, w: 34, d: 8, top: y + 7.8 });
  }

  // ---------------------------------------------------------------- the Lantern Grove: a shrine clearing in the cedars
  {
    const { x, z } = SITES.grove;
    const y = siteGround('grove');
    // a stone platform, raked gravel round it
    k.place(k.cyl, x, y - 0.6, z, 64, 0.8, 64, 0xb9b2a2);
    k.place(k.box, x, y - 0.2, z, 22, 1.2, 22, 0x8d877b);
    k.ring(x, y + 1, z, 13, 0, color('grove'));
    // the great gate on the approach, facing the city
    const gx = x + 28, gz = z + 18, rot = Math.atan2(1, 0.65);
    const vermilion = 0xd4442a;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (const s of [-1, 1]) k.place(k.cyl, gx + ca * s * 6, y, gz - sa * s * 6, 1.4, 13, 1.4, vermilion);
    k.place(k.box, gx, y + 13, gz, 17, 1.3, 1.6, 0x2a2420, rot);
    k.place(k.box, gx, y + 12.2, gz, 16, 0.8, 1.4, vermilion, rot);
    k.place(k.box, gx, y + 10.2, gz, 13, 0.8, 1, vermilion, rot);
    // a little shrine hall behind the ring
    const hx = x - 26, hz = z - 16;
    k.place(k.box, hx, y, hz, 14, 5, 10, 0xe9dfc8, 0.4);
    k.place(k.box, hx, y + 5, hz, 17, 1.2, 13, 0x3a3f46, 0.4);
    k.place(k.box, hx, y + 6.2, hz, 12, 1.6, 8, 0x3a3f46, 0.4);
    // stone lanterns round the platform, and paper lanterns strung through the trees
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const lx = x + Math.cos(a) * 19, lz = z + Math.sin(a) * 19;
      k.place(k.box, lx, y, lz, 1.2, 2.2, 1.2, 0xa8a293);
      k.place(k.box, lx, y + 2.2, lz, 1.1, 0.9, 1.1, 0xffd08a, 0, true);
      k.place(k.box, lx, y + 3.1, lz, 1.8, 0.5, 1.8, 0xa8a293);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r = 29 + Math.sin(i * 1.7) * 2;
      const sag = Math.abs(Math.sin(a * 5));
      k.place(k.sphere, x + Math.cos(a) * r, y + 8.5 - sag * 2.5, z + Math.sin(a) * r, 1.1, 1.3, 1.1, i % 4 ? 0xff9a4a : 0xff5a6a, 0, true);
    }
    anchors.grove = new THREE.Vector3(x, y + 16, z);
    shadows.push({ x: hx, z: hz, w: 16, d: 13, top: y + 7.8 });
  }

  // ---------------------------------------------------------------- Cascade Falls: the dam and its platform
  const mist: number[] = [];
  {
    const { x, z } = SITES.falls;
    const y = siteGround('falls');
    // the dam across the river at the lip of the falls
    const dz = -804;
    k.place(k.box, -300, LAKE.y - 26, dz, 64, 26 + 2.5, 8, 0xc4bdb0);
    for (let i = -2; i <= 2; i++) k.place(k.box, -300 + i * 9, LAKE.y - 1.6, dz + 4.2, 4.5, 3.6, 0.6, 0x4a4f55);
    // a walkway from the dam to the platform, and the platform out over the drop
    k.place(k.box, (x - 300 + 30) / 2, y - 0.8, dz, x + 300 - 30, 0.8, 5, 0xb8b1a4);
    k.place(k.box, x, y - 1.2, z, 32, 1.4, 32, 0xb8b1a4);
    for (const s of [-1, 1]) {
      k.place(k.box, x, y + 0.2, z + s * 15.6, 32, 1.2, 0.4, 0x6f757c);
      k.place(k.box, x + s * 15.6, y + 0.2, z, 0.4, 1.2, 32, 0x6f757c);
    }
    k.ring(x, y + 0.2, z, 13, 0, color('falls'));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.mast(x + sx * 15, y + 0.2, z + sz * 15, 18, x, z);
    // the falls' spray
    const by = height(-301, -762);
    for (let i = 0; i < 14; i++) mist.push(-301 + (Math.sin(i * 2.3) * 14), Math.max(by, 120) + 4 + (i % 4) * 9, -764 + Math.cos(i * 1.7) * 9, 16 + (i % 3) * 8);
    anchors.falls = new THREE.Vector3(x, y + 16, z);
    shadows.push({ x: -300, z: dz, w: 64, d: 8, top: LAKE.y + 2.5 });
  }

  // ---------------------------------------------------------------- Coral Island: a ring on the sand
  {
    const { x, z } = SITES.island;
    const y = siteGround('island');
    k.place(k.cyl, x, y - 0.6, z, 50, 0.65, 50, 0xf0dfb4);
    k.ring(x, y, z, 13, 0.3, color('island'));
    // bamboo bleachers either side
    for (const s of [-1, 1])
      for (let row = 0; row < 4; row++) {
        const rot = 0.3;
        const off = 14 + row * 2.4;
        k.place(k.box, x + Math.cos(rot) * s * off, y, z - Math.sin(rot) * s * off, 2.2, 1 + row * 1.1, 20, 0xc9a66b, rot);
      }
    // tiki torches and palm-leaf sunshades
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tx = x + Math.cos(a) * 24, tz = z + Math.sin(a) * 24;
      k.place(k.cyl6, tx, y, tz, 0.35, 4.2, 0.35, 0x6b4a2b);
      k.place(k.sphere, tx, y + 4.6, tz, 0.9, 1.4, 0.9, 0xff9a3a, 0, true);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const ux = x + Math.cos(a) * 34, uz = z + Math.sin(a) * 30;
      k.place(k.cyl6, ux, y, uz, 0.3, 3.4, 0.3, 0x6b4a2b);
      k.place(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), ux, y + 3, uz, 3.4, 1.2, 3.4, 0xb69a52);
    }
    // the jetty, out to where the ferry comes in
    const jx = ISLAND.x - 96, jz = ISLAND.z - 82;
    k.place(k.box, jx + 10, DECK_Y - 1, jz + 9, 6, 1, 34, 0x9a7a55, -0.8);
    anchors.island = new THREE.Vector3(x, y + 12, z);
  }

  const lit = new THREE.Mesh(k.lit.geometry(), litMaterial(u));
  const glow = new THREE.Mesh(k.glow.geometry(), glowMaterial(u));
  group.add(lit, glow);

  // ---------------------------------------------------------------- light pillars
  const ids = Object.keys(anchors);
  const pillars = pillarMesh(u, ids.map((id) => ({ at: anchors[id], col: color(id) })));
  group.add(pillars.mesh);

  // ---------------------------------------------------------------- spray at the falls
  if (mist.length) group.add(mistMesh(u, mist));

  // ---------------------------------------------------------------- the island ferry
  const ferry = ferryBoat(u, plan);
  group.add(ferry.group);

  return {
    group,
    anchors,
    shadows,
    beacons,
    update(dt, t) {
      ferry.update(t);
      void dt;
    },
    highlight(id) {
      ids.forEach((s, i) => (pillars.boost.value[i] = s === id ? 1 : 0));
    },
  };
}

// ------------------------------------------------------------------ pillars of light
function pillarMesh(u: MapUniforms, list: { at: THREE.Vector3; col: number }[]) {
  const H = 340;
  const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
  const pos: number[] = [], nor: number[] = [], vals: number[] = [], idx: number[] = [];
  list.forEach((p, i) => {
    const base = pos.length / 3;
    const P = g.attributes.position, N = g.attributes.normal;
    for (let v = 0; v < P.count; v++) {
      nor.push(N.getX(v), N.getY(v), N.getZ(v));
      const y = P.getY(v);
      pos.push(p.at.x + P.getX(v) * 7, p.at.y - 10 + y * H, p.at.z + P.getZ(v) * 7);
      _c.setHex(p.col);
      vals.push(_c.r, _c.g, _c.b, y, i);
    }
    for (let k = 0; k < g.index!.count; k++) idx.push(base + g.index!.getX(k));
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const cols: number[] = [], ys: number[] = [];
  for (let k = 0; k < vals.length; k += 5) {
    cols.push(vals[k], vals[k + 1], vals[k + 2]);
    ys.push(vals[k + 3], vals[k + 4]);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setAttribute('aY', new THREE.Float32BufferAttribute(ys, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const boost = { value: list.map(() => 0) };
  const mat = mapMaterial(u, {
    uniforms: { uBoost: boost },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 aY;
      uniform float uBoost[6];
      varying vec3 vCol, vWorld, vN;
      varying float vY, vBoost;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color;
        vY = aY.x;
        vBoost = uBoost[int(aY.y + 0.5)];
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol, vWorld, vN;
      varying float vY, vBoost;
      #include <fog_pars_fragment>
      void main() {
        vec3 V = normalize((cameraPosition - uMapShift) - vWorld);
        // brightest in the middle of the column (where the eye looks through most of it)
        float core = pow(max(abs(dot(V, normalize(vN))), 0.0), 1.5);
        float rise = fract(vY * 3.0 - uTime * 0.35);
        float k = (1.0 - vY) * (1.0 - vY) * core * (0.75 + 0.25 * smoothstep(0.0, 0.2, rise) * smoothstep(1.0, 0.6, rise));
        k *= 0.16 + 0.3 * vBoost;
        gl_FragColor = vec4(vCol * k * uGlow * 0.6, 1.0);
        ${MAP_OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4;
  return { mesh, boost };
}

// ------------------------------------------------------------------ spray
function mistMesh(u: MapUniforms, list: number[]) {
  const n = list.length / 4;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(list), 4));
  g.instanceCount = n;
  const mat = mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec4 aPuff;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vUv = position.xy;
        vSeed = aPuff.x * 0.37 + aPuff.z * 0.11;
        float t = fract(uTime * 0.12 + vSeed);
        vec3 c = aPuff.xyz + vec3(0.0, t * 14.0, 0.0);
        float s = aPuff.w * (0.7 + 0.6 * t);
        vec4 mvPosition = viewMatrix * vec4(c + uMapShift, 1.0) + vec4(position.xy * s, 0.0, 0.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec2 vUv;
      varying float vSeed;
      #include <fog_pars_fragment>
      void main() {
        float t = fract(uTime * 0.12 + vSeed);
        float a = smoothstep(1.0, 0.2, length(vUv)) * (texture2D(uNoise, vUv * 0.4 + vSeed).g * 0.6 + 0.4);
        a *= smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.5, t) * 0.55;
        vec3 c = vec3(0.92, 0.95, 1.0) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4);
        gl_FragColor = vec4(c, a);
        ${MAP_OUT}
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// ------------------------------------------------------------------ the ferry
function ferryBoat(u: MapUniforms, plan: Plan) {
  const ms = new Mesher();
  const hull = new THREE.BoxGeometry(1, 1, 1);
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number) => ms.add(hull, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)), _c.setHex(col));
  put(0, 0.5, 0, 7, 2, 22, 0xf4f2ee);
  put(0, 1.4, 0, 7.2, 0.4, 22.2, 0x2b6cb0);
  put(0, 2.6, -1, 5.4, 2.4, 11, 0xf8f6f2);
  put(0, 4.2, -2.5, 4.4, 1.2, 5, 0x2b6cb0);
  ms.at(new THREE.ConeGeometry(3.5, 5, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), 0, 0.5, 13, 0xf4f2ee);
  const boat = new THREE.Mesh(ms.geometry(), litMaterial(u));
  // the wake: a foamy V trailing behind
  const wg = new THREE.PlaneGeometry(14, 60, 1, 8).rotateX(-Math.PI / 2).translate(0, 0.15, -38);
  const wake = new THREE.Mesh(
    wg,
    mapMaterial(u, {
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        uniform vec3 uMapShift;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.x *= mix(1.0, 0.3, uv.y);
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz - uMapShift;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${MAP_GLSL}
        varying vec2 vUv;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          float edge = abs(vUv.x - 0.5) * 2.0;
          float foam = texture2D(uNoise, vWorld.xz / 6.0).r;
          float a = smoothstep(0.2, 0.95, edge) * smoothstep(1.0, 0.5, edge) + (1.0 - smoothstep(0.0, 0.25, edge)) * 0.5;
          a *= vUv.y * vUv.y * (0.5 + foam * 0.7) * 0.8;
          gl_FragColor = vec4(vec3(0.95) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4), a);
          ${MAP_OUT}
        }`,
      transparent: true,
      depthWrite: false,
    }),
  );
  wake.renderOrder = 2;
  const group = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(boat, wake);
  group.add(holder);
  // the route: from the middle pier, out of the bay's mouth, across to the island's jetty
  const pier = plan.docks.piers[1] ?? [223, 200, 241, 272];
  const pts = [
    new THREE.Vector3((pier[0] + pier[2]) / 2 + 16, 0, pier[3] - 6),
    new THREE.Vector3(260, 0, 360),
    new THREE.Vector3(320, 0, 470),
    new THREE.Vector3(480, 0, 590),
    new THREE.Vector3(ISLAND.x - 100, 0, ISLAND.z - 70),
  ];
  const route = new THREE.CatmullRomCurve3(pts);
  const L = route.getLength();
  const look = new THREE.Vector3();
  return {
    group,
    update(t: number) {
      // out, a pause at the jetty, back, a pause at the pier
      const run = L / 9;
      const cycle = 2 * run + 2 * 14;
      let s = t % cycle;
      let f: number;
      let back = false;
      if (s < run) f = s / run;
      else if ((s -= run) < 14) f = 1;
      else if ((s -= 14) < run) {
        f = 1 - s / run;
        back = true;
      } else f = 0;
      const e = f * f * (3 - 2 * f);
      const p = route.getPointAt(Math.min(1, Math.max(0, e)));
      route.getPointAt(Math.min(1, Math.max(0, e + (back ? -0.01 : 0.01))), look);
      holder.position.set(p.x, 0, p.z);
      holder.lookAt(look.x, 0, look.z);
      wake.visible = f > 0.01 && f < 0.99;
    },
  };
}
