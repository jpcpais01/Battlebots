import * as THREE from 'three';
import { AX, FLOOR, ROWS, TUNNEL_OPEN_H, TUNNEL_OPEN_HW, aislesAt, outline } from '../bowl';
import { Mesher, Tris, billboards, lin, litMaterial, paintTexture, prng, vMaterial, V_GLSL, V_OUT, waterMaterial, type Daylight, type VenueUniforms } from './kit';
import { OutdoorVenue, STANDS_D, STANDS_TOP, sunLook } from './outdoor';
import { block, boulder, flag, hullGeometry, palm, parasol, rod, sail, torch } from './props';

/**
 * Coral Beach Ring: the Island Championship, on a little island out in the bay. Bleachers of
 * sun-bleached timber under striped shade sails, palms leaning over the sand, a jetty with the
 * ferry tied up, turquoise shallows breaking white on the beach, sailboats out on the water and
 * the city's towers far off across the sea, all in a warm late-afternoon sun.
 */

const SUN = new THREE.Vector3(-0.72, 0.47, 0.5).normalize();
const DAY: Daylight = { sun: SUN, sunCol: 0xffe2b8, sunK: 2.3, sky: 0x8fc4ff, skyK: 0.72, gnd: 0xc9a77a, gndK: 0.42, haze: 0xc4dcec, hazeK: 0.0021 };
/** The sea's surface. */
const WATER_Y = FLOOR - 0.9;

/** How far the beach reaches at angle a (the waterline), in metres from the ring. */
const shoreR = (a: number) => 60 + 4.5 * Math.sin(3 * a + 1) + 2.5 * Math.sin(7 * a + 2) + 1.2 * Math.sin(13 * a + 0.5);
const SHORE_GLSL = /* glsl */ `
  float shoreDist(vec2 p) {
    float a = atan(p.y, p.x);
    return length(p) - (60.0 + 4.5 * sin(3.0 * a + 1.0) + 2.5 * sin(7.0 * a + 2.0) + 1.2 * sin(13.0 * a + 0.5));
  }`;
/** Sand (and the sea bed) height at (x, z). */
function sandY(x: number, z: number) {
  const sd = Math.hypot(x, z) - shoreR(Math.atan2(z, x));
  if (sd > 0) return Math.max(WATER_Y - 9, WATER_Y + 0.1 - sd * 0.09);
  // a low berm along the top of the beach, then flat up to the stands
  return Math.min(FLOOR - 0.04, WATER_Y + 0.1 - sd * 0.06 + 0.25 * Math.exp(-((sd + 9) * (sd + 9)) / 30));
}

/** Where the jetty runs out to sea. */
const JETTY_A = -0.42;

