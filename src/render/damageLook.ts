import * as THREE from 'three';
import { PART_COUNT } from '../sim/damage';

/**
 * Battle damage on the robot's own surfaces.
 *
 * The metal really bends. Every blow that lands punches a dent where it struck: a rounded bowl
 * pushed in along the blow, with a lip of displaced metal around it and creases in its floor.
 * Blows landing close together deepen and widen the same dent, so a part that keeps getting hit
 * in one place caves in there. On top of that a worn part's plates buckle all over. The armour
 * is tessellated finely enough (SkinBuilder) for this to change its silhouette, not just its
 * shading; the normals are the true normals of the bent surface (the inverse transpose of the
 * bend), so the light rolls into every dent; and the shadow pass bends the same way.
 *
 * As a part wears its paint also chips off to bare steel, soot and scorch spread, and a wrecked
 * part shows glowing cracks. A dent's floor loses its paint and sits in its own shade.
 * Everything is read from the part's own rest-space coordinates, so the damage stays stuck to
 * the metal as it moves (and on a torn-off piece flying away).
 *
 * It costs little until a part is damaged (clean parts skip the work). The dents are a
 * render-side record of the fight: the sim never reads them.
 */
export interface DamageUniforms {
  uWear: { value: Float32Array };
  /** Dents in a bone's own frame: xyz centre (on the plating), w radius. */
  uDentP: { value: Float32Array };
  /** Per dent: xyz the push direction scaled by its depth, w the bone it is on (-1: none). */
  uDentN: { value: Float32Array };
  /** World size of one rest-space unit on a torn-off piece (the robot's frame size). */
  uPieceScale: { value: number };
  uTime: { value: number };
  /** Marks in a bone's own frame: xyz centre, w radius. */
  uMark: { value: Float32Array };
  /** Per mark: the bone it sits on, and its kind (MARK_NONE / MARK_SOCKET / MARK_OIL), and its strength. */
  uMarkB: { value: Float32Array };
  /** Oily grime over the whole robot, 0..1. */
  uGrime: { value: number };
}

/** Dents per robot (blows landing close together deepen the same dent instead of taking a slot). */
export const DENTS = 32;
/** Marks per robot: a few wrenched sockets, the rest oil splatters. */
export const MARKS = 12;
export const MARK_NONE = 0;
/** A torn-off part's socket: the metal around it is wrecked. */
export const MARK_SOCKET = 1;
/** A splash of oil, running down the part. */
export const MARK_OIL = 2;

export function damageUniforms(): DamageUniforms {
  const dentN = new Float32Array(DENTS * 4);
  for (let k = 0; k < DENTS; k++) dentN[k * 4 + 3] = -1;
  return {
    uWear: { value: new Float32Array(PART_COUNT) },
    uDentP: { value: new Float32Array(DENTS * 4) },
    uDentN: { value: dentN },
    uPieceScale: { value: 1 },
    uTime: { value: 0 },
    uMark: { value: new Float32Array(MARKS * 4) },
    uMarkB: { value: new Float32Array(MARKS * 3) },
    uGrime: { value: 0 },
  };
}

