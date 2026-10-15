import * as THREE from 'three';
import { AX, FLOOR, TUNNEL_OPEN_H, TUNNEL_OPEN_HW, outline } from '../bowl';
import { Mesher, Tris, billboards, glowMaterial, lin, litMaterial, paintTexture, prng, vMaterial, V_GLSL, V_OUT, waterMaterial, type Daylight, type VenueUniforms } from './kit';
import { OutdoorVenue, STANDS_D, STANDS_TOP, sunLook } from './outdoor';
import { block, gulls, hullGeometry, rod } from './props';

/**
 * Pier 9 Container Yard: the Harbor Cup, fought on the quay at sunset. Stands painted in shipping
 * container colours, walled in by a ring of stacked boxes strung with festoon lights; behind them
 * the yard's stacks run off towards the city, ship-to-shore cranes tower over the quay working a
 * container ship tied up alongside, and the sun goes down over the harbour to the west, behind a
 * lighthouse. Across the yard the city's skyline and its four mega-towers catch the last light.
 */

const SUN = new THREE.Vector3(-0.9, 0.22, 0.36).normalize();
const DAY: Daylight = { sun: SUN, sunCol: 0xffb070, sunK: 2.1, sky: 0x8f9ad8, skyK: 0.55, gnd: 0x7a6656, gndK: 0.36, haze: 0xf0b48c, hazeK: 0.0021 };
const WATER_Y = FLOOR - 2.4;
/** The quay: land where x > X0 and z < Z1, water beyond. */
const QUAY = { x0: -70, z1: 44, x1: 700, zMin: -700 };
const SHORE_GLSL = /* glsl */ `
  float shoreDist(vec2 p) {
    vec2 d = vec2(${QUAY.x0.toFixed(1)} - p.x, p.y - ${QUAY.z1.toFixed(1)});
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }`;

// containers: 40ft and 20ft boxes
const CW = 2.44, CH = 2.59, C40 = 12.19, C20 = 6.06;
interface Box {
  x: number;
  /** Bottom. */
  y: number;
  z: number;
  len: number;
  rot: number;
  col: THREE.Color;
}
const BOX_COLS = [0x9c3b26, 0xa8402a, 0x3d8fc4, 0x1f4f8a, 0x2f7a4a, 0xd8722a, 0xe0b030, 0x8a9096, 0xe2e0da, 0x6b4532, 0x2a8c8c, 0xb0306a, 0x1f4f8a, 0x3d8fc4, 0x9c3b26].map((h) => lin(h));
const boxCol = (r: () => number) => BOX_COLS[Math.floor(r() * BOX_COLS.length)].clone().multiplyScalar(0.82 + r() * 0.26);

/** Where shadows are cast from (rectangles in plan, rising to a height; or posts). */
interface Caster {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  y0: number;
  y1: number;
}

// the yard: blocks of 40ft stacks, 4 bays by 8 rows, in a grid with lanes between
const BAY = C40 + 0.42, ROW = CW + 0.3;
const BLOCK_X = [-66, 0, 66, 132, 198, 264];
const BLOCK_Z = [-56, -94, -132, -170, -208, -246];
const BLOCK_ROWS = 8;
/** The ship-to-shore cranes along the quay, and where the ship lies. */
const CRANES = [20, 74, 128];
const SHIP = { x0: 2, x1: 184, z0: 51, z1: 81 };
const SHIP_DECK = WATER_Y + 12.5;
/** The ship's half-breadth at the deck, from the bow (u 0) to the stern (u 1). */
const shipHalf = (u: number) => ((SHIP.z1 - SHIP.z0) / 2) * Math.min(1, Math.sqrt(Math.max(0, Math.min(1, u / 0.22))) * 1.02) * (u > 0.97 ? 1 - (u - 0.97) * 3 : 1);

