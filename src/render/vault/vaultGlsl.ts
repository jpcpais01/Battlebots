import * as THREE from 'three';

/**
 * The Skin Vault's materials (render/vault/vaultStage.ts), ported from the Android app's
 * render/vault shaders: deep space round the platform, the platform's neon glass, the skin
 * capsules, the machine's glass globe, its neon and bulbs, and light with no surface (the beam,
 * the shock ring, the haloes). All of them share one clock (`time`).
 */

export type U = { value: number };
export type UV3 = { value: THREE.Vector3 };

const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ------------------------------------------------------------------ deep space

const SPACE_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    // a dome round the lens, whatever its far plane: drawn first, behind everything
    gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + normalize(position) * 50.0, 1.0);
  }`;

const SPACE_FRAG = /* glsl */ `
  uniform float uTime, uFlash, uNebula;
  uniform vec3 uFlashCol, uPlanetDir;
  uniform float uPlanetR;
  varying vec3 vDir;

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
  // stars: one per cell of a grid on the direction, some bright, all twinkling
  vec3 stars(vec3 d, float scale, float t) {
    vec3 p = d * scale;
    vec3 c = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash3(c);
    vec3 o = vec3(hash3(c + 3.1), hash3(c + 7.7), hash3(c + 1.3)) - 0.5;
    float r = length(f - o * 0.7);
    float lit = step(0.72, h);
    float tw = 0.55 + 0.45 * sin(t * (1.5 + h * 4.0) + h * 40.0);
    float core = exp(-r * r * 900.0) * 3.5 + exp(-r * r * 90.0) * 0.25;
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.8, 0.95), hash3(c + 9.0));
    return tint * core * lit * tw * (0.4 + h * 0.8);
  }

  void main() {
    vec3 d = normalize(vDir);
    float t = uTime;
    float y = d.y;
    // the night: violet overhead, a magenta haze round the horizon, indigo deep below
    vec3 col = mix(vec3(0.012, 0.006, 0.04), vec3(0.03, 0.01, 0.07), smoothstep(-0.2, 0.9, y));
    col += vec3(0.16, 0.025, 0.14) * exp(-abs(y + 0.05) * 6.0);
    col += vec3(0.02, 0.05, 0.12) * exp(-abs(y - 0.25) * 3.0) * 0.6;
    // nebulae: two drifting layers of cloud
    vec3 q = d * 2.2 + vec3(t * 0.006, 0.0, t * 0.004);
    float n1 = fbm(q);
    float n2 = fbm(q * 1.7 + vec3(4.0, 1.0, 2.0) + n1 * 1.3);
    float cloud = smoothstep(0.42, 0.85, n2);
    vec3 neb = mix(vec3(0.9, 0.12, 0.6), vec3(0.08, 0.6, 0.8), smoothstep(0.35, 0.75, n1));
    col += neb * cloud * cloud * 0.55 * uNebula * (0.6 + 0.4 * smoothstep(-0.4, 0.5, y));
    // dark dust lanes through them
    col *= 1.0 - 0.6 * smoothstep(0.55, 0.8, fbm(q * 3.1 + 11.0)) * cloud;
    // the stars, in two sizes
    col += stars(d, 90.0, t) + stars(d, 210.0, t * 1.3) * 0.5;
    // the ringed planet
    vec3 pd = normalize(uPlanetDir);
    vec3 pu = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
    vec3 pv = cross(pu, pd);
    vec2 uv = vec2(dot(d, pu), dot(d, pv)) / uPlanetR;
    float front = dot(d, pd);
    float rr = length(uv);
    // its rings: an ellipse round it, tilted, behind and in front of the globe
    mat2 tilt = mat2(vec2(cos(0.38), sin(0.38)), vec2(-sin(0.38), cos(0.38)));
    vec2 ru = tilt * uv;
    float re = length(vec2(ru.x, ru.y / 0.26));
    float ring = smoothstep(1.35, 1.45, re) * (1.0 - smoothstep(2.25, 2.35, re));
    ring *= 0.55 + 0.45 * sin(re * 38.0) * sin(re * 11.0 + 1.0);
    ring *= step(0.0, front);
    vec3 ringCol = vec3(0.85, 0.65, 0.95) * ring * 0.55;
    bool ringFront = ru.y < 0.0;
    if (rr < 1.0 && front > 0.0) {
      // a banded gas giant lit from the upper right
      vec3 n = vec3(uv, sqrt(1.0 - rr * rr));
      float lit = clamp(dot(n, normalize(vec3(0.6, 0.5, 0.6))), 0.0, 1.0);
      float bands = fbm(vec3(uv.y * 6.0 + sin(uv.x * 3.0) * 0.2, uv.x * 0.5 + t * 0.003, 1.0));
      vec3 pc = mix(vec3(0.95, 0.42, 0.55), vec3(1.0, 0.78, 0.5), smoothstep(0.3, 0.7, bands));
      pc = mix(pc, vec3(0.45, 0.25, 0.75), smoothstep(0.6, 0.9, sin(uv.y * 9.0 + bands * 3.0) * 0.5 + 0.5) * 0.5);
      vec3 planet = pc * (lit * 0.85 + 0.04) + vec3(0.6, 0.3, 1.0) * pow(max(1.0 - n.z, 0.0), 3.0) * 0.6;
      // the rings' shadow across it
      planet *= 1.0 - 0.5 * smoothstep(0.08, 0.0, abs(ru.y + 0.12));
      col = planet;
      if (ringFront) col += ringCol;
    } else {
      col += ringCol;
      // a soft atmosphere round its rim
      col += vec3(0.7, 0.3, 0.9) * exp(-max(rr - 1.0, 0.0) * 9.0) * 0.35 * step(0.0, front);
    }
    // a small moon
    vec3 md = normalize(vec3(0.75, 0.55, -0.4));
    vec3 mu = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
    vec2 muv = vec2(dot(d, mu), dot(d, cross(mu, md))) / 0.045;
    float mr = length(muv);
    if (mr < 1.0 && dot(d, md) > 0.0) {
      vec3 mn = vec3(muv, sqrt(1.0 - mr * mr));
      float crater = smoothstep(0.55, 0.62, noise3(vec3(muv * 3.0, 2.0)));
      col = vec3(0.75, 0.8, 0.95) * clamp(dot(mn, normalize(vec3(-0.7, 0.3, 0.6))), 0.0, 1.0) * (1.0 - crater * 0.3) + vec3(0.02, 0.01, 0.04);
    }
    // a shooting star now and then
    float sk = floor(t / 3.7);
    float sp = fract(t / 3.7);
    vec3 s0 = normalize(vec3(hash3(vec3(sk, 1.0, 2.0)) - 0.5, 0.35 + hash3(vec3(sk, 5.0, 1.0)) * 0.4, hash3(vec3(sk, 2.0, 9.0)) - 0.5));
    vec3 sdir = normalize(cross(s0, vec3(0.3, 1.0, 0.1)));
    if (hash3(vec3(sk, 3.0, 3.0)) > 0.45 && sp < 0.3) {
      float k = sp / 0.3;
      vec3 head = normalize(s0 + sdir * k * 0.5);
      vec3 tail = normalize(s0 + sdir * max(k - 0.12, 0.0) * 0.5);
      vec3 ab = head - tail;
      float h = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dist = length(d - tail - ab * h);
      col += vec3(1.0, 0.9, 1.0) * exp(-dist * dist * 4e5) * h * 3.0 * sin(PI * k);
    }
    col += uFlashCol * uFlash * (0.25 + 0.15 * smoothstep(-0.2, 0.6, y));
    gl_FragColor = vec4(col, 1.0);
    ${OUT}
  }`;

export function spaceMaterial(time: U) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uFlash: { value: 0 },
      uFlashCol: { value: new THREE.Vector3(1, 0.8, 0.4) },
      uNebula: { value: 1 },
      uPlanetDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72) },
      uPlanetR: { value: 0.2 },
    },
    vertexShader: SPACE_VERT,
    fragmentShader: `#include <common>\n${SPACE_FRAG}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

