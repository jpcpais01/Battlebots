import * as THREE from 'three';

/**
 * House lights: the low-key, high-contrast look of a fight night.
 *
 * The rig over the ring is the only real light in the building. Everything outside it (stands,
 * crowd, suites, roof, tunnels, rails, desks) lives on spill from the ring, which falls off with
 * distance from the ring and with height, and on a camera "exposure" set for the brightly lit ring:
 * the tighter the shot on the fighters, the further the house sinks into the dark. Glowing things
 * (LED boards, the scoreboard, phone lights, signs) are light sources and stay bright, which is what
 * makes the dark bowl read as an arena rather than a dim room.
 *
 * Cost: one multiply per pixel on house surfaces, plus a world-position varying.
 */

/** Darkest the house gets on a tight shot of the fight, and its level on the widest shots and menus. */
const EXPOSE_TIGHT = 0.42;
const EXPOSE_WIDE = 0.78;
const EXPOSE_MENU = 0.7;
/** Seconds for the exposure to adapt most of the way to a new shot, like a broadcast camera's iris. */
const ADAPT = 1.2;

/**
 * GLSL: how much light a house surface at world position `w` gets, before its own colour.
 * Front rows catch some spill from the ring; the back of the bowl and the upper tier fall away.
 */
export const HOUSE_GLSL = /* glsl */ `
uniform float uHouse;
float houseLight(vec3 w) {
  float d = length(w.xz);
  float spill = exp(-max(d - 8.0, 0.0) * 0.12) * mix(1.0, 0.5, smoothstep(2.0, 20.0, w.y));
  return uHouse * mix(0.3, 1.0, spill);
}
`;

class HouseLights {
  /** Shared by every house material; the crowd and the stands read it in their own shaders. */
  readonly uniforms = { uHouse: { value: EXPOSE_MENU } };
  private patched = new WeakSet<THREE.Material>();

  /**
   * Dims every lit-by-the-room material under `root`. Materials that glow (`toneMapped: false`),
   * additive light effects and custom ShaderMaterials are left alone: custom shaders opt in by
   * including HOUSE_GLSL and calling houseLight() themselves, as the crowd and stands do (they keep
   * their roaming spotlights bright on top). Mark a material `userData.house = false` to skip it.
   */
  apply(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.patch(m);
    });
  }

  private patch(mat: THREE.Material) {
    if (this.patched.has(mat)) return;
    this.patched.add(mat);
    if (mat.userData.house === false || (mat as THREE.ShaderMaterial).isShaderMaterial) return;
    if (mat.toneMapped === false || mat.blending === THREE.AdditiveBlending) return;
    const u = this.uniforms;
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (sh, renderer) => {
      prev.call(mat, sh, renderer);
      sh.uniforms.uHouse = u.uHouse;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHouseW;').replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 houseW = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           houseW = instanceMatrix * houseW;
         #endif
         vHouseW = (modelMatrix * houseW).xyz;`,
      );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vHouseW;\n${HOUSE_GLSL}`)
        .replace('#include <opaque_fragment>', 'outgoingLight *= houseLight(vHouseW);\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => prevKey() + '|house';
    mat.needsUpdate = true;
  }

  /**
   * Auto exposure. `subject` is the distance from the camera to what it is framing in a fight, or
   * null in menus. Tight shots expose for the lit ring, so the house goes darker.
   */
  update(dt: number, subject: number | null) {
    const target =
      subject === null ? EXPOSE_MENU : EXPOSE_TIGHT + (EXPOSE_WIDE - EXPOSE_TIGHT) * smooth((subject - 3) / 9);
    const u = this.uniforms.uHouse;
    u.value += (target - u.value) * (1 - Math.exp((-dt * 2.3) / ADAPT));
  }
}

function smooth(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export const house = new HouseLights();