export class HarborVenue extends OutdoorVenue {
  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }) {
    const r = prng(9);
    const treadCols = [0x9c3b26, 0x3d8fc4, 0x2f7a4a, 0xd8722a, 0x1f4f8a, 0x8a9096, 0xe0b030, 0x2a8c8c].map((h) => lin(h, 0.9));
    super(quality, arena, {
      day: DAY,
      sky: { zenith: 0x34497f, horizon: 0xf2a070, glow: 0xff9050, glowSize: 0.8, cloud: 0.4, cloudLit: 0xffc49a, cloudShade: 0x6a5a7a, stars: 0.12, disc: 1 },
      look: sunLook(DAY, { fogDensity: 0.004, env: 0.7, hemi: [0x8f9ad8, 0x6a5040, 0.85], key: 3.0, keyCol: 0xffb47a, rims: [0xff8040, 10, 0x60b8ff, 9] }),
      floor: { map: plateTexture(), metres: 3.2, roughness: 0.62 },
      stands: {
        // each section painted like the container it was cut from, ribbed
        tread: (ri, k) => treadCols[Math.floor(k / 7) % treadCols.length].clone().multiplyScalar((k % 7 === 0 ? 0.72 : 1) * (0.94 + 0.12 * (ri % 2))),
        riser: () => lin(0x2f3336),
        wall: lin(0x7c3a26),
        aisle: lin(0xe0b020),
        rail: lin(0xf2c018),
        parapet: 1.0,
      },
      crowd: { day: 0.8, light: 0xffc898, k: 0.85 },
      outer: FLOOR,
      hall: { base: 0.14, tint: 0xffc89a },
    });
    const g = this.group;
    const u = this.u;
    const low = quality === 'low';

    const boxes: Box[] = [];
    const casters: Caster[] = [];
    const steel = new Mesher();
    const glows = new Mesher();
    const halos: { size: number; pts: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] }[] = [];
    const lamps = (size: number) => {
      const h = { size, pts: [] as { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] };
      halos.push(h);
      return h.pts;
    };
    const festoon = lamps(0.75), floods = lamps(4.5), beacons = lamps(1.6), ship = lamps(2.4);

    // ------------------------------------------------------------ the quay, the water
    yardBoxes(boxes, casters, r, low ? 3 : BLOCK_Z.length);
    ringBoxes(boxes, casters, r);
    // the ship's own stacks, then its shadow on the quay
    shipBoxes(boxes, r);
    casters.push({ x: (SHIP.x0 + SHIP.x1) / 2, z: (SHIP.z0 + SHIP.z1) / 2, w: SHIP.x1 - SHIP.x0, d: SHIP.z1 - SHIP.z0, rot: 0, y0: FLOOR, y1: SHIP_DECK + 13 });
    for (const x of CRANES) for (const sx of [-1, 1]) for (const z of [30, 42]) casters.push({ x: x + sx * 8.5, z, w: 1.4, d: 1.4, rot: 0, y0: FLOOR, y1: 40 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), waterMaterial(u, { deep: 0x10324a, shallow: 0x285f66, zenith: 0x34497f, shore: SHORE_GLSL, clear: 0.25, foam: 0.35 }));
    sea.position.set(0, WATER_Y, 0);
    g.add(sea);
    g.add(new THREE.Mesh(quayEdge(steel), this.lit));

    // ------------------------------------------------------------ the big screens, on container stacks
    for (const sz of [-1, 1]) {
      const z = sz * (STANDS_D + 14.2);
      const y = STANDS_TOP + 5.2;
      this.screen(0, y, z, sz > 0 ? Math.PI : 0, 9.6, 5.4);
      for (const ox of [-3.15, 3.15])
        for (let k = 0; k < 3; k++) boxes.push({ x: ox, y: FLOOR + k * CH, z: z + sz * 1.8, len: C20 - 0.1, rot: 0, col: boxCol(r) });
      casters.push({ x: 0, z: z + sz * 1.8, w: 12.4, d: CW, rot: 0, y0: FLOOR, y1: y + 2.7 });
      for (const ox of [-4.4, 4.4]) rod(steel, [ox, FLOOR + 3 * CH, z + sz * 0.9], [ox, y - 2.4, z + sz * 0.4], 0.09, 0.09, 0x2b2f33, 6);
      block(steel, 9.9, 0.3, 1.2, 0, y - 2.85, z + sz * 0.6, 0x2b2f33);
    }

    // ------------------------------------------------------------ the corners: steel portals, hazard posts, beacons
    for (const sx of [-1, 1]) {
      const team = sx < 0 ? 0xff7a1f : 0x3fe0ff;
      const x = sx * (AX - 0.22);
      const H = FLOOR + TUNNEL_OPEN_H;
      for (const sz of [-1, 1]) {
        const zc = sz * (TUNNEL_OPEN_HW + 0.25);
        // hazard-striped posts
        for (let y = FLOOR, k = 0; y < H + 0.9; y += 0.3, k++) block(steel, 0.34, 0.3, 0.34, x, y + 0.15, zc, k % 2 ? 0x1c1c1e : 0xf0b418);
        beacons.push({ x: x - sx * 0.05, y: H + 1.25, z: zc, c: new THREE.Color(1, 0.55, 0.1) });
        block(steel, 0.22, 0.2, 0.22, x, H + 1.05, zc, 0xffa020);
      }
      // the lintel: an I-beam in the team's colour, the sign below it
      block(steel, 0.42, 0.55, 2 * TUNNEL_OPEN_HW + 1.3, x, H + 0.62, 0, lin(team).multiplyScalar(0.75));
      block(steel, 0.5, 0.08, 2 * TUNNEL_OPEN_HW + 1.3, x, H + 0.92, 0, 0x22262a);
      block(steel, 0.5, 0.08, 2 * TUNNEL_OPEN_HW + 1.3, x, H + 0.32, 0, 0x22262a);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.4),
        new THREE.MeshBasicMaterial({ map: stencilTexture(sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER', team), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.1) }),
      );
      sign.position.set(x - sx * 0.22, H + 0.62, 0);
      sign.rotation.y = -sx * (Math.PI / 2);
      g.add(sign);
    }

    // ------------------------------------------------------------ crane booths on the stairwell blocks
    for (const v of this.vomTops) {
      const rot = Math.atan2(v.nx, v.nz);
      const c = boxCol(r);
      block(steel, 2.4, 2.2, 2.4, v.x, v.y + 1.1, v.z, c, rot);
      block(steel, 2.7, 0.14, 2.7, v.x, v.y + 2.27, v.z, 0x2b2f33, rot);
      // a lit window band facing the ring
      const wx = v.x - v.nx * 1.21, wz = v.z - v.nz * 1.21;
      block(glows, v.nx !== 0 ? 0.02 : 1.9, 0.75, v.nx !== 0 ? 1.9 : 0.02, wx, v.y + 1.45, wz, new THREE.Color(1, 0.72, 0.4).multiplyScalar(0.5));
      rod(steel, [v.x + 0.7, v.y + 2.3, v.z + 0.7], [v.x + 0.7, v.y + 3.6, v.z + 0.7], 0.025, 0.02, 0x2b2f33, 4);
      beacons.push({ x: v.x + 0.7, y: v.y + 3.7, z: v.z + 0.7, s: 0.6, c: new THREE.Color(1, 0.5, 0.1) });
    }

    // ------------------------------------------------------------ festoon lights round the container wall
    const ringTop = FLOOR + 3 * CH;
    const posts: THREE.Vector3[] = [];
    {
      const o = outline(STANDS_D + 1.6);
      const total = o[o.length - 1].s;
      const N = 20;
      for (let i = 0; i < N; i++) {
        const p = alongOutline(o, ((i + 0.5) / N) * total);
        // (kept low in front of the big screens)
        const front = Math.abs(p.x) < 7;
        const top = ringTop + (front ? 0.9 : 3.4);
        rod(steel, [p.x, ringTop, p.z], [p.x, top, p.z], 0.06, 0.05, 0x2b2f33, 5);
        posts.push(new THREE.Vector3(p.x, top - 0.1, p.z));
      }
      const warm = [new THREE.Color(1, 0.78, 0.45), new THREE.Color(1, 0.62, 0.3), new THREE.Color(1, 0.85, 0.6)];
      for (let i = 0; i < N; i++) {
        const a = posts[i], b = posts[(i + 1) % N];
        const M = 9;
        for (let k = 0; k <= M; k++) {
          const f = k / M;
          const p = a.clone().lerp(b, f);
          p.y -= Math.sin(f * Math.PI) * 0.9;
          if (k > 0 && k < M) festoon.push({ x: p.x, y: p.y - 0.08, z: p.z, c: warm[(i + k) % 3] });
          if (k < M) {
            const q = a.clone().lerp(b, (k + 1) / M);
            q.y -= Math.sin(((k + 1) / M) * Math.PI) * 0.9;
            rod(steel, [p.x, p.y, p.z], [q.x, q.y, q.z], 0.012, 0.012, 0x15171a, 3);
          }
        }
      }
    }
    // neon signs on the wall east and west, facing the ring
    for (const sx of [-1, 1]) {
      const x = sx * (AX + STANDS_D + 1.6);
      const sign = neonSign(sx < 0 ? 'HARBOR CUP' : 'PIER 9', sx < 0 ? '#ff4fa8' : '#3fe8ff', sx < 0 ? '#ffd0e8' : '#d8fbff');
      sign.position.set(x - sx * 0.3, ringTop + 1.35, 0);
      sign.rotation.y = -sx * (Math.PI / 2);
      g.add(sign);
      block(steel, 0.25, 2.3, 7.6, x, ringTop + 1.35, 0, 0x16181b);
      for (const oz of [-3, 3]) rod(steel, [x, ringTop, oz], [x, ringTop + 2.5, oz], 0.06, 0.06, 0x2b2f33, 5);
    }

    // ------------------------------------------------------------ floodlight masts at the four corners
    for (const [mx, mz] of [
      [-38, -34],
      [38, -34],
      [-38, 34],
      [38, 34],
    ]) {
      const top = 30;
      rod(steel, [mx, FLOOR, mz], [mx, top, mz], 0.5, 0.28, 0x8c9196, 8);
      for (let y = 4; y < top; y += 3.2) block(steel, 0.9, 0.08, 0.08, mx, y, mz, 0x6c7176);
      const face = Math.atan2(-mx, -mz);
      const fx = Math.sin(face), fz = Math.cos(face);
      block(steel, 6, 3.4, 0.35, mx, top + 1.5, mz, 0x3a3e42, face);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const ox = (i - 1.5) * 1.4, oy = top + 0.7 + j * 1.6;
          const px = mx + Math.cos(face) * ox + fx * 0.2, pz = mz - Math.sin(face) * ox + fz * 0.2;
          block(glows, 1.1, 1.2, 0.05, px, oy, pz, new THREE.Color(1, 0.94, 0.82).multiplyScalar(1.6), face);
          floods.push({ x: px + fx * 0.4, y: oy, z: pz + fz * 0.4, s: 0.55, c: new THREE.Color(1, 0.88, 0.7) });
        }
      beacons.push({ x: mx, y: top + 3.6, z: mz, s: 0.8, c: new THREE.Color(1, 0.15, 0.1) });
      casters.push({ x: mx, z: mz, w: 0.8, d: 0.8, rot: 0, y0: FLOOR, y1: top });
    }

    // ------------------------------------------------------------ the cranes, the ship
    const cranes = CRANES.map((x, i) => stsCrane(this, this.lit, steel, glows, beacons, x, i));
    for (const c of cranes) c(0);
    rtgCranes(steel, glows, beacons);
    buildShip(this, this.lit, steel, glows, ship);
    const tug = tugBoat(this, this.lit);
    g.add(tug);
    lighthouse(steel, glows, beacons, r);

    // ------------------------------------------------------------ far off: the city and its towers, hills across the water
    g.add(skyline(this, r, low));
    g.add(hills(this));
    g.add(gulls(u, this.tick, r));

    // ------------------------------------------------------------ build it all
    g.add(quayMesh(this, shadowMap(casters)));
    g.add(containerMesh(u, boxes));
    this.props(steel);
    g.add(new THREE.Mesh(glows.geometry(), glowMaterial(u)));
    for (const h of halos) if (h.pts.length) g.add(billboards(u, h.pts, 'halo', h.size));

    this.tick.push((_dt, t) => {
      for (const c of cranes) c(t);
      const a = t * 0.018;
      tug.position.set(70 + Math.cos(a) * 130, WATER_Y + 0.5 + Math.sin(t * 0.8) * 0.12, 190 + Math.sin(a) * 60);
      // (bow, its +x, along the way it's going)
      tug.rotation.y = -Math.atan2(Math.cos(a) * 60, -Math.sin(a) * 130);
      tug.rotation.z = Math.sin(t * 0.7) * 0.03;
    });
  }
}

