// kit.ts glowMaterial: self-lit vertex colours (lamps, neon, lit windows), scaled by the glow and
// dusk levels. Colours in CUSTOM0, a MultiMesh's instance colour in COLOR.
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;
varying vec3 vWorld;

void vertex() {
	vCol = CUSTOM0.rgb * COLOR.rgb;
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	float k = mix(0.55, 1.0, uDusk) * uGlow;
	MAP_OUT(vCol * k)
}
