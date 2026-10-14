import * as THREE from 'three';

/**
 * Ambient occlusion without a screen-space pass.
 *
 * Each robot is stood in for by a handful of spheres (its joints plus the middle of each limb).
 * Lit surfaces near them darken analytically: the canvas under a robot gets a soft contact shadow,
 * a knocked-down robot leaves a big dark pool, and limbs, torsos and the opponent darken each other
 * where they crowd together. Static scenery bakes its occlusion instead (texture, vertex colours),
 * and every patched surface can also darken towards a ground plane (post bases, legs, feet).
 *
 * It costs one extra uniform upload per frame and, per pixel, a bounding test per robot; only
 * pixels near a robot loop over its spheres. Robots cover a small part of the screen, so this is
 * far cheaper than SSAO, which would re-render the whole arena (and its 7,500 sprites) for depth.
 */

/** Spheres per robot. Low quality drops the limb midpoints. */
const PER_FULL = 24;
const PER_LOW = 16;

/** Armour radius around each physics joint (pelvis, chest, neck, head, arms, legs), a bit inside the shell. */
const RADII = [0.28, 0.33, 0.12, 0.22, 0.18, 0.12, 0.14, 0.18, 0.12, 0.14, 0.15, 0.13, 0.11, 0.15, 0.13, 0.11];
/** Limb midpoints: [from joint, to joint, radius]. */
const MIDS: [number, number, number][] = [
  [4, 5, 0.12],
  [5, 6, 0.12],
  [7, 8, 0.12],
  [8, 9, 0.12],
  [10, 11, 0.14],
  [11, 12, 0.12],
  [13, 14, 0.14],
  [14, 15, 0.12],
];
/**
 * Each sphere's occlusion fades smoothly to exactly zero at this many radii from its centre, and a
 * robot's bounding sphere encloses every sphere's full range. Without both, the shader's bounding
 * test cut off the r²/d² tail mid-fade and drew a hard circle on the canvas around each robot.
 */
const RANGE = 4.5;
export interface AOOptions {
  /** Darken near the robots' spheres. */
  spheres?: boolean;
  /** Darken surfaces that stand on this plane (world y), over `height` metres up. */
  ground?: { y: number; height: number; k: number };
  /** Floor around the ring's stage: darkest at `r0`, clear by `r1` (distance from the centre). */
  stage?: { r0: number; r1: number; k: number };
  /** How much of the occlusion also dims direct light (0 = only ambient and reflections). */
  direct?: number;
  /** Multiplier on the sphere occlusion. */
  strength?: number;
  /** The surface is flat ground facing up: skip transforming its normal per pixel. */
  floor?: boolean;
}

class ContactAO {
  per = PER_FULL;
  readonly uniforms = {
    uAOS: { value: new Float32Array(2 * PER_FULL * 4) },
    /** Per robot: bounding sphere (xyz, radius); radius 0 = absent. */
    uAOB: { value: new Float32Array(8) },
  };

  /** Call before any material is patched: the sphere count is compiled into the shaders. */
  setQuality(q: 'low' | 'med' | 'high') {
    this.per = q === 'low' ? PER_LOW : PER_FULL;
    this.uniforms.uAOS.value = new Float32Array(2 * this.per * 4);
  }

  /** Place robot `i`'s spheres from its world-space joints, or remove it with null. */
  set(i: number, joints: readonly THREE.Vector3[] | null, size = 1) {
    const b = this.uniforms.uAOB.value;
    if (!joints) {
      b[i * 4 + 3] = 0;
      return;
    }
    const s = this.uniforms.uAOS.value;
    let o = i * this.per * 4;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 16; j++) {
      const p = joints[j];
      s[o++] = p.x;
      s[o++] = p.y;
      s[o++] = p.z;
      s[o++] = RADII[j] * size;
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    if (this.per > 16) {
      for (const [a, c, r] of MIDS) {
        const p = joints[a], q = joints[c];
        s[o++] = (p.x + q.x) * 0.5;
        s[o++] = (p.y + q.y) * 0.5;
        s[o++] = (p.z + q.z) * 0.5;
        s[o++] = r * size;
      }
    }
    cx /= 16;
    cy /= 16;
    cz /= 16;
    let r = 0;
    for (let k = i * this.per * 4; k < o; k += 4) {
      r = Math.max(r, Math.hypot(s[k] - cx, s[k + 1] - cy, s[k + 2] - cz) + s[k + 3] * RANGE);
    }
    b[i * 4] = cx;
    b[i * 4 + 1] = cy;
    b[i * 4 + 2] = cz;
    b[i * 4 + 3] = r;
  }

