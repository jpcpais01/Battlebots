import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Reflections of the real place. Metal and paint used to reflect a stock studio (three's
 * RoomEnvironment): the same grey softboxes in every venue. A probe in the middle of the ring now
 * photographs the place it stands in, once, from where the robots fight: the lamps over the
 * ring, the lit canvas under them, the screens, the crowd, the sunset over the harbour. That
 * picture becomes the environment every material reflects and is lit by, so chrome mirrors the
 * truss lights and a robot's underside picks up the glow of the canvas, as a ray tracer would show.
 *
 * Brightness stays where the lighting was tuned: the probe's average light is measured on the
 * GPU and matched to the studio's, so only where the light comes from changes, not how much.
 */

const MEASURE = /* glsl */ `
  uniform samplerCube tCube;
  varying vec2 vUv;
  void main() {
    // the average light over the whole sphere, from a spiral of directions
    float sum = 0.0;
    const int N = 256;
    for (int i = 0; i < N; i++) {
      float y = 1.0 - (float(i) + 0.5) / float(N) * 2.0;
      float r = sqrt(max(0.0, 1.0 - y * y));
      float a = float(i) * 2.39996323;
      vec3 c = textureCube(tCube, vec3(cos(a) * r, y, sin(a) * r)).rgb;
      sum += min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 64.0);
    }
    float m = sum / float(N);
    // an 8-bit pixel can't hold HDR: store m / (1 + m) and undo it on the CPU
    gl_FragColor = vec4(m / (1.0 + m), 0.0, 0.0, 1.0);
  }`;

export class EnvProbe {
  private target: THREE.WebGLCubeRenderTarget;
  private cam: THREE.CubeCamera;
  private quad = new FullScreenQuad();
  private measureMat: THREE.ShaderMaterial;
  private measureRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  private px = new Uint8Array(4);
  /** The studio's average light, which captures are matched to. */
  private ref = 0;

  constructor(size: number) {
    this.target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cam = new THREE.CubeCamera(0.15, 160, this.target);
    this.measureMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: MEASURE,
      uniforms: { tCube: { value: this.target.texture } },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  /**
   * Photograph `scene` from `at` with only `show` (direct children of the scene) visible, and
   * turn it into a reflection map. Returns it with the intensity gain that matches the studio.
   */
  capture(renderer: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, scene: THREE.Scene, show: THREE.Object3D[], at: THREE.Vector3) {
    if (!this.ref) this.ref = this.studio(renderer);
    const keep = new Set(show);
    const hidden: THREE.Object3D[] = [];
    for (const c of scene.children) {
      if (c.visible && !keep.has(c) && !(c as THREE.Light).isLight) {
        c.visible = false;
        hidden.push(c);
      }
    }
    const env = scene.environment;
    const target = renderer.getRenderTarget();
    try {
      this.cam.position.copy(at);
      this.cam.updateMatrixWorld();
      this.cam.update(renderer, scene);
    } finally {
      for (const c of hidden) c.visible = true;
      scene.environment = env;
    }
    const lum = this.measure(renderer);
    renderer.setRenderTarget(target);
    const map = pmrem.fromCubemap(this.target.texture);
    // (a measurement that failed reads as black: keep the tuned brightness then)
    const gain = lum > 1e-4 && this.ref > 1e-4 ? THREE.MathUtils.clamp(this.ref / lum, 0.5, 8) : 1;
    return { map, gain };
  }

  /** The stock studio's average light, measured the same way. */
  private studio(renderer: THREE.WebGLRenderer) {
    const room = new RoomEnvironment();
    this.cam.position.set(0, 0, 0);
    this.cam.updateMatrixWorld();
    this.cam.update(renderer, room);
    room.dispose();
    return this.measure(renderer);
  }

  private measure(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.measureRT);
    this.quad.material = this.measureMat;
    this.quad.render(renderer);
    renderer.readRenderTargetPixels(this.measureRT, 0, 0, 1, 1, this.px);
    const k = Math.min(this.px[0], 254) / 255;
    return k / (1 - k);
  }

  dispose() {
    this.target.dispose();
    this.measureRT.dispose();
    this.measureMat.dispose();
    this.quad.dispose();
  }
}
