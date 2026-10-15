import type * as THREE from 'three';

/**
 * Fine surface finish for the robots' plating (high quality). Up close a real machined part is
 * never one even sheen: handling leaves the shine patchy, bare metal is brushed in streaks along
 * its length, and paint has a faint orange-peel ripple that breaks up its reflections. All of it
 * is worked out in the part's own rest space (so it sticks to the part however it moves), from
 * the damage shader's noise, and the finest work fades out before a pixel is too big to hold it,
 * so nothing shimmers at a distance.
 *
 * Chain after `patchDamage` (it reads that patch's rest position and noise).
 */
export function patchSurfaceDetail<M extends THREE.MeshStandardMaterial>(mat: M): M {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // how much of the part one pixel covers: the fine finish fades out past ~1 cm a pixel
        float fine = 1.0 - smoothstep(0.004, 0.014, length(fwidth(vDmgP)));
        // an uneven sheen: polished in places, dulled by handling in others
        float sheen = dmgNoise(vDmgP * 5.0 + 7.3) * 0.7 + dmgNoise(vDmgP * 19.0 + 1.7) * 0.3;
        roughnessFactor *= 0.8 + sheen * 0.4;
        // bare metal is brushed in fine streaks along the part
        float grain = dmgNoise(vec3(vDmgP.x * 7.0, vDmgP.y * 260.0, vDmgP.z * 7.0));
        roughnessFactor *= mix(1.0, 0.72 + grain * 0.56, metalnessFactor * fine);
        roughnessFactor = clamp(roughnessFactor, 0.045, 1.0);
        // a faint hammered ripple in the surface (bump from the screen-space slope of a height)
        float h = dmgNoise(vDmgP * 150.0) * 0.55 + dmgNoise(vDmgP * 41.0) * 0.45;
        vec3 sdx = dFdx(-vViewPosition);
        vec3 sdy = dFdy(-vViewPosition);
        vec3 r1 = cross(sdy, normal);
        vec3 r2 = cross(normal, sdx);
        float det = dot(sdx, r1);
        vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * 0.0009 * fine;
        if (abs(det) > 0.0) normal = normalize(abs(det) * normal - grad);
      }`,
    );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|detail`;
  mat.needsUpdate = true;
  return mat;
}
