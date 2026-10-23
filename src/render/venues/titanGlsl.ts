/**
 * The Titan Colosseum's shaders (render/venues/titan.ts), ported from the Android app's
 * render/titan/*.gdshader. Everything far from the fight (stands, crowd, roof, rim) is unlit by
 * three and lit here, by the same low golden sun and sky the robots get from the key light, and
 * hazes itself (venues/kit.ts V_GLSL).
 */

/** Shared by every titan shader: the sun, the sky, the stadium's dimensions, noise. */
export const T_GLSL = /* glsl */ `
  // towards the sun (30 degrees up, over the north-west rim) and its colour in linear light
  const vec3 T_SUN_DIR = vec3(-0.5496, 0.4997, -0.6695);
  const vec3 T_SUN_COL = vec3(1.0, 0.70, 0.44) * 2.35;
  // the sky's light on an upward face and on a face turned to the horizon, and the ground's bounce
  const vec3 T_SKY_TOP = vec3(0.20, 0.27, 0.42);
  const vec3 T_SKY_SIDE = vec3(0.30, 0.27, 0.27);
  const vec3 T_BOUNCE = vec3(0.13, 0.12, 0.07);
  const float T_GROUND_Y = -0.62;
  const float T_R_IN = 21.0;
  const float T_R_RIM = 51.0;
  const float T_H_RIM = 26.6;
  const float T_R_CANOPY = 42.5;
  const float T_H_CANOPY = 26.0;

  float t_hash(float n) { return fract(sin(n) * 43758.5453); }
  float t_hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float t_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = t_hash2(i), b = t_hash2(i + vec2(1.0, 0.0));
    float c = t_hash2(i + vec2(0.0, 1.0)), d = t_hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float t_fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * t_noise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return s;
  }
  // Sunlight left at world point p by the stadium's rim (and, with canopy, its roof): the sun ray
  // from p must clear the rim (and the roof's inner edge) to reach it.
  float t_rim_light2(vec3 p, bool canopy) {
    vec2 sh = normalize(T_SUN_DIR.xz);
    float tan_el = T_SUN_DIR.y / length(T_SUN_DIR.xz);
    float b = dot(p.xz, sh);
    float c0 = dot(p.xz, p.xz);
    float t_rim = -b + sqrt(max(b * b - (c0 - T_R_RIM * T_R_RIM), 0.0));
    float lit = smoothstep(-0.9, 0.9, p.y + t_rim * tan_el - T_H_RIM);
    float dc = b * b - (c0 - T_R_CANOPY * T_R_CANOPY);
    if (canopy && dc > 0.0) {
      float t_c = -b + sqrt(dc);
      if (t_c > 0.0) lit = min(lit, smoothstep(-0.7, 0.7, p.y + t_c * tan_el - T_H_CANOPY));
    }
    return lit;
  }
  float t_rim_light(vec3 p) { return t_rim_light2(p, true); }
  // The light a matte surface with normal n gets at p: the sun (shadowed by the rim), the sky and
  // the warm bounce off the plain.
  vec3 t_light(vec3 p, vec3 n, float sun_k) {
    float ndl = max(dot(n, T_SUN_DIR), 0.0);
    vec3 sky = mix(T_SKY_SIDE, T_SKY_TOP, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 bounce = T_BOUNCE * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0);
    return T_SUN_COL * ndl * sun_k + sky + bounce;
  }
`;

/** The vertex shader most of them share: world position, normal, uv and the pattern. */
export const T_VERT = /* glsl */ `
  attribute vec2 aPat;
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec2 vPat;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vPat = aPat;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const T_VARY = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec2 vPat;
`;

/**
 * The stone and concrete (TitanBuild.bowl()): warm travertine ashlar, the podium's blind arcade,
 * paving, the tier fronts with their LED ribbons and perimeter boards, the attic's open arcade
 * against the sky, the gate blocks and their tunnels. UV = (metres along, height or radius),
 * aPat = (pattern, extra).
 */