const NOISE = /* glsl */ `
float dmgHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dmgNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmgHash(i), dmgHash(i + vec3(1, 0, 0)), f.x), mix(dmgHash(i + vec3(0, 1, 0)), dmgHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dmgHash(i + vec3(0, 0, 1)), dmgHash(i + vec3(1, 0, 1)), f.x), mix(dmgHash(i + vec3(0, 1, 1)), dmgHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/**
 * How the plating is bent, in the bone's rest frame: the part's general buckling plus every dent
 * on its bone. A function of the rest position alone, so corners shared by two faces (and
 * pieces lying on each other) move together and nothing cracks open.
 */
const DEFORM = /* glsl */ `
attribute float part;
uniform float uWear[${PART_COUNT}];
uniform vec4 uDentP[${DENTS}];
uniform vec4 uDentN[${DENTS}];
uniform float uPieceScale;
${NOISE}
// a worn part's plates buckle in big, smooth folds, deepest around a few spots
vec3 dmgCrumple(vec3 p, float w) {
  if (w < 0.01) return vec3(0.0);
  float vis = 1.0 - (1.0 - w) * (1.0 - w);
  float heavy = smoothstep(0.45, 1.0, w);
  heavy *= heavy;
  vec3 q = p * 11.0;
  vec3 big = vec3(dmgNoise(q), dmgNoise(q + 17.3), dmgNoise(q + 41.7)) - 0.5;
  float crater = smoothstep(0.3, 0.62, dmgNoise(p * 6.0 + 3.7));
  return big * (vis * 0.024 + heavy * 0.065) * (0.45 + crater * 1.1);
}
// how deep in a dent's bowl the points dmgDents looked at sit, 0..1 (the caller resets it)
float dmgCav;
// dents punched in by blows: a rounded bowl pushed in along the blow, a lip of displaced metal
// around it, and a creased floor
vec3 dmgDents(vec3 p, float bone) {
  vec3 d = vec3(0.0);
  for (int k = 0; k < ${DENTS}; k++) {
    vec4 N = uDentN[k];
    if (abs(N.w - bone) > 0.5) continue;
    float depth = length(N.xyz);
    if (depth < 1e-5) continue;
    vec4 C = uDentP[k];
    vec3 n = N.xyz / depth;
    vec3 v = p - C.xyz;
    float along = dot(v, n);
    vec3 lat = v - along * n;
    // the plate the blow lands on gives way; metal deeper inside the part barely follows
    float s2 = (dot(lat, lat) + along * along * 3.2) / (C.w * C.w);
    if (s2 > 2.25) continue;
    float s = sqrt(s2);
    float bowl = s2 < 1.0 ? (1.0 - s2) * (1.0 - s2) : 0.0;
    float t = clamp((s - 0.75) * 1.3333, 0.0, 1.0);
    float lip = 16.0 * t * t * (1.0 - t) * (1.0 - t);
    // not a perfect spoon: the floor folds unevenly
    float fold = 0.7 + 0.6 * dmgNoise(lat * (2.2 / C.w) + float(k) * 7.31);
    d += n * (depth * (bowl * fold - lip * 0.14));
    dmgCav = max(dmgCav, bowl * min(1.0, depth / (C.w * 0.25)));
  }
  return d;
}
vec3 dmgDeform(vec3 p, float bone, float w) {
  return dmgCrumple(p, w) + dmgDents(p, bone);
}
// rest frame <-> mesh frame: the skinned robot draws in the rest frame (its bones move it); a
// torn-off piece was baked out in world space, so it carries its bone's rotation as dq
#ifdef USE_SKINNING
  vec3 dmgToRest(vec3 v) { return v; }
  vec3 dmgFromRest(vec3 v) { return v; }
#else
  attribute vec3 dpos;
  attribute float dbone;
  attribute vec4 dq;
  vec3 dmgRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  vec3 dmgToRest(vec3 v) { return dmgRot(vec4(-dq.xyz, dq.w), v); }
  vec3 dmgFromRest(vec3 v) { return dmgRot(dq, v) * uPieceScale; }
#endif
`;

/** Rest-space position and bone the damage is read from (torn-off pieces carry them as attributes). */
const DP = /* glsl */ `
#ifdef USE_SKINNING
  vec3 dmgP = position;
  float dmgBone = skinIndex.x;
#else
  vec3 dmgP = dpos;
  float dmgBone = dbone;
