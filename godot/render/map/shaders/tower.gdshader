// towers.ts towerMaterial: the four mega-towers in one mesh, the shader drawing their windows,
// neon ribs, lit lobbies, gardens and giant screens. Per vertex: colour (CUSTOM0), face uv and
// width (CUSTOM1: aUV), and the face's kind, neon, seed and variant (CUSTOM2: aKind).
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform vec3 uNeon[5];

varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vUV;
// (flat: the window hashes must see exactly the same seed across a face)
varying flat vec4 vKind;

void vertex() {
	vWorld = VERTEX - uMapShift;
	vN = NORMAL;
	vCol = CUSTOM0.rgb;
	vUV = CUSTOM1.xyz;
	vKind = CUSTOM2;
}

// an advert: a colour field, a logo ring, a column of characters, sweeping bands; a new one
// every few seconds, wiped in
vec3 advert(vec2 f, float W, float H, float seed, vec2 px) {
	vec2 s = f / vec2(W, H);
	float t = uTime / 7.0 + seed * 5.0;
	float slot = floor(t);
	float h = hash12(vec2(slot, seed * 31.0));
	vec3 a = uNeon[int(mod(floor(h * 5.0), 5.0))], b = uNeon[int(mod(floor(h * 5.0) + 2.0, 5.0))];
	vec3 c = mix(a, b, smoothstep(0.0, 1.0, s.y + 0.2 * sin(uTime * 0.7 + s.x * 4.0))) * 0.35;
	// diagonal bands sweeping across
	c *= 0.75 + 0.25 * fpulse((f.x + f.y) / 9.0 - uTime * 0.6, 0.5, (px.x + px.y) / 9.0);
	// the logo: a ring and a dot
	vec2 lc = (f - vec2(W * 0.5, H * 0.66)) / min(W, H);
	float d = length(lc);
	float pd = length(px) / min(W, H);
	c = mix(c, vec3(1.0), fband(d, 0.17, 0.22, pd) + fband(d, 0.0, 0.07, pd));
	// a column of big characters down the left, a line of small ones along the bottom
	float gs = W * 0.16;
	vec2 g = (f - vec2(W * 0.06, 0.0)) / gs;
	vec2 gid = floor(g), gf = fract(g) * vec2(3.0, 4.0);
	float on = step(0.45, hash12(gid * 3.1 + floor(gf) * 7.7 + slot)) * step(0.0, g.x) * step(g.x, 1.0) * step(2.0, g.y) * step(g.y, H / gs - 1.0);
	vec2 sf = fract(gf);
	on *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
	on = mix(on, 0.3 * step(0.0, g.x) * step(g.x, 1.0), smoothstep(0.1, 0.35, px.x / gs));
	c = mix(c, b * 1.4 + 0.2, on);
	float ts = H * 0.05;
	vec2 q = (f - vec2(W * 0.3, H * 0.08)) / ts;
	float line = step(0.4, hash12(floor(q * vec2(1.0, 1.0)) + slot * 3.0)) * step(0.0, q.y) * step(q.y, 1.0) * step(0.0, q.x) * step(q.x, (W * 0.62) / ts);
	c = mix(c, vec3(1.0, 0.95, 0.9), line * mix(0.8, 0.35, smoothstep(0.1, 0.3, px.x / ts)));
	// wiped in from the top as the ad changes
	float wipe = fract(t);
	c *= smoothstep(0.0, 0.03, abs(s.y - (1.0 - wipe * 8.0))) * 0.6 + 0.4 + 0.6 * step(0.125, wipe);
	// scan lines
	c *= 0.82 + 0.18 * fpulse(f.y / 0.6, 0.5, px.y / 0.6);
	return c;
}

