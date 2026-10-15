import * as THREE from 'three';
import { TreeKind, type Plan, type Tree } from './plan';
import { MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';
import { CITY, prng } from './layout';

/**
 * Trees and clouds. Trees are instanced per kind and per map tile, each tile swapping to a
 * few-triangle version once the camera is far from it; crowns are soft puffs (normals point out
 * from each puff's centre, so a 20-triangle blob shades like a cushion) swaying in the breeze.
 * Clouds are soft billboards: big cumulus banks on the horizon and a few drifting over the hills.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ tree geometry
class TreeBuilder {
  pos: number[] = [];
  nor: number[] = [];
  crown: number[] = [];
  /** Add a geometry; `centre` makes its normals point out from there (a soft puff). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, crown: number, centre?: THREE.Vector3) {
    const src = g.index ? g.toNonIndexed() : g;
    if (!src.attributes.normal) src.computeVertexNormals();
    const P = src.attributes.position, N = src.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      if (centre) n.subVectors(v, centre).multiply(_s.set(1, 1.6, 1)).normalize();
      else n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.crown.push(crown);
    }
    if (src !== g) src.dispose();
  }
  puff(g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0) {
    _q.setFromAxisAngle(_up, rot);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.add(g, _m, 1, new THREE.Vector3(x, y, z));
  }
  part(g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, crown = 0, rx = 0, rz = 0) {
    _m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).scale(_s.set(sx, sy, sz)).setPosition(x, y, z);
    this.add(g, _m, crown);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aCrown', new THREE.Float32BufferAttribute(this.crown, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function treeGeometry(kind: TreeKind, lod: 0 | 1) {
  const b = new TreeBuilder();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const oct = new THREE.OctahedronGeometry(1, 0);
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 5, 1, true).translate(0, 0.5, 0);
  const cone = (n: number) => new THREE.ConeGeometry(1, 1, n, 1, true).translate(0, 0.5, 0);
  if (kind === TreeKind.Broad || kind === TreeKind.Blossom) {
    if (lod === 0) {
      b.part(trunk, 0, -0.3, 0, 1, 2.8, 1);
      b.puff(ico, 0, 4.0, 0, 2.4, 2.0, 2.4, 0.3);
      b.puff(ico, 1.0, 3.2, 0.6, 1.6, 1.35, 1.6, 1.1);
      b.puff(ico, -0.9, 3.4, -0.5, 1.6, 1.35, 1.6, 2.0);
    } else b.puff(oct, 0, 3.7, 0, 2.6, 2.2, 2.6, 0.4);
  } else if (kind === TreeKind.Pine) {
    if (lod === 0) {
      b.part(trunk, 0, -0.3, 0, 1, 2.6, 1);
      const c = cone(6);
      b.add(c, _m.compose(_p.set(0, 1.6, 0), _q.identity(), _s.set(2.3, 3.6, 2.3)), 1, new THREE.Vector3(0, 2.4, 0));
      b.add(c, _m.compose(_p.set(0, 3.6, 0), _q.setFromAxisAngle(_up, 0.5), _s.set(1.85, 3.3, 1.85)), 1, new THREE.Vector3(0, 4.4, 0));
      b.add(c, _m.compose(_p.set(0, 5.6, 0), _q.setFromAxisAngle(_up, 1.0), _s.set(1.3, 3.4, 1.3)), 1, new THREE.Vector3(0, 6.4, 0));
    } else {
      b.add(cone(5), _m.compose(_p.set(0, 0.8, 0), _q.identity(), _s.set(2.3, 8.4, 2.3)), 1, new THREE.Vector3(0, 3.2, 0));
    }
  } else {
    // palm: a leaning, curving trunk and a crown of drooping fronds
    const seg = lod === 0 ? 4 : 2;
    let x = 0, y = -0.3;
    for (let k = 0; k < seg; k++) {
      const h = 7.2 / seg;
      const lean = 0.06 + k * 0.07;
      b.part(trunk, x, y, 0, 1.1 - k * 0.1, h + 0.1, 1.1 - k * 0.1, 0, 0, -lean);
      x += Math.sin(lean) * h;
      y += Math.cos(lean) * h;
    }
    const fronds = lod === 0 ? 7 : 4;
    for (let k = 0; k < fronds; k++) {
      const a = (k / fronds) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // a frond: two quads, out and down
      const pts = [
        [0, 0, 0],
        [2.0, 0.5, 0],
        [3.8, -0.6, 0],
      ];
      const pos: number[] = [];
      for (let s = 0; s < 2; s++) {
        const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
        const wa = s === 0 ? 0.15 : 0.7, wb = s === 0 ? 0.7 : 0.05;
        pos.push(ax, ay, -wa, bx, by, -wb, bx, by, wb, ax, ay, -wa, bx, by, wb, ax, ay, wa);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      _m.makeRotationY(-a).setPosition(x, y, 0);
      b.add(g, _m, 1, new THREE.Vector3(x - ca * 1.0, y - 1.5, 0 - sa * 1.0));
    }
  }
  return b.geometry();
}

function treeMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute float aCrown;
      uniform float uTime;
      varying vec3 vCol, vN, vWorld;
      varying float vCrown, vH;
      #include <fog_pars_vertex>
      void main() {
        vCrown = aCrown;
        vCol = instanceColor;
        vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        // the breeze: the crown sways, more at the top, in gusts that roll across the land
        float gust = 0.6 + 0.4 * sin(uTime * 0.7 + base.x * 0.013 + base.z * 0.009);
        float sway = sin(uTime * 1.9 + base.x * 0.31 + base.z * 0.17) * gust * aCrown * max(position.y, 0.0) * 0.035;
        w.x += sway;
        w.z += sway * 0.5;
        vWorld = w.xyz;
        vH = position.y;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol, vN, vWorld;
      varying float vCrown, vH;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN);
        vec3 trunk = vec3(0.32, 0.22, 0.15);
        // leafy grain, and the crowns darker deep inside (lower down)
        float leaf = texture2D(uNoise, vWorld.xz / 5.0 + vWorld.y / 7.0).r;
        vec3 alb = mix(trunk, vCol * (0.8 + 0.35 * leaf), vCrown);
        alb *= mix(0.62, 1.0, smoothstep(1.5, 6.0, vH));
        // soft wrap lighting on the crowns, and a warm glow where the low sun comes through them
        float ndl = dot(n, uSunDir);
        float wrap = mix(max(ndl, 0.0), clamp(ndl * 0.6 + 0.4, 0.0, 1.0), vCrown);
        float cs = cloudShade(vWorld.xz);
        float sh = sunShadow(vWorld + n * 3.0);
        vec3 light = ambient(n) * mix(0.82, 1.0, cs) + uSunCol * wrap * sh * cs;
        vec3 c = alb * light;
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
    side: THREE.DoubleSide,
  });
}

const CROWN: Record<number, number[]> = {
  [TreeKind.Broad]: [0x5c8f36, 0x6b9a3a, 0x4f8034, 0x78a240, 0x5f8a2e, 0xc9a640, 0xa3a83a],
  [TreeKind.Pine]: [0x2f5e3a, 0x376a40, 0x2a5233, 0x3e6e3c],
  [TreeKind.Blossom]: [0xf4a8c4, 0xf7c4d6, 0xf2b6cc, 0xfbe0ea],
  [TreeKind.Palm]: [0x6b9b3a, 0x7caa40, 0x5f8f34],
};

/** How far a tile is from the camera before it swaps to the cheap trees. */
const LOD_FAR = 480;
const TILE = 500;

export interface Forest {
  group: THREE.Group;
  /** Swap tiles' tree detail for where the camera is. */
  update(camera: THREE.Camera): void;
}

export function buildTrees(u: MapUniforms, plan: Plan): Forest {
  const group = new THREE.Group();
  const mat = treeMaterial(u);
  const geos = [0, 1, 2, 3].map((k) => [treeGeometry(k as TreeKind, 0), treeGeometry(k as TreeKind, 1)]);
  // bucket by tile and kind
  const tiles = new Map<string, Tree[][]>();
  for (const t of plan.trees) {
    const key = `${Math.floor(t.x / TILE)},${Math.floor(t.z / TILE)}`;
    let tl = tiles.get(key);
    if (!tl) tiles.set(key, (tl = [[], [], [], []]));
    tl[t.kind].push(t);
  }
  const meshes: { mesh: THREE.InstancedMesh; kind: number; centre: THREE.Vector3; lod: number }[] = [];
  const r = prng(31);
  for (const [, tl] of tiles)
    tl.forEach((list, kind) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geos[kind][0], mat, list.length);
      const centre = new THREE.Vector3();
      list.forEach((t, i) => {
        _q.setFromAxisAngle(_up, r() * Math.PI * 2);
        _m.compose(_p.set(t.x, t.y, t.z), _q, _s.setScalar(t.s));
        mesh.setMatrixAt(i, _m);
        const pal = CROWN[kind];
        _c.setHex(pal[Math.floor(t.col * pal.length) % pal.length]);
        // a little variety in every crown
        _c.offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08);
        mesh.setColorAt(i, _c);
        centre.x += t.x;
        centre.y += t.y;
        centre.z += t.z;
      });
      centre.divideScalar(list.length);
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push({ mesh, kind, centre, lod: 0 });
    });
  const cam = new THREE.Vector3();
  return {
    group,
    update(camera) {
      camera.getWorldPosition(cam);
      for (const m of meshes) {
        // distance to the nearest edge of the tile, roughly
        const d = Math.max(0, cam.distanceTo(m.centre) - TILE * 0.6);
        const lod = d > LOD_FAR ? 1 : 0;
        if (lod !== m.lod) {
          m.lod = lod;
          m.mesh.geometry = geos[m.kind][lod];
        }
      }
    },
  };
}