export const STONE_FRAG = /* glsl */ `
  uniform vec3 uTeam0, uTeam1;
  ${T_VARY}
  const vec3 STONE = vec3(0.62, 0.53, 0.42);
  vec3 ashlar(vec2 q, float w, float h, out float mortar) {
    float row = floor(q.y / h);
    float x = q.x / w + row * 0.5;
    vec2 cell = vec2(floor(x), row);
    vec2 f = vec2(fract(x), fract(q.y / h));
    vec2 e = min(f, 1.0 - f) * vec2(w, h);
    mortar = 1.0 - smoothstep(0.004, 0.012, min(e.x, e.y));
    float tint = t_hash2(cell);
    vec3 c = STONE * (0.82 + 0.3 * tint) * vec3(1.0, 0.98 - 0.05 * t_hash2(cell + 3.1), 0.95);
    float streak = t_fbm(vec2(q.x * 3.0, q.y * 0.35));
    c *= 0.86 + 0.24 * streak;
    return mix(c, c * 0.55, mortar);
  }
  // the LED ribbon's picture at u (metres round the bowl) and v (0..1 up the band)
  vec3 led(float u, float v, float speed, float scale) {
    float t = uTime * speed;
    float k = fract((u * scale - t) * 0.05);
    vec3 c = mix(uTeam0, uTeam1, step(0.5, fract(u * scale * 0.01 + floor(t * 0.05))));
    float chev = fract(u * scale * 0.22 - abs(v - 0.5) * 0.9 - t * 0.6);
    c *= 0.35 + 0.9 * smoothstep(0.45, 0.55, chev) * (1.0 - smoothstep(0.85, 1.0, chev));
    c += vec3(1.0, 0.95, 0.85) * smoothstep(0.97, 1.0, k) * 1.5;
    c *= 1.0 + uHype * 0.6 + uFlash * 2.0;
    vec2 px = fract(vec2(u * scale * 6.0, v * 8.0));
    c *= 0.65 + 0.35 * step(0.25, px.x) * step(0.25, px.y);
    return c * 1.6;
  }
  void main() {
    vec3 p = vW;
    vec3 nrm = normalize(vN);
    float pat = vPat.x;
    float extra = vPat.y;
    vec2 q = vUv;
    vec3 albedo = STONE;
    vec3 glow = vec3(0.0);
    float ao = 1.0;
    float mortar = 0.0;
    if (pat < 0.5) {
      albedo = ashlar(q, 0.9, 0.45, mortar);
    } else if (pat < 1.5) {
      // the podium: a blind arcade of tall arches, a cornice, a bronze shield in every fourth arch
      albedo = ashlar(q, 0.75, 0.3, mortar);
      float bay = 2.4;
      float x = fract(q.x / bay) - 0.5;
      float y = q.y - T_GROUND_Y;
      float hw = 0.36;
      float spring = 1.15;
      float in_arch = step(abs(x) * bay, hw) * step(y, spring) + step(length(vec2(x * bay, max(y - spring, 0.0))), hw) * step(spring, y);
      in_arch *= step(0.06, y);
      float depth = smoothstep(0.0, 0.08, hw - max(abs(x * bay), length(vec2(x * bay, max(y - spring, 0.0))) * step(spring, y)));
      albedo = mix(albedo, albedo * mix(0.42, 0.25, depth), in_arch);
      float sh = length(vec2(x * bay, y - 0.9));
      if (mod(floor(q.x / bay), 4.0) == 0.0 && sh < 0.2) {
        albedo = vec3(0.45, 0.28, 0.1) * (0.7 + 0.6 * smoothstep(0.2, 0.0, sh)) * (sh > 0.16 ? 0.6 : 1.0);
        mortar = 0.0;
      }
      float top = smoothstep(1.62, 1.66, y);
      albedo = mix(albedo, STONE * 1.05, top);
      ao *= mix(1.0, 0.7, smoothstep(1.58, 1.62, y) * (1.0 - top));
      ao *= 0.75 + 0.25 * smoothstep(0.0, 0.25, y);
    } else if (pat < 2.5) {
      // paving slabs
      vec2 s = q / 0.6;
      vec2 f = fract(s);
      vec2 e = min(f, 1.0 - f) * 0.6;
      mortar = 1.0 - smoothstep(0.003, 0.009, min(e.x, e.y));
      albedo = STONE * (0.78 + 0.22 * t_hash2(floor(s))) * mix(1.0, 0.6, mortar);
      albedo *= 0.85 + 0.2 * t_fbm(q * 1.7);
    } else if (pat < 3.5) {
      // a tier's front wall: stone, with an LED ribbon round the bowl in its middle third
      albedo = ashlar(q, 0.9, 0.4, mortar);
      float wall_bottom = extra < 0.5 ? 7.35 : 14.76;
      float h = q.y - wall_bottom;
      float span = extra < 0.5 ? 1.62 : 1.51;
      float v = (h - span * 0.42) / (span * 0.3);
      if (v > 0.0 && v < 1.0) {
        albedo = vec3(0.02);
        glow = led(q.x, v, 3.0 + extra, 1.0 + extra * 0.3);
        mortar = 0.0;
      }
      ao *= mix(0.62, 1.0, smoothstep(0.0, 0.3, h));
    } else if (pat < 4.5) {
      // the attic's open arcade: arches with the sky through them, pilasters between
      float bay = 1.7;
      float x = fract(q.x / bay) - 0.5;
      float y = q.y - 21.1;
      float hw = 0.52;
      float spring = 3.3;
      float r = length(vec2(x * bay, max(y - spring, 0.0)));
      bool open = y > 0.55 && (y < spring ? abs(x * bay) < hw : r < hw);
      if (open) discard;
      albedo = ashlar(q, 0.85, 0.42, mortar);
      float edge = y < spring ? hw - abs(x * bay) : hw - r;
      ao *= mix(0.6, 1.0, smoothstep(-0.12, -0.02, edge));
      float pil = smoothstep(0.1, 0.12, abs(abs(x) - 0.5) * bay);
      albedo *= mix(1.1, 1.0, pil);
      albedo *= mix(1.0, 1.15, smoothstep(5.2, 5.3, y));
    } else if (pat < 5.5) {
      // the perimeter boards along the front of the lower tier
      float h = q.y - 1.2;
      float v = h / 0.42;
      albedo = vec3(0.025);
      glow = led(q.x * 1.6, v, 6.0, 1.4);
      glow *= 0.8 + 0.2 * step(0.08, v) * step(v, 0.92);
    } else if (pat < 6.5) {
      // a gate block: huge courses, grooves lit in the gate's corner colour, a frieze at the top
      albedo = ashlar(q, 1.2, 0.6, mortar) * 0.95;
      vec3 tc = mix(uTeam1, uTeam0, step(0.0, p.x));
      if (extra < 0.5) {
        float gx = abs(fract(q.x / 1.13 + 0.5) - 0.5) * 1.13;
        float groove = 1.0 - smoothstep(0.03, 0.05, gx);
        float above = step(3.6, q.y);
        glow += tc * groove * above * (1.2 + 0.8 * sin(q.y * 1.3 - uTime * 2.0) + uHype) * smoothstep(9.3, 8.5, q.y);
        albedo *= 1.0 - 0.5 * groove * above;
      }
      albedo *= mix(1.0, 1.25, smoothstep(8.6, 8.7, q.y));
      ao *= 0.8 + 0.2 * smoothstep(-0.6, 0.6, q.y);
    } else if (pat < 7.5) {
      // the tunnel: dark concrete, strip lights running back into the dark, a glowing far end
      albedo = vec3(0.12, 0.11, 0.1) * (0.7 + 0.3 * t_fbm(q * 2.0));
      float depth = clamp(length(p.xz) - 20.6, 0.0, 8.0) / 7.0;
      ao *= mix(0.55, 0.1, depth);
      if (extra > 1.5) {
        albedo = vec3(0.02);
        glow = mix(uTeam1, uTeam0, step(0.0, p.x)) * 0.6;
      } else if (extra < 0.5) {
        float strip = 1.0 - smoothstep(0.01, 0.025, abs(fract(q.y * 1.2) - 0.5) * 0.83);
        glow = vec3(1.0, 0.85, 0.6) * strip * step(0.5, fract(length(p.xz) * 0.8)) * 0.7;
      }
    } else {
      // plain dark concrete
      albedo = vec3(0.3, 0.27, 0.23) * (0.8 + 0.3 * t_fbm(q * 1.3));
    }
    vec3 light = t_light(p, nrm, t_rim_light(p + nrm * 0.05));
    vec3 c = albedo * light * ao + glow * uGlow * 0.62;
    gl_FragColor = vec4(haze(c, p), 1.0);
  }`;

