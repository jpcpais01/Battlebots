import * as THREE from 'three';
import { LAKE, POND, RIVER, CITY_Y } from './layout';
import { MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';
import { FINE, type HeightGrid } from './terrain';

/**
 * The water: the sea out to the horizon (turquoise over the sand and the reef, deep blue beyond,
 * surf breaking on every beach, the low sun's path glittering on it), and the fresh water inland:
 * the river from the hills to the sea, the falls, the lake above them and the park pond.
 */

const FAR = 5200;

/** Sky colour reflected in water looking along `r` (shared by the sea and the river). */
const SKY_GLSL = /* glsl */ `
  vec3 skyRefl(vec3 r) {
    return skyCol(r);
  }
  // a wave normal from two scrolling noise layers
  vec3 waveN(vec2 xz, float k) {
    vec2 a = texture2D(uNoise, xz / 61.0 + vec2(uTime * 0.011, uTime * 0.007)).rg;
    vec2 b = texture2D(uNoise, xz / 23.0 - vec2(uTime * 0.017, -uTime * 0.012)).rg;
    vec2 g = (a - 0.5) * 0.9 + (b - 0.5) * 0.7;
    return normalize(vec3(g.x * k, 1.0, g.y * k));
  }
`;

export function buildSea(u: MapUniforms, ground: { depth: THREE.Texture; grid: HeightGrid }) {
  const depth = ground.depth;
  const group = new THREE.Group();
  // (a grid rather than one quad: the fog and the depth map are smoother sampled per vertex at a distance)
  const g = new THREE.PlaneGeometry(2 * FAR, 2 * FAR, 48, 48).rotateX(-Math.PI / 2);
  const mat = mapMaterial(u, {
    uniforms: { uDepth: { value: depth }, uFine: { value: FINE } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${SKY_GLSL}
      uniform sampler2D uDepth;
      uniform float uFine;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 w = vWorld;
        vec2 uv = w.xz / (2.0 * uFine) + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec4 dm = texture2D(uDepth, clamp(uv, 0.0, 1.0));
        // depth 0 (shore) .. 1 (24 m and more)
        float d = mix(1.0, dm.r, inside);
        vec3 V = normalize((cameraPosition - uMapShift) - w);
        float px = length(fwidth(w.xz));
        // calmer, smoother water far off (and no shimmering ripples smaller than a pixel)
        vec3 n = waveN(w.xz, mix(0.5, 0.05, smoothstep(2.0, 18.0, px)));
        float shade = cloudShade(w.xz);
        // the colour of the water itself: clear turquoise over the sand, deep blue further out
        vec3 shallow = vec3(0.18, 0.72, 0.68);
        vec3 mid = vec3(0.05, 0.38, 0.52);
        vec3 deep = vec3(0.02, 0.14, 0.3);
        vec3 body = mix(shallow, mid, smoothstep(0.0, 0.25, d));
        body = mix(body, deep, smoothstep(0.25, 1.0, d));
        // sand and reef showing through the shallows
        float reef = texture2D(uNoise, w.xz / 90.0).a;
        body = mix(body, vec3(0.55, 0.7, 0.5), (1.0 - smoothstep(0.0, 0.1, d)) * 0.45);
        body *= mix(1.0, 0.82 + 0.3 * reef, (1.0 - smoothstep(0.02, 0.2, d)) * 0.6);
        body *= ambient(vec3(0.0, 1.0, 0.0)) * 1.15 + uSunCol * 0.35 * uSunDir.y * shade;
        // the sky reflected (more of it at grazing angles)
        vec3 r = reflect(-V, n);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
        vec3 c = mix(body, skyRefl(r) * mix(0.75, 1.0, shade), clamp(fres, 0.0, 1.0) * 0.85);
        // the sun's path: a broad sheen and the glitter in it
        float sd = max(dot(r, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 90.0) * 0.6 + pow(sd, 900.0) * 6.0) * shade;
        // surf: bands rolling in to every shore, breaking into foam at the water's edge
        float shore = 1.0 - smoothstep(0.0, 0.07, d);
        float band = sin(d * 260.0 - uTime * 1.6 + reef * 6.0);
        float foam = shore * smoothstep(0.55, 0.95, band) * (0.5 + 0.5 * texture2D(uNoise, w.xz / 9.0 + uTime * 0.02).r);
        foam = max(foam, 1.0 - smoothstep(0.0, 0.012, d - 0.002 * sin(uTime * 1.3 + w.x * 0.05)));
        c = mix(c, vec3(0.96, 0.97, 0.95) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.45 * shade), clamp(foam, 0.0, 1.0) * inside * 0.9);
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
  const sea = new THREE.Mesh(g, mat);
  sea.matrixAutoUpdate = false;
  sea.updateMatrix();
  // drawn after the land, so the hidden sea floor costs nothing
  sea.renderOrder = 1;
  group.add(sea);
  group.add(freshWater(u, ground.grid));
  return group;
}

// ------------------------------------------------------------------ river, lake, pond
/**
 * Fresh water: one mesh for the river (a ribbon down its bed, eight strips across, trimmed to its
 * banks), the lake and the park pond. Attributes: aFlow (distance along the river, distance across
 * it, how fast it runs, how much of it is falling white water) and aBed (which way it flows, how deep
 * it is there, and how much it is still churning from a fall upstream). The lake and the pond use
 * the same shader, as slow water drifting south.
 */
function freshWater(u: MapUniforms, grid: HeightGrid) {
  const pos: number[] = [], flow: number[] = [], bed: number[] = [], idx: number[] = [];
  const vert = (x: number, y: number, z: number, s: number, across: number, speed: number, fall: number, dx: number, dz: number, depth: number, churn: number) => {
    pos.push(x, y, z);
    flow.push(s, across, speed, fall);
    bed.push(dx, dz, depth, churn);
    return pos.length / 3 - 1;
  };
  // the river, resampled every few metres from the source to the sea
  const pts: { x: number; z: number; y: number; w: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / 5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, s: s + L * t });
    }
    s += L;
  }
  const end = RIVER[RIVER.length - 1];
  pts.push({ x: end.x, z: end.z, y: end.y, w: end.w, s });
  // round off the corners where the course turns (the levels stay as they are, so the falls
  // keep their edge), and measure the distance along it again
  for (let pass = 0; pass < 3; pass++) {
    const q = pts.map((p) => ({ x: p.x, z: p.z }));
    for (let i = 2; i < pts.length - 2; i++) {
      pts[i].x = (q[i - 2].x + q[i - 1].x * 2 + q[i].x * 3 + q[i + 1].x * 2 + q[i + 2].x) / 9;
      pts[i].z = (q[i - 2].z + q[i - 1].z * 2 + q[i].z * 3 + q[i + 1].z * 2 + q[i + 2].z) / 9;
    }
  }
  for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  // each row across: its frame, how steeply it drops (over a few rows, so the water eases from
  // calm to rapids to falls rather than switching at a corner), and how far each side reaches
  const ACROSS = 8;
  const rows = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    let drop = 0;
    for (let k = -2; k <= 2; k++) {
      const j = Math.min(pts.length - 2, Math.max(0, i + k));
      const c = pts[j], e = pts[j + 1];
      drop += (c.y - e.y) / (Math.hypot(e.x - c.x, e.z - c.z) || 1) / 5;
    }
    const hw = p.w * 0.5 * 1.25 + 2;
    // (kept above the bottom of the channel where the ground grid is too coarse to carve a narrow one)
    const y = Math.max(p.y - 0.25, grid.at(p.x, p.z) + 0.4);
    const nx = -dz / l, nz = dx / l;
    const depthAt = (f: number) => y - grid.at(p.x + nx * hw * f, p.z + nz * hw * f);
    // each side reaches out until it runs under the bank, so the shore is wherever the ground
    // rises out of the water; but where the ground falls away below the water instead (the river
    // crossing a slope), that side stops short rather than leave a shelf of water hanging in the
    // air (not under a free fall, which hangs off the cliff by right)
    const ext = [1, 1];
    const mid = depthAt(0);
    if (mid < 6) {
      const allowed = Math.max(mid, 2.35) + 0.6;
      for (let side = 0; side < 2; side++)
        for (let k = 1; k <= ACROSS * 2; k++) {
          const f = k / ACROSS, d = depthAt((side ? 1 : -1) * f);
          if (d > allowed) {
            ext[side] = Math.max(0.3, f - 1 / ACROSS + 0.06);
            break;
          }
          if (d < -0.4) {
            ext[side] = Math.max(1, f);
            break;
          }
        }
    }
    return {
      y, hw, nx, nz, tx: dx / l, tz: dz / l, ext,
      fall: Math.min(1, Math.max(0, (drop - 0.3) * 1.3)),
      speed: 0.6 + Math.min(4, drop * 25),
      churn: 0,
      // the lake covers the river where it runs into and out of it
      inLake: Math.hypot(p.x - LAKE.x, (p.z - LAKE.z) * 1.25) < LAKE.r * 1.05,
    };
  });
  // white water keeps churning for a while below a fall
  for (let i = 0; i < rows.length; i++) rows[i].churn = Math.max(rows[i].fall, i ? rows[i - 1].churn * Math.exp(-(pts[i].s - pts[i - 1].s) / 40) : 0);
  // (the banks smoothed out along the river, so a trimmed side doesn't zigzag)
  const ext = rows.map((_, i) => [0, 1].map((side) => {
    let e = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(rows.length - 1, i + 2); j++, n++) e += rows[j].ext[side];
    return e / n;
  }));
  let prev = -1;
  for (let i = 0; i < rows.length; i++) {
    const p = pts[i], r = rows[i];
    const f0 = -ext[i][0], f1 = ext[i][1];
    const first = pos.length / 3;
    for (let k = 0; k <= ACROSS; k++) {
      const f = f0 + ((f1 - f0) * k) / ACROSS;
      const x = p.x + r.nx * r.hw * f, z = p.z + r.nz * r.hw * f;
      vert(x, r.y, z, p.s, f * r.hw, r.speed, r.fall, r.tx, r.tz, r.y - grid.at(x, z), r.churn);
    }
    if (prev >= 0 && !r.inLake && !rows[i - 1].inLake)
      for (let k = 0; k < ACROSS; k++) idx.push(prev + k, first + k, prev + k + 1, prev + k + 1, first + k, first + k + 1);
    prev = first;
  }
  // the lake and the pond: rings out from the middle (so the depth under them reads properly),
  // the lake's trimmed back from its outfall where the ground drops away down the cliff
  const pool = (cx: number, cz: number, rx: number, rz: number, y: number, depth: (x: number, z: number, q: number) => number, trim: number) => {
    const N = 64, R = [0, 0.3, 0.5, 0.62, 0.72, 0.8, 0.86, 0.91, 0.955, 1];
    const reach: number[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      let e = 1;
      for (let q = 0.5; q <= 1.001; q += 0.05)
        if (depth(cx + Math.cos(a) * rx * q, cz + Math.sin(a) * rz * q, q) > trim) {
          e = q - 0.05;
          break;
        }
      reach.push(e);
    }
    const first = pos.length / 3;
    for (const ring of R)
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const e = (reach[(k + N - 1) % N] + reach[k] * 2 + reach[(k + 1) % N]) / 4;
        const x = cx + Math.cos(a) * rx * ring * e, z = cz + Math.sin(a) * rz * ring * e;
        vert(x, y, z, z, -x, 0.3, 0, 0, 1, depth(x, z, ring * e), 0);
      }
    for (let j = 0; j < R.length - 1; j++)
      for (let k = 0; k < N; k++) {
        const a = first + j * N + k, b = first + j * N + ((k + 1) % N);
        idx.push(a, b, a + N, b, b + N, a + N);
      }
  };
  const lakeY = LAKE.y - 0.3;
  pool(LAKE.x, LAKE.z, LAKE.r * 1.3, (LAKE.r * 1.3) / 1.25, lakeY, (x, z) => lakeY - grid.at(x, z), 5);
  // (the pond is barely below the park; it's given a gentle bowl of its own)
  pool(POND.x, POND.z, POND.r, POND.r * 0.8, CITY_Y + 0.12, (_x, _z, q) => 1.8 * (1 - q * q) - 0.15, 99);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 4));
  g.setAttribute('aBed', new THREE.Float32BufferAttribute(bed, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec4 aFlow, aBed;
      varying vec3 vWorld;
      varying vec4 vFlow, vBed;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vFlow = aFlow;
        vBed = aBed;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${SKY_GLSL}
      varying vec3 vWorld;
      varying vec4 vFlow, vBed;
      #include <fog_pars_fragment>
      // The pattern on the water carried downstream at vel (m/s), through flow space p (metres
      // across, metres along). Two copies slide along and cross-fade, each starting over every
      // couple of seconds from a fresh spot, so water running fast mid-channel and slow by the banks
      // never drags the pattern out into smears however long the map is open.
      vec4 drift(vec2 p, float vel, vec2 scale, float seed) {
        const float RATE = 0.45;
        float t = uTime * RATE + seed;
        float f0 = fract(t), f1 = fract(t + 0.5);
        vec4 a = texture2D(uNoise, (p - vec2(0.0, f0 * vel / RATE)) * scale + floor(t) * vec2(0.37, 0.61));
        vec4 b = texture2D(uNoise, (p - vec2(0.0, f1 * vel / RATE)) * scale + floor(t + 0.5) * vec2(0.71, 0.29) + 0.5);
        float k = abs(1.0 - 2.0 * f0);
        // (the blend of two loses contrast mid-way; stretched back so it doesn't pulse)
        return (mix(a, b, k) - 0.5) * inversesqrt(k * k + (1.0 - k) * (1.0 - k)) + 0.5;
      }
      void main() {
        vec3 w = vWorld;
        vec3 V = normalize((cameraPosition - uMapShift) - w);
        vec2 dir = normalize(vBed.xy);
        vec3 along = vec3(dir.x, 0.0, dir.y), across = vec3(-dir.y, 0.0, dir.x);
        float d = max(vBed.z, 0.0);
        float speed = vFlow.z, fall = vFlow.w, churn = vBed.w;
        // (ripples smaller than a pixel would only shimmer)
        float lod = 1.0 - smoothstep(1.5, 12.0, length(fwidth(w.xz)));
        // the current: fastest down the deep middle, held back over the shallows
        float vel = speed * 3.2 * mix(0.35, 1.0, smoothstep(0.2, 2.0, d));
        vec2 p = vFlow.yx;
        // (long swirls a few metres across, and the fine chop on them drawn out down the current)
        vec4 big = drift(p, vel, vec2(1.0 / 90.0, 1.0 / 200.0), 0.0);
        vec4 fine = drift(p, vel * 1.15, vec2(1.0 / 24.0, 1.0 / 150.0), 0.37);
        // a slow pattern that stays put: the stones on the bed, and the standing waves over them
        vec4 still = texture2D(uNoise, w.xz / 80.0 + uTime * vec2(0.002, 0.0013));
        float rapid = smoothstep(1.3, 3.8, speed) * (1.0 - fall);
        vec2 g = (big.rg - 0.5) * vec2(1.3, 0.8) + (fine.rg - 0.5) * 0.8;
        g.y += cos(vFlow.x * 0.6 + still.g * 8.0) * 0.4 * rapid;
        vec3 n = normalize(vec3(0.0, 1.0, 0.0) + (across * g.x + along * g.y) * (0.3 + 0.55 * rapid + 0.5 * churn) * lod);
        // light: the valley walls' shadows and the clouds' fall across it
        float sun = sunShadow(w + vec3(0.0, 1.0, 0.0)) * cloudShade(w.xz);
        vec3 amb = ambient(vec3(0.0, 1.0, 0.0));
        // the water itself: glacial teal down the deep channel, clear green over the shallows, the
        // stony bed showing through near the banks with the sun's caustics rippling over it
        vec3 body = mix(vec3(0.12, 0.42, 0.38), vec3(0.025, 0.17, 0.22), smoothstep(0.2, 2.6, d));
        float clear = exp(-d * 1.2);
        body = mix(body, vec3(0.46, 0.42, 0.33) * (0.7 + 0.6 * still.a), clear * 0.7);
        body *= amb * 1.15 + uSunCol * 0.4 * sun;
        float caus = 1.0 - smoothstep(0.0, 0.035, abs(fine.r - still.r));
        body += uSunCol * caus * clear * clear * 0.3 * sun * lod;
        // the sky in it, the sun's highlight, and glitter carried off down the current
        vec3 r = reflect(-V, n);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
        vec3 c = mix(body, skyRefl(r) * mix(0.7, 1.0, sun), clamp(fres, 0.0, 1.0) * 0.85);
        float sd = max(dot(r, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 70.0) * 0.3 + pow(sd, 600.0) * 4.0) * sun;
        c += uSunCol * smoothstep(0.8, 0.96, fine.a) * pow(sd, 12.0) * 2.5 * sun * lod;
        // foam
        vec3 white = vec3(0.93, 0.96, 1.0) * (amb * 1.1 + uSunCol * 0.55 * sun);
        float fn = big.a * 0.6 + fine.a * 0.4;
        // lace along the banks where the current tears at the shallows (on still water, a thin line
        // lapping in and out at the shore)
        float run = min(speed, 1.0);
        float edge = 1.0 - smoothstep(0.0, mix(0.15, 0.8, run), d + (1.0 - run) * 0.08 * sin(uTime * 1.3 + still.g * 12.0));
        float foam = edge * smoothstep(0.55, 0.8, fn + edge * 0.3) * mix(0.35, 0.8, run);
        // bubbles riding the current in long lines; whitecaps all over the rapids
        float moving = smoothstep(0.5, 1.2, speed);
        foam = max(foam, smoothstep(0.66, 0.84, fine.a) * 0.35 * moving * (1.0 - rapid));
        foam = max(foam, smoothstep(0.7 - 0.25 * rapid, 0.9 - 0.15 * rapid, fn) * (0.25 + 0.75 * rapid) * moving);
        // the water boiling white below a fall, breaking up as it drifts on downstream
        float boil = churn * (1.0 - fall);
        foam = max(foam, boil * smoothstep(0.6 - boil * 0.5, 0.85 - boil * 0.3, fn));
        c = mix(c, white * (0.85 + 0.15 * fine.g), clamp(foam, 0.0, 1.0) * 0.92);
        // over a fall: ropes of white water pouring down, with glimpses of the dark water between,
        // lit by how the face of the fall itself turns to the sun
        vec3 face = normalize(cross(dFdx(w), dFdy(w)));
        face *= sign(face.y + 1e-4);
        vec3 lit = vec3(0.93, 0.96, 1.0) * (ambient(face) * 1.15 + uSunCol * 0.6 * max(dot(face, uSunDir), 0.0) * sun);
        vec4 rope = texture2D(uNoise, vec2(vFlow.y / 22.0, vFlow.x / 70.0 - uTime * 0.38));
        float wf = clamp(fall * 1.15, 0.0, 1.0);
        float sheet = mix(0.55, 1.08, smoothstep(0.25, 0.7, rope.g * 0.7 + rope.r * 0.3)) * (0.85 + 0.15 * fine.a);
        float pour = smoothstep(0.3, 0.6, rope.g * 0.5 + fn * 0.5 + (wf - 0.9) * 2.0);
        c = mix(c, lit * sheet, wf * mix(smoothstep(0.35, 0.6, fn), 1.0, wf) * mix(0.5, 1.0, pour));
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
    side: THREE.DoubleSide,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -2;
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  return m;
}
