// roads.ts ROAD_GLSL: road surfaces, shared by the country roads' ribbons and the city's terrain
// (the street grid). Needs map_common.gdshaderinc first. `px` is the size of a pixel in metres
// across (x) and along (y) the road. (AVENUE / 2 and STREET / 2 are written in, as the web does.)
const vec3 R_WHITE = vec3(0.8, 0.8, 0.76);
const vec3 R_YELLOW = vec3(0.86, 0.55, 0.09);
const vec3 R_KERB = vec3(0.6, 0.58, 0.54);
const vec3 R_PAVE = vec3(0.44, 0.41, 0.37);
const vec3 R_GRASS = vec3(0.17, 0.28, 0.07);
const vec3 R_CITY_TAR = vec3(0.058, 0.061, 0.072);
// a line of half width h centred at c, box-filtered over a pixel
float rLine(float x, float c, float h, float px) { return fband(x, c - h, c + h, px); }
// on for 'duty' of every 'period' metres
float rDash(float s, float period, float duty, float px) { return fpulse(s / period, duty, px / period); }
// street lamps: a glimmer by day, full at night
float rLampsOn() { return mix(0.04, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0)); }
// a pool of lamp light: ds along, dc across from the lamp, r its reach
float rPool(float ds, float dc, float r) { return exp(-(ds * ds + dc * dc) / (r * r)); }

// a grass verge, with wild flowers in it
vec3 rVerge(vec2 xz, vec4 nz, float px) {
	vec3 c = R_GRASS * (0.78 + 0.45 * nz.g);
	vec2 q = xz * 1.7;
	float h = hash12(floor(q));
	float speck = step(0.84, h) * smoothstep(0.34, 0.18, length(fract(q) - 0.5)) * smoothstep(0.6, 0.2, px);
	vec3 flower = h > 0.95 ? vec3(0.9, 0.85, 0.75) : h > 0.9 ? vec3(0.9, 0.42, 0.55) : vec3(0.95, 0.75, 0.2);
	return mix(c, flower, speck);
}

// paving slabs
vec3 rPave(vec2 xz, vec4 nz, float px) {
	vec3 c = R_PAVE * (0.9 + 0.16 * nz.r);
	return c * (1.0 - 0.14 * max(fpulse(xz.x / 1.4, 0.05, px / 1.4), fpulse(xz.y / 1.4, 0.05, px / 1.4)));
}

// a city avenue's or street's carriageway (kerb to kerb): o across from its centre, s along
vec3 rCityLanes(bool avenue, float o, float s, vec2 px, vec4 nz, float hue, inout vec3 glow) {
	float a = abs(o);
	float hw = avenue ? 10.50 : 6.50;
	vec3 c = R_CITY_TAR * (0.88 + 0.24 * nz.r);
	if (avenue) {
		// the outer lane each way is a terracotta bus lane, behind a solid white line
		c = mix(c, vec3(0.16, 0.066, 0.05) * (0.9 + 0.2 * nz.r), fband(a, 6.15, hw, px.x));
		c = mix(c, R_WHITE, rLine(a, 6.05, 0.1, px.x));
		c *= 1.0 - 0.12 * rLine(a, 3.8, 0.9, px.x);
		// the planted median, kerbed, with a strip of neon along it at night
		vec3 med = mix(R_KERB, vec3(0.07, 0.14, 0.035) * (0.75 + 0.5 * nz.a), fband(a, 0.0, 1.32, px.x));
		c = mix(c, med, fband(a, 0.0, 1.6, px.x));
		vec3 neon = hue < 0.5 ? vec3(0.25, 0.94, 1.0) : vec3(1.0, 0.25, 0.64);
		glow += neon * (2.2 * rLine(a, 1.66, 0.06, px.x) + 0.1 * smoothstep(3.4, 1.7, a) * step(1.6, a)) * uNight * uGlow * 0.45;
	} else {
		// parking bays along both kerbs, a dashed line down the middle
		float bay = fband(a, 4.3, hw, px.x);
		c = mix(c, c * 1.4, bay);
		c = mix(c, R_WHITE * 0.8, bay * rDash(s, 6.0, 0.025, px.y) + rLine(a, 4.3, 0.06, px.x));
		c = mix(c, vec3(0.75, 0.68, 0.48), rLine(a, 0.0, 0.08, px.x) * rDash(s, 9.0, 0.45, px.y));
	}
	// the gutter along the kerb
	return c * (1.0 - 0.3 * fband(a, hw - 0.35, hw, px.x));
}

