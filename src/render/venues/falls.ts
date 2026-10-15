import * as THREE from 'three';
import { AX, FLOOR, TUNNEL_OPEN_H, TUNNEL_OPEN_HW } from '../bowl';
import { Mesher, Tris, billboards, glowMaterial, lin, litMaterial, paintTexture, prng, vMaterial, V_GLSL, V_OUT, waterMaterial, type Daylight, type VenueUniforms } from './kit';
import { OutdoorVenue, STANDS_D, STANDS_TOP, sunLook } from './outdoor';
import { block, gulls, rod } from './props';

/**
 * Cascade Falls Dam: the Cascade Championship, on a bastion jutting from the crest of an old
 * concrete dam high in the mountains. Upstream the reservoir lies still under snowy peaks; downstream
 * the gorge drops seventy metres to the river; and just east of the ring the spillway pours over
 * its weir between the gate piers in four roaring curtains, the spray boiling up out of the gorge
 * with a rainbow in it. Art deco lamps and balustrades along the crest, intake towers out in the
 * water, the gate house on the west abutment, pines up the cliffs.
 */

const SUN = new THREE.Vector3(-0.72, 0.64, 0.26).normalize();
const DAY: Daylight = { sun: SUN, sunCol: 0xfff0d8, sunK: 2.5, sky: 0x9cc6ff, skyK: 0.75, gnd: 0x8a8a70, gndK: 0.4, haze: 0xbfd6ea, hazeK: 0.0015 };
const WATER_Y = FLOOR - 2.5;
const RIVER_Y = FLOOR - 71.5;
/** The dam: upstream face, the crest's downstream edge, its ends in the rock. */
const DAM = { z0: -34, z1: -14, hw: 152, slope: 0.72, base: FLOOR - 95 };
/** The bastion the ring stands on, out from the crest. */
const BASTION = { hw: 46, z1: 34 };
/** The spillway: its weir between the gate piers, the lip the water leaves from. */
const SPILL = { x0: 48, x1: 96, weir: FLOOR - 3.6 };
const PIERS = [48, 59.5, 71, 82.5, 94];
/** The plunge pool the falls have dug under the spillway, and the run out of it into the river. */
const POOLS = [
  { x: 62, z: 10, rx: 42, rz: 24 },
  { x: 36, z: 36, rx: 26, rz: 16 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The ground: the lake's basin upstream, the gorge below the dam, cliffs and peaks all round. */
function terrainY(x: number, z: number) {
  const ax = Math.abs(x);
  // upstream: the lake bed and its shores
  const W = 145 + Math.max(0, -z - 34) * 0.55;
  const du = ax - W;
  const up = du < 0 ? WATER_Y - 6 - Math.min(22, -du * 0.3) : WATER_Y - 1 + du * 0.6;
  // downstream: a V gorge down to the river
  const F = RIVER_Y - 0.6 - Math.max(0, z - 40) * 0.035;
  const meander = Math.sin(z * 0.012) * 18 * smooth(30, 160, z);
  const dd = Math.max(0, Math.abs(x - meander) - 22);
  const down = F + 0.242 * Math.pow(dd, 1.2);
  let y = up + (down - up) * smooth(-42, -26, z);
  // the plunge pool, scoured down below the river under the falls
  for (const p of POOLS) {
    const pd = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
    if (pd < 1.6) y = Math.min(y, RIVER_Y - 4 + Math.max(0, pd - 0.75) * 40);
  }
  // rough rock, and the mountains levelling off into peaks
  y += (Math.sin(x * 0.07 + z * 0.03) * 3 + Math.sin(x * 0.19 - z * 0.13) * 1.2) * smooth(0, 20, y - WATER_Y);
  const rim = FLOOR + 70 + 50 * Math.sin(x * 0.006 + 1.3) * Math.cos(z * 0.005) + 90 * smooth(380, 650, Math.hypot(x, z));
  if (y > rim) y = rim + (y - rim) * 0.25;
  return y;
}

export class FallsVenue extends OutdoorVenue {
  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }) {
    const r = prng(5505);
    const conc = [0xb8b4aa, 0xc2beb4, 0xaeaaa0, 0xbcb8ae].map((h) => lin(h));
    super(quality, arena, {
      day: DAY,
      sky: { zenith: 0x2f6fd0, horizon: 0xa8cdf0, glow: 0xfff0d0, glowSize: 0.35, cloud: 0.4, cloudLit: 0xffffff, cloudShade: 0x9aa8bc, disc: 1 },
      look: sunLook(DAY, { fogDensity: 0.0035, env: 1.0, hemi: [0x9cc6ff, 0x8a8a70, 1.1], key: 3.8, keyCol: 0xfff0dc, rims: [0xffd0a0, 9, 0x80c8ff, 10] }),
      floor: { map: paverTexture(), metres: 3.6, roughness: 0.9, gloss: 0.35 },
      stands: {
        tread: (ri, k) => conc[(ri * 3 + k) % conc.length].clone().multiplyScalar(0.92 + 0.12 * ((ri + k) % 3) * 0.5),
        riser: () => lin(0x7a7670),
        wall: lin(0x9a968c),
        aisle: lin(0xd0ccc0),
        rail: lin(0x2f6f8f),
        parapet: 1.0,
      },
      crowd: { day: 1, light: 0xfff4e6, k: 1.0 },
      outer: FLOOR,
      hall: { base: 0.16, tint: 0xe8f0ff },
    });
    const g = this.group;
    const u = this.u;
    const low = quality === 'low';

    const conc2 = new Mesher();
    const steel = new Mesher();
    const glow = new Mesher();
    const pines = new Mesher();
    const lamps: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] = [];

    // ------------------------------------------------------------ the land, the lake, the river
    g.add(terrainMesh(this, low));
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700).rotateX(-Math.PI / 2), waterMaterial(u, { deep: 0x0d3b4a, shallow: 0x2f7a74, zenith: 0x2f6fd0, shore: LAKE_GLSL, clear: 0.12, foam: 0.3 }));
    lake.position.set(0, WATER_Y, DAM.z0 - 350);
    g.add(lake);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(260, 700).rotateX(-Math.PI / 2), waterMaterial(u, { deep: 0x1b4a4a, shallow: 0x5aa89a, zenith: 0x2f6fd0, shore: RIVER_GLSL, clear: 0.3, foam: 1.6, scale: 1.6 }));
    river.position.set(0, RIVER_Y, 330);
    g.add(river);

    // ------------------------------------------------------------ the dam
    g.add(damMesh(this));
    crest(conc2, steel, glow, lamps);
    spillwayPiers(conc2, steel);
    intakes(conc2, steel, glow);
    gateHouse(conc2, glow, lamps);

    // ------------------------------------------------------------ the water over the weir and down the face, the spray
    for (let i = 0; i < PIERS.length - 1; i++) g.add(weirFlow(u, PIERS[i] + 1, PIERS[i + 1] - 1));
    for (let i = 0; i < PIERS.length - 1; i++) g.add(curtain(u, PIERS[i] + 1, PIERS[i + 1] - 1, i));
    g.add(spray(u, r, low));

    // ------------------------------------------------------------ the corners: deco portals
    for (const sx of [-1, 1]) {
      const team = lin(sx < 0 ? 0xff7a1f : 0x3fe0ff);
      const x = sx * (AX - 0.22);
      const H = FLOOR + TUNNEL_OPEN_H;
      for (const sz of [-1, 1]) {
        const zc = sz * (TUNNEL_OPEN_HW + 0.3);
        // stepped pilasters with a bronze inlay in the corner's colour, a lamp on top
        block(conc2, 0.5, TUNNEL_OPEN_H + 1.0, 0.6, x, FLOOR + (TUNNEL_OPEN_H + 1.0) / 2, zc, 0xcfcac0);
        block(conc2, 0.62, 0.3, 0.72, x, H + 1.0, zc, 0xd8d3c8);
        block(glow, 0.04, TUNNEL_OPEN_H * 0.7, 0.1, x - sx * 0.27, FLOOR + TUNNEL_OPEN_H * 0.45, zc, team.clone().multiplyScalar(1.1));
        rod(steel, [x, H + 1.15, zc], [x, H + 1.75, zc], 0.06, 0.05, 0x3a4a3a, 6);
        glow.at(new THREE.SphereGeometry(0.2, 10, 8), x, H + 1.9, zc, new THREE.Color(1, 0.95, 0.85).multiplyScalar(0.9));
        lamps.push({ x, y: H + 1.9, z: zc, s: 0.7, c: new THREE.Color(1, 0.9, 0.75) });
      }
      // the lintel, stepped, and the name plate
      block(conc2, 0.55, 0.5, 2 * TUNNEL_OPEN_HW + 1.3, x, H + 0.3, 0, 0xcfcac0);
      block(conc2, 0.45, 0.3, 2 * TUNNEL_OPEN_HW + 0.7, x, H + 0.7, 0, 0xd8d3c8);
      block(conc2, 0.35, 0.22, 1.2, x, H + 0.96, 0, 0xd8d3c8);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 0.36),
        new THREE.MeshBasicMaterial({ map: decoTexture(sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER', sx < 0 ? '#ff7a1f' : '#3fe0ff'), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.05) }),
      );
      sign.position.set(x - sx * 0.29, H + 0.3, 0);
      sign.rotation.y = -sx * (Math.PI / 2);
      g.add(sign);
    }

    // ------------------------------------------------------------ the big screens on concrete pylons
    for (const sz of [-1, 1]) {
      const z = sz * (STANDS_D + 14.2);
      const y = STANDS_TOP + 5.2;
      this.screen(0, y, z, sz > 0 ? Math.PI : 0, 9.6, 5.4, new THREE.Color(0x3a3e42));
      for (const ox of [-5.4, 5.4]) {
        block(conc2, 1.1, y + 3.2 - FLOOR, 1.1, ox, (FLOOR + y + 3.2) / 2, z + sz * 0.4, 0xcfcac0);
        block(conc2, 1.4, 0.4, 1.4, ox, y + 3.4, z + sz * 0.4, 0xd8d3c8);
      }
      block(conc2, 11.6, 0.5, 0.8, 0, y + 2.95, z + sz * 0.4, 0xd8d3c8);
    }

    // ------------------------------------------------------------ deco lamp pillars on the stairwell blocks
    for (const v of this.vomTops) {
      block(conc2, 0.9, 2.6, 0.9, v.x, v.y + 1.3, v.z, 0xcfcac0);
      block(conc2, 1.1, 0.25, 1.1, v.x, v.y + 2.7, v.z, 0xd8d3c8);
      glow.at(new THREE.CylinderGeometry(0.32, 0.26, 0.7, 10), v.x, v.y + 3.2, v.z, new THREE.Color(1, 0.95, 0.85).multiplyScalar(0.8));
      block(conc2, 0.8, 0.12, 0.8, v.x, v.y + 3.62, v.z, 0x3a4a3a);
      lamps.push({ x: v.x, y: v.y + 3.2, z: v.z, s: 1, c: new THREE.Color(1, 0.9, 0.75) });
    }

    // ------------------------------------------------------------ pines up the slopes, the peaks, birds
    pineForest(pines, r, low ? 420 : 800);
    g.add(peaks(this));
    g.add(gulls(u, this.tick, r));

    // ------------------------------------------------------------ build it all
    this.props(conc2, litMaterial(u, { grain: 0.18 }));
    this.props(steel);
    this.props(pines, litMaterial(u, { wrap: 0.25, sway: 0.0015 }));
    g.add(new THREE.Mesh(glow.geometry(), glowMaterial(u)));
    g.add(billboards(u, lamps, 'halo', 1.2));
  }
}

