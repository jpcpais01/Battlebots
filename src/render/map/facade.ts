import { CITY_Y } from './layout';
import { AA_GLSL, MAP_GLSL, MAP_OUT } from './kit';

/**
 * What the city's facades share (the buildings' material in city.ts, and the vehicles' glass): the
 * rooms seen through the windows (interior mapping: a box room behind every window, walls, floor,
 * ceiling and a bit of furniture, so the inside moves with the view as a real room does), which
 * rooms have their lights on (and the odd one switching on or off as the minutes pass), the lamps'
 * colours, and the glass in front (the sky and the street reflected, per pane). Needs MAP_GLSL
 * first. The same GLSL as the Android app's map_facade.gdshaderinc.
 */
export const FACADE_GLSL = /* glsl */ `
  // lamp colours: warm bulbs, neutral, cool office panels, a television's blue
  const vec3 LAMP_WARM = vec3(1.0, 0.68, 0.4);
  const vec3 LAMP_SOFT = vec3(1.0, 0.84, 0.64);
  const vec3 LAMP_COOL = vec3(0.78, 0.9, 1.0);
  const vec3 LAMP_TV = vec3(0.45, 0.62, 1.0);

  // is the light on in room 'id': 'share' of them are; a quarter of the rooms change their mind
  // every minute or few (so the city lives a little as you watch)
  float facadeOn(vec2 id, float seed, float share) {
    float h = hash12(id * 5.1 + seed * 13.0);
    float epoch = h < 0.25 ? floor(uTime / (45.0 + 220.0 * hash12(id * 2.3 + seed)) + hash12(id * 1.3)) : 0.0;
    return step(hash12(id + seed * 917.0 + epoch * 17.0), share);
  }

  // a room's lamp: offices mostly cool panels, homes mostly warm bulbs, the odd television
  vec3 facadeLamp(float h, float office) {
    if (office > 0.5) return h < 0.55 ? LAMP_COOL : h < 0.85 ? LAMP_SOFT : LAMP_WARM;
    if (h > 0.9) return LAMP_TV * (0.7 + 0.3 * sin(uTime * 7.0 + h * 90.0) * sin(uTime * 3.1 + h * 40.0));
    return h < 0.6 ? LAMP_WARM : h < 0.85 ? LAMP_SOFT : LAMP_COOL;
  }

  // The room behind a window, as the view ray meets it (interior mapping). p: where the ray goes
  // through the glass, metres from the room's floor at its left wall; rs: the room's width and
  // height (floor to ceiling); d: the ray in the facade's frame (x across, y up, z in); depth: how
  // deep the room is; rh: the room's own random number; on/lamp: its light; day: the daylight that
  // comes in through the window. Returns the light coming back out (linear radiance).
  vec3 facadeRoom(vec2 p, vec2 rs, vec3 d, float depth, float rh, float on, vec3 lamp, vec3 day) {
    d.z = max(d.z, 0.06);
    float dx = sign(d.x) * max(abs(d.x), 1e-4), dy = sign(d.y) * max(abs(d.y), 1e-4);
    float tx = ((d.x > 0.0 ? rs.x : 0.0) - p.x) / dx;
    float ty = ((d.y > 0.0 ? rs.y : 0.0) - p.y) / dy;
    float tz = depth / d.z;
    float t = min(min(tx, ty), tz);
    vec3 h = vec3(p, 0.0) + d * t;
    float r1 = fract(rh * 7.13), r2 = fract(rh * 13.7), r3 = fract(rh * 3.31);
    vec3 wall = r1 < 0.4 ? vec3(0.78, 0.75, 0.68) : r1 < 0.7 ? vec3(0.66, 0.69, 0.72) : r1 < 0.9 ? vec3(0.8, 0.7, 0.56) : vec3(0.55, 0.62, 0.55);
    vec3 col;
    if (t == tz) {
      col = wall;
      // against the back wall: desks or a sofa (a low dark band), a tall cupboard or shelves
      float fx = h.x / rs.x;
      float low = step(h.y, 0.7 + 0.25 * r2) * step(abs(fx - (0.3 + 0.4 * r3)), 0.18 + 0.2 * r1);
      float tall = step(h.y, 1.95) * step(abs(fx - fract(r3 + 0.45)), 0.07 + 0.06 * r2) * step(0.45, r2);
      // a picture, or a screen on the wall
      float pic = step(abs(h.y - 1.55), 0.28) * step(abs(fx - fract(r1 + 0.3)), 0.1) * step(r3, 0.6);
      col = mix(col, r2 < 0.5 ? vec3(0.22, 0.15, 0.1) : vec3(0.16, 0.17, 0.2), max(low, tall));
      col = mix(col, r1 < 0.5 ? vec3(0.2, 0.32, 0.45) : vec3(0.55, 0.3, 0.2), pic * (1.0 - max(low, tall)));
    } else if (t == ty) {
      // the ceiling, or the floor (boards or carpet)
      col = d.y > 0.0 ? vec3(0.85, 0.84, 0.8) : r3 < 0.5 ? vec3(0.36, 0.24, 0.15) : vec3(0.3, 0.3, 0.33);
    } else {
      // a side wall, with a doorway in some
      col = wall * 0.85;
      col *= 1.0 - 0.45 * step(h.y, 2.1) * step(abs(h.z - depth * 0.6), 0.45) * step(0.5, r2);
    }
    // lit by its lamp (a panel in the middle of the ceiling) and by the daylight from the window,
    // which fades towards the back of the room
    vec3 lc = vec3(rs.x * 0.5, rs.y, depth * 0.45);
    vec3 dl = h - lc;
    float k = 1.0 / (1.0 + 0.16 * dot(dl, dl));
    vec3 c = col * (lamp * on * (0.25 + 1.1 * k) + day * (1.0 - 0.75 * h.z / depth));
    // the lamp itself, on the ceiling
    if (t == ty && d.y > 0.0) c += lamp * on * 1.6 * smoothstep(1.0, 0.4, length(dl.xz / vec2(rs.x * 0.3, depth * 0.22)));
    return c;
  }

  // the glass's reflection along r: the sky above the horizon; below it the city across the
  // street, its facades a patchwork of lit and shaded glass and stone (darker at night, its
  // windows lit)
  vec3 facadeSky(vec3 r) {
    vec4 nz = texture(uNoise, r.xz * 1.7 + r.y * 0.9);
    vec4 nw = texture(uNoise, r.xz * 9.0 + r.y * 4.0);
    vec3 city = mix(vec3(0.1, 0.11, 0.13), vec3(0.3, 0.29, 0.27), nz.r) * (1.0 - 0.92 * uNight) + vec3(1.0, 0.72, 0.45) * smoothstep(0.8, 0.86, nw.g) * 0.3 * uNight;
    return mix(city, skyCol(r), smoothstep(-0.1, 0.05, r.y));
  }

  // how much a pane reflects at view angle cosine 'cv', for glass reflecting 'f0' head on (Schlick)
  float facadeFresnel(float cv, float f0) {
    float m = 1.0 - clamp(cv, 0.0, 1.0);
    float m2 = m * m;
    return f0 + (1.0 - f0) * m2 * m2 * m;
  }
`;

