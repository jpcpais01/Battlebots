import * as THREE from 'three';
import { HouseKind, type House } from './plan';
import { MAP_GLSL, MAP_OUT, Mesher, mapMaterial, type MapUniforms } from './kit';

/**
 * The houses out in the country and along the city's edge, each a little different: gabled,
 * L-shaped, hip-roofed or flat and modern with solar panels; doors, porches, chimneys, windows on
 * every side (some lit, more at night), fenced or hedged back gardens with a shed or a vegetable
 * bed. Farms get a barn, silos and greenhouses glowing pink with grow lights. Matte parts go into
 * the shared prop mesh; windows and grow lights into their own.
 */

const _m = new THREE.Matrix4();
const _h = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** A gable-roofed prism over a 1×1 footprint, ridge along x, eaves at y 0, ridge at y 1. */
export function gable() {
  const g = new THREE.BufferGeometry();
  const p = [
    // two sloped faces
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    // gable ends
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const GABLE = gable();
/** A four-sided pyramid over a 1×1 footprint (a hip roof). */
const HIP = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1).translate(0, 0.5, 0);
const DOME = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
/** A pane facing +z. */
const PANE = new THREE.PlaneGeometry(1, 1);

const LAMPS = [0xffc27a, 0xffd9a0, 0xffb060, 0xfff0d8];
const DOORS = [0x4a3426, 0x5b2f2a, 0x2f4a5a, 0x3d4a33];

/** Small hash of a house's seed and a number, 0..1. */
const hash = (s: number, k: number) => {
  const x = Math.sin(s * 1013.7 + k * 57.31) * 43758.5453;
  return x - Math.floor(x);
};

export function buildHouses(ms: Mesher, win: Mesher, houses: House[]) {
  for (const h of houses) {
    // the house's own frame: its base centre, turned
    _h.compose(_p.set(h.x, h.y, h.z), _q.setFromAxisAngle(UP, h.rot), _s.set(1, 1, 1));
    /** Add a part in the house's frame: geometry at (x, y, z) scaled by (sx, sy, sz), turned by r. */
    const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number | THREE.Color, r = 0, into = ms) => {
      _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, r), _s.set(sx, sy, sz)).premultiply(_h);
      into.add(g, _m, typeof col === 'number' ? _c.setHex(col) : col);
    };
    const pane = (x: number, y: number, z: number, w: number, ht: number, face: number, col: number) => put(PANE, x, y, z, w, ht, 1, col, face, win);
    const s = h.seed;
    if (h.kind === HouseKind.Barn) barn(h, put, pane);
    else if (h.kind === HouseKind.Silo) {
      put(CYL, 0, -0.5, 0, h.w, h.h + 0.5, h.w, h.wall);
      put(DOME, 0, h.h, 0, h.w * 1.02, h.w * 0.9, h.w * 1.02, h.roof);
      for (const y of [h.h * 0.33, h.h * 0.66]) put(CYL, 0, y, 0, h.w * 1.04, 0.35, h.w * 1.04, 0x8a8e90);
    } else if (h.kind === HouseKind.Greenhouse) {
      put(BOX, 0, -0.4, 0, h.w, 1.0, h.d, 0xb8b2a6);
      put(BOX, 0, 0.6, 0, h.w, h.h - 0.6, h.d, h.wall);
      put(GABLE, 0, h.h, 0, h.w, 1.8, h.d, h.roof);
      // the grow lights inside, through the glass
      for (const side of [-1, 1]) pane(0, 0.6 + (h.h - 0.6) / 2, side * (h.d / 2 + 0.05), h.w - 0.6, h.h - 1.0, side > 0 ? 0 : Math.PI, 0xff4fd8);
      for (const side of [-1, 1]) pane(side * (h.w / 2 + 0.05), 0.6 + (h.h - 0.6) / 2, 0, h.d - 0.6, h.h - 1.0, side * (Math.PI / 2), 0xff4fd8);
    } else house(h, s, put, pane);
  }
}