const LAKE_GLSL = /* glsl */ `
  float shoreDist(vec2 p) {
    float W = 145.0 + max(0.0, -p.y - 34.0) * 0.55;
    return min(${DAM.z0.toFixed(1)} - p.y, (W - abs(p.x)) * 0.35);
  }`;
const RIVER_GLSL = /* glsl */ `
  float shoreDist(vec2 p) {
    float m = sin(p.y * 0.012) * 18.0 * smoothstep(30.0, 160.0, p.y);
    float d = 20.0 - abs(p.x - m);
    ${POOLS.map((q) => `d = max(d, (0.75 - length((p - vec2(${q.x.toFixed(1)}, ${q.z.toFixed(1)})) / vec2(${q.rx.toFixed(1)}, ${q.rz.toFixed(1)}))) * 40.0);`).join('\n    ')}
    return d;
  }`;

// ------------------------------------------------------------------ the dam
/**
 * The dam's concrete: its crest and the bastion's top (paving), the upstream face down into the
 * lake, the downstream face battered back down into the gorge, the spillway's sheer face and the
 * bastion's walls, all in one shader with the pour lines, block joints, water stains and moss.
 */
function damMesh(v: OutdoorVenue) {
  const t = new Tris();
  const c = new THREE.Color(1, 1, 1);
  const { z0, z1, hw, slope, base } = DAM;
  const B = BASTION;
  const top = FLOOR;
  const dz = (y: number) => z1 + slope * (top - y);
  // crest top: west of the bastion, between it and the spillway, east of the spillway (and over the bastion)
  const crestTop = (xa: number, xb: number, za: number, zb: number) => t.quad([xa, top, za], [xb, top, za], [xb, top, zb], [xa, top, zb], [0, 1, 0], c);
  crestTop(-hw, -B.hw, z0, z1);
  crestTop(-B.hw, B.hw, z0, B.z1);
  crestTop(B.hw, SPILL.x0, z0, z1);
  crestTop(SPILL.x1, hw, z0, z1);
  // the upstream face, down under the lake
  t.quad([-hw, base, z0], [hw, base, z0], [hw, top, z0], [-hw, top, z0], [0, 0, -1], c);
  // the downstream face, battered
  const face = (xa: number, xb: number) => t.quad([xa, top, z1], [xb, top, z1], [xb, base, dz(base)], [xa, base, dz(base)], [0, slope, 1], c);
  face(-hw, -B.hw);
  face(B.hw, SPILL.x0);
  face(SPILL.x1, hw);
  // the spillway: the weir top and its sheer face
  t.quad([SPILL.x0, SPILL.weir, z0], [SPILL.x1, SPILL.weir, z0], [SPILL.x1, SPILL.weir, z1], [SPILL.x0, SPILL.weir, z1], [0, 1, 0], c);
  t.quad([SPILL.x0, SPILL.weir, z1], [SPILL.x1, SPILL.weir, z1], [SPILL.x1, base, z1], [SPILL.x0, base, z1], [0, 0, 1], c);
  for (const [x, nx] of [
    [SPILL.x0, 1],
    [SPILL.x1, -1],
  ] as const) {
    t.quad([x, SPILL.weir, z0], [x, SPILL.weir, z1], [x, top, z1], [x, top, z0], [nx, 0, 0], c);
    // (the end of the battered face beside it, seen from the notch)
    t.tri([x, top, z1], [x, base, z1], [x, base, dz(base)], [nx, 0, 0], c);
  }
  // the bastion's walls, sheer down into the gorge
  t.quad([-B.hw, top, B.z1], [B.hw, top, B.z1], [B.hw, base, B.z1], [-B.hw, base, B.z1], [0, 0, 1], c);
  for (const sx of [-1, 1]) {
    t.quad([sx * B.hw, top, z1], [sx * B.hw, top, B.z1], [sx * B.hw, base, B.z1], [sx * B.hw, base, z1], [sx, 0, 0], c);
  }
  const geo = t.geometry();
  const mat = vMaterial(v.u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vN, vW;
      void main() {
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vN, vW;
      void main() {
        vec3 n = normalize(vN);
        vec3 w = vW;
        vec2 fw = fwidth(w.xz) + fwidth(w.yy);
        float px = max(max(fw.x, fw.y), 1e-4);
        float detail = smoothstep(0.5, 0.08, px);
        float n1 = texture2D(uNoise, w.xz * 0.02 + w.y * 0.013).g, n2 = texture2D(uNoise, w.xz * 0.27 + w.yy * 0.21).r;
        vec3 c = mix(vec3(0.62, 0.6, 0.55), vec3(0.74, 0.72, 0.66), n1);
        if (n.y > 0.5) {
          // the crest's paving: slabs and their joints, a worn track down the middle
          vec2 j = abs(fract(w.xz / vec2(4.0, 3.0) + 0.5) - 0.5) * vec2(4.0, 3.0);
          c *= 1.0 - 0.28 * smoothstep(0.05 + px, 0.05, min(j.x, j.y)) * detail;
          c *= 1.0 - 0.06 * smoothstep(6.0, 2.0, abs(w.z + 24.0));
        } else {
          // pour lifts every 1.6 m, block joints every 15 m, the formwork's boards
          float along = abs(n.x) > 0.5 ? w.z : w.x;
          float lift = abs(fract(w.y / 1.6 + 0.5) - 0.5) * 1.6;
          float joint = abs(fract(along / 15.0 + 0.5) - 0.5) * 15.0;
          c *= 1.0 - (0.18 * smoothstep(0.04 + px, 0.04, lift) + 0.28 * smoothstep(0.08 + px, 0.08, joint)) * detail;
          c *= 0.96 + 0.04 * step(0.5, fract(along / 0.3)) * detail;
          // the dark streaks of seepage and rain down the face, white lime bleeding from the joints
          float streak = texture2D(uNoise, vec2(along * 0.15, w.y * 0.006)).b;
          c *= 1.0 - 0.35 * smoothstep(0.55, 0.85, streak);
          c = mix(c, vec3(0.86, 0.85, 0.8), smoothstep(0.82, 0.95, texture2D(uNoise, vec2(along * 0.4, w.y * 0.02)).a) * 0.4);
          // moss and wet near the water and low in the gorge
          float wet = smoothstep(${(WATER_Y + 1.2).toFixed(2)}, ${(WATER_Y - 0.5).toFixed(2)}, w.y) * step(w.z, ${(DAM.z0 + 0.5).toFixed(1)});
          wet = max(wet, smoothstep(${(FLOOR - 40).toFixed(1)}, ${(FLOOR - 70).toFixed(1)}, w.y));
          c = mix(c, vec3(0.22, 0.28, 0.16) * (0.7 + 0.6 * n2), wet * 0.8);
        }
        c *= 0.88 + 0.24 * n2 * detail + 0.12 * (1.0 - detail);
        vec3 L = ambient(n) + uSunCol * max(dot(n, uSunDir), 0.0);
        gl_FragColor = vec4(haze(c * L, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** The crest: balustrades both sides and round the bastion, deco lamp standards along the road. */
function crest(m: Mesher, steel: Mesher, glow: Mesher, lamps: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  const col = 0xd2cec4;
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.55));
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      // balusters, a heavier post every eight
      if (i % 8 === 0) block(m, 0.38, 1.15, 0.38, x, FLOOR + 0.57, z, col);
      else m.at(new THREE.CylinderGeometry(0.07, 0.1, 0.85, 6), x, FLOOR + 0.48, z, col);
    }
    block(m, len + 0.3, 0.14, 0.32, (ax + bx) / 2, FLOOR + 1.0, (az + bz) / 2, col, rot);
    block(m, len + 0.3, 0.12, 0.28, (ax + bx) / 2, FLOOR + 0.06, (az + bz) / 2, col, rot);
  };
  const { z0, z1, hw } = DAM;
  rail(-hw + 6, z0 + 0.3, SPILL.x0 - 0.5, z0 + 0.3);
  rail(SPILL.x1 + 0.5, z0 + 0.3, hw - 6, z0 + 0.3);
  rail(-hw + 6, z1 - 0.3, -BASTION.hw, z1 - 0.3);
  rail(BASTION.hw, z1 - 0.3, SPILL.x0 - 0.5, z1 - 0.3);
  rail(SPILL.x1 + 0.5, z1 - 0.3, hw - 6, z1 - 0.3);
  rail(-BASTION.hw + 0.3, z1, -BASTION.hw + 0.3, BASTION.z1 - 0.3);
  rail(BASTION.hw - 0.3, z1, BASTION.hw - 0.3, BASTION.z1 - 0.3);
  rail(-BASTION.hw + 0.3, BASTION.z1 - 0.3, BASTION.hw - 0.3, BASTION.z1 - 0.3);
  // lamp standards: a fluted post, a bracket, a glass globe
  const lamp = (x: number, z: number) => {
    rod(steel, [x, FLOOR, z], [x, FLOOR + 4.6, z], 0.13, 0.08, 0x2e4a3e, 8);
    steel.at(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 8), x, FLOOR + 0.3, z, 0x2e4a3e);
    for (const s of [-1, 1]) rod(steel, [x, FLOOR + 4.3, z], [x + s * 0.55, FLOOR + 4.7, z], 0.04, 0.04, 0x2e4a3e, 5);
    for (const s of [-1, 1]) {
      glow.at(new THREE.SphereGeometry(0.22, 10, 8), x + s * 0.55, FLOOR + 4.55, z, new THREE.Color(1, 0.95, 0.85).multiplyScalar(0.7));
      lamps.push({ x: x + s * 0.55, y: FLOOR + 4.55, z, s: 0.55, c: new THREE.Color(1, 0.9, 0.75) });
    }
  };
  for (let x = -hw + 12; x < hw - 6; x += 18) {
    if (Math.abs(x) < BASTION.hw + 2 || (x > SPILL.x0 - 2 && x < SPILL.x1 + 2)) continue;
    lamp(x, z0 + 1.2);
    lamp(x, z1 - 1.2);
  }
  for (const x of [-40, -20, 20, 40]) lamp(x, BASTION.z1 - 1.2);
  for (const z of [-4, 14]) for (const sx of [-1, 1]) lamp(sx * (BASTION.hw - 1.2), z);
}

/** The gate piers between the spillway's bays, the road bridge on them, and the gantry crane. */
function spillwayPiers(m: Mesher, steel: Mesher) {
  const { z0, z1 } = DAM;
  const col = 0xc8c4ba;
  for (const x of PIERS) {
    // a rounded nose upstream, then the pier back to the lip
    block(m, 2, FLOOR + 6 - SPILL.weir, z1 - z0 + 2, x, (SPILL.weir + FLOOR + 6) / 2, (z0 + z1) / 2 - 1, col);
    m.at(new THREE.CylinderGeometry(1, 1, FLOOR + 6 - (WATER_Y - 4), 12), x, (FLOOR + 6 + WATER_Y - 4) / 2, z0 - 1, col);
    block(m, 2.6, 0.5, 4, x, FLOOR + 6.2, z0 + 3, 0xd8d3c8);
    // the gate's slots and a raised radial gate
    block(steel, 0.4, 5.2, 0.6, x + 1.05, SPILL.weir + 3, z0 + 6, 0x3a4048);
    block(steel, 0.4, 5.2, 0.6, x - 1.05, SPILL.weir + 3, z0 + 6, 0x3a4048);
  }
  for (let i = 0; i < PIERS.length - 1; i++) {
    const xa = PIERS[i] + 1, xb = PIERS[i + 1] - 1;
    block(steel, xb - xa, 2.2, 0.3, (xa + xb) / 2, FLOOR + 3.4, z0 + 6, 0x46505a);
  }
  // the road bridge over the piers
  const xm = (SPILL.x0 + SPILL.x1) / 2, w = SPILL.x1 - SPILL.x0 + 2;
  block(m, w, 1.2, 11, xm, FLOOR - 0.6, -24, 0xbcb8ae);
  block(m, w, 1.0, 0.3, xm, FLOOR + 0.5, -29.4, col);
  block(m, w, 1.0, 0.3, xm, FLOOR + 0.5, -18.6, col);
  // the gantry crane on rails along the pier tops
  const gx = 64;
  for (const z of [z0 + 1.2, z0 + 4.8]) block(steel, w, 0.2, 0.25, xm, FLOOR + 6.55, z, 0x2a2c2e);
  for (const sx of [-1, 1])
    for (const z of [z0 + 1.2, z0 + 4.8]) rod(steel, [gx + sx * 4, FLOOR + 6.6, z], [gx + sx * 3.4, FLOOR + 13, z], 0.28, 0.24, 0xe0a020, 4);
  block(steel, 9, 1.2, 4.6, gx, FLOOR + 13.4, z0 + 3, 0xe0a020);
  block(steel, 2.6, 2.2, 2.6, gx + 2, FLOOR + 15.1, z0 + 3, 0xd8d3c8);
}

/** The intake towers standing out in the lake, footbridges back to the crest. */
function intakes(m: Mesher, steel: Mesher, glow: Mesher) {
  for (const [x, z, h] of [
    [-62, -64, 16],
    [-104, -58, 13],
  ]) {
    m.at(new THREE.CylinderGeometry(6, 6.6, h + 30, 20), x, WATER_Y - 30 + (h + 30) / 2, z, 0xcfcac0);
    m.at(new THREE.CylinderGeometry(6.8, 6.8, 1.2, 20), x, WATER_Y + h - 2, z, 0xd8d3c8);
    m.at(new THREE.CylinderGeometry(5.2, 5.6, 3.4, 20), x, WATER_Y + h + 0.6, z, 0xd2cec4);
    m.at(new THREE.ConeGeometry(5.6, 4, 20), x, WATER_Y + h + 4.3, z, 0x3e6e60);
    glow.at(new THREE.CylinderGeometry(5.62, 5.62, 0.9, 20, 1, true), x, WATER_Y + h + 0.6, z, new THREE.Color(1, 0.92, 0.78).multiplyScalar(0.35));
    // ribs down the shaft
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      block(m, 0.7, h + 4, 0.7, x + Math.cos(a) * 6.2, WATER_Y + (h - 4) / 2, z + Math.sin(a) * 6.2, 0xd8d3c8);
    }
    // the footbridge to the crest
    const z0 = DAM.z0, zb = z + 6;
    block(m, 2.4, 0.6, z0 - zb, x, FLOOR - 0.3, (z0 + zb) / 2, 0xc8c4ba);
    for (const s of [-1, 1]) {
      block(steel, 0.06, 0.06, z0 - zb, x + s * 1.1, FLOOR + 0.9, (z0 + zb) / 2, 0x2f6f8f);
      for (let zz = zb; zz < z0; zz += 2) rod(steel, [x + s * 1.1, FLOOR, zz], [x + s * 1.1, FLOOR + 0.9, zz], 0.03, 0.03, 0x2f6f8f, 4);
    }
    for (let zz = zb + 6; zz < z0 - 2; zz += 9) block(m, 1.6, FLOOR - (WATER_Y - 4), 1.6, x, (FLOOR + WATER_Y - 4) / 2, zz, 0xc8c4ba);
  }
}

