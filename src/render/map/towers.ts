import * as THREE from 'three';
import { CITY_Y } from './layout';
import { ARCOLOGY, HOLO_PLAZA, MEGA, NEON } from './plan';
import { AA_GLSL, MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';

/**
 * The four mega-towers in the middle of downtown, each its own shape, standing far over the rest
 * of the skyline:
 *
 * - the Spire: a chamfered glass shaft twisting a third of a turn as it tapers to a point, neon
 *   ribs up its corners and lit sky lobbies every hundred-odd metres;
 * - the Arcology: blocks stacked off-centre with gardens on every terrace, warm windows, a lit gap
 *   between each block, a glowing dome on top and a giant screen on its face;
 * - the Needle: a round tower with running lights up its fins, a screen wrapped right round it and
 *   three halo decks, narrowing to a needle;
 * - the Monolith: a dark leaning slab with light strips running down it and a huge screen.
 *
 * All of it is one mesh with one shader that draws the windows, ribs, screens and gardens itself,
 * plus searchlights sweeping the sky (bright at night) and skybridges between two of them.
 */

type V3 = [number, number, number];
type P2 = [number, number];

/** What a face is: drawn differently by the shader. */
const K = { Facade: 0, Frame: 1, Neon: 2, Garden: 3, Screen: 4, Lit: 5 } as const;

/** One mesh's worth of faces with what the tower shader needs per vertex. */
class Shell {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  info: number[] = [];
  /** Current face kind, its neon index (or lamp/screen parameter), seed and variant. */
  private k: [number, number, number, number] = [0, 0, 0, 0];
  private c = new THREE.Color();

  set(kind: number, col: number, neon = 0, variant = 0, seed = 0) {
    this.k = [kind, neon, seed, variant];
    this.c.setHex(col);
    return this;
  }

  /** A triangle wound to face along `hint`; uvs are (u, v, face width). */
  tri(a: V3, b: V3, c: V3, ua: V3, ub: V3, uc: V3, hint: V3) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
      n = [-n[0], -n[1], -n[2]];
    }
    for (const [p, q] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.uv.push(q[0], q[1], q[2]);
      this.info.push(...this.k);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: V3, ub: V3, uc: V3, ud: V3, hint: V3) {
    this.tri(a, b, c, ua, ub, uc, hint);
    this.tri(a, c, d, ua, uc, ud, hint);
  }

  /**
   * The walls of a prism round (cx, cz) from y0 to y1, its cross-section (relative to the centre,
   * any winding) at each height given by `section` (so it can twist and taper), in `rings` steps.
   * `wrap`: one continuous facade round it (a round tower) rather than a face per side.
   * `cap`: a roof over the top (kind and colour).
   */
  prism(cx: number, cz: number, y0: number, y1: number, section: (y: number) => P2[], o: { rings?: number; wrap?: boolean; base?: number; cap?: [number, number] } = {}) {
    const rings = o.rings ?? 1;
    const base = o.base ?? CITY_Y;
    let prev: { y: number; p: P2[] } | null = null;
    const perim = (p: P2[]) => p.reduce((s, a, k) => s + Math.hypot(p[(k + 1) % p.length][0] - a[0], p[(k + 1) % p.length][1] - a[1]), 0);
    for (let i = 0; i <= rings; i++) {
      const y = y0 + ((y1 - y0) * i) / rings;
      const p = section(y);
      if (prev) {
        const n = p.length;
        // (wrapped round: the face is the whole way round)
        const P0 = perim(prev.p), P1 = perim(p);
        let ua = 0, ub = 0;
        for (let k = 0; k < n; k++) {
          const a0 = prev.p[k], b0 = prev.p[(k + 1) % n], a1 = p[k], b1 = p[(k + 1) % n];
          const l0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), l1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
          // outward: from the axis through the middle of the face
          const mx = (a0[0] + b0[0] + a1[0] + b1[0]) / 4, mz = (a0[1] + b0[1] + a1[1] + b1[1]) / 4;
          const ml = Math.hypot(mx, mz) || 1;
          const hint: V3 = [mx / ml, 0, mz / ml];
          const W0 = o.wrap ? P0 : l0, W1 = o.wrap ? P1 : l1;
          const u0a = o.wrap ? ua : 0, u0b = o.wrap ? ua + l0 : l0;
          const u1a = o.wrap ? ub : 0, u1b = o.wrap ? ub + l1 : l1;
          this.quad(
            [cx + a0[0], prev.y, cz + a0[1]],
            [cx + b0[0], prev.y, cz + b0[1]],
            [cx + b1[0], y, cz + b1[1]],
            [cx + a1[0], y, cz + a1[1]],
            [u0a, prev.y - base, W0],
            [u0b, prev.y - base, W0],
            [u1b, y - base, W1],
            [u1a, y - base, W1],
            hint,
          );
          ua += l0;
          ub += l1;
        }
      }
      prev = { y, p };
    }
    if (o.cap && prev) {
      const keep = this.k.slice() as [number, number, number, number], kc = this.c.getHex();
      this.set(o.cap[0], o.cap[1], 0, keep[3], keep[2]);
      const p = prev.p, y = prev.y;
      for (let k = 0; k < p.length; k++) {
        const a = p[k], b = p[(k + 1) % p.length];
        this.tri([cx, y, cz], [cx + a[0], y, cz + a[1]], [cx + b[0], y, cz + b[1]], [0, 0, 1], [a[0], a[1], 1], [b[0], b[1], 1], [0, 1, 0]);
      }
      this.set(keep[0], kc, keep[1], keep[3], keep[2]);
    }
    return this;
  }

  /** A flat ring (a halo deck): top, underside, outer and inner edges, the edges in `edge` kind. */
  ring(cx: number, cz: number, y: number, rIn: number, rOut: number, th: number, edge: [number, number, number]) {
    const N = 40;
    const keep = this.k.slice() as [number, number, number, number], kc = this.c.getHex();
    const at = (a: number, r: number, yy: number): V3 => [cx + Math.cos(a) * r, yy, cz + Math.sin(a) * r];
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const u0 = a0 * rOut, u1 = a1 * rOut;
      this.set(keep[0], kc, keep[1], keep[3], keep[2]);
      this.quad(at(a0, rIn, y), at(a1, rIn, y), at(a1, rOut, y), at(a0, rOut, y), [u0, 0, 1], [u1, 0, 1], [u1, 1, 1], [u0, 1, 1], [0, 1, 0]);
      this.quad(at(a0, rIn, y - th), at(a1, rIn, y - th), at(a1, rOut, y - th), at(a0, rOut, y - th), [u0, 0, 1], [u1, 0, 1], [u1, 1, 1], [u0, 1, 1], [0, -1, 0]);
      this.set(edge[0], edge[1], edge[2], keep[3], keep[2]);
      const mid = (a0 + a1) / 2;
      this.quad(at(a0, rOut, y - th), at(a1, rOut, y - th), at(a1, rOut, y), at(a0, rOut, y), [u0, 0, 1e4], [u1, 0, 1e4], [u1, th, 1e4], [u0, th, 1e4], [Math.cos(mid), 0, Math.sin(mid)]);
      this.quad(at(a0, rIn, y - th), at(a1, rIn, y - th), at(a1, rIn, y), at(a0, rIn, y), [u0, 0, 1e4], [u1, 0, 1e4], [u1, th, 1e4], [u0, th, 1e4], [-Math.cos(mid), 0, -Math.sin(mid)]);
    }
    this.set(keep[0], kc, keep[1], keep[3], keep[2]);
    return this;
  }

  /** A box w (x) by d (z), turned by rot, from y0 to y1, roofed. */
  box(cx: number, cz: number, w: number, d: number, y0: number, y1: number, rot = 0, cap: [number, number] | undefined = undefined) {
    return this.prism(cx, cz, y0, y1, () => rect(w, d, rot), { cap });
  }

  /** A flat screen facing along `rot` (0: +z), its centre at (x, y, z): w across, h high. */
  screen(x: number, y: number, z: number, w: number, h: number, rot: number) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const tx = c, tz = -s;
    const p = (u: number, v: number): V3 => [x + tx * (u - w / 2), y + v - h / 2, z + tz * (u - w / 2)];
    this.quad(p(0, 0), p(w, 0), p(w, h), p(0, h), [0, 0, w], [w, 0, w], [w, h, w], [0, h, w], [s, 0, c]);
    return this;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.info, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** A w×d rectangle turned by rot. */
