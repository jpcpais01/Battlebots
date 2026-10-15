import * as THREE from 'three';
import { CITY_Y, DOWNTOWN } from './layout';
import { HOLO_PLAZA, Style, type Box } from './plan';
import { AA_GLSL, MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';

/**
 * The holograms over downtown, all additive light drawn in scanlines that never write depth: the
 * koi circling the towers, a whale swimming slow laps high round the mega-towers, jellyfish
 * drifting between them, a giant holographic fighting robot shadow-boxing in the plaza in front
 * of them, and glitching adverts projected off the tall towers. Brighter at night.
 */

/** Shared by every hologram: how bright they are (more at night) and the scanline. */
const HOLO_GLSL = /* glsl */ `
  float holoLevel() { return uGlow * mix(1.0, 1.5, uNight); }
  float scanline(float y, float speed) { return 0.6 + 0.4 * step(0.5, fract(y * 0.5 - uTime * speed)); }
`;

function holoMaterial(u: MapUniforms, vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform> = {}) {
  return mapMaterial(u, {
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ swimmers (koi and whale)
/**
 * A swimming body along -x from its nose (0) to its tail (1), as rings (uv.y round the ring) plus
 * flat fins (uv.y 2, uv.x where along they hang).
 */
function swimmer(radius: (t: number) => number, sq: number, fins: number[][][]) {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const SEG = 32, RING = 10;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const r = radius(t);
    for (let j = 0; j <= RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      pos.push(-t, Math.sin(a) * r, Math.cos(a) * r * sq);
      uvs.push(t, j / RING);
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RING; j++) {
      const a = i * (RING + 1) + j, b = a + RING + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  for (const pts of fins) {
    const base = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]);
      uvs.push(-p[0], 2);
    }
    for (let k = 1; k < pts.length - 1; k++) idx.push(base, base + k, base + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A giant holographic koi swimming slow circles round the mega-towers downtown: a ribbon body and fins
 * that ripple as it swims.
 */
function holoKoi(u: MapUniforms) {
  const g = swimmer(
    (t) => Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.12 * (t < 0.8 ? 1 : 1 - (t - 0.8) * 3) + 0.01,
    0.73,
    [
      [[-0.92, 0, 0], [-1.15, 0.2, 0], [-1.22, 0.05, 0], [-1.22, -0.05, 0], [-1.15, -0.2, 0]],
      [[-0.25, -0.05, 0.08], [-0.4, -0.12, 0.3], [-0.48, -0.06, 0.22]],
      [[-0.25, -0.05, -0.08], [-0.48, -0.06, -0.22], [-0.4, -0.12, -0.3]],
    ],
  );
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(DOWNTOWN.x, 160, DOWNTOWN.z), 260);
  const mat = holoMaterial(
    u,
    /* glsl */ `
      uniform float uTime;
      uniform vec3 uCentre;
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        float L = 90.0;
        float R = 160.0;
        // swims a slow circle; the body follows the circle and ripples side to side
        float a0 = uTime * 0.075;
        float t = -position.x;
        float a = a0 - t * L / R;
        float wig = sin(uTime * 2.2 - t * 5.0) * 0.06 * (0.3 + t);
        float rr = R + wig * L;
        vec3 c = uCentre + vec3(cos(a) * rr, sin(uTime * 0.4 - t * 2.0) * 6.0, sin(a) * rr);
        vec3 side = vec3(cos(a), 0.0, sin(a));
        vec3 p = c + vec3(0.0, position.y * L, 0.0) + side * position.z * L;
        vN = normalize(side * position.z + vec3(0.0, position.y, 0.0) + 1e-4);
        vWorld = p;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${HOLO_GLSL}
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      #include <fog_pars_fragment>
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = vUv.y > 1.5 ? 0.6 : pow(1.0 - abs(dot(V, normalize(vN))), 2.0);
        // koi patches: orange on white-cyan
        float spot = step(0.55, texture2D(uNoise, vUv * vec2(1.3, 0.5) + 0.3).g);
        vec3 col = mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 0.45, 0.25), spot);
        float k = (0.25 + rim) * scanline(vWorld.y, 2.0) * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.x * 9.0));
        gl_FragColor = vec4(col * k * holoLevel() * 0.18, 1.0);
        ${MAP_OUT}
      }`,
    // (a circle round all four mega-towers, clear of each)
    { uCentre: { value: new THREE.Vector3(-15, 150, -120) } },
  );
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5;
  return m;
}

/**
 * A humpback whale, 170 m long, swimming long slow laps high round the mega-towers: its body
 * rising and falling as it swims, long pectoral fins, grooves down its throat.
 */
function holoWhale(u: MapUniforms) {
  const g = swimmer(
    (t) => {
      // a blunt head, a deep belly, a slim tail stock
      const body = Math.pow(Math.sin(Math.min(1, (t + 0.05) * 1.12) * Math.PI), 0.75) * 0.115;
      return Math.max(0.012, body * (t < 0.72 ? 1 : 1 - (t - 0.72) * 2.9));
    },
    0.85,
    [
      // flukes, flat (a whale's tail is level)
      [[-0.9, 0, 0], [-1.0, 0, 0.12], [-1.1, 0.01, 0.26], [-1.07, 0, 0.06], [-1.1, 0, 0], [-1.07, 0, -0.06], [-1.1, 0.01, -0.26], [-1.0, 0, -0.12]],
      // the long pectoral fins
      [[-0.24, -0.06, 0.08], [-0.34, -0.14, 0.36], [-0.44, -0.16, 0.46], [-0.36, -0.08, 0.12]],
      [[-0.24, -0.06, -0.08], [-0.36, -0.08, -0.12], [-0.44, -0.16, -0.46], [-0.34, -0.14, -0.36]],
      // a small dorsal fin
      [[-0.6, 0.075, 0], [-0.66, 0.12, 0], [-0.7, 0.07, 0]],
    ],
  );
  const C = new THREE.Vector3(-10, 330, -150);
  g.boundingSphere = new THREE.Sphere(C.clone(), 420);
  const mat = holoMaterial(
    u,
    /* glsl */ `
      uniform float uTime;
      uniform vec3 uCentre;
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      varying float vBelly;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        float L = 170.0;
        vec2 R = vec2(300.0, 225.0);
        float t = -position.x;
        // round an ellipse, the body following the path
        float a = uTime * 0.03 - t * L / 262.0;
        vec3 c = uCentre + vec3(cos(a) * R.x, 0.0, sin(a) * R.y);
        vec3 fwd = normalize(vec3(-sin(a) * R.x, 0.0, cos(a) * R.y));
        vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        // the body heaves up and down as it swims, the tail most; the whole whale rises and dives slowly
        float heave = sin(uTime * 0.9 - t * 3.6) * 0.045 * (0.2 + t * t * 1.6);
        c.y += sin(uTime * 0.11 - t * 0.5) * 34.0 + heave * L;
        // the pectoral fins beat slowly
        float fin = step(1.5, uv.y) * step(0.2, t) * step(t, 0.5);
        float flap = fin * sin(uTime * 0.9 + 1.2) * 0.4 * abs(position.z) * 3.0;
        vec3 p = c + vec3(0.0, (position.y + flap * 0.15) * L, 0.0) - side * position.z * L;
        vN = normalize(-side * position.z + vec3(0.0, position.y, 0.0) + 1e-4);
        vBelly = -position.y;
        vWorld = p;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${HOLO_GLSL}
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      varying float vBelly;
      #include <fog_pars_fragment>
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        bool fin = vUv.y > 1.5;
        float rim = fin ? 0.5 : pow(1.0 - abs(dot(V, normalize(vN))), 2.2);
        vec2 px = fwidth(vUv);
        // a wire grid along and round the body, grooves along the throat
        float wire = fin ? 0.0 : max(fband(fract(vUv.x * 32.0), 0.0, 0.08, px.x * 32.0), fband(fract(vUv.y * 10.0), 0.0, 0.06, px.y * 10.0));
        float groove = fin ? 0.0 : fband(fract(vUv.y * 40.0), 0.0, 0.3, px.y * 40.0) * step(0.02, vBelly) * step(vUv.x, 0.55);
        vec3 deep = vec3(0.12, 0.42, 1.0), pale = vec3(0.55, 0.95, 1.0);
        vec3 col = mix(deep, pale, clamp(rim + wire * 0.8 + groove * 0.5, 0.0, 1.0));
        float k = (0.16 + rim * 0.9 + wire * 0.45 + groove * 0.25) * scanline(vWorld.y, 1.4);
        // a shimmer travelling down it
        k *= 0.8 + 0.35 * smoothstep(0.85, 1.0, fract(vUv.x * 1.5 - uTime * 0.35));
        gl_FragColor = vec4(col * k * holoLevel() * 0.15, 1.0);
        ${MAP_OUT}
      }`,
    { uCentre: { value: C } },
  );
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5;
  return m;
}

// ------------------------------------------------------------------ jellyfish
const JELLIES: [number, number, number, number][] = [
  // centre x, y, z, bell radius
  // (clear of the mega-towers, and above everything else)
  [142, 300, -46, 26],
  [-86, 272, 14, 22],
  [112, 384, -208, 24],
  [22, 424, -28, 20],
  [-194, 296, -106, 26],
  [-74, 344, -268, 24],
  [-176, 262, -208, 22],
  [28, 360, -280, 28],
];

/** Jellyfish drifting between the towers: pulsing bells trailing tentacles and frilled arms. */
function holoJellies(u: MapUniforms) {
  const pos: number[] = [], part: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, z: number, kind: number, along: number, ph: number) => {
    pos.push(x, y, z);
    part.push(kind, along, ph);
    return pos.length / 3 - 1;
  };
  // the bell: a dome with a flared rim
  const LAT = 9, LON = 20;
  for (let i = 0; i <= LAT; i++) {
    const phi = (i / LAT) * Math.PI * 0.55;
    const r = Math.sin(phi) * (1 + 0.08 * (i / LAT)), y = Math.cos(phi) * 0.75 - 0.05;
    for (let j = 0; j <= LON; j++) {
      const a = (j / LON) * Math.PI * 2;
      v(Math.cos(a) * r, y, Math.sin(a) * r, 0, i / LAT, j / LON);
    }
  }
  for (let i = 0; i < LAT; i++)
    for (let j = 0; j < LON; j++) {
      const a = i * (LON + 1) + j, b = a + LON + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // tentacles from round the rim and frilled arms from the middle: ribbons hanging down
  const ribbon = (x: number, z: number, len: number, wid: number, kind: number, ph: number) => {
    const N = 12;
    const ang = Math.atan2(z, x) + Math.PI / 2;
    const tx = Math.cos(ang) * wid, tz = Math.sin(ang) * wid;
    let prev: [number, number] | null = null;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const w = 1 - s * 0.7;
      const y = 0.1 - s * len;
      const a = v(x - tx * w, y, z - tz * w, kind, s, ph), b = v(x + tx * w, y, z + tz * w, kind, s, ph);
      if (prev) idx.push(prev[0], a, prev[1], prev[1], a, b);
      prev = [a, b];
    }
  };
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ribbon(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 2.6 + (k % 3) * 0.5, 0.04, 1, k * 0.73);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    ribbon(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 1.7, 0.22, 2, k * 1.9);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
  g.setIndex(idx);
  const inst: number[] = [], inst2: number[] = [];
  JELLIES.forEach(([x, y, z, r], i) => {
    inst.push(x, y, z, r);
    inst2.push(i * 1.37, i % 4, 8 + (i % 3) * 2, (i % 2 ? 1 : -1) * (0.05 + (i % 3) * 0.015));
  });
  g.setAttribute('aJelly', new THREE.InstancedBufferAttribute(new Float32Array(inst), 4));
  g.setAttribute('aJelly2', new THREE.InstancedBufferAttribute(new Float32Array(inst2), 4));
  g.instanceCount = JELLIES.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 300, -120), 420);
  const mat = holoMaterial(
    u,
    /* glsl */ `
      attribute vec3 aPart;
      attribute vec4 aJelly, aJelly2;
      uniform float uTime;
      varying vec3 vPart, vWorld, vN;
      varying float vHue;
      #include <fog_pars_vertex>
      void main() {
        vPart = aPart;
        vHue = aJelly2.y;
        float t = uTime + aJelly2.x * 10.0;
        // the bell pulses: squeezes in at the rim, and the jelly surges up a little with each beat
        float beat = sin(t * 1.5);
        vec3 p = position;
        if (aPart.x < 0.5) {
          float rim = aPart.y;
          p.xz *= 1.0 - 0.14 * beat * rim * rim;
          p.y *= 1.0 + 0.08 * beat;
        } else {
          // tentacles trail and sway, more towards their tips
          float s = aPart.y;
          p.x += sin(t * 1.1 + s * 3.5 + aPart.z) * s * 0.35;
          p.z += cos(t * 0.9 + s * 3.0 + aPart.z * 1.3) * s * 0.35;
          p.xz *= 1.0 - 0.1 * beat * (1.0 - s);
        }
        float R = aJelly.w;
        vec3 c = aJelly.xyz + vec3(cos(t * aJelly2.w) * aJelly2.z, sin(t * 0.3) * 14.0 + max(beat, 0.0) * 3.0, sin(t * aJelly2.w) * aJelly2.z);
        vec3 w = c + p * R;
        vN = normalize(position + vec3(0.0, 0.3, 0.0));
        vWorld = w;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${HOLO_GLSL}
      varying vec3 vPart, vWorld, vN;
      varying float vHue;
      #include <fog_pars_fragment>
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 col = vHue < 0.5 ? vec3(1.0, 0.35, 0.75) : vHue < 1.5 ? vec3(0.65, 0.45, 1.0) : vHue < 2.5 ? vec3(0.35, 0.95, 1.0) : vec3(1.0, 0.7, 0.4);
        float k;
        if (vPart.x < 0.5) {
          // the bell: bright rim and edge, radial canals, a glowing heart
          float rim = pow(1.0 - abs(dot(V, normalize(vN))), 2.0);
          float canal = fband(fract(vPart.z * 8.0), 0.0, 0.12, fwidth(vPart.z) * 8.0);
          float edge = smoothstep(0.75, 1.0, vPart.y);
          k = 0.12 + rim * 0.8 + canal * 0.35 + edge * 0.6 + smoothstep(0.35, 0.0, vPart.y) * 0.4;
        } else {
          // tentacles fade towards their tips; the arms are frilly
          k = (1.0 - vPart.y) * (vPart.x > 1.5 ? 0.55 + 0.25 * sin(vPart.y * 40.0) : 0.7);
        }
        k *= scanline(vWorld.y, 1.8);
        gl_FragColor = vec4(col * k * holoLevel() * 0.16, 1.0);
        ${MAP_OUT}
      }`,
  );
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ the giant robot
/**
 * The bones of the plaza's giant: parent and pivot (relative to the parent's pivot, metres), in
 * its rest pose standing straight with its arms down. 0 pelvis, 1 torso, 2 head, 3/4 left upper
 * arm and forearm, 5/6 right, 7/8 left thigh and shin, 9/10 right.
 */
const BONES: [number, number, number, number][] = [
  [-1, 0, 52, 0],
  [0, 0, 6, 0],
  [1, 0, 36, 0],
  [1, 22, 30, 0],
  [3, 0, -24, 0],
  [1, -22, 30, 0],
  [5, 0, -24, 0],
  [0, 9, -3, 0],
  [7, 0, -25, 0],
  [0, -9, -3, 0],
  [9, 0, -25, 0],
];

/** Boxes in each bone's space: bone, w, h, d, centre x, y, z, bright (visor, core). */
const PARTS: [number, number, number, number, number, number, number, number][] = [
  [0, 20, 10, 13, 0, -1, 0, 0],
  [0, 8, 9, 14, 11, -3, 0, 0],
  [0, 8, 9, 14, -11, -3, 0, 0],
  [1, 18, 13, 13, 0, 6, 0, 0],
  [1, 36, 20, 19, 0, 22, 0, 0],
  [1, 9, 9, 1.2, 0, 23, 10, 1],
  [1, 20, 6, 14, 0, 35, -2, 0],
  [2, 12, 12, 12, 0, 8, 0, 0],
  [2, 10, 2.6, 1, 0, 9, 6.2, 1],
  [2, 1, 8, 1, 4, 17, 0, 0],
  [3, 14, 10, 14, 0, 1, 0, 0],
  [3, 8.5, 22, 8.5, 0, -11, 0, 0],
  [4, 9, 16, 9, 0, -8, 0, 0],
  [4, 11, 10, 11, 0, -21, 0, 1],
  [5, 14, 10, 14, 0, 1, 0, 0],
  [5, 8.5, 22, 8.5, 0, -11, 0, 0],
  [6, 9, 16, 9, 0, -8, 0, 0],
  [6, 11, 10, 11, 0, -21, 0, 1],
  [7, 12, 26, 12, 0, -12, 0, 0],
  [8, 11, 21, 12, 0, -11, 0, 0],
  [8, 12, 5, 19, 0, -23.5, 3, 0],
  [9, 12, 26, 12, 0, -12, 0, 0],
  [10, 11, 21, 12, 0, -11, 0, 0],
  [10, 12, 5, 19, 0, -23.5, 3, 0],
];

function holoRobot(u: MapUniforms) {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], bone: number[] = [];
  for (const [b, w, h, d, x, y, z, bright] of PARTS) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      uvs.push(U.getX(i), U.getY(i));
      bone.push(b, bright);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 2));
  const origin = new THREE.Vector3(HOLO_PLAZA.x, CITY_Y + 2.4, HOLO_PLAZA.z);
  g.boundingSphere = new THREE.Sphere(origin.clone().add(new THREE.Vector3(0, 60, 0)), 90);
  const mats = BONES.map(() => new THREE.Matrix4());
  const mat = holoMaterial(
    u,
    /* glsl */ `
      attribute vec2 aBone;
      uniform mat4 uBones[${BONES.length}];
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      varying float vBright, vHeight;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vBright = aBone.y;
        mat4 B = uBones[int(aBone.x + 0.5)];
        vec4 w = B * vec4(position, 1.0);
        vN = normalize(mat3(B) * normal);
        // now and then a slice of it glitches sideways
        float slot = floor(uTime * 7.0);
        float g = fract(sin(slot * 91.7) * 4375.85);
        float band = floor(w.y / 9.0);
        float hit = step(0.86, g) * step(0.6, fract(sin(band * 12.9 + slot) * 437.5));
        w.x += hit * (fract(sin(slot * 7.1 + band) * 91.3) - 0.5) * 9.0;
        vHeight = w.y;
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${HOLO_GLSL}
      uniform float uBase;
      varying vec2 vUv;
      varying vec3 vWorld, vN;
      varying float vBright, vHeight;
      #include <fog_pars_fragment>
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(V, normalize(vN))), 1.6);
        vec2 px = fwidth(vUv);
        // every plate outlined, like a wireframe
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = max(fband(e.x, 0.0, 0.05, px.x), fband(e.y, 0.0, 0.05, px.y));
        float h = clamp((vHeight - uBase) / 115.0, 0.0, 1.0);
        vec3 col = mix(vec3(0.3, 0.9, 1.0), vec3(1.0, 0.35, 0.8), smoothstep(0.15, 0.95, h));
        float k = 0.1 + rim * 0.5 + edge * 0.9 + vBright * 1.4;
        k *= scanline(vWorld.y, 2.5);
        // the odd flicker
        k *= 0.75 + 0.25 * step(0.06, fract(sin(floor(uTime * 13.0) * 12.7) * 4375.8));
        gl_FragColor = vec4(col * k * holoLevel() * 0.14, 1.0);
        ${MAP_OUT}
      }`,
    { uBones: { value: mats }, uBase: { value: origin.y } },
  );
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 5;
  // the skeleton, posed in JS each frame
  const root = new THREE.Object3D();
  root.position.copy(origin);
  const nodes = BONES.map(([, x, y, z]) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    return o;
  });
  BONES.forEach(([p], i) => (p < 0 ? root : nodes[p]).add(nodes[i]));
  // a punch: 0 at guard .. 1 fully out, quick out and slower back
  const punch = (t: number, at: number) => {
    const s = t - at;
    return s < 0 || s > 0.55 ? 0 : s < 0.14 ? Math.sin((s / 0.14) * (Math.PI / 2)) : 0.5 + 0.5 * Math.cos(((s - 0.14) / 0.41) * Math.PI);
  };
  return {
    mesh,
    update(t: number) {
      // a slow turn to look round the plaza, bouncing on its toes
      root.rotation.y = 0.55 * Math.sin(t * 0.06) + 0.2 * Math.sin(t * 0.17);
      const bob = Math.sin(t * 3.2);
      const [pelvis, torso, head, lu, lf, ru, rf, lt, ls, rt, rs] = nodes;
      pelvis.position.y = 50 + bob * 0.8;
      // every six seconds: a jab, a cross, then a hook
      const c = t % 6;
      const jab = punch(c, 0.4), cross = punch(c, 0.9), hook = punch(c, 1.5);
      torso.rotation.y = -0.3 * jab + 0.45 * cross - 0.35 * hook;
      torso.rotation.x = 0.08 + 0.06 * Math.max(jab, cross);
      head.rotation.y = -torso.rotation.y * 0.6;
      head.rotation.x = -0.12;
      // the left (lead) arm: guard, jab straight out, then the hook round
      lu.rotation.set(-0.95 - 0.6 * jab - 0.5 * hook, 0, 0.12 + 0.9 * hook);
      lf.rotation.set(-1.75 + 1.65 * jab + 0.2 * hook, 0, -0.5 * hook);
      // the right arm: guard by the chin, the cross
      ru.rotation.set(-0.8 - 0.75 * cross, 0, -0.18);
      rf.rotation.set(-2.0 + 1.9 * cross, 0, 0);
      // a fighter's stance: left foot forward, knees soft
      lt.rotation.set(-0.3 - 0.05 * bob, 0, 0.06);
      ls.rotation.set(0.32 + 0.05 * bob, 0, 0);
      rt.rotation.set(0.28 - 0.05 * bob, 0, -0.06);
      rs.rotation.set(0.3 + 0.05 * bob, 0, 0);
      pelvis.rotation.y = 0.25 + 0.15 * cross;
      root.updateMatrixWorld(true);
      nodes.forEach((n, i) => mats[i].copy(n.matrixWorld));
    },
  };
}