  /**
   * Adds occlusion to a MeshStandardMaterial (chains any existing onBeforeCompile).
   * The patch runs after three's own lighting, before output, so it composes with shadows and aoMap.
   */
  patch(mat: THREE.MeshStandardMaterial, o: AOOptions) {
    const u = this.uniforms;
    const per = this.per;
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey.bind(mat);
    const key = `ao${o.spheres ? 's' + per : ''}${o.ground ? 'g' : ''}${o.stage ? 'r' : ''}${o.floor ? 'f' : ''}`;
    mat.onBeforeCompile = (sh, renderer) => {
      prev.call(mat, sh, renderer);
      if (o.spheres) {
        sh.uniforms.uAOS = u.uAOS;
        sh.uniforms.uAOB = u.uAOB;
      }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAOW;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec4 aoW = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             aoW = instanceMatrix * aoW;
           #endif
           vAOW = (modelMatrix * aoW).xyz;`,
        );
      const f = (n: number) => n.toFixed(4);
      const terms: string[] = [];
      if (o.spheres) terms.push(`ao *= aoSpheres(vAOW, nW, ${f(o.strength ?? 1)});`);
      if (o.ground) {
        const g = o.ground;
        // surfaces facing up are the ground itself; walls and undersides darken where they meet it
        terms.push(
          `ao *= 1.0 - ${f(g.k)} * (1.0 - smoothstep(0.0, ${f(g.height)}, vAOW.y - (${f(g.y)}))) * (1.0 - max(nW.y, 0.0));`,
        );
      }
      if (o.stage) {
        const s = o.stage;
        terms.push(`ao *= 1.0 - ${f(s.k)} * (1.0 - smoothstep(${f(s.r0)}, ${f(s.r1)}, length(vAOW.xz)));`);
      }
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vAOW;
           ${o.spheres ? sphereGLSL(per) : ''}`,
        )
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
           {
             vec3 nW = ${o.floor ? 'vec3(0.0, 1.0, 0.0)' : 'inverseTransformDirection(normal, viewMatrix)'};
             float ao = 1.0;
             ${terms.join('\n')}
             reflectedLight.indirectDiffuse *= ao;
             reflectedLight.indirectSpecular *= ao * ao;
             float aoD = mix(1.0, ao, ${f(o.direct ?? 0.35)});
             reflectedLight.directDiffuse *= aoD;
             reflectedLight.directSpecular *= aoD;
           }`,
        );
    };
    mat.customProgramCacheKey = () => prevKey() + '|' + key;
    mat.needsUpdate = true;
    return mat;
  }
}

/**
 * Sphere occlusion (cosine-weighted solid angle, r²/d² · n·l), multiplied over the spheres of each
 * robot whose bounding sphere the point is inside (the fade window makes that test exact). Faces
 * pointing away from a sphere (including a part's own outer surface around its joint) get nothing
 * from it.
 */
function sphereGLSL(per: number) {
  return /* glsl */ `
uniform vec4 uAOS[${2 * per}];
uniform vec4 uAOB[2];
float aoSpheres(vec3 p, vec3 n, float k) {
  float occ = 1.0;
  for (int b = 0; b < 2; b++) {
    vec4 bb = uAOB[b];
    vec3 bd = bb.xyz - p;
    if (bb.w <= 0.0 || dot(bd, bd) > bb.w * bb.w) continue;
    for (int i = 0; i < ${per}; i++) {
      vec4 s = uAOS[b * ${per} + i];
      vec3 d = s.xyz - p;
      float l2 = dot(d, d);
      float nl = dot(n, d) * inversesqrt(l2);
      float r2 = s.w * s.w;
      // cosine-weighted solid angle, windowed to reach exactly zero at RANGE radii
      float fade = max(1.0 - l2 / (r2 * ${(RANGE * RANGE).toFixed(2)}), 0.0);
      float o = max(nl, 0.0) * r2 / max(l2, 1e-4) * fade * fade;
      occ *= 1.0 - min(o * k, 0.9);
    }
  }
  return occ;
}
`;
}

/** One field shared by everything that renders near the robots. */
export const contactAO = new ContactAO();
