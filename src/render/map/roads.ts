import * as THREE from 'three';
import { AVENUE, BLOCK, CITY_Y, GRID_X0, GRID_Z0, STREET, clamp, siteGround } from './layout';
import { AA_GLSL, MAP_GLSL, MAP_OUT, Mesher, SHADOW_HALF, glowMaterial, litMaterial, mapMaterial, type MapUniforms } from './kit';
import { HALF, Kind, LIFT, STEP, VERGE, gridRange, roadNet, streetLines, type Road } from './roadnet';
import type { Plan } from './plan';
import type { HeightGrid } from './terrain';

/**
 * Drawing the roads. Out in the country each road is a ribbon draped over the terrain (level
 * across, smoothed along, on an embankment or a stone wall where the ground falls away), its
 * markings, verges and lamp light drawn in one shader with crisp, filtered edges, so a line stays a
 * line from up close and fades to its true average far off instead of blurring or shimmering. In
 * the city the terrain shader draws the street grid with the same functions (ROAD_GLSL): kerbs with
 * rounded corners at every junction, pavements, zebra and scramble crossings, stop lines, bus lanes
 * and the avenues' planted medians. Then the expressway's median barrier and lamps, guard rails and
 * walls, reflector posts, the tunnel portal, the funicular up to the falls, alley lanterns, and
 * traffic on the country roads.
 */

/** Height of each kind's surface above the ground it's draped over (bigger roads on top where they meet). */
const LIFT_Y: readonly number[] = [0.32, 0.26, 0.26, 0.2, 0.16, 0.1, 0.1, 0.08];

// ------------------------------------------------------------------ shading
/**
 * Road surfaces, shared by the ribbons and the city's terrain. Needs MAP_GLSL and AA_GLSL first.
 * `px` is the size of a pixel in metres across (x) and along (y) the road.
 */