export class IslandVenue extends OutdoorVenue {
  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }) {
    const r = prng(77);
    const wood = [0xcaa27a, 0xbf9670, 0xd3b088, 0xb88d63, 0xc49c74].map((h) => lin(h));
    super(quality, arena, {
      day: DAY,
      sky: { zenith: 0x3d84d6, horizon: 0xa6d0f0, glow: 0xffc890, glowSize: 0.5, cloud: 0.42, cloudLit: 0xfff3e2, cloudShade: 0x9db0c6 },
      look: sunLook(DAY, { fogDensity: 0.004, env: 0.9, hemi: [0x9cc8ff, 0xd8bb8a, 1.05], key: 3.6, keyCol: 0xffe6c4, rims: [0xffa060, 10, 0x60d8ff, 9] }),
      floor: { map: deckTexture(), metres: 2.4, roughness: 0.85 },
      stands: {
        tread: (ri, k) => wood[(ri * 7 + k * 3) % wood.length].clone().multiplyScalar(0.92 + 0.16 * ((k * 2654435761) % 97) / 97),
        riser: () => lin(0x6d5139),
        wall: lin(0xe3d6bb),
        aisle: lin(0xefe4cc),
        rail: lin(0xf4f1e8),
        parapet: 0.9,
      },
      crowd: { day: 1, light: 0xfff1e0, k: 0.9 },
      outer: FLOOR,
      hall: { base: 0.16, tint: 0xffd6a8 },
    });
    const g = this.group;
    const u = this.u;

    // ------------------------------------------------------------ the sea and the beach
    const shade = shadowMap();
    g.add(sandMesh(this, shade));
    const sea = new THREE.Mesh(
      new THREE.RingGeometry(36, 560, 160, 30).rotateX(-Math.PI / 2),
      waterMaterial(u, { deep: 0x0b5280, shallow: 0x3fd8cc, zenith: 0x3d84d6, shore: SHORE_GLSL, clear: 0.05 }),
    );
    sea.position.y = WATER_Y;
    g.add(sea);

    // ------------------------------------------------------------ palms, parasols, rocks
    const trunks = new Mesher();
    const leaves = new Tris();
    const cloth = new Tris();
    const poles = new Mesher();
    const rocks = new Mesher();
    const flames: { x: number; y: number; z: number; s?: number }[] = [];
    for (const p of palmSpots(r)) palm(trunks, leaves, p.x, sandY(p.x, p.z) - 0.1, p.z, p.h, p.lean, r);
    const stripes = [0xff7b5f, 0x2fc4c0, 0xffc94a, 0x5b8cff, 0xff5f9e].map((h) => lin(h));
    const white = lin(0xf6f1e6);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.25;
      if (Math.abs(wrapA(a - JETTY_A)) < 0.18 || Math.abs(Math.cos(a)) > 0.97) continue;
      const d = shoreR(a) - 11 - r() * 6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = sandY(x, z);
      parasol(poles, cloth, x, y, z, stripes[i % stripes.length], white, a + Math.PI, r);
      // a lounger and a towel in its shade
      const la = a + Math.PI / 2 + (r() - 0.5) * 0.6;
      const lx = x + Math.cos(a) * 1.3, lz = z + Math.sin(a) * 1.3;
      block(poles, 1.9, 0.08, 0.62, lx, y + 0.32, lz, 0xf0ebe0, -la);
      block(poles, 0.7, 0.06, 0.6, lx + Math.cos(la) * 0.75, y + 0.55, lz + Math.sin(la) * 0.75, 0xf0ebe0, -la);
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = shoreR(a) + (r() - 0.6) * 5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      boulder(rocks, x, sandY(x, z) + 0.1, z, 0.5 + r() * 1.4, lin(0x5d5650).multiplyScalar(0.8 + r() * 0.4), r);
    }

    // ------------------------------------------------------------ the stands: shade sails, flags, torches
    const back = outline(STANDS_D + 0.15);
    const total = back[back.length - 1].s;
    const at = (s: number) => {
      s = ((s % total) + total) % total;
      for (let i = 0; i < back.length - 1; i++)
        if (back[i + 1].s >= s) {
          const f = (s - back[i].s) / Math.max(1e-6, back[i + 1].s - back[i].s);
          return { x: back[i].x + (back[i + 1].x - back[i].x) * f, z: back[i].z + (back[i + 1].z - back[i].z) * f };
        }
      return { x: back[0].x, z: back[0].z };
    };
    const top = STANDS_TOP + 0.9;
    const N = 18;
    const posts: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < N; i++) {
      const p = at((i / N) * total + total * 0.013);
      // (kept low in front of the big screens)
      const low = Math.abs(p.x) < 6 && Math.abs(p.z) > 20;
      const y = top + (low ? 2.2 : i % 2 ? 4.6 : 7.4);
      rod(poles, [p.x, top - 0.2, p.z], [p.x, y, p.z], 0.09, 0.07, 0xf2eee4, 6);
      posts.push({ ...p, y });
      if (low) continue;
      if (i % 2 === 0) flag(cloth, [p.x, y + 0.02, p.z], Math.atan2(-SUN.z, -SUN.x) + 0.3, 1.2, 0.7, stripes[(i / 2) % stripes.length]);
      else flames.push({ ...torchAt(poles, p.x, top, p.z, 1.4), s: 0.9 });
    }
    // each sail: from two posts at the back down to a short pole in an aisle further forward
    const aisles = aislesAt(10, ROWS[10].d + 0.45);
    const sailCols = [white, stripes[0], white, stripes[1], white, stripes[2]];
    for (let i = 0; i < N; i++) {
      const a = posts[i], b = posts[(i + 1) % N];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let best = aisles[0], bd = Infinity;
      for (const q of aisles) {
        const d = Math.hypot(q.x - mx * 0.72, q.z - mz * 0.72);
        if (d < bd) [best, bd] = [q, d];
      }
      const fy = ROWS[10].y + 2.7;
      rod(poles, [best.x, ROWS[10].y, best.z], [best.x, fy, best.z], 0.06, 0.05, 0xf2eee4, 6);
      sail(cloth, [a.x, a.y - 0.15, a.z], [b.x, b.y - 0.15, b.z], [best.x, fy, best.z], sailCols[i % sailCols.length], 0.25);
    }
    // a thatched cabana on each stairwell block (the camera crews' shade)
    for (const v of this.vomTops) {
      for (const [ox, oz] of [
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ])
        rod(poles, [v.x + ox, v.y, v.z + oz], [v.x + ox, v.y + 2.3, v.z + oz], 0.06, 0.05, 0x8f7350, 5);
      thatch(trunks, v.x, v.y + 2.25, v.z, 1.9, 1.1);
    }

    // ------------------------------------------------------------ the corners' huts
    for (const sx of [-1, 1]) {
      const team = sx < 0 ? 0xff7a1f : 0x3fe0ff;
      const x = sx * (AX - 0.22);
      const H = FLOOR + TUNNEL_OPEN_H;
      // bamboo posts, a lintel with upturned ends, the sign
      for (const sz of [-1, 1]) {
        rod(trunks, [x, FLOOR, sz * (TUNNEL_OPEN_HW + 0.22)], [x, H + 1.0, sz * (TUNNEL_OPEN_HW + 0.22)], 0.13, 0.11, 0xa8875a, 8);
        flames.push({ ...torchAt(poles, x - sx * 0.25, FLOOR, sz * (TUNNEL_OPEN_HW + 0.95), 1.9), s: 1.1 });
      }
      rod(trunks, [x, H + 0.55, -TUNNEL_OPEN_HW - 0.8], [x, H + 0.55, TUNNEL_OPEN_HW + 0.8], 0.1, 0.1, 0x8b6a45, 8);
      rod(trunks, [x, H + 0.95, -TUNNEL_OPEN_HW - 1.0], [x, H + 1.05, 0], 0.09, 0.09, 0x8b6a45, 8);
      rod(trunks, [x, H + 1.05, 0], [x, H + 0.95, TUNNEL_OPEN_HW + 1.0], 0.09, 0.09, 0x8b6a45, 8);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.42),
        new THREE.MeshBasicMaterial({ map: signTexture(sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER', team), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.1) }),
      );
      sign.position.set(x - sx * 0.12, H + 0.22, 0);
      sign.rotation.y = -sx * (Math.PI / 2);
      g.add(sign);
      // the team's cloths hanging either side
      for (const sz of [-1, 1]) {
        const zc = sz * (TUNNEL_OPEN_HW + 0.55);
        sail(cloth, [x - sx * 0.05, H + 0.45, zc - 0.28], [x - sx * 0.05, H + 0.45, zc + 0.28], [x - sx * 0.12, FLOOR + 0.9, zc], lin(team).multiplyScalar(0.8), 0.08, 3);
      }
    }

    // ------------------------------------------------------------ the big screens, up on scaffolds
    for (const sz of [-1, 1]) {
      const z = sz * (STANDS_D + 10 + 4.2);
      const y = STANDS_TOP + 5.2;
      this.screen(0, y, z, sz > 0 ? Math.PI : 0, 9.6, 5.4);
      for (const ox of [-4.3, -1.4, 1.4, 4.3])
        for (const oz of [0.4, 1.6]) rod(poles, [ox, sandY(ox, z) - 0.2, z + sz * oz], [ox, y - 2.6, z + sz * oz], 0.07, 0.07, 0xb79a6e, 5);
      for (let k = 0; k < 3; k++) {
        const yy = 1 + k * 2.6;
        rod(poles, [-4.3, yy, z + sz * 0.4], [4.3, yy + 1.8, z + sz * 0.4], 0.04, 0.04, 0xb79a6e, 4);
        rod(poles, [4.3, yy, z + sz * 0.4], [-4.3, yy + 1.8, z + sz * 0.4], 0.04, 0.04, 0xb79a6e, 4);
      }
      thatch(trunks, 0, y + 3.1, z + sz * 0.6, 2.8, 1.1, 2.0);
    }

    // ------------------------------------------------------------ the jetty, the ferry and the lifeguard
    const j0 = shoreR(JETTY_A) - 9, j1 = j0 + 58;
    const jx = Math.cos(JETTY_A), jz = Math.sin(JETTY_A);
    const jsx = -jz, jsz = jx;
    for (let d = j0; d < j1; d += 0.5) {
      const x = jx * d, z = jz * d;
      block(trunks, 3.2, 0.07, 0.46, x, WATER_Y + 1.3, z, lin(0xb08a62).multiplyScalar(0.85 + r() * 0.3), -JETTY_A + Math.PI / 2);
    }
    for (let d = j0; d < j1 + 0.1; d += 3) {
      for (const s of [-1.5, 1.5]) {
        const x = jx * d + jsx * s, z = jz * d + jsz * s;
        rod(trunks, [x, WATER_Y - 3, z], [x, WATER_Y + 2.2, z], 0.12, 0.11, 0x5e4630, 6);
      }
      if (Math.round((d - j0) / 3) % 3 === 1) flames.push({ ...torchAt(poles, jx * d + jsx * 1.5, WATER_Y + 1.3, jz * d + jsz * 1.5, 1.5), s: 1 });
    }
    for (const s of [-1.5, 1.5]) rod(trunks, [jx * j0 + jsx * s, WATER_Y + 2.2, jz * j0 + jsz * s], [jx * j1 + jsx * s, WATER_Y + 2.2, jz * j1 + jsz * s], 0.05, 0.05, 0x8a6a48, 5);
    const boats = new THREE.Group();
    const hullMat = litMaterial(u, {});
    const moor = (len: number, beam: number, d: number, side: number, c: number) => {
      const b = new THREE.Mesh(hullGeometry(len, beam, 0.9), hullMat);
      const x = jx * d + jsx * side * (1.6 + beam / 2 + 0.3), z = jz * d + jsz * side * (1.6 + beam / 2 + 0.3);
      b.position.set(x, WATER_Y + 0.45, z);
      b.rotation.y = -JETTY_A;
      colourHull(b.geometry, c);
      boats.add(b);
      return b;
    };
    const ferry = moor(14, 4.4, j1 - 9, 1, 0x2f6fb0);
    const cabin = new Mesher();
    block(cabin, 6, 2.1, 3.4, -1.5, 1.05, 0, 0xf4f1ea);
    block(cabin, 6.4, 0.18, 3.8, -1.5, 2.2, 0, 0x2f6fb0);
    block(cabin, 5.6, 0.7, 3.42, -1.5, 1.35, 0, 0x1a2a3a);
    ferry.add(new THREE.Mesh(cabin.geometry(), this.lit));
    moor(6, 2.2, j0 + 30, -1, 0xd8502e);
    moor(5, 2, j0 + 40, 1, 0xf0c040);
    g.add(boats);
    // sailboats out on the bay, bobbing
    const fleet: { o: THREE.Object3D; ph: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55 + r() * 0.3;
      const d = 140 + r() * 190;
      const b = new THREE.Mesh(hullGeometry(7, 2.4, 0.8), hullMat);
      colourHull(b.geometry, 0xf4f1ea);
      const st = new Tris();
      sail(st, [0.2, 0.4, 0], [0.2, 9, 0], [-3.2, 0.6, 0], lin(i % 3 ? 0xf8f6ef : 0xff7b5f), 0.06, 4);
      sail(st, [0.5, 0.4, 0], [0.5, 7.5, 0], [3.0, 0.4, 0], lin(0xf8f6ef), 0.05, 3);
      b.add(new THREE.Mesh(st.geometry(), this.cloth()));
      const mast = new Mesher();
      rod(mast, [0.35, 0, 0], [0.35, 9.4, 0], 0.07, 0.05, 0xdedad0, 5);
      rod(mast, [0.35, 1.2, 0], [-3.3, 1.0, 0], 0.05, 0.05, 0xdedad0, 5);
      b.add(new THREE.Mesh(mast.geometry(), this.lit));
      b.position.set(Math.cos(a) * d, WATER_Y + 0.4, Math.sin(a) * d);
      b.rotation.y = r() * Math.PI * 2;
      boats.add(b);
      fleet.push({ o: b, ph: r() * 10 });
    }
    this.tick.push((_dt, t) => {
      for (const f of fleet) {
        f.o.position.y = WATER_Y + 0.4 + Math.sin(t * 0.9 + f.ph) * 0.12;
        f.o.rotation.z = Math.sin(t * 0.7 + f.ph) * 0.05;
        f.o.rotation.x = Math.sin(t * 0.6 + f.ph * 1.3) * 0.03;
      }
      ferry.position.y = WATER_Y + 0.45 + Math.sin(t * 0.8) * 0.06;
    });
    // the lifeguard's tower
    {
      const a = 2.35, d = shoreR(a) - 7;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = sandY(x, z);
      for (const [ox, oz] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ])
        rod(poles, [x + ox * 1.2, y - 0.2, z + oz * 1.2], [x + ox, y + 2.6, z + oz], 0.07, 0.07, 0xf4f1ea, 5);
      block(poles, 2.2, 0.12, 2.2, x, y + 2.6, z, 0xf4f1ea);
      block(poles, 1.8, 1.5, 1.8, x, y + 3.4, z, 0xe8462e);
      block(poles, 2.3, 0.12, 2.3, x, y + 4.2, z, 0xf4f1ea);
      flag(cloth, [x, y + 5.6, z], 0.4, 0.9, 0.55, lin(0xe8462e));
      rod(poles, [x, y + 4.2, z], [x, y + 5.65, z], 0.03, 0.03, 0xf4f1ea, 4);
    }

    // ------------------------------------------------------------ far away: the city over the water, the hills
    g.add(skyline(this, r));
    g.add(hills(this));

    // ------------------------------------------------------------ gulls
    g.add(gulls(this.u, this.tick, r));

    this.props(trunks);
    this.props(poles);
    this.props(rocks);
    g.add(new THREE.Mesh(leaves.geometry(), this.cloth(0.012)));
    g.add(new THREE.Mesh(cloth.geometry(), this.cloth()));
    g.add(billboards(u, flames, 'flame', 0.75));
  }

  private clothMats = new Map<number, THREE.ShaderMaterial>();
  /** Double-sided matte for leaves and fabric, light coming through, stirring in the breeze. */
  private cloth(sway = 0.006) {
    let m = this.clothMats.get(sway);
    if (!m) this.clothMats.set(sway, (m = litMaterial(this.u, { wrap: 0.55, sway, side: THREE.DoubleSide })));
    return m;
  }
}

