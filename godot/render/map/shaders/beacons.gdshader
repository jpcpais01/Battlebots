// city.ts beacons: the red warning lights on the tall towers and masts, blinking.
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying float vOn;

void vertex() {
	vOn = 0.25 + 0.75 * smoothstep(0.6, 1.0, sin(uTime * 2.4 + VERTEX.x * 0.13));
	float z = -(VIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	POINT_SIZE = clamp(5.0 * (VIEWPORT_SIZE.y / 1000.0) * 260.0 / z, 1.5, 9.0);
}

void fragment() {
	float k = smoothstep(0.5, 0.1, length(POINT_COORD - 0.5));
	MAP_OUT_ADD(vec3(1.0, 0.15, 0.1) * k * vOn * uGlow * 0.6)
}