function rect(w: number, d: number, rot = 0, ox = 0, oz = 0): P2[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as P2[]
  ).map(([x, z]) => [ox + x * c + z * s, oz - x * s + z * c]);
}

/** A square of side `w` with its corners cut back by `ch`, turned by rot. */
function chamfered(w: number, ch: number, rot: number): P2[] {
  const h = w / 2, c = Math.cos(rot), s = Math.sin(rot);
  const p: P2[] = [
    [-h + ch, -h],
    [h - ch, -h],
    [h, -h + ch],
    [h, h - ch],
    [h - ch, h],
    [-h + ch, h],
    [-h, h - ch],
    [-h, -h + ch],
  ];
  return p.map(([x, z]) => [x * c + z * s, -x * s + z * c]);
}

const circle = (r: number, n: number, rot = 0): P2[] => Array.from({ length: n }, (_, k) => [Math.cos(rot + (k / n) * Math.PI * 2) * r, Math.sin(rot + (k / n) * Math.PI * 2) * r]);

// ------------------------------------------------------------------ the towers
const Y0 = CITY_Y + 16;

function spire(m: Shell) {
  const { x, z } = MEGA.spire;
  const top = 476;
  const twist = (y: number) => ((y - Y0) / 600) * 1.95;
  const scale = (y: number) => 1 - 0.42 * Math.pow(Math.max(0, y - Y0) / (top - Y0), 1.3);
  const W = 42, CH = 7;
  const sec = (k = 1) => (y: number) => chamfered(W * scale(y) * k, CH * scale(y) * k, twist(y));
  // the shaft in four lengths, a lit sky lobby (ringed with neon) between each
  const lobbies = [150, 290, 420];
  let y = Y0;
  for (const ly of [...lobbies, top]) {
    m.set(K.Facade, 0x5d8aa6, 1, 0, 0.21).prism(x, z, y, ly, sec(), { rings: Math.ceil((ly - y) / 18) });
    if (ly === top) break;
    m.set(K.Lit, 0xbfe6ff).prism(x, z, ly, ly + 6, sec(0.9), { rings: 1 });
    m.set(K.Neon, 0x000000, 1).prism(x, z, ly - 0.8, ly, sec(1.025), { rings: 1, cap: [K.Frame, 0x9aa4ad] });
    m.set(K.Neon, 0x000000, 1).prism(x, z, ly + 6, ly + 6.8, sec(1.025), { rings: 1, cap: [K.Frame, 0x9aa4ad] });
    y = ly + 6;
  }
  // the crown: tapering on to a point, still twisting
  const k0 = scale(top);
  m.set(K.Facade, 0x5d8aa6, 0, 0, 0.37).prism(x, z, top, 562, (yy) => {
    const t = (yy - top) / (562 - top);
    const k = k0 * (1 - t) * (1 - t * 0.3) + 0.04;
    return chamfered(W * k, CH * k, twist(yy));
  }, { rings: 8 });
  // the mast
  m.set(K.Frame, 0xd8dde2).prism(x, z, 550, MEGA.spire.top, (yy) => circle(1.4 - ((yy - 550) / 54) * 1.0, 6), { rings: 1 });
}