/** A point at distance s along an outline. */
function alongOutline(o: ReturnType<typeof outline>, s: number) {
  const total = o[o.length - 1].s;
  s = ((s % total) + total) % total;
  for (let i = 0; i < o.length - 1; i++)
    if (o[i + 1].s >= s) {
      const f = (s - o[i].s) / Math.max(1e-6, o[i + 1].s - o[i].s);
      const nx = o[i].nx + (o[i + 1].nx - o[i].nx) * f, nz = o[i].nz + (o[i + 1].nz - o[i].nz) * f;
      return { x: o[i].x + (o[i + 1].x - o[i].x) * f, z: o[i].z + (o[i + 1].z - o[i].z) * f, nx, nz };
    }
  return { x: o[0].x, z: o[0].z, nx: o[0].nx, nz: o[0].nz };
}

// ------------------------------------------------------------------ containers
/** The yard's stacks: blocks of 40ft boxes, stacked one to five high in uneven heaps. */
function yardBoxes(boxes: Box[], casters: Caster[], r: () => number, blockRows: number) {
  const add = (x0: number, z0: number, bays: number, rows: number) => {
    for (let b = 0; b < bays; b++)
      for (let w = 0; w < rows; w++) {
        const x = x0 + b * BAY + C40 / 2, z = z0 - w * ROW - CW / 2;
        // stacks rise and fall in drifts across the yard
        const drift = 0.5 + 0.5 * Math.sin(x * 0.031 + z * 0.047) * Math.cos(x * 0.013 - z * 0.021);
        let n = Math.round(drift * 4.2 + r() * 1.6 - 0.4);
        if (r() < 0.08) n = 0;
        n = Math.max(0, Math.min(5, n));
        for (let k = 0; k < n; k++) boxes.push({ x, y: FLOOR + k * CH, z, len: C40 - 0.06, rot: (r() - 0.5) * 0.004, col: boxCol(r) });
        if (n) casters.push({ x, z, w: C40, d: CW, rot: 0, y0: FLOOR, y1: FLOOR + n * CH });
      }
  };
  for (let j = 0; j < blockRows; j++)
    for (const x0 of BLOCK_X) {
      // an empty block now and then: a parking lot for the trucks
      if ((j * 7 + x0) % 5 === 3) continue;
      add(x0, BLOCK_Z[j], 4, BLOCK_ROWS);
    }
  // beside the arena, east of it: two shorter blocks before the quay apron
  for (const x0 of [52, 118, 184, 250]) {
    add(x0, -24, 4, 6);
    add(x0, 8, 4, 3);
  }
  // and a few west of it, leaving the view of the sunset open
  add(-66, -24, 1, 4);
}

/** A wall of 20ft boxes three high round the back of the stands. */
function ringBoxes(boxes: Box[], casters: Caster[], r: () => number) {
  const o = outline(STANDS_D + 0.4 + CW / 2);
  const total = o[o.length - 1].s;
  const n = Math.floor(total / (C20 + 0.12));
  for (let i = 0; i < n; i++) {
    const p = alongOutline(o, ((i + 0.5) / n) * total);
    // (long side along the wall)
    const rot = Math.atan2(-p.nx, -p.nz);
    for (let k = 0; k < 3; k++) boxes.push({ x: p.x, y: FLOOR + k * CH, z: p.z, len: C20 - 0.05, rot, col: boxCol(r) });
    casters.push({ x: p.x, z: p.z, w: C20, d: CW, rot, y0: FLOOR, y1: FLOOR + 3 * CH });
  }
}

/** Boxes on the ship's deck, bay by bay, in tiers that step down towards the bow. */
function shipBoxes(boxes: Box[], r: () => number) {
  const rows = 11;
  const zc = (SHIP.z0 + SHIP.z1) / 2;
  for (let x = SHIP.x0 + 14; x + C40 < SHIP.x1 - 34; x += C40 + 1.1) {
    const fwd = (x - SHIP.x0) / (SHIP.x1 - SHIP.x0);
    const room = shipHalf(fwd) - 0.6;
    const tiers = Math.round(3 + fwd * 2 + r() * 2);
    for (let w = 0; w < rows; w++) {
      const z = zc + (w - (rows - 1) / 2) * (CW + 0.08);
      // only what fits the hull's breadth (narrower towards the bow), the outer rows lower
      if (Math.abs(z - zc) + CW / 2 > room) continue;
      const n = tiers - (w === 0 || w === rows - 1 ? 1 : 0) - (r() < 0.12 ? 1 : 0);
      for (let k = 0; k < n; k++) boxes.push({ x: x + C40 / 2, y: SHIP_DECK + 0.6 + k * CH, z, len: C40 - 0.06, rot: 0, col: boxCol(r) });
    }
  }
}

/**
 * Every container as one instanced draw: corrugated sides, ribbed roofs, doors with their locking
 * bars on one end, corner posts, a painted company band on some, rust streaks and grime.
 */
