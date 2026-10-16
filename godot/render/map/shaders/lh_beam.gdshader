// city.ts lighthouseBeam: the lighthouse's two soft beams sweeping round (the node turns).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying float vAlong;

void vertex() {
	vAlong = VERTEX.x / 160.0;
}

void fragment() {
	float k = (1.0 - vAlong) * (1.0 - vAlong) * 0.22 * (0.4 + 0.6 * uDusk);
	MAP_OUT_ADD(vec3(1.0, 0.9, 0.7) * k)
}
