// sites.ts pillarMesh: a soft pillar of light over every venue in its event's colour (CUSTOM0),
// brighter over the one whose card is open (uBoost, by the venue's index in CUSTOM1.y).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform float uBoost[6];

varying vec3 vCol;
varying vec3 vWorld;
varying vec3 vN;
varying float vY;
varying float vBoost;

void vertex() {
	vCol = CUSTOM0.rgb;
	vY = CUSTOM1.x;
	vBoost = uBoost[int(CUSTOM1.y + 0.5)];
	vN = NORMAL;
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	// brightest in the middle of the column (where the eye looks through most of it)
	float core = pow(max(abs(dot(V, normalize(vN))), 0.0), 1.5);
	float rise = fract(vY * 3.0 - uTime * 0.35);
	float k = (1.0 - vY) * (1.0 - vY) * core * (0.75 + 0.25 * smoothstep(0.0, 0.2, rise) * smoothstep(1.0, 0.6, rise));
	k *= 0.16 + 0.3 * vBoost;
	MAP_OUT_ADD(vCol * k * uGlow * 0.6)
}