function containerMesh(u: VenueUniforms, boxes: Box[]) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = vMaterial(u, {
    vertexShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vN, vT, vW, vL, vS, vNl, vCol;
      varying float vSeed;
      void main() {
        vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vL = position * s;
        vS = s;
        vNl = normal;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / s));
        // along each face's ribs' run (x on the sides and roof, z on the ends)
        vT = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (abs(normal.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
        vCol = instanceColor;
        vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vN, vT, vW, vL, vS, vNl, vCol;
      varying float vSeed;
      void main() {
        vec3 n = normalize(vN);
        vec3 c = vCol;
        vec3 an = abs(vNl);
        // where on the face (metres from its centre) and how far from its edges
        vec2 f = an.z > 0.5 ? vL.xy : an.x > 0.5 ? vL.zy : vL.xz;
        vec2 half_ = an.z > 0.5 ? vS.xy : an.x > 0.5 ? vS.zy : vS.xz;
        half_ *= 0.5;
        vec2 e = half_ - abs(f);
        float edge = min(e.x, e.y);
        float px = max(fwidth(f.x), 1e-4);
        float fade = smoothstep(0.12, 0.03, px);
        float shade = 1.0;
        if (an.y < 0.5) {
          bool doors = an.x > 0.5 && vNl.x > 0.0;
          if (doors) {
            // two doors, four locking bars, the hinges' line
            float u = f.x / half_.x;
            float bar = 0.0;
            for (int i = 0; i < 4; i++) {
              float bx = (float(i) - 1.5) * 0.48;
              bar = max(bar, smoothstep(0.035, 0.0, abs(u - bx) * half_.x - 0.025));
            }
            shade *= 1.0 - 0.3 * bar * fade;
            shade *= 1.0 - 0.35 * smoothstep(0.02, 0.0, abs(f.x)) * fade;
            shade *= 0.92 + 0.08 * step(0.5, fract(f.y * 1.6));
          } else {
            // corrugation: trapezoid ribs, light catching one face of each
            float rib = sin(f.x * 6.2832 / 0.28);
            n = normalize(n + normalize(vT) * rib * 0.35 * fade);
            shade *= 1.0 - 0.08 * fade * step(0.0, rib);
          }
          // a company band on some
          if (vSeed > 0.55 && an.z > 0.5) {
            float band = step(abs(f.x), half_.x * 0.42) * step(abs(f.y - 0.25), 0.32);
            c = mix(c, vSeed > 0.8 ? vec3(0.85) : c * 0.35, band);
          }
          // rust streaks running down from the roof, grime at the foot
          float streak = texture2D(uNoise, vec2(vW.x * 0.9 + vW.z * 0.9, vW.y * 0.05 + vSeed)).r;
          c = mix(c, vec3(0.22, 0.1, 0.05), smoothstep(0.62, 0.9, streak) * 0.45 * smoothstep(-1.3, 1.0, f.y));
          shade *= mix(0.72, 1.0, smoothstep(-1.3, -0.7, f.y));
        } else {
          shade *= 0.9 + 0.1 * step(0.5, fract(f.x * 1.9));
          c = mix(c, vec3(0.25, 0.2, 0.17), 0.25);
        }
        // the frame: corner posts and rails, darker
        shade *= mix(0.62, 1.0, smoothstep(0.06, 0.14, edge));
        // lower in the stacks, less sky
        float ao = mix(0.55, 1.0, smoothstep(${FLOOR.toFixed(2)}, ${FLOOR.toFixed(2)} + 10.0, vW.y));
        vec3 L = ambient(n) * ao + uSunCol * max(dot(n, uSunDir), 0.0);
        c *= shade * L;
        c *= 0.92 + 0.16 * texture2D(uNoise, vW.xz * 0.21 + vW.y * 0.3).g;
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  boxes.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rot);
    mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y + CH / 2, b.z), q, s.set(b.len, CH - 0.02, CW)));
    mesh.setColorAt(i, b.col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ the quay
/** The quay's concrete edge: its wall down into the water, the kerb, fenders and bollards. */
function quayEdge(m: Mesher) {
  const t = new Tris();
  const top = lin(0x9a958c), wet = lin(0x2c3226);
  const wall = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, n: THREE.Vector3Tuple) =>
    t.quad([a[0], WATER_Y - 4, a[2]], [b[0], WATER_Y - 4, b[2]], [b[0], FLOOR, b[2]], [a[0], FLOOR, a[2]], n, wet, wet, top, top);
  wall([QUAY.x0, 0, QUAY.z1], [QUAY.x1, 0, QUAY.z1], [0, 0, 1]);
  wall([QUAY.x0, 0, QUAY.zMin], [QUAY.x0, 0, QUAY.z1], [-1, 0, 0]);
  // the kerb along the edge, fenders hanging off it, bollards behind
  block(m, QUAY.x1 - QUAY.x0, 0.22, 0.45, (QUAY.x0 + QUAY.x1) / 2, FLOOR + 0.11, QUAY.z1 - 0.23, 0xb8b2a6);
  block(m, 0.45, 0.22, QUAY.z1 - QUAY.zMin, QUAY.x0 + 0.23, FLOOR + 0.11, (QUAY.z1 + QUAY.zMin) / 2, 0xb8b2a6);
  for (let x = QUAY.x0 + 8; x < QUAY.x1; x += 13) {
    rod(m, [x, WATER_Y + 0.2, QUAY.z1 + 0.55], [x, FLOOR - 0.15, QUAY.z1 + 0.55], 0.55, 0.55, 0x1b1c1e, 10);
    if (Math.round((x - QUAY.x0) / 13) % 2 === 0) bollard(m, x + 4, QUAY.z1 - 1.3);
  }
  for (let z = QUAY.z1 - 10; z > QUAY.zMin; z -= 13) {
    rod(m, [QUAY.x0 - 0.55, WATER_Y + 0.2, z], [QUAY.x0 - 0.55, FLOOR - 0.15, z], 0.55, 0.55, 0x1b1c1e, 10);
    if (Math.round(z / 13) % 2 === 0) bollard(m, QUAY.x0 + 1.3, z + 4);
  }
  // mooring lines from the bollards to the ship, sagging
  for (const [bx, sx] of [
    [SHIP.x0 + 8, SHIP.x0 + 14],
    [SHIP.x0 + 22, SHIP.x0 + 20],
    [SHIP.x1 - 22, SHIP.x1 - 20],
    [SHIP.x1 - 6, SHIP.x1 - 12],
  ]) {
    const a: THREE.Vector3Tuple = [bx, FLOOR + 0.55, QUAY.z1 - 1.3], b: THREE.Vector3Tuple = [sx, SHIP_DECK - 0.5, SHIP.z0 + 0.5];
    const mid: THREE.Vector3Tuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.2, (a[2] + b[2]) / 2];
    rod(m, a, mid, 0.05, 0.05, 0xd8cfb0, 4);
    rod(m, mid, b, 0.05, 0.05, 0xd8cfb0, 4);
  }
  return t.geometry();
}

function bollard(m: Mesher, x: number, z: number) {
  m.at(new THREE.CylinderGeometry(0.28, 0.34, 0.55, 10), x, FLOOR + 0.27, z, 0x2a2b2d);
  m.at(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 10), x, FLOOR + 0.6, z, 0x2a2b2d);
}

/**
 * The quay's ground shadows at sunset, painted once: every stack, the stands, the crane legs and
 * the ship swept along the sun's long low rays. Covers the box SHADE; read by the quay shader.
 */