void fragment() {
	vec3 n = normalize(vN);
	vec3 w = vWorld;
	float kind = vKind.x, idx = vKind.y, seed = vKind.z, variant = vKind.w;
	vec2 f = vUV.xy;
	float faceW = vUV.z;
	vec2 px = max(fwidth(f), vec2(1e-3));
	vec4 nz = texture(uNoise, (w.xz + w.y) / 23.0);
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - w);
	vec3 alb = vCol * (0.93 + 0.12 * nz.r);
	vec3 emit = vec3(0.0);
	float spec = 0.0;
	// how lit the inside is: some by day, all of it at night
	float lamps = 0.3 + 0.7 * uDusk;

	if (kind < 0.5) {
		// ---- facade: a window grid per tower
		vec2 cell = vec2(1.6, 3.8), duty = vec2(0.9, 0.84);
		vec3 lamp = vec3(0.8, 0.92, 1.0);
		float lit = 0.55;
		if (variant > 2.5) { cell = vec2(4.0, 4.0); duty = vec2(0.22, 0.7); lamp = vec3(1.0, 0.7, 0.45); lit = 0.35; }
		else if (variant > 1.5) { cell = vec2(2.4, 3.6); duty = vec2(0.66, 0.86); lit = 0.6; }
		else if (variant > 0.5) { cell = vec2(3.2, 3.4); duty = vec2(0.6, 0.58); lamp = vec3(1.0, 0.76, 0.48); lit = 0.65; }
		vec2 q = (f - vec2(mod(faceW, cell.x) * 0.5, 0.0)) / cell;
		vec2 qw = px / cell;
		float win = fpulse(q.x - (1.0 - duty.x) * 0.5, duty.x, qw.x) * fpulse(q.y - (1.0 - duty.y) * 0.5, duty.y, qw.y);
		vec3 r = reflect(-V, n);
		float fres = 0.08 + 0.92 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
		vec3 sky = mix(vec3(0.16, 0.16, 0.2) * (1.0 - 0.7 * uNight), skyCol(r), smoothstep(-0.12, 0.04, r.y));
		vec3 glass = mix(vec3(0.04, 0.06, 0.09), sky, 0.3 + 0.55 * fres);
		vec2 id = floor(q);
		float far = smoothstep(0.25, 0.8, max(qw.x, qw.y));
		float on = mix(step(hash12(id + seed * 917.0), lit * (0.55 + 0.45 * uDusk)), lit, far);
		if (variant < 0.5) alb = mix(vCol * 0.5, vCol, 0.5);
		else if (variant > 2.5) alb = vCol * (0.9 + 0.1 * fpulse(f.x / 1.0, 0.5, px.x));
		alb = mix(alb, glass, win);
		spec = win * (variant < 0.5 || variant > 1.5 ? 1.0 : 0.5);
		emit += lamp * win * on * lamps * 0.8;
		vec3 neon = uNeon[int(idx + 0.5)];
		if (variant < 0.5) {
			// the Spire: neon ribs up every corner, a thin band every 40 m
			float rib = fband(f.x, 0.0, 0.7, px.x) + fband(f.x, faceW - 0.7, faceW, px.x);
			rib = max(rib, fband(mod(f.y, 40.0), 0.0, 0.5, px.y) * 0.6);
			emit += neon * rib * uGlow * (0.55 + 0.45 * uDusk);
			alb = mix(alb, vec3(0.08), rib);
		} else if (variant < 1.5) {
			// the Arcology: balconies under each row of windows
			alb = mix(alb, vCol * 1.08, fband(fract(q.y), 0.0, 0.12, qw.y) * (1.0 - far));
		} else if (variant < 2.5) {
			// the Needle: fins between the window columns, light running up some of them
			float fin = fband(mod(f.x, 9.6), 0.0, 0.6, px.x);
			float run = fract((f.y - uTime * 38.0) / 150.0 + floor(f.x / 9.6) * 0.37);
			emit += neon * fin * uGlow * (0.15 + 0.85 * smoothstep(0.82, 1.0, run)) * (0.5 + 0.5 * uDusk);
			alb = mix(alb, vec3(0.85, 0.88, 0.9), fin);
		} else {
			// the Monolith: strips of light running down it
			float strip = fband(mod(f.x, 7.0), 3.2, 3.8, px.x);
			float run = fract((f.y + uTime * 22.0) / 90.0 + floor(f.x / 7.0) * 0.61);
			emit += neon * strip * uGlow * (0.25 + 0.75 * smoothstep(0.7, 1.0, run)) * (0.55 + 0.45 * uDusk);
		}
	} else if (kind < 1.5) {
		// ---- frame: panels, with joints
		alb *= 0.9 + 0.1 * fpulse(f.y / 3.0, 0.92, px.y / 3.0);
	} else if (kind < 2.5) {
		// ---- neon
		emit = uNeon[int(idx + 0.5)] * uGlow * (0.6 + 0.4 * uDusk);
		alb = vec3(0.05);
	} else if (kind < 3.5) {
		// ---- a terrace garden: lawns and shrubs and paths
		vec2 g = w.xz;
		float bush = smoothstep(0.45, 0.7, texture(uNoise, g / 7.0).g);
		alb = mix(vec3(0.33, 0.5, 0.2), vec3(0.2, 0.36, 0.14), bush) * (0.85 + 0.3 * nz.r);
		alb = mix(alb, vec3(0.72, 0.68, 0.6), fband(abs(fract(g.x / 12.0) - 0.5) * 12.0, 0.0, 0.6, px.x * 12.0) * 0.7);
	} else if (kind < 4.5) {
		// ---- a screen
		float H = variant > 0.5 ? variant : 44.0;
		emit = advert(f, faceW, H, seed, px) * uGlow * (0.75 + 0.5 * uDusk);
		alb = vec3(0.02);
	} else {
		// ---- lit from inside: mullions over a glow
		float mull = fpulse(f.x / 2.4, 0.86, px.x / 2.4);
		emit = vCol * mull * lamps * uGlow * 0.55;
		alb = vec3(0.1);
	}
	if (kind < 0.5 && n.y < 0.5) alb *= mix(0.75, 1.0, smoothstep(0.0, 14.0, f.y));
	vec3 c = alb * mapLight(n, w) + emit;
	if (spec > 0.0) {
		vec3 r = reflect(-V, n);
		c += uSunCol * pow(max(dot(r, uSunDir), 0.0), 120.0) * 2.5 * spec * sunShadow(w + n * 3.5) * cloudShade(w.xz);
	}
	MAP_OUT(c)
}