function arcology(m: Shell) {
  const { x, z } = MEGA.arcology;
  ARCOLOGY.forEach((b, i) => {
    const cx = x + b.dx, cz = z + b.dz;
    m.set(K.Facade, [0xe3d2b8, 0xd8c8b0, 0xe8dcc8, 0xd2c2ac, 0xe0d6c4][i], 2, 1, 0.13 + i * 0.17).box(cx, cz, b.w, b.d, b.y0, b.y1, b.rot, [K.Garden, 0x5f8a3c]);
    // neon round the terrace's edge
    m.set(K.Neon, 0x000000, i % 2 ? 0 : 1).prism(cx, cz, b.y1 - 0.7, b.y1 + 1.1, () => rect(b.w + 0.5, b.d + 0.5, b.rot), { rings: 1 });
    // the lit gap up to the next block
    const up = ARCOLOGY[i + 1];
    if (up) m.set(K.Lit, 0xffc98a).box(x + up.dx, z + up.dz, up.w * 0.86, up.d * 0.86, b.y1, up.y0, up.rot);
  });
  // a giant screen on the second block's south face
  const b = ARCOLOGY[1];
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const fx = x + b.dx + s * (b.d / 2 + 0.4), fz = z + b.dz + c * (b.d / 2 + 0.4);
  m.set(K.Screen, 0x000000, 0, 52, 0.61).screen(fx, (b.y0 + b.y1) / 2 + 4, fz, b.w * 0.72, 52, b.rot);
  // a glass dome full of garden on top, and a mast
  const t = ARCOLOGY[ARCOLOGY.length - 1];
  const R = 9.5;
  m.set(K.Lit, 0x9dffb8).prism(x + t.dx, z + t.dz, t.y1, t.y1 + R, (yy) => circle(Math.sqrt(Math.max(0.2, R * R - (yy - t.y1) * (yy - t.y1))), 16), { rings: 5 });
  m.set(K.Frame, 0xd8dde2).prism(x, z, t.y1 + R - 1, MEGA.arcology.top, (yy) => circle(1.2 - ((yy - t.y1) / 60) * 0.7, 6), { rings: 1 });
}

