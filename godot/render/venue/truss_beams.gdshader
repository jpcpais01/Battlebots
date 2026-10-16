// The truss lamps' light shafts (arena.ts buildBeams), panning side to side round the ring.
// CUSTOM0.x aAlong (0 at the lamp, 1 on the floor), CUSTOM1 aSway (pivot xyz, phase).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform vec3 color = vec3(1.0);
uniform float cut = 0.6;

varying float v_y;

// rotate about axis k (unit) by angle a
vec3 rot(vec3 v, vec3 k, float a) {
	float c = cos(a), s = sin(a);
	return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

void vertex() {
	vec4 sw = CUSTOM1;
	vec3 k = normalize(vec3(sw.x, 0.0, sw.z));
	float ang = sin(bb_time * 0.3 + sw.w) * 0.03;
	VERTEX = sw.xyz + rot(VERTEX - sw.xyz, k, ang);
	NORMAL = rot(NORMAL, k, ang);
	v_y = 1.0 - CUSTOM0.x * cut;
}

void fragment() {
	float edge = pow(abs(dot(normalize(NORMAL), normalize(VIEW))), 1.5);
	float k = edge * (0.03 + 0.12 * v_y * v_y);
	ALBEDO = color * 2.0 * k * k * smoothstep(1.0 - cut, 1.0 - cut + 0.22, v_y);
}
