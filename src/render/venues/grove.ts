import * as THREE from 'three';
import { AX, FLOOR, TUNNEL_OPEN_H, TUNNEL_OPEN_HW, outline } from '../bowl';
import { Mesher, Tris, billboards, glowMaterial, lin, litMaterial, paintTexture, prng, vMaterial, V_GLSL, V_OUT, waterMaterial, type Daylight, type VenueUniforms } from './kit';
import { OutdoorVenue, STANDS_D, STANDS_TOP, sunLook } from './outdoor';
import { block, rod } from './props';

/**
 * The Lantern Grove: the Lantern Grove Cup, in a clearing among giant cedars at dusk. Strings of
 * paper lanterns loop round the stands, a vermilion torii marks each corner's way in (east and west,
 * as in a sumo hall), white gravel is raked round the ring, a path of a hundred little gates winds
 * up into the forest, a shrine stands on its stone terrace up the approach, and there's a pond with
 * an arched bridge. Fireflies, mist in the trees, sky lanterns rising, petals on the air.
 */

const SUN = new THREE.Vector3(-0.9, 0.06, 0.3).normalize();
const DAY: Daylight = { sun: SUN, sunCol: 0xff9a70, sunK: 0.55, sky: 0x6b7fc0, skyK: 0.45, gnd: 0x3a4430, gndK: 0.24, haze: 0x5d6c96, hazeK: 0.0055 };
/** The lanterns' warm light over the ring stands in for the sun on the fighters. */
const KEY_DIR = new THREE.Vector3(-0.35, 1, 0.3);
const VERMILION = 0xd2452a;
const CLEAR = 36;

/** The ground: the clearing, the slopes rising into the forest all round, the pond's hollow. */
function groundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  const k = Math.max(0, r - CLEAR);
  let y = FLOOR - 0.04 + k * k * 0.0017 + k * 0.035;
  y += (Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.052) * 2.2 + Math.sin(x * 0.11 - z * 0.09) * 0.7) * Math.min(1, k / 25);
  const p = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  if (p < 1.6) y = Math.min(y, FLOOR - 0.04 - 1.8 * smooth(1.25, 0.6, p));
  return y;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const POND = { x: -60, z: 6, rx: 15, rz: 11 };
const POND_Y = FLOOR - 0.55;
const POND_GLSL = /* glsl */ `
  float shoreDist(vec2 p) {
    vec2 q = (p - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) / vec2(${POND.rx.toFixed(1)}, ${POND.rz.toFixed(1)});
    return (1.0 - length(q)) * ${POND.rz.toFixed(1)};
  }`;
/** The shrine on its terrace up the approach east of the ring. */
const SHRINE = { x: 82, z: 0, y: FLOOR + 5.2 };
/** The path of little gates winding up into the forest north-west. */
const GATES_PATH: [number, number][] = [
  [-33, -27],
  [-45, -42],
  [-52, -62],
  [-47, -84],
  [-58, -106],
  [-76, -122],
];