const SHADE = { x0: -130, z0: -340, size: 480 };
function shadowMap(casters: Caster[]) {
  const S = 1024;
  const px = (x: number) => ((x - SHADE.x0) / SHADE.size) * S;
  const pz = (z: number) => ((z - SHADE.z0) / SHADE.size) * S;
  const k = -1 / Math.max(0.15, SUN.y);
  const t = paintTexture(S, S, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, S, S);
    // the stands and their wall of boxes
    const o = outline(STANDS_D + 0.4 + CW);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let f = 0; f <= 1.0001; f += 0.06) {
      const h = (FLOOR + 3 * CH - FLOOR) * f;
      g.beginPath();
      o.forEach((p, i) => {
        const x = px(p.x + SUN.x * k * h), y = pz(p.z + SUN.z * k * h);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.fill();
    }
    // every caster: its footprint swept from its foot to its top
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const c of casters) {
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const corners = [
        [-c.w / 2, -c.d / 2],
        [c.w / 2, -c.d / 2],
        [c.w / 2, c.d / 2],
        [-c.w / 2, c.d / 2],
      ].map(([a, b]) => [c.x + a * cs + b * sn, c.z - a * sn + b * cs]);
      const h0 = c.y0 - FLOOR, h1 = c.y1 - FLOOR;
      const sh = (h: number) => corners.map(([x, z]) => [x + SUN.x * k * h, z + SUN.z * k * h]);
      const a = sh(h0), b = sh(h1);
      // the swept hull of the two rectangles
      const pts = convexHull([...a, ...b]);
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
      g.fill();
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function convexHull(p: number[][]) {
  const pts = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [], upper: number[][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * The quay's concrete: slabs and their joints, oil stains, painted lines (the edge, the lanes, the
 * yard's slots), the crane rails, puddles holding the sunset, and the long shadows.
 */
function quayMesh(v: OutdoorVenue, shade: THREE.Texture) {
  const w = QUAY.x1 - QUAY.x0, d = QUAY.z1 - QUAY.zMin;
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  geo.translate((QUAY.x0 + QUAY.x1) / 2, FLOOR - 0.02, (QUAY.z1 + QUAY.zMin) / 2);
  const mat = vMaterial(v.u, {
    uniforms: { uShade: { value: shade }, uShadeBox: { value: new THREE.Vector3(SHADE.x0, SHADE.z0, SHADE.size) } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform sampler2D uShade;
      uniform vec3 uShadeBox;
      varying vec3 vW;
      float line(float x, float c, float w, float px) { return smoothstep(w + px, w, abs(x - c)); }
      float grid(float x, float period, float w, float px) { float m = mod(x, period); return smoothstep(w + px, w, min(m, period - m)); }
      void main() {
        vec2 p = vW.xz;
        vec2 px2 = fwidth(p);
        float px = max(px2.x, px2.y);
        float detail = smoothstep(0.6, 0.12, px);
        float n1 = texture2D(uNoise, p * 0.013).g, n2 = texture2D(uNoise, p * 0.11).r, n3 = texture2D(uNoise, p * 0.031 + 0.37).b;
        vec3 c = mix(vec3(0.34, 0.33, 0.31), vec3(0.47, 0.45, 0.41), n1) * (0.9 + 0.2 * n2 * detail + 0.1 * (1.0 - detail));
        // slab joints every 6 m
        vec2 j = abs(fract(p / 6.0 + 0.5) - 0.5) * 6.0;
        c *= 1.0 - 0.35 * smoothstep(0.05 + px, 0.05, min(j.x, j.y)) * detail;
        // oil stains and tyre-worn lanes
        c *= 1.0 - 0.35 * smoothstep(0.7, 0.82, texture2D(uNoise, p * 0.045).a);
        c *= 1.0 - 0.12 * smoothstep(0.4, 0.9, n3) * step(p.y, -48.0);
        // paint: the edge's yellow line, dashed white lanes, the yard's slots
        vec3 yellow = vec3(0.82, 0.6, 0.08), white = vec3(0.75, 0.74, 0.7);
        float edgeL = line(p.y, ${(QUAY.z1 - 1.0).toFixed(1)}, 0.15, px) * step(${QUAY.x0.toFixed(1)} + 1.0, p.x) + line(p.x, ${(QUAY.x0 + 1.0).toFixed(1)}, 0.15, px) * step(p.y, ${(QUAY.z1 - 1.0).toFixed(1)});
        float dash = step(0.45, fract(p.x / 6.0));
        float lanes = (line(p.y, 24.5, 0.12, px) + line(p.y, -47.0, 0.12, px)) * dash;
        vec2 yq = vec2(mod(p.x + 66.0, 66.0), mod(-p.y - 56.0 + 380.0, 38.0));
        float inBlock = step(yq.x, ${(4 * BAY).toFixed(2)}) * step(yq.y, ${(BLOCK_ROWS * ROW).toFixed(2)}) * step(p.y, -50.0);
        float slots = max(grid(yq.x, ${BAY.toFixed(3)}, 0.08, px), grid(yq.y, ${ROW.toFixed(3)}, 0.06, px)) * inBlock;
        float worn = 0.55 + 0.45 * smoothstep(0.3, 0.7, n2);
        c = mix(c, yellow, edgeL * worn * 0.85);
        c = mix(c, white, (lanes * 0.8 + slots * 0.45) * worn * detail);
        // the cranes' rails: dark grooves with bright steel heads
        float rails = line(p.y, 30.0, 0.2, px) + line(p.y, 42.0, 0.2, px);
        float heads = line(p.y, 30.0, 0.05, px) + line(p.y, 42.0, 0.05, px);
        c = mix(c, vec3(0.12), clamp(rails, 0.0, 1.0) * 0.8);
        c = mix(c, vec3(0.62, 0.6, 0.58), clamp(heads, 0.0, 1.0) * detail);
        // light: low sun and its long shadows, the sky
        float sh = texture2D(uShade, (p - uShadeBox.xy) / uShadeBox.z).r;
        vec3 L = ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * uSunDir.y * sh;
        c *= L;
        // puddles: the sky and the sunset in them
        float wet = smoothstep(0.66, 0.72, texture2D(uNoise, p * 0.019 + 0.61).b) * (1.0 - edgeL);
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
        vec3 sky = mix(uHaze, uSky * 1.4, smoothstep(0.0, 0.5, R.y));
        sky += uSunCol * pow(max(dot(R, uSunDir), 0.0), 200.0) * 4.0 * sh;
        c = mix(c, c * 0.4 + sky * 0.55, wet * 0.85);
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// ------------------------------------------------------------------ cranes
/**
 * A ship-to-shore crane straddling the quay at x: legs on the rails, the boom out over the ship and
 * its backreach over the yard, an A-frame with its stays, the machinery house, and a trolley
 * running out along the boom lifting a box off the ship. Returns its animation.
 */
function stsCrane(v: OutdoorVenue, lit: THREE.Material, m: Mesher, glow: Mesher, beacons: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], x: number, i: number) {
  const white = 0xd9dde0, red = 0xb83a2c, dark = 0x2b2f33;
  const ZL = 30, ZW = 42, TOP = 34, GY = 40, Z0 = 6, Z1 = 98;
  for (const sx of [-1, 1]) {
    const lx = x + sx * 8.5;
    for (const z of [ZL, ZW]) {
      rod(m, [lx, FLOOR + 1.6, z], [lx, TOP, z], 0.75, 0.6, white, 4);
      // the bogies on the rail
      block(m, 1.6, 1.4, 4.2, lx, FLOOR + 0.9, z, dark);
    }
    // the portal: sill beam, top beam, cross bracing
    block(m, 1.2, 1.4, ZW - ZL, lx, TOP, (ZL + ZW) / 2, white);
    block(m, 1.0, 1.0, ZW - ZL, lx, FLOOR + 9, (ZL + ZW) / 2, white);
    rod(m, [lx, FLOOR + 9, ZL], [lx, TOP - 1, ZW], 0.25, 0.25, white, 4);
    rod(m, [lx, FLOOR + 9, ZW], [lx, TOP - 1, ZL], 0.25, 0.25, white, 4);
    // the boom girders
    block(m, 1.3, 2.6, Z1 - Z0, x + sx * 4.6, GY, (Z0 + Z1) / 2, white);
    // the A-frame up to its apex, and the stays
    rod(m, [lx, TOP, ZL], [x + sx * 4.6, 60, (ZL + ZW) / 2 - 2], 0.5, 0.4, red, 4);
    rod(m, [lx, TOP, ZW], [x + sx * 4.6, 60, (ZL + ZW) / 2 - 2], 0.5, 0.4, red, 4);
    rod(m, [x + sx * 4.6, 60, 34], [x + sx * 4.6, GY + 1.3, Z1 - 2], 0.12, 0.12, dark, 4);
    rod(m, [x + sx * 4.6, 60, 34], [x + sx * 4.6, GY + 1.3, 72], 0.12, 0.12, dark, 4);
    rod(m, [x + sx * 4.6, 60, 34], [x + sx * 4.6, GY + 1.3, Z0 + 1], 0.12, 0.12, dark, 4);
  }
  for (const z of [ZL, ZW]) block(m, 18.2, 1.4, 1.2, x, TOP, z, white);
  block(m, 10.5, 1.2, 2, x, 60, 32, red);
  for (let z = Z0 + 4; z < Z1; z += 9) block(m, 9.2, 0.5, 0.5, x, GY - 1.0, z, white);
  // the machinery house on the backreach, the tip of the boom in red
  block(m, 11, 5, 12, x, GY + 3.8, Z0 + 7, white);
  block(m, 11.2, 0.6, 12.2, x, GY + 1.5, Z0 + 7, 0x1f4f8a);
  block(m, 10.4, 2.8, 4, x, GY, Z1 - 1, red);
  glow.at(new THREE.BoxGeometry(11.05, 0.7, 6), x, GY + 4.4, Z0 + 7, new THREE.Color(1, 0.75, 0.45).multiplyScalar(0.35));
  // lights: the apex and the boom tip
  beacons.push({ x, y: 61.5, z: 32, s: 1.2, c: new THREE.Color(1, 0.12, 0.08) });
  beacons.push({ x, y: GY + 2, z: Z1 + 0.5, s: 1, c: new THREE.Color(1, 0.12, 0.08) });

  // the trolley, its cab and the spreader with a box
  const trolley = new Mesher();
  block(trolley, 9.4, 2.2, 5, 0, 0, 0, white);
  block(trolley, 3, 2.4, 3, 2.2, -2.6, 0, 0xc9cdd0);
  block(trolley, 3.05, 1.1, 2.6, 2.2, -2.4, 0, 0x22303a);
  const tr = new THREE.Mesh(trolley.geometry(), lit);
  v.group.add(tr);
  const hoist = new Mesher();
  for (const ox of [-2.5, 2.5]) for (const oz of [-0.6, 0.6]) block(hoist, 0.05, 1, 0.05, ox, 0.5, oz, dark);
  const ropes = new THREE.Mesh(hoist.geometry(), lit);
  const load = new Mesher();
  block(load, 12.4, 0.5, 2.5, 0, 0, 0, 0xe0b030);
  block(load, 12.19, CH, CW, 0, -0.25 - CH / 2, 0, BOX_COLS[(i * 5 + 2) % BOX_COLS.length]);
  const box = new THREE.Mesh(load.geometry(), lit);
  v.group.add(ropes, box);
  const ph = i * 23.7;
  return (t: number) => {
    // out over the ship, down, up with a box, back over the quay, down onto a truck, up: a cycle
    const c = ((t + ph) % 60) / 60;
    const ease = (a: number) => a * a * (3 - 2 * a);
    const seg = (a: number, b: number) => ease(Math.min(1, Math.max(0, (c - a) / (b - a))));
    const z = 36 + (64 - 36) * (seg(0, 0.2) - seg(0.5, 0.7));
    // (just down onto the ship's stacks; all the way down to a truck on the quay)
    const drop = 6 * (seg(0.22, 0.32) - seg(0.36, 0.46)) + 30 * (seg(0.72, 0.82) - seg(0.86, 0.96));
    const hy = GY - 4 - drop;
    tr.position.set(x, GY + 2.4, z);
    box.position.set(x, hy, z);
    ropes.position.set(x, hy + 0.25, z);
    ropes.scale.set(1, GY + 1.3 - hy - 0.25, 1);
  };
}

/** Rubber-tyred gantries astride a few of the yard's blocks. */
function rtgCranes(m: Mesher, glow: Mesher, beacons: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  const yellow = 0xe8b020, dark = 0x222426;
  for (const [x0, z0, b] of [
    [0, BLOCK_Z[0], 2],
    [132, BLOCK_Z[1], 1],
    [66, BLOCK_Z[2], 3],
  ]) {
    const x = x0 + b * BAY;
    const zA = z0 + 3, zB = z0 - BLOCK_ROWS * ROW - 7;
    const H = 18;
    for (const z of [zA, zB]) {
      for (const sx of [-1, 1]) {
        rod(m, [x + sx * 3.5, FLOOR + 1.2, z], [x + sx * 3.1, H, z], 0.45, 0.4, yellow, 4);
        m.at(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 10).rotateX(Math.PI / 2), x + sx * 3.5, FLOOR + 0.7, z, dark);
      }
      block(m, 8.5, 1.1, 1.2, x, FLOOR + 1.6, z, yellow);
    }
    for (const sx of [-1, 1]) block(m, 1.3, 1.8, zA - zB + 2, x + sx * 3.1, H, (zA + zB) / 2, yellow);
    // the trolley and cab, the electrical house
    block(m, 6.2, 2, 4, x, H + 1.5, z0 - 8, 0xd8dcdf);
    block(m, 2.2, 2.2, 2.2, x - 2, H - 1.2, z0 - 8, 0x22303a);
    block(m, 6.4, 2.6, 3.4, x, H + 2.2, zA, 0xd8dcdf);
    glow.at(new THREE.BoxGeometry(2.25, 0.6, 2.25), x - 2, H - 1.0, z0 - 8, new THREE.Color(1, 0.75, 0.45).multiplyScalar(0.4));
    beacons.push({ x, y: H + 4, z: zA, s: 0.9, c: new THREE.Color(1, 0.55, 0.1) });
  }
}

// ------------------------------------------------------------------ the ship
/**
 * A container ship tied up along the quay: a dark hull with a red boot-top at the waterline and
 * her line's name along it, raked bow, bridge and accommodation block aft with lit windows, the
 * funnel, deck lights. (Her boxes are added with the yard's.)
 */
function buildShip(v: OutdoorVenue, lit: THREE.Material, m: Mesher, glow: Mesher, lights: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  const t = new Tris();
  const L = SHIP.x1 - SHIP.x0, B = SHIP.z1 - SHIP.z0, zc = (SHIP.z0 + SHIP.z1) / 2;
  const N = 40;
  // half-breadth at the deck and at the waterline, from the bow (u 0) to the stern (u 1)
  const hd = shipHalf;
  const hw = (u: number) => (B / 2) * Math.pow(Math.min(1, u / 0.26), 0.7) * (u > 0.95 ? 1 - (u - 0.95) * 4 : 1);
  const hull = lin(0x1b2430), boot = lin(0x8e2b22), deck = lin(0x3a4042);
  const yT = SHIP_DECK, yW = WATER_Y + 1.1, yK = WATER_Y - 3;
  const X = (u: number, y: number) => SHIP.x0 + u * L + (1 - Math.min(1, u / 0.12)) * (yT - y) * 0.35;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    for (const s of [-1, 1]) {
      const P = (u: number, y: number, h: number): THREE.Vector3Tuple => [X(u, y), y, zc + s * h];
      const nz: THREE.Vector3Tuple = [i < N * 0.2 ? -0.5 : 0, 0, s];
      t.quad(P(u0, yW, hw(u0)), P(u1, yW, hw(u1)), P(u1, yT, hd(u1)), P(u0, yT, hd(u0)), nz, hull, hull, hull, hull);
      t.quad(P(u0, yK, hw(u0) * 0.9), P(u1, yK, hw(u1) * 0.9), P(u1, yW, hw(u1)), P(u0, yW, hw(u0)), nz, boot);
      t.quad(P(u0, yT, 0), P(u1, yT, 0), P(u1, yT, hd(u1)), P(u0, yT, hd(u0)), [0, 1, 0], deck);
      // a white sheer line along the top
      t.quad(P(u0, yT - 0.5, hd(u0) + 0.02), P(u1, yT - 0.5, hd(u1) + 0.02), P(u1, yT, hd(u1) + 0.02), P(u0, yT, hd(u0) + 0.02), nz, lin(0xd8d6d0));
    }
  }
  // the transom
  const hs = hd(1);
  t.quad([X(1, yK), yK, zc - hw(1)], [X(1, yK), yK, zc + hw(1)], [X(1, yT), yT, zc + hs], [X(1, yT), yT, zc - hs], [1, 0, 0], hull);
  v.group.add(new THREE.Mesh(t.geometry(), lit));
  // her name along the side facing the quay
  const name = new THREE.Mesh(new THREE.PlaneGeometry(64, 5.2), decalMaterial(v.u, nameTexture('KAIROS LINES'), new THREE.Vector3(0, 0, -1)));
  name.position.set(SHIP.x0 + L * 0.45, yT - 4.2, SHIP.z0 - 0.06);
  name.rotation.y = Math.PI;
  v.group.add(name);

  // the bridge and accommodation aft, the funnel
  const ax = SHIP.x1 - 26;
  const white = 0xe6e3dc;
  block(m, 12, 24, B - 6, ax, yT + 12, zc, white);
  block(m, 7, 3.2, B + 3, ax - 2, yT + 25.6, zc, white);
  block(m, 7.2, 0.4, B + 3.4, ax - 2, yT + 27.4, zc, 0x9a3a2a);
  for (let k = 0; k < 8; k++) {
    const y = yT + 2.2 + k * 2.8;
    // window rows, some lit, on the forward face and the side facing the quay
    glow.at(new THREE.BoxGeometry(0.06, 0.9, B - 8), ax - 6.02, y, zc, new THREE.Color(1, 0.8, 0.5).multiplyScalar(0.18 + ((k * 37) % 5) * 0.06));
    glow.at(new THREE.BoxGeometry(10, 0.9, 0.06), ax, y, zc - (B - 6) / 2 - 0.02, new THREE.Color(1, 0.8, 0.5).multiplyScalar(0.15 + ((k * 53) % 4) * 0.07));
  }
  glow.at(new THREE.BoxGeometry(0.06, 1.2, B + 2), ax - 5.52, yT + 25.8, zc, new THREE.Color(0.6, 0.85, 1).multiplyScalar(0.3));
  block(m, 7, 16, 9, ax + 11, yT + 8, zc, white);
  block(m, 7.1, 3, 9.1, ax + 11, yT + 13, zc, 0x2a8c8c);
  block(m, 7.2, 1.2, 9.2, ax + 11, yT + 16.4, zc, 0x111214);
  rod(m, [ax - 2, yT + 27.6, zc], [ax - 2, yT + 36, zc], 0.2, 0.12, 0xd8d6d0, 5);
  block(m, 0.2, 0.2, 6, ax - 2, yT + 33, zc, 0xd8d6d0);
  lights.push({ x: ax - 2, y: yT + 36.4, z: zc, s: 0.5, c: new THREE.Color(1, 0.95, 0.85) });
  // the foremast, deck floodlights along the side
  rod(m, [SHIP.x0 + 6, yT, zc], [SHIP.x0 + 6, yT + 14, zc], 0.25, 0.15, 0xd8d6d0, 5);
  lights.push({ x: SHIP.x0 + 6, y: yT + 14.4, z: zc, s: 0.5, c: new THREE.Color(1, 0.95, 0.85) });
  for (let x = SHIP.x0 + 20; x < ax - 10; x += 26) lights.push({ x, y: yT + 1.4, z: SHIP.z0 + 0.6, s: 0.6, c: new THREE.Color(1, 0.86, 0.6) });
  // a gangway down to the quay
  rod(m, [ax - 14, yT, SHIP.z0], [ax - 22, FLOOR + 0.2, QUAY.z1 - 2], 0.4, 0.4, 0x8a9096, 4);
}

/** A tug pottering about the harbour. */
function tugBoat(v: OutdoorVenue, lit: THREE.Material) {
  const grp = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(22, 8, 2.2), litMaterial(v.u));
  const p = hull.geometry.attributes.position, col = hull.geometry.attributes.color;
  const red = lin(0xb83a2c), black = lin(0x1a1c1e);
  for (let i = 0; i < p.count; i++) {
    const k = p.getY(i) < -0.6 ? red : black;
    col.setXYZ(i, k.r, k.g, k.b);
  }
  grp.add(hull);
  const m = new Mesher();
  block(m, 7, 2.6, 5.4, -1, 1.3, 0, 0xe6e3dc);
  block(m, 4.4, 2.2, 4.6, 0, 3.7, 0, 0xe6e3dc);
  block(m, 4.5, 0.8, 4.65, 0, 4.0, 0, 0x22303a);
  block(m, 1.6, 3, 1.6, -4, 3.5, 0, 0x2a8c8c);
  rod(m, [0, 4.8, 0], [0, 8.5, 0], 0.08, 0.06, 0xd8d6d0, 5);
  // tyres hung round the bow
  for (let k = 0; k < 6; k++) m.at(new THREE.TorusGeometry(0.45, 0.2, 5, 10), -6 + k * 2.4, -0.2, 4.05, 0x111111);
  grp.add(new THREE.Mesh(m.geometry(), lit));
  return grp;
}

/** A lighthouse on a rock out where the sun goes down. */
function lighthouse(m: Mesher, glow: Mesher, beacons: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], r: () => number) {
  const x = -300, z = 205;
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2, d = r() * 14;
    m.at(new THREE.DodecahedronGeometry(3 + r() * 4, 0), x + Math.cos(a) * d, WATER_Y + 0.5, z + Math.sin(a) * d, lin(0x3a3632).multiplyScalar(0.8 + r() * 0.4), r() * 6);
  }
  for (let k = 0; k < 5; k++) {
    const y0 = WATER_Y + 3 + k * 4.4;
    m.at(new THREE.CylinderGeometry(3.4 - (k + 1) * 0.3, 3.4 - k * 0.3, 4.4, 14), x, y0 + 2.2, z, k % 2 ? 0xc0392b : 0xf0ede6);
  }
  const top = WATER_Y + 3 + 5 * 4.4;
  m.at(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 14), x, top + 0.2, z, 0x222426);
  glow.at(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 12), x, top + 1.5, z, new THREE.Color(1, 0.9, 0.6).multiplyScalar(1.4));
  m.at(new THREE.ConeGeometry(2.1, 1.8, 12), x, top + 3.5, z, 0xc0392b);
  beacons.push({ x, y: top + 1.6, z, s: 9, c: new THREE.Color(1, 0.85, 0.55) });
}

// ------------------------------------------------------------------ far away
/**
 * The city across the yard, north and west: towers with their windows coming on and neon down
 * their edges, and the four mega-towers of downtown catching the last of the sun (as the map has
 * them, seen from Pier 9, scaled down a little).
 */
function skyline(v: OutdoorVenue, r: () => number, low: boolean) {
  const m = new Mesher();
  const neon = new Mesher();
  const glows: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] = [];
  const NEON = [new THREE.Color(1, 0.25, 0.65), new THREE.Color(0.2, 0.9, 1), new THREE.Color(0.7, 0.4, 1), new THREE.Color(1, 0.6, 0.2)];
  const tone = () => lin([0x9fb0c2, 0xb8c0c8, 0x8a9cb0, 0xc6bdb2, 0x7d8ea4][Math.floor(r() * 5)]).multiplyScalar(0.8 + r() * 0.3);
  const n = low ? 90 : 160;
  for (let i = 0; i < n; i++) {
    const a = -2.95 + r() * 2.45;
    const d = 320 + r() * 260;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // (not on the yard or the water)
    if (z > -265 && x > QUAY.x0 - 40) continue;
    if (z > QUAY.z1 - 20) continue;
    const core = Math.exp(-Math.pow((a + 2.55) / 0.35, 2));
    const h = 16 + r() * 34 + core * (40 + r() * 90);
    const w = 10 + r() * 18, dd = w * (0.6 + r() * 0.7);
    const rot = r() * 0.6;
    m.at(new THREE.BoxGeometry(w, h, dd), x, FLOOR + h / 2, z, tone(), rot);
    if (r() < 0.35) {
      const c = NEON[Math.floor(r() * NEON.length)].clone().multiplyScalar(1.2);
      const ex = Math.cos(rot) * w * 0.5, ez = -Math.sin(rot) * w * 0.5;
      neon.at(new THREE.BoxGeometry(0.8, h * 0.8, 0.8), x + ex, FLOOR + h * 0.5, z + ez, c, rot);
    }
    if (h > 70) glows.push({ x, y: FLOOR + h + 2, z, s: 0.8, c: new THREE.Color(1, 0.2, 0.15) });
  }
  // the mega-towers: the map's downtown moved to Pier 9's frame, heights x0.55
  const O = { x: 318, z: 100 }, K = 0.55;
  const at = (mx: number, mz: number) => [mx - O.x, mz - O.z];
  {
    // the Spire: a twisting glass taper and its needle
    const [x, z] = at(-46, -118);
    const H = 604 * K;
    for (let k = 0; k < 10; k++) {
      const r0 = 22 - k * 1.7, r1 = 22 - (k + 1) * 1.7;
      m.add(new THREE.CylinderGeometry(r1, r0, H / 10, 6), new THREE.Matrix4().makeRotationY(k * 0.12).setPosition(x, FLOOR + (k + 0.5) * (H / 10), z), lin(0x93a9bf));
    }
    m.at(new THREE.CylinderGeometry(0.6, 3, 60, 6), x, FLOOR + H + 30, z, lin(0xc8d4e0));
    neon.at(new THREE.CylinderGeometry(5.6, 5.6, 2, 12), x, FLOOR + H, z, NEON[1].clone().multiplyScalar(1.4));
    glows.push({ x, y: FLOOR + H + 61, z, s: 1.4, c: new THREE.Color(1, 0.2, 0.15) });
  }
  {
    // the Arcology: stacked, turned blocks with gardens on the terraces
    const [x, z] = at(26, -190);
    const blocks: [number, number, number, number, number, number, number][] = [
      [48, 46, 0, 0, 0, 19, 104],
      [44, 38, 7, -6, 0.12, 108, 186],
      [38, 34, -6, 4, -0.06, 190, 266],
      [30, 28, 4, -4, 0.2, 270, 338],
      [22, 22, 0, 0, 0.1, 342, 398],
    ];
    for (const [w, d, dx, dz, rot, y0, y1] of blocks) {
      m.at(new THREE.BoxGeometry(w * 0.8, (y1 - y0) * K, d * 0.8), x + dx * 0.8, FLOOR + ((y0 + y1) / 2) * K, z + dz * 0.8, lin(0xb6b2a8), rot);
      m.at(new THREE.BoxGeometry(w * 0.82, 2, d * 0.82), x + dx * 0.8, FLOOR + y1 * K + 1, z + dz * 0.8, lin(0x5d7d4a), rot);
    }
    m.at(new THREE.BoxGeometry(48 * 0.8, 19 * K, 46 * 0.8), x, FLOOR + 9.5 * K, z, lin(0x9a968c));
  }
  {
    // the Needle: a slender shaft with halo decks
    const [x, z] = at(98, -118);
    const H = 532 * K;
    m.at(new THREE.CylinderGeometry(6, 11, H, 10), x, FLOOR + H / 2, z, lin(0xa8b4c0));
    for (const f of [0.55, 0.72, 0.86]) {
      m.at(new THREE.CylinderGeometry(17, 15, 4, 18), x, FLOOR + H * f, z, lin(0xc0c8d0));
      neon.at(new THREE.CylinderGeometry(17.2, 17.2, 0.9, 18), x, FLOOR + H * f + 0.6, z, NEON[0].clone().multiplyScalar(1.3));
    }
    m.at(new THREE.CylinderGeometry(0.4, 2.4, 40, 6), x, FLOOR + H + 20, z, lin(0xd0d8e0));
    glows.push({ x, y: FLOOR + H + 41, z, s: 1.4, c: new THREE.Color(1, 0.2, 0.15) });
  }
  {
    // the Monolith: a dark slab, turned, stepped at the top
    const [x, z] = at(-118, -118);
    const H = 430 * K;
    m.at(new THREE.BoxGeometry(56 * 0.8, H * 0.92, 24 * 0.8), x, FLOOR + (H * 0.92) / 2, z, lin(0x3c4048), 0.35);
    m.at(new THREE.BoxGeometry(56 * 0.55, H * 0.08, 24 * 0.8), x + 4, FLOOR + H * 0.96, z, lin(0x3c4048), 0.35);
    neon.at(new THREE.BoxGeometry(56 * 0.8 + 0.4, 1.2, 24 * 0.8 + 0.4), x, FLOOR + H * 0.92, z, NEON[2].clone().multiplyScalar(1.3), 0.35);
  }
  const mat = vMaterial(v.u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      flat varying vec3 vCol;
      varying vec3 vN, vW;
      void main() {
        vCol = color;
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      flat varying vec3 vCol;
      varying vec3 vN, vW;
      void main() {
        vec3 n = normalize(vN);
        vec3 c = vCol * vLight(n);
        // glass bands, the sunset in them, and windows coming on
        if (abs(n.y) < 0.5) {
          vec2 t = vec2(dot(vW.xz, vec2(-n.z, n.x)), vW.y);
          vec2 cell = floor(t / vec2(3.2, 3.8));
          float lit = step(0.7, hash12(cell + floor(vCol.r * 97.0)));
          float win = step(0.3, fract(t.y / 3.8)) * step(0.2, fract(t.x / 3.2));
          vec3 R = reflect(normalize(vW - cameraPosition), n);
          vec3 sky = mix(uHaze, uSky, smoothstep(0.0, 0.4, R.y)) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.6;
          c = mix(c, c * 0.4 + sky * 0.45, win * 0.7);
          c += vec3(1.0, 0.72, 0.4) * win * lit * 0.5;
        }
        gl_FragColor = vec4(mix(c, uHaze, hazeAt(vW) * 0.92), 1.0);
        ${V_OUT}
      }`,
  });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(m.geometry(), mat));
  grp.add(new THREE.Mesh(neon.geometry(), glowMaterial(v.u)));
  grp.add(billboards(v.u, glows, 'halo', 9));
  return grp;
}

/** Low hills behind the city, and the far shore across the harbour to the south. */
function hills(v: OutdoorVenue) {
  const t = new Tris();
  const R = 590;
  const N = 220;
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const h = (a: number) => {
    const north = Math.exp(-Math.pow(wrapA(a + 1.7) / 1.3, 2));
    const south = Math.exp(-Math.pow(wrapA(a - 1.25) / 0.45, 2));
    return north * (55 + 30 * Math.sin(a * 9 + 1) * Math.sin(a * 4) + 12 * Math.sin(a * 23)) + south * (22 + 10 * Math.sin(a * 17));
  };
  const col = lin(0x4d5a6a), top = lin(0x6f7a84);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const h0 = h(a0), h1 = h(a1);
    if (h0 < 0.5 && h1 < 0.5) continue;
    const p = (a: number, y: number): THREE.Vector3Tuple => [Math.cos(a) * R, y, Math.sin(a) * R];
    t.quad(p(a0, WATER_Y - 2), p(a1, WATER_Y - 2), p(a1, WATER_Y + h1), p(a0, WATER_Y + h0), [-Math.cos(a0), 0.4, -Math.sin(a0)], col, col, top, top);
  }
  return new THREE.Mesh(t.geometry(), litMaterial(v.u, { side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------ textures, signs
/** A textured, lit flat (lettering on a hull), alpha-tested, facing `n`. */
function decalMaterial(u: VenueUniforms, map: THREE.Texture, n: THREE.Vector3) {
  return vMaterial(u, {
    uniforms: { uMap: { value: map }, uN: { value: n } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform sampler2D uMap;
      uniform vec3 uN;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.5) discard;
        gl_FragColor = vec4(haze(t.rgb * vLight(uN), vW), 1.0);
        ${V_OUT}
      }`,
  });
}