// ------------------------------------------------------------------ what the metal reflects

const ENV_FRAG = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(vec3(0.03, 0.012, 0.07), vec3(0.09, 0.04, 0.2), smoothstep(-0.1, 0.8, d.y));
    col += vec3(0.5, 0.08, 0.42) * exp(-abs(d.y) * 5.0) * 0.25;
    col = mix(col, vec3(0.02, 0.015, 0.04), smoothstep(0.0, -0.3, d.y));
    // the machine's neon behind (-z) and the stage's cool light from the front right
    col += vec3(1.4, 0.3, 1.1) * smoothstep(0.8, 0.97, dot(d, normalize(vec3(-0.1, 0.7, -1.0))));
    col += vec3(0.6, 1.6, 2.4) * smoothstep(0.8, 0.98, dot(d, normalize(vec3(0.9, 0.5, 0.4))));
    col += vec3(1.8, 1.7, 2.0) * smoothstep(0.86, 0.99, dot(d, normalize(vec3(-0.3, 0.9, 0.4))));
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }`;

/**
 * The reflections in the vault: the violet night overhead, a magenta glow round the horizon, the
 * dark platform below and soft bright patches for the machine's neon and the stage lights.
 */
export function vaultEnv(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: ENV_FRAG,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return tex;
}

// ------------------------------------------------------------------ the platform

/** The floor's live values (the turntable's colour, a pulse rolling out). */
export interface FloorU {
  uTime: U;
  uCenter: { value: THREE.Vector2 };
  uTable: { value: THREE.Vector2 };
  uTableR: U;
  uTableCol: UV3;
  uPulse: U;
  uPulseCol: UV3;
  uRadius: U;
}

/**
 * The floating platform: a disc of glossy dark violet glass with a neon polar grid sunk in it,
 * rings of light rolling out from the turntable, the turntable glowing the colour of what's being
 * pulled, a band of chasing lights round the rim; dark metal sides studded with lights. A lit
 * material (it takes the robot's shadow and the stage's glints).
 */
export function floorMaterial(u: FloorU) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.2 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVW;\nvarying float vTop;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVW = (modelMatrix * vec4(position, 1.0)).xyz;\nvTop = normal.y;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime, uTableR, uPulse, uRadius;
        uniform vec2 uCenter, uTable;
        uniform vec3 uTableCol, uPulseCol;
        varying vec3 vVW;
        varying float vTop;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        vec2 fp = vVW.xz;
        float ft = uTime;
        vec3 fEm = vec3(0.0);
        float fRough = 0.2, fMetal = 0.2;
        if (vTop > 0.5) {
          vec2 q = fp - uCenter;
          float r = length(q);
          float a = atan(q.y, q.x);
          diffuseColor.rgb = vec3(0.025, 0.018, 0.05);
          // the grid: rings every metre, spokes every 15 degrees
          float dr = 0.5 - abs(fract(r) - 0.5);
          float ring = 1.0 - smoothstep(0.012, 0.012 + fwidth(r) * 1.5, dr);
          float sa = a * 24.0 / PI2;
          float ds = 0.5 - abs(fract(sa) - 0.5);
          float sw = 0.012 / max(r * PI2 / 24.0, 0.01);
          float spoke = 1.0 - smoothstep(sw, sw + fwidth(sa) * 1.5, ds);
          spoke *= smoothstep(1.5, 2.2, r);
          float grid = max(ring, spoke) * (1.0 - smoothstep(uRadius - 0.6, uRadius - 0.3, r));
          // (the far grid fades so it doesn't shimmer)
          grid *= 1.0 - smoothstep(14.0, 24.0, length(vVW - cameraPosition));
          vec3 gcol = mix(vec3(0.15, 0.6, 1.0), vec3(1.0, 0.25, 0.85), 0.5 + 0.5 * sin(a * 2.0 + ft * 0.4));
          fEm = gcol * grid * 0.9;
          // rings rolling out from the turntable
          float rt = length(fp - uTable);
          float wave = fract(rt * 0.22 - ft * 0.35);
          fEm += gcol * grid * smoothstep(0.85, 1.0, wave) * 1.6;
          // the burst's pulse
          float pr = uPulse * 14.0;
          fEm += uPulseCol * exp(-abs(rt - pr) * 3.0) * (1.0 - uPulse) * 2.5 * (0.4 + grid);
          // the turntable: a disc with a bright rim and segments chasing round
          float tr = rt - uTableR;
          float ta = atan(fp.y - uTable.y, fp.x - uTable.x);
          float rim = exp(-abs(tr) * 40.0) * 2.4 + exp(-abs(tr) * 8.0) * 0.4;
          float seg = smoothstep(0.3, 0.7, sin(ta * 12.0 - ft * 3.0)) * step(abs(tr + 0.12), 0.05);
          float inner = (1.0 - smoothstep(-0.02, 0.0, tr)) * 0.06;
          fEm += uTableCol * (rim + seg * 1.6 + inner);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.05, 0.09), 1.0 - smoothstep(-0.03, 0.0, tr));
          // the rim of the platform: a band of chasing lights
          float edge = r - (uRadius - 0.18);
          float chase = smoothstep(0.6, 0.9, sin(a * 60.0 + ft * 4.0));
          fEm += mix(vec3(1.0, 0.2, 0.8), vec3(0.2, 0.8, 1.0), 0.5 + 0.5 * sin(a * 3.0 - ft)) * exp(-abs(edge) * 30.0) * (1.2 + chase * 3.0);
        } else {
          // the sides: dark metal with a row of lights, fading out underneath
          float a = atan(fp.y - uCenter.y, fp.x - uCenter.x);
          diffuseColor.rgb = vec3(0.03, 0.025, 0.045);
          fMetal = 0.8;
          fRough = 0.35;
          float lamp = 1.0 - smoothstep(0.25, 0.4, length(vec2((fract(a * 40.0 / PI2) - 0.5) * 2.0, (vVW.y + 0.25) * 8.0)));
          fEm = vec3(0.4, 0.8, 1.0) * lamp * (2.0 + sin(a * 40.0 + ft * 3.0)) * 0.8;
          fEm += vec3(0.6, 0.1, 0.5) * smoothstep(-0.9, -0.1, vVW.y) * 0.08;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEm;');
  };
  m.customProgramCacheKey = () => 'vault-floor';
  return m;
}

// ------------------------------------------------------------------ a skin capsule

export interface CapsuleU {
  uTop: UV3;
  uSeam: UV3;
  uCharge: U;
  uCrack: U;
  uHalf: U;
  uLen: U;
}

export function capsuleUniforms(top: THREE.Color, len: number, seam = new THREE.Vector3(0.6, 0.75, 1), charge = 0): CapsuleU {
  return {
    uTop: { value: new THREE.Vector3(top.r, top.g, top.b) },
    uSeam: { value: seam },
    uCharge: { value: charge },
    uCrack: { value: 0 },
    uHalf: { value: 0 },
    uLen: { value: len },
  };
}

/**
 * A skin capsule: a glossy two-tone pill, its top half in the capsule's colour (an instance's own
 * colour on the pile and the drifting ones: three's vColor) and its bottom pearly white, joined at a seam that
 * glows the colour of what's inside as it charges, with cracks of light spreading over it before
 * it bursts. uHalf: 0 the whole capsule, 1 its top only, 2 its bottom only (the halves flying apart).
 */
export function capsuleMaterial(u: CapsuleU) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uTop, uSeam;
        uniform float uCharge, uCrack, uHalf, uLen;
        varying vec3 vP;
        float capHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        vec3 cp = vP;
        if ((uHalf > 0.5 && uHalf < 1.5 && cp.y < -0.004) || (uHalf > 1.5 && cp.y > 0.004)) discard;
        float cTop = step(0.0, cp.y);
        #ifdef USE_COLOR
          vec3 cTc = vColor.rgb;
        #else
          vec3 cTc = uTop;
        #endif
        vec3 cAlb = mix(vec3(0.86, 0.87, 0.92), cTc, cTop);
        float cMetal = 0.0;
        float cRough = mix(0.22, 0.12, cTop);
        float cy = cp.y / uLen;
        // the seam: a dark groove, and a ring of trim either side of it
        float cg = abs(cy);
        float groove = 1.0 - smoothstep(0.012, 0.03, cg);
        float trim = step(cg, 0.09) * (1.0 - groove);
        cAlb = mix(cAlb, vec3(0.75, 0.62, 0.3), trim * 0.8);
        cMetal = mix(cMetal, 1.0, trim);
        cRough = mix(cRough, 0.25, trim);
        cAlb *= 1.0 - groove * (1.0 - uCharge);
        diffuseColor.rgb = cAlb;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cMetal;')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 em = uSeam * groove * (0.6 + uCharge * 18.0);
          em += uSeam * exp(-cg * 12.0) * uCharge * 3.0;
          // the light leaking through the shell
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
          em += uSeam * fres * uCharge * uCharge * 3.0;
          // a little of the night's violet glow round its edge (the ones drifting in the dark)
          em += mix(vec3(0.5, 0.25, 0.9), cTc, 0.5) * fres * 0.45;
          // the emblem on the top cap: a ring lit from inside
          vec2 e = cp.xz / uLen;
          float cap = smoothstep(0.75, 0.9, cy);
          float ring = 1.0 - smoothstep(0.03, 0.06, abs(length(e) - 0.32));
          em += uSeam * ring * cap * (0.5 + uCharge * 6.0);
          // cracks of light spreading from the seam
          if (uCrack > 0.0) {
            float ang = atan(cp.z, cp.x);
            float k = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float lnv = abs(fract(ang * (1.3 + fi * 0.7) + sin(cy * (5.0 + fi * 3.0) + fi * 2.0) * 0.35 + capHash(vec2(fi, 3.0))) - 0.5);
              k = max(k, 1.0 - smoothstep(0.0, 0.035, lnv));
            }
            float reach = 1.0 - smoothstep(uCrack * 0.9, uCrack * 0.9 + 0.1, cg);
            em += uSeam * k * reach * 10.0 * uCrack;
          }
          totalEmissiveRadiance += em;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'vault-capsule';
  return m;
}

// ------------------------------------------------------------------ the glass globe

const VIEW_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mv = modelViewMatrix * p;
    vN = normalize(normalMatrix * n);
    vV = -mv.xyz;
    vP = position;
    gl_Position = projectionMatrix * mv;
  }`;