function pathDist(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < GATES_PATH.length - 1; i++) {
    const [ax, az] = GATES_PATH[i], [bx, bz] = GATES_PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export class GroveVenue extends OutdoorVenue {
  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }) {
    const r = prng(1202);
    const cedar = [0x5a3a26, 0x634130, 0x523422, 0x6b4733].map((h) => lin(h));
    super(quality, arena, {
      day: DAY,
      sky: { zenith: 0x1b2856, horizon: 0x9a86b4, glow: 0xff8a5a, glowSize: 0.55, cloud: 0.3, cloudLit: 0xd89a9a, cloudShade: 0x343a5c, stars: 0.55, moon: new THREE.Vector3(0.45, 0.42, -0.7), disc: 0 },
      look: sunLook({ ...DAY, sun: KEY_DIR }, { fogDensity: 0.009, env: 0.5, hemi: [0x6b7fc0, 0x3a3020, 0.75], key: 3.4, keyCol: 0xffc48a, rims: [0xff9a50, 10, 0x7f9aff, 9] }),
      floor: { map: flagstoneTexture(), metres: 4, roughness: 0.85 },
      stands: {
        tread: (ri, k) => cedar[(ri * 5 + k * 3) % cedar.length].clone().multiplyScalar(0.9 + 0.2 * (((k * 2654435761) >>> 0) % 97) / 97),
        riser: () => lin(0x2a1d14),
        wall: lin(0x6d6f5c),
        aisle: lin(0x9a8a70),
        rail: lin(VERMILION),
        parapet: 0.9,
      },
      crowd: { day: 0.35, light: 0xffc890, k: 0.8 },
      outer: FLOOR,
      hall: { base: 0.12, tint: 0xffc89a },
    });
    const g = this.group;
    const u = this.u;
    const low = quality === 'low';

    const wood = new Mesher();
    const stone = new Mesher();
    const glow = new Mesher();
    const leaves = new Mesher();
    const roofs = new Tris();
    const lanternHalos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] = [];
    const smallHalos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] = [];
    const lantern = (x: number, y: number, z: number, c: THREE.Color, s = 1) => {
      chochin(glow, wood, x, y, z, c, s);
      lanternHalos.push({ x, y, z, s, c: c.clone().multiplyScalar(0.8) });
    };
    const RED = new THREE.Color(1, 0.3, 0.12), PAPER = new THREE.Color(1, 0.82, 0.55), AMBER = new THREE.Color(1, 0.58, 0.2);

    // ------------------------------------------------------------ ground, pond
    g.add(groundMesh(this));
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), waterMaterial(u, { deep: 0x0d2a2a, shallow: 0x2f5a4a, zenith: 0x1b2856, shore: POND_GLSL, clear: 0.4, foam: 0, scale: 2 }));
    pond.scale.set(POND.rx + 2, 1, POND.rz + 2);
    pond.position.set(POND.x, POND_Y, POND.z);
    g.add(pond);
    pondDressing(wood, stone, leaves, glow, smallHalos, r);

    // ------------------------------------------------------------ lantern strings round the stands
    {
      const o = outline(STANDS_D + 0.4);
      const total = o[o.length - 1].s;
      const N = 18;
      const top = STANDS_TOP + 1.0;
      const posts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) {
        const p = alongOutline(o, ((i + 0.5) / N) * total);
        // (kept low in front of the big screens)
        const front = Math.abs(p.x) < 7;
        const y = top + (front ? 1.2 : i % 2 ? 4.4 : 6.2);
        rod(wood, [p.x, top - 0.3, p.z], [p.x, y + 0.3, p.z], 0.11, 0.09, 0x3a2416, 6);
        if (!front) block(wood, 0.9, 0.1, 0.1, p.x, y + 0.25, p.z, 0x3a2416, Math.atan2(p.nx, p.nz));
        posts.push(new THREE.Vector3(p.x, y, p.z));
      }
      const cols = [RED, PAPER, RED, AMBER];
      for (let i = 0; i < N; i++) {
        const a = posts[i], b = posts[(i + 1) % N];
        const M = 8;
        const sag = 1.1 + 0.3 * (i % 2);
        let prev: THREE.Vector3 | null = null;
        for (let k = 0; k <= M; k++) {
          const f = k / M;
          const p = a.clone().lerp(b, f);
          p.y -= Math.sin(f * Math.PI) * sag;
          if (prev) rod(wood, prev.toArray(), p.toArray(), 0.012, 0.012, 0x1a1210, 3);
          if (k > 0 && k < M) lantern(p.x, p.y - 0.42, p.z, cols[(i + k) % cols.length], 0.9);
          prev = p;
        }
      }
    }

    // ------------------------------------------------------------ the corners: torii, east and west
    for (const sx of [-1, 1]) {
      const team = sx < 0 ? 0xff7a1f : 0x3fe0ff;
      const x = sx * (AX - 0.25);
      const W = 2 * (TUNNEL_OPEN_HW + 0.27), H = TUNNEL_OPEN_H + 1.5;
      torii(wood, x, FLOOR, 0, Math.PI / 2, W, H, VERMILION);
      // the straw rope across, its paper streamers
      const ry = FLOOR + H * 0.62;
      let prev: THREE.Vector3Tuple | null = null;
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const p: THREE.Vector3Tuple = [x - sx * 0.05, ry + 0.25 - Math.sin(f * Math.PI) * 0.22, -W / 2 + f * W];
        if (prev) rod(wood, prev, p, 0.07, 0.07, 0xc8b070, 5);
        if (k === 2 || k === 4 || k === 6) shide(leaves, p[0] - sx * 0.04, p[1] - 0.06, p[2], Math.PI / 2);
        prev = p;
      }
      // the corner's lanterns in its colour, either side
      for (const sz of [-1, 1]) lantern(x - sx * 0.25, FLOOR + H * 0.72 - 0.6, sz * W * 0.6, lin(team).multiplyScalar(0.9), 1.4);
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.5),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(sx < 0 ? '西' : '東', team), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.05) }),
      );
      plaque.position.set(x - sx * 0.13, FLOOR + H * 0.81, 0);
      plaque.rotation.y = -sx * (Math.PI / 2);
      g.add(plaque);
    }

    // ------------------------------------------------------------ the big screens on timber frames with copper roofs
    for (const sz of [-1, 1]) {
      const z = sz * (STANDS_D + 14.2);
      const y = STANDS_TOP + 5.2;
      this.screen(0, y, z, sz > 0 ? Math.PI : 0, 9.6, 5.4, new THREE.Color(0x24170e));
      for (const ox of [-5.2, 5.2]) rod(wood, [ox, groundY(ox, z) - 0.3, z + sz * 0.3], [ox, y + 3.0, z + sz * 0.3], 0.2, 0.18, 0x3a2416, 8);
      block(wood, 11, 0.4, 0.5, 0, y - 2.95, z + sz * 0.3, 0x3a2416);
      curvedRoof(roofs, 0, y + 3.0, z + sz * 0.3, 12.2, 2.2, 1.0, 0.8, lin(0x4f7d6e), 0);
    }

    // ------------------------------------------------------------ pavilions on the stairwell blocks
    for (const v of this.vomTops) {
      for (const [ox, oz] of [
        [-0.95, -0.95],
        [0.95, -0.95],
        [-0.95, 0.95],
        [0.95, 0.95],
      ])
        rod(wood, [v.x + ox, v.y, v.z + oz], [v.x + ox, v.y + 2.2, v.z + oz], 0.07, 0.07, VERMILION, 6);
      curvedRoof(roofs, v.x, v.y + 2.2, v.z, 2.6, 2.6, 1.0, 0.55, lin(0x4f7d6e), 0);
      lantern(v.x, v.y + 1.75, v.z, PAPER, 0.8);
    }

    // ------------------------------------------------------------ stone lanterns round the gravel
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const x = Math.cos(a) * 33, z = Math.sin(a) * 30;
      if (Math.abs(z) < 6 || Math.abs(x) < 9) continue;
      toro(stone, glow, smallHalos, x, groundY(x, z), z, 1);
    }

    // ------------------------------------------------------------ the approach: torii, lanterns, steps, the shrine
    torii(wood, 46, groundY(46, 0), 0, Math.PI / 2, 9.5, 10.5, VERMILION);
    for (const sz of [-1, 1]) {
      for (const x of [30, 38, 54]) toro(stone, glow, smallHalos, x, groundY(x, sz * 4.2), sz * 4.2, 1.15);
      komainu(stone, 49, groundY(49, sz * 5.5), sz * 5.5, sz);
    }
    shrine(wood, stone, glow, roofs, lanternHalos, smallHalos);
    // the old sacred cedar beside it, roped
    sacredCedar(wood, leaves, 64, -26);

    // ------------------------------------------------------------ the path of a hundred gates
    gatePath(wood, glow, smallHalos);

    // ------------------------------------------------------------ the cedars
    cedars(wood, leaves, r, low ? 130 : 230);
    g.add(forestWall(this, r));
    g.add(hills(this));

    // ------------------------------------------------------------ fireflies, sky lanterns, mist, petals
    g.add(drifters(u, r, low));
    g.add(mist(u, 2.2, 0.55));
    g.add(mist(u, 9, 0.3));
    g.add(petals(u, r));

    // ------------------------------------------------------------ build it all
    this.props(wood);
    this.props(stone, litMaterial(u, { grain: 0.25 }));
    g.add(new THREE.Mesh(leaves.geometry(), litMaterial(u, { wrap: 0.35, sway: 0.0025, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(roofs.geometry(), litMaterial(u, { grain: 0.12, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(glow.geometry(), glowMaterial(u, { flicker: 0.25 })));
    g.add(billboards(u, lanternHalos, 'halo', 1.9));
    g.add(billboards(u, smallHalos, 'halo', 1.1));
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

// ------------------------------------------------------------------ pieces
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _M = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** A rectangular beam from a to b, w wide (level, across it) and h deep. */
function beam(m: Mesher, a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, w: number, h: number, col: THREE.Color | number) {
  _X.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _X.length();
  _X.divideScalar(len);
  _Z.crossVectors(_X, UP).normalize();
  _Y.crossVectors(_Z, _X);
  _M.makeBasis(_X, _Y, _Z).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.add(new THREE.BoxGeometry(len, h, w), _M, col);
}

/**
 * A torii: two posts leaning in a touch, the tie beam through them, and the top lintel sweeping up
 * at its ends, black-capped. Centred at (x, y, z), its span along its local x turned by rotY.
 */
function torii(m: Mesher, x: number, y: number, z: number, rotY: number, W: number, H: number, col: number) {
  const small = W < 3;
  const sides = small ? 6 : 10;
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const L = (lx: number, ly: number, lz = 0): THREE.Vector3Tuple => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const pr = Math.max(0.09, W * 0.042);
  for (const sx of [-1, 1]) {
    rod(m, L(sx * W * 0.5, 0), L(sx * W * 0.47, H * 0.9), pr, pr * 0.88, col, sides);
    rod(m, L(sx * W * 0.5, -0.05), L(sx * W * 0.5, Math.min(0.5, H * 0.07)), pr * 1.18, pr * 1.18, 0x1a1a1a, sides);
  }
  beam(m, L(-W * 0.62, H * 0.72), L(W * 0.62, H * 0.72), pr * 1.1, pr * 1.3, col);
  // the shimaki and the kasagi above it, curving up to the tips
  const N = small ? 2 : 6;
  for (let i = 0; i < N; i++) {
    const u0 = (i / N) * 2 - 1, u1 = ((i + 1) / N) * 2 - 1;
    const lift = (u: number) => u * u * H * 0.05;
    const span = W * 0.7;
    beam(m, L(u0 * span, H * 0.9 + lift(u0)), L(u1 * span, H * 0.9 + lift(u1)), pr * 1.5, pr * 0.9, col);
    beam(m, L(u0 * span * 1.04, H * 0.9 + pr * 1.0 + lift(u0) * 1.15), L(u1 * span * 1.04, H * 0.9 + pr * 1.0 + lift(u1) * 1.15), pr * 1.7, pr * 0.7, 0x161616);
  }
  // the strut between the beams
  const [sx, sy, sz] = L(0, H * 0.8);
  block(m, pr * 1.2, H * 0.16, pr * 1.4, sx, sy, sz, col, rotY);
}

/** Folded white paper streamers, zigzagging down from a rope. */
function shide(t: Mesher, x: number, y: number, z: number, rotY: number) {
  for (let k = 0; k < 3; k++) block(t, 0.12, 0.1, 0.01, x + (k % 2 ? 0.03 : -0.03) * Math.cos(rotY), y - k * 0.1, z - (k % 2 ? 0.03 : -0.03) * Math.sin(rotY), 0xf4f2ea, rotY);
}

/** A paper lantern (chōchin): a glowing ribbed barrel with black rims top and bottom. */
const CHOCHIN = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(0.17 + 0.07 * Math.sin(t * Math.PI), (t - 0.5) * 0.48));
  }
  return new THREE.LatheGeometry(pts, 10);
})();
const RIM = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10);
function chochin(glow: Mesher, m: Mesher, x: number, y: number, z: number, c: THREE.Color, s = 1) {
  glow.add(CHOCHIN, _M.makeScale(s, s, s).setPosition(x, y, z), c);
  m.add(RIM, _M.makeScale(s, s, s).setPosition(x, y + 0.26 * s, z), 0x1a1210);
  m.add(RIM, _M.makeScale(s, s, s).setPosition(x, y - 0.26 * s, z), 0x1a1210);
}

/** A stone lantern (tōrō): base, post, the lit fire box, a wide roof and its jewel. */
function toro(m: Mesher, glow: Mesher, halos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], x: number, y: number, z: number, s: number) {
  const col = lin(0x8a8778);
  m.at(new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.25 * s, 6), x, y + 0.12 * s, z, col.clone().multiplyScalar(0.85));
  m.at(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 1.0 * s, 8), x, y + 0.75 * s, z, col);
  m.at(new THREE.CylinderGeometry(0.42 * s, 0.32 * s, 0.18 * s, 6), x, y + 1.33 * s, z, col);
  m.at(new THREE.BoxGeometry(0.46 * s, 0.42 * s, 0.46 * s), x, y + 1.63 * s, z, col.clone().multiplyScalar(0.8));
  glow.at(new THREE.BoxGeometry(0.48 * s, 0.24 * s, 0.3 * s), x, y + 1.63 * s, z, new THREE.Color(1, 0.62, 0.28).multiplyScalar(0.9));
  glow.at(new THREE.BoxGeometry(0.3 * s, 0.24 * s, 0.48 * s), x, y + 1.63 * s, z, new THREE.Color(1, 0.62, 0.28).multiplyScalar(0.9));
  m.at(new THREE.ConeGeometry(0.62 * s, 0.42 * s, 6), x, y + 2.05 * s, z, col.clone().multiplyScalar(0.92));
  m.at(new THREE.SphereGeometry(0.12 * s, 6, 4), x, y + 2.33 * s, z, col);
  halos.push({ x, y: y + 1.63 * s, z, s: 1.2 * s, c: new THREE.Color(1, 0.6, 0.25) });
}