/** The gate house on the west abutment: deco, fluted, a clock, the year cast over the door. */
function gateHouse(m: Mesher, glow: Mesher, lamps: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[]) {
  const x = -122, z = -24, y = FLOOR;
  block(m, 22, 9, 16, x, y + 4.5, z, 0xd2cec4);
  block(m, 14, 4, 12, x, y + 11, z, 0xd8d3c8);
  block(m, 6, 5, 6, x, y + 15.5, z, 0xd2cec4);
  block(m, 7, 0.5, 7, x, y + 18.2, z, 0xc8c4ba);
  // fluting up the front
  for (let k = 0; k < 9; k++) block(m, 0.5, 8.4, 0.4, x - 8 + k * 2, y + 4.4, z + 8.1, 0xe0dcd2);
  // tall windows lit from inside, the door, the clock
  for (let k = 0; k < 4; k++) glow.at(new THREE.BoxGeometry(1.1, 5, 0.1), x - 7 + k * 4.6 + (k > 1 ? 1.2 : -1.2) * 0, y + 4.5, z + 8.05, new THREE.Color(1, 0.88, 0.6).multiplyScalar(0.35));
  block(m, 3.2, 4.4, 0.4, x, y + 2.2, z + 8.1, 0x2e4a3e);
  glow.at(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 24).rotateX(Math.PI / 2), x, y + 15.5, z + 3.06, new THREE.Color(1, 0.96, 0.85).multiplyScalar(0.6));
  lamps.push({ x, y: y + 15.5, z: z + 3.2, s: 1.6, c: new THREE.Color(1, 0.9, 0.7) });
}