/** The steelwork: girders, masts, stays, and the floodlight faces on the roof's front ring. */
export const STEEL_FRAG = /* glsl */ `
  ${T_VARY}
  void main() {
    vec3 p = vW;
    vec3 nrm = normalize(vN);
    vec3 albedo = vec3(0.26, 0.28, 0.31);
    vec3 glow = vec3(0.0);
    if (vPat.x > 0.5 && vPat.x < 1.5) {
      // banks of floodlights along the front ring
      float a = atan(p.z, p.x) * 42.5;
      vec2 cell = vec2(fract(a * 1.1), fract((p.y - 25.5) * 3.0));
      float lamp = step(0.12, cell.x) * step(cell.x, 0.88) * step(0.15, cell.y) * step(cell.y, 0.85);
      albedo = vec3(0.05);
      glow = vec3(1.0, 0.93, 0.8) * lamp * (2.2 + uFlash * 3.0);
    } else if (vPat.x > 1.5) {
      albedo = vec3(0.12);
    }
    // a sheen along the girders where the low sun catches them
    vec3 v = normalize(p - cameraPosition);
    float spec = pow(max(dot(reflect(v, nrm), T_SUN_DIR), 0.0), 24.0) * 0.6;
    float sun_k = t_rim_light(p + nrm * 0.1);
    vec3 c = albedo * t_light(p, nrm, sun_k) + T_SUN_COL * spec * sun_k * 0.3 + glow * uGlow * 0.62;
    gl_FragColor = vec4(haze(c, p), 1.0);
  }`;

/** The roof's membrane: a translucent sheet, glowing with the low sun through it. */
export const MEMBRANE_FRAG = /* glsl */ `
  ${T_VARY}
  void main() {
    vec3 p = vW;
    float r = length(p.xz);
    float u = fract(atan(p.z, p.x) / 6.2831853 * 96.0);
    float panel = 1.0 - pow(abs(u - 0.5) * 2.0, 3.0);
    float edge = smoothstep(42.5, 46.0, r);
    vec3 through = T_SUN_COL * 0.32 * (0.6 + 0.4 * panel);
    vec3 below = vec3(0.86, 0.82, 0.74) * (T_SKY_SIDE + T_BOUNCE * 2.0);
    vec3 c = mix(through, below, 0.35) * (0.8 + 0.2 * edge);
    c *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.03, abs(u - 0.5) - 0.47));
    gl_FragColor = vec4(haze(c, p), mix(0.78, 0.92, edge));
  }`;

