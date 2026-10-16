// terrain.ts terrainMaterial: the fine terrain, its colours per vertex (CUSTOM0) and masks
// (CUSTOM1: city, fields, park), with grain, the patchwork fields, the city's paving and its
// whole street grid (kerbs, crossings, lamps: roads.ts ROAD_GLSL) drawn in.
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#define LINES 38
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_road.gdshaderinc"

uniform vec4 uGrid;
uniform vec2 uStreet;
uniform vec4 uLines[LINES];
uniform vec4 uLineK;

varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vMask;

void vertex() {
	vCol = CUSTOM0.rgb;
	vMask = CUSTOM1.xyz;
	vN = NORMAL;
	vWorld = VERTEX - uMapShift;
}

// the grid line nearest p (q along it): offset from it, its half width (0: no street here),
// how far q is past its ends, and avenue + 2 * neon colour
vec4 gridLine(float p, float q, float origin, float k0, float base, float count) {
	float k = floor((p - origin) / uGrid.z + 0.5);
	float o = p - (origin + k * uGrid.z);
	float i = k - k0;
	if (i < 0.0 || i > count - 0.5) return vec4(o, 0.0, 1e4, 0.0);
	vec4 L = uLines[int(base + i + 0.5)];
	if (L.y <= L.x) return vec4(o, 0.0, 1e4, 0.0);
	return vec4(o, L.z > 0.5 ? uStreet.y : uStreet.x, max(L.x - q, q - L.y), L.z + 2.0 * L.w);
}
// signed distance to that street's carriageway (a long box, square-ended)
float lineSD(vec4 g) {
	if (g.y <= 0.0) return 1e4;
	vec2 q = vec2(abs(g.x) - g.y, g.z);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

void fragment() {
	vec3 base = vCol;
	vec3 w = vWorld;
	vec4 nz = texture(uNoise, w.xz / 37.0);
	vec4 nz2 = texture(uNoise, w.xz / 420.0);
	vec2 pxy = fwidth(w.xz);
	float px = length(pxy);
	float mx = fwidth(vMask.x) + 1e-4, mz = fwidth(vMask.z) + 1e-4;
	// grain and mottling everywhere
	base *= 0.88 + 0.16 * nz.r + 0.12 * (nz2.g - 0.5);
	vec3 glow = vec3(0.0);

	// patchwork fields: crops in tilted plots with furrows and hedgerows between
	if (vMask.y > 0.02) {
		vec2 q = mat2(vec2(0.94, -0.34), vec2(0.34, 0.94)) * w.xz;
		vec2 cell = floor(q / vec2(46.0, 31.0));
		vec2 f = fract(q / vec2(46.0, 31.0));
		float hc = hash12(cell + 7.0);
		vec3 crop = hc < 0.22 ? vec3(0.62, 0.45, 0.12) : hc < 0.45 ? vec3(0.25, 0.42, 0.1) : hc < 0.62 ? vec3(0.42, 0.52, 0.16) : hc < 0.78 ? vec3(0.42, 0.28, 0.16) : hc < 0.88 ? vec3(0.36, 0.3, 0.5) : vec3(0.56, 0.5, 0.18);
		float rows = 0.92 + 0.08 * sin((hc > 0.5 ? q.x : q.y) * 2.4);
		crop *= rows * (0.9 + 0.2 * nz.a);
		vec2 e = min(f, 1.0 - f) * vec2(46.0, 31.0);
		float hedge = 1.0 - smoothstep(0.8, 1.8 + px, min(e.x, e.y));
		crop = mix(crop, vec3(0.1, 0.2, 0.06), hedge * 0.85);
		base = mix(base, crop, vMask.y);
	}

	// the city: paved to a crisp edge (a line of kerbstones where it meets the grass), parks
	// hedged round, and the street grid
	float cityIn = (vMask.x - 0.5 + 0.08 * (nz2.b - 0.5)) / mx * px;
	float park = clamp((vMask.z - 0.5) / mz + 0.5, 0.0, 1.0);
	if (vMask.x > 0.3) {
		vec3 paving = vec3(0.38, 0.33, 0.27) * (0.86 + 0.2 * nz.r + 0.1 * (nz2.g - 0.5));
		float paved = fband(cityIn, 0.0, 1e4, px) * (1.0 - park);
		base = mix(base, paving, paved);
		base = mix(base, R_KERB * 0.9, fband(cityIn, 0.0, 0.35, px) * (1.0 - park));
		base = mix(base, vec3(0.1, 0.2, 0.05), fband((vMask.z - 0.5) / mz * px, -0.6, 0.0, px) * step(0.3, vMask.x));
	}
	vec4 gx = gridLine(w.x, w.z, uGrid.x, uLineK.x, 0.0, uLineK.z);
	vec4 gz = gridLine(w.z, w.x, uGrid.y, uLineK.y, uLineK.z, uLineK.w);
	float d1 = lineSD(gx), d2 = lineSD(gz);
	// (streets stay on the city's plain, never down the river banks or onto the beach)
	if (min(d1, d2) < 3.5 && w.y > uGrid.w - 0.9) {
		// the carriageways, their kerbs rounded at the corners
		const float R = 4.0;
		float sd = max(R, min(d1, d2)) - length(max(vec2(R - d1, R - d2), 0.0));
		bool onX = d1 < d2;
		vec4 g = onX ? gx : gz;
		vec4 x2 = onX ? gz : gx;
		float o = g.x, s = onX ? w.z : w.x, a = abs(o);
		vec2 pa = onX ? pxy : pxy.yx;
		bool av = mod(g.w, 2.0) > 0.5;
		float hw = g.y;
		vec3 lg = vec3(0.0);
		vec3 road = rCityLanes(av, o, s, pa, nz, floor(g.w / 2.0), lg);
		float e = abs(x2.x) - x2.y;
		if (x2.y > 0.0 && x2.z <= 0.0) {
			if (e < 0.0 && a < hw) {
				// in the junction: plain tarmac, and where two avenues cross, a scramble crossing
				road = R_CITY_TAR * (0.88 + 0.24 * nz.r);
				lg = vec3(0.0);
				if (av && mod(x2.w, 2.0) > 0.5) {
					float u = abs(gx.x), v = abs(gz.x);
					float diag = fband(u - v, -1.6, 1.6, px) * fpulse((u + v) / 1.3, 0.5, px * 1.5 / 1.3) * step(2.5, u + v);
					road = mix(road, R_WHITE * 0.92, diag);
				}
			} else if (e >= 0.0) {
				// zebra crossings just past the junction, stop lines behind them
				float lanes = av ? fband(a, 1.7, hw - 0.2, pa.x) : fband(a, -1.0, hw - 0.2, pa.x);
				float zebra = fband(e, 0.8, 3.8, pa.y) * fpulse(o / 1.1 + 0.25, 0.5, pa.x / 1.1);
				float stop = fband(e, 4.3, 4.75, pa.y) * step(0.0, (onX ? 1.0 : -1.0) * o * x2.x);
				road = mix(road, R_WHITE * 0.9, (zebra + stop) * lanes);
			}
		}
		vec3 c = mix(base, rPave(w.xz, nz, px), fband(min(d1, d2), -1e4, 3.0, px) * (1.0 - park));
		c = mix(c, road * (1.0 - 0.3 * fband(sd, -0.35, 0.0, px)), fband(sd, -1e4, 0.0, px));
		c = mix(c, R_KERB, fband(sd, 0.0, 0.3, px));
		base = c;
		glow += lg * fband(sd, -1e4, 0.0, px);
		// street lamps: warm pools of light along the kerbs (sodium, the odd white one), where
		// the lamps stand (every 22 m, 1.5 m out from the kerb)
		float k22 = floor((s - 11.0) / 22.0 + 0.5);
		float ds = s - (k22 * 22.0 + 11.0);
		float side = o < 0.0 ? -1.0 : 1.0;
		vec2 lp = onX ? vec2(w.x - o + side * (hw + 1.5), k22 * 22.0 + 11.0) : vec2(k22 * 22.0 + 11.0, w.z - o + side * (hw + 1.5));
		vec3 lc = fract(sin(dot(lp, vec2(12.9, 78.2))) * 43758.5) < 0.3 ? vec3(0.8, 0.9, 1.0) : vec3(1.0, 0.62, 0.3);
		glow += lc * rPool(ds, a - hw - 1.5, 3.2) * 0.4 * rLampsOn() * (1.0 - park) * step(g.z, 0.0);
	}

	// wet sand at the water's edge
	base *= mix(0.78, 1.0, smoothstep(0.15, 0.9, w.y));
	vec3 c = base * mapLight(normalize(vN), w) + glow;
	MAP_OUT(c)
}