/** The Needle's radius at a height. */
const needleR = (y: number) => 21 - ((y - Y0) / (400 - Y0)) * 8;

function needle(m: Shell) {
  const { x, z } = MEGA.needle;
  // the tower, in two lengths round the wrapped screen
  m.set(K.Facade, 0x7aa0b8, 1, 2, 0.47).prism(x, z, Y0, 118, (y) => circle(needleR(y), 28), { rings: 4, wrap: true });
  // (its seam round the back, to the north)
  m.set(K.Screen, 0x000000, 0, 44, 0.29).prism(x, z, 118, 162, (y) => circle(needleR(y) + 1.4, 28, -Math.PI / 2), { rings: 1, wrap: true, base: 118 });
  m.set(K.Neon, 0x000000, 0).prism(x, z, 116.8, 118, (y) => circle(needleR(y) + 1.8, 28), { rings: 1, cap: [K.Frame, 0x8f979f] });
  m.set(K.Neon, 0x000000, 0).prism(x, z, 162, 163.2, (y) => circle(needleR(y) + 1.8, 28), { rings: 1, cap: [K.Frame, 0x8f979f] });
  m.set(K.Facade, 0x7aa0b8, 1, 2, 0.47).prism(x, z, 162, 400, (y) => circle(needleR(y), 28), { rings: 8, wrap: true });
  // the halo decks
  for (const [y, r, n] of [
    [212, 38, 1],
    [302, 33, 3],
    [384, 28, 1],
  ] as const) {
    m.set(K.Frame, 0xe6eaee);
    m.ring(x, z, y, needleR(y) - 0.5, r, 2.2, [K.Neon, 0x000000, n]);
    // the deck's glazed rim lit from inside
    m.set(K.Lit, 0xcff4ff).prism(x, z, y, y + 3, () => circle(r - 1.5, 40), { rings: 1, wrap: true });
  }
  // the needle
  m.set(K.Neon, 0x000000, 1).prism(x, z, 398.8, 401.2, () => circle(needleR(400) + 0.8, 28), { rings: 1, cap: [K.Frame, 0x8f979f] });
  m.set(K.Facade, 0x7aa0b8, 1, 2, 0.83).prism(x, z, 401.2, 505, (y) => circle(needleR(400) * (1 - ((y - 401) / 104) * 0.88), 14), { rings: 4, wrap: true });
  m.set(K.Frame, 0xd8dde2).prism(x, z, 500, MEGA.needle.top, (y) => circle(1.1 - ((y - 500) / 32) * 0.8, 6), { rings: 1 });
}

const MONO_ROT = 0.35;