const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A tiki torch on a bamboo pole, returning its flame. */
function torchAt(m: Mesher, x: number, y: number, z: number, h: number) {
  const [fx, fy, fz] = torch(m, x, y, z, h);
  return { x: fx, y: fy, z: fz };
}

/** A palm-thatch roof: a squat cone with a ragged fringe, apex at (x, y + h, z). */
function thatch(m: Mesher, x: number, y: number, z: number, r: number, h: number, sx = 1) {
  const g = new THREE.ConeGeometry(r, h, 12, 2, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -h / 2 + 0.01) p.setY(i, p.getY(i) - 0.08 * Math.sin(i * 7.1) - 0.05);
  g.scale(sx, 1, 1);
  g.computeVertexNormals();
  m.at(g, x, y + h / 2, z, 0xc8a465);
  m.at(new THREE.ConeGeometry(r * 1.02, 0.25, 12, 1, true).scale(sx, 1, 1), x, y - 0.02, z, 0xa88545);
  // its underside, seen from the seats below
  m.at(new THREE.CircleGeometry(r, 12).rotateX(Math.PI / 2).scale(sx, 1, 1), x, y - 0.1, z, 0x5e4a2c);
}

/** Paint the boat's hull a colour below its rubbing strake, white above. */
function colourHull(g: THREE.BufferGeometry, hex: number) {
  const c = lin(hex), w = lin(0xf4f1ea);
  const p = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = p.getY(i) < -0.28 ? c : w;
    col.setXYZ(i, k.r, k.g, k.b);
  }
}

