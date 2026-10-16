// The flame cannons' fire and smoke (show.ts buildPyro): point sprites launched from the odd
// emitters for as long as each burns, premultiplied so the flames add light while the smoke after
// them darkens what is behind. emit[i] = (x, z, start, duration), set by show.gd fire().
// CUSTOM0.x aE (emitter), CUSTOM1 aR (four randoms), CUSTOM2.x aK (0 flame, 1 smoke).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform vec4 emit[8];
uniform float glow = 2.2;
// bowl.ts FLOOR (uFloor: "floor" is a built-in function here)
uniform float floor_y = -0.62;

varying float v_heat;
varying float v_a;
varying float v_smoke;
varying float v_seed;
varying float v_k;

float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y);
}

void vertex() {
	vec4 a_r = CUSTOM1;
	float a_k = CUSTOM2.x;
	vec4 em = emit[int(CUSTOM0.x + 0.5)];
	float L = a_k > 0.5 ? 2.4 : 0.95;
	float age = bb_time - em.z;
	// a steady stream for as long as the cannon burns: each particle relaunches every L seconds
	float tau = mod(age - a_r.x * L, L);
	float born = age - tau;
	float alive = step(0.0, born) * step(born, em.w);
	float k = tau / L;
	vec3 base = vec3(em.x, floor_y + 0.5, em.y);
	vec3 p;
	float size;
	if (a_k < 0.5) {
		// a jet that leaves the nozzle tight and fast, slows, and blooms into a rolling ball
		float rise = 15.0 * tau - 7.0 * tau * tau;
		float spread = 0.06 + 1.5 * k * k + 0.25 * k;
		float a = a_r.y * 6.2831853 + tau * (2.5 + a_r.z * 3.0);
		float rr = spread * sqrt(a_r.z);
		p = base + vec3(cos(a) * rr, rise + (a_r.w - 0.5) * 0.6 * k, sin(a) * rr);
		size = 0.32 + 2.1 * k * (0.7 + 0.6 * a_r.w);
		// hottest in the jet's core, cooling as it climbs and spreads
		v_heat = (1.0 - k) * (1.15 - 0.5 * sqrt(a_r.z));
		v_a = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.55, 1.0, k));
		v_smoke = 0.0;
	} else {
		// the smoke the fireball leaves behind, rising and spreading out
		float a = a_r.y * 6.2831853;
		float rr = 0.4 + 1.3 * k * a_r.z;
		p = base + vec3(cos(a) * rr, 5.5 + 3.0 * tau + a_r.w * 0.8, sin(a) * rr);
		size = 1.2 + 2.6 * k;
		v_heat = 0.25 * (1.0 - smoothstep(0.0, 0.2, k));
		v_a = smoothstep(0.0, 0.18, k) * (1.0 - k) * 0.55;
		v_smoke = 1.0;
	}
	v_seed = a_r.y * 37.0 + a_r.w * 11.0;
	v_k = k;
	v_a *= alive;
	vec4 mv = MODELVIEW_MATRIX * vec4(p, 1.0);
	POINT_SIZE = alive * VIEWPORT_SIZE.y * size / -mv.z;
	POSITION = alive > 0.0 ? PROJECTION_MATRIX * mv : vec4(2.0, 2.0, 2.0, 1.0);
}

void fragment() {
	vec2 d = POINT_COORD - 0.5;
	d.y = -d.y;
	// billowing edge: the sprite's outline and its inside both churn as it rises
	vec2 q = d * 3.0 + vec2(v_seed, v_seed * 0.7 - bb_time * 2.0);
	float n = noise(q) * 0.65 + noise(q * 2.3 + 5.0) * 0.35;
	float r = length(d) * 2.0 + (n - 0.5) * 0.55;
	float body = 1.0 - smoothstep(0.45, 1.0, r);
	if (body <= 0.0) discard;
	vec3 c;
	float a;
	if (v_smoke > 0.5) {
		a = body * v_a * (0.6 + 0.6 * n);
		c = mix(vec3(0.05, 0.05, 0.055), vec3(0.9, 0.35, 0.08), v_heat) * (0.5 + 0.5 * n) * a;
	} else {
		// temperature to colour: deep red, orange, yellow, white-hot core
		float t = clamp(v_heat * (0.55 + 0.75 * body) * (0.75 + 0.5 * n), 0.0, 1.2);
		c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.3, 0.02), smoothstep(0.0, 0.35, t));
		c = mix(c, vec3(1.0, 0.72, 0.18), smoothstep(0.35, 0.7, t));
		c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.1, t));
		float b = body * v_a;
		c *= b * glow * (0.45 + 0.55 * t);
		// light adds up; the cooler outer flame and soot hold back a little of what is behind
		a = b * 0.25 * (1.0 - t * 0.6) + b * 0.35 * v_k * v_k;
	}
	// premultiplied (One, OneMinusSrcAlpha), like the web's custom blend
	ALBEDO = c;
	ALPHA = a;
}
