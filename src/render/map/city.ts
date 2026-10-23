import * as THREE from 'three';
import { CITY_Y, height } from './layout';
import { DECK_Y, LIGHTHOUSE, MAGLEV, NEON, TURBINES, WHEEL, type Box, type Plan } from './plan';
import { AA_GLSL, MAP_GLSL, MAP_OUT, Mesher, glowMaterial, litMaterial, mapMaterial, type MapUniforms } from './kit';
import { buildHouses, windowMaterial } from './houses';
import { BUILDING_FRAG } from './facade';
import { buildStreetLife, waterTank, type Lane } from './streetLife';
import type { HeightGrid } from './terrain';

/**
 * The city: every building box in one instanced draw, its windows, neon trim and roofs drawn in
 * the shader (curtain-wall glass reflecting the sky, ribbon-windowed offices, punched-window flats,
 * old brick); the houses, bridges, piers and cranes merged into one prop mesh; neon signs; the
 * maglev and its train; traffic on the streets and in the air; the Ferris wheel, the lighthouse,
 * the wind farm. (The mega-towers and holograms downtown are in towers.ts and holo.ts.)
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ buildings
function unitBox() {
  // five faces (no floor), from y 0 to 1
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // drop the bottom face (box face order: +x, -x, +y, -y, +z, -z; 6 indices each)
  const idx = Array.from(g.index!.array);
  idx.splice(18, 6);
  g.setIndex(idx);
  g.clearGroups();
  g.deleteAttribute('uv');
  return g;
}

function buildingMaterial(u: MapUniforms, lite: boolean) {
  const neon = NEON.map((h) => new THREE.Color(h));
  return mapMaterial(u, {
    uniforms: { uNeon: { value: neon } },
    vertexShader: /* glsl */ `
      attribute vec3 aSize;
      attribute vec4 aInfo;
      attribute float aNeon;
      varying vec3 vWorld, vN, vCol;
      varying vec2 vFace;
      // (per building and per face: flat, so the window hashes see exactly the same numbers
      // across a face; interpolated, they drift in the last bits and windows sparkle)
      flat varying vec3 vSize;
      flat varying vec4 vInfo;
      flat varying float vNeon, vFaceW, vFaceId;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vN = normal;
        vCol = instanceColor;
        vSize = aSize;
        vInfo = aInfo;
        vNeon = aNeon;
        // metres across the face from its corner, and up it from the base
        vec3 m = (position + vec3(0.5, 0.0, 0.5)) * aSize;
        bool sx = abs(normal.x) > 0.5;
        vFace = normal.y > 0.5 ? m.xz : vec2(sx ? m.z : m.x, m.y);
        vFaceW = sx ? aSize.z : aSize.x;
        vFaceId = dot(normal, vec3(1.0, 2.0, 3.0));
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: BUILDING_FRAG,
    defines: lite ? { MAP_LITE: 1 } : {},
  });
}

function buildings(u: MapUniforms, boxes: Box[], lite: boolean) {
  const geo = unitBox();
  const n = boxes.length;
  const size = new Float32Array(n * 3);
  const info = new Float32Array(n * 4);
  const neon = new Float32Array(n);
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(u, lite), n);
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    _m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y0, b.z);
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setHex(b.col));
    size.set([b.w, b.h, b.d], i * 3);
    info.set([b.style, b.seed, b.lit, b.roof], i * 4);
    neon[i] = b.neon;
  }
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  geo.setAttribute('aNeon', new THREE.InstancedBufferAttribute(neon, 1));
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ------------------------------------------------------------------ neon signs
function signs(u: MapUniforms, plan: Plan) {
  const list = plan.signs;
  const geo = new THREE.PlaneGeometry(1, 1);
  const info = new Float32Array(list.length * 4);
  const mesh = new THREE.InstancedMesh(geo, signMaterial(u), list.length);
  list.forEach((s, i) => {
    _q.setFromAxisAngle(_up, s.rot);
    _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.w, s.h, 1));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setHex(NEON[s.neon]));
    info.set([s.w, s.h, s.cell, i * 0.137], i * 4);
  });
  geo.setAttribute('aSign', new THREE.InstancedBufferAttribute(info, 4));
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function signMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec4 aSign;
      varying vec2 vUv;
      flat varying vec4 vSign;
      varying vec3 vCol, vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vUv = uv;
        vSign = aSign;
        vCol = instanceColor;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      varying vec2 vUv;
      flat varying vec4 vSign;
      varying vec3 vCol, vWorld;
      #include <fog_pars_fragment>
      void main() {
        // metres across and down the sign
        vec2 m = vUv * vSign.xy;
        vec2 px = max(fwidth(m), vec2(1e-3));
        float W = vSign.x;
        // the frame
        vec2 e = min(m, vSign.xy - m);
        float frame = fband(min(e.x, e.y), 0.15, 0.45, length(px));
        // characters stacked down it (or along it, on a wide sign): each a 3×4 grid of strokes
        // picked from a hash
        bool wide = vSign.x > vSign.y;
        float gs = wide ? vSign.y * 0.7 : W * 0.8;
        vec2 g;
        if (wide) g = vec2((m.x - gs * 0.4) / (gs * 0.85), (m.y - (vSign.y - gs) * 0.5) / gs);
        else {
          g = (m - vec2((W - gs) * 0.5, 0.0)) / gs;
          g.y = (vSign.y - m.y) / gs * 0.9;
        }
        vec2 gid = floor(g);
        vec2 gf = fract(g) * vec2(3.0, 4.0);
        vec2 sid = floor(gf);
        float h = hash12(gid * 3.1 + sid * 7.7 + vSign.z * 13.0);
        float stroke = wide
          ? step(0.45, h) * step(0.0, g.y) * step(g.y, 1.0) * step(0.0, g.x) * step(g.x, floor((W - gs * 0.8) / (gs * 0.85)))
          : step(0.45, h) * step(0.0, g.x) * step(g.x, 1.0) * step(0.4, g.y) * step(g.y, floor(vSign.y / gs * 0.9));
        vec2 sf = fract(gf);
        stroke *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
        // the strokes blur into a soft glow once too small to read
        float tiny = smoothstep(0.08, 0.3, px.x / gs);
        float lightOn = mix(stroke, 0.35, tiny);
        // a flicker now and then, and the odd sign half dead
        float t = floor(uTime * 12.0 + vSign.w * 40.0);
        float flick = step(0.04, hash12(vec2(t, vSign.w * 91.0)));
        float k = max(frame, lightOn) * flick;
        vec3 c = vCol * k * uGlow * (0.7 + 0.3 * uDusk) + vec3(0.03, 0.03, 0.04) * (1.0 - k);
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
    side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ props
/** Everything static and matte: houses, bridges, piers, cranes, the maglev's track, the lighthouse and the turbine towers. */
function props(u: MapUniforms, plan: Plan, maglev: THREE.CurvePath<THREE.Vector3>) {
  const ms = new Mesher();
  const win = new Mesher();
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 8, 1).translate(0, 0.5, 0);
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, col: number, k = 1) => {
    _q.setFromAxisAngle(_up, rot);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    ms.add(g, _m, _c.setHex(col), k);
  };
  // houses, barns, silos and greenhouses
  buildHouses(ms, win, plan.houses);
  // radio masts on the towers, with a crossbar or two
  for (let i = 0; i < plan.masts.length; i += 4) {
    const [x, y, z, h] = plan.masts.slice(i, i + 4);
    put(cyl, x, y, z, 0.7, h, 0.7, 0, 0xc9ccd0);
    put(box, x, y + h * 0.55, z, 4, 0.3, 0.3, 0, 0xc9ccd0);
    if (h > 20) put(box, x, y + h * 0.8, z, 0.3, 0.3, 3, 0, 0xc9ccd0);
  }
  // water tanks on legs on the roofs of the old brick buildings
  for (const b of plan.boxes) {
    const tank = waterTank(b);
    if (!tank) continue;
    const [x, z] = tank, y = b.y0 + b.h;
    for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) put(box, x + lx, y, z + lz, 0.25, 3, 0.25, 0, 0x4a4440);
    put(cyl, x, y + 3, z, 4.4, 3.6, 4.4, 0, 0x8a6a4a);
    put(cone, x, y + 6.6, z, 4.8, 1.5, 4.8, 0, 0x5a4a40);
  }
  // the billboards' backs and legs
  for (const sg of plan.signs) {
    if (!sg.roof) continue;
    put(box, sg.x, sg.y - sg.h / 2 - 0.1, sg.z - 0.35, sg.w + 0.3, sg.h + 0.2, 0.4, sg.rot, 0x3a3d42);
    for (const lx of [-sg.w * 0.3, sg.w * 0.3]) put(box, sg.x + lx, sg.y - sg.h / 2 - 2.4, sg.z - 0.35, 0.4, 2.4, 0.4, 0, 0x55585c);
  }
  // bridges: a deck, parapets, and a pier under the middle
  for (const b of plan.bridges) {
    const ca = Math.cos(b.rot), sa = Math.sin(b.rot);
    put(box, b.x, b.y - 1.4, b.z, b.len, 1.4, b.w, b.rot, 0x9a948b);
    for (const s of [-1, 1]) put(box, b.x - sa * s * (b.w / 2 - 0.3), b.y, b.z - ca * s * (b.w / 2 - 0.3), b.len, 1.1, 0.5, b.rot, 0xd9d2c5);
    put(box, b.x, b.y - 14, b.z, 3, 12.6, b.w * 0.7, b.rot, 0x8a847b);
  }
  // piers on their pilings, with a warm lamp line along each
  for (const [x0, z0, x1, z1] of plan.docks.piers) {
    put(box, (x0 + x1) / 2, DECK_Y - 1.2, (z0 + z1) / 2, x1 - x0, 1.2, z1 - z0, 0, 0x8f8a80);
    for (let z = z0 + 3; z < z1; z += 8) for (const x of [x0 + 1, x1 - 1]) put(cyl, x, -6, z, 1, DECK_Y + 4.8, 1, 0, 0x5a5249);
  }
  // the gantry cranes: legs either side of the quay, a beam across, a boom out over the water
  for (const c of plan.docks.cranes) {
    const col = 0xe2712a;
    const dir = c.rot === 0 ? 1 : -1;
    for (const lx of [-6, 6]) for (const lz of [-5, 5]) put(box, c.x + lx, DECK_Y, c.z + lz, 1, 30, 1, 0, col);
    put(box, c.x, DECK_Y + 30, c.z, 14, 3, 12, 0, col);
    put(box, c.x, DECK_Y + 31, c.z + dir * 22, 3, 2, 34, 0, col);
    put(box, c.x, DECK_Y + 33, c.z - dir * 9, 4, 3, 6, 0, 0x3c4a55);
    put(box, c.x, DECK_Y + 4, c.z + dir * 30, 0.3, 27, 0.3, 0, 0x333333);
  }
  // the maglev: a slim beam on pylons all round the loop
  const L = maglev.getLength();
  for (let s = 0; s < L; s += 6) {
    const a = maglev.getPointAt(s / L), b = maglev.getPointAt(Math.min(1, (s + 6) / L));
    const rot = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    put(box, (a.x + b.x) / 2, MAGLEV.y - 1.6, (a.z + b.z) / 2, 6.4, 1.6, 3.2, rot, 0xe6e1d8);
  }
  for (let s = 0; s < L; s += 36) {
    const a = maglev.getPointAt(s / L);
    put(cyl, a.x, CITY_Y, a.z, 1.8, MAGLEV.y - CITY_Y - 1.6, 1.8, 0, 0xcfc9be);
  }
  // the lighthouse: a white tower with red bands on its rock
  {
    const { x, z } = LIGHTHOUSE;
    const y = height(x, z);
    put(cyl, x, y - 1, z, 9, 3, 9, 0, 0x9c907f);
    for (let k = 0; k < 6; k++) put(cyl, x, y + 2 + k * 3.4, z, 5.6 - k * 0.35, 3.4, 5.6 - k * 0.35, 0, k % 2 ? 0xc8402e : 0xf2eee6);
    put(cyl, x, y + 22.4, z, 4.4, 0.6, 4.4, 0, 0x30302f);
    put(cone, x, y + 26.2, z, 4.2, 2.6, 4.2, 0, 0xc8402e);
  }
  // the wind farm's towers and nacelles
  for (const [x, z] of TURBINES) {
    const y = height(x, z);
    put(cone, x, y - 1, z, 3.2, 62, 3.2, 0, 0xeef0f0);
    put(cyl, x, y + 54, z, 2.2, 6, 2.2, 0, 0xeef0f0);
    put(box, x, y + 56, z - 1.5, 2.6, 2.6, 6, 0, 0xeef0f0);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(ms.geometry(), litMaterial(u)), new THREE.Mesh(win.geometry(), windowMaterial(u)));
  return group;
}

// ------------------------------------------------------------------ the maglev
function maglevPath() {
  const { x0, z0, x1, z1, r, y } = MAGLEV;
  const p = new THREE.CurvePath<THREE.Vector3>();
  const v = (x: number, z: number) => new THREE.Vector3(x, y, z);
  const arc = (cx: number, cz: number, a0: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push(v(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  p.add(new THREE.LineCurve3(v(x0 + r, z0), v(x1 - r, z0)));
  p.add(arc(x1 - r, z0 + r, -Math.PI / 2));
  p.add(new THREE.LineCurve3(v(x1, z0 + r), v(x1, z1 - r)));
  p.add(arc(x1 - r, z1 - r, 0));
  p.add(new THREE.LineCurve3(v(x1 - r, z1), v(x0 + r, z1)));
  p.add(arc(x0 + r, z1 - r, Math.PI / 2));
  p.add(new THREE.LineCurve3(v(x0, z1 - r), v(x0, z0 + r)));
  p.add(arc(x0 + r, z0 + r, Math.PI));
  return p;
}

class Train {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  private L: number;
  private s = 0;
  private static CARS = 6;
  private static CAR = 15;
  constructor(u: MapUniforms, private path: THREE.CurvePath<THREE.Vector3>) {
    this.L = path.getLength();
    const g = new THREE.CapsuleGeometry(1.5, Train.CAR - 3, 3, 8).rotateZ(Math.PI / 2).scale(1, 1, 1.15);
    this.mesh = new THREE.InstancedMesh(g, litMaterial(u), Train.CARS);
    const cols = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3);
    g.setAttribute('color', cols);
    for (let i = 0; i < Train.CARS; i++) this.mesh.setColorAt(i, _c.setHex(i === 0 || i === Train.CARS - 1 ? 0xf4f6f8 : 0xe8ecef));
    // a cyan strip of light along each car
    const sg = new THREE.BoxGeometry(Train.CAR - 2, 0.5, 3.6);
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 3).fill(1), 3));
    this.glow = new THREE.InstancedMesh(sg, glowMaterial(u), Train.CARS);
    for (let i = 0; i < Train.CARS; i++) this.glow.setColorAt(i, _c.setHex(0x3ff0ff));
    this.mesh.frustumCulled = this.glow.frustumCulled = false;
  }
  update(dt: number) {
    this.s = (this.s + dt * 24) % this.L;
    for (let i = 0; i < Train.CARS; i++) {
      const s = (this.s - i * (Train.CAR + 0.8) + this.L) % this.L;
      const a = this.path.getPointAt(s / this.L), b = this.path.getPointAt(((s + 2) % this.L) / this.L);
      const rot = Math.atan2(b.z - a.z, b.x - a.x);
      _q.setFromAxisAngle(_up, -rot);
      _m.compose(_p.set(a.x, a.y + 1.8, a.z), _q, _s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, _m);
      _m.compose(_p.set(a.x, a.y + 0.2, a.z), _q, _s.set(1, 1, 1));
      this.glow.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ traffic
/**
 * Cars on every street (a warm white stream one way, red tail lights the other, like a long
 * exposure) and flying cars on sky lanes over the avenues: points moved in the vertex shader.
 */
function traffic(u: MapUniforms, plan: Plan) {
  const a: number[] = [], b: number[] = [], car: number[] = [];
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lanes: Lane[] = [];
  for (const s of plan.streets) {
    const [x0, z0, x1, z1, nl] = s;
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const side of [-1, 1])
      for (let l = 0; l < nl; l++) {
        const n = Math.floor(len / (nl > 1 ? 15 : 24));
        if (!n) continue;
        // every car in a lane at one speed, spaced along it with a car's length and room to spare
        // (the street life's bodies ride under these lights); any more just add their lights to
        // one in front
        const speed = 9 + rnd() * 6;
        const keep = Math.max(1, Math.min(n, Math.floor(len / 24)));
        const start = rnd(), room = 1 - (10 * keep) / len;
        const phases: number[] = [];
        for (let k = 0; k < keep; k++) phases.push((start + (k + (rnd() - 0.5) * room) / keep) % 1);
        const off = side * (1.6 + l * 3);
        lanes.push({ ax: x0, az: z0, bx: x1, bz: z1, off, speed, phases });
        for (let k = 0; k < n; k++) {
          a.push(x0, z0);
          b.push(x1, z1);
          // phase, speed (m/s), offset across the street, kind (0 ground: side; 2 air)
          car.push(phases[k % keep], speed, off, side);
        }
      }
  }
  // sky lanes: over the avenues, a few heights, both ways
  for (const s of plan.streets) {
    if (s[4] < 2) continue;
    const [x0, z0, x1, z1] = s;
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const alt of [52, 86, 128]) {
      const n = Math.floor(len / 70);
      for (let k = 0; k < n; k++) {
        const side = rnd() < 0.5 ? -1 : 1;
        a.push(x0, z0);
        b.push(x1, z1);
        car.push(rnd(), 26 + rnd() * 18, side * (3 + rnd() * 4) + alt * 1000, 2 + rnd());
      }
    }
  }
  const n = car.length / 4;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 2));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 2));
  g.setAttribute('aCar', new THREE.Float32BufferAttribute(car, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(30, 40, -70), 700);
  const mat = mapMaterial(u, {
    uniforms: { uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aA, aB;
      attribute vec4 aCar;
      uniform float uTime, uPx;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vec2 d = aB - aA;
        float len = length(d);
        vec2 dir = d / len;
        vec2 across = vec2(-dir.y, dir.x);
        bool air = aCar.w >= 2.0;
        float off = air ? mod(aCar.z + 500.0, 1000.0) - 500.0 : aCar.z;
        float alt = air ? floor((aCar.z + 500.0) / 1000.0) : 0.0;
        float side = sign(off);
        float t = fract(aCar.x + uTime * aCar.y / len * side);
        vec3 p = vec3(aA + d * t + across * off, 0.0).xzy;
        p.y = air ? alt + sin(uTime * 0.7 + aCar.x * 40.0) * 1.5 : ${(CITY_Y + 0.7).toFixed(2)};
        // fade in and out at the ends of the street
        float fade = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
        if (air) {
          float h = fract(aCar.w);
          vCol = (h < 0.4 ? vec3(0.25, 0.94, 1.0) : h < 0.75 ? vec3(1.0, 0.25, 0.64) : vec3(1.0, 0.85, 0.5)) * 1.6;
        } else {
          vCol = side > 0.0 ? vec3(1.0, 0.88, 0.7) : vec3(1.0, 0.12, 0.08);
        }
        vCol *= fade;
        vec4 mvPosition = viewMatrix * vec4(p + uMapShift, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp((air ? 3.4 : 2.2) * uPx * 260.0 / -mvPosition.z, 1.2, air ? 9.0 : 6.0) * fade;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float k = smoothstep(0.5, 0.15, length(c));
        gl_FragColor = vec4(vCol * k * uGlow * 0.3, 1.0);
        ${MAP_OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.renderOrder = 3;
  return { pts, px: mat.uniforms.uPx, lanes };
}

// ------------------------------------------------------------------ beacons and lamps
function beacons(u: MapUniforms, plan: Plan, extra: number[]) {
  const all = plan.beacons.concat(extra);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  g.computeBoundingSphere();
  const mat = mapMaterial(u, {
    uniforms: { uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uPx;
      varying float vOn;
      #include <fog_pars_vertex>
      void main() {
        vOn = 0.25 + 0.75 * smoothstep(0.6, 1.0, sin(uTime * 2.4 + position.x * 0.13));
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(5.0 * uPx * 260.0 / -mvPosition.z, 1.5, 9.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying float vOn;
      #include <fog_pars_fragment>
      void main() {
        float k = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(1.0, 0.15, 0.1) * k * vOn * uGlow * 0.6, 1.0);
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

/** Street lamps: warm points along the kerbs, faint by day, bright at night. */
function lamps(u: MapUniforms, plan: Plan) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(plan.lamps, 3));
  g.computeBoundingSphere();
  const mat = mapMaterial(u, {
    uniforms: { uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uPx, uDusk;
      varying float vOn;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vOn = mix(0.05, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0));
        // most are sodium orange, some newer white ones
        vCol = fract(sin(dot(position.xz, vec2(12.9, 78.2))) * 43758.5) < 0.3 ? vec3(0.85, 0.92, 1.0) : vec3(1.0, 0.68, 0.32);
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(2.6 * uPx * 260.0 / -mvPosition.z, 1.0, 6.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying float vOn;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float k = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vCol * k * vOn * uGlow * 0.3, 1.0);
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

// ------------------------------------------------------------------ the Ferris wheel
function wheel(u: MapUniforms) {
  const { x, z, r } = WHEEL;
  const group = new THREE.Group();
  group.position.set(x, CITY_Y, z);
  // the A-frame legs
  const ms = new Mesher();
  const leg = new THREE.BoxGeometry(1.2, 1, 1.2);
  for (const sz of [-4, 4])
    for (const sx of [-1, 1]) {
      _m.makeRotationZ(sx * 0.32);
      _m.premultiply(new THREE.Matrix4().makeTranslation(sx * r * 0.18, r * 0.5 + 1, sz));
      _m.scale(_s.set(1, r + 6, 1));
      ms.add(leg, _m, 0xf2f0ea);
    }
  const legs = new THREE.Mesh(ms.geometry(), litMaterial(u));
  group.add(legs);
  // the wheel: rims, spokes and gondolas, turning slowly
  const turn = new THREE.Group();
  turn.position.y = r + 4;
  const wm = new Mesher();
  const rim = new THREE.TorusGeometry(r, 0.45, 4, 48);
  for (const sz of [-2.2, 2.2]) wm.add(rim, new THREE.Matrix4().makeTranslation(0, 0, sz), 0xf4f2ee);
  const spoke = new THREE.BoxGeometry(0.3, r, 0.3).translate(0, r / 2, 0);
  const N = 16;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    for (const sz of [-2.2, 2.2]) wm.add(spoke, new THREE.Matrix4().makeRotationZ(a).setPosition(0, 0, sz), 0xe9e6df);
  }
  turn.add(new THREE.Mesh(wm.geometry(), litMaterial(u)));
  // the rim lights
  const gm = new Mesher();
  const bulb = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    for (const sz of [-2.4, 2.4]) gm.at(bulb, Math.cos(a) * r, Math.sin(a) * r, sz, NEON[k % 2 === 0 ? 0 : 1]);
  }
  turn.add(new THREE.Mesh(gm.geometry(), glowMaterial(u, { flicker: false })));
  group.add(turn);
  // the gondolas hang level as the wheel turns
  const gg = new THREE.BoxGeometry(2.6, 2.4, 3.2).translate(0, -1.4, 0);
  gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 3).fill(1), 3));
  const gmesh = new THREE.InstancedMesh(gg, litMaterial(u), N);
  for (let k = 0; k < N; k++) gmesh.setColorAt(k, _c.setHex([0xff8fb8, 0x7fd8e8, 0xffd27a, 0xb9a3ff][k % 4]));
  gmesh.frustumCulled = false;
  group.add(gmesh);
  group.updateMatrixWorld(true);
  return {
    group,
    update(t: number) {
      const a0 = t * 0.05;
      turn.rotation.z = a0;
      for (let k = 0; k < N; k++) {
        const a = a0 + (k / N) * Math.PI * 2;
        _m.makeTranslation(Math.cos(a) * r, r + 4 + Math.sin(a) * r, 0);
        gmesh.setMatrixAt(k, _m);
      }
      gmesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ wind turbines' rotors
function rotors(u: MapUniforms) {
  const ms = new Mesher();
  const blade = new THREE.BoxGeometry(0.9, 24, 0.3).translate(0, 12, 0);
  for (let k = 0; k < 3; k++) ms.add(blade, new THREE.Matrix4().makeRotationZ((k / 3) * Math.PI * 2), 0xf2f4f4);
  const g = ms.geometry();
  const mesh = new THREE.InstancedMesh(g, litMaterial(u), TURBINES.length);
  mesh.frustumCulled = false;
  const ys = TURBINES.map(([x, z]) => height(x, z));
  return {
    mesh,
    update(t: number) {
      TURBINES.forEach(([x, z], i) => {
        _m.makeRotationZ(t * 0.9 + i * 1.7).setPosition(x, ys[i] + 57, z + 1.9);
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ the lighthouse lamp
function lighthouseBeam(u: MapUniforms) {
  const { x, z } = LIGHTHOUSE;
  const y = height(x, z) + 24;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // the lamp
  const lm = new Mesher();
  lm.at(new THREE.SphereGeometry(1.6, 10, 8), 0, 0, 0, 0xfff1c8);
  group.add(new THREE.Mesh(lm.geometry(), glowMaterial(u)));
  // two soft beams sweeping round
  const beam = new THREE.ConeGeometry(9, 160, 16, 1, true).rotateZ(Math.PI / 2).translate(80, 0, 0);
  const mat = mapMaterial(u, {
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vAlong = position.x / 160.0;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying float vAlong;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        float k = (1.0 - vAlong) * (1.0 - vAlong) * 0.22 * (0.4 + 0.6 * uDusk);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * k, 1.0);
        ${MAP_OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const spin = new THREE.Group();
  const b1 = new THREE.Mesh(beam, mat);
  const b2 = new THREE.Mesh(beam, mat);
  b2.rotation.y = Math.PI;
  b1.renderOrder = b2.renderOrder = 4;
  spin.add(b1, b2);
  group.add(spin);
  return {
    group,
    update(t: number) {
      spin.rotation.y = t * 0.8;
    },
  };
}

// ------------------------------------------------------------------ all of it
export interface City {
  group: THREE.Group;
  /** The street life (shown close in only), if there is one. */
  life: THREE.Group | null;
  update(dt: number, t: number): void;
  setPixelScale(h: number): void;
}

/**
 * `extraBeacons`: more red tower lights (x, y, z flat), from the event sites. `life`: the street
 * life (traffic, parked cars, people, roof kit) on the terrain's height grid, as the world map
 * has it; left out, none (and its roofs undressed).
 */
export function buildCity(u: MapUniforms, plan: Plan, extraBeacons: number[], life?: { grid: HeightGrid; quality: 'low' | 'med' | 'high' }): City {
  const group = new THREE.Group();
  const all = plan.boxes.concat(plan.docks.boxes);
  const path = maglevPath();
  // (the props first: the water tanks stand on roofs the street life then dresses round them)
  const prop = props(u, plan, path);
  const cars = traffic(u, plan);
  const street = life && life.quality !== 'low' ? buildStreetLife(u, life.grid, cars.lanes, all, plan.signs) : null;
  group.add(buildings(u, all, life?.quality === 'low'));
  if (plan.signs.length) group.add(signs(u, plan));
  group.add(prop);
  const train = new Train(u, path);
  group.add(train.mesh, train.glow);
  group.add(cars.pts);
  if (street) group.add(street.group);
  const bc = beacons(u, plan, extraBeacons);
  group.add(bc.pts);
  const lp = lamps(u, plan);
  group.add(lp.pts);
  const fw = wheel(u);
  group.add(fw.group);
  const rt = rotors(u);
  group.add(rt.mesh);
  const lh = lighthouseBeam(u);
  group.add(lh.group);
  return {
    group,
    life: street?.group ?? null,
    update(dt, t) {
      train.update(dt);
      fw.update(t);
      rt.update(t);
      lh.update(t);
    },
    setPixelScale(h) {
      // point sizes are in pixels at a 1000 px tall screen
      cars.px.value = h / 1000;
      bc.px.value = h / 1000;
      lp.px.value = h / 1000;
    },
  };
}
