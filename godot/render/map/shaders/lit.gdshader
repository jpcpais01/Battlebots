// kit.ts litMaterial: matte props lit by the map's sun, sky and shadows. Vertex colours ride in
// CUSTOM0 (floats: Godot keeps COLOR in 8 bits); a MultiMesh's instance colour arrives in COLOR
// (white on a plain mesh), as three's instanceColor multiplies in.
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;

void vertex() {
	vCol = CUSTOM0.rgb * COLOR.rgb;
	vN = normalize(NORMAL);
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	vec3 c = vCol * mapLight(normalize(vN), vWorld);
	MAP_OUT(c)
}