function nameTexture(label: string) {
  return paintTexture(
    1024,
    96,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '900 78px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ecebe6';
      const tw = g.measureText(label).width;
      g.save();
      g.translate(w / 2, h / 2 + 4);
      g.scale(Math.min(1, (w - 20) / tw), 1);
      g.fillText(label, 0, 0);
      g.restore();
    },
    false,
  );
}

/** A stencilled steel plate over a corner's tunnel. */
function stencilTexture(label: string, team: number) {
  return paintTexture(
    512,
    88,
    (g, w, h) => {
      g.fillStyle = '#2a2d31';
      g.fillRect(0, 0, w, h);
      // hazard chevrons at both ends
      for (const x0 of [0, w - 54]) {
        g.save();
        g.beginPath();
        g.rect(x0, 0, 54, h);
        g.clip();
        for (let k = -4; k < 8; k++) {
          g.fillStyle = k % 2 ? '#141414' : '#f0b418';
          g.beginPath();
          g.moveTo(x0 + k * 18, h);
          g.lineTo(x0 + k * 18 + 18, h);
          g.lineTo(x0 + k * 18 + 18 + h, 0);
          g.lineTo(x0 + k * 18 + h, 0);
          g.fill();
        }
        g.restore();
      }
      g.font = '800 50px "Courier New", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#' + team.toString(16).padStart(6, '0');
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 12;
      g.fillText(label, w / 2, h / 2 + 3);
    },
    false,
  );
}

