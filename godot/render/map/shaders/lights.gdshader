// roads.ts Lights: lamps, reflectors and lanterns along the roads, glowing points coloured
// (CUSTOM0) and sized one by one, with how much each shows by day (CUSTOM1: size, day).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;

void vertex() {
	vec2 aInfo = CUSTOM1.xy;
	float on = mix(aInfo.y, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0));
	vCol = CUSTOM0.rgb * on;
	float z = -(VIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	POINT_SIZE = clamp(aInfo.x * (VIEWPORT_SIZE.y / 1000.0) * 260.0 / z, 1.0, aInfo.x * 2.4);
}

void fragment() {
	float k = smoothstep(0.5, 0.1, length(POINT_COORD - 0.5));
	MAP_OUT_ADD(vCol * k * uGlow * 0.32)
}