/**
 * The gumball machine's glass globe: clear, the stage's lights caught as soft bright windows on
 * it, a cool fresnel rim, and a glow inside that swells as the machine works (uGlow).
 */
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 0 }, uGlowCol: { value: new THREE.Vector3(1, 0.5, 0.9) } },
    vertexShader: VIEW_VERT,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      uniform vec3 uGlowCol;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);
        // (in the world: the softboxes hang where they hang whichever way the lens looks)
        vec3 r = (vec4(reflect(-v, n), 0.0) * viewMatrix).xyz;
        float box = smoothstep(0.9, 0.97, dot(r, normalize(vec3(-0.5, 0.7, 0.5))));
        box += smoothstep(0.93, 0.985, dot(r, normalize(vec3(0.7, 0.3, 0.6)))) * 0.7;
        vec3 refl = vec3(1.0, 0.95, 1.0) * box * 1.6 + mix(vec3(0.2, 0.1, 0.4), vec3(0.6, 0.3, 0.9), r.y * 0.5 + 0.5) * fres * 1.2;
        // a thin bright line round the silhouette
        refl += vec3(0.6, 0.85, 1.0) * smoothstep(0.85, 1.0, 1.0 - ndv) * 0.8;
        vec3 inner = uGlowCol * uGlow * (0.15 + 0.25 * ndv);
        gl_FragColor = vec4(refl + inner, clamp(0.06 + fres * 0.55 + box * 0.3 + uGlow * 0.12, 0.0, 1.0));
        ${OUT}
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

