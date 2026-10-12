import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderSettings } from './settings';

export type Quality = 'low' | 'med' | 'high';

export function detectQuality(): Quality {
  const saved = (() => {
    try {
      return localStorage.getItem('bb.quality');
    } catch {
      return null;
    }
  })();
  if (saved === 'low' || saved === 'med' || saved === 'high') return saved;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (!mobile) return 'high';
  return cores >= 8 ? 'high' : cores >= 6 ? 'med' : 'low';
}

/** Renderer, lighting and post-processing, with an adaptive resolution governor. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  readonly key: THREE.DirectionalLight;
  quality: Quality;
  private pixelRatio = 1;
  private maxPixelRatio = 2;
  private frameTimes: number[] = [];
  private governorCooldown = 0;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    RenderSettings.bloom = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'high',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 120);
    this.camera.position.set(0, 3, 9);

    const scene = this.scene;
    scene.background = new THREE.Color(0x070a12);
    scene.fog = new THREE.FogExp2(0x070a12, 0.045);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0x9cc0ff, 0x241a14, 0.55));
    this.key = new THREE.DirectionalLight(0xfff1e0, 2.1);
    this.key.position.set(3, 10, 4);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = quality !== 'low';
    const s = this.key.shadow;
    s.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    s.camera.left = -5.5;
    s.camera.right = 5.5;
    s.camera.top = 5.5;
    s.camera.bottom = -5.5;
    s.camera.near = 2;
    s.camera.far = 22;
    s.bias = -0.0005;
    s.normalBias = 0.02;
    s.radius = 3;
    scene.add(this.key, this.key.target);
    const rimA = new THREE.PointLight(0xff7a2a, 22, 14, 1.6);
    rimA.position.set(-5.5, 3.5, -2);
    const rimB = new THREE.PointLight(0x2ad8ff, 22, 14, 1.6);
    rimB.position.set(5.5, 3.5, 2);
    scene.add(rimA, rimB);

    this.maxPixelRatio = quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    if (quality === 'high') this.setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private setupComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.7, 0.55, 2.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the horizontal framing stable on narrow screens
    this.camera.fov = w / h < 1.2 ? 55 : 38;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
    this.onResize?.(w, h * this.pixelRatio);
  }

  /** Lower resolution if frames are consistently slow, raise it when there is headroom. */
  govern(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.governorCooldown -= dt;
    if (this.governorCooldown > 0 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const device = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    if (avg > 1 / 45 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.governorCooldown = 2;
      this.frameTimes.length = 0;
      this.resize();
    } else if (avg < 1 / 58 && this.pixelRatio < device) {
      this.pixelRatio = Math.min(device, this.pixelRatio + 0.25);
      this.governorCooldown = 4;
      this.frameTimes.length = 0;
      this.resize();
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
