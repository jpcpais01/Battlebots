// Draws ContactAO's floor map: the robots' occlusion on the plane y = 0 (ao.ts mapMesh).
shader_type canvas_item;
render_mode unshaded, blend_disabled;
#include "res://render/ao/contact_ao.gdshaderinc"

const float MAP_STRENGTH = 2.0;

void fragment() {
	vec3 p = vec3((UV.x * 2.0 - 1.0) * AO_MAP_HALF, 0.0, (UV.y * 2.0 - 1.0) * AO_MAP_HALF);
	COLOR = vec4(ao_spheres_all(p, vec3(0.0, 1.0, 0.0), MAP_STRENGTH), 0.0, 0.0, 1.0);
}