export const ROAD_GLSL = /* glsl */ `
  const vec3 R_WHITE = vec3(0.8, 0.8, 0.76);
  const vec3 R_YELLOW = vec3(0.86, 0.55, 0.09);
  const vec3 R_KERB = vec3(0.6, 0.58, 0.54);
  const vec3 R_PAVE = vec3(0.44, 0.41, 0.37);
  const vec3 R_GRASS = vec3(0.17, 0.28, 0.07);
  const vec3 R_CITY_TAR = vec3(0.058, 0.061, 0.072);
  // a line of half width h centred at c, box-filtered over a pixel
  float rLine(float x, float c, float h, float px) { return fband(x, c - h, c + h, px); }
  // on for 'duty' of every 'period' metres
  float rDash(float s, float period, float duty, float px) { return fpulse(s / period, duty, px / period); }
  // street lamps: a glimmer by day, full at night
  float rLampsOn() { return mix(0.04, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0)); }
  // a pool of lamp light: ds along, dc across from the lamp, r its reach
  float rPool(float ds, float dc, float r) { return exp(-(ds * ds + dc * dc) / (r * r)); }

  // a grass verge, with wild flowers in it
  vec3 rVerge(vec2 xz, vec4 nz, float px) {
    vec3 c = R_GRASS * (0.78 + 0.45 * nz.g);
    vec2 q = xz * 1.7;
    float h = hash12(floor(q));
    float speck = step(0.84, h) * smoothstep(0.34, 0.18, length(fract(q) - 0.5)) * smoothstep(0.6, 0.2, px);
    vec3 flower = h > 0.95 ? vec3(0.9, 0.85, 0.75) : h > 0.9 ? vec3(0.9, 0.42, 0.55) : vec3(0.95, 0.75, 0.2);
    return mix(c, flower, speck);
  }

  // paving slabs
  vec3 rPave(vec2 xz, vec4 nz, float px) {
    vec3 c = R_PAVE * (0.9 + 0.16 * nz.r);
    return c * (1.0 - 0.14 * max(fpulse(xz.x / 1.4, 0.05, px / 1.4), fpulse(xz.y / 1.4, 0.05, px / 1.4)));
  }

  // a city avenue's or street's carriageway (kerb to kerb): o across from its centre, s along
  vec3 rCityLanes(bool avenue, float o, float s, vec2 px, vec4 nz, float hue, inout vec3 glow) {
    float a = abs(o);
    float hw = avenue ? ${(AVENUE / 2).toFixed(2)} : ${(STREET / 2).toFixed(2)};
    vec3 c = R_CITY_TAR * (0.88 + 0.24 * nz.r);
    if (avenue) {
      // the outer lane each way is a terracotta bus lane, behind a solid white line
      c = mix(c, vec3(0.16, 0.066, 0.05) * (0.9 + 0.2 * nz.r), fband(a, 6.15, hw, px.x));
      c = mix(c, R_WHITE, rLine(a, 6.05, 0.1, px.x));
      c *= 1.0 - 0.12 * rLine(a, 3.8, 0.9, px.x);
      // the planted median, kerbed, with a strip of neon along it at night
      vec3 med = mix(R_KERB, vec3(0.07, 0.14, 0.035) * (0.75 + 0.5 * nz.a), fband(a, 0.0, 1.32, px.x));
      c = mix(c, med, fband(a, 0.0, 1.6, px.x));
      vec3 neon = hue < 0.5 ? vec3(0.25, 0.94, 1.0) : vec3(1.0, 0.25, 0.64);
      glow += neon * (2.2 * rLine(a, 1.66, 0.06, px.x) + 0.1 * smoothstep(3.4, 1.7, a) * step(1.6, a)) * uNight * uGlow * 0.45;
    } else {
      // parking bays along both kerbs, a dashed line down the middle
      float bay = fband(a, 4.3, hw, px.x);
      c = mix(c, c * 1.4, bay);
      c = mix(c, R_WHITE * 0.8, bay * rDash(s, 6.0, 0.025, px.y) + rLine(a, 4.3, 0.06, px.x));
      c = mix(c, vec3(0.75, 0.68, 0.48), rLine(a, 0.0, 0.08, px.x) * rDash(s, 9.0, 0.45, px.y));
    }
    // the gutter along the kerb
    return c * (1.0 - 0.3 * fband(a, hw - 0.35, hw, px.x));
  }

  // any road's surface right across (verges or pavements included). kind: see Kind in roadnet.ts
  vec3 roadColor(float kind, float o, float s, float hw, vec2 px, vec4 nz, vec4 nz2, vec2 xz, inout vec3 glow) {
    int k = int(kind + 0.5);
    float a = abs(o);
    vec3 c;
    if (k == 0) {
      // the expressway: two lanes each way, hard shoulders, a concrete median with lamps down it
      c = vec3(0.045, 0.05, 0.06) * (0.92 + 0.14 * nz.r);
      c *= 1.0 - 0.13 * (rLine(a, 3.3, 0.8, px.x) + rLine(a, 6.85, 0.8, px.x));
      c = mix(c, c * 1.45 + 0.01, fband(a, 8.95, hw, px.x));
      c = mix(c, R_WHITE, rLine(a, 5.08, 0.09, px.x) * rDash(s, 18.0, 0.33, px.y));
      c = mix(c, R_WHITE, rLine(a, 8.82, 0.13, px.x));
      c = mix(c, R_YELLOW, rLine(a, 1.6, 0.1, px.x));
      c = mix(c, vec3(0.36, 0.35, 0.33) * (0.9 + 0.2 * nz.r), fband(a, 0.0, 1.35, px.x));
      c = mix(c, rVerge(xz, nz, px.x), fband(a, hw, 99.0, px.x));
      float ds = (fract(s / 40.0 + 0.5) - 0.5) * 40.0;
      glow += vec3(0.62, 0.86, 1.0) * rPool(ds, a - 5.0, 5.0) * 0.36 * rLampsOn() * step(a, hw + 0.5);
    } else if (k == 1) {
      // a country road: patched asphalt, white edges, a dashed white centre line, gravel shoulders
      c = vec3(0.09, 0.085, 0.078) * (0.9 + 0.18 * nz.r);
      c *= mix(1.0, 0.8, smoothstep(0.62, 0.66, nz2.a));
      c = mix(c, R_WHITE, rLine(a, 0.0, 0.07, px.x) * rDash(s, 12.0, 0.25, px.y));
      c = mix(c, R_WHITE, rLine(a, hw - 0.3, 0.08, px.x));
      c = mix(c, vec3(0.36, 0.31, 0.24) * (0.8 + 0.4 * nz.r), fband(a, hw, 99.0, px.x));
    } else if (k == 2) {
      // the mountain road: narrower, weathered, a double yellow line, stone chippings at the side
      c = vec3(0.068, 0.064, 0.06) * (0.88 + 0.24 * nz.r);
      c *= mix(1.0, 0.82, smoothstep(0.6, 0.64, nz2.a));
      c = mix(c, R_YELLOW, fband(a, 0.07, 0.19, px.x));
      c = mix(c, R_WHITE, rLine(a, hw - 0.22, 0.07, px.x));
      c = mix(c, vec3(0.3, 0.29, 0.27) * (0.8 + 0.4 * nz.r), fband(a, hw, 99.0, px.x));
    } else if (k == 3) {
      // a village lane: pale old asphalt, ragged edges into flowery verges, a lamp now and then
      c = vec3(0.15, 0.14, 0.125) * (0.82 + 0.34 * nz.r);
      c = mix(c, R_GRASS * 0.9, 0.3 * smoothstep(0.5, 0.0, a) * nz.a);
      c = mix(c, rVerge(xz, nz, px.x), fband(a, hw - 0.4 * nz.g, 99.0, px.x));
      float ds = (fract(s / 32.0 + 0.5) - 0.5) * 32.0;
      glow += vec3(1.0, 0.66, 0.34) * rPool(ds, o - hw, 5.0) * 0.5 * rLampsOn();
    } else if (k == 4) {
      // a farm track: two dusty ruts and a strip of grass down the middle
      c = vec3(0.34, 0.25, 0.15) * (0.82 + 0.34 * nz.r);
      c *= 1.0 - 0.22 * rLine(a, 0.85, 0.28, px.x);
      c = mix(c, R_GRASS * (0.9 + 0.3 * nz.g), fband(a, 0.0, 0.3 + 0.12 * nz.g, px.x));
      c = mix(c, rVerge(xz, nz, px.x), fband(a, hw - 0.25 * nz.g, 99.0, px.x));
    } else if (k == 7) {
      // an alley: stone setts, a gutter down the middle, paper lanterns strung across at night
      vec2 q = vec2(s / 0.55, o / 0.4);
      q.x += 0.5 * mod(floor(q.y), 2.0);
      float id = mix(hash12(floor(q) + 3.0), 0.5, smoothstep(0.08, 0.3, max(px.x, px.y)));
      c = vec3(0.42, 0.34, 0.29) * (0.78 + 0.4 * id);
      c *= 1.0 - 0.4 * max(fpulse(q.x, 0.1, px.y / 0.55), fpulse(q.y, 0.12, px.x / 0.4));
      c *= 1.0 - 0.4 * rLine(a, 0.0, 0.16, px.x);
      float ds = (fract(s / 5.0 + 0.5) - 0.5) * 5.0;
      glow += vec3(1.0, 0.42, 0.22) * (0.1 + 0.45 * rPool(ds, a - 1.2, 2.2)) * rLampsOn();
    } else {
      // a city avenue or street carried over a bridge
      bool av = k == 5;
      float chw = av ? ${(AVENUE / 2).toFixed(2)} : ${(STREET / 2).toFixed(2)};
      vec3 g = vec3(0.0);
      c = rCityLanes(av, o, s, px, nz, 0.0, g);
      glow += g * step(a, chw);
      c = mix(c, rPave(xz, nz, px.x), fband(a, chw, 99.0, px.x));
      c = mix(c, R_KERB, fband(a, chw, chw + 0.3, px.x));
    }
    return c;
  }
`;

function ribbonMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec4 aRoad;
      varying vec4 vRoad;
      varying vec3 vN, vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vRoad = aRoad;
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${ROAD_GLSL}
      varying vec4 vRoad;
      varying vec3 vN, vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 w = vWorld;
        vec4 nz = texture2D(uNoise, w.xz / 37.0);
        vec4 nz2 = texture2D(uNoise, w.xz / 53.0 + 0.37);
        float o = vRoad.x, s = vRoad.y, hw = vRoad.z;
        float kind = mod(vRoad.w, 16.0);
        // (derivatives taken up here, outside the branches)
        vec2 px = vec2(fwidth(o), fwidth(s)) + 1e-4;
        float pw = length(fwidth(w));
        vec3 glow = vec3(0.0);
        vec3 c;
        if (vRoad.w > 15.5) {
          if (kind > 1.5 && kind < 2.5) {
            // a dry-stone wall under the mountain road
            vec2 q = vec2(s / 1.1, w.y / 0.55);
            q.x += 0.5 * mod(floor(q.y), 2.0);
            c = vec3(0.34, 0.31, 0.27) * (0.7 + 0.5 * hash12(floor(q)));
            c *= 1.0 - 0.45 * max(fpulse(q.x, 0.08, pw / 1.1), fpulse(q.y, 0.1, pw / 0.55));
          } else {
            // a grassy embankment, earth showing through here and there
            c = mix(R_GRASS * (0.75 + 0.45 * nz.g), vec3(0.3, 0.22, 0.14) * (0.8 + 0.4 * nz.r), smoothstep(0.55, 0.75, nz2.a));
          }
        } else {
          c = roadColor(kind, o, s, hw, px, nz, nz2, w.xz, glow);
        }
        c = c * mapLight(normalize(vN), w) + glow;
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
}

// ------------------------------------------------------------------ the ground under a road
/** The terrain mesh's own surface (its triangles, split as terrain.ts splits them). */
function surface(grid: HeightGrid) {
  const n = grid.n, cell = (2 * SHADOW_HALF) / (n - 1), h = grid.h;
  return (x: number, z: number) => {
    const fx = clamp((x + SHADOW_HALF) / cell, 0, n - 1 - 1e-4), fz = clamp((z + SHADOW_HALF) / cell, 0, n - 1 - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    if (Math.abs(a - d) < Math.abs(b - c)) return v > u ? a + (d - c) * u + (c - a) * v : a + (b - a) * u + (d - b) * v;
    return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}

/** One road laid out: points, tangents, half widths, and the height of its surface. */
interface Laid {
  road: Road;
  n: number;
  x: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  hw: Float32Array;
  y: Float32Array;
  /** Over a bridge (no embankment hanging down into the river). */
  deck: Uint8Array;
}

function lay(road: Road, surf: (x: number, z: number) => number, bridges: Plan['bridges']): Laid {
  const p = road.pts, n = p.length / 2;
  const x = new Float32Array(n), z = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  const hw = new Float32Array(n), raw = new Float32Array(n), y = new Float32Array(n), deck = new Uint8Array(n);
  const vg = VERGE[road.kind];
  for (let i = 0; i < n; i++) {
    x[i] = p[2 * i];
    z[i] = p[2 * i + 1];
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = p[2 * b] - p[2 * a], dz = p[2 * b + 1] - p[2 * a + 1];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
    const s = i * STEP;
    const t = road.taper > 0 ? clamp(s / road.taper, 0, 1) : 1;
    hw[i] = road.hw0 + (HALF[road.kind] - road.hw0) * t * t * (3 - 2 * t);
    // level across: as high as the ground anywhere under it
    let top = -Infinity;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const o = k * (hw[i] + vg);
      top = Math.max(top, surf(x[i] - tz[i] * o, z[i] + tx[i] * o));
    }
    raw[i] = top;
  }
  // smoothed along (riding over the bumps, never dipping into them)
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = -Infinity;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) v = Math.max(v, raw[j]);
    m[i] = v;
  }
  for (let i = 0; i < n; i++) {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
      sum += m[j];
      c++;
    }
    y[i] = Math.max(sum / c, raw[i]);
  }
  // up onto the bridges, on ramps either side
  for (const b of bridges) {
    const bx = Math.cos(b.rot), bz = -Math.sin(b.rot);
    for (let i = 0; i < n; i++) {
      const rx = x[i] - b.x, rz = z[i] - b.z;
      const along = Math.abs(rx * bx + rz * bz), across = Math.abs(-rx * bz + rz * bx);
      if (across > b.w / 2 || along > b.len / 2 + 50) continue;
      y[i] = Math.max(y[i], b.y - Math.max(0, along - b.len / 2) * 0.07);
      if (along < b.len / 2) deck[i] = 1;
    }
  }
  return { road, n, x, z, tx, tz, hw, y, deck };
}