// ------------------------------------------------------------------ adverts off the towers
/** Tall holographic adverts projected out in front of the tallest towers, glitching now and then. */
function holoAds(u: MapUniforms, boxes: Box[]) {
  const tall = boxes
    .filter((b) => (b.style === Style.Glass || b.style === Style.Office) && b.h > 100 && b.y0 > CITY_Y + 4)
    .sort((a, b) => b.h - a.h)
    .filter((_, i) => i % 2 === 0)
    .slice(0, 18);
  const g = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  g.index = plane.index;
  g.setAttribute('position', plane.attributes.position);
  g.setAttribute('uv', plane.attributes.uv);
  const at: number[] = [], ad: number[] = [];
  tall.forEach((b, i) => {
    // which face: towards the south (where the map is looked at from) mostly, else east or west
    const f = i % 5 < 3 ? 0 : i % 5 === 3 ? 1 : 3;
    const rot = (f * Math.PI) / 2;
    const nx = Math.sin(rot), nz = Math.cos(rot);
    const across = f % 2 === 0 ? b.w : b.d, reach = f % 2 === 0 ? b.d / 2 : b.w / 2;
    const w = Math.min(across * 0.55, 16), h = Math.min(Math.max(b.h * 0.38, 30), 72);
    const y = b.y0 + b.h * 0.52;
    at.push(b.x + nx * (reach + 5), y, b.z + nz * (reach + 5), rot);
    ad.push(w, h, i * 0.173, i % 5);
  });
  g.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  g.setAttribute('aAd', new THREE.InstancedBufferAttribute(new Float32Array(ad), 4));
  g.instanceCount = tall.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(DOWNTOWN.x, 120, DOWNTOWN.z), 520);
  const mat = holoMaterial(
    u,
    /* glsl */ `
      attribute vec4 aAt, aAd;
      uniform float uTime;
      varying vec2 vUv;
      varying vec4 vAd;
      varying vec3 vWorld;
      varying float vGlitch;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vAd = aAd;
        float slot = floor(uTime * 5.0 + aAd.z * 50.0);
        vGlitch = step(0.93, fract(sin(slot * 17.3 + aAd.z * 91.0) * 4375.85));
        vec2 q = position.xy * aAd.xy;
        // a glitch jerks it sideways and stretches it
        q.x += vGlitch * (fract(sin(slot * 3.7) * 931.7) - 0.5) * aAd.x * 0.4;
        float c = cos(aAt.w), s = sin(aAt.w);
        vec3 w = aAt.xyz + vec3(c * q.x, q.y + sin(uTime * 0.5 + aAd.z * 20.0) * 1.2, -s * q.x);
        vWorld = w;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${HOLO_GLSL}
      varying vec2 vUv;
      varying vec4 vAd;
      varying vec3 vWorld;
      varying float vGlitch;
      #include <fog_pars_fragment>
      void main() {
        vec2 m = vUv * vAd.xy;
        vec2 px = max(fwidth(m), vec2(1e-3));
        float W = vAd.x, H = vAd.y;
        float hi = vAd.w;
        vec3 a = hi < 0.5 ? vec3(1.0, 0.3, 0.7) : hi < 1.5 ? vec3(0.3, 0.95, 1.0) : hi < 2.5 ? vec3(1.0, 0.65, 0.3) : hi < 3.5 ? vec3(0.65, 0.45, 1.0) : vec3(0.55, 1.0, 0.5);
        vec3 b = a.gbr;
        // a soft colour field, brighter towards the edges
        vec2 e = min(m, vAd.xy - m);
        float frame = fband(min(e.x, e.y), 0.0, 0.5, length(px));
        float fade = smoothstep(0.0, 4.0, min(e.x, e.y));
        vec3 c = mix(a, b, vUv.y) * (0.12 + 0.1 * fade);
        // a stack of big characters down the middle, changing every few seconds
        float slot = floor(uTime / 5.0 + vAd.z * 7.0);
        float gs = W * 0.62;
        vec2 g = (m - vec2((W - gs) * 0.5, 0.0)) / gs;
        g.y = (H - m.y) / gs * 0.85;
        vec2 gid = floor(g), gf = fract(g) * vec2(3.0, 4.0);
        float on = step(0.48, hash12(gid * 3.1 + floor(gf) * 7.7 + slot)) * step(0.0, g.x) * step(g.x, 1.0) * step(0.3, g.y) * step(g.y, floor(H / gs * 0.85) - 0.2);
        vec2 sf = fract(gf);
        on *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
        on = mix(on, 0.3 * step(0.0, g.x) * step(g.x, 1.0), smoothstep(0.08, 0.3, px.x / gs));
        c += a * on * 0.9 + frame * b * 0.8;
        // scan lines rolling up, a bright line sweeping down
        c *= scanline(m.y * 1.6, 3.0);
        c += a * smoothstep(0.985, 1.0, 1.0 - abs(fract(uTime * 0.25 + vAd.z) - vUv.y)) * 0.5;
        // flicker and a colour split on a glitch
        c *= 0.8 + 0.2 * step(0.1, fract(sin(floor(uTime * 11.0 + vAd.z * 30.0) * 3.7) * 437.5));
        c = mix(c, c.brg * 1.4, vGlitch);
        gl_FragColor = vec4(c * holoLevel() * 0.26, 1.0);
        ${MAP_OUT}
      }`,
  );
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ all of them
export interface Holograms {
  group: THREE.Group;
  update(t: number): void;
}

export function buildHolograms(u: MapUniforms, boxes: Box[]): Holograms {
  const group = new THREE.Group();
  const robot = holoRobot(u);
  group.add(holoKoi(u), holoWhale(u), holoJellies(u), robot.mesh, holoAds(u, boxes));
  robot.update(0);
  return { group, update: robot.update };
}
