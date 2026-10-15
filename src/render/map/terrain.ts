import * as THREE from 'three';
import { BLOCK, CITY_Y, GRID_X0, GRID_Z0, coast, cityWeight, fbm, height, inPark, noise, smoothstep, river, AVENUE, STREET } from './layout';
import { farm, forest, type Plan } from './plan';
import { MAP_GLSL, MAP_OUT, SHADOW_HALF, SUN, SUN_TAN, mapMaterial, type MapUniforms } from './kit';

/**
 * The ground: a height grid sampled once from the layout, turned into terrain chunks (with the
 * streets, fields and lawns drawn on in the shader), a coarse ring of hills and mountains out to
 * the horizon, the sea's depth map, and the shadow height map that lets every map material know
 * whether the low sun reaches it.
 */

/** The fine terrain covers ±FINE (the shadow map's area); a coarse ring runs on out to ±FAR. */
export const FINE = SHADOW_HALF;
const FAR = 5200;
const CELL = 12.5;
const N = Math.round((2 * FINE) / CELL);
/** Cells per chunk side. */
const CHUNK = 32;

export class HeightGrid {
  readonly n = N + 1;
  readonly h = new Float32Array(this.n * this.n);
  constructor() {
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) this.h[j * this.n + i] = height(-FINE + i * CELL, -FINE + j * CELL);
  }
  /** Bilinear height at any point inside the grid (clamped at the edges). */
  at(x: number, z: number) {
    const fx = Math.min(N - 1e-4, Math.max(0, (x + FINE) / CELL));
    const fz = Math.min(N - 1e-4, Math.max(0, (z + FINE) / CELL));
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const n = this.n, h = this.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

// ------------------------------------------------------------------ colours
const C = {
  grass: new THREE.Color(0x8db35b),
  meadow: new THREE.Color(0xb3c266),
  forest: new THREE.Color(0x56823f),
  bank: new THREE.Color(0x6f9a4c),
  sand: new THREE.Color(0xe8d4a2),
  wetSand: new THREE.Color(0xc8ad80),
  rock: new THREE.Color(0x9c907f),
  cliff: new THREE.Color(0x857a6c),
  snow: new THREE.Color(0xf4f2ef),
  city: new THREE.Color(0xa69c8f),
  farm: new THREE.Color(0xa9b062),
  alpine: new THREE.Color(0x8f9a62),
};
const _c = new THREE.Color();

/** Ground colour at a point (before the shader's streets and fields), and its masks. */
function ground(x: number, z: number, h: number, nY: number, out: THREE.Color) {
  const c = coast(x, z);
  const slope = Math.sqrt(Math.max(0, 1 - nY * nY)) / Math.max(0.05, nY);
  const city = cityWeight(x, z);
  const park = inPark(x, z) ? 1 : 0;
  const fm = farm(x, z, h);
  // grass, with meadow patches
  const mead = smoothstep(-0.1, 0.35, fbm(x * 0.008 + 5, z * 0.008 - 3, 3));
  out.copy(C.grass).lerp(C.meadow, mead * 0.6);
  // under the woods the ground goes darker
  const f = forest(x, z, h, c);
  out.lerp(C.forest, f * 0.75);
  // high meadows go olive, then rock, then snow on the peaks
  out.lerp(C.alpine, smoothstep(160, 260, h) * 0.7);
  out.lerp(C.rock, smoothstep(240, 320, h + noise(x * 0.02, z * 0.02) * 25));
  out.lerp(C.cliff, smoothstep(0.75, 1.3, slope));
  out.lerp(C.snow, smoothstep(350, 400, h + noise(x * 0.015, z * 0.015) * 30) * smoothstep(1.4, 0.8, slope));
  // fields
  out.lerp(C.farm, fm);
  // beaches
  const beach = smoothstep(3.4, 1.6, h) * smoothstep(-5, 8, c) * (1 - city * 0.6);
  out.lerp(C.sand, beach);
  out.lerp(C.wetSand, smoothstep(0.9, 0.2, h) * beach);
  // river banks
  const r = river(x, z);
  out.lerp(C.bank, smoothstep(r.w + 30, r.w + 4, r.d) * 0.5 * (1 - beach));
  // the city's paving (the shader draws its streets)
  out.lerp(C.city, smoothstep(0.35, 0.75, city) * (1 - park) * smoothstep(14, 30, c));
  return { city: smoothstep(0.35, 0.75, city) * smoothstep(14, 30, c), farm: fm, park: park * smoothstep(0.3, 0.7, city) };
}

// ------------------------------------------------------------------ material
function terrainMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    uniforms: {
      uGrid: { value: new THREE.Vector4(GRID_X0, GRID_Z0, BLOCK, CITY_Y) },
      uStreet: { value: new THREE.Vector2(STREET * 0.5, AVENUE * 0.5) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec3 aMask;
      varying vec3 vCol, vN, vWorld, vMask;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color;
        vMask = aMask;
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      uniform vec4 uGrid;
      uniform vec2 uStreet;
      varying vec3 vCol, vN, vWorld, vMask;
      #include <fog_pars_fragment>

      // distance to the nearest street centre line along one axis, and that street's half width
      vec2 street(float p, float o) {
        float k = floor((p - o) / uGrid.z + 0.5);
        float d = abs(p - (o + k * uGrid.z));
        float hw = mod(k, 3.0) == 0.0 ? uStreet.y : uStreet.x;
        return vec2(d, hw);
      }

      void main() {
        vec3 base = vCol;
        vec3 w = vWorld;
        vec4 nz = texture2D(uNoise, w.xz / 37.0);
        vec4 nz2 = texture2D(uNoise, w.xz / 420.0);
        float px = length(fwidth(w.xz));
        // grain and mottling everywhere
        base *= 0.88 + 0.16 * nz.r + 0.12 * (nz2.g - 0.5);
        vec3 glow = vec3(0.0);

        // patchwork fields: crops in tilted plots with furrows and hedgerows between
        if (vMask.y > 0.02) {
          vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * w.xz;
          vec2 cell = floor(q / vec2(46.0, 31.0));
          vec2 f = fract(q / vec2(46.0, 31.0));
          float hc = hash12(cell + 7.0);
          vec3 crop = hc < 0.22 ? vec3(0.62, 0.45, 0.12) : hc < 0.45 ? vec3(0.25, 0.42, 0.1) : hc < 0.62 ? vec3(0.42, 0.52, 0.16) : hc < 0.78 ? vec3(0.42, 0.28, 0.16) : hc < 0.88 ? vec3(0.36, 0.3, 0.5) : vec3(0.56, 0.5, 0.18);
          float rows = 0.92 + 0.08 * sin((hc > 0.5 ? q.x : q.y) * 2.4);
          crop *= rows * (0.9 + 0.2 * nz.a);
          vec2 e = min(f, 1.0 - f) * vec2(46.0, 31.0);
          float hedge = 1.0 - smoothstep(0.8, 1.8 + px, min(e.x, e.y));
          crop = mix(crop, vec3(0.1, 0.2, 0.06), hedge * 0.85);
          base = mix(base, crop, vMask.y);
        }

        // the city's streets: asphalt, kerbs and pavements, zebra crossings, lamps along them
        if (vMask.x > 0.02) {
          vec2 sx = street(w.x, uGrid.x);
          vec2 sz = street(w.z, uGrid.y);
          float aa = px + 0.3;
          float onX = 1.0 - smoothstep(sx.y - aa, sx.y + aa, sx.x);
          float onZ = 1.0 - smoothstep(sz.y - aa, sz.y + aa, sz.x);
          float walkX = 1.0 - smoothstep(sx.y + 3.0 - aa, sx.y + 3.0 + aa, sx.x);
          float walkZ = 1.0 - smoothstep(sz.y + 3.0 - aa, sz.y + 3.0 + aa, sz.x);
          vec3 c = base;
          // pavements
          c = mix(c, vec3(0.62, 0.58, 0.52) * (0.92 + 0.12 * nz.r), max(walkX, walkZ) * (1.0 - vMask.z));
          float road = max(onX, onZ);
          vec3 tar = vec3(0.075, 0.078, 0.09) * (0.9 + 0.2 * nz.r);
          // lane lines down the middle, dashed, faint
          float lane = (1.0 - smoothstep(0.15, 0.35 + px, onZ > onX ? sz.x : sx.x)) * step(0.5, fract((onZ > onX ? w.x : w.z) / 9.0));
          tar = mix(tar, vec3(0.55, 0.5, 0.36), lane * 0.6 * step(px, 1.2));
          // zebra crossings just outside each junction
          float jx = sx.x - sx.y, jz = sz.x - sz.y;
          float zebra = step(0.5, fract((onX > onZ ? w.z : w.x) / 1.6));
          float nearJ = onX > onZ ? step(0.0, jz) * step(jz, 4.0) : step(0.0, jx) * step(jx, 4.0);
          tar = mix(tar, vec3(0.6, 0.6, 0.58), zebra * nearJ * step(px, 0.9) * 0.8);
          c = mix(c, tar, road);
          base = mix(base, c, vMask.x);
          // street lamps at dusk: warm pools of light along the kerbs
          float lampAlong = onZ > 0.5 || walkZ > 0.5 ? w.x : w.z;
          float lampAcross = min(abs(sx.x - sx.y - 1.5), abs(sz.x - sz.y - 1.5));
          float pool = (1.0 - smoothstep(0.0, 3.5, abs(fract(lampAlong / 22.0) - 0.5) * 22.0)) * (1.0 - smoothstep(0.0, 4.0, lampAcross));
          glow += vec3(1.0, 0.62, 0.3) * pool * 0.5 * uDusk * vMask.x * (1.0 - vMask.z);
        }

        // wet sand at the water's edge
        base *= mix(0.78, 1.0, smoothstep(0.15, 0.9, w.y));
        vec3 c = base * mapLight(normalize(vN), w) + glow;
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
}

/** Coarse hills and mountains out to the horizon: plain lit vertex colours. */
function farMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol, vN, vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color; vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol, vN, vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN);
        vec3 c = vCol * (0.9 + 0.15 * texture2D(uNoise, vWorld.xz / 300.0).g);
        float cs = cloudShade(vWorld.xz);
        c *= ambient(n) * mix(0.82, 1.0, cs) + uSunCol * max(dot(n, uSunDir), 0.0) * cs;
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
}

// ------------------------------------------------------------------ terrain
export interface Ground {
  group: THREE.Group;
  grid: HeightGrid;
  /** The sea's depth (R) over the fine area. */
  depth: THREE.DataTexture;
  /** Fills the shadow height map from the terrain and everything standing on it. */
  shadows(plan: Plan, extra: { x: number; z: number; w: number; d: number; top: number }[]): THREE.DataTexture;
}

export function buildGround(u: MapUniforms): Ground {
  const grid = new HeightGrid();
  const group = new THREE.Group();
  const mat = terrainMaterial(u);
  const n = grid.n;
  // normals and colours per grid point
  const nor = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const mask = new Float32Array(n * n * 3);
  const _v = new THREE.Vector3();
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const hl = grid.h[j * n + Math.max(0, i - 1)], hr = grid.h[j * n + Math.min(n - 1, i + 1)];
      const hd = grid.h[Math.max(0, j - 1) * n + i], hu = grid.h[Math.min(n - 1, j + 1) * n + i];
      _v.set(hl - hr, 2 * CELL, hd - hu).normalize();
      nor.set([_v.x, _v.y, _v.z], k * 3);
      const x = -FINE + i * CELL, z = -FINE + j * CELL;
      const h = grid.h[k];
      if (h < -3) continue;
      const m = ground(x, z, h, _v.y, _c);
      col.set([_c.r, _c.g, _c.b], k * 3);
      mask.set([m.city, m.farm, m.park], k * 3);
    }
  const chunks = N / CHUNK;
  for (let cj = 0; cj < chunks; cj++)
    for (let ci = 0; ci < chunks; ci++) {
      // under the sea entirely: the sea covers it
      let top = -Infinity;
      for (let j = cj * CHUNK; j <= (cj + 1) * CHUNK; j++) for (let i = ci * CHUNK; i <= (ci + 1) * CHUNK; i++) top = Math.max(top, grid.h[j * n + i]);
      if (top < -0.8) continue;
      const pos: number[] = [], nn: number[] = [], cc: number[] = [], mm: number[] = [], idx: number[] = [];
      const V = CHUNK + 1;
      for (let j = 0; j < V; j++)
        for (let i = 0; i < V; i++) {
          const gi = ci * CHUNK + i, gj = cj * CHUNK + j, k = gj * n + gi;
          pos.push(-FINE + gi * CELL, grid.h[k], -FINE + gj * CELL);
          nn.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]);
          cc.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
          mm.push(mask[k * 3], mask[k * 3 + 1], mask[k * 3 + 2]);
        }
      for (let j = 0; j < CHUNK; j++)
        for (let i = 0; i < CHUNK; i++) {
          const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
          // split each quad along the diagonal that follows the ground better
          if (Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]) < Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) idx.push(a, c, d, a, d, b);
          else idx.push(a, c, b, b, c, d);
        }
      // skirts down the outer edge of the fine area, so the coarse ring never shows a crack
      const edge = (ok: boolean, list: number[]) => {
        if (!ok) return;
        for (let s = 0; s < list.length - 1; s++) {
          const a = list[s], b = list[s + 1];
          const base = pos.length / 3;
          for (const v of [a, b]) {
            pos.push(pos[v * 3], pos[v * 3 + 1] - 90, pos[v * 3 + 2]);
            nn.push(nn[v * 3], nn[v * 3 + 1], nn[v * 3 + 2]);
            cc.push(cc[v * 3] * 0.6, cc[v * 3 + 1] * 0.6, cc[v * 3 + 2] * 0.6);
            mm.push(0, 0, 0);
          }
          idx.push(a, b, base, b, base + 1, base, a, base, b, b, base, base + 1);
        }
      };
      const row = (j: number) => Array.from({ length: V }, (_, i) => j * V + i);
      const colm = (i: number) => Array.from({ length: V }, (_, j) => j * V + i);
      edge(cj === 0, row(0));
      edge(cj === chunks - 1, row(CHUNK));
      edge(ci === 0, colm(0));
      edge(ci === chunks - 1, colm(CHUNK));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      g.setAttribute('aMask', new THREE.Float32BufferAttribute(mm, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  group.add(farRing(u));
  return { group, grid, depth: depthTexture(grid), shadows: (plan, extra) => shadowMap(grid, plan, extra) };
}

/** Hills and mountains past the fine area, out to the haze. */
function farRing(u: MapUniforms) {
  const step = 100;
  const M = Math.round((2 * FAR) / step);
  const pos: number[] = [], nn: number[] = [], cc: number[] = [], idx: number[] = [];
  const at = new Map<number, number>();
  const vert = (i: number, j: number) => {
    const key = j * (M + 1) + i;
    let v = at.get(key);
    if (v !== undefined) return v;
    const x = -FAR + i * step, z = -FAR + j * step;
    const h = height(x, z);
    const e = 30;
    const nx = height(x - e, z) - height(x + e, z), nz = height(x, z - e) - height(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    v = pos.length / 3;
    pos.push(x, h, z);
    nn.push(nx / l, (2 * e) / l, nz / l);
    _c.copy(C.grass).lerp(C.forest, 0.6 * smoothstep(20, 80, h));
    _c.lerp(C.alpine, smoothstep(160, 260, h) * 0.7).lerp(C.rock, smoothstep(250, 330, h)).lerp(C.snow, smoothstep(360, 420, h));
    _c.lerp(C.sand, smoothstep(4, 1.5, h));
    cc.push(_c.r, _c.g, _c.b);
    at.set(key, v);
    return v;
  };
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) {
      const x0 = -FAR + i * step, z0 = -FAR + j * step;
      // the fine terrain covers the middle
      if (x0 >= -FINE && x0 + step <= FINE && z0 >= -FINE && z0 + step <= FINE) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -1) continue;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // (sunk a touch where it meets the fine terrain, which overlaps it)
  const mesh = new THREE.Mesh(g, farMaterial(u));
  mesh.position.y = -0.4;
  return mesh;
}

/** Sea depth over the fine area, for the water's colour and the surf (R: 0 shore .. 1 at 24 m). */
function depthTexture(grid: HeightGrid) {
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const x = -FINE + ((i + 0.5) / S) * 2 * FINE, z = -FINE + ((j + 0.5) / S) * 2 * FINE;
      const h = grid.at(x, z);
      const k = (j * S + i) * 4;
      data[k] = Math.min(255, Math.max(0, (-h / 24) * 255));
      // G: land (1) or water (0), soft, for the surf line and the shore glow
      data[k + 1] = h > 0 ? 255 : 0;
      data[k + 3] = 255;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The shadow height map. For each point, how high the shadows cast by everything between it and
 * the sun reach there: a surface below that height is in shade. Swept once across the map from
 * the sun's side, each texel taking the taller of what stands just sunward of it and the shadow
 * already reaching that far, dropped by the sun's slope over the step.
 */
function shadowMap(grid: HeightGrid, plan: Plan, extra: { x: number; z: number; w: number; d: number; top: number }[]) {
  const S = 1024;
  const texel = (2 * SHADOW_HALF) / S;
  const H = new Float32Array(S * S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) H[j * S + i] = grid.at(-SHADOW_HALF + (i + 0.5) * texel, -SHADOW_HALF + (j + 0.5) * texel);
  const raise = (x: number, z: number, w: number, d: number, top: number) => {
    const i0 = Math.max(0, Math.floor((x - w / 2 + SHADOW_HALF) / texel)), i1 = Math.min(S - 1, Math.floor((x + w / 2 + SHADOW_HALF) / texel));
    const j0 = Math.max(0, Math.floor((z - d / 2 + SHADOW_HALF) / texel)), j1 = Math.min(S - 1, Math.floor((z + d / 2 + SHADOW_HALF) / texel));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (H[j * S + i] < top) H[j * S + i] = top;
  };
  for (const b of plan.boxes) raise(b.x, b.z, b.w, b.d, b.y0 + b.h);
  for (const b of plan.docks.boxes) raise(b.x, b.z, b.w, b.d, b.y0 + b.h);
  for (const h of plan.houses) raise(h.x, h.z, Math.max(h.w, h.d), Math.max(h.w, h.d), h.y + h.h + 2);
  // tree crowns throw shade on the ground (and on the trees behind them)
  for (const t of plan.trees) raise(t.x, t.z, 4 * t.s, 4 * t.s, t.y + (t.kind === 1 ? 10 : 7) * t.s);
  for (const e of extra) raise(e.x, e.z, e.w, e.d, e.top);
  // sweep from the sun's side: the sun is towards -x and +z, so go up x and down z
  const f = Math.abs(SUN.z / SUN.x);
  const drop = texel * Math.hypot(1, f) * SUN_TAN;
  const out = new Float32Array(S * S).fill(-1000);
  for (let j = S - 2; j >= 0; j--)
    for (let i = 1; i < S; i++) {
      // the point one texel sunward in x (and f of a texel in z)
      const a = (j * S + i - 1), b = ((j + 1) * S + i - 1);
      const up = Math.max(H[a], out[a]) * (1 - f) + Math.max(H[b], out[b]) * f;
      out[j * S + i] = up - drop;
    }
  const half = new Uint16Array(S * S);
  for (let k = 0; k < S * S; k++) half[k] = THREE.DataUtils.toHalfFloat(Math.max(-500, Math.min(2000, out[k])));
  const t = new THREE.DataTexture(half, S, S, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

