// Spark fountains (gerbs) on the even emitters and embers off the flames on the odd ones
// (show.ts buildPyro sparkMat): one quad per spark, stretched in view space from where it was a
// moment ago to where it is, along a ballistic path with drag. emit[] as in pyro_fire.
// VERTEX.xy: the quad (x 0 tail .. 1 head, y -1..1 across); CUSTOM0.x aE, CUSTOM1 aR.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform vec4 emit[8];
uniform float glow = 2.4;
// bowl.ts FLOOR (uFloor: "floor" is a built-in function here)
uniform float floor_y = -0.62;

varying vec3 v_c;
varying float v_a;
varying float v_v;

// where a spark launched at the nozzle is tau seconds later
vec3 at(vec3 base, vec3 v, float tau, float drag, float g) {
	float f = (1.0 - exp(-drag * tau)) / drag;
	return base + vec3(v.x * f, v.y * f - g * (tau - f) / drag, v.z * f);
}

void vertex() {
	float a_e = CUSTOM0.x;
	vec4 a_r = CUSTOM1;
	vec4 em = emit[int(a_e + 0.5)];
	bool ember = mod(a_e, 2.0) > 0.5;
	float L = ember ? 1.8 : 1.25 + a_r.w * 0.45;
	float age = bb_time - em.z;
	float tau = mod(age - a_r.x * L, L);
	float born = age - tau;
	float alive = step(0.0, born) * step(born, em.w);
	float k = tau / L;
	float a = a_r.y * 6.2831853;
	vec3 base, v;
	float drag, g;
	if (ember) {
		// embers flung from the fireball, drifting up in its heat
		base = vec3(em.x, floor_y + 2.5 + a_r.z * 3.0, em.y);
		float s = 1.0 + a_r.z * 3.0;
		v = vec3(cos(a) * s, 2.0 + a_r.w * 4.0, sin(a) * s);
		drag = 1.6;
		g = -1.5;
	} else {
		// a tight, tall fountain with a few wild ones
		float s = (0.15 + 0.9 * a_r.z * a_r.z) * (a_r.w > 0.92 ? 3.0 : 1.0);
		base = vec3(em.x, floor_y + 0.36, em.y);
		v = vec3(cos(a) * s, 9.5 + a_r.w * 4.0, sin(a) * s);
		drag = 0.55;
		g = 9.8;
	}
	vec3 head = at(base, v, tau, drag, g);
	vec3 tail = at(base, v, max(0.0, tau - (ember ? 0.06 : 0.045)), drag, g);
	alive *= step(floor_y, head.y);
	vec4 hv = MODELVIEW_MATRIX * vec4(head, 1.0), tv = MODELVIEW_MATRIX * vec4(tail, 1.0);
	vec4 pv = mix(tv, hv, VERTEX.x);
	// widen across the streak in view space, so it always faces the camera
	vec2 dir = hv.xy - tv.xy;
	float len = length(dir);
	vec2 side = len > 1e-4 ? vec2(-dir.y, dir.x) / len : vec2(1.0, 0.0);
	float width = ember ? 0.022 : 0.014 + 0.01 * (1.0 - k);
	pv.xy += side * VERTEX.y * width;
	POSITION = alive > 0.0 ? PROJECTION_MATRIX * pv : vec4(2.0, 2.0, 2.0, 1.0);
	v_v = VERTEX.x;
	// white-hot when fresh, gold, then orange and crackling out at the end
	v_c = ember ? mix(vec3(1.0, 0.6, 0.2), vec3(0.9, 0.18, 0.02), k) : mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.5, 0.1), smoothstep(0.2, 1.0, k));
	float crackle = mix(1.0, step(0.45, bb_hash(a_r.y * 91.0 + floor(bb_time * 24.0))) * 1.8, smoothstep(0.6, 0.8, k));
	v_a = alive * (1.0 - k * k) * crackle;
}

void fragment() {
	// bright at the head, fading along the tail
	ALBEDO = v_c * v_a * glow * (0.25 + 0.75 * v_v);
	ALPHA = 1.0;
}