type Put = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number | THREE.Color, r?: number, into?: Mesher) => void;
type Pane = (x: number, y: number, z: number, w: number, h: number, face: number, col: number) => void;

function barn(h: House, put: Put, pane: Pane) {
  put(BOX, 0, -0.6, 0, h.w, h.h + 0.6, h.d, h.wall);
  // a steep roof with a flatter skirt (a gambrel, near enough)
  put(GABLE, 0, h.h, 0, h.w + 0.8, 1.6, h.d + 1.2, h.roof);
  put(GABLE, 0, h.h + 1.1, 0, h.w + 0.6, 4.2, h.d * 0.62, h.roof);
  // the big doors on the gable end, white-framed
  put(BOX, h.w / 2 + 0.02, 0, 0, 0.12, 5.2, 5.4, 0xf2ece0);
  put(BOX, h.w / 2 + 0.08, 0.2, 0, 0.12, 4.8, 5.0, 0x5a2a22);
  pane(h.w / 2 + 0.1, h.h + 2.2, 0, 1.4, 1.2, Math.PI / 2, 0xffc27a);
  for (const x of [-h.w / 4, h.w / 4]) pane(x, 2.6, h.d / 2 + 0.06, 1.3, 1.0, 0, hash(h.seed, x) < 0.4 ? 0xffc27a : 0);
}

