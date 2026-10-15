import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AX,
  FLOOR,
  LOWER_ROWS,
  ROWS,
  TUNNEL_GATE,
  TUNNEL_HALL,
  TUNNEL_OPEN_H,
  TUNNEL_OPEN_HW,
  TUNNEL_ROWS,
  TUNNEL_W,
  VOM_ROW0,
  aislesAt,
  gapRuns,
  outline,
  seats,
  vomitories,
  type OutlinePt,
} from '../bowl';
import { Crowd } from '../crowd';
import { ArenaShow } from '../show';
import { contactAO } from '../ao';
import { cornerAngle } from '../ring';
import { RING_CORNER } from '../../sim/body';
import { AD_ASPECT, adAtlas } from '../ads';
import { RenderSettings } from '../settings';
import { Scoreboard, bar, gateMaterial, led, ledMaterial, type ScoreState, type VenueLike } from '../venue';
import type { LightLook } from '../stage';
import { Mesher, Tris, glowMaterial, lin, litMaterial, skyDome, venueUniforms, type Daylight, type SkyLook, type VenueUniforms } from './kit';

/**
 * The open-air venue every world map event builds on. It keeps the indoor bowl's footprint (the
 * floor round the stage, the barrier, the lower tier's rows, the tunnels east and west with their
 * gates), so the cameras, the crowd, the debris and the stretcher all work as they do indoors,
 * and puts it under the sky: a sky dome, daylight on the fans, a lit floor, scoreboard screens.
 * Each venue then dresses it (render/venues/*.ts).
 */

type Vec3 = THREE.Vector3Tuple;

export interface StandStyle {
  /** A tread's colour: row, piece along it (for plank-to-plank variation), where. */
  tread: (ri: number, k: number, x: number, z: number) => THREE.Color;
  riser: (ri: number) => THREE.Color;
  /** The front wall, the tunnels' sides and the back of the stands. */
  wall: THREE.Color;
  /** The half steps up the aisles. */
  aisle: THREE.Color;
  /** The rail along the top, or none. */
  rail?: THREE.Color;
  /** Height of the wall behind the top row. */
  parapet?: number;
}

export interface OutdoorSpec {
  day: Daylight;
  sky: SkyLook;
  look: LightLook;
  floor: { map: THREE.Texture; metres: number; roughness?: number; color?: number };
  stands: StandStyle;
  /** How much daylight lights the fans (0..1), and its colour and strength. */
  crowd: { day: number; light: number; k: number };
  /** Ground height all round the outside of the stands (debris lands on it). */
  outer: number;
  /** The tunnels' halls: how bright their surfaces are and their tint. */
  hall: { base: number; tint: number };
}

/** The lighting of an open-air venue: the key spot stands in for the sun, coming from its side. */
export function sunLook(
  d: Daylight,
  o: { fogDensity: number; env: number; hemi: [number, number, number]; key: number; keyCol?: number; rims: [number, number, number, number] },
): LightLook {
  const s = d.sun.clone().normalize().multiplyScalar(16);
  return {
    background: d.haze,
    fog: d.haze,
    fogDensity: o.fogDensity,
    envIntensity: o.env,
    hemi: { sky: o.hemi[0], ground: o.hemi[1], intensity: o.hemi[2] },
    key: { color: o.keyCol ?? d.sunCol, intensity: o.key, pos: [s.x, Math.max(6, s.y), s.z], target: [0, 0, 0], angle: 0.56, penumbra: 0.75, near: 8, far: 27, focus: 0.62 },
    rims: [
      { color: o.rims[0], intensity: o.rims[1], distance: 14, pos: [-5.5, 3.5, -2] },
      { color: o.rims[2], intensity: o.rims[3], distance: 14, pos: [5.5, 3.5, 2] },
    ],
  };
}

const TEAM = [new THREE.Color(0xff7a1f), new THREE.Color(0x3fe0ff)];
/** How deep the lower tier goes (to the back of its top row). */
export const STANDS_D = ROWS[LOWER_ROWS - 1].d + ROWS[LOWER_ROWS - 1].depth;
export const STANDS_TOP = ROWS[LOWER_ROWS - 1].y;
const TUNNEL_D = ROWS[TUNNEL_ROWS].d;
const TUNNEL_H = ROWS[TUNNEL_ROWS].y - FLOOR;