/** The banners down the middle tier's front wall, rippling in the wind. */
export const BANNER_VERT = /* glsl */ `
  attribute vec2 aPat;
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec2 vPat;
  void main() {
    float down = uv.y;
    float ph = aPat.y * 1.7;
    float t = uTime;
    float sway = (sin(t * 1.3 + ph + down * 2.5) * 0.6 + sin(t * 2.9 + ph * 1.3 + down * 5.0) * 0.4) * down * down * 0.09;
    vec3 pos = position + normal * sway;
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vPat = aPat;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const BANNER_FRAG = /* glsl */ `
  uniform vec3 uTeam0, uTeam1;
  ${T_VARY}
  void main() {
    vec2 q = vUv;
    vec3 tc = vPat.x < 0.5 ? uTeam0 : uTeam1;
    vec3 c = tc * 0.55;
    // a pale chevron and a gold border; the tail cut into a swallowtail
    float chev = abs(fract(q.y * 2.2 - abs(q.x - 0.5) * 1.4) - 0.5);
    c = mix(c, vec3(0.85, 0.82, 0.75), 1.0 - smoothstep(0.08, 0.1, chev));
    float edge = min(min(q.x, 1.0 - q.x), q.y);
    c = mix(c, vec3(0.75, 0.52, 0.12), 1.0 - smoothstep(0.035, 0.05, edge));
    if (q.y > 0.88 && abs(q.x - 0.5) < (q.y - 0.88) * 3.5) discard;
    float fold = 0.8 + 0.2 * sin(q.x * 18.0 + sin(uTime * 1.3 + vPat.y) * 2.0);
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 col = c * fold * t_light(vW, n, t_rim_light(vW));
    gl_FragColor = vec4(haze(col, vW), 1.0);
  }`;

/**
 * The deck's pylons: gunmetal shafts on stone plinths, emitter rings at the energy ropes' heights
 * and a beacon cap, glowing in their side's colour.
 */
export const PYLON_FRAG = /* glsl */ `
  uniform vec3 uTeam0, uTeam1;
  uniform float uFlare;
  ${T_VARY}
  void main() {
    float h = vUv.y;
    vec3 nrm = normalize(vN);
    vec3 col = mix(uTeam1, uTeam0, smoothstep(-1.5, 1.5, vW.x));
    vec3 c;
    vec3 glow = vec3(0.0);
    float shine = 0.0;
    float hum = 0.85 + 0.15 * sin(uTime * 7.0 + h * 20.0);
    float k = (1.2 + uHype * 0.6 + uFlare * 2.0) * hum;
    if (h < 0.13) {
      c = vec3(0.55, 0.47, 0.37) * (0.8 + 0.3 * t_noise(vUv * vec2(8.0, 30.0)));
    } else if (vPat.x > 0.5) {
      // an emitter: a dark ring with a thin glowing slot round its middle, where the beam leaves
      float mid = fract(h * 10.0);
      c = vec3(0.05, 0.05, 0.06);
      shine = 0.5;
      glow = col * k * (1.0 - smoothstep(0.08, 0.16, abs(mid - 0.5))) * 1.6;
      if (h > 1.7) glow = col * k * 1.4 + vec3(0.6) * uFlare;
    } else {
      // a dark gunmetal shaft of armour plates, a glowing seam running up two of its faces
      float face = floor(vUv.x * 8.0 + 0.001);
      vec2 q = vec2(vUv.x * 8.0, h * 6.0);
      vec2 f = fract(q);
      float seam = 1.0 - smoothstep(0.015, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
      c = vec3(0.045, 0.048, 0.055) * (1.0 - 0.5 * seam) * (0.8 + 0.4 * t_hash2(floor(q)));
      shine = 0.35;
      if (mod(face, 4.0) == 0.0) {
        float strip = 1.0 - smoothstep(0.04, 0.09, abs(f.x - 0.5));
        float run = 0.6 + 0.4 * sin(h * 14.0 - uTime * 4.0);
        glow = col * k * strip * run * 0.9;
      }
    }
    vec3 v = normalize(vW - cameraPosition);
    float spec = pow(max(dot(reflect(v, nrm), T_SUN_DIR), 0.0), 18.0) * shine;
    vec3 lit = c * t_light(vW, nrm, 1.0) + T_SUN_COL * spec * 0.25;
    gl_FragColor = vec4(lit + glow * uGlow * 0.62, 1.0);
  }`;

/**
 * The energy ropes, bowed by the ring's rope physics (Arena.ropeU, as the indoor ropes): pressed
 * into a V by a titan leaning on them, swinging free after a slam. aC0 = (rope, t post to post,
 * across -1..1, ribbon), aPat = outward.
 */
export const ENERGY_VERT = /* glsl */ `
  attribute vec2 aPat;
  attribute vec4 aC0;
  uniform vec4 uRope[24];
  varying float vT;
  varying float vAcross;
  varying float vPress;
  varying float vX;
  float ropeBow(vec4 rp, float t) {
    float s = clamp(rp.x, 0.08, 0.92);
    float vee = t < s ? t / s : (1.0 - t) / (1.0 - s);
    return rp.y * mix(vee, sin(3.14159265 * t), rp.z);
  }
  void main() {
    int k = int(aC0.x + 0.5);
    float t = aC0.y;
    vec3 pos = position;
    pos.xz += aPat * ropeBow(uRope[k], t);
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vT = t;
    vX = w.x;
    vAcross = aC0.z;
    vPress = clamp(uRope[k].y * 4.0, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.25, abs(t - uRope[k].x)));
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const ENERGY_FRAG = /* glsl */ `
  uniform vec3 uTeam0, uTeam1;
  uniform float uFlare;
  varying float vT;
  varying float vAcross;
  varying float vPress;
  varying float vX;
  void main() {
    float core = exp(-vAcross * vAcross * 14.0);
    float halo = exp(-vAcross * vAcross * 3.0) * 0.3;
    float t = uTime;
    // energy racing along the beam in pulses
    float pulse = 0.7 + 0.3 * sin(vT * 40.0 - t * 9.0) * sin(vT * 13.0 + t * 3.0);
    float race = smoothstep(0.85, 1.0, sin(vT * 18.0 - t * 6.0 + vX)) * 0.6;
    // near the pylons the beam is fiercest, where it leaves the emitters
    float ends = 1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.06, min(vT, 1.0 - vT)));
    float k = (core * 1.1 + halo) * (pulse + race) * ends * (0.8 + 0.5 * uHype + uFlare * 1.5 + vPress * 3.0);
    vec3 col = mix(uTeam1, uTeam0, smoothstep(-2.5, 2.5, vX));
    vec3 c = mix(col, vec3(1.0, 0.95, 0.9), core * core * 0.25 + vPress * 0.5) * k * uGlow * 0.62;
    gl_FragColor = vec4(c, 1.0);
  }`;

/**
 * The turf (deck and plain), injected into a lit MeshStandardMaterial so the robots' shadows land
 * on it: mown in broad stripes, chalked with the arena's rings, worn and torn up where the titans
 * fight. `DECK` picks the deck's wear and chalk circle; otherwise the plain's rings.
 */
export const TURF_GLSL = /* glsl */ `
  uniform vec4 uScars[12];
  varying vec3 vTW;
  vec3 turf(vec2 xz, float dist) {
    float stripe = step(0.5, fract(xz.x / 2.2));
    vec3 c = mix(vec3(0.095, 0.2, 0.04), vec3(0.135, 0.255, 0.055), stripe);
    float big = t_fbm(xz * 0.09);
    c *= 0.82 + 0.36 * big;
    c = mix(c, vec3(0.2, 0.22, 0.07), smoothstep(0.62, 0.8, t_fbm(xz * 0.21 + 4.0)) * 0.5);
    // the grass's own grain, fading out with distance before it can shimmer
    float fine = t_noise(xz * vec2(60.0, 7.0)) * 0.5 + t_noise(xz * vec2(9.0, 70.0)) * 0.5;
    c *= mix(1.0, 0.8 + 0.4 * fine, 1.0 - smoothstep(4.0, 14.0, dist));
    return c;
  }
  vec3 turfAt(vec3 p) {
    vec2 xz = p.xz;
    vec3 c = turf(xz, length(p - cameraPosition));
    float r = length(xz);
    #ifdef DECK
      // the turf is worn to earth where the titans circle, most in the middle
      float wear = smoothstep(0.35, 0.75, t_fbm(xz * 1.3) + (1.0 - smoothstep(0.5, 4.2, r)) * 0.32);
      c = mix(c, vec3(0.16, 0.11, 0.06) * (0.8 + 0.4 * t_noise(xz * 20.0)), wear * 0.75);
      // a chalk ring round the fighting circle and the centre spot
      float ring = abs(r - 4.35);
      c = mix(c, vec3(0.75, 0.75, 0.68), (1.0 - smoothstep(0.035, 0.05, ring)) * (0.75 + 0.25 * t_noise(xz * 30.0)));
      c = mix(c, vec3(0.75, 0.75, 0.68), 1.0 - smoothstep(0.1, 0.12, r));
    #else
      // chalked rings out on the plain, and the deck's dark shadow-line in the grass
      float ring = min(abs(r - 9.0), abs(r - 15.0));
      c = mix(c, vec3(0.72, 0.72, 0.66), (1.0 - smoothstep(0.045, 0.065, ring)) * 0.9);
      float ticks = abs(fract(atan(xz.y, xz.x) / 6.2831853 * 48.0) - 0.5);
      c = mix(c, vec3(0.72, 0.72, 0.66), step(ticks, 0.012) * step(15.0, r) * step(r, 16.4) * 0.85);
      c *= 0.65 + 0.35 * smoothstep(5.3, 6.4, r);
      // the plain darkens into the podium wall's foot, and lies in the stands' shadow on the sun's side
      c *= 0.7 + 0.3 * smoothstep(21.0, 19.5, r);
      c *= mix(0.42, 1.0, t_rim_light2(p, false));
    #endif
    // scars: churned earth and cracks where a titan came down hard
    for (int i = 0; i < 12; i++) {
      vec4 s = uScars[i];
      if (s.w <= 0.0) continue;
      vec2 d = xz - s.xy;
      float l = length(d);
      if (l > s.z * 1.6) continue;
      float a = atan(d.y, d.x);
      float crack = 1.0 - smoothstep(0.0, 0.05, abs(fract(a * 1.9 + t_noise(vec2(l * 3.0, a * 2.0)) * 0.6) - 0.5) * l);
      float core = 1.0 - smoothstep(s.z * 0.45, s.z, l + t_noise(d * 6.0) * 0.2);
      vec3 earth = vec3(0.11, 0.075, 0.045) * (0.7 + 0.5 * t_noise(d * 25.0));
      c = mix(c, earth, max(core, crack * (1.0 - smoothstep(s.z * 0.6, s.z * 1.6, l)) * 0.8) * s.w);
    }
    return c;
  }
`;

/** The deck's stone kerb and wall: big pale blocks, grass stains at the foot. */
export const KERB_FRAG = /* glsl */ `
  ${T_VARY}
  void main() {
    vec3 p = vW;
    float h = vPat.y > 1.5 ? 0.42 : 0.12;
    float ang = atan(p.z, p.x);
    vec2 q = vec2(ang * 5.4, p.y);
    float row = floor(q.y / h);
    vec2 cell = vec2(floor(q.x / 0.75 + row * 0.5), row);
    vec2 f = vec2(fract(q.x / 0.75 + row * 0.5), fract(q.y / h));
    vec2 e = min(f, 1.0 - f) * vec2(0.75, h);
    float mortar = 1.0 - smoothstep(0.004, 0.01, min(e.x, e.y));
    vec3 c = vec3(0.6, 0.52, 0.41) * (0.82 + 0.3 * t_hash2(cell)) * mix(1.0, 0.55, mortar);
    c *= 0.85 + 0.25 * t_fbm(vec2(q.x * 3.0, q.y * 0.4));
    if (vPat.y > 0.5 && vPat.y < 1.5) c *= 1.12;
    c = mix(c, vec3(0.15, 0.17, 0.06), (1.0 - smoothstep(T_GROUND_Y, T_GROUND_Y + 0.12, p.y)) * 0.6);
    vec3 n = normalize(vN);
    gl_FragColor = vec4(c * t_light(p, n, 1.0), 1.0);
  }`;

/**
 * The crowd: well over a million fans in three tiers, drawn without a single triangle each. The
 * mesh is only an envelope over the stands (a cone at the fans' head height); each pixel casts its
 * view ray into the tier and steps it row by row, meeting each row's fans as a ring of upright
 * figure cards (the indoor crowd's painted atlas, posed per seat). The first figure the ray meets
 * is drawn, a gap lets the ray on to the next row, and a ray that dips under a row's seats has hit
 * the steps. So the crowd has true depth and parallax, from the field and from inside the stands.
 *
 * The fans follow the indoor crowd's uniforms (render/crowd.ts drives them): the arena's
 * excitement, each side's joy and dismay, boos and the Mexican wave.
 */
export const CROWD_VERT = /* glsl */ `
  attribute vec4 aC0;
  attribute vec4 aC1;
  flat varying vec4 vTier;
  flat varying vec2 vRows;
  varying vec3 vWorld;
  void main() {
    vTier = aC0;
    vRows = aC1.xy;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export function crowdFrag(bot0: number, bot1: number, cols: number, poses: number) {
  return /* glsl */ `
  uniform sampler2D uAtlas;
  uniform sampler2D uBounds;
  uniform float uWave, uWaveA, uExcite, uBoo;
  uniform vec2 uJoy, uDismay;
  uniform vec3 uSkin[7];
  uniform vec3 uPants[8];
  uniform vec3 uTeam0, uTeam1;
  // the crowd shot's fan (Director.crowdSeat): where they stand (xz), how far round them the fans
  // are on their feet (z) and how wildly they cheer (w)
  uniform vec4 uFanSeat;
  // most rows a ray is stepped through before it settles for what it has
  uniform int uMaxRows;
  uniform float uViewH;
  // (three declares it for the vertex stage only: the march needs the lens's focal length)
  uniform mat4 projectionMatrix;
  flat varying vec4 vTier;
  flat varying vec2 vRows;
  varying vec3 vWorld;

  const float COLS = ${cols.toFixed(1)};
  const float POSES = ${poses.toFixed(1)};
  const float SPR_W = 0.9 / 15.0;
  const float SPR_H = 2.1 / 15.0;
  const float SEAT_W = 0.5 / 15.0;
  const float SECTION = 28.0;
  const float AISLE = 2.0;
  const float CARD = 0.55;
  const float PI_ = 3.14159265;

  float cyl(vec3 c, vec3 d, float r, bool far_root) {
    float a = dot(d.xz, d.xz);
    float b = dot(c.xz, d.xz);
    float k = dot(c.xz, c.xz) - r * r;
    float disc = b * b - a * k;
    if (disc < 0.0 || a < 1e-8) return -1.0;
    float s = sqrt(disc);
    return far_root ? (-b + s) / a : (-b - s) / a;
  }

  vec4 fan(float seat, float sf, float row, float tier, float yt, vec3 q, bool back, float lod, vec3 light, float sun_side) {
    float seed = t_hash(seat * 0.1731 + row * 7.913 + tier * 131.7);
    // a few empty seats, and the stair aisles
    if (fract(seed * 91.3) < 0.035 || mod(seat, SECTION) < AISLE) return vec4(0.0);
    float exc = fract(seed * 7.13);
    // each fan backs the titan from their side of the stadium (a few sit with the other lot)
    float sup = step(q.x + (t_hash(seed * 5.3) - 0.5) * 40.0, 0.0);
    float jy = mix(uJoy.x, uJoy.y, sup);
    float dm = mix(uDismay.x, uDismay.y, sup);
    float react = clamp(jy - fract(seed * 13.37) * 0.9, 0.0, 1.0);
    float upset = clamp(dm - fract(seed * 29.11) * 0.9, 0.0, 1.0);
    float e = uExcite * (0.6 + 0.8 * exc);
    // the fans round the crowd shot's lens are up on their feet, arms in the air
    float near = uFanSeat.w * (1.0 - smoothstep(uFanSeat.z * 0.4, uFanSeat.z, distance(q.xz, uFanSeat.xy)));
    e += near;
    react = max(react, near * (0.4 + 0.6 * fract(seed * 3.9)));
    float ang = atan(q.z, q.x);
    float da = abs(mod(ang - uWaveA + PI_, 2.0 * PI_) - PI_);
    float wv = uWave * smoothstep(0.3, 0.0, da);
    float stand_t = mix(0.78, 0.32, exc);
    float stand = smoothstep(stand_t - 0.1, stand_t + 0.1, e + react * 1.5 + upset * 0.8 + wv);
    float t_ = uTime;
    float r = t_hash(floor(t_ * (0.5 + exc * 0.7) + seed * 13.0) * 1.37 + seed * 91.7);
    float clap = 1.0 + step(0.5, fract(t_ * (3.2 + exc) + seed * 5.0));
    float pose;
    if (upset > 0.04 && upset >= react) pose = 5.0;
    else if (react > 0.04) pose = r < 0.6 ? 4.0 : 3.0;
    else if (uBoo > fract(seed * 3.71) * 2.2) pose = 6.0;
    else if (e < 0.25) pose = r < 0.88 ? 0.0 : clap;
    else if (e < 0.55) pose = r < 0.45 ? 0.0 : r < 0.85 ? clap : 3.0;
    else if (e < 0.85) pose = r < 0.15 ? 0.0 : r < 0.55 ? clap : r < 0.8 ? 3.0 : 4.0;
    else pose = r < 0.1 ? clap : r < 0.45 ? 3.0 : 4.0;
    if (stand < 0.5 && pose == 4.0) pose = clap;
    if (wv > 0.45) pose = 4.0;
    float t = t_ * (5.0 + exc * 3.0) + seed * 20.0;
    float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
    float lift = (-0.46 * (1.0 - stand) + hop * stand + wv * 0.28) / 15.0;

    float s = 0.86 + 0.16 * t_hash(seed * 17.1);
    float col = floor(t_hash(seed * 3.3) * 30.0);
    float flip = t_hash(seed * 8.1) < 0.5 ? -1.0 : 1.0;
    float sway = sin(t_ * (0.9 + exc) + seed * 30.0) * (0.012 + 0.03 * min(e + react, 1.0)) / 15.0;
    float gy = (q.y - yt - lift) / (SPR_H * s);
    float gx = ((sf - seat - 0.5) * SEAT_W - sway * gy) / (SPR_W * s);
    if (back) flip = -flip;
    float lx = gx * flip + 0.5;

    // now and then a fan waves a flag in their side's colours over the heads
    if (fract(seed * 61.7) < 0.022 && stand > 0.3) {
      float fx = gx * 0.9 - 0.15;
      float fy = gy - 0.95 - abs(sin(t * 0.4)) * 0.05;
      float wv2 = sin(fx * 9.0 - t_ * 7.0 + seed) * 0.06;
      if (fx > -0.05 && fx < 1.2 && fy - wv2 > 0.0 && fy - wv2 < 0.55) {
        vec3 fc = mix(uTeam0, uTeam1, sup) * (0.75 + 0.25 * sin(fx * 9.0 - t_ * 7.0 + seed + 1.0));
        return vec4(fc * light * 0.9, 1.0);
      }
    }
    if (lx < 0.0 || lx > 1.0 || gy < 0.0 || gy > 1.0) return vec4(0.0);
    vec4 bb = texelFetch(uBounds, ivec2(int(col + 0.5), int(pose + 0.5)), 0);
    if (lx < bb.x || lx > bb.y || gy < bb.z || gy > bb.w) return vec4(0.0);
    vec2 auv = vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES);
    vec4 tex = textureLod(uAtlas, auv, lod);
    float a = lod < 0.8 ? smoothstep(0.35, 0.65, tex.a) : tex.a;
    if (a < 0.02) return vec4(0.0);

    // their colours: half wear their side's colour, the rest whatever they came in
    float pick = t_hash(seed * 23.9);
    vec3 shirt;
    if (pick < 0.46) shirt = mix(uTeam0, uTeam1, sup) * (0.35 + 0.4 * t_hash(seed * 4.4));
    else {
      float p2 = t_hash(seed * 31.3);
      shirt = p2 < 0.22 ? vec3(0.62) : p2 < 0.5 ? vec3(0.03) : p2 < 0.6 ? vec3(0.42, 0.05, 0.04)
        : p2 < 0.7 ? vec3(0.6, 0.42, 0.06) : p2 < 0.8 ? vec3(0.05, 0.18, 0.07) : vec3(0.12, 0.14, 0.2);
    }
    vec3 hair = vec3(0.04, 0.025, 0.015) * (0.6 + 1.4 * t_hash(seed * 9.7));
    if (t_hash(seed * 12.1) < 0.15) hair = vec3(0.45, 0.32, 0.12);
    vec3 sk = uSkin[int(t_hash(seed * 2.9) * 6.99)];
    vec3 pa = uPants[int(t_hash(seed * 6.1) * 7.99)];
    vec3 accent = mix(uTeam0, uTeam1, 1.0 - sup);
    bool bot = col > ${(bot0 - 0.5).toFixed(1)} && col < ${(bot1 - 0.5).toFixed(1)};
    // seen from behind: no faces, just the backs of heads
    if (back && gy > 0.72 && !bot) sk = hair;

    vec3 c = mix(gy > 0.60 ? hair : pa, shirt, tex.g);
    c = mix(c, bot ? hair * 2.0 + 0.2 : sk, tex.b * (1.0 - smoothstep(0.5, 0.95, tex.g)));
    c = mix(c, accent, smoothstep(0.5, 0.95, min(tex.g, tex.b)));
    // the drawn shading, the side the sun is on, and the row in front shading legs and bellies
    // (a sign held up seen from behind is its plain board: no lettering)
    float shade = back && gy > 0.68 ? textureLod(uAtlas, auv, lod + 3.5).r : tex.r;
    c *= shade * mix(0.45, 1.0, smoothstep(0.25, 0.62, gy));
    vec3 lit = light * (1.0 + 0.35 * sun_side * gx * flip);
    c *= lit * (0.82 + 0.3 * t_hash(seed * 31.7));
    if (back && lod < 2.0) {
      // close up from behind, a fan stands against the bright plain: their edges catch its light
      float ea = textureLod(uAtlas, auv, lod + 2.5).a;
      float rim = 1.0 - smoothstep(0.3, 0.75, ea);
      c = c * 1.5 + rim * (T_SUN_COL * 0.05 + vec3(0.04, 0.06, 0.025));
    }
    // phone cameras going off at the big moments
    float flash = step(0.9996 - uFlash * 0.004 - e * 0.0004, t_hash(seed * 77.7 + floor(t_ * 9.0) * 0.311));
    if (!back && gy > 0.6 && gy < 0.85) c += vec3(1.5, 1.45, 1.35) * flash;
    return vec4(c, a);
  }

  // The crowd from far off, where a fan is a pixel or less: what a pixel's patch of the row
  // averages to (soft blotches, whole patches in one side's colours, the aisles, a faint grain).
  vec4 crowd_far(float sf, float row, float tier, vec3 q, float w, vec3 light) {
    float sec = floor(sf / SECTION);
    float sup = step(q.x + (t_noise(vec2(sec * 0.61, tier * 3.1)) - 0.5) * 34.0, 0.0);
    vec3 team = mix(uTeam0, uTeam1, sup);
    vec2 cell = vec2(sf / 4.0, row / 1.5);
    float detail = smoothstep(0.6, 2.5, 4.0 / w);
    float n = mix(0.5, t_noise(cell + tier * 17.0), detail);
    float patch_ = t_noise(vec2(sf / 22.0, row / 6.0) + tier * 5.3 + 40.0);
    vec3 neutral = mix(vec3(0.035, 0.032, 0.034), vec3(0.3, 0.28, 0.26), n);
    float tk = smoothstep(0.35, 0.75, patch_) * 0.75 + 0.2;
    vec3 c = mix(neutral, team * (0.28 + 0.2 * n), tk * 0.55);
    c = mix(c, vec3(0.36, 0.22, 0.15), 0.16);
    float g = t_hash2(floor(vec2(sf, row * 3.0)));
    c *= 1.0 + (g - 0.5) * 0.3 * smoothstep(0.3, 1.0, 1.0 / w);
    vec4 f = vec4(c * light, 0.85);
    float m = mod(sf, SECTION);
    float ais = clamp((min(m + w * 0.5, AISLE) - max(m - w * 0.5, 0.0)) / w, 0.0, 1.0)
      + clamp((min(m + w * 0.5, SECTION + AISLE) - max(m - w * 0.5, SECTION)) / w, 0.0, 1.0);
    ais = clamp(ais, 0.0, 1.0);
    return mix(f, vec4(vec3(0.5, 0.43, 0.34) * light * 0.75, 1.0), ais);
  }

  // The vomitories: every other section, a tunnel mouth 14 seats wide opens into the middle of
  // each tier, under a parapet. 1 when the seat and row are in one (and where its roof is).
  float vomitory(float seat, float row, float rows, out float roof_row) {
    float v0 = floor(rows * 0.42);
    roof_row = v0 + 9.0;
    float sec = floor(seat / SECTION);
    float m = mod(seat, SECTION);
    if (mod(sec, 2.0) != 1.0 || m < 7.0 || m >= 21.0) return 0.0;
    return step(v0, row) * step(row, roof_row - 0.5);
  }

  void main() {
    vec3 cam = cameraPosition;
    vec3 p = vWorld;
    vec3 d = normalize(p - cam);
    float r0 = vTier.x, dep = vTier.y, y0 = vTier.z, rise = vTier.w;
    float rows = vRows.x, tier = vRows.y;
    float r_back = r0 + rows * dep;

    // start just before the envelope, or at the lens when it is in among the fans itself
    float cr = length(cam.xz);
    float t0 = max(0.0, length(p - cam) - 0.03);
    if (cr > r0 && cr < r_back && cam.y < y0 + (cr - r0) / dep * rise + 0.14 && length(p - cam) < 1.5) t0 = 0.0;
    vec3 s = cam + d * t0;
    float rs = length(s.xz);
    bool outward = dot(s.xz, d.xz) >= 0.0;
    float j = floor((rs - r0) / dep);
    if (outward) {
      if (rs > r0 + (j + CARD) * dep) j += 1.0;
    } else if (rs < r0 + (j + CARD) * dep) j -= 1.0;

    // the atlas mip: a screen pixel's size at this distance over one texel of a figure
    float pix = 2.0 / (projectionMatrix[1][1] * uViewH);
    float texel = SPR_H / (float(textureSize(uAtlas, 0).y) / POSES);

    vec3 acc = vec3(0.0);
    float acc_a = 0.0;
    vec3 hit = vec3(0.0);
    bool step_hit = false;
    vec3 last_q = p;
    int busy = 0;
    for (int it = 0; it < 192; it++) {
      if (j < 0.0 || j >= rows || busy >= uMaxRows) break;
      float rc = r0 + (j + CARD) * dep;
      float tc = cyl(cam, d, rc, outward);
      if (tc < t0 - 0.05) {
        // (a ray only grazing this row's circle turns back out)
        if (!outward) { outward = true; continue; }
        break;
      }
      vec3 q = cam + d * tc;
      last_q = q;
      float yt = y0 + j * rise;
      float ang = atan(q.z, q.x);
      float seats = floor(2.0 * PI_ * rc / SEAT_W);
      float sf = (ang / (2.0 * PI_) + 0.5) * seats;
      float si = floor(sf);
      float roof_row;
      if (vomitory(si, j, rows, roof_row) > 0.5) {
        // a tunnel mouth: dark under its roof, its parapet's lip on top
        float roof_y = y0 + roof_row * rise;
        if (q.y < roof_y + 0.012) {
          float sun_v = t_rim_light(q);
          float mm = mod(sf, SECTION);
          float edge = min(mm - 7.0, 21.0 - mm);
          vec3 st = vec3(0.5, 0.43, 0.34) * t_light(q, vec3(0.0, 0.3, 0.0) - normalize(vec3(q.x, 0.0, q.z)), sun_v);
          vec3 vc = q.y > roof_y - 0.006 || edge < 0.35 ? st * 0.8 : vec3(0.012, 0.011, 0.012) + st * 0.03 * (1.0 - (roof_y - q.y) / 0.2);
          acc += (1.0 - acc_a) * vc;
          acc_a = 1.0;
          break;
        }
        j += outward ? 1.0 : -1.0;
        continue;
      }
      if (q.y > yt + 0.2) {
        j += outward ? 1.0 : -1.0;
        continue;
      }
      busy++;
      if (q.y < yt) {
        step_hit = true;
        float ty = abs(d.y) > 1e-4 ? (yt - cam.y) / d.y : tc;
        hit = cam + d * clamp(ty, t0, tc);
        break;
      }
      float lod = max(0.0, log2(max(tc * pix / texel, 1e-4)));
      vec3 radial = vec3(q.x, 0.0, q.z) / max(rc, 1e-3);
      float sun_k = t_rim_light(q + vec3(0.0, 0.08, 0.0));
      vec3 n = outward ? -radial : radial;
      vec3 light = t_light(q, normalize(n + vec3(0.0, 0.35, 0.0)), sun_k);
      float side = dot(vec2(-radial.z, radial.x), normalize(T_SUN_DIR.xz)) * sun_k;
      // from a few pixels down, the pixel shows what the patch of crowd it covers averages to
      float fan_px = SPR_H / max(tc * pix, 1e-6);
      float kf = 1.0 - smoothstep(2.5, 6.0, fan_px);
      vec4 f = vec4(0.0);
      if (kf < 0.999) {
        f = fan(si, sf, j, tier, yt, q, !outward, lod, light, side);
        // a fan's raised arm reaches into the next seat's
        float nb = fract(sf) < 0.5 ? si - 1.0 : si + 1.0;
        if (f.a < 0.99) {
          vec4 g = fan(nb, sf, j, tier, yt, q, !outward, lod, light, side);
          f = f.a >= g.a ? f : g;
        }
      }
      if (kf > 0.001) {
        float w = max(tc * pix / SEAT_W, 1e-3);
        f = mix(f, crowd_far(sf, j, tier, q, w, light), kf);
      }
      acc += (1.0 - acc_a) * f.a * f.rgb;
      acc_a += (1.0 - acc_a) * f.a;
      if (acc_a > 0.97) break;
      j += outward ? 1.0 : -1.0;
    }
    // a ray that left the tier without meeting enough of anyone goes on to what is beyond
    bool exited = !step_hit && (j < 0.0 || j >= rows);
    if (exited && acc_a < 0.5) discard;
    vec3 bg;
    if (exited) {
      bg = acc / max(acc_a, 1e-3);
    } else if (step_hit || acc_a < 0.97) {
      // the steps: seat rows in the tier's colour, the risers in stone, the aisles' stairs
      vec3 h = step_hit ? hit : last_q;
      float hr = length(h.xz);
      float rr = (hr - r0) / dep;
      float fr = fract(rr);
      float ang = atan(h.z, h.x);
      float seat = (ang / (2.0 * PI_) + 0.5) * floor(2.0 * PI_ * hr / SEAT_W);
      bool aisle = mod(seat, SECTION) < AISLE;
      vec3 seat_c = tier < 0.5 ? vec3(0.32, 0.045, 0.035) : tier < 1.5 ? vec3(0.62, 0.52, 0.38) : vec3(0.07, 0.11, 0.2);
      vec3 stone = vec3(0.55, 0.47, 0.37);
      vec3 base = aisle ? stone * (fr < 0.5 ? 1.0 : 0.82) : mix(stone * 0.7, seat_c, smoothstep(0.15, 0.3, fr) * (1.0 - smoothstep(0.85, 0.95, fr)));
      vec3 nrm = fr > 0.9 ? -normalize(vec3(h.x, 0.0, h.z)) : vec3(0.0, 1.0, 0.0);
      bg = base * t_light(h, nrm, t_rim_light(h)) * 0.8;
    } else {
      bg = vec3(0.0);
    }
    vec3 c = acc + (1.0 - acc_a) * bg;
    gl_FragColor = vec4(haze(c, p), 1.0);
  }`;
}