/** A stone guardian lion-dog on its plinth, facing across the approach. */
function komainu(m: Mesher, x: number, y: number, z: number, side: number) {
  const col = lin(0x8a8778);
  m.at(new THREE.BoxGeometry(1.2, 1.1, 1.2), x, y + 0.55, z, col.clone().multiplyScalar(0.8));
  m.at(new THREE.SphereGeometry(0.42, 8, 6), x, y + 1.45, z, col);
  m.at(new THREE.SphereGeometry(0.34, 8, 6), x, y + 2.0, z - side * 0.12, col);
  m.at(new THREE.SphereGeometry(0.2, 6, 4), x - 0.2, y + 1.95, z - side * 0.3, col.clone().multiplyScalar(0.9));
  m.at(new THREE.ConeGeometry(0.14, 0.4, 5), x + 0.3, y + 1.55, z + side * 0.3, col);
}

/**
 * A temple roof: hipped, its slopes sweeping concave from the ridge down to eaves that turn up at
 * the corners, with a dark underside and a fascia. Eaves at y, w x d plus `over` all round.
 */
function curvedRoof(t: Tris, x: number, y: number, z: number, w: number, d: number, h: number, over: number, col: THREE.Color, rotY: number) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const W = w / 2 + over, D = d / 2 + over, R = Math.max(0, (w - d) / 2);
  const P = (lx: number, ly: number, lz: number): THREE.Vector3Tuple => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const under = col.clone().multiplyScalar(0.3).lerp(lin(0x3a2416), 0.6), fascia = lin(0xd8c890);
  // each side: eave edge A..B, ridge edge RA..RB
  const sides: [number[], number[], number[], number[]][] = [
    [[-W, D], [W, D], [-R, 0], [R, 0]],
    [[W, -D], [-W, -D], [R, 0], [-R, 0]],
    [[W, D], [W, -D], [R, 0], [R, 0]],
    [[-W, -D], [-W, D], [-R, 0], [-R, 0]],
  ];
  const NS = 6, NV = 8;
  const at = (sd: (typeof sides)[number], v: number, si: number) => {
    const [A, B, RA, RB] = sd;
    const ex = A[0] + (B[0] - A[0]) * v, ez = A[1] + (B[1] - A[1]) * v;
    const rx = RA[0] + (RB[0] - RA[0]) * v, rz = RA[1] + (RB[1] - RA[1]) * v;
    const lx = ex + (rx - ex) * si, lz = ez + (rz - ez) * si;
    const corner = Math.pow(Math.abs(2 * v - 1), 6);
    const ly = h * Math.pow(si, 1.7) + 0.32 * Math.pow(1 - si, 2) * corner * (1 + over);
    return [lx, ly, lz];
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (const sd of sides)
    for (let i = 0; i < NS; i++)
      for (let j = 0; j < NV; j++) {
        const q = [at(sd, j / NV, i / NS), at(sd, (j + 1) / NV, i / NS), at(sd, (j + 1) / NV, (i + 1) / NS), at(sd, j / NV, (i + 1) / NS)];
        const p = q.map(([lx, ly, lz]) => P(lx, ly, lz));
        a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
        b.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
        n.crossVectors(b, a).normalize();
        if (n.y < 0) n.negate();
        const k = 0.88 + 0.12 * ((i + j) % 2);
        t.quad(p[0], p[1], p[2], p[3], n.toArray(), col.clone().multiplyScalar(k));
        // the underside, a little below
        const dn = (v: THREE.Vector3Tuple): THREE.Vector3Tuple => [v[0], v[1] - 0.18, v[2]];
        t.quad(dn(p[0]), dn(p[1]), dn(p[2]), dn(p[3]), [-n.x, -n.y, -n.z], under);
        if (i === 0) {
          // the fascia along the eave
          const out: THREE.Vector3Tuple = [n.x, 0, n.z];
          t.quad(dn(p[0]), dn(p[1]), p[1], p[0], out, fascia);
        }
      }
  // the ridge
  if (R > 0) {
    const r0 = P(-R - 0.2, h + 0.1, 0), r1 = P(R + 0.2, h + 0.1, 0);
    t.quad([r0[0], r0[1] - 0.15, r0[2]], [r1[0], r1[1] - 0.15, r1[2]], [r1[0], r1[1] + 0.2, r1[2]], [r0[0], r0[1] + 0.2, r0[2]], [s, 0, c], col.clone().multiplyScalar(0.6));
    t.quad([r0[0], r0[1] - 0.15, r0[2]], [r1[0], r1[1] - 0.15, r1[2]], [r1[0], r1[1] + 0.2, r1[2]], [r0[0], r0[1] + 0.2, r0[2]], [-s, 0, -c], col.clone().multiplyScalar(0.6));
  }
}

