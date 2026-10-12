import * as THREE from 'three';
import { PART_COUNT } from '../sim/damage';

/**
 * Battle damage on the robot's own surfaces, driven per body part by a small uniform array.
 *
 * Each vertex carries the part it belongs to. As a part wears down its plates crumple (a
 * smooth noise field bends the shell, the same at shared corners so nothing cracks open),
 * its normals go lumpy so the light catches the dents, paint chips off to bare steel, soot
 * and scorch marks spread, and a wrecked part shows glowing cracks. Noise is read from the
 * part's own rest-space coordinates,
 * so the damage stays stuck to the metal as it moves (and on a torn-off piece flying away).
 *
 * It costs nothing until a part is damaged (the branches skip clean parts), and only the
 * robots' pixels pay for it.
 */
export interface DamageUniforms {
  uWear: { value: Float32Array };
  uTime: { value: number };
}

export function damageUniforms(): DamageUniforms {
  return {
    uWear: { value: new Float32Array(PART_COUNT) },
    uTime: { value: 0 },
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

/** Rest-space position the damage pattern is read from (torn-off pieces carry it as `dpos`). */
const DP = /* glsl */ `
#ifdef USE_SKINNING
  vec3 dmgP = position;
#else
  vec3 dmgP = dpos;
#endif
`;

/** Patch the robot's opaque (vertex PBR) material. Chain after vertexPBR and before or after AO. */
export function patchDamage(mat: THREE.MeshStandardMaterial, u: DamageUniforms) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms.uWear = u.uWear;
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float part;
        #ifndef USE_SKINNING
          attribute vec3 dpos;
        #endif
        uniform float uWear[${PART_COUNT}];
        varying vec3 vDmgP;
        varying float vWear;
        ${NOISE}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        ${DP}
        int dmgI = int(part + 0.5);
        vWear = uWear[dmgI];
        vDmgP = dmgP;
        vec3 dmgBend = vec3(0.0);
        if (vWear > 0.01) {
          float w = vWear;
          // shows from the first few hits, then escalates hard once the part is failing
          float vis = 1.0 - (1.0 - w) * (1.0 - w);
          float heavy = smoothstep(0.45, 1.0, w);
          heavy *= heavy;
          // two octaves of a vector noise field: big buckles and small dings
          vec3 q = dmgP * 11.0;
          vec3 big = vec3(dmgNoise(q), dmgNoise(q + 17.3), dmgNoise(q + 41.7)) - 0.5;
          vec3 r = dmgP * 31.0;
          vec3 small = vec3(dmgNoise(r + 5.1), dmgNoise(r + 23.9), dmgNoise(r + 61.3)) - 0.5;
          // the shell caves in hardest around a few impact spots
          float crater = smoothstep(0.3, 0.62, dmgNoise(dmgP * 6.0 + 3.7));
          float amp = (vis * 0.03 + heavy * 0.085) * (0.45 + crater * 1.1);
          dmgBend = (big * 0.8 + small * 0.35) * amp;
          // dented shells catch the light unevenly
          objectNormal = normalize(objectNormal + (small * 1.6 + big) * (vis * 1.2 + heavy * 0.9) * (0.6 + crater));
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
        varying vec3 vDmgP;
        varying float vWear;
        ${NOISE}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vWear > 0.01) {
          float w = vWear;
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
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}-dmg`;
  return mat;
}

/** Patch the robot's glowing strips: a damaged part's lights dim, then sputter. */
export function patchDamageGlow(mat: THREE.Material, u: DamageUniforms) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms.uWear = u.uWear;
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float part;
        uniform float uWear[${PART_COUNT}];
        uniform float uTime;
        varying float vGlowK;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = uWear[int(part + 0.5)];
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
  mat.customProgramCacheKey = () => `${prevKey()}-dmg`;
  return mat;
}