// ------------------------------------------------------------------ water in motion
/** Fast water sliding over a bay of the weir, from the lake to the lip. */
function weirFlow(u: VenueUniforms, xa: number, xb: number) {
  const N = 10;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const z = DAM.z0 - 4 + f * (DAM.z1 - DAM.z0 + 4);
    // drawing down as it speeds up towards the lip
    const y = WATER_Y - (WATER_Y - (SPILL.weir + 0.5)) * smooth(0, 1, f) + 0.02;
    pos.push(xa, y, z, xb, y, z);
    uv.push(0, f, 1, f);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, flowMaterial(u, xb - xa, DAM.z1 - DAM.z0 + 4, false));
}

/**
 * One bay's curtain of water: leaving the lip glassy and green, arcing out and breaking up into
 * white streaks as it falls, down to the rocks of the gorge.
 */
function curtain(u: VenueUniforms, xa: number, xb: number, bay: number) {
  const xc = (xa + xb) / 2;
  const y0 = SPILL.weir + 0.55, v0 = 3.2;
  const land = Math.max(terrainY(xc, DAM.z1 + 4), RIVER_Y) + 0.5;
  const T = Math.sqrt((y0 - land) / 4.9);
  const S = 26, V = 6;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= S; i++) {
    const s = i / S, t = s * T;
    const y = y0 - 4.9 * t * t, z = DAM.z1 + v0 * t;
    // spreading a little as it falls
    const spread = 1 + s * 0.18;
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      const x = xc + (v - 0.5) * (xb - xa) * spread;
      pos.push(x, y, z + Math.sin(v * 9 + bay) * 0.25 * s);
      uv.push(v, s);
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, flowMaterial(u, (xb - xa) * 1.09, y0 - land, true));
  m.renderOrder = 6;
  return m;
}