/** The shrine: its stone terrace and steps, the hall on its posts, lattice doors lit from within. */
function shrine(wood: Mesher, stone: Mesher, glow: Mesher, roofs: Tris, halos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], small: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  const { x, z, y } = SHRINE;
  const base = groundY(x, z) - 2;
  // the terrace, in big fitted stones, and the steps up to it
  stone.at(new THREE.BoxGeometry(30, y - base, 26), x + 8, (y + base) / 2, z, lin(0x77756a));
  const x0 = x - 7;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const sx = x0 - (steps - i) * 0.9;
    const top = y - ((steps - 1 - i) * (y - groundY(sx, 0))) / steps;
    stone.at(new THREE.BoxGeometry(0.95, Math.max(0.2, top - groundY(sx, 0) + 0.3), 7), sx + 0.45, (top + groundY(sx, 0) - 0.3) / 2, z, lin(0x8a877a));
  }
  for (const sz of [-1, 1]) toro(stone, glow, small, x0 + 1.2, y, z + sz * 4.5, 1.2);
  // the hall, raised on its posts, the deck round it
  const hy = y + 1.1;
  block(wood, 18, 0.35, 14, x + 6, hy, z, 0x4a2e1c);
  for (let i = 0; i < 5; i++)
    for (const sz of [-1, 1]) rod(wood, [x - 1 + i * 3.5, y, z + sz * 5.2], [x - 1 + i * 3.5, hy + 5.6, z + sz * 5.2], 0.28, 0.26, VERMILION, 8);
  for (const sz of [-1, 0, 1]) rod(wood, [x + 13, y, z + sz * 5.2], [x + 13, hy + 5.6, z + sz * 5.2], 0.28, 0.26, VERMILION, 8);
  // white walls on three sides, latticed doors at the front with the lamp-light behind them
  block(wood, 0.2, 5.4, 10.6, x + 13, hy + 2.9, z, 0xece6d8);
  for (const sz of [-1, 1]) block(wood, 14, 5.4, 0.2, x + 6, hy + 2.9, z + sz * 5.3, 0xece6d8);
  glow.at(new THREE.BoxGeometry(0.1, 3.6, 9.6), x - 0.7, hy + 2.2, z, new THREE.Color(1, 0.62, 0.28).multiplyScalar(0.5));
  for (let k = 0; k < 13; k++) block(wood, 0.12, 3.8, 0.07, x - 0.6, hy + 2.2, z - 4.8 + k * 0.8, 0x2a1810);
  for (let k = 0; k < 6; k++) block(wood, 0.12, 0.07, 9.8, x - 0.6, hy + 0.5 + k * 0.7, z, 0x2a1810);
  // beams round the top, the great roof
  block(wood, 15, 0.6, 11.2, x + 6, hy + 5.8, z, 0x5a3420);
  curvedRoof(roofs, x + 6, hy + 6.2, z, 15.5, 11.5, 4.6, 2.6, lin(0x4f7d6e), Math.PI / 2);
  // the big lantern hanging at the door, the offertory box, the bell rope
  const lan = new THREE.Color(1, 0.4, 0.15);
  chochin(glow, wood, x - 1.6, hy + 3.6, z, lan, 3.2);
  halos.push({ x: x - 1.6, y: hy + 3.6, z, s: 3.2, c: lan.clone().multiplyScalar(0.8) });
  block(wood, 1.4, 0.9, 2.6, x - 2.6, hy + 0.65, z, 0x3a2416);
  rod(wood, [x - 2.2, hy + 5.2, z + 1.8], [x - 2.2, hy + 1.2, z + 1.8], 0.06, 0.06, 0xd8c070, 5);
}

