import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PostFX } from './post';
import { RenderSettings } from './settings';
import { ResolutionGovernor } from './governor';
import { contactAO } from './ao';

export type Quality = 'low' | 'med' | 'high';

/** Render resolution as a pixel ratio, or null to let the governor pick it. */
export type ResScale = number | null;

export function loadResScale(): ResScale {
  try {
    const v = Number(localStorage.getItem('bb.res'));
    return v >= 0.25 && v <= 4 ? v : null;
  } catch {
    return null;
  }
}

function saveResScale(v: ResScale) {
  try {
    if (v === null) localStorage.removeItem('bb.res');
    else localStorage.setItem('bb.res', String(v));
  } catch {
    /* ignore */
  }
}

/** The fixed resolutions offered in settings, up to and including the screen's own. */
export function resScaleChoices(): { value: number; native: boolean }[] {
  const dpr = window.devicePixelRatio || 1;
  const out = [0.5, 0.75, 1, 1.25, 1.5, 2].filter((v) => v < dpr - 0.01).map((value) => ({ value, native: false }));
  out.push({ value: Math.round(dpr * 100) / 100, native: true });
  return out;
}

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
  /** Bloom and tone mapping (high quality only); without it the scene renders straight to the screen. */
  readonly post: PostFX | null = null;
  readonly key: THREE.SpotLight;
  quality: Quality;
  private maxPixelRatio = 2;
  private governor: ResolutionGovernor;
  /** A resolution picked in settings; while set it overrides the governor and the quality cap. */
  private fixedRatio: ResScale = loadResScale();
  private sized = { w: 0, h: 0, pr: 0 };
  /** Resolution the governor asked for but that waits for a camera cut, so the switch is not seen. */
  private pendingFor = 0;
  /** Field of view the director builds its lenses from; the director owns `camera.fov`. */
  baseFov = 38;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    RenderSettings.bloom = quality === 'high';
    contactAO.setQuality(quality);
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
    scene.fog = new THREE.FogExp2(0x070a12, 0.016);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0x9cc0ff, 0x241a14, 0.42));
    // the overhead rig: one warm spot pools on the ring and falls off past the apron, so the robots
    // stand in the light while the floor around the stage sinks into shadow. No distance decay, so
    // it lights like the sun it replaced, and it costs the same (one light, one shadow map).
    this.key = new THREE.SpotLight(0xfff1e0, 3.0, 0, 0.62, 0.8, 0);
    this.key.position.set(2.2, 13, 3);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = quality !== 'low';
    const s = this.key.shadow;
    s.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    // aim the shadow map at the ring rather than the whole cone
    s.focus = 0.62;
    s.camera.near = 7;
    s.camera.far = 20;
    s.bias = -0.0004;
    s.normalBias = 0.02;
    s.radius = 3;
    scene.add(this.key, this.key.target);
    const rimA = new THREE.PointLight(0xff7a2a, 22, 14, 1.6);
    rimA.position.set(-5.5, 3.5, -2);
    const rimB = new THREE.PointLight(0x2ad8ff, 22, 14, 1.6);
    rimB.position.set(5.5, 3.5, 2);
    scene.add(rimA, rimB);

    this.maxPixelRatio = quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1;
    this.governor = new ResolutionGovernor(this.deviceRatio());
    if (quality === 'high') this.post = new PostFX(this.renderer);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get resScale(): ResScale {
    return this.fixedRatio;
  }

  /** Pick a fixed render resolution (pixel ratio), or null to go back to automatic. Applies at once. */
  setResScale(v: ResScale) {
    this.fixedRatio = v;
    saveResScale(v);
    // back to auto starts from the top again, forgetting levels the governor had ruled out
    if (v === null) this.governor = new ResolutionGovernor(this.deviceRatio());
    this.pendingFor = 0;
    this.resize();
  }

  private deviceRatio() {
    return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.fixedRatio ?? this.governor.ratio;
    // resizing the canvas or the post buffers clears and reallocates them, so only do it on a real change
    const s = this.sized;
    if (w !== s.w || h !== s.h || pr !== s.pr) {
      this.renderer.setDrawingBufferSize(w, h, pr);
      this.post?.setSize(w * pr, h * pr);
      this.sized = { w, h, pr };
    }
    // keep the horizontal framing stable on narrow screens; the director applies it, so a resize
    // between its update and the render can't flash a frame at the wrong zoom
    this.baseFov = w / h < 1.2 ? 55 : 38;
    if (this.camera.aspect !== w / h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.onResize?.(w, h * pr);
  }

  /**
   * Lower resolution if frames are consistently slow, raise it when there is headroom.
   * A switch changes sharpness and glow and costs a hitch, so it waits for a camera cut or screen
   * change (`cut`), where nobody notices; a drop goes through anyway if no cut comes soon.
   */
  govern(dt: number, cut = false) {
    if (this.fixedRatio !== null) return;
    if (this.governor.ratio === this.sized.pr) {
      this.pendingFor = 0;
      this.governor.sample(dt, this.deviceRatio());
      if (this.governor.ratio === this.sized.pr) return;
    }
    this.pendingFor += dt;
    const dropping = this.governor.ratio < this.sized.pr;
    if (cut || (dropping && this.pendingFor > 2.5)) {
      this.pendingFor = 0;
      this.resize();
    }
  }

  render() {
    if (this.post) this.post.render(this.scene, this.camera);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }
}