// any road's surface right across (verges or pavements included). kind: see Kind in roadnet.ts
vec3 roadColor(float kind, float o, float s, float hw, vec2 px, vec4 nz, vec4 nz2, vec2 xz, inout vec3 glow) {
	int k = int(kind + 0.5);
	float a = abs(o);
	vec3 c;
	if (k == 0) {
		// the expressway: two lanes each way, hard shoulders, a concrete median with lamps down it
		c = vec3(0.045, 0.05, 0.06) * (0.92 + 0.14 * nz.r);
		c *= 1.0 - 0.13 * (rLine(a, 3.3, 0.8, px.x) + rLine(a, 6.85, 0.8, px.x));
		c = mix(c, c * 1.45 + 0.01, fband(a, 8.95, hw, px.x));
		c = mix(c, R_WHITE, rLine(a, 5.08, 0.09, px.x) * rDash(s, 18.0, 0.33, px.y));
		c = mix(c, R_WHITE, rLine(a, 8.82, 0.13, px.x));
		c = mix(c, R_YELLOW, rLine(a, 1.6, 0.1, px.x));
		c = mix(c, vec3(0.36, 0.35, 0.33) * (0.9 + 0.2 * nz.r), fband(a, 0.0, 1.35, px.x));
		c = mix(c, rVerge(xz, nz, px.x), fband(a, hw, 99.0, px.x));
		float ds = (fract(s / 40.0 + 0.5) - 0.5) * 40.0;
		glow += vec3(0.62, 0.86, 1.0) * rPool(ds, a - 5.0, 5.0) * 0.36 * rLampsOn() * step(a, hw + 0.5);
	} else if (k == 1) {
		// a country road: patched asphalt, white edges, a dashed white centre line, gravel shoulders
		c = vec3(0.09, 0.085, 0.078) * (0.9 + 0.18 * nz.r);
		c *= mix(1.0, 0.8, smoothstep(0.62, 0.66, nz2.a));
		c = mix(c, R_WHITE, rLine(a, 0.0, 0.07, px.x) * rDash(s, 12.0, 0.25, px.y));
		c = mix(c, R_WHITE, rLine(a, hw - 0.3, 0.08, px.x));
		c = mix(c, vec3(0.36, 0.31, 0.24) * (0.8 + 0.4 * nz.r), fband(a, hw, 99.0, px.x));
	} else if (k == 2) {
		// the mountain road: narrower, weathered, a double yellow line, stone chippings at the side
		c = vec3(0.068, 0.064, 0.06) * (0.88 + 0.24 * nz.r);
		c *= mix(1.0, 0.82, smoothstep(0.6, 0.64, nz2.a));
		c = mix(c, R_YELLOW, fband(a, 0.07, 0.19, px.x));
		c = mix(c, R_WHITE, rLine(a, hw - 0.22, 0.07, px.x));
		c = mix(c, vec3(0.3, 0.29, 0.27) * (0.8 + 0.4 * nz.r), fband(a, hw, 99.0, px.x));
	} else if (k == 3) {
		// a village lane: pale old asphalt, ragged edges into flowery verges, a lamp now and then
		c = vec3(0.15, 0.14, 0.125) * (0.82 + 0.34 * nz.r);
		c = mix(c, R_GRASS * 0.9, 0.3 * smoothstep(0.5, 0.0, a) * nz.a);
		c = mix(c, rVerge(xz, nz, px.x), fband(a, hw - 0.4 * nz.g, 99.0, px.x));
		float ds = (fract(s / 32.0 + 0.5) - 0.5) * 32.0;
		glow += vec3(1.0, 0.66, 0.34) * rPool(ds, o - hw, 5.0) * 0.5 * rLampsOn();
	} else if (k == 4) {
		// a farm track: two dusty ruts and a strip of grass down the middle
		c = vec3(0.34, 0.25, 0.15) * (0.82 + 0.34 * nz.r);
		c *= 1.0 - 0.22 * rLine(a, 0.85, 0.28, px.x);
		c = mix(c, R_GRASS * (0.9 + 0.3 * nz.g), fband(a, 0.0, 0.3 + 0.12 * nz.g, px.x));
		c = mix(c, rVerge(xz, nz, px.x), fband(a, hw - 0.25 * nz.g, 99.0, px.x));
	} else if (k == 7) {
		// an alley: stone setts, a gutter down the middle, paper lanterns strung across at night
		vec2 q = vec2(s / 0.55, o / 0.4);
		q.x += 0.5 * mod(floor(q.y), 2.0);
		float id = mix(hash12(floor(q) + 3.0), 0.5, smoothstep(0.08, 0.3, max(px.x, px.y)));
		c = vec3(0.42, 0.34, 0.29) * (0.78 + 0.4 * id);
		c *= 1.0 - 0.4 * max(fpulse(q.x, 0.1, px.y / 0.55), fpulse(q.y, 0.12, px.x / 0.4));
		c *= 1.0 - 0.4 * rLine(a, 0.0, 0.16, px.x);
		float ds = (fract(s / 5.0 + 0.5) - 0.5) * 5.0;
		glow += vec3(1.0, 0.42, 0.22) * (0.1 + 0.45 * rPool(ds, a - 1.2, 2.2)) * rLampsOn();
	} else {
		// a city avenue or street carried over a bridge
		bool av = k == 5;
		float chw = av ? 10.50 : 6.50;
		vec3 g = vec3(0.0);
		c = rCityLanes(av, o, s, px, nz, 0.0, g);
		glow += g * step(a, chw);
		c = mix(c, rPave(xz, nz, px.x), fband(a, chw, 99.0, px.x));
		c = mix(c, R_KERB, fband(a, chw, chw + 0.3, px.x));
	}
	return c;
}