/** The giant old cedar by the shrine, girdled by a straw rope with its streamers. */
function sacredCedar(wood: Mesher, leaves: Mesher, x: number, z: number) {
  const y = groundY(x, z);
  rod(wood, [x, y - 1, z], [x, y + 62, z], 2.4, 0.6, 0x6b4733, 12);
  // buttress roots
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3;
    rod(wood, [x + Math.cos(a) * 1.8, y + 2.2, z + Math.sin(a) * 1.8], [x + Math.cos(a) * 4.2, y - 0.3, z + Math.sin(a) * 4.2], 0.7, 0.3, 0x5a3a26, 6);
  }
  wood.at(new THREE.TorusGeometry(2.25, 0.22, 6, 18).rotateX(Math.PI / 2), x, y + 3.2, z, 0xc8b070);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    shide(leaves, x + Math.cos(a) * 2.42, y + 3.0, z + Math.sin(a) * 2.42, -a + Math.PI / 2);
  }
  crown(leaves, x, y, z, 62, 1.0, prng(77));
}

/** A cedar's crown: tiers of dark tufts tapering to the tip, from about half way up. */
function crown(leaves: Mesher, x: number, y: number, z: number, h: number, s: number, r: () => number) {
  const tiers = 7;
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const rad = (5.2 * (1 - f * 0.82) + r() * 0.8) * s;
    const yy = y + h * (0.42 + f * 0.55);
    const c = lin([0x2c4a34, 0x34553a, 0x27432f, 0x3b5d40][Math.floor(r() * 4)]).multiplyScalar(0.85 + r() * 0.3);
    leaves.at(new THREE.ConeGeometry(rad, h * 0.17, 7), x + (r() - 0.5) * 0.8, yy, z + (r() - 0.5) * 0.8, c, r() * 6);
  }
}

/** The giant cedars round the clearing: tall straight red trunks and narrow tiered crowns. */
function cedars(wood: Mesher, leaves: Mesher, r: () => number, n: number) {
  const placed: { x: number; z: number; h: number }[] = [];
  let tries = 0;
  while (placed.length < n && tries++ < n * 30) {
    const a = r() * Math.PI * 2;
    const rr = CLEAR + 4 + Math.pow(r(), 0.8) * 170;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // keep clear: the approach and the shrine, the pond, the gate path, the screens' sight lines
    if (x > 24 && x < 104 && Math.abs(z) < 18) continue;
    if (Math.hypot((x - POND.x) / (POND.rx + 9), (z - POND.z) / (POND.rz + 9)) < 1) continue;
    if (pathDist(x, z) < 5) continue;
    if (Math.abs(x) < 12 && Math.abs(z) < 48) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 6.5)) continue;
    const h = 26 + r() * 20 + Math.min(1, (rr - CLEAR) / 80) * 8;
    placed.push({ x, z, h });
    const y = groundY(x, z);
    const tr = 0.55 + r() * 0.35;
    rod(wood, [x, y - 0.6, z], [x, y + h, z], tr, tr * 0.25, lin(0x6b4733).multiplyScalar(0.8 + r() * 0.3), 7);
    crown(leaves, x, y, z, h, 0.75 + r() * 0.3, r);
  }
  return placed;
}

/** The path of little gates, one after another, up into the forest, a lantern every so often. */
function gatePath(m: Mesher, glow: Mesher, halos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  let k = 0;
  for (let i = 0; i < GATES_PATH.length - 1; i++) {
    const [ax, az] = GATES_PATH[i], [bx, bz] = GATES_PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;
    for (let d = 0; d < len; d += 1.15, k++) {
      const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len;
      torii(m, x, groundY(x, z) - 0.05, z, rot, 2.5, 3.3, VERMILION);
      if (k % 9 === 4) {
        const c = new THREE.Color(1, 0.55, 0.22);
        chochin(glow, m, x, groundY(x, z) + 2.25, z, c, 0.75);
        halos.push({ x, y: groundY(x, z) + 2.25, z, s: 1.1, c });
      }
    }
  }
}

