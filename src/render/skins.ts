import * as THREE from 'three';
import { GLOW_CYCLE, GLOW_FLICKER, GLOW_PULSE, type SkinDef } from '../game/skins';
import { SKIN_GLSL } from './skinGlsl';

/**
 * Skins on the robots: the plating (paint and second paint) drawn in a skin's pattern instead of
 * its flat paint, chipped, burnt and torn away with the paint by the battle damage. Read from the
 * plating's rest space like the damage, so the pattern stays on the metal as the robot moves.
 *
 * Two skins at once only while a new one paints on (BotModel.paintOn): `uSkinWipe` is the
 * model-space height of the new skin's edge as it sweeps up the robot (the old one above it),
 * with a line of light along it. Everything is uniforms, so every robot shares one program and
 * a robot in its plain paint skips the work in one coherent branch.
 */
export interface SkinUniforms {
  /** x the skin worn, y the one a sweep is painting over (kinds; 0 none). */
  uSkinKind: { value: THREE.Vector2 };
  /** Four linear colours each (0-3 the worn skin's, 4-7 the old one's); w the alpha. */
  uSkinC: { value: Float32Array };
  /** Per skin: [scale, speed, metalness, roughness]. */
  uSkinP: { value: Float32Array };
  /** The sweep's edge (model-space metres); 100: no sweep. */
  uSkinWipe: { value: number };
  uSkinBand: { value: THREE.Vector3 };
}

export const skinUniforms = (): SkinUniforms => ({
  uSkinKind: { value: new THREE.Vector2() },
  uSkinC: { value: new Float32Array(32) },
  uSkinP: { value: new Float32Array(8) },
  uSkinWipe: { value: 100 },
  uSkinBand: { value: new THREE.Vector3() },
});

const _c = new THREE.Color();

/** Linear colour of a 0xRRGGBB (sRGB) number. */
export const linear = (hex: number, out = new THREE.Color()) => out.setHex(hex);

/**
 * Write a skin into skin uniforms (the robots', the vault's swatches'): `slot` 0 is the one worn,
 * 1 the one a sweep is painting over. null clears the slot.
 */
export function applySkin(u: { uSkinKind: { value: THREE.Vector2 | Float32Array }; uSkinC: { value: Float32Array }; uSkinP: { value: Float32Array } }, s: SkinDef | null, slot = 0) {
  const kind = u.uSkinKind.value;
  const k = s ? s.kind : 0;
  if (kind instanceof THREE.Vector2) kind.setComponent(slot, k);
  else kind[slot] = k;
  if (!s) return;
  const c = u.uSkinC.value;
  for (let i = 0; i < 4; i++) {
    linear(s.c[i], _c);
    const o = (slot * 4 + i) * 4;
    c[o] = _c.r;
    c[o + 1] = _c.g;
    c[o + 2] = _c.b;
    c[o + 3] = s.a ?? 1;
  }
  u.uSkinP.value.set(s.par, slot * 4);
}

/**
 * The robot's glow colour under this skin at `time` (linear, before the model's brightness),
 * into `out`; `paint` (the paint's own glow, linear) when the skin keeps it.
 */
export function skinGlow(s: SkinDef | null, paint: THREE.Color, time: number, out: THREE.Color) {
  if (!s || s.glow < 0) return out.copy(paint);
  linear(s.glow, out);
  switch (s.move) {
    case GLOW_PULSE:
      return out.multiplyScalar(0.85 + 0.25 * Math.sin(time * 2.4));
    case GLOW_FLICKER: {
      const beat = Math.floor(time * 9);
      const h = (((Math.sin(beat * 12.9898) * 43758.5453) % 1) + 1) % 1;
      return out.multiplyScalar(h > 0.6 ? 1.25 : 0.75 + 0.2 * Math.sin(time * 31));
    }
    case GLOW_CYCLE:
      return out.lerp(linear(s.glow2 ?? s.glow, _c), 0.5 + 0.5 * Math.sin(time * 1.4));
  }
  return out;
}

