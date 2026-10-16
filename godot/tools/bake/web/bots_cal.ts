// Three spheres under the lab's light (godot/tests/bots_cal.gd draws the same), to compare the
// engines' light units and BRDFs: pink satin paint, white matte, chrome.
//   run.mjs bots_cal --shot out.png --q "amb=0&sun=1"
import * as THREE from 'three';

export async function run() {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1280, 720, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI * Number(q.get('sun') ?? 1));
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const amb = Number(q.get('amb') ?? 0);
  if (amb > 0) scene.add(new THREE.AmbientLight(0xffffff, amb * Math.PI));
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xf06aa0, metalness: 0.25, roughness: 0.34 }),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.14 }),
  ];
  mats.forEach((m, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 64, 32), m);
    s.position.set((i - 1) * 1.2, 0, 0);
    scene.add(s);
  });
  const camera = new THREE.PerspectiveCamera(38, 1280 / 720, 0.1, 120);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  return 'ok';
}
