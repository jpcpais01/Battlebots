import * as THREE from 'three';
import { LAKE, POND, RIVER, CITY_Y } from './layout';
import { MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';
import { FINE } from './terrain';

/**
 * The water: the sea out to the horizon (turquoise over the sand and the reef, deep blue beyond,
 * surf breaking on every beach, the low sun's path glittering on it), and the fresh water inland:
 * the river from the hills to the sea, the falls, the lake above them and the park pond.
 */

const FAR = 5200;

/** Sky colour reflected in water looking along `r` (shared by the sea and the river). */
const SKY_GLSL = /* glsl */ `
  vec3 skyRefl(vec3 r) {
    float up = clamp(r.y, 0.0, 1.0);
    vec3 horizon = vec3(1.0, 0.82, 0.68);
    vec3 zenith = vec3(0.32, 0.5, 0.86);
    vec3 c = mix(horizon, zenith, pow(up, 0.55));
    // the sun's glow in the sky towards it
    c += vec3(1.0, 0.7, 0.4) * pow(max(dot(normalize(r), uSunDir), 0.0), 8.0) * 0.8;
    return c;
  }
  // a wave normal from two scrolling noise layers
  vec3 waveN(vec2 xz, float k) {
    vec2 a = texture2D(uNoise, xz / 61.0 + vec2(uTime * 0.011, uTime * 0.007)).rg;
    vec2 b = texture2D(uNoise, xz / 23.0 - vec2(uTime * 0.017, -uTime * 0.012)).rg;
    vec2 g = (a - 0.5) * 0.9 + (b - 0.5) * 0.7;
    return normalize(vec3(g.x * k, 1.0, g.y * k));
  }
`;

export function buildSea(u: MapUniforms, depth: THREE.Texture) {
  const group = new THREE.Group();
  // (a grid rather than one quad: the fog and the depth map are smoother sampled per vertex at a distance)
  const g = new THREE.PlaneGeometry(2 * FAR, 2 * FAR, 48, 48).rotateX(-Math.PI / 2);
  const mat = mapMaterial(u, {
    uniforms: { uDepth: { value: depth }, uFine: { value: FINE } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
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
        vec3 V = normalize(cameraPosition - w);
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
  group.add(freshWater(u));
  return group;
}

// ------------------------------------------------------------------ river, lake, pond
/**
 * Fresh water: one mesh for the river (a ribbon down its bed, flowing, white where it falls), the
 * lake and the park pond. Attributes: aFlow (distance along the river, how fast it runs, how much
 * of it is falling white water).
 */
function freshWater(u: MapUniforms) {
  const pos: number[] = [], flow: number[] = [], idx: number[] = [];
  const vert = (x: number, y: number, z: number, s: number, speed: number, fall: number) => {
    pos.push(x, y, z);
    flow.push(s, speed, fall);
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
  let prev: [number, number] | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    // the lake covers the river where it runs through it
    const inLake = Math.hypot(p.x - LAKE.x, (p.z - LAKE.z) * 1.25) < LAKE.r * 0.8;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const drop = (a.y - b.y) / l;
    const fall = Math.min(1, Math.max(0, (drop - 0.25) * 1.5));
    const speed = 0.6 + Math.min(4, drop * 25);
    // a touch wider than the bed, tucked into the banks either side
    const hw = p.w * 0.5 * 1.25 + 2;
    const y = p.y - 0.25;
    const l0 = vert(p.x + nx * hw, y, p.z + nz * hw, p.s, speed, fall);
    const r0 = vert(p.x - nx * hw, y, p.z - nz * hw, p.s, speed, fall);
    if (prev && !inLake) idx.push(prev[0], l0, prev[1], prev[1], l0, r0);
    prev = [l0, r0];
  }
  // the lake (an ellipse) and the pond
  const disc = (cx: number, cz: number, rx: number, rz: number, y: number) => {
    const c = vert(cx, y, cz, 0, 0, 0);
    const N = 48;
    const first = pos.length / 3;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      vert(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz, 0, 0, 0);
    }
    for (let k = 0; k < N; k++) idx.push(c, first + ((k + 1) % N), first + k);
  };
  disc(LAKE.x, LAKE.z, LAKE.r * 1.3, (LAKE.r * 1.3) / 1.25, LAKE.y - 0.3);
  disc(POND.x, POND.z, POND.r, POND.r * 0.8, CITY_Y + 0.12);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 aFlow;
      varying vec3 vWorld, vFlow;
      #include <fog_pars_vertex>
      void main() {
        vFlow = aFlow;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${SKY_GLSL}
      varying vec3 vWorld, vFlow;
      #include <fog_pars_fragment>
      void main() {
        vec3 w = vWorld;
        vec3 V = normalize(cameraPosition - w);
        float shade = cloudShade(w.xz);
        // the current: streaks carried downstream
        float run = vFlow.x - uTime * vFlow.y * 6.0;
        float streak = texture2D(uNoise, vec2(run / 40.0, w.x / 30.0 + w.z / 47.0)).r;
        vec3 n = waveN(w.xz + vec2(0.0, run * 0.3), 0.35);
        vec3 body = vec3(0.07, 0.36, 0.42) * (ambient(vec3(0.0, 1.0, 0.0)) * 1.2 + uSunCol * 0.3 * shade);
        vec3 r = reflect(-V, n);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
        vec3 c = mix(body, skyRefl(r) * mix(0.75, 1.0, shade), clamp(fres, 0.0, 1.0) * 0.8);
        c += uSunCol * pow(max(dot(r, uSunDir), 0.0), 300.0) * 3.0 * shade;
        c += vec3(0.6, 0.7, 0.7) * smoothstep(0.62, 0.9, streak) * 0.18 * min(1.0, vFlow.y);
        // over the falls the water goes white
        float white = vFlow.z * (0.75 + 0.25 * texture2D(uNoise, vec2(w.x / 7.0, run / 9.0)).g);
        c = mix(c, vec3(0.95, 0.97, 1.0) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4 * shade), clamp(white, 0.0, 1.0));
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
