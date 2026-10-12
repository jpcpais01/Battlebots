import * as THREE from 'three';

/**
 * Keeps the garage camera's view of the bot clear: workshop scenery (gantry, benches, racks) that
 * sits between the camera and the bot is dissolved with a screen-door dither, so only the bot itself
 * can stand in front of it. The fight arena is not patched: its ropes and barriers always draw solid.
 *
 * Works on any material, including custom shader ones. Floor-level meshes (canvas, apron, stage
 * base, ground) are left alone so the ring never shows holes underfoot.
 */
export class ClearView {
  /**
   * Measured in the ground plane along the camera's horizontal forward axis, so an upright post is
   * either all there or all gone. Scenery behind the nearest robot stays. Scenery well in front of it
   * goes. In between, it goes only where it overlaps the robots (`uClearSpan`, lateral offset over
   * forward distance), so a post beside them stays whole. Edges are dithered so ropes fade out.
   */
  readonly uniforms = {
    uClearOn: { value: 0 },
    uClearDepth: { value: 0 },
    uClearSpan: { value: new THREE.Vector2() },
    uClearCam: { value: new THREE.Vector2() },
    uClearFwd: { value: new THREE.Vector2(0, -1) },
  };
  private patched = new WeakSet<THREE.Material>();
  private box = new THREE.Box3();
  private fwd = new THREE.Vector3();

  /** Patches every material in `root` that rises above the floor. Safe to call again after the scene changes. */
  apply(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const obj = o as THREE.Mesh | THREE.Points | THREE.Line;
      if (!(obj as THREE.Mesh).isMesh && !(obj as THREE.Points).isPoints && !(obj as THREE.Line).isLine) return;
      const geo = obj.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      this.box.copy(geo.boundingBox!).applyMatrix4(obj.matrixWorld);
      if ((obj as THREE.InstancedMesh).isInstancedMesh) this.box.max.y += 2; // instances sit above the base geometry
      if (this.box.max.y < 0.3) return;
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) this.patch(m);
    });
  }

  private patch(mat: THREE.Material) {
    if (this.patched.has(mat)) return;
    this.patched.add(mat);
    const u = this.uniforms;
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey.bind(mat);
    const main = /void\s+main\s*\(\s*\)\s*\{/;
    mat.onBeforeCompile = (shader, renderer) => {
      prev.call(mat, shader, renderer);
      Object.assign(shader.uniforms, u);
      const vs = shader.vertexShader;
      shader.vertexShader = vs.includes('#include <project_vertex>')
        ? vs.replace('#include <common>', '#include <common>\nvarying vec2 vClearXZ;').replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            vec4 clearW = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              clearW = instanceMatrix * clearW;
            #endif
            vClearXZ = (modelMatrix * clearW).xz;`,
          )
        : vs.replace(main, 'varying vec2 vClearXZ;\nvoid main() {\n  vClearXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader.replace(
        main,
        `uniform float uClearOn; uniform float uClearDepth; uniform vec2 uClearSpan;
uniform vec2 uClearCam; uniform vec2 uClearFwd; varying vec2 vClearXZ;
float clearBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  vec2 lo = mod(q, 2.0), hi = floor(q * 0.5);
  float b = 4.0 * mod(2.0 * lo.x + 3.0 * lo.y, 4.0) + mod(2.0 * hi.x + 3.0 * hi.y, 4.0); // 4x4 Bayer
  return (b + 0.5) / 16.0;
}
void main() {
  if (uClearOn > 0.5) {
    vec2 rel = vClearXZ - uClearCam;
    float d = dot(rel, uClearFwd);
    float a = dot(rel, vec2(-uClearFwd.y, uClearFwd.x)) / max(d, 0.05);
    float beside = smoothstep(0.0, 0.25, max(uClearSpan.x - a, a - uClearSpan.y) * max(d, 0.0));
    float behind = smoothstep(uClearDepth - 0.1, uClearDepth + 0.4, d);
    float keep = max(behind, min(beside, smoothstep(uClearDepth - 1.4, uClearDepth - 0.9, d)));
    if (keep < clearBayer(gl_FragCoord.xy)) discard;
  }`,
      );
    };
    mat.customProgramCacheKey = () => prevKey() + '|clearView';
    mat.needsUpdate = true;
  }

  /**
   * Clears everything nearer to `camera` than the nearest of `points` (the showcased bot's chest).
   * Pass no points to switch the effect off.
   */
  update(camera: THREE.PerspectiveCamera, points: readonly THREE.Vector3[]) {
    const u = this.uniforms;
    u.uClearOn.value = points.length ? 1 : 0;
    if (!points.length) return;
    camera.updateMatrixWorld();
    camera.getWorldDirection(this.fwd);
    const fx = this.fwd.x, fz = this.fwd.z, l = Math.hypot(fx, fz) || 1;
    u.uClearFwd.value.set(fx / l, fz / l);
    const cx = camera.matrixWorld.elements[12], cz = camera.matrixWorld.elements[14];
    u.uClearCam.value.set(cx, cz);
    let d = Infinity, lo = Infinity, hi = -Infinity;
    for (const p of points) {
      const f = Math.max(0.3, ((p.x - cx) * fx + (p.z - cz) * fz) / l);
      const a = ((p.z - cz) * fx - (p.x - cx) * fz) / l / f;
      d = Math.min(d, f);
      // a robot reaches about 0.7 m either side of its chest
      lo = Math.min(lo, a - 0.7 / f);
      hi = Math.max(hi, a + 0.7 / f);
    }
    u.uClearDepth.value = d;
    u.uClearSpan.value.set(lo, hi);
  }
}
