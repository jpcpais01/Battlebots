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
 *
 * The floor is different: the canvas fills much of the screen and every pixel of it near a robot
 * used to loop over all 48 spheres. The floor is flat, so its occlusion is now worked out once a
 * frame into a small top-down map (a few hundred thousand texels at most, most of them skipped by
 * the bounding test), and the floor just reads it: one texture tap a pixel instead of the loop.
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

/** The floor map covers this square around the centre (metres either side), on the plane y = 0. */
const MAP_HALF = 7.5;
/** Strength the floor map is worked out at; floors asking for another strength keep the loop. */
const MAP_STRENGTH = 2;
const MAP_SIZE = { high: 512, med: 384, low: 256 };
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
    /** Top-down occlusion of the floor (y = 0) around the centre. */
    uAOMap: { value: null as THREE.Texture | null },
  };
  private map: THREE.WebGLRenderTarget | null = null;
  /** The full-screen triangle that draws the map (tagged as ring work in the performance overlay). */
  readonly mapMesh = new THREE.Mesh(fullScreenTriangle());
  private mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** The map's texels are undefined (new or resized): the next draw covers all of it. */
  private mapFresh = true;
  /** Texels the robots darkened last frame (x0, y0, x1, y1); x1 <= x0 when none. */
  private mapLast = [0, 0, 0, 0];

  /** Call before any material is patched: the sphere count is compiled into the shaders. */
  setQuality(q: 'low' | 'med' | 'high') {
    this.per = q === 'low' ? PER_LOW : PER_FULL;
    this.uniforms.uAOS.value = new Float32Array(2 * this.per * 4);
    this.map?.dispose();
    (this.mapMesh.material as THREE.Material).dispose();
    const n = MAP_SIZE[q];
    this.map = new THREE.WebGLRenderTarget(n, n, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.uniforms.uAOMap.value = this.map.texture;
    this.mapMesh.frustumCulled = false;
    this.mapMesh.material = new THREE.ShaderMaterial({
        uniforms: { uAOS: this.uniforms.uAOS, uAOB: this.uniforms.uAOB },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          ${sphereGLSL(this.per)}
          varying vec2 vUv;
          void main() {
            vec3 p = vec3((vUv.x * 2.0 - 1.0) * ${MAP_HALF.toFixed(2)}, 0.0, (vUv.y * 2.0 - 1.0) * ${MAP_HALF.toFixed(2)});
            gl_FragColor = vec4(aoSpheres(p, vec3(0.0, 1.0, 0.0), ${MAP_STRENGTH.toFixed(2)}), 0.0, 0.0, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      });
    this.mapFresh = true;
  }

  /**
   * Work out the floor's occlusion for this frame. Call once before the scene renders.
   * Only the patches under the robots change, so only they are redrawn: where each robot's
   * occlusion reaches the floor now, plus where it reached last frame (which goes back to white).
   * Everywhere else keeps what it had, so most of the map costs nothing.
   */
  renderMap(renderer: THREE.WebGLRenderer) {
    const map = this.map;
    if (!map) return;
    const b = this.uniforms.uAOB.value;
    const n = map.width;
    const k = n / (2 * MAP_HALF);
    const now = [n, n, 0, 0];
    for (let i = 0; i < 2; i++) {
      const r = b[i * 4 + 3], cy = b[i * 4 + 1];
      // the robot's bounding sphere meets the floor in a disc (the shader's bounding test)
      if (r <= Math.abs(cy)) continue;
      const rr = Math.sqrt(r * r - cy * cy);
      const x = (b[i * 4] + MAP_HALF) * k, z = (b[i * 4 + 2] + MAP_HALF) * k;
      // a texel or two over, for the floor's bilinear taps
      now[0] = Math.min(now[0], Math.floor(x - rr * k) - 2);
      now[1] = Math.min(now[1], Math.floor(z - rr * k) - 2);
      now[2] = Math.max(now[2], Math.ceil(x + rr * k) + 2);
      now[3] = Math.max(now[3], Math.ceil(z + rr * k) + 2);
    }
    for (let j = 0; j < 4; j++) now[j] = Math.max(0, Math.min(n, now[j]));
    const has = (q: number[]) => q[2] > q[0] && q[3] > q[1];
    const box = [n, n, 0, 0];
    for (const q of [now, this.mapLast]) {
      if (!has(q)) continue;
      box[0] = Math.min(box[0], q[0]);
      box[1] = Math.min(box[1], q[1]);
      box[2] = Math.max(box[2], q[2]);
      box[3] = Math.max(box[3], q[3]);
    }
    this.mapLast = has(now) ? now : [0, 0, 0, 0];
    if (!this.mapFresh && !has(box)) return;
    map.scissorTest = !this.mapFresh;
    map.scissor.set(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    this.mapFresh = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(map);
    renderer.render(this.mapMesh, this.mapCam);
    renderer.setRenderTarget(prev);
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
    // a flat floor at y = 0 reads its sphere occlusion from the map instead of looping
    const fromMap = !!(o.spheres && o.floor && (o.strength ?? 1) === MAP_STRENGTH);
    const key = `ao${o.spheres ? (fromMap ? 'm' : 's' + per) : ''}${o.ground ? 'g' : ''}${o.stage ? 'r' : ''}${o.floor ? 'f' : ''}`;
    mat.onBeforeCompile = (sh, renderer) => {
      prev.call(mat, sh, renderer);
      if (fromMap) sh.uniforms.uAOMap = u.uAOMap;
      else if (o.spheres) {
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
      if (fromMap) terms.push('ao *= aoFloorMap(vAOW.xz);');
      else if (o.spheres) terms.push(`ao *= aoSpheres(vAOW, nW, ${f(o.strength ?? 1)});`);
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
           ${fromMap ? MAP_GLSL : o.spheres ? sphereGLSL(per) : ''}`,
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

/** One triangle covering clip space, uv 0..1 over the screen. */
function fullScreenTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  return g;
}

const MAP_GLSL = /* glsl */ `
uniform sampler2D uAOMap;
float aoFloorMap(vec2 xz) {
  vec2 uv = xz * ${(0.5 / MAP_HALF).toFixed(6)} + 0.5;
  // past the map's edge the robots are too far away to darken anything
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  return texture2D(uAOMap, uv).r;
}
`;

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