/**
 * The buildings' fragment shader (city.ts buildingMaterial; the varyings are its vertex shader's).
 * Real facades are mostly depth and glass: every window here is set back into the wall (its jambs
 * and head seen at an angle, the sun's shadow cast across it), glazed with panes that each reflect
 * the sky a little differently, and has a room behind it, lit by day from the window and at night
 * by its own lamp. Flats get balconies with their shadows under them, old brick gets stone sills,
 * lintels and fire escapes, tall buildings shopfronts or a lobby at street level, and everything
 * weathers: streaks down from the roof and under the sills, grime at the foot. Roofs get membranes
 * with seams, drains, solar panels (roof 3 + s: over the first s of its width) and the parapet's
 * shadow. MAP_LITE (low quality) leaves out the rooms. As the Android app's building.gdshader.
 */
export const BUILDING_FRAG = /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${FACADE_GLSL}
      uniform vec3 uNeon[5];
      varying vec3 vWorld, vN, vCol;
      varying vec2 vFace;
      // (per building and per face: flat, so the window hashes see exactly the same numbers
      // across a face; interpolated, they drift in the last bits and windows sparkle)
      flat varying vec3 vSize;
      flat varying vec4 vInfo;
      flat varying float vNeon, vFaceW, vFaceId;
      #include <fog_pars_fragment>

      // a fire escape on old brick (f: on the face, metres): a landing under the windows of two bays
      // on every floor above the shops, its railing, the stairs zigzagging between the landings and
      // a drop ladder under the first
      float fireEscape(vec2 f, float x0, float x1, float fh, float sill, float top, vec2 px) {
        if (f.x < x0 - 0.3 || f.x > x1 + 0.3 || f.y > top) return 0.0;
        float base = sill - 0.2;
        float fl = floor((f.y - base) / fh);
        float y = f.y - (fl * fh + base);
        float onX = fband(f.x, x0, x1, px.x);
        float m = 0.0;
        if (fl >= 1.0) {
          m = fband(y, 0.0, 0.14, px.y) * onX;
          m = max(m, fband(y, 0.95, 1.02, px.y) * onX);
          m = max(m, 0.3 * fband(y, 0.14, 0.95, px.y) * onX);
          if ((fl + 1.0) * fh + base < top) {
            float sx = mod(fl, 2.0) < 1.0 ? mix(x0 + 0.3, x1 - 0.3, y / fh) : mix(x1 - 0.3, x0 + 0.3, y / fh);
            m = max(m, fband(f.x - sx, -0.07, 0.07, px.x + px.y * (x1 - x0) / fh));
          }
        } else if (fl >= 0.0) {
          float lad = fband(f.x, x1 - 0.65, x1 - 0.6, px.x) + fband(f.x, x1 - 0.25, x1 - 0.2, px.x) + fband(f.x, x1 - 0.65, x1 - 0.2, px.x) * fpulse(y / 0.3, 0.2, px.y / 0.3);
          m = clamp(lad, 0.0, 1.0) * step(fh - 2.2, y);
        }
        return m;
      }

      void main() {
        vec3 n = normalize(vN);
        vec3 w = vWorld;
        float style = vInfo.x, seed = vInfo.y, lit = vInfo.z, roof = vInfo.w;
        vec2 f = vFace;
        vec2 px = max(fwidth(f), vec2(1e-3));
        vec4 nz = texture(uNoise, (w.xz + w.y) / 23.0);
        vec3 V = normalize((cameraPosition - uMapShift) - w);
        vec3 alb = vCol * (0.93 + 0.12 * nz.r);
        vec3 emit = vec3(0.0);
        // how much of the sun this point gets past near things (balconies, reveals, the parapet)
        float sunK = 1.0;
        // the windows: their light (already lit, not multiplied by the light below) and how much of
        // the pixel they cover
        vec3 winC = vec3(0.0);
        float win = 0.0;
        float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
        vec3 neonCol = vNeon >= 0.0 ? uNeon[int(vNeon + 0.5)] : vec3(0.0);
        float street = step(abs((w.y - f.y) - ${CITY_Y.toFixed(2)}), 0.4);

        if (n.y > 0.5) {
          // ================================================================ roofs
          vec2 e = min(f, vSize.xz - f);
          float edge = min(e.x, e.y);
          float pl = length(px);
          vec4 nr = texture(uNoise, w.xz / 9.0 + seed * 7.0);
          float h1 = fract(seed * 91.7);
          vec3 r;
          if (style > 4.5) {
            // rooftop kit: grey metal, a fan grille turning in the top of the small ones
            r = vec3(0.56, 0.57, 0.56) * (0.9 + 0.15 * nr.r);
            vec2 c = f - vSize.xz * 0.5;
            float fr = min(vSize.x, vSize.z) * 0.36;
            if (fr < 1.6) {
              float d = length(c);
              float a = atan(c.y, c.x) + uTime * (5.0 + 4.0 * h1);
              float blades = 0.5 + 0.5 * sin(a * 4.0);
              r = mix(r, vec3(0.08), fband(d, 0.0, fr, pl) * mix(0.55, 0.9, blades * step(0.25 * fr, d)));
              r = mix(r, vec3(0.7), fband(d, fr - 0.06, fr, pl));
            } else {
              r *= 1.0 - 0.25 * fpulse(f.x / 0.45, 0.4, px.x / 0.45) * fband(e.y, 0.4, 1e4, px.y);
            }
          } else if (style > 3.5) {
            // sheds: corrugated sheet, translucent roof lights in strips, rust round the fixings
            vec2 rib = vSize.x > vSize.z ? f.yx : f;
            r = alb * 0.9 * (0.86 + 0.14 * fpulse(rib.x / 0.9, 0.5, px.x / 0.9));
            r = mix(r, vec3(0.82, 0.84, 0.8) * (1.0 + 0.6 * night), fband(mod(rib.y, 7.0), 3.0, 4.2, px.y) * fband(rib.x, 1.5, (vSize.x > vSize.z ? vSize.z : vSize.x) - 1.5, px.x));
            r = mix(r, vec3(0.36, 0.2, 0.11), 0.5 * smoothstep(0.62, 0.8, nr.g));
            emit += vec3(1.0, 0.86, 0.6) * fband(mod(rib.y, 7.0), 3.0, 4.2, px.y) * night * 0.25 * step(0.5, lit);
          } else if (roof > 0.5 && roof < 1.5) {
            // a roof garden: lawn, clipped shrubs in planters, a paved path and a timber deck
            r = mix(vec3(0.24, 0.42, 0.13), vec3(0.4, 0.54, 0.18), nz.a) * (0.8 + 0.3 * nr.r);
            float shrub = smoothstep(0.5, 0.62, texture(uNoise, w.xz / 3.5).g);
            r = mix(r, vec3(0.12, 0.25, 0.08) * (0.8 + 0.4 * nr.b), shrub * fband(edge, 1.0, 3.2, pl));
            vec2 c = abs(f - vSize.xz * 0.5);
            r = mix(r, vec3(0.62, 0.6, 0.55), fband(min(c.x, c.y), 0.0, 0.8, pl) * fband(edge, 2.0, 1e4, pl));
            float deck = fband(c.x, 0.0, vSize.x * 0.22, px.x) * fband(c.y, 0.0, vSize.y * 0.18, px.y) * step(80.0, vSize.x * vSize.z);
            r = mix(r, vec3(0.45, 0.31, 0.2) * (0.88 + 0.12 * fpulse(f.x / 0.3, 0.85, px.x / 0.3)), deck);
          } else if (roof > 1.5 && roof < 2.5) {
            // a helipad: dark deck, the H and the touchdown ring, lit at night
            r = vec3(0.2, 0.21, 0.23);
            vec2 c = f - vSize.xz * 0.5;
            float d = length(c);
            float rr = min(vSize.x, vSize.z) * 0.32;
            float ring = fband(d, rr - 0.7, rr, pl);
            float hh = fband(abs(c.x), rr * 0.25, rr * 0.38, px.x) * fband(abs(c.y), 0.0, rr * 0.5, px.y) + fband(abs(c.y), 0.0, 0.35, px.y) * fband(abs(c.x), 0.0, rr * 0.3, px.x);
            r = mix(r, vec3(0.95, 0.75, 0.2), max(ring, hh));
            emit += vec3(1.0, 0.6, 0.25) * ring * uDusk * 0.6;
          } else {
            // a flat roof: membrane in long sheets with welded seams, a few shades of patching,
            // dark stains where water stands, drains; white "cool roofs" and gravel on some
            float kind = fract(seed * 37.3);
            vec3 base = kind < 0.35 ? vec3(0.5, 0.5, 0.49) : kind < 0.55 ? vec3(0.72, 0.73, 0.71) : kind < 0.75 ? vec3(0.22, 0.22, 0.23) : vec3(0.48, 0.46, 0.43);
            r = base * (0.88 + 0.2 * nr.r);
            vec2 sh = vSize.x > vSize.z ? f.yx : f;
            float shp = vSize.x > vSize.z ? px.y : px.x;
            if (kind < 0.75) r *= 1.0 + 0.1 * fpulse(sh.x / 1.5, 0.05, shp / 1.5) - 0.05 * step(0.5, hash12(vec2(floor(sh.x / 1.5), seed)));
            else r *= 0.85 + 0.25 * texture(uNoise, w.xz / 1.3).r;
            r *= 1.0 - 0.3 * smoothstep(0.58, 0.75, texture(uNoise, w.xz / 14.0 + seed).b);
            // drains: little dark grates a quarter of the way in
            vec2 dq = abs(f - vSize.xz * vec2(0.25, 0.5));
            vec2 dq2 = abs(f - vSize.xz * vec2(0.75, 0.5));
            r = mix(r, vec3(0.06), max(fband(max(dq.x, dq.y), 0.0, 0.25, pl), fband(max(dq2.x, dq2.y), 0.0, 0.25, pl)) * step(10.0, vSize.x));
            // solar panels over part of it: rows of dark blue cells in silver frames, tilted
            // towards the sun (lighter along their high edge), the gap behind each row shaded
            if (roof > 2.5) {
              float x1 = 1.8 + (vSize.x - 3.6) * (roof - 3.0);
              float inPv = fband(f.x, 1.8, x1, px.x) * fband(f.y, 1.8, vSize.z - 1.8, px.y);
              float row = mod(f.y - 1.8, 2.9);
              float panel = fband(row, 0.0, 2.0, px.y) * fpulse(f.x / 1.05, 0.96, px.x / 1.05);
              vec3 pv = vec3(0.03, 0.05, 0.11) * (1.0 + 0.6 * row / 2.0);
              pv *= 1.0 - 0.3 * fpulse(f.x / 0.175, 0.08, px.x / 0.175) * smoothstep(0.08, 0.02, px.x);
              vec3 pn = normalize(vec3(0.0, 0.94, -0.34));
              vec3 rr2 = reflect(-V, pn);
              float F = facadeFresnel(dot(V, pn), 0.05);
              pv += facadeSky(rr2) * F * 0.6 + uSunCol * pow(max(dot(rr2, uSunDir), 0.0), 200.0) * 3.0 * (1.0 - uNight);
              r = mix(r, mix(vec3(0.75, 0.76, 0.78), pv, panel), inPv * (fband(row, 0.0, 2.1, px.y)));
              r *= 1.0 - 0.35 * inPv * fband(row, 2.1, 2.9, px.y);
            }
          }
          // the parapet: a coping along its top, a little dark where it meets the roof, and its
          // shadow on the sunny day side
          vec2 sd = normalize(uSunDir.xz);
          float tx = sd.x > 0.0 ? (vSize.x - f.x) / sd.x : f.x / max(-sd.x, 1e-3);
          float tz = sd.y > 0.0 ? (vSize.z - f.y) / sd.y : f.y / max(-sd.y, 1e-3);
          float tanE = uSunDir.y / length(uSunDir.xz);
          sunK = mix(smoothstep(0.85, 1.15, min(tx, tz) * tanE), 1.0, step(4.5, style));
          r *= 1.0 - 0.18 * fband(edge, 0.5, 1.3, pl) * step(style, 4.5);
          r = mix(r, vCol * 0.95, fband(edge, 0.0, 0.5, pl));
          alb = r;
        } else {
          // ================================================================ walls
          // the facade's frame: across it (t), up, out of it (n); the view ray and the sun in it
          vec3 T = abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          vec3 d = vec3(dot(-V, T), -V.y, dot(V, n));
          vec3 sT = vec3(dot(uSunDir, T), uSunDir.y, dot(uSunDir, n));
          float sunOn = step(0.02, sT.z);
          float hsx = abs(sT.x) / max(sT.z, 0.05), hsy = max(sT.y, 0.0) / max(sT.z, 0.05);
          float faceH = hash12(vec2(seed * 31.0, vFaceId));

          if (style > 4.5) {
            // rooftop kit: louvred metal
            alb = vec3(0.62, 0.63, 0.61) * (0.8 + 0.2 * fpulse(f.y / 0.5, 0.5, px.y / 0.5));
          } else if (style > 3.5) {
            // sheds and containers: corrugated sheet streaked with rust, a roller door on some
            // faces, a strip of translucent panels high up the long sides
            alb *= 0.82 + 0.18 * fpulse(f.x / 0.6, 0.5, px.x / 0.6);
            float rust = smoothstep(0.55, 0.8, texture(uNoise, vec2(f.x * 0.21 + seed * 9.0, f.y * 0.025)).g);
            alb = mix(alb, vec3(0.32, 0.17, 0.09), rust * 0.45);
            float door = step(0.6, fract(seed * 13.0 + vFaceId * 0.37)) * step(vSize.y, 9.0) * step(3.0, vSize.y);
            float dx = abs(f.x - vFaceW * 0.5);
            float dm = door * fband(dx, 0.0, 2.5, px.x) * fband(f.y, 0.0, 4.0, px.y);
            alb = mix(alb, vec3(0.3, 0.3, 0.32) * (0.85 + 0.15 * fpulse(f.y / 0.25, 0.8, px.y / 0.25)), dm);
            sunK *= 1.0 - dm * fband(f.y, 4.0 - 0.3 * hsy, 4.0, px.y) * sunOn;
            float strip = fband(f.y, vSize.y - 1.7, vSize.y - 0.9, px.y) * fband(f.x, 1.0, vFaceW - 1.0, px.x) * step(14.0, vFaceW) * fpulse(f.x / 3.0, 0.8, px.x / 3.0);
            alb = mix(alb, vec3(0.78, 0.8, 0.76), strip);
            emit += vec3(1.0, 0.85, 0.6) * strip * night * 0.35 * step(0.3, lit);
            alb *= mix(0.65, 1.0, smoothstep(0.0, 1.2, f.y));
          } else {
            // ---------------------------------------------------- windowed walls
            // per style: the grid (bay width, floor height), the opening in each bay, how deep
            // it's set in, the glass, the frames, how deep the rooms are
            vec2 cell, lo, hi;
            float rd, f0, tint, depth, office;
            vec3 frame;
            if (style < 0.5) {
              cell = vec2(1.6, 3.6); lo = vec2(0.04, 0.95); hi = vec2(1.56, 3.56);
              rd = 0.04; f0 = 0.28; tint = 0.28; depth = 7.0; office = 1.0; frame = vec3(0.55, 0.58, 0.6);
            } else if (style < 1.5) {
              cell = vec2(3.0, 3.6); lo = vec2(0.1, 1.0); hi = vec2(2.9, 3.05);
              rd = 0.16; f0 = 0.1; tint = 0.65; depth = 7.0; office = 1.0; frame = vec3(0.2, 0.21, 0.22);
            } else if (style < 2.5) {
              cell = vec2(3.2, 3.0); lo = vec2(0.8, 0.85); hi = vec2(2.4, 2.5);
              rd = 0.2; f0 = 0.05; tint = 0.85; depth = 4.5; office = 0.0; frame = vec3(0.86, 0.86, 0.84);
            } else {
              cell = vec2(2.8, 3.4); lo = vec2(0.9, 0.85); hi = vec2(1.9, 2.75);
              rd = 0.26; f0 = 0.05; tint = 0.9; depth = 4.2; office = step(0.7, faceH); frame = faceH < 0.5 ? vec3(0.85, 0.84, 0.8) : vec3(0.12, 0.13, 0.12);
            }
            vec2 ws = hi - lo;
            // centred on the face, whole bays only
            float nb = floor(vFaceW / cell.x);
            float xoff = (vFaceW - nb * cell.x) * 0.5;
            float fx = f.x - xoff;
            vec2 cxy = vec2(mod(fx, cell.x), mod(f.y, cell.y));
            vec2 id = vec2(floor(fx / cell.x), floor(f.y / cell.y));
            vec2 qw = px / cell;
            float far = smoothstep(0.2, 0.7, max(qw.x, qw.y));
            #ifdef MAP_LITE
            // (low quality: no rooms behind the windows, no reveals)
            far = max(far, 0.99);
            #endif
            // shops or a lobby at street level on the taller buildings; a band of no windows at
            // the top (the parapet behind)
            float shops = street * step(9.0, vSize.y);
            float gh = style < 1.5 ? 4.5 : 3.8;
            float y0 = shops > 0.5 ? gh : 0.0;
            float inside = fband(fx, 0.0, nb * cell.x, px.x) * fband(f.y, y0 + 0.05, vSize.y - 0.7, px.y) * step(1.0, nb);
            float wm = fpulse((fx - lo.x) / cell.x, ws.x / cell.x, qw.x) * fpulse((f.y - lo.y) / cell.y, ws.y / cell.y, qw.y) * inside;
            // (the rows of the opening, so a row cut off by the top or the shops isn't drawn)
            wm *= step(y0, id.y * cell.y + lo.y - 0.01) * step(id.y * cell.y + hi.y, vSize.y - 0.7);
            float rh = hash12(id + seed * 53.0 + vFaceId * 7.1);

            // the wall between the windows
            if (style < 0.5) {
              // glass towers: the spandrels are glass too, back-painted (dark, a hint of the
              // building's colour), reflecting as the vision glass does; the mullion caps
              // catching the light
              vec3 nS = normalize(n + (T * (hash12(id * 3.7 + seed) - 0.5) + vec3(0.0, 1.0, 0.0) * (hash12(id * 4.3 + seed) - 0.5)) * 0.06);
              vec3 rS = reflect(-V, nS);
              alb = vCol * 0.22;
              emit += facadeSky(rS) * facadeFresnel(dot(V, nS), 0.28);
              float cap = (1.0 - fpulse((fx - 0.04) / cell.x, 1.52 / cell.x, qw.x)) * (1.0 - far);
              alb = mix(alb, vec3(0.6, 0.62, 0.64), cap);
              emit *= 1.0 - cap;
            } else if (style < 1.5) {
              // offices: precast spandrel panels with joints, a pier every few bays
              alb *= 0.95 + 0.08 * fpulse(f.y / cell.y - 0.1, 0.03, qw.y);
              alb *= 1.0 - 0.06 * fpulse(fx / (cell.x * 3.0), 0.04, qw.x / 3.0);
            } else if (style < 2.5) {
              // flats: render, a little tone change floor by floor
              alb *= 0.96 + 0.08 * hash12(vec2(id.y, seed));
            } else {
              // brick: coursed, a few bricks darker, a stone cornice; stone sills and lintels
              float brick = hash12(floor(vec2(f.x / 0.23 + 0.5 * mod(floor(f.y / 0.077), 2.0), f.y / 0.077)) + seed);
              alb *= mix(0.9 + 0.2 * brick, 0.97, smoothstep(0.03, 0.09, px.y));
              alb *= 0.9 + 0.1 * fpulse(f.y / 0.3, 0.8, px.y / 0.3);
              alb = mix(alb, vec3(0.85, 0.8, 0.72), fband(f.y, vSize.y - 1.2, vSize.y - 0.5, px.y));
              float sx = fband(cxy.x, lo.x - 0.12, hi.x + 0.12, px.x) * inside * step(y0, id.y * cell.y + lo.y - 0.01);
              float sill = fband(cxy.y, lo.y - 0.14, lo.y, px.y) * sx;
              float lint = fband(cxy.y, hi.y, hi.y + 0.26, px.y) * sx;
              alb = mix(alb, vec3(0.8, 0.77, 0.7) * (0.9 + 0.15 * nz.g), max(sill, lint));
              sunK *= 1.0 - sx * fband(cxy.y, lo.y - 0.14 - 0.06 * hsy, lo.y - 0.14, px.y) * sunOn;
            }
            // streaks: rain running down from the roof and from every sill, dirt at the foot
            float streak = smoothstep(0.5, 0.85, texture(uNoise, vec2(f.x * 0.33 + seed * 11.0 + vFaceId, f.y * 0.012)).r);
            float under = fband(cxy.x, lo.x + 0.1, hi.x - 0.1, px.x) * smoothstep(1.6, 0.0, lo.y - cxy.y) * step(cxy.y, lo.y) * step(0.35, rh) * (1.0 - wm);
            alb *= 1.0 - 0.16 * streak * (0.35 + 0.65 * smoothstep(vSize.y - 25.0, vSize.y, f.y)) - (style < 0.5 ? 0.0 : 0.12 * under * streak);

            // balconies on some blocks of flats: a slab under the windows, a railing (glass or
            // bars) across the bottom of the window, the slab's shadow on the floor below
            float balc = step(style, 2.5) * step(1.5, style) * step(fract(seed * 17.3), 0.6);
            float rail = 0.0;
            if (balc > 0.5) {
              float bx = fband(cxy.x, lo.x - 0.5, hi.x + 0.5, px.x) * inside * step(y0 + 0.1, id.y * cell.y + lo.y);
              float slab = fband(cxy.y, lo.y - 0.25, lo.y - 0.05, px.y) * bx;
              rail = fband(cxy.y, lo.y - 0.05, lo.y + 0.95, px.y) * bx;
              float top = fband(cxy.y, lo.y + 0.9, lo.y + 0.97, px.y) * bx;
              // the shadow the slab above throws down (on the wall and the window's head)
              float yb = cell.y - cxy.y + lo.y - 0.25;
              float above = fband(cxy.x, lo.x - 0.5, hi.x + 0.5, px.x) * step(id.y * cell.y + cell.y + lo.y, vSize.y - 0.7) * step(y0 + 0.1, (id.y + 1.0) * cell.y + lo.y);
              sunK *= 1.0 - sunOn * above * (1.0 - smoothstep(1.3 * hsy - 0.1, 1.3 * hsy + 0.1, yb));
              alb = mix(alb, vec3(0.8, 0.79, 0.76), slab);
              alb = mix(alb, vec3(0.2), top);
              rail *= 1.0 - top;
            }

            // fire escapes on some faces of old brick
            float esc = 0.0, escS = 0.0;
            if (style > 2.5 && faceH < 0.4 && vSize.y < 45.0 && nb > 3.5 && far < 0.9) {
              float k0 = floor(1.0 + (nb - 3.0) * fract(faceH * 7.7));
              float x0 = xoff + k0 * cell.x + lo.x - 0.5, x1 = xoff + (k0 + 1.0) * cell.x + hi.x + 0.5;
              float top = vSize.y - 1.5;
              esc = fireEscape(f, x0, x1, cell.y, lo.y, top, px);
              escS = sunOn * fireEscape(f + sT.xy / max(sT.z, 0.05) * 0.9, x0, x1, cell.y, lo.y, top, px);
              sunK *= 1.0 - 0.9 * escS;
            }

            // ---- the window itself
            if (wm > 0.001) {
              vec2 wl = cxy - lo;
              // where the view ray meets the glass, set back rd: past the opening's edge, the
              // ray sees the reveal (the jamb, the head, the sill) instead
              vec2 g = wl + d.xy / max(d.z, 0.06) * rd;
              float rev = 1.0 - step(0.0, g.x) * step(g.x, ws.x) * step(0.0, g.y) * step(g.y, ws.y);
              rev *= 1.0 - far;
              g = clamp(g, vec2(0.0), ws);
              // the sun on the glass past the head's and the jamb's shadows
              float sunIn = sunOn * step(rd * hsy, ws.y - g.y) * (sT.x > 0.0 ? step(rd * hsx, ws.x - g.x) : step(rd * hsx, g.x));
              // lights: offices lit by day as well, homes mostly at night; every lamp its own
              float share = mix(lit * (office > 0.5 ? 0.8 : 0.18), lit, night);
              float on = facadeOn(id, seed + vFaceId * 0.031, share);
              vec3 lamp = facadeLamp(fract(rh * 5.7), office);
              vec3 day = (uSky * 0.5 + uSunCol * max(sT.z, 0.0) * 0.12) * (1.0 - 0.85 * uNight);
              vec3 room = lamp * share * 0.5 * (1.0 + 0.6 * office) + day * 0.45;
              if (far < 0.98) {
                vec3 rc = facadeRoom(lo + g, cell, d, depth, rh, on, lamp, day);
                // blinds (offices, half down or more) and curtains (homes), lit from behind
                float bl = fract(rh * 3.9);
                vec3 cloth = office > 0.5 ? vec3(0.82, 0.82, 0.8) : (fract(rh * 2.3) < 0.5 ? vec3(0.85, 0.78, 0.62) : vec3(0.6, 0.35, 0.3));
                vec3 clothC = cloth * (lamp * on * 0.55 + day * 0.9 + uSunCol * 0.08 * sunIn);
                float drop = bl > 0.45 ? (bl - 0.45) / 0.55 * 0.85 : 0.0;
                float bm = office > 0.5 ? step(ws.y * (1.0 - drop), g.y) * (0.92 + 0.08 * fpulse(g.y / 0.09, 0.8, px.y / 0.09)) : max(step(g.x, ws.x * 0.22 * step(0.3, bl)), step(ws.x * (1.0 - 0.22 * step(0.3, bl)), g.x)) * step(0.3, bl);
                rc = mix(rc, clothC, bm);
                room = mix(rc, room, far);
              }
              // the glass: each pane a little out of true, reflecting the sky (and the city
              // across the street below the horizon), the room seen through it
              float wob = style < 0.5 ? 0.06 : 0.035;
              vec3 nP = normalize(n + (T * (hash12(id * 3.7 + seed) - 0.5) + vec3(0.0, 1.0, 0.0) * (hash12(id * 4.3 + seed) - 0.5)) * wob);
              vec3 rr = reflect(-V, nP);
              float F = facadeFresnel(dot(V, nP), f0);
              vec3 glass = room * tint * (1.0 - F) + facadeSky(rr) * F;
              glass += uSunCol * pow(max(dot(rr, uSunDir), 0.0), 250.0) * 4.0 * F * sunIn * sunShadow(w + n * 3.5) * cloudShade(w.xz);
              // the frame round it and the bars across it (sashes on brick, a casement on flats,
              // mullions in office ribbons)
              float pl = length(px);
              float fm = 1.0 - fband(g.x, 0.06, ws.x - 0.06, pl) * fband(g.y, 0.06, ws.y - 0.06, pl);
              if (style > 2.5) fm = max(fm, fband(g.y, ws.y * 0.5 - 0.04, ws.y * 0.5 + 0.04, pl) + 0.6 * (fband(g.x, ws.x * 0.5 - 0.02, ws.x * 0.5 + 0.02, pl) + fband(mod(g.y, ws.y * 0.5), ws.y * 0.25 - 0.02, ws.y * 0.25 + 0.02, pl)) * (1.0 - far));
              else if (style > 1.5) fm = max(fm, fband(g.x, ws.x * 0.5 - 0.04, ws.x * 0.5 + 0.04, pl) + fband(g.y, ws.y * 0.74, ws.y * 0.74 + 0.07, pl));
              else if (style > 0.5) fm = max(fm, fband(mod(g.x, 1.4), 0.0, 0.06, pl) * (1.0 - far));
              fm = clamp(fm, 0.0, 1.0) * (1.0 - far * 0.7);
              vec3 fc = frame * mapLightK(n, w, sunIn, 3.5);
              glass = mix(glass, fc, fm);
              // the reveal: the wall turned in, in its own shade
              vec3 rv = vCol * 0.8 * mapLightK(n, w, 0.25 * sunIn, 3.5);
              glass = mix(glass, rv, rev);
              // railings across the window's foot: tinted glass or bars
              if (rail > 0.0) {
                float bars = fract(seed * 5.1) < 0.5 ? 0.55 : 0.35 + 0.5 * fpulse(f.x / 0.13, 0.25, px.x / 0.13);
                glass = mix(glass, glass * 0.6 + vec3(0.04, 0.05, 0.06), rail * bars);
              }
              winC = glass;
              win = wm;
            }

            // ---- street level: shopfronts (fascia, awnings, doors, lit inside) or a lobby
            if (shops > 0.5 && f.y < gh + 0.05) {
              float nbays = max(1.0, floor(vFaceW / 6.5 + 0.5));
              float bw = vFaceW / nbays;
              float bxp = mod(f.x, bw);
              float bid = floor(f.x / bw);
              float bh = hash12(vec2(bid, seed * 7.0 + vFaceId * 3.0));
              float lobby = step(style, 1.5);
              float pier = 0.35;
              float gtop = lobby > 0.5 ? gh - 0.3 : gh - 0.95;
              float glz = fband(bxp, pier, bw - pier, px.x) * fband(f.y, 0.25 * (1.0 - lobby), gtop, px.y);
              // piers and plinth: dark stone
              alb = mix(alb, vec3(0.16, 0.16, 0.17) * (0.9 + 0.2 * nz.r), fband(f.y, 0.0, gh, px.y) * (1.0 - glz) * (0.5 + 0.5 * lobby));
              // the fascia, a sign board on each shop, its lettering lit at night
              if (lobby < 0.5) {
                float fas = fband(bxp, pier, bw - pier, px.x) * fband(f.y, gh - 0.85, gh - 0.12, px.y);
                vec3 sc = bh < 0.2 ? vec3(0.08, 0.12, 0.25) : bh < 0.4 ? vec3(0.45, 0.06, 0.05) : bh < 0.6 ? vec3(0.05, 0.2, 0.12) : bh < 0.8 ? vec3(0.08, 0.08, 0.08) : vec3(0.7, 0.62, 0.45);
                vec2 lq = vec2((bxp - pier - 0.4) / 0.42, (f.y - (gh - 0.68)) / 0.42);
                float letters = step(0.0, lq.x) * step(lq.x, (bw - 2.0 * pier - 0.8) / 0.42 * 0.8) * step(0.0, lq.y) * step(lq.y, 1.0) * step(0.3, hash12(vec2(floor(lq.x), bid + seed)));
                letters *= step(0.15, fract(lq.x)) * step(fract(lq.x), 0.85);
                letters = mix(letters, 0.35 * step(0.0, lq.x) * step(lq.x, (bw - 2.0 * pier - 0.8) / 0.42 * 0.8) * step(0.0, lq.y) * step(lq.y, 1.0), smoothstep(0.08, 0.25, px.x));
                alb = mix(alb, mix(sc, vec3(0.92, 0.9, 0.85), letters), fas);
                emit += uNeon[int(mod(floor(bh * 23.0), 5.0))] * letters * fas * night * uGlow * 0.4;
                // awnings: striped canvas over some windows, with their shadow on the glass
                float aw = step(0.2, bh) * step(bh, 0.62);
                float awm = aw * fband(bxp, pier, bw - pier, px.x) * fband(f.y, gtop - 0.05, gtop + 0.42, px.y);
                vec3 ac = mix(sc * 1.6 + 0.05, vec3(0.9, 0.88, 0.82), fpulse(bxp / 0.6, 0.5, px.x / 0.6));
                alb = mix(alb, ac, awm);
                sunK *= 1.0 - aw * glz * sunOn * (1.0 - smoothstep(1.4 * hsy - 0.1, 1.4 * hsy + 0.1, gtop - f.y));
                glz *= 1.0 - awm;
              }
              if (glz > 0.001) {
                vec2 sp = vec2(bxp - pier, f.y - 0.25 * (1.0 - lobby));
                vec2 sz = vec2(bw - 2.0 * pier, gtop - 0.25 * (1.0 - lobby));
                vec2 g = clamp(sp + d.xy / max(d.z, 0.06) * 0.1, vec2(0.0), sz);
                float sunIn = sunOn * sunK;
                float shopOn = mix(0.92, 0.82, night) * step(0.08, fract(bh * 13.0));
                vec3 lamp = lobby > 0.5 ? LAMP_SOFT * 1.2 : (fract(bh * 5.0) < 0.6 ? LAMP_SOFT : LAMP_COOL) * 1.5;
                vec3 day = uSky * 0.35 * (1.0 - 0.85 * uNight);
                vec3 rc = far < 0.98 ? facadeRoom(g, sz, d, lobby > 0.5 ? 12.0 : 8.0, bh, shopOn, lamp, day) : lamp * shopOn * 0.6;
                // a door in some bays: darker, framed
                float door = step(bh, 0.5) * fband(abs(g.x - sz.x * 0.5), 0.0, 0.7, px.x) * fband(g.y, 0.0, 2.3, px.y);
                rc *= 1.0 - 0.45 * door;
                vec3 rr = reflect(-V, n);
                float F = facadeFresnel(dot(V, n), 0.06);
                vec3 sg = rc * 0.92 * (1.0 - F) + facadeSky(rr) * F;
                float pl = length(px);
                float fm = (1.0 - fband(g.x, 0.05, sz.x - 0.05, pl) * fband(g.y, 0.05, sz.y - 0.05, pl)) + fband(mod(g.x, lobby > 0.5 ? 1.5 : 2.2), 0.0, 0.06, pl) + door * (1.0 - fband(abs(g.x - sz.x * 0.5), 0.0, 0.64, pl));
                sg = mix(sg, vec3(0.1, 0.1, 0.11) * mapLightK(n, w, sunIn, 3.5), clamp(fm, 0.0, 1.0) * (1.0 - far * 0.7));
                winC = mix(winC, sg, glz);
                win = max(win * (1.0 - glz), glz);
              }
              // street lamps light the shopfronts' surround a little at night
              emit += alb * vec3(1.0, 0.7, 0.42) * 0.3 * night;
            }

            // fire escapes in front of it all
            alb = mix(alb, vec3(0.07, 0.07, 0.075), esc);
            winC = mix(winC, vec3(0.05) * mapLightK(n, w, 0.0, 3.5), esc);
            // the neon trim: a band under the roof line, and up the corners of the glass towers
            if (vNeon >= 0.0) {
              float trim = fband(f.y, vSize.y - 1.4, vSize.y - 0.7, px.y);
              if (style < 0.5) trim = max(trim, (fband(f.x, 0.0, 0.45, px.x) + fband(f.x, vFaceW - 0.45, vFaceW, px.x)) * step(8.0, f.y));
              emit += neonCol * trim * uGlow * (0.6 + 0.4 * uDusk);
              alb = mix(alb, vec3(0.1), trim);
              win *= 1.0 - trim;
            }
            // the coping along the top
            alb = mix(alb, vCol * 1.12 + 0.03, fband(f.y, vSize.y - 0.3, vSize.y, px.y) * step(0.5, style));
          }
          // darker near the foot of every wall (the street's shade, splashes) and the glow of the
          // street lamps up it at night; floodlights washing up a few landmarks
          alb *= mix(0.68, 1.0, smoothstep(0.0, 9.0, f.y)) * mix(0.85, 1.0, smoothstep(0.0, 0.7, f.y));
          emit += alb * vec3(1.0, 0.66, 0.36) * 0.4 * night * exp(-f.y / 3.5) * street;
          float flood = step(fract(seed * 61.3), 0.18) * step(25.0, vSize.y) * street;
          emit += alb * mix(LAMP_WARM, LAMP_COOL, step(0.5, fract(seed * 7.9))) * 0.5 * night * flood * smoothstep(0.0, 4.0, f.y) * exp(-f.y / (vSize.y * 0.5));
        }
        vec3 c = alb * mapLightK(n, w, sunK, 3.5) + emit;
        c = mix(c, winC, win);
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }
`;
