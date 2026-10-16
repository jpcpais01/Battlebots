// sea.ts buildSea: the sea out to the horizon (map_sea.gdshaderinc seaColor), drawn after the
// land so the hidden sea floor costs nothing.
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_sea.gdshaderinc"

varying vec3 vWorld;

void vertex() {
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	MAP_OUT(seaColor(vWorld, 0.0, CAMERA_POSITION_WORLD))
}
