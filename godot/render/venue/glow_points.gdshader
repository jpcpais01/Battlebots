// Phone lights and camera flashes in the stands (crowd.ts glowPoints): additive round points
// sized by distance, twinkling with the crowd's hype (steady: just lamps).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float size = 0.06;
uniform float glow = 2.0;
uniform float density = 0.016;
uniform bool steady = false;

varying vec3 v_c;
varying float v_a;
varying float v_f;

void vertex() {
	v_c = COLOR.rgb;
	float s = fract(sin(dot(VERTEX.xz, vec2(12.9898, 78.233))) * 43758.5453);
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	float fd = density * -mv.z;
	float fog = exp(-fd * fd);
	float sz = size;
	if (steady) {
		v_a = fog;
		v_f = 0.0;
	} else {
		v_a = (0.45 + 0.55 * sin(bb_time * (2.0 + s * 3.0) + s * 40.0) * (0.5 + bb_hype)) * fog;
		mv.y += max(0.0, sin(bb_time * 5.0 + s * 30.0)) * 0.2 * bb_hype;
		// camera flashes, more of them when the fight heats up
		float f = step(1.0 - 0.0005 * (0.3 + bb_hype), fract(sin(floor(bb_time * 12.0) * 1.7 + s * 917.0) * 43758.5453));
		v_f = f;
		v_a = mix(v_a, fog, f);
		sz *= 1.0 + f * 1.5;
	}
	POINT_SIZE = min(VIEWPORT_SIZE.y * sz / -mv.z, VIEWPORT_SIZE.y * 0.08);
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	vec2 d = POINT_COORD - 0.5;
	float r = dot(d, d);
	if (r > 0.25) discard;
	float a = smoothstep(0.25, 0.0, r) * v_a;
	ALBEDO = mix(v_c, vec3(1.0, 0.97, 0.92) * 1.8, v_f) * glow * a;
	ALPHA = a;
}
