// houses.ts windowMaterial: the houses' panes, glass reflecting the sky by day, lit warm at night
// (colour black: never lit). Pulled forward in depth like three's polygonOffset(-2, -8).
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;

void vertex() {
	vCol = CUSTOM0.rgb;
	vN = normalize(NORMAL);
	vWorld = VERTEX - uMapShift;
	POLY_OFFSET(8.0)
}

void fragment() {
	vec3 n = normalize(vN);
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	float fres = 0.1 + 0.9 * pow(1.0 - max(dot(V, n), 0.0), 4.0);
	vec3 glass = mix(vec3(0.05, 0.06, 0.08), skyCol(reflect(-V, n)), 0.35 * fres + 0.1) * (0.5 + 0.5 * cloudShade(vWorld.xz));
	float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
	float on = step(0.002, vCol.r + vCol.g + vCol.b);
	vec3 c = mix(glass, vCol * uGlow * 0.32, on * (0.3 + 0.7 * night));
	MAP_OUT(c)
}