#endif
`;

function bind(sh: { uniforms: { [name: string]: { value: unknown } } }, u: DamageUniforms) {
  sh.uniforms.uWear = u.uWear;
  sh.uniforms.uDentP = u.uDentP;
  sh.uniforms.uDentN = u.uDentN;
  sh.uniforms.uPieceScale = u.uPieceScale;
}

/** Patch the robot's opaque (vertex PBR) material. Chain after vertexPBR and before or after AO. */
export function patchDamage(mat: THREE.MeshStandardMaterial, u: DamageUniforms) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    bind(sh, u);
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uMark = u.uMark;
    sh.uniforms.uMarkB = u.uMarkB;
    sh.uniforms.uGrime = u.uGrime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uMark[${MARKS}];
        uniform vec3 uMarkB[${MARKS}];
        varying vec3 vDmgP;
        varying float vWear;
        varying float vBone;
        varying float vDent;
        ${DEFORM}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        ${DP}
        vWear = uWear[int(part + 0.5)];
        vDmgP = dmgP;
        vBone = dmgBone;
        // the metal around a torn-off part's socket is wrenched and wrecked
        for (int k = 0; k < ${MARKS}; k++) {
          if (uMarkB[k].y == ${MARK_SOCKET}.0 && abs(uMarkB[k].x - vBone) < 0.5)
            vWear = max(vWear, uMarkB[k].z * (1.0 - smoothstep(uMark[k].w * 0.35, uMark[k].w, distance(dmgP, uMark[k].xyz))));
        }
        dmgCav = 0.0;
        vec3 dmgD = dmgDeform(dmgP, dmgBone, vWear);
        vDent = dmgCav;
        vec3 dmgBend = vec3(0.0);
        if (vWear > 0.01 || dot(dmgD, dmgD) > 0.0) {
          // the bent surface's true normal: the inverse transpose of the bend's Jacobian (by
          // finite differences), applied through its cofactors
          const float e = 0.006;
          vec3 c0 = vec3(1.0, 0.0, 0.0) + (dmgDeform(dmgP + vec3(e, 0.0, 0.0), dmgBone, vWear) - dmgD) / e;
          vec3 c1 = vec3(0.0, 1.0, 0.0) + (dmgDeform(dmgP + vec3(0.0, e, 0.0), dmgBone, vWear) - dmgD) / e;
          vec3 c2 = vec3(0.0, 0.0, 1.0) + (dmgDeform(dmgP + vec3(0.0, 0.0, e), dmgBone, vWear) - dmgD) / e;
          vec3 nr = dmgToRest(objectNormal);
          nr = normalize(cross(c1, c2) * nr.x + cross(c2, c0) * nr.y + cross(c0, c1) * nr.z);
          if (vWear > 0.01) {
            // and a worn shell is covered in small dings that catch the light
            float vis = 1.0 - (1.0 - vWear) * (1.0 - vWear);
            vec3 r = dmgP * 31.0;
            vec3 small = vec3(dmgNoise(r + 5.1), dmgNoise(r + 23.9), dmgNoise(r + 61.3)) - 0.5;
            nr = normalize(nr + small * (vis * 0.9 + smoothstep(0.45, 1.0, vWear) * 0.7));
          }
          #ifdef USE_SKINNING
            objectNormal = nr;
          #else
            objectNormal = normalize(dmgFromRest(nr));
          #endif
          dmgBend = dmgFromRest(dmgD);
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += dmgBend;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec4 uMark[${MARKS}];
        uniform vec3 uMarkB[${MARKS}];
        uniform float uGrime;
        varying vec3 vDmgP;
        varying float vWear;
        varying float vBone;
        varying float vDent;
        ${NOISE}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sockW = 0.0;
        float oil = 0.0;
        if (vBone >= 0.0) {
          for (int k = 0; k < ${MARKS}; k++) {
            float kind = uMarkB[k].y;
            if (kind == 0.0 || abs(uMarkB[k].x - vBone) > 0.5) continue;
            vec3 q = vDmgP - uMark[k].xyz;
            float r = uMark[k].w;
            if (kind == ${MARK_SOCKET}.0) {
              sockW = max(sockW, uMarkB[k].z * (1.0 - smoothstep(r * 0.35, r, length(q) + (dmgNoise(vDmgP * 9.0) - 0.5) * r * 0.5)));
            } else {
              // oil runs down the part in streaks below where it hit
              float below = max(0.0, -q.y);
              float lane = dmgNoise(vec3(vDmgP.x * 26.0, 0.0, vDmgP.z * 26.0) + float(k) * 7.1);
              q.y = q.y < 0.0 ? q.y * mix(0.85, 0.22, smoothstep(0.35, 0.75, lane)) : q.y;
              float d = length(q) / r + (dmgNoise(vDmgP * 13.0 + float(k) * 3.3) - 0.5) * 0.55;
              float blob = 1.0 - smoothstep(0.7, 0.95, d);
              // a fine spatter of droplets around each splash
              float spat = smoothstep(0.78, 0.84, dmgNoise(vDmgP * 46.0 + float(k) * 11.0)) * (1.0 - smoothstep(1.0, 1.9, d));
              oil = max(oil, max(blob, spat) * uMarkB[k].z);
            }
          }
        }
        if (vDent > 0.02) {
          // a dent's floor sits in its own shade, and the paint there cracks and flakes off,
          // leaving scraped steel where the blow bit hardest
          float flake = dmgNoise(vDmgP * 38.0 + 2.9) * 0.6 + dmgNoise(vDmgP * 90.0) * 0.4;
          float bare = smoothstep(0.55, 0.62, vDent * 0.75 + flake * 0.5);
          diffuseColor.rgb *= 1.0 - vDent * 0.28;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.31, 0.33) * (0.75 + flake * 0.5), bare);
          metalnessFactor = mix(metalnessFactor, 0.95, bare);
          roughnessFactor = mix(roughnessFactor, 0.32 + flake * 0.3, bare);
          // and a rim of crazed paint around the bare patch
          float craze = smoothstep(0.42, 0.5, vDent * 0.75 + flake * 0.5) * (1.0 - bare);
          diffuseColor.rgb *= 1.0 - craze * smoothstep(0.55, 0.75, dmgNoise(vDmgP * 140.0)) * 0.6;
        }
        if (vWear > 0.01 || sockW > 0.01) {
          float w = max(vWear, sockW);
          float vis = 1.0 - (1.0 - w) * (1.0 - w);
          float heavy = smoothstep(0.45, 1.0, w);
          // damage gathers in a few hot spots (where the blows landed) and spreads from them
          float spot = dmgNoise(vDmgP * 3.4 + 1.3);
          float edge = dmgNoise(vDmgP * 22.0) * 0.6 + dmgNoise(vDmgP * 45.0) * 0.4;
          float spread = spot * 0.74 + edge * 0.26;
          // grime and scuffing over the whole part
          diffuseColor.rgb *= 1.0 - vis * 0.25 * (0.4 + edge);
          // paint chips off to bare, scuffed steel, ragged at the edges
          float chip = smoothstep(0.58 - vis * 0.22, 0.63 - vis * 0.22, spread);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.28, 0.3) * (0.7 + edge * 0.5), chip);
          metalnessFactor = mix(metalnessFactor, 0.95, chip);
          roughnessFactor = mix(roughnessFactor, 0.4 + edge * 0.3, chip);
          // soot and scorch bloom out of the worst spots
          float sT = 0.66 - vis * 0.18 - heavy * 0.12;
          float scorch = smoothstep(sT, sT + 0.06, spot * 0.85 + edge * 0.2) * (0.35 + vis * 0.65);
          diffuseColor.rgb *= mix(1.0, 0.1, scorch);
          roughnessFactor = mix(roughnessFactor, 0.85, scorch);
          // a wrecked part's plating tears open onto dark, burnt innards
          float hT = 0.68 - heavy * 0.26;
          float hole = smoothstep(hT, hT + 0.02, spread) * step(0.02, heavy);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.026, 0.024), hole);
          metalnessFactor = mix(metalnessFactor, 0.5, hole);
          roughnessFactor = mix(roughnessFactor, 0.9, hole);
          // split plates crack along glowing seams, and the innards smoulder
          float ridge = 1.0 - abs(dmgNoise(vDmgP * 26.0 + 9.0) * 2.0 - 1.0);
          // (only in the ring around torn holes, so they read as hot split edges)
          float crack = smoothstep(0.93, 0.98, ridge) * smoothstep(0.55, 0.9, w) * smoothstep(hT - 0.05, hT, spread) * (1.0 - hole);
          float flick = 0.65 + 0.35 * sin(uTime * 23.0 + vDmgP.y * 40.0) * sin(uTime * 7.0 + vDmgP.x * 30.0);
          float ember = smoothstep(hT + 0.04, hT + 0.1, spread) * smoothstep(0.45, 0.8, dmgNoise(vDmgP * 18.0 + 4.2)) * heavy;
          totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * (crack * 1.3 + ember * 0.5) * flick;
        }
        // oily grime: big dull smudges over the whole robot, worst low down
        if (uGrime > 0.01) {
          float smudge = dmgNoise(vDmgP * 4.3 + 2.1) * 0.7 + dmgNoise(vDmgP * 17.0) * 0.3;
          float g = smoothstep(0.72 - uGrime * 0.4, 0.82 - uGrime * 0.4, smudge) * uGrime;
          diffuseColor.rgb *= 1.0 - g * 0.7;
          oil = max(oil, g * 0.45);
        }
        // motor oil: near-black, wet and glossy, with a thin-film rainbow sheen
        if (oil > 0.01) {
          vec3 vv = normalize(vViewPosition);
          float graze = 1.0 - abs(dot(vv, normal));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01, 0.0095, 0.009), oil * 0.94);
          roughnessFactor = mix(roughnessFactor, 0.06, oil);
          metalnessFactor = mix(metalnessFactor, 0.15, oil);
          float swirl = dmgNoise(vDmgP * 7.0 + 5.0) * 1.4 + graze * 1.8;
          vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + swirl));
          totalEmissiveRadiance += film * (0.012 + graze * graze * 0.06) * oil;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}-dmg2`;
  return mat;
}