// ------------------------------------------------------------------ neon

export interface NeonOpts {
  color: THREE.Color;
  color2?: THREE.Color;
  energy?: number;
  /** A chase running round an instanced ring of bulbs: how many in its loop and how fast (0: steady). */
  count?: number;
  speed?: number;
  /** A white-hot middle (the ten-pull's lights). */
  core?: number;
}

/**
 * Light in the vault: unshaded glow (HDR). On an instanced ring (the machine's bulbs) each bulb
 * takes its turn in a chase running round them, alternating between two colours.
 */
export function neonMaterial(time: U, o: NeonOpts) {
  const c2 = o.color2 ?? o.color;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uColor: { value: new THREE.Vector3(o.color.r, o.color.g, o.color.b) },
      uColor2: { value: new THREE.Vector3(c2.r, c2.g, c2.b) },
      uEnergy: { value: o.energy ?? 3 },
      uCount: { value: o.count ?? 1 },
      uSpeed: { value: o.speed ?? 0 },
      uFlash: { value: 0 },
      uCore: { value: o.core ?? 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uCount, uSpeed;
      uniform vec3 uColor, uColor2;
      varying float vK;
      varying vec3 vCol;
      ${VIEW_VERT.replace('void main() {', `void main() {
        float i = float(gl_InstanceID);
        float ph = fract(i / uCount - uTime * uSpeed);
        vK = uSpeed > 0.0 ? 0.25 + 0.75 * smoothstep(0.55, 0.95, ph) : 1.0;
        vCol = mix(uColor, uColor2, mod(i, 2.0));`)}`,
    fragmentShader: /* glsl */ `
      uniform float uEnergy, uFlash, uCore;
      varying float vK;
      varying vec3 vCol;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(mix(vCol, vec3(1.0), uCore * pow(f, 3.0)) * uEnergy * (vK + uFlash), 1.0);
        ${OUT}
      }`,
    fog: false,
  });
}

// ------------------------------------------------------------------ light with no surface

/**
 * Light with no surface: the beam that falls on the robot at a reveal, the shock ring of a burst,
 * the glow under the platform. Additive, fading to its edges and (uFade > 0) to the top of the
 * mesh (its height uHeight), in uColor (HDR) at uAlpha.
 */
export function beamMaterial(time: U, color: THREE.Vector3, alpha = 1, fade = 1, height = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: color }, uAlpha: { value: alpha }, uFade: { value: fade }, uHeight: { value: height } },
    vertexShader: VIEW_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha, uFade, uHeight;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float up = uFade > 0.0 ? 1.0 - smoothstep(0.0, uHeight, (vP.y + uHeight * 0.5) * uFade) : 1.0;
        float flick = 0.85 + 0.15 * sin(uTime * 30.0 + vP.y * 6.0);
        gl_FragColor = vec4(uColor * uAlpha * edge * up * flick, 1.0);
        ${OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** A soft halo round a ten-pull's light: brightest through its middle, fading to nothing at its edge. */
export function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector3(1, 1, 1) }, uEnergy: { value: 1 } },
    vertexShader: VIEW_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uEnergy;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(uColor * uEnergy * pow(f, 2.5), 1.0);
        ${OUT}
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
}