/** Round the pond: stones on its rim, an arched red bridge over it, lily pads, a lantern. */
function pondDressing(wood: Mesher, stone: Mesher, leaves: Mesher, glow: Mesher, halos: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], r: () => number) {
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + r() * 0.1;
    if (Math.abs(Math.sin(a)) > 0.93) continue;
    const x = POND.x + Math.cos(a) * (POND.rx + 0.4), z = POND.z + Math.sin(a) * (POND.rz + 0.4);
    stone.at(new THREE.DodecahedronGeometry(0.5 + r() * 0.7, 0), x, POND_Y + 0.3, z, lin(0x6d6a60).multiplyScalar(0.8 + r() * 0.4), r() * 6);
  }
  // the bridge, arching north-south over the narrow way
  const N = 14, L = 2 * (POND.rz + 3), H = 2.3;
  const arch = (f: number) => POND_Y + 0.6 + Math.sin(f * Math.PI) * H;
  for (let i = 0; i < N; i++) {
    const f0 = i / N, f1 = (i + 1) / N;
    const z0 = POND.z - L / 2 + f0 * L, z1 = POND.z - L / 2 + f1 * L;
    beam(wood, [POND.x, arch(f0), z0], [POND.x, arch(f1), z1], 2.3, 0.18, 0x5a3a26);
    for (const sx of [-1, 1]) {
      beam(wood, [POND.x + sx * 1.1, arch(f0) + 0.85, z0], [POND.x + sx * 1.1, arch(f1) + 0.85, z1], 0.1, 0.1, VERMILION);
      rod(wood, [POND.x + sx * 1.1, arch(f0), z0], [POND.x + sx * 1.1, arch(f0) + 0.95, z0], 0.06, 0.06, VERMILION, 6);
    }
  }
  for (const f of [0.25, 0.75])
    for (const sx of [-1, 1]) rod(wood, [POND.x + sx * 0.9, POND_Y - 1, POND.z - L / 2 + f * L], [POND.x + sx * 0.9, arch(f) - 0.1, POND.z - L / 2 + f * L], 0.14, 0.14, VERMILION, 6);
  // lily pads and a few lotus flowers
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85;
    const x = POND.x + Math.cos(a) * POND.rx * d, z = POND.z + Math.sin(a) * POND.rz * d;
    if (Math.abs(x - POND.x) < 2) continue;
    const s = 0.35 + r() * 0.4;
    leaves.at(new THREE.CircleGeometry(s, 9, 0.4, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2), x, POND_Y + 0.03, z, lin(0x3d6a34).multiplyScalar(0.8 + r() * 0.4), r() * 6);
    if (r() < 0.2) leaves.at(new THREE.ConeGeometry(0.16, 0.22, 6, 1, true).rotateX(Math.PI), x + 0.1, POND_Y + 0.15, z, lin(0xf2a6c8));
  }
  toro(stone, glow, halos, POND.x + POND.rx + 2.5, groundY(POND.x + POND.rx + 2.5, POND.z - 6), POND.z - 6, 1);
  toro(stone, glow, halos, POND.x - POND.rx - 1.5, groundY(POND.x - POND.rx - 1.5, POND.z + 5), POND.z + 5, 1.2);
  // weeping cherries by the water
  for (const [x, z] of [
    [POND.x + 10, POND.z - 14],
    [POND.x - 12, POND.z + 13],
    [POND.x + 17, POND.z + 10],
  ]) {
    const y = groundY(x, z);
    rod(wood, [x, y - 0.3, z], [x + 0.6, y + 3.2, z], 0.28, 0.2, 0x3a2a24, 7);
    for (let k = 0; k < 9; k++) {
      const a = k * 0.9 + r(), d = 0.8 + r() * 1.8;
      leaves.at(new THREE.IcosahedronGeometry(1.1 + r() * 0.7, 0), x + Math.cos(a) * d, y + 3.4 + r() * 1.4, z + Math.sin(a) * d, lin([0xf2b6cc, 0xf7c9d8, 0xe89ab8][k % 3]).multiplyScalar(0.9 + r() * 0.2), r() * 6);
    }
  }
}

// ------------------------------------------------------------------ the ground
/**
 * The ground: white gravel raked in rings round the ring, flagstones up the approach and along the
 * gate path, moss and cedar litter on the slopes, the pond's muddy rim, lantern light pooled on the
 * gravel.
 */
