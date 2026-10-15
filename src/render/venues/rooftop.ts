import * as THREE from 'three';
import { AX, FLOOR, TUNNEL_OPEN_H, TUNNEL_OPEN_HW } from '../bowl';
import { RenderSettings } from '../settings';
import { AA_GLSL, NIGHT_COLORS, SUN as MAP_MOON, mapUniforms, type MapUniforms } from '../map/kit';
import { SITES } from '../map/layout';
import { buildPlan } from '../map/plan';
import { SKYDECK_Y } from '../map/sites';
import { buildGround } from '../map/terrain';
import { buildSea } from '../map/sea';
import { buildCity, type City } from '../map/city';
import { buildTowers, type MegaTowers } from '../map/towers';
import { buildHolograms, type Holograms } from '../map/holo';
import { buildTrees, type Forest } from '../map/nature';
import { AD_GRID, adAtlas } from '../map/projections';
import { Mesher, billboards, glowMaterial, lin, litMaterial, paintTexture, prng, vMaterial, V_GLSL, V_OUT, type Daylight, type VenueUniforms } from './kit';
import { OutdoorVenue, STANDS_D, STANDS_TOP, sunLook } from './outdoor';
import { block, rod } from './props';

/**
 * Skydeck 88: the Neon Heights Championship, on the open roof of the tower in the middle of
 * downtown, two hundred and fifty metres up, at night. Round it is the world map itself, the same
 * city, sea and mountains, lit for the night: the Spire's twisting glass right behind the north
 * stand, the Monolith and the Needle either side, the giant hologram in the plaza below, the holo
 * whale swimming past, maglev and traffic far down in the streets. On the deck: a crown of lit
 * glass floors stepping out under it, a glass balustrade, holo banners on lattice masts at the
 * corners, a marquee of holo text circling over the whole roof, searchlights, and the skyway's
 * flying traffic streaming round downtown at the deck's height.
 */

// ------------------------------------------------------------------ the place
/** The moon: where the map's night puts it, so the sky and the city's glass agree. */
const MOON = MAP_MOON.clone();
const DAY: Daylight = { sun: MOON, sunCol: 0x9ab0ff, sunK: 0.32, sky: 0x5a5ab0, skyK: 0.34, gnd: 0x7a3a80, gndK: 0.3, haze: NIGHT_COLORS.fog, hazeK: 0.0005 };
/** The floodlights on the fighters: high, from the south-west. */
const KEY_DIR = new THREE.Vector3(-0.45, 0.85, 0.5);
/** The map's density for its own fog (exp², as the map draws it). */
const FOG = 0.00026;

/** The deck: half its size each way, its corners cut back. */
const DX = 34, DZ = 32, CH = 6;
/** The map's tower shaft below the crown (its half width), and where the crown starts. */
const SHAFT = 19;
const CROWN_Y = FLOOR - 22;
/** Where the world map is drawn: the Skydeck tower's top at the ring's floor. */
const SHIFT = new THREE.Vector3(-SITES.rooftop.x, FLOOR - SKYDECK_Y, -SITES.rooftop.z);

/** The deck's neon colours: magenta and cyan. */
const PINK = new THREE.Color(1, 0.25, 0.65);
const CYAN = new THREE.Color(0.25, 0.92, 1);

type V3 = [number, number, number];
type P2 = [number, number];

/** A rectangle half hx by hz with its corners cut back by c, round from the north-west. */
function octagon(hx: number, hz: number, c: number): P2[] {
  return [
    [-hx + c, -hz],
    [hx - c, -hz],
    [hx, -hz + c],
    [hx, hz - c],
    [hx - c, hz],
    [-hx + c, hz],
    [-hx, hz - c],
    [-hx, -hz + c],
  ];
}

// ------------------------------------------------------------------ the crown's skin
/** What a face of the crown is (the facade shader draws each its own way). */
const F = { Warm: 0, Bar: 1, Cool: 2, Fascia: 3, Soffit: 4, Deck: 5 } as const;

/** Faces with what the facade shader needs: metres across and up the face, and its kind. */
class Skin {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  kind: number[] = [];

  tri(a: V3, b: V3, c: V3, ua: P2, ub: P2, uc: P2, n: V3, k: number) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
    }
    for (const [p, q] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ] as [V3, P2][]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(q[0], q[1]);
      this.kind.push(k);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: P2, ub: P2, uc: P2, ud: P2, n: V3, k: number) {
    this.tri(a, b, c, ua, ub, uc, n, k);
    this.tri(a, c, d, ua, uc, ud, n, k);
  }

  /** The walls round an outline from y0 to y1 (u: metres round it, v: metres up). */
  walls(o: P2[], y0: number, y1: number, k: number) {
    let u = 0;
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      const n: V3 = [dz / l, 0, -dx / l];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [u, 0], [u + l, 0], [u + l, y1 - y0], [u, y1 - y0], n, k);
      u += l;
    }
  }

  /** The flat ring between two outlines at y, facing up or down (uv: x, z). */
  ring(inner: P2[], outer: P2[], y: number, up: boolean, k: number) {
    const n: V3 = [0, up ? 1 : -1, 0];
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length], c = outer[(i + 1) % outer.length], d = outer[i];
      this.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], a, b, c, d, n, k);
    }
  }

  /** A flat convex outline at y, facing up or down. */
  cap(o: P2[], y: number, up: boolean, k: number) {
    const n: V3 = [0, up ? 1 : -1, 0];
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length];
      this.tri([0, y, 0], [a[0], y, a[1]], [b[0], y, b[1]], [0, 0], a, b, n, k);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The crown: three floors stepping out over the map's shaft (a lounge in warm light, a bar in
 * magenta, the deck's own glazed level in cool white), their soffits full of downlights, the
 * deck's fascia with two neon lines chasing round, and the deck itself: dark boards with a strip
 * of light round the edge.
 */