export class OutdoorVenue implements VenueLike {
  readonly group = new THREE.Group();
  readonly crowd: Crowd;
  readonly floorMesh: THREE.Mesh;
  readonly look: LightLook;
  readonly far: number = 900;
  readonly beams = false;
  readonly outer: number;
  readonly u: VenueUniforms;
  protected show: ArenaShow;
  /** Shared matte scenery and glow materials. */
  protected lit: THREE.ShaderMaterial;
  protected glow: THREE.ShaderMaterial;
  /** The tops of the four stairwell blocks mid-way along each side (venues put something on them). */
  protected vomTops: { x: number; y: number; z: number; nx: number; nz: number }[] = [];
  /** Per-frame animation the venue adds. */
  protected tick: ((dt: number, t: number) => void)[] = [];
  private board = new Scoreboard();
  private screenMat: THREE.MeshBasicMaterial;
  private gates: THREE.ShaderMaterial[] = [];
  private flash = 0;

  constructor(
    protected quality: 'low' | 'med' | 'high',
    arena: { uTime: { value: number }; uHype: { value: number } },
    spec: OutdoorSpec,
  ) {
    const g = this.group;
    this.u = venueUniforms(spec.day, arena);
    this.look = spec.look;
    this.outer = spec.outer;
    g.add(skyDome(this.u, spec.sky));
    this.lit = litMaterial(this.u, { grain: 0.1 });
    this.glow = glowMaterial(this.u);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.board.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.3)), toneMapped: false });
    this.floorMesh = this.buildFloor(spec.floor);
    g.add(this.floorMesh);
    this.buildBarrier(spec.stands);
    this.buildStands(spec.stands);
    this.buildTunnels(spec);
    this.show = new ArenaShow(quality, arena, false);
    g.add(this.show.group);
    this.crowd = new Crowd(
      seats().filter((s) => s.row < LOWER_ROWS),
      quality,
      { uTime: arena.uTime, uHype: arena.uHype, uFlash: this.u.uFlash },
      { day: spec.crowd.day, light: lin(spec.crowd.light, spec.crowd.k) },
    );
    // no follow spots out here (a spot's radius of 0 would be undefined in the shader)
    for (const s of this.crowd.spots) s.set(0, -999, 1, 0);
    g.add(this.crowd.group);
  }

  // ---------------------------------------------------------------- floor
  /** The floor round the stage and down both tunnels: lit, and the robots' shadows land on it. */
  private buildFloor(f: OutdoorSpec['floor']) {
    const shape = new THREE.Shape(outline(-0.6).map((p) => new THREE.Vector2(p.x, -p.z)));
    const foot = RING_CORNER + 0.75 + 0.19;
    shape.holes.push(new THREE.Path(Array.from({ length: 8 }, (_, i) => new THREE.Vector2(Math.cos(cornerAngle(i)) * foot, -Math.sin(cornerAngle(i)) * foot))));
    const parts = [new THREE.ShapeGeometry(shape, 4)];
    for (const sx of [-1, 1]) {
      const x0 = sx * (AX - 0.7), x1 = sx * (AX + TUNNEL_HALL);
      const lane = new THREE.Shape([
        new THREE.Vector2(x0, -TUNNEL_OPEN_HW),
        new THREE.Vector2(x1, -TUNNEL_OPEN_HW),
        new THREE.Vector2(x1, TUNNEL_OPEN_HW),
        new THREE.Vector2(x0, TUNNEL_OPEN_HW),
      ]);
      parts.push(new THREE.ShapeGeometry(lane));
    }
    const geo = mergeGeometries(parts)!;
    geo.rotateX(-Math.PI / 2);
    f.map.repeat.set(1 / f.metres, 1 / f.metres);
    const mat = contactAO.patch(new THREE.MeshStandardMaterial({ map: f.map, color: f.color ?? 0xffffff, roughness: f.roughness ?? 0.9, metalness: 0 }), {
      stage: { r0: 5.9, r1: 8.2, k: 0.75 },
      floor: true,
      direct: 0.8,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.position.y = FLOOR;
    floor.receiveShadow = true;
    return floor;
  }

  // ---------------------------------------------------------------- barrier
  /** LED ad boards round the floor (open at the tunnel mouths), capped. */
  private buildBarrier(st: StandStyle) {
    const ads = ledMaterial(adAtlas(), true);
    ads.side = THREE.DoubleSide;
    ads.uniforms.uTime = this.u.uTime;
    ads.uniforms.uHype = this.u.uHype;
    ads.uniforms.uFlash = this.u.uFlash;
    const o = outline(-0.6);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const run of gapRuns(o)) {
      const base = pos.length / 3;
      run.forEach((p, i) => {
        pos.push(p.x, FLOOR + 0.05, p.z, p.x, 0.42, p.z);
        uv.push(p.s, 0, p.s, 1);
        if (i < run.length - 1) {
          const k = base + i * 2;
          idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const total = o[o.length - 1].s;
    const len = (0.42 - FLOOR - 0.05) * AD_ASPECT;
    this.group.add(new THREE.Mesh(led(geo, total / Math.max(1, Math.round(total / len)), 0, 0.9), ads));
    const t = new Tris();
    const a = gapRuns(outline(-0.6)), b = gapRuns(outline(-0.35));
    a.forEach((r, k) => band(t, r, 0.42, b[k], 0.42, () => [0, 1, 0], () => st.wall));
    this.group.add(new THREE.Mesh(t.geometry(), this.lit));
  }

  // ---------------------------------------------------------------- stands
  private buildStands(st: StandStyle) {
    const t = new Tris();
    const inward = (p: OutlinePt): Vec3 => [-p.nx, 0, -p.nz];
    const outward = (p: OutlinePt): Vec3 => [p.nx, 0, p.nz];
    const up = (): Vec3 => [0, 1, 0];
    const runs = (d: number, cut: boolean) => (cut ? gapRuns(outline(d), TUNNEL_W / 2) : [outline(d)]);
    const pairs = (d0: number, d1: number, cut: boolean) => {
      const a = runs(d0, cut), b = runs(d1, cut);
      return a.map((r, k) => [r, b[k]] as const);
    };
    const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
    // the front wall up to the first row
    for (const [a, b] of pairs(0, 0, true)) band(t, a, FLOOR, b, ROWS[0].y, inward, (_k, _p, v) => shade(st.wall, 0.7 + 0.3 * v));
    ROWS.slice(0, LOWER_ROWS).forEach((r, ri) => {
      const cut = ri < TUNNEL_ROWS;
      // the tread, darker into the corner at its back
      for (const [a, b] of pairs(r.d, r.d + r.depth, cut)) band(t, a, r.y, b, r.y, up, (k, p, v) => shade(st.tread(ri, k, p.x, p.z), 1 - 0.28 * v));
      if (ri === LOWER_ROWS - 1) return;
      // the riser up to the next row, darker at its foot
      for (const [a, b] of pairs(r.d + r.depth, r.d + r.depth, cut)) band(t, a, r.y, b, r.y + r.rise, inward, (_k, _p, v) => shade(st.riser(ri), 0.6 + 0.4 * v));
    });
    // the wall behind the top row, its coping, and its outside down to the ground
    const top = STANDS_TOP, par = st.parapet ?? 1.0;
    const back = outline(STANDS_D), backOut = outline(STANDS_D + 0.3);
    band(t, back, top, back, top + par, inward, (_k, _p, v) => shade(st.wall, 0.75 + 0.25 * v));
    band(t, back, top + par, backOut, top + par, up, () => st.wall);
    band(t, backOut, this.outer - 0.5, backOut, top + par, outward, (_k, _p, v) => shade(st.wall, 0.55 + 0.35 * v));
    // the aisles: a half step in every row, its edge picked out
    ROWS.slice(0, LOWER_ROWS - 1).forEach((row, ri) => {
      const dm = row.d + row.depth / 2, ym = row.y + row.rise / 2;
      for (const a of aislesAt(ri, 0)) {
        const tx = -a.nz * 0.48, tz = a.nx * 0.48;
        const P = (d: number, y: number, s: number): Vec3 => [a.x + a.nx * d + tx * s, y, a.z + a.nz * d + tz * s];
        t.quad(P(dm, row.y, -1), P(dm, row.y, 1), P(dm, ym, 1), P(dm, ym, -1), [-a.nx, 0, -a.nz], shade(st.aisle, 0.7));
        t.quad(P(dm, ym, -1), P(dm, ym, 1), P(row.d + row.depth, ym, 1), P(row.d + row.depth, ym, -1), [0, 1, 0], st.aisle);
      }
    });
    this.group.add(new THREE.Mesh(t.geometry(), this.lit));

    // the stairwell blocks mid-way along each side, and the rail along the top
    const m = new Mesher();
    for (const v of vomitories()) {
      if (v.row0 !== VOM_ROW0) continue;
      const depth = ROWS[v.row1].d - ROWS[v.row0].d;
      const y0 = ROWS[v.row0 - 1].y, y1 = ROWS[v.row1].y;
      const along = v.nx !== 0;
      const w = 2.6 + 0.4;
      const cx = v.x + (v.nx * depth) / 2, cz = v.z + (v.nz * depth) / 2;
      m.at(new THREE.BoxGeometry(along ? depth : w, y1 - y0, along ? w : depth), cx, (y0 + y1) / 2, cz, st.wall);
      this.vomTops.push({ x: v.x + v.nx * depth * 0.5, y: y1, z: v.z + v.nz * depth * 0.5, nx: v.nx, nz: v.nz });
    }
    if (st.rail) {
      const o = outline(STANDS_D - 0.15);
      for (let i = 0; i < o.length - 1; i++) {
        m.add(bar(o[i].x, top + par + 0.95, o[i].z, o[i + 1].x, top + par + 0.95, o[i + 1].z, 0.05), IDENTITY, st.rail);
        if (i % 2 === 0) m.add(bar(o[i].x, top + par, o[i].z, o[i].x, top + par + 0.95, o[i].z, 0.04), IDENTITY, st.rail);
      }
    }
    this.group.add(new THREE.Mesh(m.geometry(), this.lit));
  }

  // ---------------------------------------------------------------- tunnels
  /**
   * The two tunnels under the stands, as indoors: their walls and lintel, a dark hall ribbed with
   * team-coloured light, and the energy gate whatever leaves goes through. Venues frame the mouths.
   */
  private buildTunnels(spec: OutdoorSpec) {
    const HW = TUNNEL_OPEN_HW, OH = TUNNEL_OPEN_H, HD = TUNNEL_HALL;
    const sideW = TUNNEL_W / 2 - HW;
    const blocks = new Mesher();
    const hall = new Mesher();
    const leds = new Mesher();
    const tint = lin(spec.hall.tint);
    const tbox = (m: Mesher, sx: number, u0: number, u1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color) =>
      m.at(new THREE.BoxGeometry(u1 - u0, y1 - y0, Math.abs(z1 - z0)), sx * (AX + (u0 + u1) / 2), FLOOR + (y0 + y1) / 2, (z0 + z1) / 2, c);
    const dark = (u: number, k: number) => tint.clone().multiplyScalar(spec.hall.base * k * (1 - 0.75 * Math.min(1, u / HD)));
    for (const sx of [-1, 1]) {
      const team = TEAM[sx < 0 ? 0 : 1];
      for (const sz of [-1, 1]) tbox(blocks, sx, 0, TUNNEL_D, 0, TUNNEL_H, sz * HW, sz * (HW + sideW), spec.stands.wall);
      tbox(blocks, sx, 0, TUNNEL_D, OH, TUNNEL_H, -HW, HW, spec.stands.wall);
      // the hall, darker the deeper in: ceiling, walls, far wall, ribs every 1.2 m
      for (let u = 0; u < HD; u += 1.2) {
        const u1 = Math.min(HD, u + 1.2);
        tbox(hall, sx, u, u1, OH - 0.02, OH, -HW, HW, dark(u, 0.6));
        for (const sz of [-1, 1]) tbox(hall, sx, u, u1, 0, OH, sz * HW, sz * (HW + 0.02), dark(u, 0.9));
        for (const sz of [-1, 1]) tbox(hall, sx, u + 0.53, u + 0.67, 0, OH, sz * (HW - 0.1), sz * HW, dark(u, 1.3));
        tbox(hall, sx, u + 0.53, u + 0.67, OH - 0.12, OH, -HW, HW, dark(u, 1.1));
      }
      tbox(hall, sx, HD - 0.02, HD, 0, OH, -HW, HW, dark(HD, 0.4));
      // a ring of team light on every rib, racing towards the gate, and runway lights on the floor
      for (let u = 0.6; u < TUNNEL_GATE + 0.1; u += 1.2) {
        const k = RenderSettings.glow(1.2) * (1.1 - (0.45 * u) / TUNNEL_GATE);
        const c = team.clone().multiplyScalar(k);
        for (const sz of [-1, 1]) tbox(leds, sx, u - 0.03, u + 0.03, 0.15, OH - 0.12, sz * (HW - 0.115), sz * (HW - 0.1), c);
        tbox(leds, sx, u - 0.03, u + 0.03, OH - 0.135, OH - 0.12, -HW + 0.1, HW - 0.1, c);
        for (const sz of [-1, 1]) tbox(leds, sx, u - 0.07, u + 0.07, 0.003, 0.02, sz * 1.36 - 0.03, sz * 1.36 + 0.03, new THREE.Color(1, 1, 1).multiplyScalar(k * 0.8));
      }
      const gate = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, OH), gateMaterial(team, this.u.uTime, HW, OH));
      gate.position.set(sx * (AX + TUNNEL_GATE), FLOOR + OH / 2, 0);
      gate.rotation.y = -sx * (Math.PI / 2);
      this.gates.push(gate.material as THREE.ShaderMaterial);
      this.group.add(gate);
    }
    this.group.add(new THREE.Mesh(blocks.geometry(), this.lit));
    this.group.add(new THREE.Mesh(hall.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(leds.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }

  // ---------------------------------------------------------------- for the venues
  /** A big screen showing the fight (the scoreboard's picture), facing `rotY`, with a dark back. */
  protected screen(x: number, y: number, z: number, rotY: number, w = 7.2, h = 4.05, frame = new THREE.Color(0x15181f)) {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.screenMat));
    const back = new Mesher().at(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.4), 0, 0, -0.21, frame);
    s.add(new THREE.Mesh(back.geometry(), this.lit));
    s.position.set(x, y, z);
    s.rotation.y = rotY;
    this.group.add(s);
    return s;
  }

  /** Add a merged set of matte props (with the shared material unless another is given). */
  protected props(m: Mesher, mat: THREE.Material = this.lit) {
    if (m.empty) return null;
    const mesh = new THREE.Mesh(m.geometry(), mat);
    this.group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- VenueLike
  setPixelScale(h: number) {
    this.crowd.setPixelScale(h);
    this.show.setPixelScale(h);
  }

  event(type: string, data?: unknown) {
    this.crowd.event(type, data);
    this.show.event(type, data);
  }

  score(dt: number, s: ScoreState | null) {
    this.board.update(dt, s);
    this.show.setPhase(s ? s.phase : 'menu', s?.presenting ?? -1);
  }

  gateHit(p: THREE.Vector3 | null) {
    for (let i = 0; i < this.gates.length; i++) {
      const u = this.gates[i].uniforms.uHit.value as THREE.Vector4;
      const gx = (i === 0 ? -1 : 1) * (AX + TUNNEL_GATE);
      const near = p && Math.sign(p.x) === Math.sign(gx) ? Math.max(0, 1 - Math.abs(p.x - gx) / 1.8) : 0;
      if (p && near > 0) u.set(gx, p.y + 0.3, p.z, near);
      else u.w = 0;
    }
  }

  strobe(k: number) {
    this.flash = Math.min(1, this.flash + k);
  }

  update(dt: number, time: number, hype: number) {
    this.show.update(dt, time, hype);
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.u.uFlash.value = this.flash;
    for (const f of this.tick) f(dt, time);
  }
}

const IDENTITY = new THREE.Matrix4();

/**
 * A strip between two matching outlines (a at height ya, b at yb), facing `n`, cut into pieces no
 * longer than `step` metres (so long straight sides can vary plank by plank); `col` gets the
 * piece's number, the point and which edge (0 = a, 1 = b).
 */
export function band(
  t: Tris,
  a: OutlinePt[],
  ya: number,
  b: OutlinePt[],
  yb: number,
  n: (p: OutlinePt) => Vec3,
  col: (k: number, p: OutlinePt, v: number) => THREE.Color,
  step = 1.1,
) {
  const lerp = (p: OutlinePt, q: OutlinePt, f: number): OutlinePt => ({
    x: p.x + (q.x - p.x) * f,
    z: p.z + (q.z - p.z) * f,
    nx: p.nx + (q.nx - p.nx) * f,
    nz: p.nz + (q.nz - p.nz) * f,
    s: p.s + (q.s - p.s) * f,
  });
  let k = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const pieces = Math.max(1, Math.ceil(Math.hypot(a[i + 1].x - a[i].x, a[i + 1].z - a[i].z) / step));
    for (let j = 0; j < pieces; j++, k++) {
      const p = lerp(a[i], a[i + 1], j / pieces), q = lerp(a[i], a[i + 1], (j + 1) / pieces);
      const pb = lerp(b[i], b[i + 1], j / pieces), qb = lerp(b[i], b[i + 1], (j + 1) / pieces);
      const mid = lerp(p, q, 0.5);
      t.quad([p.x, ya, p.z], [q.x, ya, q.z], [qb.x, yb, qb.z], [pb.x, yb, pb.z], n(mid), col(k, p, 0), col(k, q, 0), col(k, qb, 1), col(k, pb, 1));
    }
  }
}
