// city.ts lamps: street lamps, warm points along the kerbs, faint by day, bright at night.
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying float vOn;
varying vec3 vCol;

void vertex() {
	vOn = mix(0.05, 1.0, clamp((uDusk - 0.55) / 0.45, 0.0, 1.0));
	// most are sodium orange, some newer white ones
	vCol = fract(sin(dot(VERTEX.xz, vec2(12.9, 78.2))) * 43758.5) < 0.3 ? vec3(0.85, 0.92, 1.0) : vec3(1.0, 0.68, 0.32);
	float z = -(VIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	POINT_SIZE = clamp(2.6 * (VIEWPORT_SIZE.y / 1000.0) * 260.0 / z, 1.0, 6.0);
}

void fragment() {
	float k = smoothstep(0.5, 0.1, length(POINT_COORD - 0.5));
	MAP_OUT_ADD(vCol * k * vOn * uGlow * 0.3)
}