/** Moving water: streaks rushing along v, glassy and green at first, breaking into white foam. */
function flowMaterial(u: VenueUniforms, w: number, len: number, falling: boolean) {
  return vMaterial(u, {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uFlow: { value: new THREE.Vector3(w, len, falling ? 1 : 0) } },
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
      uniform vec3 uFlow;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        bool falling = uFlow.z > 0.5;
        float along = vUv.y * uFlow.y;
        // falling water accelerates: its streaks stretch as they go
        float speed = falling ? 9.0 + vUv.y * 22.0 : 4.0 + vUv.y * 5.0;
        vec2 p = vec2(vUv.x * uFlow.x * 0.35, along * (falling ? 0.03 : 0.08) - uTime * speed * (falling ? 0.03 : 0.08));
        float n = texture2D(uNoise, p).r * 0.6 + texture2D(uNoise, p * vec2(3.0, 1.6) + 0.37).g * 0.4;
        float streak = texture2D(uNoise, vec2(vUv.x * uFlow.x * 0.9, p.y * 0.5)).b;
        float broken = falling ? smoothstep(0.02, 0.35, vUv.y) : smoothstep(0.75, 1.0, vUv.y) * 0.4;
        float foam = clamp(broken * (0.55 + 0.7 * n) + streak * 0.3 * broken, 0.0, 1.0);
        vec3 glassy = mix(vec3(0.08, 0.3, 0.28), vec3(0.3, 0.55, 0.5), n) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4);
        glassy += uSunCol * pow(n, 6.0) * 0.6;
        vec3 white = vec3(0.92, 0.95, 0.97) * (ambient(vec3(0.0, 0.3, 1.0)) * 1.1 + uSunCol * 0.55);
        vec3 c = mix(glassy, white, foam);
        // ragged, thinner edges; thicker, opaque in the middle
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float a = mix(0.75, 0.97, foam) * mix(0.35 + 0.5 * n, 1.0, edge);
        if (falling) a *= smoothstep(1.0, 0.9, vUv.y);
        gl_FragColor = vec4(haze(c, vW), a);
        ${V_OUT}
      }`,
  });
}

/**
 * Spray boiling up out of the gorge where the curtains land, drifting downstream on the wind, and
 * the rainbow in it: each puff lights up in the bow's colours where it sits at the rainbow's angle
 * from the point opposite the sun (as seen from wherever the camera is).
 */
function spray(u: VenueUniforms, r: () => number, low: boolean) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at: number[] = [];
  const n = low ? 70 : 140;
  for (let i = 0; i < n; i++) {
    const x = SPILL.x0 + r() * (SPILL.x1 - SPILL.x0);
    const z = DAM.z1 + 2 + r() * 10;
    at.push(x, Math.max(terrainY(x, z), RIVER_Y) + 2, z, r() * 100);
  }
  geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  geo.instanceCount = n;
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec4 aAt;
      varying vec2 vUv;
      varying vec3 vW;
      varying float vLife;
      void main() {
        float s = aAt.w;
        // each puff rises out of the plunge, swelling, and drifts off downstream, then again
        float life = fract(uTime * 0.045 + s * 0.618);
        vLife = life;
        vec3 p = aAt.xyz + vec3(sin(s * 3.1 + uTime * 0.2) * 4.0, life * 62.0, life * life * 40.0);
        float size = mix(6.0, 22.0, life);
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 w = p + (cr * position.x + cu * position.y) * size;
        vUv = position.xy + 0.5;
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec2 vUv;
      varying vec3 vW;
      varying float vLife;
      void main() {
        vec2 q = vUv - 0.5;
        float d = length(q) * 2.0;
        float n = texture2D(uNoise, vUv * 0.5 + vLife * 0.3 + vW.xz * 0.003).g;
        float a = smoothstep(1.0, 0.2, d) * (0.55 + 0.6 * n) * smoothstep(0.0, 0.12, vLife) * smoothstep(1.0, 0.55, vLife) * 0.32;
        vec3 c = vec3(0.95, 0.97, 1.0) * (ambient(vec3(0.0, 1.0, 0.0)) * 0.9 + uSunCol * 0.6);
        // the rainbow: 40-42 degrees from the antisolar point, red outside, violet in
        vec3 V = normalize(vW - cameraPosition);
        float ang = degrees(acos(clamp(dot(V, -uSunDir), -1.0, 1.0)));
        float b = (ang - 39.8) / 2.6;
        vec3 bow = clamp(vec3(1.0 - abs(b - 0.85) * 3.0, 1.0 - abs(b - 0.5) * 3.0, 1.0 - abs(b - 0.15) * 3.0), 0.0, 1.0);
        c += bow * uSunCol * 0.55 * step(0.0, b) * step(b, 1.0);
        gl_FragColor = vec4(haze(c, vW), a);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 7;
  return m;
}

// ------------------------------------------------------------------ land
/** The land all round: grass and pine needles on the gentle slopes, granite on the steep, snow up top. */
function terrainMesh(v: OutdoorVenue, low: boolean) {
  const N = low ? 120 : 180;
  const map = (k: number) => {
    const s = (k / N) * 2 - 1;
    return Math.sign(s) * Math.pow(Math.abs(s), 1.55) * 720;
  };
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const x = map(j), z = map(i);
      pos.push(x, terrainY(x, z), z);
    }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = vMaterial(v.u, {
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
      varying vec3 vW, vN;
      void main() {
        vec3 n = normalize(vN);
        vec2 p = vW.xz;
        float n1 = texture2D(uNoise, p * 0.011).g, n2 = texture2D(uNoise, p * 0.09).r, n3 = texture2D(uNoise, vec2(p.x + p.y, vW.y) * 0.05).b;
        vec3 grass = mix(vec3(0.2, 0.3, 0.1), vec3(0.36, 0.42, 0.16), n1) * (0.8 + 0.3 * n2);
        grass = mix(grass, vec3(0.3, 0.22, 0.12), smoothstep(0.55, 0.8, n2) * 0.6);
        // granite: grey, banded, stained
        vec3 rock = mix(vec3(0.42, 0.41, 0.4), vec3(0.6, 0.58, 0.55), n3) * (0.8 + 0.35 * n2);
        rock *= 0.9 + 0.1 * sin(vW.y * 1.7 + n3 * 6.0);
        float steep = smoothstep(0.78, 0.6, n.y + (n1 - 0.5) * 0.15);
        vec3 c = mix(grass, rock, steep);
        // wet rock near the river and the lake shore, snow on the peaks
        c *= mix(1.0, 0.55, smoothstep(${(RIVER_Y + 6).toFixed(1)}, ${(RIVER_Y + 0.5).toFixed(1)}, vW.y));
        c *= mix(1.0, 0.7, smoothstep(${(WATER_Y + 1.5).toFixed(1)}, ${(WATER_Y + 0.2).toFixed(1)}, vW.y) * step(vW.z, -30.0));
        float snow = smoothstep(${(FLOOR + 120).toFixed(1)}, ${(FLOOR + 150).toFixed(1)}, vW.y + n1 * 40.0) * smoothstep(0.3, 0.6, n.y);
        c = mix(c, vec3(0.92, 0.94, 0.98), snow);
        vec3 L = ambient(n) + uSunCol * max(dot(n, uSunDir), 0.0);
        gl_FragColor = vec4(haze(c * L, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** Pines on the slopes that aren't too steep: dark spires, a few dead grey ones. */
function pineForest(m: Mesher, r: () => number, n: number) {
  const trunk = new THREE.CylinderGeometry(0.12, 0.3, 1, 5);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 20) {
    const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900;
    const y = terrainY(x, z);
    // not in the water, not on the dam, not on bare cliffs
    if (z < -30 && y < WATER_Y + 1) continue;
    if (z > -30 && y < RIVER_Y + 1.5) continue;
    if (Math.abs(x) < DAM.hw + 4 && z > DAM.z0 - 4 && z < DAM.z1 + DAM.slope * (FLOOR - y) + 4) continue;
    if (Math.abs(x) < BASTION.hw + 6 && z < BASTION.z1 + 6 && z > DAM.z0) continue;
    const e = 1.5;
    const sl = Math.hypot(terrainY(x + e, z) - terrainY(x - e, z), terrainY(x, z + e) - terrainY(x, z - e)) / (2 * e);
    if (sl > 0.9 || y > FLOOR + 135) continue;
    const h = 9 + r() * 12;
    const dead = r() < 0.04;
    m.add(trunk, new THREE.Matrix4().makeScale(h * 0.08, h * 0.45, h * 0.08).setPosition(x, y + h * 0.2, z), lin(0x4a3424));
    if (!dead) {
      const c = lin([0x1f3a26, 0x2a4a2c, 0x1a3322][Math.floor(r() * 3)]).multiplyScalar(0.85 + r() * 0.3);
      m.add(cone, new THREE.Matrix4().makeScale(h * 0.22, h * 0.6, h * 0.22).setPosition(x, y + h * 0.55, z), c);
      m.add(cone, new THREE.Matrix4().makeScale(h * 0.16, h * 0.45, h * 0.16).setPosition(x, y + h * 0.8, z), c.clone().multiplyScalar(1.1));
    } else m.add(cone, new THREE.Matrix4().makeScale(h * 0.05, h * 0.5, h * 0.05).setPosition(x, y + h * 0.7, z), lin(0x8a8680));
    placed++;
  }
}

/** Snowy peaks far off, all round. */
function peaks(v: OutdoorVenue) {
  const t = new Tris();
  const R = 585, N = 180;
  const h = (a: number) => 150 + 90 * Math.max(0, Math.sin(a * 5 + 0.4)) * Math.sin(a * 2.3 + 1) + 40 * Math.abs(Math.sin(a * 13 + 2)) + 15 * Math.sin(a * 37);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const h0 = h(a0), h1 = h(a1);
    const p = (a: number, y: number): THREE.Vector3Tuple => [Math.cos(a) * R, y, Math.sin(a) * R];
    const rock = lin(0x5d6878), snow = lin(0xe8eef6);
    const mid0 = h0 * 0.72, mid1 = h1 * 0.72;
    t.quad(p(a0, FLOOR - 40), p(a1, FLOOR - 40), p(a1, FLOOR + mid1), p(a0, FLOOR + mid0), [-Math.cos(a0), 0.3, -Math.sin(a0)], rock, rock, rock.clone().multiplyScalar(1.1), rock.clone().multiplyScalar(1.1));
    t.quad(p(a0, FLOOR + mid0), p(a1, FLOOR + mid1), p(a1, FLOOR + h1), p(a0, FLOOR + h0), [-Math.cos(a0), 0.5, -Math.sin(a0)], snow.clone().multiplyScalar(0.85), snow.clone().multiplyScalar(0.85), snow, snow);
  }
  return new THREE.Mesh(t.geometry(), litMaterial(v.u, { side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------ textures
/** Concrete pavers round the ring: big slabs, their joints, weathering. */
function paverTexture() {
  return paintTexture(512, 512, (g, w, h) => {
    const r = prng(41);
    g.fillStyle = '#6e6a62';
    g.fillRect(0, 0, w, h);
    const n = 3;
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const l = 62 + r() * 10;
        g.fillStyle = `hsl(${38 + r() * 10}, ${5 + r() * 5}%, ${l}%)`;
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        for (let k = 0; k < 220; k++) {
          g.fillStyle = r() < 0.5 ? `rgba(60,58,54,${0.05 + r() * 0.1})` : `rgba(240,236,228,${0.05 + r() * 0.08})`;
          g.fillRect(i * s + 3 + r() * (s - 6), j * s + 3 + r() * (s - 6), 1 + r() * 3, 1 + r() * 3);
        }
      }
    for (let k = 0; k < 30; k++) {
      const x = r() * w, y = r() * h, rr = 8 + r() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, 'rgba(70,66,58,0.18)');
      grd.addColorStop(1, 'rgba(70,66,58,0)');
      g.fillStyle = grd;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  });
}

/** A deco name plate: bronze lettering on dark stone, stepped borders. */
function decoTexture(label: string, color: string) {
  return paintTexture(
    512,
    80,
    (g, w, h) => {
      g.fillStyle = '#1e2226';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b08a4a';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.strokeRect(14, 14, w - 28, h - 28);
      g.font = '700 42px "Futura", "Century Gothic", "Avenir Next", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 10;
      const tw = g.measureText(label).width;
      g.save();
      g.translate(w / 2, h / 2 + 2);
      g.scale(Math.min(1, (w - 70) / tw), 1);
      g.fillText(label, 0, 0);
      g.restore();
    },
    false,
  );
}

