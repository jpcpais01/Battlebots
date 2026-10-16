// terrain.ts farMaterial: the coarse hills and mountains out to the horizon, plain lit vertex
// colours (in CUSTOM0).
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;

void vertex() {
	vCol = CUSTOM0.rgb;
	vN = NORMAL;
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	vec3 n = normalize(vN);
	vec3 c = vCol * (0.9 + 0.15 * texture(uNoise, vWorld.xz / 300.0).g);
	float cs = cloudShade(vWorld.xz);
	c *= ambient(n) * mix(0.82, 1.0, cs) + uSunCol * max(dot(n, uSunDir), 0.0) * cs;
	MAP_OUT(c)
}