function groundMesh(v: OutdoorVenue) {
  const radii: number[] = [];
  for (let rr = 18; rr < 60; rr += 1.5) radii.push(rr);
  for (let rr = 60; rr < 420; rr += rr < 140 ? 4 : 12) radii.push(rr);
  const A = 200;
  const pos: number[] = [], idx: number[] = [];
  for (const rr of radii)
    for (let j = 0; j < A; j++) {
      const a = (j / A) * Math.PI * 2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      pos.push(x, groundY(x, z), z);
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
  const path = GATES_PATH.map(([x, z]) => new THREE.Vector2(x, z));
  const mat = vMaterial(v.u, {
    uniforms: { uPath: { value: path }, uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) } },
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
      uniform vec2 uPath[${GATES_PATH.length}];
      uniform vec4 uPond;
      varying vec3 vW, vN;
      float segD(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t); }
      void main() {
        vec3 n = normalize(vN);
        vec2 p = vW.xz;
        float r = length(p);
        vec2 fw = fwidth(p);
        float px = max(fw.x, fw.y);
        float detail = smoothstep(0.5, 0.1, px);
        float n1 = texture2D(uNoise, p * 0.035).g, n2 = texture2D(uNoise, p * 0.31).r, n3 = texture2D(uNoise, p * 0.009).a;
        // the forest floor: moss, needle litter, dark soil, ferny patches
        vec3 moss = mix(vec3(0.12, 0.2, 0.08), vec3(0.22, 0.3, 0.1), n1);
        vec3 litter = mix(vec3(0.24, 0.14, 0.07), vec3(0.33, 0.2, 0.1), n2);
        vec3 c = mix(moss, litter, smoothstep(0.35, 0.7, n3));
        c = mix(c, vec3(0.08, 0.14, 0.06), smoothstep(0.6, 0.8, texture2D(uNoise, p * 0.07 + 0.4).b) * 0.7);
        c *= 0.8 + 0.3 * n2 * detail + 0.15 * (1.0 - detail);
        // the gravel round the ring, raked in rings, the lanterns' light on it
        float gravel = smoothstep(${(CLEAR + 1).toFixed(1)}, ${(CLEAR - 1).toFixed(1)}, r);
        float rake = 0.85 + 0.15 * sin(r * 6.2832 / 0.4) * detail;
        vec3 gv = vec3(0.62, 0.6, 0.55) * rake * (0.9 + 0.2 * texture2D(uNoise, p * 1.3).r * detail);
        c = mix(c, gv, gravel);
        // flagstones: up the approach, along the gate path
        float flag = step(${(STANDS_D + AX).toFixed(1)}, p.x) * step(p.x, 70.0) * smoothstep(2.9, 2.6, abs(p.y));
        float pd = 1e4;
        for (int i = 0; i < ${GATES_PATH.length - 1}; i++) pd = min(pd, segD(p, uPath[i], uPath[i + 1]));
        flag = max(flag, smoothstep(1.7, 1.4, pd));
        vec2 cell = floor(p / vec2(1.1, 0.8) + vec2(0.0, floor(p.x / 1.1) * 0.5));
        vec2 f = fract(p / vec2(1.1, 0.8) + vec2(0.0, floor(p.x / 1.1) * 0.5));
        float joint = smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        vec3 st = vec3(0.45, 0.44, 0.4) * (0.8 + 0.3 * hash12(cell)) * mix(0.55, 1.0, mix(1.0, joint, detail));
        st = mix(st, moss, (1.0 - joint) * 0.6 * detail);
        c = mix(c, st, flag);
        // the pond's muddy rim
        float pq = length((p - uPond.xy) / uPond.zw);
        c = mix(c, vec3(0.12, 0.1, 0.07), smoothstep(1.3, 1.0, pq));
        vec3 L = ambient(n) + uSunCol * max(dot(n, uSunDir), 0.0) * 0.5;
        // lantern light pooled round the stands and up the approach
        L += vec3(1.0, 0.6, 0.3) * (smoothstep(46.0, 28.0, r) * 0.32 + flag * smoothstep(70.0, 30.0, p.x) * 0.15);
        c *= L;
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** The forest beyond: a dark wall of cedar spires up the slopes, fading into the mist. */
function forestWall(v: OutdoorVenue, r: () => number) {
  const t = new Tris();
  for (let i = 0; i < 700; i++) {
    const a = r() * Math.PI * 2, d = 215 + r() * 150;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = groundY(x, z) - 1;
    const h = 24 + r() * 26, w = h * (0.22 + r() * 0.08);
    const sx = -Math.sin(a) * w, sz = Math.cos(a) * w;
    const col = lin(0x23382c).multiplyScalar(0.7 + r() * 0.5), tip = lin(0x3a5a46).multiplyScalar(0.7 + r() * 0.4);
    t.tri([x - sx, y, z - sz], [x + sx, y, z + sz], [x, y + h, z], [-Math.cos(a), 0.3, -Math.sin(a)], col, col, tip);
  }
  return new THREE.Mesh(t.geometry(), litMaterial(v.u, { wrap: 0.4, side: THREE.DoubleSide }));
}

/** Mountain ridges far off, all round. */
function hills(v: OutdoorVenue) {
  const t = new Tris();
  const R = 560, N = 220;
  const h = (a: number) => 90 + 60 * Math.sin(a * 3 + 1) * Math.sin(a * 1.7) + 28 * Math.sin(a * 11 + 2) + 10 * Math.sin(a * 29);
  const col = lin(0x2c3a4a), top = lin(0x435468);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const p = (a: number, y: number): THREE.Vector3Tuple => [Math.cos(a) * R, y, Math.sin(a) * R];
    t.quad(p(a0, -10), p(a1, -10), p(a1, h(a1)), p(a0, h(a0)), [-Math.cos(a0), 0.4, -Math.sin(a0)], col, col, top, top);
  }
  return new THREE.Mesh(t.geometry(), litMaterial(v.u, { side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------ things in the air
/**
 * Fireflies blinking low over the gravel and among the trees, and sky lanterns rising slowly out
 * of the forest and away: camera-facing quads moved entirely on the GPU.
 */
function drifters(u: VenueUniforms, r: () => number, low: boolean) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at: number[] = [], info: number[] = [];
  const flies = low ? 120 : 260, sky = low ? 18 : 34;
  for (let i = 0; i < flies; i++) {
    const a = r() * Math.PI * 2, d = 24 + r() * 60;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    at.push(x, groundY(x, z) + 0.4 + r() * 3.5, z, 0);
    info.push(r() * 100, 0.2 + r() * 0.12, 0, 0);
  }
  for (let i = 0; i < sky; i++) {
    const a = r() * Math.PI * 2, d = 50 + r() * 140;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    at.push(x, groundY(x, z) + 10, z, 1);
    info.push(r() * 1000, 1.0 + r() * 0.3, 0, 0);
  }
  geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
  geo.instanceCount = flies + sky;
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec4 aAt, aInfo;
      varying vec2 vUv;
      varying float vKind, vK;
      varying vec3 vW;
      void main() {
        float s = aInfo.x, t = uTime;
        vKind = aAt.w;
        vec3 p = aAt.xyz;
        float size = aInfo.y;
        if (vKind < 0.5) {
          // a firefly: a lazy wander and a slow blink
          p += vec3(sin(t * 0.31 + s) * 2.4, sin(t * 0.53 + s * 1.7) * 0.7, cos(t * 0.27 + s * 2.3) * 2.4);
          vK = smoothstep(0.3, 1.0, sin(t * (0.8 + fract(s) * 0.9) + s * 7.0));
        } else {
          // a sky lantern: rising, swaying, gone high up, back from the forest again
          float life = mod(t * 0.55 + s, 170.0);
          p += vec3(sin(t * 0.13 + s) * 6.0 + life * 0.25, life, cos(t * 0.11 + s) * 6.0 + life * 0.1);
          vK = smoothstep(0.0, 12.0, life) * smoothstep(170.0, 120.0, life) * (0.85 + 0.15 * sin(t * 3.0 + s));
        }
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec2 q = position.xy * (vKind < 0.5 ? vec2(1.0) : vec2(0.8, 1.1)) * size;
        vec3 w = p + cr * q.x + cu * q.y;
        vUv = position.xy + 0.5;
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec2 vUv;
      varying float vKind, vK;
      varying vec3 vW;
      void main() {
        vec3 c;
        if (vKind < 0.5) {
          float d = length(vUv - 0.5) * 2.0;
          c = vec3(0.75, 1.0, 0.35) * (exp(-d * d * 5.0) + smoothstep(0.25, 0.0, d)) * vK * 1.4;
        } else {
          // a paper lantern: wider at the top, the flame's glow at the open bottom
          vec2 q = vUv - vec2(0.5, 0.0);
          float w = mix(0.36, 0.48, vUv.y);
          float body = smoothstep(w, w - 0.06, abs(q.x)) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float flame = exp(-pow(length(q - vec2(0.0, 0.15)) * 6.0, 2.0));
          c = (vec3(1.0, 0.55, 0.2) * body * (0.55 + 0.45 * (1.0 - vUv.y)) + vec3(1.0, 0.85, 0.5) * flame) * vK;
        }
        c *= uGlow * 0.6;
        gl_FragColor = vec4(c * (1.0 - hazeAt(vW) * 0.6), 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 12;
  return m;
}

/** A layer of mist lying in the trees `lift` metres over the ground, drifting slowly. */
function mist(u: VenueUniforms, lift: number, k: number) {
  const radii = [CLEAR + 6, 50, 70, 95, 125, 160, 200, 250, 300];
  const A = 96;
  const pos: number[] = [], idx: number[] = [];
  for (const rr of radii)
    for (let j = 0; j < A; j++) {
      const a = (j / A) * Math.PI * 2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      pos.push(x, groundY(x, z) + lift, z);
    }
  for (let i = 0; i < radii.length - 1; i++)
    for (let j = 0; j < A; j++) {
      const a = i * A + j, b = i * A + ((j + 1) % A), c = (i + 1) * A + j, d = (i + 1) * A + ((j + 1) % A);
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uMist: { value: new THREE.Vector2(lift, k) } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform vec2 uMist;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz * 0.012 + vec2(uTime * 0.0021, uTime * 0.0013) + uMist.x * 0.37;
        float n = texture2D(uNoise, p).b * 0.6 + texture2D(uNoise, p * 2.7 - uTime * 0.001).g * 0.4;
        float a = smoothstep(0.35, 0.85, n) * uMist.y;
        // thin out right by the clearing, and close to the camera (no flat sheet in your face)
        a *= smoothstep(${(CLEAR + 4).toFixed(1)}, ${(CLEAR + 30).toFixed(1)}, length(vW.xz));
        a *= smoothstep(6.0, 30.0, distance(vW, cameraPosition));
        vec3 c = mix(uHaze, uSky, 0.3) * 1.05;
        gl_FragColor = vec4(c, a);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 11;
  return m;
}

/** Cherry petals on the breeze over the clearing, from the trees by the pond. */
function petals(u: VenueUniforms, r: () => number) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at: number[] = [];
  const n = 260;
  for (let i = 0; i < n; i++) at.push(POND.x + (r() - 0.3) * 90, r() * 14, POND.z + (r() - 0.5) * 70, r() * 100);
  geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  geo.instanceCount = n;
  const mat = vMaterial(u, {
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec4 aAt;
      varying vec2 vUv;
      varying vec3 vW;
      varying float vShade;
      void main() {
        float s = aAt.w, t = uTime;
        // falling slowly, carried east by the breeze, tumbling
        float fall = mod(aAt.y - t * 0.45 + s, 14.0);
        vec3 p = vec3(aAt.x + mod(t * 0.9 + s * 7.0, 90.0) - 20.0, ${FLOOR.toFixed(2)} + 0.1 + fall, aAt.z + sin(t * 0.7 + s) * 2.0);
        float a = t * (1.5 + fract(s) * 2.0) + s, b = t * 1.1 + s * 3.0;
        vec3 ax = vec3(cos(a), sin(a) * cos(b), sin(a) * sin(b));
        vec3 ay = normalize(cross(ax, vec3(0.3, 1.0, 0.2)));
        vec3 w = p + (ax * position.x * 0.09 + ay * position.y * 0.06);
        vShade = 0.65 + 0.35 * abs(ay.y);
        vUv = position.xy + 0.5;
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec2 vUv;
      varying vec3 vW;
      varying float vShade;
      void main() {
        vec2 q = vUv - 0.5;
        if (length(q * vec2(1.0, 1.4)) > 0.5) discard;
        vec3 c = vec3(0.98, 0.72, 0.8) * vShade * (ambient(vec3(0.0, 1.0, 0.0)) * 1.3 + vec3(1.0, 0.6, 0.3) * 0.35);
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ textures
/** Granite flagstones round the ring, moss in the joints. */
function flagstoneTexture() {
  return paintTexture(512, 512, (g, w, h) => {
    const r = prng(31);
    g.fillStyle = '#3c4430';
    g.fillRect(0, 0, w, h);
    const rows = 4;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 120;
      while (x < w) {
        const len = 90 + r() * 110;
        const l = 44 + r() * 14;
        g.fillStyle = `hsl(${40 + r() * 20}, ${6 + r() * 6}%, ${l}%)`;
        g.fillRect(x + 3, i * rh + 3, len - 6, rh - 6);
        // speckle and wear
        for (let k = 0; k < 140; k++) {
          g.fillStyle = r() < 0.5 ? `rgba(30,30,28,${0.08 + r() * 0.1})` : `rgba(220,215,200,${0.06 + r() * 0.08})`;
          g.fillRect(x + 3 + r() * (len - 6), i * rh + 3 + r() * (rh - 6), 1 + r() * 2, 1 + r() * 2);
        }
        x += len;
      }
    }
    // moss creeping in from the joints
    for (let k = 0; k < 60; k++) {
      const x = r() * w, y = Math.round(r() * rows) * rh, s = 6 + r() * 16;
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, 'rgba(70,96,40,0.55)');
      grd.addColorStop(1, 'rgba(70,96,40,0)');
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });
}

/** A black lacquered plaque with the corner's character in its colour. */
function plaqueTexture(label: string, team: number) {
  return paintTexture(
    128,
    160,
    (g, w, h) => {
      g.fillStyle = '#16100c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c9a24a';
      g.lineWidth = 6;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.font = '800 96px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Noto Serif CJK JP", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#' + team.toString(16).padStart(6, '0');
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 10;
      g.fillText(label, w / 2, h / 2 + 4);
    },
    false,
  );
}