function crown(u: VenueUniforms) {
  const s = new Skin();
  const tiers = [
    { o: octagon(23, 23, 4), y0: CROWN_Y, y1: FLOOR - 15, k: F.Warm },
    { o: octagon(29, 27.5, 5), y0: FLOOR - 15, y1: FLOOR - 8, k: F.Bar },
    { o: octagon(DX, DZ, CH), y0: FLOOR - 8, y1: FLOOR - 2, k: F.Cool },
  ];
  const deck = octagon(DX, DZ, CH);
  s.ring(octagon(SHAFT, SHAFT, 0.01), tiers[0].o, CROWN_Y, false, F.Soffit);
  tiers.forEach((t, i) => {
    s.walls(t.o, t.y0, t.y1, t.k);
    const next = tiers[i + 1];
    if (next) s.ring(t.o, next.o, t.y1, false, F.Soffit);
  });
  s.walls(deck, FLOOR - 2, FLOOR + 0.02, F.Fascia);
  s.cap(deck, FLOOR - 0.02, true, F.Deck);

  const mat = vMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec2 aUV;
      attribute float aKind;
      varying vec3 vN, vW;
      varying vec2 vUV;
      varying float vKind;
      void main() {
        vN = normal;
        vUV = aUV;
        vKind = aKind;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      ${AA_GLSL}
      varying vec3 vN, vW;
      varying vec2 vUV;
      varying float vKind;
      // what the glass mirrors: the night overhead, the city's violet glow round the horizon, the
      // lit streets far below
      vec3 skyRefl(vec3 r) {
        vec3 up = mix(vec3(0.05, 0.045, 0.12), vec3(0.012, 0.016, 0.05), smoothstep(0.0, 0.6, r.y));
        vec3 below = vec3(0.13, 0.07, 0.12) + vec3(0.14, 0.07, 0.02) * smoothstep(-0.05, -0.6, r.y);
        return mix(below, up, smoothstep(-0.08, 0.06, r.y)) + vec3(0.24, 0.1, 0.28) * exp(-abs(r.y) * 9.0);
      }
      void main() {
        vec3 n = normalize(vN);
        vec2 f = vUV;
        vec2 px = max(fwidth(f), vec2(1e-4));
        vec3 V = normalize(cameraPosition - vW);
        float k = vKind;
        float glow = uGlow * (0.9 + 0.2 * uHype);
        vec3 c;
        if (k < 2.5) {
          // ---- a glazed floor: mullions, a slab band at the floor, the ceiling's light strip,
          // people and tables against the light
          vec3 lamp = k < 0.5 ? vec3(1.0, 0.68, 0.4) : k < 1.5 ? vec3(1.0, 0.34, 0.7) : vec3(0.7, 0.86, 1.0);
          float H = ${(7).toFixed(1)};
          if (k > 1.5) H = 6.0;
          float mull = 1.0 - fpulse(f.x / 1.8 - 0.03, 0.94, px.x / 1.8);
          float slab = fband(f.y, 0.0, 0.55, px.y) + fband(f.y, H - 0.35, H, px.y);
          float glass = (1.0 - mull) * (1.0 - min(slab, 1.0));
          float ceil = fband(f.y, H - 1.0, H - 0.75, px.y);
          float room = 0.18 + 0.5 * smoothstep(0.6, H - 0.8, f.y);
          // silhouettes: a band of people and tables, broken up along the floor
          float sil = texture2D(uNoise, vec2(f.x * 0.11, 0.37)).g;
          float top = 1.2 + sil * 1.1;
          float dark = step(0.42, sil) * fband(f.y, 0.55, top, px.y);
          vec3 inside = lamp * (room * (1.0 - 0.8 * dark) + ceil * 2.2);
          // some bays dimmer than others
          inside *= 0.55 + 0.45 * step(0.25, hash12(vec2(floor(f.x / 5.4), k)));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
          vec3 refl = skyRefl(reflect(-V, n));
          vec3 g = mix(inside * glow * 0.45, refl, 0.25 + 0.6 * fres);
          vec3 frame = vec3(0.05, 0.052, 0.06) * vLight(n);
          c = mix(frame, g, glass);
        } else if (k < 3.5) {
          // ---- the fascia: dark panels, a cyan line along the top and a magenta one low down,
          // lights chasing round
          vec3 alb = vec3(0.07, 0.072, 0.085) * (0.9 + 0.1 * fpulse(f.x / 3.0, 0.97, px.x / 3.0));
          float chase = 0.55 + 0.45 * smoothstep(0.55, 1.0, fract(f.x / 26.0 - uTime * 0.32));
          vec3 neon = vec3(0.25, 0.92, 1.0) * fband(f.y, 1.55, 1.72, px.y) + vec3(1.0, 0.25, 0.65) * fband(f.y, 0.22, 0.3, px.y);
          c = alb * vLight(n) + neon * chase * glow * 0.9;
        } else if (k < 4.5) {
          // ---- a soffit: dark, a grid of warm downlights
          vec2 q = fract(f / 3.0) - 0.5;
          float d = length(q) * 3.0;
          float pd = length(px);
          float spot = 1.0 - smoothstep(0.13, 0.13 + pd, d);
          c = vec3(0.04, 0.04, 0.05) * vLight(n) + vec3(1.0, 0.86, 0.68) * (spot * 1.6 + exp(-d * 5.0) * 0.08) * glow * 0.55;
        } else {
          // ---- the deck: dark composite boards, a strip of light round the edge
          vec3 alb = vec3(0.085, 0.085, 0.1) * (0.88 + 0.12 * fpulse(f.y / 0.32, 0.93, px.y / 0.32));
          alb *= 0.9 + 0.2 * texture2D(uNoise, f * 0.05).r;
          vec2 a = abs(f);
          float e = min(min(${DX.toFixed(1)} - a.x, ${DZ.toFixed(1)} - a.y), (${(DX + DZ - CH).toFixed(1)} - a.x - a.y) * 0.7071);
          float pe = length(px);
          float led = fband(e, 0.9, 1.02, pe);
          float dots = fband(e, 2.2, 2.32, pe) * fpulse(f.x / 2.0 + f.y / 2.0, 0.3, pe / 2.0);
          c = alb * (vLight(n) + vec3(0.06, 0.03, 0.07)) + (vec3(0.25, 0.92, 1.0) * led + vec3(1.0, 0.25, 0.65) * dots * 0.7) * glow * 0.8;
        }
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
  return new THREE.Mesh(s.geometry(), mat);
}

/** The glass balustrade round the deck's edge: panels that only catch the light, a lit handrail. */
function balustrade(u: VenueUniforms, steel: Mesher, glow: Mesher) {
  const o = octagon(DX - 0.3, DZ - 0.3, CH - 0.12);
  const s = new Skin();
  const H = 1.15;
  s.walls(o, FLOOR, FLOOR + H, 0);
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const rot = Math.atan2(-dz, dx);
    block(glow, l, 0.05, 0.07, (a[0] + b[0]) / 2, FLOOR + H + 0.03, (a[1] + b[1]) / 2, CYAN.clone().multiplyScalar(0.9), rot);
    block(steel, l, 0.06, 0.1, (a[0] + b[0]) / 2, FLOOR + H - 0.03, (a[1] + b[1]) / 2, 0x2a2e36, rot);
    const n = Math.max(1, Math.round(l / 2.4));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      block(steel, 0.08, H, 0.08, a[0] + dx * t, FLOOR + H / 2, a[1] + dz * t, 0x2a2e36, rot);
    }
  }
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aUV;
      varying vec3 vN, vW;
      varying vec2 vUV;
      void main() {
        vN = normal;
        vUV = aUV;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vN, vW;
      varying vec2 vUV;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - abs(dot(V, normalize(vN))), 3.0);
        float edge = smoothstep(${(H - 0.12).toFixed(2)}, ${H.toFixed(2)}, vUV.y);
        vec3 c = vec3(0.35, 0.75, 1.0) * (0.025 + 0.22 * fres) + vec3(0.6, 0.9, 1.0) * edge * 0.3;
        gl_FragColor = vec4(c * uGlow * 0.5, 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(s.geometry(), mat);
  m.renderOrder = 6;
  return m;
}

// ------------------------------------------------------------------ holograms on the deck
const HOLO_FRAG_HEAD = /* glsl */ `
  float flicker(float seed) { return 0.86 + 0.14 * step(0.1, fract(sin(floor(uTime * 13.0 + seed * 30.0)) * 437.5)); }
`;

/**
 * Holo banners over the corners, beamed up from the lattice masts: each flips between two of the
 * league's ads (the same atlas the map's projections use) with a wipe and a glitch, readable from
 * either side.
 */
function banners(u: VenueUniforms, spots: { x: number; y: number; z: number; yaw: number; w: number; h: number; pair: [number, number]; from: V3 }[]) {
  const [COLS, ROWS] = AD_GRID;
  const plane = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index;
  g.setAttribute('position', plane.attributes.position);
  g.setAttribute('uv', plane.attributes.uv);
  const at: number[] = [], ad: number[] = [];
  spots.forEach((s, i) => {
    at.push(s.x, s.y, s.z, s.yaw);
    ad.push(s.w, s.h, (i * 0.618) % 1, s.pair[0] + s.pair[1] * 16);
  });
  g.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  g.setAttribute('aAd', new THREE.InstancedBufferAttribute(new Float32Array(ad), 4));
  g.instanceCount = spots.length;
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAds: { value: adAtlas() } },
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec4 aAt, aAd;
      varying vec2 vUv;
      varying vec4 vAd;
      varying vec3 vW;
      varying float vGlitch;
      void main() {
        vUv = uv;
        vAd = aAd;
        float slot = floor(uTime * 5.0 + aAd.z * 50.0);
        vGlitch = step(0.93, fract(sin(slot * 17.3 + aAd.z * 91.0) * 4375.85));
        vec2 q = position.xy * aAd.xy;
        q.x += vGlitch * (fract(sin(slot * 3.7) * 931.7) - 0.5) * aAd.x * 0.3;
        float c = cos(aAt.w), s = sin(aAt.w);
        vec3 w = aAt.xyz + vec3(c * q.x, q.y + sin(uTime * 0.6 + aAd.z * 20.0) * 0.2, -s * q.x);
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      ${HOLO_FRAG_HEAD}
      uniform sampler2D uAds;
      varying vec2 vUv;
      varying vec4 vAd;
      varying vec3 vW;
      varying float vGlitch;
      vec2 cell(float n, vec2 uv) {
        float col = mod(n, ${COLS}.0), row = floor(n / ${COLS}.0);
        uv = clamp(uv, vec2(0.004), vec2(0.996));
        return vec2((col + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
      }
      void main() {
        vec2 uv = vUv;
        // (read the right way round from behind too)
        if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
        float t = uTime / 7.0 + vAd.z * 3.0;
        float ph = fract(t);
        float n = mod(floor(t), 2.0) < 0.5 ? mod(vAd.w, 16.0) : floor(vAd.w / 16.0);
        vec2 g = uv;
        g.x += vGlitch * 0.03 * sin(uv.y * 80.0 + uTime * 40.0);
        float split = 0.003 + vGlitch * 0.012;
        vec3 ad = vec3(texture2D(uAds, cell(n, g + vec2(split, 0.0))).r, texture2D(uAds, cell(n, g)).g, texture2D(uAds, cell(n, g - vec2(split, 0.0))).b);
        // the new ad wipes down from the top
        float wipe = smoothstep(0.0, 0.06, ph);
        float shown = step(1.0 - wipe, uv.y);
        float line = exp(-abs(uv.y - (1.0 - wipe)) * 120.0) * step(ph, 0.06);
        float scan = 0.72 + 0.28 * step(0.5, fract(uv.y * 70.0 - uTime * 2.0));
        float e = min(min(uv.x, 1.0 - uv.x) * vAd.x, min(uv.y, 1.0 - uv.y) * vAd.y);
        float frame = smoothstep(0.14, 0.0, e);
        vec3 c = ad * shown * 1.15 + vec3(0.3, 0.85, 1.0) * (frame * 0.7 + line + 0.04);
        c *= scan * flicker(vAd.z);
        gl_FragColor = vec4(c * uGlow * 0.55, 1.0);
        ${V_OUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;

  // the beams up from each emitter to its banner's corners
  const pos: number[] = [], along: number[] = [];
  for (const s of spots) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    const corner = (qx: number, qy: number): V3 => [s.x + c * qx * s.w, s.y + qy * s.h, s.z - sn * qx * s.w];
    const k = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
    for (let i = 0; i < 4; i++) {
      const a = k[i], b = k[(i + 1) % 4];
      pos.push(...s.from, ...a, ...b);
      along.push(0, 1, 1);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('aT', new THREE.Float32BufferAttribute(along, 1));
  const beams = new THREE.Mesh(
    bg,
    vMaterial(u, {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aT;
        varying float vT;
        void main() {
          vT = aT;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${V_GLSL}
        varying float vT;
        void main() {
          float k = 0.03 + 0.05 * vT * vT;
          gl_FragColor = vec4(vec3(0.3, 0.8, 1.0) * k * uGlow, 1.0);
          ${V_OUT}
        }`,
    }),
  );
  beams.renderOrder = 7;
  return [mesh, beams];
}

/** The holo marquee: a band of light circling over the roof, the championship's name running round it. */
function marquee(u: VenueUniforms) {
  const R = 45, H = 5, REPS = 6;
  const text = paintTexture(4096, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const line = 'NEON HEIGHTS CHAMPIONSHIP  ◆  SKYDECK 88  ◆  ネオンハイツ  ◆  ';
    let size = 170;
    g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    const tw = g.measureText(line).width || w;
    size = Math.min(190, (size * w) / tw);
    g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.shadowColor = '#fff';
    g.shadowBlur = 18;
    g.fillStyle = '#fff';
    g.fillText(line, w / 2, h * 0.54, w * 0.99);
  });
  text.minFilter = THREE.LinearMipmapLinearFilter;
  const geo = new THREE.CylinderGeometry(R, R, H, 160, 1, true);
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uText: { value: text } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      ${AA_GLSL}
      ${HOLO_FRAG_HEAD}
      uniform sampler2D uText;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        // (seen from inside the ring the text reads the right way round)
        float a = gl_FrontFacing ? vUv.x : 1.0 - vUv.x;
        float slot = floor(uTime * 6.0);
        float band = floor(vUv.x * 48.0);
        float hit = step(0.93, fract(sin(slot * 12.9 + band * 78.2) * 43758.5));
        float s = a * ${REPS}.0 + uTime * 0.012 + hit * 0.01;
        vec2 tuv = vec2(fract(s), (vUv.y - 0.16) / 0.68);
        float inBand = step(0.0, tuv.y) * step(tuv.y, 1.0);
        vec2 px = fwidth(vUv);
        float txt = texture2D(uText, tuv).r * inBand;
        float rails = fband(vUv.y, 0.0, 0.045, px.y) + fband(vUv.y, 0.955, 1.0, px.y);
        rails *= 0.45 + 0.55 * step(0.5, fract(vUv.x * 260.0 - uTime * 0.9));
        vec3 hue = mix(vec3(1.0, 0.25, 0.65), vec3(0.25, 0.92, 1.0), 0.5 + 0.5 * sin(vUv.x * 12.566 + uTime * 0.35));
        float scan = 0.7 + 0.3 * step(0.5, fract(vW.y * 3.0 - uTime * 1.5));
        vec3 c = hue * (txt * (1.0 + hit) + rails * 0.9 + 0.03 * inBand) * scan * flicker(band * 0.1);
        gl_FragColor = vec4(c * uGlow * 0.6, 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = FLOOR + 23;
  m.renderOrder = 7;
  return m;
}

/** Searchlights at the deck's corners, sweeping the sky. */
function searchlights(u: VenueUniforms, tick: ((dt: number, t: number) => void)[], spots: V3[]) {
  const L = 520;
  const geo = new THREE.CylinderGeometry(15, 0.45, L, 16, 1, true).translate(0, L / 2, 0);
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vW, vN;
      void main() {
        vAlong = position.y / ${L.toFixed(1)};
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying float vAlong;
      varying vec3 vW, vN;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float core = pow(abs(dot(normalize(vN), V)), 1.8);
        float k = core * pow(1.0 - vAlong, 1.5) * smoothstep(0.0, 0.015, vAlong) * 0.07;
        gl_FragColor = vec4(vec3(0.78, 0.86, 1.0) * k * uGlow, 1.0);
        ${V_OUT}
      }`,
  });
  const g = new THREE.Group();
  const beams = spots.map((p, i) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 5;
    m.frustumCulled = false;
    g.add(m);
    return { m, ph: i * 1.7 + (p[0] > 0 ? 0.4 : 0) };
  });
  const e = new THREE.Euler();
  tick.push((_dt, t) => {
    for (const b of beams) {
      e.set(0.42 + 0.2 * Math.sin(t * 0.23 + b.ph * 2.0), t * 0.13 + b.ph, 0, 'YXZ');
      b.m.rotation.copy(e);
    }
  });
  return g;
}

/**
 * The skyway: flying cars streaming round downtown at the deck's height in four lanes, their
 * headlights white, tail lights red, a coloured glow under each, all moved on the GPU.
 */
function skyway(u: VenueUniforms, r: () => number, low: boolean) {
  // lanes: centre (round the mega-towers), radii, height above the deck, direction
  const C = { x: 30, z: -70 };
  const lanes = [
    { rx: 150, rz: 158, y: 9, dir: 1 },
    { rx: 170, rz: 176, y: 15, dir: -1 },
    { rx: 214, rz: 200, y: 34, dir: 1 },
    { rx: 248, rz: 236, y: -12, dir: -1 },
  ];
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  const lane: number[] = [], car: number[] = [];
  const per = low ? 14 : 30;
  lanes.forEach((l) => {
    for (let i = 0; i < per; i++) {
      // bunched up a little, as traffic is
      const ph = (i + r() * 0.6) / per;
      lane.push(l.rx, l.rz, FLOOR + l.y + (r() - 0.5) * 3, l.dir);
      car.push(ph * Math.PI * 2, 0.9 + r() * 0.3, Math.floor(r() * 3), r());
    }
  });
  g.setAttribute('aLane', new THREE.InstancedBufferAttribute(new Float32Array(lane), 4));
  g.setAttribute('aCar', new THREE.InstancedBufferAttribute(new Float32Array(car), 4));
  g.instanceCount = lane.length / 4;
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec4 aLane, aCar;
      varying vec2 vQ;
      varying vec3 vCol, vW;
      void main() {
        vQ = position.xy + 0.5;
        // round the lane at about 40 m/s
        float R = 0.5 * (aLane.x + aLane.y);
        float a = aCar.x + aLane.w * uTime * 40.0 * aCar.y / R;
        vec3 p = vec3(${C.x.toFixed(1)} + cos(a) * aLane.x, aLane.z + sin(uTime * 0.8 + aCar.w * 20.0) * 0.6, ${C.z.toFixed(1)} + sin(a) * aLane.y);
        vec3 fwd = normalize(vec3(-sin(a) * aLane.x, 0.0, cos(a) * aLane.y)) * aLane.w;
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(fwd, toCam));
        // a streak: tail (x = 0) to head (x = 1), 9 m long, a metre wide
        p += fwd * (position.x * 9.0 - 1.5) + side * position.y * 1.1;
        float k = aCar.z;
        vCol = k < 0.5 ? vec3(1.0, 0.25, 0.65) : k < 1.5 ? vec3(0.25, 0.92, 1.0) : vec3(1.0, 0.7, 0.35);
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec2 vQ;
      varying vec3 vCol, vW;
      void main() {
        float x = vQ.x, y = abs(vQ.y - 0.5) * 2.0;
        // white at the head, red behind, the trail fading, the underglow round it all
        float head = smoothstep(0.82, 1.0, x) * (1.0 - smoothstep(0.0, 0.35, y));
        float tail = smoothstep(0.0, 0.85, x) * (1.0 - smoothstep(0.0, 0.25, y)) * 0.55;
        vec3 c = vec3(1.0, 0.95, 0.85) * head * 2.2 + vec3(1.0, 0.12, 0.08) * tail + vCol * (1.0 - y) * x * 0.35;
        gl_FragColor = vec4(c * uGlow * 0.6 * (1.0 - 0.6 * hazeAt(vW)), 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 6;
  return m;
}

/** A square lattice mast, its legs drawing in as it rises, braced every few metres. */
function lattice(m: Mesher, x: number, z: number, y0: number, h: number, w0: number, w1: number) {
  const leg = (i: number, y: number): V3 => {
    const t = (y - y0) / h, w = (w0 + (w1 - w0) * t) / 2;
    return [x + (i === 0 || i === 3 ? -w : w), y, z + (i < 2 ? -w : w)];
  };
  const col = 0x2a2e36;
  for (let i = 0; i < 4; i++) rod(m, leg(i, y0), leg(i, y0 + h), 0.07, 0.05, col, 5);
  const step = 2.6;
  for (let y = y0; y < y0 + h - 0.5; y += step) {
    const y1 = Math.min(y0 + h, y + step);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      rod(m, leg(i, y), leg(j, y1), 0.03, 0.03, col, 4);
      rod(m, leg(i, y1), leg(j, y1), 0.03, 0.03, col, 4);
    }
  }
}

// ------------------------------------------------------------------ textures
function deckTileTexture() {
  const r = prng(88);
  return paintTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#17181e';
    g.fillRect(0, 0, w, h);
    // big dark tiles, a little mottled, fine cyan hairlines between them
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const v = 20 + ((i * 7 + j * 13) % 5) * 2;
        g.fillStyle = `rgb(${v},${v + 1},${v + 6})`;
        g.fillRect(i * (w / 2) + 3, j * (h / 2) + 3, w / 2 - 6, h / 2 - 6);
      }
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.025})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(80,220,255,0.55)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
  });
}

function neonText(label: string, color: string, w = 1024, h = 160) {
  return paintTexture(
    w,
    h,
    (g) => {
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, w, h);
      g.font = `800 ${Math.round(h * 0.52)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = color;
      g.shadowBlur = h * 0.18;
      g.fillStyle = color;
      g.fillText(label, w / 2, h * 0.53, w * 0.94);
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.7;
      g.fillText(label, w / 2, h * 0.53, w * 0.94);
      g.globalAlpha = 1;
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.strokeRect(8, 8, w - 16, h - 16);
    },
    false,
  );
}

// ------------------------------------------------------------------ the city round it
/**
 * The world map, built again for this view at night and drawn moved so the Skydeck tower's top is
 * the ring's floor (uMapShift). The tower's own top block gives way to the crown; the event
 * markers aren't here.
 */
function cityBelow(venue: OutdoorVenue, quality: 'low' | 'med' | 'high') {
  const mu: MapUniforms = mapUniforms(RenderSettings.glow(7));
  mu.uNoise.value = venue.u.uNoise.value;
  mu.uNight.value = 1;
  mu.uDusk.value = 1;
  mu.uSunCol.value.copy(NIGHT_COLORS.sun);
  mu.uSky.value.copy(NIGHT_COLORS.sky);
  mu.uGnd.value.copy(NIGHT_COLORS.ground);
  // (no shadow map: the moon's light falls everywhere)
  mu.uShadowHalf.value = 1e-4;
  mu.uFogOut.value.setHex(NIGHT_COLORS.fog);
  if (!RenderSettings.bloom) mu.uFogOut.value.convertLinearToSRGB();
  mu.uMapShift.value.copy(SHIFT);

  const site = SITES.rooftop;
  const plan = buildPlan(quality);
  const atSite = (b: { x: number; z: number }) => Math.hypot(b.x - site.x, b.z - site.z) < 2;
  // the top block of the tower: the crown takes its place
  plan.boxes = plan.boxes.filter((b) => !(atSite(b) && b.y0 > SKYDECK_Y - 30));
  const ground = buildGround(mu);
  const sea = buildSea(mu, ground.depth);
  const towers: MegaTowers = buildTowers(mu);
  const city: City = buildCity(mu, plan, towers.beacons);
  // (nothing beamed or hung off the tower itself: it would come up through the deck)
  const holo: Holograms = buildHolograms(
    mu,
    plan.boxes.filter((b) => !atSite(b)),
  );
  const trees: Forest | null = quality === 'low' ? null : buildTrees(mu, plan);
  const group = new THREE.Group();
  group.position.copy(SHIFT);
  group.add(ground.group, sea, city.group, towers.group, holo.group);
  if (trees) group.add(trees.group);
  group.updateMatrixWorld(true);

  // the trees' detail by distance: from the camera, moved back into map coordinates
  const eye = new THREE.Object3D();
  return {
    group,
    mu,
    update(dt: number, t: number) {
      mu.uTime.value = t;
      city.update(dt, t);
      towers.update(t);
      holo.update(t);
    },
    camera(cam: THREE.Camera) {
      if (!trees) return;
      cam.getWorldPosition(eye.position).sub(SHIFT);
      eye.updateMatrixWorld();
      trees.update(eye as unknown as THREE.Camera);
    },
    setPixelScale(h: number) {
      city.setPixelScale(h);
    },
  };
}

// ------------------------------------------------------------------ the venue
export class RooftopVenue extends OutdoorVenue {
  readonly far = 3600;
  private city: ReturnType<typeof cityBelow>;

  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }) {
    const r = prng(8808);
    const dark = [0x2a2c35, 0x30323c, 0x272930].map((h) => lin(h));
    const look = sunLook({ ...DAY, sun: KEY_DIR }, { fogDensity: FOG, env: 0.45, hemi: [0x5a5ab8, 0x6a2a70, 0.7], key: 4.2, keyCol: 0xe6eeff, rims: [0xff3fa4, 15, 0x3ff0ff, 15] });
    super(quality, arena, {
      day: DAY,
      sky: { zenith: 0x03051a, horizon: 0x2c1f4c, glow: 0x5a6aa8, glowSize: 0.12, cloud: 0.32, cloudLit: 0x6a4a86, cloudShade: 0x15142a, stars: 0.8, moon: MOON, disc: 0 },
      look: { ...look, background: NIGHT_COLORS.fog, fog: NIGHT_COLORS.fog, fogDensity: FOG },
      floor: { map: deckTileTexture(), metres: 4, roughness: 0.55, gloss: 0.65 },
      stands: {
        tread: (ri, k) => dark[(ri + k) % dark.length].clone().multiplyScalar(ri % 5 === 4 ? 1.25 : 1),
        riser: (ri) => (ri % 5 === 4 ? lin(0xff3fa4, 0.5) : lin(0x17181e)),
        wall: lin(0x1d1f26),
        aisle: lin(0x4a4f5c),
        rail: lin(0x3ff0ff),
        parapet: 1.0,
      },
      crowd: { day: 0.12, light: 0xc8b8ff, k: 0.85 },
      outer: FLOOR,
      hall: { base: 0.1, tint: 0xc8b0ff },
    });
    const g = this.group;
    const u = this.u;
    const low = quality === 'low';

    // the sky reaches past the city (and its stars, moon and clouds with it)
    const dome = g.children[0] as THREE.Mesh;
    dome.geometry.scale(5.6, 5.6, 5.6);

    // ------------------------------------------------------------ the city, the sea, the mountains
    this.city = cityBelow(this, quality);
    g.add(this.city.group);
    dome.onBeforeRender = (_r, _s, cam) => this.city.camera(cam);

    // ------------------------------------------------------------ the crown and the deck's edge
    const steel = new Mesher();
    const glow = new Mesher();
    const lamps: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[] = [];
    g.add(crown(u));
    g.add(balustrade(u, steel, glow));

    // the tower's name on the bar level, north and south, in neon
    for (const sz of [-1, 1]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 3.6),
        new THREE.MeshBasicMaterial({ map: neonText('SKYDECK 88', '#ff3fa4', 1024, 140), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.4)) }),
      );
      sign.position.set(0, FLOOR - 11.5, sz * 27.6);
      sign.rotation.y = sz > 0 ? 0 : Math.PI;
      g.add(sign);
    }

    // ------------------------------------------------------------ the corners: lattice masts, banners, searchlights
    const corners: V3[] = [];
    const spots: Parameters<typeof banners>[1] = [];
    const PAIRS: [number, number][] = [
      [10, 1],
      [13, 0],
      [12, 10],
      [1, 13],
    ];
    let ci = 0;
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) {
        const x = sx * (DX - CH / 2 - 1.6), z = sz * (DZ - CH / 2 - 1.6);
        const H = 17;
        lattice(steel, x, z, FLOOR, H, 1.5, 0.6);
        block(steel, 2.0, 0.4, 2.0, x, FLOOR + 0.2, z, 0x22252c);
        // the emitter on top, the red light over it
        glow.at(new THREE.SphereGeometry(0.32, 10, 8), x, FLOOR + H + 0.35, z, CYAN.clone().multiplyScalar(1.3));
        lamps.push({ x, y: FLOOR + H + 0.35, z, s: 1.1, c: CYAN.clone() });
        rod(steel, [x, FLOOR + H, z], [x, FLOOR + H + 3.2, z], 0.06, 0.04, 0x2a2e36, 5);
        corners.push([x, FLOOR + H + 3.4, z]);
        // the banner, in towards the ring, facing it
        const bx = x * 0.8, bz = z * 0.8;
        spots.push({ x: bx, y: FLOOR + 14.2, z: bz, yaw: Math.atan2(-bx, -bz), w: 11, h: 5.5, pair: PAIRS[ci++], from: [x, FLOOR + H + 0.35, z] });
        // the searchlight at its foot, outboard
        block(steel, 1.0, 0.7, 1.0, x + sx * 1.25, FLOOR + 0.35, z - sz * 0.4, 0x2a2e36);
        glow.at(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), x + sx * 1.25, FLOOR + 0.74, z - sz * 0.4, new THREE.Color(1, 1, 1).multiplyScalar(1.4));
      }
    g.add(...banners(u, spots));
    g.add(
      searchlights(
        u,
        this.tick,
        corners.map((c) => [c[0] + Math.sign(c[0]) * 1.25, FLOOR + 0.8, c[2] - Math.sign(c[2]) * 0.4] as V3),
      ),
    );
    // the red lights on the masts, blinking together
    const beacons = billboards(
      u,
      corners.map((c) => ({ x: c[0], y: c[1], z: c[2], s: 1, c: new THREE.Color(1, 0.12, 0.08).multiplyScalar(1.6) })),
      'halo',
      1.6,
    );
    g.add(beacons);
    this.tick.push((_dt, t) => (beacons.visible = t % 1.6 < 0.5));

    // ------------------------------------------------------------ the marquee and the skyway
    g.add(marquee(u));
    g.add(skyway(u, r, low));

    // ------------------------------------------------------------ the corners' tunnels: steel portals in the team's neon
    for (const sx of [-1, 1]) {
      const team = lin(sx < 0 ? 0xff7a1f : 0x3fe0ff);
      const x = sx * (AX - 0.22);
      const H = FLOOR + TUNNEL_OPEN_H;
      for (const sz of [-1, 1]) {
        const zc = sz * (TUNNEL_OPEN_HW + 0.3);
        block(steel, 0.45, TUNNEL_OPEN_H + 0.9, 0.5, x, FLOOR + (TUNNEL_OPEN_H + 0.9) / 2, zc, 0x23262e);
        block(glow, 0.05, TUNNEL_OPEN_H + 0.7, 0.08, x - sx * 0.25, FLOOR + (TUNNEL_OPEN_H + 0.7) / 2, zc - sz * 0.12, team.clone().multiplyScalar(1.3));
      }
      block(steel, 0.5, 0.55, 2 * TUNNEL_OPEN_HW + 1.1, x, H + 0.55, 0, 0x23262e);
      block(glow, 0.05, 0.06, 2 * TUNNEL_OPEN_HW + 0.6, x - sx * 0.26, H + 0.3, 0, team.clone().multiplyScalar(1.3));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 0.4),
        new THREE.MeshBasicMaterial({ map: neonText(sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER', sx < 0 ? '#ff8a2f' : '#3fe0ff', 512, 90), toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(1.2) }),
      );
      sign.position.set(x - sx * 0.27, H + 0.62, 0);
      sign.rotation.y = -sx * (Math.PI / 2);
      g.add(sign);
    }

    // ------------------------------------------------------------ the scoreboards, on steel frames with neon edges
    for (const sz of [-1, 1]) {
      const z = sz * (STANDS_D + 14.2);
      const y = STANDS_TOP + 5.2;
      this.screen(0, y, z, sz > 0 ? Math.PI : 0, 9.6, 5.4, new THREE.Color(0x1a1c22));
      for (const ox of [-5.2, 5.2]) {
        block(steel, 0.5, y + 2.9 - FLOOR, 0.5, ox, (FLOOR + y + 2.9) / 2, z + sz * 0.35, 0x23262e);
        block(glow, 0.06, y + 2.6 - FLOOR, 0.06, ox, (FLOOR + y + 2.6) / 2, z - sz * 0.0, PINK.clone().multiplyScalar(0.9));
      }
      block(steel, 10.9, 0.35, 0.6, 0, y + 2.95, z + sz * 0.35, 0x23262e);
      block(glow, 10.2, 0.06, 0.06, 0, y + 2.75, z, CYAN.clone().multiplyScalar(1.1));
    }

    // ------------------------------------------------------------ the stairwell blocks: neon bollards
    for (const v of this.vomTops) {
      block(steel, 0.7, 1.4, 0.7, v.x, v.y + 0.7, v.z, 0x23262e);
      glow.at(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), v.x, v.y + 1.95, v.z, (v.x + v.z > 0 ? CYAN : PINK).clone().multiplyScalar(1.2));
      lamps.push({ x: v.x, y: v.y + 1.95, z: v.z, s: 0.8, c: (v.x + v.z > 0 ? CYAN : PINK).clone() });
    }

    // ------------------------------------------------------------ the walkway: planters with little trees, vents
    const leaves = new Mesher();
    for (const sx of [-1, 1])
      for (const k of [-1, 0, 1]) {
        const x = sx * (DX - 3.4), z = k * 9;
        block(steel, 1.6, 0.7, 4.6, x, FLOOR + 0.35, z, 0x2a2c34);
        block(glow, 1.62, 0.04, 4.62, x, FLOOR + 0.08, z, (sx > 0 ? CYAN : PINK).clone().multiplyScalar(0.7));
        for (const dz of [-1.3, 1.3]) {
          const h = 1.6 + r() * 0.8;
          rod(steel, [x, FLOOR + 0.7, z + dz], [x, FLOOR + 0.7 + h * 0.6, z + dz], 0.06, 0.04, 0x3a2a22, 5);
          leaves.at(new THREE.IcosahedronGeometry(0.75 + r() * 0.3, 0), x, FLOOR + 0.7 + h * 0.75, z + dz, lin([0x1f4a3a, 0x24563f, 0x1b3f33][Math.floor(r() * 3)]), r() * 3);
        }
      }
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) {
        // vents: steel boxes with a slow glow inside
        const x = sx * 12, z = sz * (DZ - 2.6);
        block(steel, 2.4, 1.1, 1.4, x, FLOOR + 0.55, z, 0x30333c);
        block(glow, 2.0, 0.08, 1.0, x, FLOOR + 1.12, z, new THREE.Color(1, 0.55, 0.3).multiplyScalar(0.5));
      }

    // ------------------------------------------------------------ build it all
    this.props(steel, litMaterial(u, { grain: 0.08 }));
    this.props(leaves, litMaterial(u, { wrap: 0.4, sway: 0.004 }));
    g.add(new THREE.Mesh(glow.geometry(), glowMaterial(u)));
    g.add(billboards(u, lamps, 'halo', 1.3));
    this.tick.push((dt, t) => this.city.update(dt, t));
  }

  setPixelScale(h: number) {
    super.setPixelScale(h);
    this.city.setPixelScale(h);
  }
}