function monolith(m: Shell) {
  const { x, z } = MEGA.monolith;
  const H = 396;
  // a dark slab, its long faces leaning in as it rises
  const slab = (y: number) => rect(56, 24 * (1 - ((y - Y0) / (H - Y0)) * 0.2), MONO_ROT);
  m.set(K.Facade, 0x2a2e36, 2, 3, 0.57).prism(x, z, Y0, H, slab, { rings: 6, cap: [K.Frame, 0x30343a] });
  // a stepped top
  const c = Math.cos(MONO_ROT), s = Math.sin(MONO_ROT);
  m.set(K.Facade, 0x2a2e36, 0, 3, 0.91).prism(x + c * 7, z - s * 7, H, 428, () => rect(36, 15, MONO_ROT), { rings: 1, cap: [K.Frame, 0x30343a] });
  m.set(K.Neon, 0x000000, 0).prism(x + c * 7, z - s * 7, 427, 429, () => rect(36.6, 15.6, MONO_ROT), { rings: 1 });
  // the screen on the south face
  const d = (24 * (1 - ((225 - Y0) / (H - Y0)) * 0.2)) / 2 + 0.6;
  m.set(K.Screen, 0x000000, 0, 112, 0.77).screen(x + s * d, 225, z + c * d, 42, 112, MONO_ROT);
}

/** Two glass bridges between the Spire and the Monolith. */
function skybridges(m: Shell) {
  // (from the Spire's face to the Monolith's, which reaches further out this way: it's turned)
  const cx = -75, cz = MEGA.spire.z, len = 30;
  for (const y of [232, 338]) {
    m.set(K.Lit, 0xd6f1ff).box(cx, cz, len, 6, y, y + 4.6);
    m.set(K.Neon, 0x000000, 0).box(cx, cz, len, 6.6, y - 0.8, y);
    m.set(K.Frame, 0x3a3f46).box(cx, cz, len, 6.4, y + 4.6, y + 5.2);
  }
}

/** The plaza the giant hologram stands in: paving, a ring of light round the projector. */
function plaza(m: Shell) {
  const { x, z } = HOLO_PLAZA;
  m.set(K.Frame, 0xb9b2a6).prism(x, z, CITY_Y - 1, CITY_Y + 0.5, () => circle(22, 32), { rings: 1, cap: [K.Frame, 0xcfc8bb] });
  m.set(K.Neon, 0x000000, 3).ring(x, z, CITY_Y + 1.1, 14, 15.2, 0.6, [K.Neon, 0x000000, 3]);
  m.set(K.Frame, 0x4c5157).prism(x, z, CITY_Y + 0.5, CITY_Y + 2.4, () => circle(7, 16), { rings: 1, cap: [K.Lit, 0x8fe8ff] });
}

function towerMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    uniforms: { uNeon: { value: NEON.map((h) => new THREE.Color(h)) } },
    vertexShader: /* glsl */ `
      attribute vec3 color, aUV;
      attribute vec4 aKind;
      varying vec3 vWorld, vN, vCol, vUV;
      varying vec4 vKind;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vN = normal;
        vCol = color;
        vUV = aUV;
        vKind = aKind;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      uniform vec3 uNeon[5];
      varying vec3 vWorld, vN, vCol, vUV;
      varying vec4 vKind;
      #include <fog_pars_fragment>

      // an advert: a colour field, a logo ring, a column of characters, sweeping bands; a new one
      // every few seconds, wiped in
      vec3 advert(vec2 f, float W, float H, float seed, vec2 px) {
        vec2 s = f / vec2(W, H);
        float t = uTime / 7.0 + seed * 5.0;
        float slot = floor(t);
        float h = hash12(vec2(slot, seed * 31.0));
        vec3 a = uNeon[int(mod(floor(h * 5.0), 5.0))], b = uNeon[int(mod(floor(h * 5.0) + 2.0, 5.0))];
        vec3 c = mix(a, b, smoothstep(0.0, 1.0, s.y + 0.2 * sin(uTime * 0.7 + s.x * 4.0))) * 0.35;
        // diagonal bands sweeping across
        c *= 0.75 + 0.25 * fpulse((f.x + f.y) / 9.0 - uTime * 0.6, 0.5, (px.x + px.y) / 9.0);
        // the logo: a ring and a dot
        vec2 lc = (f - vec2(W * 0.5, H * 0.66)) / min(W, H);
        float d = length(lc);
        float pd = length(px) / min(W, H);
        c = mix(c, vec3(1.0), fband(d, 0.17, 0.22, pd) + fband(d, 0.0, 0.07, pd));
        // a column of big characters down the left, a line of small ones along the bottom
        float gs = W * 0.16;
        vec2 g = (f - vec2(W * 0.06, 0.0)) / gs;
        vec2 gid = floor(g), gf = fract(g) * vec2(3.0, 4.0);
        float on = step(0.45, hash12(gid * 3.1 + floor(gf) * 7.7 + slot)) * step(0.0, g.x) * step(g.x, 1.0) * step(2.0, g.y) * step(g.y, H / gs - 1.0);
        vec2 sf = fract(gf);
        on *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
        on = mix(on, 0.3 * step(0.0, g.x) * step(g.x, 1.0), smoothstep(0.1, 0.35, px.x / gs));
        c = mix(c, b * 1.4 + 0.2, on);
        float ts = H * 0.05;
        vec2 q = (f - vec2(W * 0.3, H * 0.08)) / ts;
        float line = step(0.4, hash12(floor(q * vec2(1.0, 1.0)) + slot * 3.0)) * step(0.0, q.y) * step(q.y, 1.0) * step(0.0, q.x) * step(q.x, (W * 0.62) / ts);
        c = mix(c, vec3(1.0, 0.95, 0.9), line * mix(0.8, 0.35, smoothstep(0.1, 0.3, px.x / ts)));
        // wiped in from the top as the ad changes
        float wipe = fract(t);
        c *= smoothstep(0.0, 0.03, abs(s.y - (1.0 - wipe * 8.0))) * 0.6 + 0.4 + 0.6 * step(0.125, wipe);
        // scan lines
        c *= 0.82 + 0.18 * fpulse(f.y / 0.6, 0.5, px.y / 0.6);
        return c;
      }

      void main() {
        vec3 n = normalize(vN);
        vec3 w = vWorld;
        float kind = vKind.x, idx = vKind.y, seed = vKind.z, variant = vKind.w;
        vec2 f = vUV.xy;
        float faceW = vUV.z;
        vec2 px = max(fwidth(f), vec2(1e-3));
        vec4 nz = texture2D(uNoise, (w.xz + w.y) / 23.0);
        vec3 V = normalize((cameraPosition - uMapShift) - w);
        vec3 alb = vCol * (0.93 + 0.12 * nz.r);
        vec3 emit = vec3(0.0);
        float spec = 0.0;
        // how lit the inside is: some by day, all of it at night
        float lamps = 0.3 + 0.7 * uDusk;

        if (kind < 0.5) {
          // ---- facade: a window grid per tower
          vec2 cell = vec2(1.6, 3.8), duty = vec2(0.9, 0.84);
          vec3 lamp = vec3(0.8, 0.92, 1.0);
          float lit = 0.55;
          if (variant > 2.5) { cell = vec2(4.0, 4.0); duty = vec2(0.22, 0.7); lamp = vec3(1.0, 0.7, 0.45); lit = 0.35; }
          else if (variant > 1.5) { cell = vec2(2.4, 3.6); duty = vec2(0.66, 0.86); lit = 0.6; }
          else if (variant > 0.5) { cell = vec2(3.2, 3.4); duty = vec2(0.6, 0.58); lamp = vec3(1.0, 0.76, 0.48); lit = 0.65; }
          vec2 q = (f - vec2(mod(faceW, cell.x) * 0.5, 0.0)) / cell;
          vec2 qw = px / cell;
          float win = fpulse(q.x - (1.0 - duty.x) * 0.5, duty.x, qw.x) * fpulse(q.y - (1.0 - duty.y) * 0.5, duty.y, qw.y);
          vec3 r = reflect(-V, n);
          float fres = 0.08 + 0.92 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
          vec3 sky = mix(vec3(0.16, 0.16, 0.2) * (1.0 - 0.7 * uNight), skyCol(r), smoothstep(-0.12, 0.04, r.y));
          vec3 glass = mix(vec3(0.04, 0.06, 0.09), sky, 0.3 + 0.55 * fres);
          vec2 id = floor(q);
          float far = smoothstep(0.25, 0.8, max(qw.x, qw.y));
          float on = mix(step(hash12(id + seed * 917.0), lit * (0.55 + 0.45 * uDusk)), lit, far);
          if (variant < 0.5) alb = mix(vCol * 0.5, vCol, 0.5);
          else if (variant > 2.5) alb = vCol * (0.9 + 0.1 * fpulse(f.x / 1.0, 0.5, px.x));
          alb = mix(alb, glass, win);
          spec = win * (variant < 0.5 || variant > 1.5 ? 1.0 : 0.5);
          emit += lamp * win * on * lamps * 0.8;
          vec3 neon = uNeon[int(idx + 0.5)];
          if (variant < 0.5) {
            // the Spire: neon ribs up every corner, a thin band every 40 m
            float rib = fband(f.x, 0.0, 0.7, px.x) + fband(f.x, faceW - 0.7, faceW, px.x);
            rib = max(rib, fband(mod(f.y, 40.0), 0.0, 0.5, px.y) * 0.6);
            emit += neon * rib * uGlow * (0.55 + 0.45 * uDusk);
            alb = mix(alb, vec3(0.08), rib);
          } else if (variant < 1.5) {
            // the Arcology: balconies under each row of windows
            alb = mix(alb, vCol * 1.08, fband(fract(q.y), 0.0, 0.12, qw.y) * (1.0 - far));
          } else if (variant < 2.5) {
            // the Needle: fins between the window columns, light running up some of them
            float fin = fband(mod(f.x, 9.6), 0.0, 0.6, px.x);
            float run = fract((f.y - uTime * 38.0) / 150.0 + floor(f.x / 9.6) * 0.37);
            emit += neon * fin * uGlow * (0.15 + 0.85 * smoothstep(0.82, 1.0, run)) * (0.5 + 0.5 * uDusk);
            alb = mix(alb, vec3(0.85, 0.88, 0.9), fin);
          } else {
            // the Monolith: strips of light running down it
            float strip = fband(mod(f.x, 7.0), 3.2, 3.8, px.x);
            float run = fract((f.y + uTime * 22.0) / 90.0 + floor(f.x / 7.0) * 0.61);
            emit += neon * strip * uGlow * (0.25 + 0.75 * smoothstep(0.7, 1.0, run)) * (0.55 + 0.45 * uDusk);
          }
        } else if (kind < 1.5) {
          // ---- frame: panels, with joints
          alb *= 0.9 + 0.1 * fpulse(f.y / 3.0, 0.92, px.y / 3.0);
        } else if (kind < 2.5) {
          // ---- neon
          emit = uNeon[int(idx + 0.5)] * uGlow * (0.6 + 0.4 * uDusk);
          alb = vec3(0.05);
        } else if (kind < 3.5) {
          // ---- a terrace garden: lawns and shrubs and paths
          vec2 g = w.xz;
          float bush = smoothstep(0.45, 0.7, texture2D(uNoise, g / 7.0).g);
          alb = mix(vec3(0.33, 0.5, 0.2), vec3(0.2, 0.36, 0.14), bush) * (0.85 + 0.3 * nz.r);
          alb = mix(alb, vec3(0.72, 0.68, 0.6), fband(abs(fract(g.x / 12.0) - 0.5) * 12.0, 0.0, 0.6, px.x * 12.0) * 0.7);
        } else if (kind < 4.5) {
          // ---- a screen
          float H = variant > 0.5 ? variant : 44.0;
          emit = advert(f, faceW, H, seed, px) * uGlow * (0.75 + 0.5 * uDusk);
          alb = vec3(0.02);
        } else {
          // ---- lit from inside: mullions over a glow
          float mull = fpulse(f.x / 2.4, 0.86, px.x / 2.4);
          emit = vCol * mull * lamps * uGlow * 0.55;
          alb = vec3(0.1);
        }
        if (kind < 0.5 && n.y < 0.5) alb *= mix(0.75, 1.0, smoothstep(0.0, 14.0, f.y));
        vec3 c = alb * mapLight(n, w) + emit;
        if (spec > 0.0) {
          vec3 r = reflect(-V, n);
          c += uSunCol * pow(max(dot(r, uSunDir), 0.0), 120.0) * 2.5 * spec * sunShadow(w + n * 3.5) * cloudShade(w.xz);
        }
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
}

// ------------------------------------------------------------------ searchlights
/** Beams sweeping the sky from the towers' tops and the plaza: faint by day, bold at night. */
function searchlights(u: MapUniforms) {
  const L = 700;
  const g = new THREE.CylinderGeometry(26, 2.5, L, 18, 1, true).translate(0, L / 2, 0);
  const src: [number, number, number, number][] = [
    [MEGA.spire.x, 480, MEGA.spire.z, 0],
    [MEGA.needle.x, 386, MEGA.needle.z, 1.7],
    [MEGA.monolith.x, 430, MEGA.monolith.z, 3.1],
    [MEGA.arcology.x, 400, MEGA.arcology.z, 4.4],
    [HOLO_PLAZA.x - 16, CITY_Y + 1, HOLO_PLAZA.z + 16, 0.9],
    [HOLO_PLAZA.x + 16, CITY_Y + 1, HOLO_PLAZA.z + 16, 2.5],
  ];
  const mesh = new THREE.InstancedMesh(
    g,
    mapMaterial(u, {
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vWorld, vN;
        #include <fog_pars_vertex>
        uniform vec3 uMapShift;
        void main() {
          vAlong = position.y / ${L.toFixed(1)};
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz - uMapShift;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${MAP_GLSL}
        varying float vAlong;
        varying vec3 vWorld, vN;
        #include <fog_pars_fragment>
        void main() {
          vec3 V = normalize((cameraPosition - uMapShift) - vWorld);
          // brightest down the middle of the beam as seen, fading along it
          float core = pow(abs(dot(normalize(vN), V)), 1.6);
          float k = core * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.03, vAlong);
          k *= mix(0.04, 0.2, uNight) * uGlow * 0.4;
          gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * k, 1.0);
          ${MAP_OUT}
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    src.length,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  return {
    mesh,
    update(t: number) {
      src.forEach(([x, y, z, ph], i) => {
        // a slow sweep round, leaning out and back
        e.set(0.32 + 0.14 * Math.sin(t * 0.21 + ph * 2.0), t * 0.12 + ph, 0, 'YXZ');
        m.compose(p.set(x, y, z), q.setFromEuler(e), s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ all of them
export interface MegaTowers {
  group: THREE.Group;
  update(t: number): void;
  /** Footprints that throw shadows (for the shadow map). */
  shadows: { x: number; z: number; w: number; d: number; top: number }[];
  /** Red lights on their tips. */
  beacons: number[];
}

export function buildTowers(u: MapUniforms): MegaTowers {
  const m = new Shell();
  spire(m);
  arcology(m);
  needle(m);
  monolith(m);
  skybridges(m);
  plaza(m);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(m.geometry(), towerMaterial(u));
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  const sl = searchlights(u);
  sl.update(0);
  group.add(sl.mesh);
  const S = MEGA.spire, A = MEGA.arcology, N = MEGA.needle, M = MEGA.monolith;
  const shadows = [
    { x: S.x, z: S.z, w: 40, d: 40, top: 300 },
    { x: S.x, z: S.z, w: 30, d: 30, top: 476 },
    { x: S.x, z: S.z, w: 12, d: 12, top: 540 },
    ...ARCOLOGY.map((b) => ({ x: A.x + b.dx, z: A.z + b.dz, w: b.w * 0.9, d: b.d * 0.9, top: b.y1 })),
    { x: N.x, z: N.z, w: 36, d: 36, top: 400 },
    { x: N.x, z: N.z, w: 10, d: 10, top: 500 },
    { x: M.x, z: M.z, w: 50, d: 30, top: 396 },
  ];
  const beacons = [S.x, S.top + 1, S.z, A.x, A.top + 1, A.z, N.x, N.top + 1, N.z, M.x + Math.cos(MONO_ROT) * 7, 430, M.z - Math.sin(MONO_ROT) * 7];
  return { group, update: sl.update, shadows, beacons };
}