/** Where the palms grow: round the beach behind the stands, leaning out towards the sea. */
function palmSpots(r: () => number) {
  const out: { x: number; z: number; h: number; lean: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.12;
    if (Math.abs(wrapA(a - JETTY_A)) < 0.1) continue;
    // keep clear of the big screens' line of sight over the north and south stands
    if (Math.abs(Math.cos(a)) < 0.12) continue;
    const d = 34 + r() * (shoreR(a) - 46);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    out.push({ x, z, h: 7 + r() * 5, lean: a + (r() - 0.5) * 0.9 });
  }
  return out;
}

/**
 * Where the sun's shadows fall on the sand, painted once: under the palms' crowns, the parasols,
 * and the stands' long shadow away from the sun. Covers +-100 m; read by the sand shader.
 */
function shadowMap() {
  const S = 512, HALF = 100;
  const px = (v: number) => ((v + HALF) / (2 * HALF)) * S;
  const t = paintTexture(S, S, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, S, S);
    // the stands: their outline swept along the shadow's direction
    const k = -1 / Math.max(0.2, SUN.y);
    const o = outline(STANDS_D + 0.3);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let f = 0; f <= 1.0001; f += 0.08) {
      const h = (STANDS_TOP + 1.9 - FLOOR) * f;
      g.beginPath();
      o.forEach((p, i) => {
        const x = px(p.x + SUN.x * k * h), y = px(p.z + SUN.z * k * h);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.fill();
    }
    // soft blobs under every palm crown and parasol (the same layout the venue builds)
    const r2 = prng(77);
    for (const p of palmSpots(r2)) {
      const h = p.h;
      const cx = p.x + Math.cos(p.lean) * h * 0.25 + SUN.x * k * h, cz = p.z + Math.sin(p.lean) * h * 0.25 + SUN.z * k * h;
      const grd = g.createRadialGradient(px(cx), px(cz), 0, px(cx), px(cz), (3.6 / (2 * HALF)) * S);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The island's sand: dry and rippled up top, darker and glistening where the sea wets it. */
function sandMesh(v: OutdoorVenue, shade: THREE.Texture) {
  const radii: number[] = [];
  for (let rr = 20; rr < 80; rr += rr < 50 ? 2 : 1.2) radii.push(rr);
  radii.push(84, 92, 104, 120);
  const A = 192;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const rr of radii)
    for (let j = 0; j < A; j++) {
      const a = (j / A) * Math.PI * 2;
      // the rings follow the shoreline, so the waterline is evenly sampled
      const R = rr < 40 ? rr : rr + (shoreR(a) - 60) * Math.min(1, (rr - 40) / 20);
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, sandY(x, z), z);
    }
  for (let i = 0; i < radii.length - 1; i++)
    for (let j = 0; j < A; j++) {
      const a = i * A + j, b = i * A + ((j + 1) % A), c = (i + 1) * A + j, d = (i + 1) * A + ((j + 1) % A);
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = vMaterial(v.u, {
    uniforms: { uShade: { value: shade }, uWaterY: { value: WATER_Y } },
    vertexShader: /* glsl */ `
      varying vec3 vW, vN;
      void main() {
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform sampler2D uShade;
      uniform float uWaterY;
      varying vec3 vW, vN;
      void main() {
        vec3 n = normalize(vN);
        vec2 p = vW.xz;
        float above = vW.y - uWaterY;
        float g1 = texture2D(uNoise, p * 0.06).g, g2 = texture2D(uNoise, p * 0.7).r, g3 = texture2D(uNoise, p * 0.018).a;
        vec3 dry = mix(vec3(0.74, 0.58, 0.37), vec3(0.86, 0.72, 0.5), g1);
        // wind ripples and the scuffs of feet
        dry *= 0.93 + 0.07 * sin(dot(p, vec2(0.9, 0.45)) * 6.0 + g1 * 9.0);
        dry *= 0.88 + 0.22 * g2;
        float wet = smoothstep(0.6, 0.15, above);
        vec3 c = mix(dry, vec3(0.36, 0.28, 0.18), wet);
        // beach grass and low scrub up on the dry sand
        float grass = smoothstep(0.56, 0.7, g3) * smoothstep(0.7, 1.0, above);
        c = mix(c, mix(vec3(0.16, 0.25, 0.07), vec3(0.34, 0.4, 0.13), g2), grass * 0.8);
        // shells and white pebbles
        c = mix(c, vec3(0.92, 0.88, 0.8), step(0.988, hash12(floor(p * 5.0))) * (1.0 - wet) * 0.7);
        float sh = texture2D(uShade, p / 200.0 + 0.5).r;
        vec3 L = ambient(n) + uSunCol * max(dot(n, uSunDir), 0.0) * sh;
        c = c * L + uSky * 0.18 * wet;
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** The city far off across the water to the north: towers with lit windows and a few spires. */
function skyline(v: OutdoorVenue, r: () => number) {
  const m = new Mesher();
  const glows: { x: number; y: number; z: number; c?: THREE.Color }[] = [];
  for (let i = 0; i < 110; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.15;
    const d = 470 + r() * 70;
    const core = Math.exp(-Math.pow((a + Math.PI / 2) / 0.28, 2));
    const h = 14 + r() * 30 + core * (30 + r() * 70);
    const w = 8 + r() * 16;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const tone = lin([0x9fb4c8, 0xb8c4cc, 0x8ea3b8, 0xc9c2b8][i % 4]).multiplyScalar(0.8 + r() * 0.3);
    m.at(new THREE.BoxGeometry(w, h, w * (0.7 + r() * 0.6)), x, WATER_Y + h / 2, z, tone, -a);
    if (h > 70) glows.push({ x, y: WATER_Y + h + 1.5, z, c: new THREE.Color(1, 0.2, 0.15) });
  }
  // a few slender spires on the downtown core
  for (const [a, h] of [
    [-1.62, 150],
    [-1.5, 128],
    [-1.71, 112],
  ]) {
    const d = 500;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.at(new THREE.CylinderGeometry(4, 9, h, 8), x, WATER_Y + h / 2, z, lin(0xc0ccd8));
    m.at(new THREE.CylinderGeometry(0.4, 2, 24, 6), x, WATER_Y + h + 12, z, lin(0xc0ccd8));
    glows.push({ x, y: WATER_Y + h + 25, z, c: new THREE.Color(1, 0.25, 0.2) });
  }
  const mat = vMaterial(v.u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol, vN, vW;
      void main() {
        vCol = color;
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vCol, vN, vW;
      void main() {
        vec3 n = normalize(vN);
        vec3 c = vCol * vLight(n);
        // glass bands and the first lit windows of the evening
        if (abs(n.y) < 0.5) {
          vec2 t = vec2(dot(vW.xz, vec2(-n.z, n.x)), vW.y);
          vec2 cell = floor(t / vec2(3.0, 3.6));
          float lit = step(0.8, hash12(cell + floor(vCol.r * 97.0)));
          float win = step(0.25, fract(t.y / 3.6)) * step(0.2, fract(t.x / 3.0));
          c = mix(c, c * 0.55 + uSky * 0.25, win * 0.6);
          c += vec3(1.0, 0.75, 0.4) * win * lit * 0.35;
        }
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(m.geometry(), mat));
  grp.add(billboards(v.u, glows, 'halo', 9));
  return grp;
}

/** The mainland's green hills behind the city, and a few islets out to sea. */
function hills(v: OutdoorVenue) {
  const t = new Tris();
  const R = 585;
  const N = 220;
  const h = (a: number) => {
    const k = Math.exp(-Math.pow(wrapA(a + Math.PI / 2) / 1.1, 2));
    const islets = Math.max(0, Math.sin(a * 5 + 1) * Math.sin(a * 2.3)) * 18;
    return k * (40 + 30 * Math.sin(a * 9 + 1) * Math.sin(a * 4) + 14 * Math.sin(a * 23)) + islets;
  };
  const col = lin(0x5d7d6a), top = lin(0x7f9a86);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const h0 = h(a0), h1 = h(a1);
    if (h0 < 0.5 && h1 < 0.5) continue;
    const p = (a: number, y: number): THREE.Vector3Tuple => [Math.cos(a) * R, y, Math.sin(a) * R];
    t.quad(p(a0, WATER_Y - 2), p(a1, WATER_Y - 2), p(a1, WATER_Y + h1), p(a0, WATER_Y + h0), [-Math.cos(a0), 0.4, -Math.sin(a0)], col, col, top, top);
  }
  return new THREE.Mesh(t.geometry(), litMaterial(v.u, { side: THREE.DoubleSide }));
}

/** A handful of gulls wheeling over the beach. */
function gulls(u: VenueUniforms, tick: ((dt: number, t: number) => void)[], r: () => number) {
  const geo = new THREE.BufferGeometry();
  // a shallow V of two wings
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.55, 0.12, -0.05, 0, 0, -0.12, 0, 0, 0.18, 0, 0, -0.12, 0.55, 0.12, -0.05], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(0.85), 3));
  const n = 9;
  const mesh = new THREE.InstancedMesh(geo, litMaterial(u, { wrap: 0.6, side: THREE.DoubleSide }), n);
  mesh.frustumCulled = false;
  const birds = Array.from({ length: n }, () => ({ c: new THREE.Vector2((r() - 0.5) * 70, (r() - 0.5) * 70), rad: 12 + r() * 25, h: 16 + r() * 16, w: (0.15 + r() * 0.12) * (r() < 0.5 ? -1 : 1), ph: r() * 10, s: 0.9 + r() * 0.5 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  tick.push((_dt, t) => {
    birds.forEach((b, i) => {
      const a = b.ph + t * b.w;
      p.set(b.c.x + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, b.c.y + Math.sin(a) * b.rad);
      e.set(0, -a - (b.w > 0 ? 0 : Math.PI), Math.sin(a) * 0.3);
      q.setFromEuler(e);
      const flap = 0.7 + 0.3 * Math.sin(t * 7 + b.ph * 5);
      s.set(b.s, b.s * flap * 1.6, b.s);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}

/** The deck round the ring: weathered teak planks running east-west, with their seams and grain. */
function deckTexture() {
  return paintTexture(512, 512, (g, w, h) => {
    const r = prng(5);
    const rows = 16;
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 160 + r() * 260;
        const l = 52 + r() * 14, s = 30 + r() * 12;
        g.fillStyle = `hsl(${28 + r() * 8}, ${s}%, ${l}%)`;
        g.fillRect(x, i * ph, len, ph);
        // grain
        g.globalAlpha = 0.14;
        for (let k = 0; k < 5; k++) {
          g.fillStyle = r() < 0.5 ? '#6b4a2c' : '#f0d6b0';
          g.fillRect(x, i * ph + r() * ph, len, 1 + r() * 1.5);
        }
        g.globalAlpha = 1;
        // the butt joint and its nails
        g.fillStyle = 'rgba(40,26,14,0.75)';
        g.fillRect(x, i * ph, 2, ph);
        g.fillStyle = 'rgba(60,50,40,0.6)';
        g.fillRect(x + 6, i * ph + ph * 0.25, 3, 3);
        g.fillRect(x + 6, i * ph + ph * 0.7, 3, 3);
        x += len;
      }
      g.fillStyle = 'rgba(35,22,12,0.85)';
      g.fillRect(0, i * ph, w, 2.5);
    }
    // sun-bleached patches and a dusting of sand
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(${230 + r() * 25},${205 + r() * 30},${160 + r() * 30},${0.08 + r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  });
}

/** A carved, painted plank over a corner's hut. */
function signTexture(label: string, team: number) {
  const t = paintTexture(
    512,
    96,
    (g, w, h) => {
      g.fillStyle = '#5a3f26';
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.25;
      for (let i = 0; i < 18; i++) {
        g.fillStyle = i % 2 ? '#3d2a18' : '#7a5838';
        g.fillRect(0, (i * h) / 18, w, 2);
      }
      g.globalAlpha = 1;
      g.strokeStyle = '#2e1f12';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.font = '800 54px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#' + team.toString(16).padStart(6, '0');
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 14;
      g.fillText(label, w / 2, h / 2 + 3);
    },
    false,
  );
  return t;
}
