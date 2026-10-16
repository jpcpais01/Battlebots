// The ring's printed canvas, drawn procedurally (web: ring.ts canvasTexture): apron, the
// fighting surface with weave and scuffs, hazard-striped corners, spokes, a dashed ring and the
// emblem's octagon and gear ring. Coordinates are metres across the ring.
shader_type spatial;

uniform float rope_c = 5.06;
uniform float edge_r = 5.55;

varying vec2 v_xz;

const float C8 = 0.9238795;

void vertex() {
	v_xz = VERTEX.xz;
}

// "corner radius" of the octagon through p (corners at pi/8 + k pi/4)
float oct_r(vec2 p) {
	float a = atan(p.y, p.x);
	float k = round(a / (PI / 4.0));
	vec2 n = vec2(cos(k * PI / 4.0), sin(k * PI / 4.0));
	return dot(p, n) / C8;
}

float line(float d, float w) {
	float aa = fwidth(d) * 0.75;
	return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d));
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

vec3 over(vec3 base, vec3 c, float a) {
	return mix(base, c, clamp(a, 0.0, 1.0));
}

void fragment() {
	vec2 p = v_xz;
	float r = length(p);
	float o = oct_r(p);
	vec3 col;
	float rough = 0.82;
	if (o > rope_c) {
		// apron, outside the ropes
		col = vec3(0.0037, 0.0044, 0.0065);
		col = over(col, vec3(0.08, 0.72, 1.0), line(o - (edge_r - 0.17), 0.025) * 0.35);
	} else {
		float t = clamp((r - 0.4) / (rope_c - 0.4), 0.0, 1.0);
		vec3 c0 = vec3(0.023, 0.033, 0.061);
		vec3 c1 = vec3(0.012, 0.018, 0.034);
		vec3 c2 = vec3(0.007, 0.010, 0.018);
		col = t < 0.6 ? mix(c0, c1, t / 0.6) : mix(c1, c2, (t - 0.6) / 0.4);
		// canvas weave and grain
		// (faded out where it gets finer than a pixel, or it beats into moire bands)
		vec2 wp = p * 80.0;
		vec2 w = fract(wp);
		float fine = 1.0 - smoothstep(0.25, 0.5, max(fwidth(wp.x), fwidth(wp.y)));
		col *= 1.0 - 0.05 * step(0.75, w.y) * fine;
		col += 0.003 * step(0.75, w.x) * fine;
		col *= 0.9 + 0.2 * noise(p * 23.0);
		// scuffs from earlier fights
		col *= 1.0 - 0.18 * smoothstep(0.62, 0.8, noise(p * 1.7 + 4.0)) * smoothstep(3.9, 3.0, r);
		// hazard-striped corners, where the bots get pinned
		float a = atan(p.y, p.x);
		float k = round((a - PI / 8.0) / (PI / 4.0));
		float ca = k * PI / 4.0 + PI / 8.0;
		vec2 corner = vec2(cos(ca), sin(ca)) * rope_c;
		vec2 toward = -normalize(corner);
		float depth = dot(p - corner, toward);
		float cut = 1.15 * cos(PI * 3.0 / 8.0);
		if (depth < cut) {
			vec2 q = mat2(vec2(cos(ca + PI / 4.0), sin(ca + PI / 4.0)), vec2(-sin(ca + PI / 4.0), cos(ca + PI / 4.0))) * (p - corner);
			float s = mod(floor(q.x / 0.14), 2.0);
			col = over(col, s > 0.5 ? vec3(1.0, 0.3, 0.02) : vec3(0.0), s > 0.5 ? 0.2 : 0.25);
		}
		col = over(col, vec3(1.0, 0.3, 0.02), line(depth - cut, 0.03) * 0.45);
		// spokes from the emblem to each post
		float along = dot(p, vec2(cos(ca), sin(ca)));
		float across = dot(p, vec2(-sin(ca), cos(ca)));
		if (along > 2.1 && along < rope_c - 1.0)
			col = over(col, vec3(1.0), line(across, 0.04) * 0.07);
		// dashed inner ring
		float dash = step(0.4, fract(a * 3.6 / 0.5));
		col = over(col, vec3(1.0), line(o - 3.6, 0.04) * 0.07 * dash);
		// the emblem: octagon, gear ring
		if (o < 2.1) col = over(col, vec3(0.0025, 0.003, 0.005), 0.55);
		col = over(col, vec3(1.0, 0.26, 0.02), line(o - 2.1, 0.07) * 0.9);
		col = over(col, vec3(0.08, 0.72, 1.0), line(o - 1.97, 0.022) * 0.6);
		float tooth = step(0.5, fract(a / TAU * 20.0 + 0.25)) * step(1.18, r) * step(r, 1.34);
		col = over(col, vec3(1.0), tooth * 0.13);
		col = over(col, vec3(1.0, 0.26, 0.02), line(r - 1.2, 0.045) * 0.85);
		if (r < 1.08) col = over(col, vec3(0.003, 0.004, 0.007), 0.6);
		// hot orange line right under the ropes
		col = over(col, vec3(1.0, 0.26, 0.02), line(o - rope_c, 0.04) * 0.75);
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	METALLIC = 0.04;
}