/**
 * The robot's shadow-pass material: three's depth material with the same bends, so a dent's
 * shadow matches the dent (an unbent shadow would shade every dent from its own old surface).
 */
export function damageDepthMaterial(u: DamageUniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (sh) => {
    bind(sh, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${DEFORM}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        ${DP}
        dmgCav = 0.0;
        transformed += dmgFromRest(dmgDeform(dmgP, dmgBone, uWear[int(part + 0.5)]));
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'bot-depth-dmg';
  return mat;
}

/** Patch the robot's glowing strips: they bend with the plating, and a damaged part's lights dim, then sputter. */
export function patchDamageGlow(mat: THREE.Material, u: DamageUniforms) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    bind(sh, u);
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying float vGlowK;
        ${DEFORM}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = uWear[int(part + 0.5)];
          // the strips ride the bent plating they're set in
          ${DP}
          dmgCav = 0.0;
          transformed += dmgFromRest(dmgDeform(dmgP, dmgBone, w));
          float k = 1.0 - w * 0.55;
          if (w > 0.45) {
            // sputter: drop out in random beats, more often the worse it gets
            float beat = floor(uTime * 9.0 + part * 3.1);
            float h = fract(sin(beat * 12.9898 + part * 78.233) * 43758.5453);
            k *= step((w - 0.45) * 1.4, h) * 0.85 + 0.15;
          }
          vGlowK = w >= 0.999 ? 0.05 : k;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlowK;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= vGlowK;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `${prevKey()}-dmg2`;
  return mat;
}