/** A neon sign: glowing tubes of lettering on the dark, additive. */
function neonSign(label: string, color: string, core: string) {
  const t = paintTexture(
    512,
    160,
    (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.font = '800 96px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tw = g.measureText(label).width;
      g.save();
      g.translate(w / 2, h / 2 + 6);
      g.scale(Math.min(1, (w - 40) / tw), 1);
      g.lineJoin = 'round';
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 28;
      g.lineWidth = 9;
      g.strokeText(label, 0, 0);
      g.shadowBlur = 8;
      g.lineWidth = 3;
      g.strokeStyle = core;
      g.strokeText(label, 0, 0);
      g.restore();
    },
    false,
  );
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  mat.color.setScalar(1.6);
  return new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), mat);
}

/** Diamond tread plate round the ring: painted steel, welded seams, scuffs and a little rust. */
function plateTexture() {
  return paintTexture(512, 512, (g, w, h) => {
    const r = prng(19);
    g.fillStyle = '#585c5e';
    g.fillRect(0, 0, w, h);
    // the raised lozenges, alternating direction
    const step = 16;
    for (let y = 0; y < h; y += step)
      for (let x = 0; x < w; x += step) {
        const flip = ((x + y) / step) % 2 === 0;
        g.save();
        g.translate(x + step / 2, y + step / 2);
        g.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
        g.fillStyle = '#7a7e80';
        g.fillRect(-5.5, -1.6, 11, 3.2);
        g.fillStyle = '#3e4143';
        g.fillRect(-5.5, 1.6, 11, 1.2);
        g.restore();
      }
    // the plates' welded seams
    g.fillStyle = '#2d2f31';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, 0, 3, h);
    g.fillStyle = '#6c6460';
    for (let x = 0; x < w; x += 5) g.fillRect(x, 3, 3, 2);
    // scuffs, oil and rust
    for (let k = 0; k < 500; k++) {
      g.fillStyle = r() < 0.5 ? `rgba(30,28,26,${0.05 + r() * 0.12})` : `rgba(140,140,138,${0.04 + r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 30, 1 + r() * 3);
    }
    for (let k = 0; k < 40; k++) {
      const x = r() * w, y = r() * h, s = 3 + r() * 14;
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, 'rgba(120,58,28,0.45)');
      grd.addColorStop(1, 'rgba(120,58,28,0)');
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });
}