// ------------------------------------------------------------------ ribbons
class Ribbons {
  pos: number[] = [];
  nor: number[] = [];
  info: number[] = [];
  idx: number[] = [];

  /** A strip across the road at each point: left foot, left edge, right edge, right foot. */
  add(l: Laid, surf: (x: number, z: number) => number, wall: (i: number, side: number, drop: number) => void) {
    const { road, n, x, z, tx, tz, hw, y, deck } = l;
    const kind = road.kind, vg = VERGE[kind], lift = LIFT_Y[kind];
    const steep = kind === Kind.Mountain ? 0.32 : 1.4;
    const base = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const W = hw[i] + vg;
      const top = y[i] + lift;
      const dy = (y[Math.min(n - 1, i + 1)] - y[Math.max(0, i - 1)]) / ((Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * STEP || 1);
      const ul = 1 / Math.hypot(1, dy);
      for (const side of [-1, 1]) {
        const nx = -tz[i] * side, nz = tx[i] * side;
        const ex = x[i] + nx * W, ez = z[i] + nz * W;
        const drop = top - surf(ex, ez);
        const reach = deck[i] ? 0 : clamp(drop * steep, 0.7, 18);
        const fx = ex + nx * reach, fz = ez + nz * reach;
        const fy = deck[i] ? top : surf(fx, fz) - 0.7;
        if (!deck[i]) wall(i, side, drop);
        // the embankment's face, sloping down and out
        const sl = Math.hypot(reach, top - fy) || 1;
        const foot = [fx, fy, fz, (nx * (top - fy)) / sl, reach / sl, (nz * (top - fy)) / sl, side * (W + reach), s, hw[i], kind + 16];
        const edge = [ex, top, ez, -tx[i] * dy * ul, ul, -tz[i] * dy * ul, side * W, s, hw[i], kind];
        const edgeSkirt = [ex, top, ez, foot[3], foot[4], foot[5], side * W, s, hw[i], kind + 16];
        // (order across: left foot, left edge as skirt, left edge, right edge, right edge as skirt, right foot)
        const verts = side < 0 ? [foot, edgeSkirt, edge] : [edge, edgeSkirt, foot];
        for (const v of verts) {
          this.pos.push(v[0], v[1], v[2]);
          this.nor.push(v[3], v[4], v[5]);
          this.info.push(v[6], v[7], v[8], v[9]);
        }
      }
    }
    // per point: 0 left foot, 1 left edge (skirt), 2 left edge, 3 right edge, 4 right edge (skirt), 5 right foot
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 6, b = a + 6;
      for (const [p, q] of [
        [0, 1],
        [2, 3],
        [4, 5],
      ])
        this.idx.push(a + p, a + q, b + p, a + q, b + q, b + p);
    }
  }

  /** A straight strip (a city street over a bridge, an alley) from (x0, z0) to (x1, z1), at heights `ys` ([along, y] pairs). */
  strip(kind: Kind, x0: number, z0: number, x1: number, z1: number, ys: [number, number][], hw: number) {
    const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    const W = hw + VERGE[kind];
    ys.forEach(([s, y], k) => {
      const base = this.pos.length / 3;
      const px = x0 + tx * s, pz = z0 + tz * s;
      const nb = ys[Math.min(ys.length - 1, k + 1)], pb = ys[Math.max(0, k - 1)];
      const dy = (nb[1] - pb[1]) / (nb[0] - pb[0] || 1), ul = 1 / Math.hypot(1, dy);
      for (const side of [-1, 1]) {
        this.pos.push(px - tz * W * side, y + LIFT_Y[kind], pz + tx * W * side);
        this.nor.push(-tx * dy * ul, ul, -tz * dy * ul);
        this.info.push(W * side, s, hw, kind);
      }
      if (k > 0) this.idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
    });
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(this.info, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ lights
/** Lamps, reflectors and lanterns: glowing points, coloured and sized one by one, brighter at night. */
class Lights {
  pos: number[] = [];
  col: number[] = [];
  /** Size, and how much it shows by day (0 reflectors, which only catch headlights at night). */
  info: number[] = [];
  add(x: number, y: number, z: number, hex: number, size: number, day = 0.05) {
    const c = new THREE.Color(hex);
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.info.push(size, day);
  }
  points(u: MapUniforms) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    g.computeBoundingSphere();
    const mat = mapMaterial(u, {
      uniforms: { uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute vec2 aInfo;
        uniform float uPx, uDusk;
        varying vec3 vCol;
        #include <fog_pars_vertex>
        void main() {
          float on = mix(aInfo.y, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0));
          vCol = color * on;
          vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aInfo.x * uPx * 260.0 / -mvPosition.z, 1.0, aInfo.x * 2.4);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${MAP_GLSL}
        varying vec3 vCol;
        #include <fog_pars_fragment>
        void main() {
          float k = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vCol * k * uGlow * 0.32, 1.0);
          ${MAP_OUT}
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const p = new THREE.Points(g, mat);
    p.renderOrder = 3;
    return { pts: p, px: mat.uniforms.uPx };
  }
}

// ------------------------------------------------------------------ traffic
/**
 * Cars on the country roads: each road's centre line and direction in a float texture (two rows a
 * road), the cars as points that look themselves up in it. Busy on the expressway, a few on the
 * country roads, now and then one up the mountain road or a lane.
 */
function traffic(u: MapUniforms, laid: Laid[]) {
  const roads = laid.filter((l) => l.road.kind <= Kind.Lane && l.n > 8);
  if (!roads.length) return null;
  const Wt = Math.max(...roads.map((l) => l.n));
  const data = new Float32Array(Wt * roads.length * 2 * 4);
  const a: number[] = [], car: number[] = [];
  let seed = 4111;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  roads.forEach((l, r) => {
    for (let i = 0; i < l.n; i++) {
      const k = (r * 2 * Wt + i) * 4, t = ((r * 2 + 1) * Wt + i) * 4;
      data.set([l.x[i], l.y[i] + LIFT_Y[l.road.kind] + 0.7, l.z[i], 0], k);
      data.set([l.tx[i], l.tz[i], 0, 0], t);
    }
    const len = (l.n - 1) * STEP;
    const kind = l.road.kind;
    // lanes each way, their offsets, how far apart the cars are
    const lanes = kind === Kind.Motorway ? [3.3, 6.85] : kind === Kind.Lane ? [1.1] : [hwLane(kind)];
    const gap = kind === Kind.Motorway ? 26 : kind === Kind.Country ? 70 : kind === Kind.Mountain ? 110 : 160;
    for (const side of [-1, 1])
      for (const off of lanes) {
        const m = Math.max(1, Math.floor(len / gap));
        for (let c = 0; c < m; c++) {
          const v = kind === Kind.Motorway ? 24 + rnd() * 9 - (off < 5 ? 5 : 0) : kind === Kind.Country ? 15 + rnd() * 5 : 9 + rnd() * 3;
          a.push(r, rnd(), v * side, off * side);
          car.push(len);
        }
      }
  });
  const tex = new THREE.DataTexture(data, Wt, roads.length * 2, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const n = car.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aCar', new THREE.Float32BufferAttribute(a, 4));
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(car, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 50, -300), 1600);
  const mat = mapMaterial(u, {
    uniforms: { uPx: { value: 1 }, uPath: { value: tex } },
    vertexShader: /* glsl */ `
      attribute vec4 aCar;
      attribute float aLen;
      uniform float uTime, uPx;
      uniform sampler2D uPath;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        int row = int(aCar.x + 0.5) * 2;
        float dir = sign(aCar.z);
        float s = fract(aCar.y + uTime * aCar.z / aLen) * aLen;
        float f = s / ${STEP.toFixed(1)};
        int i0 = int(floor(f));
        float t = fract(f);
        int i1 = min(i0 + 1, int(aLen / ${STEP.toFixed(1)} + 0.5));
        vec3 p = mix(texelFetch(uPath, ivec2(i0, row), 0).xyz, texelFetch(uPath, ivec2(i1, row), 0).xyz, t);
        vec2 tg = normalize(mix(texelFetch(uPath, ivec2(i0, row + 1), 0).xy, texelFetch(uPath, ivec2(i1, row + 1), 0).xy, t));
        // (right-hand traffic: the lane offset is to the right of the way the car goes)
        p.xz += vec2(-tg.y, tg.x) * aCar.w;
        float fade = smoothstep(0.0, 24.0, s) * smoothstep(aLen, aLen - 24.0, s);
        vCol = (dir > 0.0 ? vec3(1.0, 0.88, 0.7) : vec3(1.0, 0.12, 0.08)) * fade;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(2.2 * uPx * 260.0 / -mvPosition.z, 1.2, 6.0) * fade;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float k = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vCol * k * uGlow * 0.3, 1.0);
        ${MAP_OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.renderOrder = 3;
  pts.frustumCulled = false;
  return { pts, px: mat.uniforms.uPx };
}
const hwLane = (k: Kind) => HALF[k] * 0.5;

// ------------------------------------------------------------------ all of it
export interface Roads {
  group: THREE.Group;
  update(t: number): void;
  setPixelScale(h: number): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

export function buildRoads(u: MapUniforms, plan: Plan, grid: HeightGrid): Roads {
  const net = roadNet();
  const surf = surface(grid);
  const group = new THREE.Group();
  const rib = new Ribbons();
  const props = new Mesher();
  const glows = new Mesher();
  const lights = new Lights();
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const put = (m: Mesher, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, col: number) => {
    _q.setFromAxisAngle(_up, rot);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    m.add(box, _m, _c.setHex(col));
  };
  /** A box along the road from point i to i+1, `o` across, its foot `y0` up from the road's surface. */
  const along = (m: Mesher, l: Laid, i: number, o: number, y0: number, w: number, h: number, col: number) => {
    const j = Math.min(l.n - 1, i + 1);
    const ax = l.x[i] - l.tz[i] * o, az = l.z[i] + l.tx[i] * o;
    const bx = l.x[j] - l.tz[j] * o, bz = l.z[j] + l.tx[j] * o;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) return;
    const lift = LIFT_Y[l.road.kind];
    const ya = l.y[i] + lift + y0, yb = l.y[j] + lift + y0;
    // (pitched to follow the slope)
    _m.makeRotationZ(Math.atan2(yb - ya, L));
    _m.premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(-(bz - az), bx - ax)));
    _m.setPosition((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2);
    _m.scale(_s.set(L + 0.05, h, w));
    m.add(box, _m, _c.setHex(col));
  };

  const laid = net.roads.map((r) => lay(r, surf, plan.bridges));
  for (const l of laid) {
    const kind = l.road.kind, vg = VERGE[kind];
    const lastLit: Record<number, number> = { [-1]: -99, [1]: -99 };
    rib.add(l, surf, (i, side, drop) => {
      const s = i * STEP;
      const o = side * (l.hw[i] + vg - 0.35);
      if (kind === Kind.Motorway || kind === Kind.Country) {
        // guard rails where the embankment is high, reflector posts elsewhere
        if (drop > (kind === Kind.Motorway ? 1.4 : 2.2)) {
          along(props, l, i, o, 0.55, 0.12, 0.32, 0xc7cbcd);
          if (i % 2 === 0) put(props, l.x[i] - l.tz[i] * o, l.y[i] + LIFT_Y[kind] - 0.1, l.z[i] + l.tx[i] * o, 0.14, 0.95, 0.14, 0, 0x7d8286);
          if (s - lastLit[side] >= 16) {
            lights.add(l.x[i] - l.tz[i] * o, l.y[i] + LIFT_Y[kind] + 0.75, l.z[i] + l.tx[i] * o, 0xffb24a, 1.6, 0);
            lastLit[side] = s;
          }
        } else if (i % 6 === 0 && s > l.road.taper) {
          const px = l.x[i] - l.tz[i] * o, pz = l.z[i] + l.tx[i] * o, py = l.y[i] + LIFT_Y[kind];
          put(props, px, py, pz, 0.16, 1.1, 0.16, 0, 0xeeeeea);
          lights.add(px, py + 1.0, pz, side > 0 ? 0xff5a3a : 0xffc070, 1.4, 0);
        }
      } else if (kind === Kind.Mountain && drop > 0.9) {
        // a low stone parapet on the drop side, reflectors along it
        along(props, l, i, o, 0, 0.5, 0.7, 0x8a8275);
        if (s - lastLit[side] >= 12) {
          lights.add(l.x[i] - l.tz[i] * o, l.y[i] + LIFT_Y[kind] + 0.8, l.z[i] + l.tx[i] * o, 0xffa040, 1.5, 0);
          lastLit[side] = s;
        }
      }
    });
    if (kind === Kind.Motorway) motorway(l);
    if (kind === Kind.Lane) {
      // village lamps on wooden poles, every 32 m on one side
      for (let i = 8; i < l.n - 2; i += 8) {
        const o = l.hw[i] + 0.6;
        const px = l.x[i] - l.tz[i] * o, pz = l.z[i] + l.tx[i] * o, py = l.y[i] + LIFT_Y[kind];
        put(props, px, py - 0.3, pz, 0.22, 6.2, 0.22, 0, 0x5a4636);
        lights.add(px, py + 5.8, pz, 0xffb060, 2.6, 0.04);
      }
    }
  }

  /** The expressway's median barrier with its neon strip, lamps down the middle, the tunnel portal. */
  function motorway(l: Laid) {
    const start = Math.ceil(l.road.taper / STEP);
    const end = l.road.tunnel ? l.n - 1 : l.n;
    put(props, l.x[start], l.y[start] + LIFT_Y[0], l.z[start], 1.2, 1.0, 1.2, Math.atan2(-l.tz[start], l.tx[start]), 0xf2c230);
    for (let i = start; i < end - 1; i++) {
      along(props, l, i, 0, 0, 0.62, 0.95, 0xc9c6bf);
      along(glows, l, i, 0, 0.95, 0.2, 0.08, 0x3ff0ff);
    }
    for (let i = start + 2; i < end - 2; i++) {
      const s = i * STEP;
      if (s % 40 !== 0) continue;
      const y = l.y[i] + LIFT_Y[0];
      put(props, l.x[i], y + 0.9, l.z[i], 0.3, 10.5, 0.3, 0, 0x9aa0a4);
      // two arms out over the carriageways, a lamp at each end
      const across = Math.atan2(-l.tz[i], l.tx[i]) + Math.PI / 2;
      for (const side of [-1, 1]) {
        put(props, l.x[i] - l.tz[i] * side * 2.5, y + 11.1, l.z[i] + l.tx[i] * side * 2.5, 5, 0.22, 0.25, across, 0x9aa0a4);
        const ax = l.x[i] - l.tz[i] * side * 4.8, az = l.z[i] + l.tx[i] * side * 4.8;
        lights.add(ax, y + 10.9, az, 0xbfe8ff, 3.2, 0.05);
      }
    }
    if (!l.road.tunnel) return;
    // the tunnel's portal: a concrete headwall in the hillside, its mouth lit amber, a neon band over it
    const i = l.n - 1;
    const W = 2 * (l.hw[i] + VERGE[0]) + 10;
    const rot = Math.atan2(-l.tz[i], l.tx[i]) + Math.PI / 2;
    const y = l.y[i] + LIFT_Y[0];
    const fx = l.x[i], fz = l.z[i];
    const bx = l.tx[i], bz = l.tz[i];
    put(props, fx + bx * 1.2, y - 2, fz + bz * 1.2, W, 13, 3, rot, 0xc8c2b6);
    put(props, fx + bx * 1.2, y + 10.8, fz + bz * 1.2, W + 1.2, 0.7, 3.8, rot, 0xddd7cb);
    // the two bores, dark, their lights glowing deep inside
    for (const side of [-1, 1]) {
      const cx = fx - bz * side * 5.6 - bx * 0.45, cz = fz + bx * side * 5.6 - bz * 0.45;
      put(props, cx, y - 0.2, cz, 9.2, 6.8, 0.3, rot, 0x0b0c0f);
      put(glows, cx - bx * 0.2, y + 5.9, cz - bz * 0.2, 8.4, 0.25, 0.2, rot, 0xffb050);
      put(glows, cx - bx * 0.2, y + 0.2, cz - bz * 0.2, 7, 0.12, 0.2, rot, 0xff9030);
    }
    put(glows, fx - bx * 0.4, y + 8.6, fz - bz * 0.4, W * 0.6, 0.5, 0.3, rot, 0xff3fa4);
  }

  // ---------------------------------------------------------------- the funicular up to the falls
  const lift = (() => {
    const fr = net.roads.find((r) => r.lift);
    if (!fr) return null;
    const { x0, z0, x1, z1 } = LIFT;
    const L = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const yb = surf(x0, z0) + 1.2, yt = siteGround('falls') - 0.4;
    const M = Math.ceil(L / 3);
    const ys: number[] = [];
    for (let k = 0; k <= M; k++) {
      const t = k / M;
      ys.push(Math.max(yb + (yt - yb) * t, surf(x0 + dx * L * t, z0 + dz * L * t) + 0.9));
    }
    // two rails on sleepers, trestles down to the ground where it dips
    const rot = Math.atan2(-dz, dx);
    for (let k = 0; k < M; k++) {
      const t0 = k / M, t1 = (k + 1) / M;
      const ax = x0 + dx * L * t0, az = z0 + dz * L * t0, bx = x0 + dx * L * t1, bz = z0 + dz * L * t1;
      const seg = Math.hypot(bx - ax, bz - az);
      for (const side of [-0.8, 0.8]) {
        _m.makeRotationZ(Math.atan2(ys[k + 1] - ys[k], seg));
        _m.premultiply(new THREE.Matrix4().makeRotationY(rot));
        _m.setPosition((ax + bx) / 2 - dz * side, (ys[k] + ys[k + 1]) / 2, (az + bz) / 2 + dx * side);
        _m.scale(_s.set(Math.hypot(seg, ys[k + 1] - ys[k]) + 0.05, 0.16, 0.14));
        props.add(box, _m, _c.setHex(0x6d6a66));
      }
      put(props, ax, ys[k] - 0.3, az, 0.35, 0.3, 2.4, rot, 0x5a4636);
      const g = surf(ax, az);
      if (k % 2 === 0 && ys[k] - g > 1.2) put(props, ax, g - 0.5, az, 0.5, ys[k] - g + 0.2, 0.5, rot, 0x8f8a82);
      if (k % 4 === 0) lights.add(ax - dz * 1.4, ys[k] + 0.6, az + dx * 1.4, 0xfff0c8, 1.4, 0);
    }
    // the stations: a little hut at the bottom (where the road ends) and at the top
    put(props, x0 - dx * 3, yb - 1.4, z0 - dz * 3, 8, 4.2, 6, rot, 0xe9e2d4);
    put(props, x0 - dx * 3, yb + 2.8, z0 - dz * 3, 9, 0.6, 7, rot, 0xb5553a);
    lights.add(x0 - dx * 3, yb + 2.6, z0 - dz * 3, 0xffc070, 2.4, 0.04);
    // the car: a red cabin with a lit window band, stepped to stay level on the slope
    const cm = new Mesher();
    cm.at(new THREE.BoxGeometry(4.2, 2.6, 2.4).translate(0, 1.6, 0), 0, 0, 0, 0xc8402e);
    cm.at(new THREE.BoxGeometry(4.4, 0.4, 2.6).translate(0, 3.1, 0), 0, 0, 0, 0xf2eee6);
    const car = new THREE.Mesh(cm.geometry(), litMaterial(u));
    const wm = new Mesher();
    wm.at(new THREE.BoxGeometry(4.25, 0.7, 2.45).translate(0, 2.0, 0), 0, 0, 0, 0xffd27a);
    const win = new THREE.Mesh(wm.geometry(), glowMaterial(u));
    car.add(win);
    car.rotation.y = rot;
    car.matrixAutoUpdate = true;
    return {
      car,
      update(t: number) {
        // up, wait, down, wait: 70 s round trip
        const ph = (t / 70) % 1;
        const k = ph < 0.42 ? ph / 0.42 : ph < 0.5 ? 1 : ph < 0.92 ? 1 - (ph - 0.5) / 0.42 : 0;
        const e = k * k * (3 - 2 * k);
        const f = e * M, ki = Math.min(M - 1, Math.floor(f)), ft = f - ki;
        car.position.set(x0 + dx * L * e, ys[ki] + (ys[ki + 1] - ys[ki]) * ft, z0 + dz * L * e);
      },
    };
  })();

  // ---------------------------------------------------------------- city streets over the bridges, and the alleys
  for (const b of plan.bridges) {
    if (net.bridges.includes(b) || Math.abs(b.rot) > 0.01) continue;
    const kind = b.w > 20 ? Kind.Avenue : Kind.Street;
    // over the deck, on ramps up from the street either side
    const x0 = b.x - b.len / 2 - 16, x1 = b.x + b.len / 2 + 16;
    const lo = (x: number) => Math.max(surf(x, b.z - b.w / 2), surf(x, b.z), surf(x, b.z + b.w / 2));
    const deck = b.y - LIFT_Y[kind] + 0.06;
    rib.strip(kind, x0, b.z, x1, b.z, [[0, lo(x0)], [16, deck], [16 + b.len, deck], [32 + b.len, lo(x1)]], HALF[kind]);
  }
  for (const [x0, z, x1] of plan.alleys) {
    let y = -Infinity;
    for (let x = x0; x <= x1; x += 3) for (const dz of [-3, 0, 3]) y = Math.max(y, surf(x, z + dz));
    rib.strip(Kind.Alley, x0, z, x1, z, [[0, y], [x1 - x0, y]], HALF[Kind.Alley]);
    // paper lanterns strung across, red, orange and pink
    for (let x = x0 + 2.5, k = 0; x < x1 - 2; x += 5, k++) lights.add(x, y + 5.4 + (k % 2) * 0.4, z + (k % 2 ? 1.6 : -1.6), [0xff4a3a, 0xff9a3a, 0xff5a9a][k % 3], 1.8, 0.1);
  }

  const ribbons = new THREE.Mesh(rib.geometry(), ribbonMaterial(u));
  ribbons.matrixAutoUpdate = false;
  group.add(ribbons);
  if (!props.empty) group.add(new THREE.Mesh(props.geometry(), litMaterial(u)));
  if (!glows.empty) group.add(new THREE.Mesh(glows.geometry(), glowMaterial(u)));
  const lp = lights.points(u);
  group.add(lp.pts);
  const cars = traffic(u, laid);
  if (cars) group.add(cars.pts);
  if (lift) group.add(lift.car);
  return {
    group,
    update(t) {
      lift?.update(t);
    },
    setPixelScale(h) {
      lp.px.value = h / 1000;
      if (cars) cars.px.value = h / 1000;
    },
  };
}

// ------------------------------------------------------------------ the city's street grid, for the terrain shader
/**
 * Where the city's streets run, for the terrain shader: one vec4 per grid line (x-lines first, then
 * z-lines): start and end along it, avenue (1) or street (0), and its neon colour.
 */
export function streetUniforms() {
  const lines = streetLines();
  const { i0, j0, n } = gridRange();
  const data: THREE.Vector4[] = [];
  for (const axis of [0, 1] as const)
    for (let k = 0; k < n; k++) {
      const l = lines.find((q) => q.axis === axis && q.k === (axis === 0 ? i0 : j0) + k);
      data.push(new THREE.Vector4(l ? l.a : 1, l ? l.b : 0, l?.avenue ? 1 : 0, (k * 7) % 3 === 1 ? 1 : 0));
    }
  return {
    uLines: { value: data },
    uLineK: { value: new THREE.Vector4(i0, j0, n, n) },
    count: 2 * n,
  };
}

/** Grid origin and spacing, as the terrain shader takes it. */
export const GRID_UNIFORM = () => new THREE.Vector4(GRID_X0, GRID_Z0, BLOCK, CITY_Y);
