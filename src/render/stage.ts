import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PostFX } from './post';
import { RippleOverlay, Ripples } from './ripple';
import { RenderSettings } from './settings';
import { ResolutionGovernor } from './governor';
import { contactAO } from './ao';
import { loadRT, rtDefault, RT_MARK, saveRT, ScreenSpaceLighting, type ReflectLook } from './rt';
import { installPCSS, updatePCSS } from './pcss';
import { EnvProbe } from './envProbe';

/** The key light's width for its soft shadows: a bank of stage lamps, in metres. */
const KEY_SIZE = 1.6;

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

/** Everything about how a place is lit: background, fog, ambient, the key spot and the two rims. */
export interface LightLook {
  background: number;
  fog: number;
  fogDensity: number;
  envIntensity: number;
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number; pos: THREE.Vector3Tuple; target: THREE.Vector3Tuple; angle: number; penumbra: number; near: number; far: number; focus: number };
  rims: { color: number; intensity: number; distance: number; pos: THREE.Vector3Tuple }[];
}

/** Renderer, lighting and post-processing, with an adaptive resolution governor. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Bloom and tone mapping (high quality only); without it the scene renders straight to the screen. */
  readonly post: PostFX | null = null;
  /** Shockwaves that warp the screen on big hits: in the composite on high, an overlay otherwise. */
  readonly ripples = new Ripples();
  private rippleOverlay: RippleOverlay | null = null;
  readonly key: THREE.SpotLight;
  readonly hemi: THREE.HemisphereLight;
  readonly rims: THREE.PointLight[];
  /** The arena's lighting, captured at start so a place that relights the scene can hand it back. */
  readonly arenaLook: LightLook;
  quality: Quality;
  /**
   * Ray-traced lighting (high quality only; on by default on desktops): screen-space GI, AO,
   * contact shadows and reflections, and contact-hardening soft shadows. See rt.ts and pcss.ts.
   */
  readonly rt: boolean;
  /** The studio reflections everything starts with (and places without a probe keep). */
  private studioEnv: THREE.Texture;
  private pmrem: THREE.PMREMGenerator;
  private probe: EnvProbe | null = null;
  /** The environment's brightness from the current look, and the gain the current map needs on top. */
  private lookEnv = 0.55;
  private envGain = 1;
  private maxPixelRatio = 2;
  private governor: ResolutionGovernor;
  /** A resolution picked in settings; while set it overrides the governor and the quality cap. */
  private fixedRatio: ResScale = loadResScale();
  private sized = { w: 0, h: 0, pr: 0 };
  /** Resolution the governor asked for but that waits for a camera cut, so the switch is not seen. */
  private pendingFor = 0;
  /** Field of view the director builds its lenses from; the director owns `camera.fov`. */
  baseFov = 38;
  /** What the next frame draws once beforehand, everything shown (see warmUp). */
  private warmRoots: THREE.Object3D[] = [];
  private warmExtras: THREE.Object3D[] = [];
  private overlayWarm = false;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    RenderSettings.bloom = quality === 'high';
    RenderSettings.quality = quality;
    contactAO.setQuality(quality);
    // (before any material compiles: the soft shadows change three's shadow code for all of them)
    this.rt = quality === 'high' && (loadRT() ?? rtDefault(quality)) && installPCSS();
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
    const pmrem = (this.pmrem = new THREE.PMREMGenerator(this.renderer));
    const room = new RoomEnvironment();
    scene.environment = this.studioEnv = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    scene.environmentIntensity = 0.55;

    this.hemi = new THREE.HemisphereLight(0x9cc0ff, 0x241a14, 0.42);
    scene.add(this.hemi);
    // the overhead rig: one warm spot pools on the ring and falls off past the apron, so the robots
    // stand in the light while the floor around the stage sinks into shadow. No distance decay, so
    // it lights like the sun it replaced, and it costs the same (one light, one shadow map).
    this.key = new THREE.SpotLight(0xfff1e0, 3.4, 0, 0.62, 0.8, 0);
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
    this.rims = [rimA, rimB];
    this.arenaLook = this.captureLook();

    this.maxPixelRatio = quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1;
    this.governor = new ResolutionGovernor(this.deviceRatio());
    if (quality === 'high') {
      const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      const ssl = this.rt ? new ScreenSpaceLighting(mobile) : null;
      if (ssl) {
        ssl.keyLight = this.key;
        this.watchShaders();
      }
      this.post = new PostFX(this.renderer, this.ripples, ssl);
    } else this.rippleOverlay = new RippleOverlay(this.ripples);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private captureLook(): LightLook {
    const k = this.key;
    const fog = this.scene.fog as THREE.FogExp2;
    return {
      background: (this.scene.background as THREE.Color).getHex(),
      fog: fog.color.getHex(),
      fogDensity: fog.density,
      envIntensity: this.scene.environmentIntensity,
      hemi: { sky: this.hemi.color.getHex(), ground: this.hemi.groundColor.getHex(), intensity: this.hemi.intensity },
      key: {
        color: k.color.getHex(),
        intensity: k.intensity,
        pos: k.position.toArray(),
        target: k.target.position.toArray(),
        angle: k.angle,
        penumbra: k.penumbra,
        near: k.shadow.camera.near,
        far: k.shadow.camera.far,
        focus: k.shadow.focus,
      },
      rims: this.rims.map((r) => ({ color: r.color.getHex(), intensity: r.intensity, distance: r.distance, pos: r.position.toArray() })),
    };
  }

  /**
   * Relight the scene. The set of lights never changes (only their colours and placement), so
   * switching places doesn't recompile a single shader.
   */
  applyLook(l: LightLook) {
    (this.scene.background as THREE.Color).setHex(l.background);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(l.fog);
    fog.density = l.fogDensity;
    this.lookEnv = l.envIntensity;
    this.scene.environmentIntensity = l.envIntensity * this.envGain;
    this.hemi.color.setHex(l.hemi.sky);
    this.hemi.groundColor.setHex(l.hemi.ground);
    this.hemi.intensity = l.hemi.intensity;
    const k = this.key;
    k.color.setHex(l.key.color);
    k.intensity = l.key.intensity;
    k.position.fromArray(l.key.pos);
    k.target.position.fromArray(l.key.target);
    k.target.updateMatrixWorld();
    k.angle = l.key.angle;
    k.penumbra = l.key.penumbra;
    k.shadow.focus = l.key.focus;
    k.shadow.camera.near = l.key.near;
    k.shadow.camera.far = l.key.far;
    // three only refreshes the shadow frustum itself when the cone or range changes
    k.shadow.camera.updateProjectionMatrix();
    l.rims.forEach((r, i) => {
      const p = this.rims[i];
      p.color.setHex(r.color);
      p.intensity = r.intensity;
      p.distance = r.distance;
      p.position.fromArray(r.pos);
    });
  }

  /**
   * Photograph the place around `at` (only `show`, direct children of the scene, visible) into a
   * reflection map for `useEnv`. One cube render and a filter: do it at a quiet moment.
   */
  captureEnv(show: THREE.Object3D[], at: THREE.Vector3) {
    // (the studio's size: a reflection map of another size would rebuild every lit shader on a switch)
    this.probe ??= new EnvProbe(256);
    return this.probe.capture(this.renderer, this.pmrem, this.scene, show, at);
  }

  /** Reflect `map` (from captureEnv) at `gain`, or the stock studio (null). */
  useEnv(map: THREE.Texture | null, gain = 1) {
    this.scene.environment = map ?? this.studioEnv;
    this.envGain = map ? gain : 1;
    this.scene.environmentIntensity = this.lookEnv * this.envGain;
  }

  /** What the ray-traced reflections may reflect in (the arena's canvas and floor), or null for nothing. */
  setReflect(r: ReflectLook | null) {
    const ssl = this.post?.rt;
    if (ssl) ssl.reflect = r ?? NO_REFLECT;
  }

  /**
   * If a driver can't compile the ray-traced shaders, switch the setting off and reload with the
   * plain look rather than drawing black (three caches the broken programs, so it can't be undone
   * in place). Only an automatic or chosen setting on this device is changed, and only once.
   */
  private watchShaders() {
    const r = this.renderer;
    r.debug.onShaderError = (gl, program, vs, fs) => {
      const log = (sh: WebGLShader) => gl.getShaderInfoLog(sh)?.trim();
      console.error('THREE.WebGLProgram: shader error', gl.getError(), gl.getProgramInfoLog(program)?.trim(), log(vs), log(fs));
      const src = (gl.getShaderSource(vs) ?? '') + (gl.getShaderSource(fs) ?? '');
      if (!src.includes(RT_MARK) || this.rtFailed) return;
      this.rtFailed = true;
      console.warn('ray-traced lighting off: this GPU could not compile it');
      saveRT(false);
      location.reload();
    };
  }
  private rtFailed = false;

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
  govern(dt: number, cut = false, targetFps = 60) {
    if (this.fixedRatio !== null) return;
    if (this.governor.ratio === this.sized.pr) {
      this.pendingFor = 0;
      this.governor.sample(dt, this.deviceRatio(), targetFps);
      if (this.governor.ratio === this.sized.pr) return;
    }
    this.pendingFor += dt;
    const dropping = this.governor.ratio < this.sized.pr;
    if (cut || (dropping && this.pendingFor > 2.5)) {
      this.pendingFor = 0;
      this.resize();
    }
  }

  /**
   * Before the next frame, draw a throwaway frame with everything under `roots` shown and nothing
   * culled (and `extras` added to the scene just for it). Every shader, shadow-map variant, buffer
   * and texture they can use is then built and uploaded at a quiet moment, rather than on the
   * first spark, flash, torn-off part or stretcher of a fight, where building one stalls a frame
   * (worst on phones). The real frame, drawn straight after, covers it.
   */
  warmUp(roots: THREE.Object3D[], extras: THREE.Object3D[] = []) {
    this.warmRoots.push(...roots);
    this.warmExtras.push(...extras);
  }

  private warmFrame() {
    const extras = this.warmExtras.splice(0);
    const roots = this.warmRoots.splice(0).concat(extras);
    for (const o of extras) this.scene.add(o);
    const shown: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    for (const root of roots) {
      root.traverse((o) => {
        // the set of lights is part of every shader: leave lights exactly as they are
        if ((o as THREE.Light).isLight) return;
        if (!o.visible) {
          o.visible = true;
          shown.push(o);
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          culled.push(o);
        }
      });
    }
    try {
      this.draw();
      if (!this.overlayWarm && this.rippleOverlay) {
        this.overlayWarm = true;
        this.rippleOverlay.prewarm(this.renderer);
      }
    } finally {
      for (const o of shown) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      for (const o of extras) o.removeFromParent();
    }
  }

  render() {
    if (this.warmRoots.length || this.warmExtras.length) this.warmFrame();
    this.draw();
  }

  private draw() {
    const size = this.renderer.getDrawingBufferSize(_size);
    const box = this.ripples.prepare(this.camera, size.x / Math.max(1, size.y));
    contactAO.renderMap(this.renderer);
    if (this.rt && !this.rtFailed) updatePCSS(this.key, KEY_SIZE);
    if (this.post) this.post.render(this.scene, this.camera);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      if (box) this.rippleOverlay?.render(this.renderer, box);
    }
  }
}

const _size = new THREE.Vector2();
const NO_REFLECT: ReflectLook = { canvas: [0, 1], floor: [0, 1, 0] };