function house(h: House, s: number, put: Put, pane: Pane) {
  const { w, d } = h;
  const H = h.h;
  const type = s < 0.48 ? 'gable' : s < 0.68 ? 'ell' : s < 0.86 ? 'hip' : 'modern';
  const wall = type === 'modern' ? (s > 0.93 ? 0xe9ebea : 0xd6d8d4) : h.wall;
  put(BOX, 0, -0.6, 0, w, H + 0.6, d, wall);
  const rh = Math.min(w, d) * (type === 'hip' ? 0.36 : 0.42);
  if (type === 'gable' || type === 'ell') put(GABLE, 0, H, 0, w + 1, rh, d + 1, h.roof);
  else if (type === 'hip') put(HIP, 0, H, 0, w + 1, rh, d + 1, h.roof);
  else {
    // a flat roof with a lip, solar panels tilted to the sun
    put(BOX, 0, H, 0, w + 0.6, 0.35, d + 0.6, 0x5a5e62);
    const n = 2 + Math.floor(hash(s, 1) * 3);
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + 1.2 + ((k + 0.5) / n) * (w - 2.4);
      _sol.set(0.25, 0.32, 0.52);
      put(BOX, x, H + 0.5, 0, (w - 2.4) / n - 0.4, 0.12, d * 0.6, _sol);
    }
  }
  // an L: a wing reaching forward, its own roof turned across
  let doorX = -w * 0.18;
  if (type === 'ell') {
    const ww = w * 0.44, wd = d * 0.7, wx = w * 0.28, wz = d / 2 + wd / 2 - 0.4;
    put(BOX, wx, -0.6, wz, ww, H + 0.6, wd, h.wall);
    put(GABLE, wx, H, wz, wd + 0.8, Math.min(ww, wd) * 0.42, ww + 0.8, h.roof, Math.PI / 2);
    pane(wx, H * 0.5, wz + wd / 2 + 0.06, Math.min(2.2, ww * 0.5), 1.2, 0, hash(s, 9) < 0.55 ? lamp(s, 9) : 0);
    doorX = -w * 0.22;
  }
  // a chimney on some
  if (type !== 'modern' && hash(s, 2) < 0.45) put(BOX, w * 0.28, H - 0.5, -d * 0.12, 0.9, rh + 1.6, 0.9, 0x8c6a5a);
  // the front door, and a porch roof over it on some
  put(BOX, doorX, 0, d / 2, 1.1, 2.2, 0.16, DOORS[Math.floor(hash(s, 3) * DOORS.length)]);
  if (hash(s, 4) < 0.55 && type !== 'modern') {
    put(BOX, doorX, 2.55, d / 2 + 0.75, 2.6, 0.2, 1.5, h.roof);
    for (const px of [-1.15, 1.15]) put(BOX, doorX + px, 0, d / 2 + 1.35, 0.16, 2.55, 0.16, 0xe8e2d6);
  }
  // windows: a row per floor along the front and back, one per floor on each end
  const floors = H > 6.2 ? 2 : 1;
  const n = Math.max(1, Math.floor(w / 3.2));
  const ww = type === 'modern' ? 1.8 : 1.0;
  let k = 0;
  for (let f = 0; f < floors; f++) {
    const y = f === 0 ? 1.55 : Math.min(H - 1.0, 4.4);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) / n) * w;
      for (const side of [1, -1]) {
        if (f === 0 && side === 1 && Math.abs(x - doorX) < 1.2) continue;
        k++;
        pane(x, y, side * (d / 2 + 0.06), ww, 1.15, side > 0 ? 0 : Math.PI, hash(s, k) < 0.5 ? lamp(s, k) : 0);
      }
    }
    for (const side of [1, -1]) {
      k++;
      pane(side * (w / 2 + 0.06), y, 0, 1.0, 1.15, side * (Math.PI / 2), hash(s, k) < 0.45 ? lamp(s, k) : 0);
    }
  }
  // the back garden: fenced or hedged, with a shed or a vegetable bed
  const g = hash(s, 5);
  const gz0 = -d / 2, gz1 = -d / 2 - 6.5;
  if (g < 0.42) {
    const fc = hash(s, 6) < 0.5 ? 0xece6da : 0x9a7a58;
    put(BOX, 0, 0, gz1, w + 3, 0.85, 0.12, fc);
    for (const sx of [-1, 1]) put(BOX, sx * (w / 2 + 1.5), 0, (gz0 + gz1) / 2, 0.12, 0.85, gz0 - gz1, fc);
  } else if (g < 0.68) {
    put(BOX, 0, -0.2, gz1, w + 3, 1.5, 0.9, 0x3f6b2e);
    for (const sx of [-1, 1]) put(BOX, sx * (w / 2 + 1.5), -0.2, (gz0 + gz1) / 2, 0.9, 1.5, gz0 - gz1, 0x46732f);
  }
  if (g < 0.68) {
    if (hash(s, 7) < 0.5) {
      // a shed in the corner
      const sx = (hash(s, 8) < 0.5 ? -1 : 1) * (w / 2 - 0.5);
      put(BOX, sx, -0.2, gz1 + 1.6, 2.2, 2.2, 2.0, 0x8a6e52);
      put(GABLE, sx, 2.0, gz1 + 1.6, 2.6, 0.8, 2.4, 0x5d5148);
    } else {
      // rows of vegetables
      for (let r = 0; r < 3; r++) put(BOX, (r - 1) * 1.6, -0.1, gz1 + 2.2, 1.0, 0.4, 3.0, r % 2 ? 0x5a7a34 : 0x6b4a32);
    }
  }
}

const _sol = new THREE.Color();

const lamp = (s: number, k: number) => LAMPS[Math.floor(hash(s, k + 50) * LAMPS.length)];

/**
 * Windows: dark glass catching the sky by day, warm lamps behind some at dusk and most at night.
 * A pane's vertex colour is its lamp (black: never lit).
 */
export function windowMaterial(u: MapUniforms) {
  const m = mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol, vN, vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color;
        vN = normalize(mat3(modelMatrix) * normal);
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
        vec3 V = normalize((cameraPosition - uMapShift) - vWorld);
        float fres = 0.1 + 0.9 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), skyCol(reflect(-V, n)), 0.35 * fres + 0.1) * (0.5 + 0.5 * cloudShade(vWorld.xz));
        float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
        float on = step(0.002, vCol.r + vCol.g + vCol.b);
        vec3 c = mix(glass, vCol * uGlow * 0.32, on * (0.3 + 0.7 * night));
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
    side: THREE.DoubleSide,
  });
  m.polygonOffset = true;
  // (the panes sit a few centimetres off the walls: pulled well forward in depth, so far-off
  // houses' windows don't fight their walls)
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -8;
  return m;
}
