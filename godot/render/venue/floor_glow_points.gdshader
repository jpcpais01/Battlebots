// Lamps round the arena floor (floor.ts lampPoints): additive round points sized by distance.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float size = 0.16;
uniform float glow = 1.6;

varying vec3 v_c;

void vertex() {
	v_c = COLOR.rgb;
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	POINT_SIZE = VIEWPORT_SIZE.y * size / -mv.z;
}

void fragment() {
	vec2 d = POINT_COORD - 0.5;
	float r = dot(d, d);
	if (r > 0.25) discard;
	float a = smoothstep(0.25, 0.0, r);
	ALBEDO = v_c * a * glow * (0.8 + 0.3 * bb_hype);
	ALPHA = a;
}
