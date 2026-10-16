// What three's studio environment (stage.ts: RoomEnvironment through PMREM) lights a matte white
// surface with, per facing: the numbers render/garage/garage_sky.gdshader is fitted to.
//   node godot/tools/bake/web/run.mjs garage3d_env
// Prints the outgoing radiance of a white Lambert surface (no specular) at environmentIntensity 1,
// linear, for 64 normals spread over the sphere: "x,y,z,r,g,b;..." (tools/bake/web/garage3d_env.py
// fits the sky to them).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export async function run() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  renderer.toneMapping = THREE.NoToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const scene = new THREE.Scene();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 1;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0, specularIntensity: 0 });
  // a tiny quad facing the camera: its normal is the camera's view direction reversed
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-0.1, 0.1, 0.1, -0.1, 0.01, 10);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const px = new Float32Array(4 * 4 * 4);
  const out: string[] = [];
  // 64 normals spread evenly over the sphere (a Fibonacci lattice)
  const N = 64;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), az = i * Math.PI * (3 - Math.sqrt(5));
    const nrm = new THREE.Vector3(r * Math.cos(az), y, r * Math.sin(az));
    quad.position.set(0, 0, 0);
    quad.lookAt(nrm);
    cam.position.copy(nrm).multiplyScalar(2);
    cam.up.set(Math.abs(nrm.y) > 0.9 ? 1 : 0, Math.abs(nrm.y) > 0.9 ? 0 : 1, 0);
    cam.lookAt(0, 0, 0);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, 4, 4, px);
    out.push([nrm.x, nrm.y, nrm.z, px[20], px[21], px[22]].map((v) => v.toFixed(4)).join(','));
  }
  renderer.setRenderTarget(null);
  return 'ok ' + out.join(';');
}