// ------------------------------------------------------------------ clouds
/**
 * Fair-weather cumulus: soft billboards, sunlit on top and the side towards the sun, grey-violet
 * underneath, banked up on the horizon all round and a few drifting over the hills, fading out as
 * the camera nears them.
 */
export function buildClouds(u: MapUniforms) {
  const r = prng(1234);
  const centres: number[] = [], sizes: number[] = [], seeds: number[] = [];
  const cluster = (x: number, y: number, z: number, s: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = r() * s * 0.9;
      const ps = s * (0.35 + r() * 0.4);
      // flat bottoms: puffs sit on the cloud's base and pile up in the middle
      const py = y + ps * 0.25 + (1 - d / s) * s * 0.35 * r();
      centres.push(x + Math.cos(a) * d * 1.4, py, z + Math.sin(a) * d * 0.8);
      sizes.push(ps);
      seeds.push(r());
    }
  };
  // banks on the horizon
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + r() * 0.15;
    const d = 3300 + r() * 1300;
    cluster(Math.cos(a) * d, 380 + r() * 260, Math.sin(a) * d, 260 + r() * 260, 9);
  }
  // a few over the land and sea, kept off the city
  for (let k = 0; k < 16; k++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = (r() - 0.5) * 3600;
      z = (r() - 0.5) * 3600;
      if (Math.hypot(x - CITY.x, z - CITY.z) > CITY.r + 500) break;
    }
    cluster(x, 520 + r() * 160, z, 110 + r() * 90, 7);
  }
  const n = sizes.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aCentre', new THREE.InstancedBufferAttribute(new Float32Array(centres), 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  g.instanceCount = n;
  const mat = mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 aCentre;
      attribute float aSize, aSeed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed, vNear;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = position.xy;
        vSeed = aSeed;
        vec3 c = aCentre + vec3(uTime * 2.2, 0.0, uTime * 0.8);
        // camera-facing quad
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float dist = -mv.z;
        vNear = smoothstep(aSize * 1.2, aSize * 3.5, dist);
        vec4 mvPosition = mv + vec4(position.xy * aSize, 0.0, 0.0);
        vWorld = c + position.y * aSize * vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec2 vUv;
      varying float vSeed, vNear;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        // a lumpy edge
        float edge = texture2D(uNoise, vUv * 0.35 + vSeed * 7.0).g;
        float a = smoothstep(1.0, 0.55, d + (edge - 0.5) * 0.45);
        // flat-ish base
        a *= smoothstep(-0.95, -0.55, vUv.y);
        if (a < 0.01) discard;
        // light: bright warm top, cool shaded underside, the low sun's side lit
        float top = clamp(vUv.y * 0.6 + 0.5, 0.0, 1.0);
        vec3 lit = uSunCol * 0.42 + vec3(0.42, 0.42, 0.45);
        vec3 shade = vec3(0.56, 0.55, 0.66);
        vec3 c = mix(shade, lit, smoothstep(0.15, 0.85, top + (edge - 0.5) * 0.3));
        gl_FragColor = vec4(c, a * 0.92 * vNear);
        ${MAP_OUT}
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}