/**
 * Chain the skins onto the robot's opaque material, after patchDamage (it reads that patch's
 * rest position, bone and clock) and after any surface detail (the skin goes on before the fine
 * finish and the damage, as in the Android app). The geometry carries `skey`: 1 on the paint,
 * 2 on the second paint, 0 elsewhere.
 */
export function patchSkin<M extends THREE.MeshStandardMaterial>(mat: M, u: SkinUniforms): M {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skey;\nvarying float vSkey;\nvarying vec3 vSkinRN;\nvarying float vSkinY;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // the plating's rest-space normal (before any dent bends it): the patterns' box mapping
        vSkinRN = dmgToRest(objectNormal);
        vSkey = skey;`,
      )
      .replace('#include <project_vertex>', 'vSkinY = transformed.y;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uSkinKind;
        uniform vec4 uSkinC[8];
        uniform vec4 uSkinP[2];
        uniform float uSkinWipe;
        uniform vec3 uSkinBand;
        varying float vSkey;
        varying vec3 vSkinRN;
        varying float vSkinY;
        ${SKIN_GLSL}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // the skin: patterned over both platings (the damage chips, burns and tears it away later)
        vec3 skinEmit = vec3(0.0);
        if (uSkinKind.x > 0.5 || uSkinKind.y > 0.5) {
          float isPaint = step(0.5, vSkey);
          float sec = step(1.5, vSkey);
          vec3 nw = inverseTransformDirection(normal, viewMatrix);
          vec3 vw = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
          vec3 rn = normalize(vSkinRN);
          // each bone's plating starts the pattern somewhere else, so no two parts match
          vec3 sp = vDmgP + vBone * vec3(1.37, 2.71, 0.93);
          SkinOut base = SkinOut(diffuseColor.rgb, metalnessFactor, roughnessFactor, vec3(0.0), 0.0);
          SkinOut a = skin_eval(int(uSkinKind.x + 0.5), uSkinC[0], uSkinC[1], uSkinC[2], uSkinC[3], uSkinP[0], sp, rn, nw, vw, uTime, sec, base);
          if (uSkinWipe < 50.0) {
            SkinOut b = skin_eval(int(uSkinKind.y + 0.5), uSkinC[4], uSkinC[5], uSkinC[6], uSkinC[7], uSkinP[1], sp, rn, nw, vw, uTime, sec, base);
            float above = step(uSkinWipe, vSkinY);
            a.albedo = mix(a.albedo, b.albedo, above);
            a.metal = mix(a.metal, b.metal, above);
            a.rough = mix(a.rough, b.rough, above);
            a.emit = mix(a.emit, b.emit, above);
            a.h = mix(a.h, b.h, above);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, a.albedo, isPaint);
          metalnessFactor = mix(metalnessFactor, a.metal, isPaint);
          roughnessFactor = mix(roughnessFactor, clamp(a.rough, 0.045, 1.0), isPaint);
          skinEmit = a.emit * isPaint;
          // the pattern's relief, from the screen-space slope of its height
          float hgt = a.h * isPaint * 0.004;
          vec3 kdx = dFdx(-vViewPosition);
          vec3 kdy = dFdy(-vViewPosition);
          vec3 k1 = cross(kdy, normal);
          vec3 k2 = cross(normal, kdx);
          float kdet = dot(kdx, k1);
          vec3 kgrad = sign(kdet) * (dFdx(hgt) * k1 + dFdy(hgt) * k2);
          if (abs(kdet) > 0.0) normal = normalize(abs(kdet) * normal - kgrad);
        }
        if (uSkinWipe < 50.0) {
          // the line of light the new skin paints on behind
          float wd = abs(vSkinY - uSkinWipe);
          totalEmissiveRadiance += uSkinBand * (exp(-wd * 60.0) * 3.0 + exp(-wd * 9.0) * 0.35);
        }`,
      )
      // (damageLook leaves this marker after the oil: the skin's own light goes where its paint still is)
      .replace('// <skin-emit>', 'totalEmissiveRadiance += skinEmit * dmgPaintK * (1.0 - oil * 0.9);');
  };
  mat.customProgramCacheKey = () => `${prevKey()}|skin`;
  mat.needsUpdate = true;
  return mat;
}
