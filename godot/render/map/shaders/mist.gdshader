// sites.ts mistMesh: the spray at the foot of the falls and off the rapids below, soft puffs
// (CUSTOM0: centre and size) rising and fading, facing the camera.
shader_type spatial;
render_mode unshaded, world_vertex_coords, depth_draw_never, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec2 vUv;
varying float vSeed;

void vertex() {
	vec4 aPuff = CUSTOM0;
	vUv = VERTEX.xy;
	vSeed = aPuff.x * 0.37 + aPuff.z * 0.11;
	float t = fract(uTime * 0.12 + vSeed);
	vec3 c = aPuff.xyz + vec3(0.0, t * 14.0, 0.0);
	float s = aPuff.w * (0.7 + 0.6 * t);
	VERTEX = c + uMapShift + (INV_VIEW_MATRIX[0].xyz * VERTEX.x + INV_VIEW_MATRIX[1].xyz * VERTEX.y) * s;
}

void fragment() {
	float t = fract(uTime * 0.12 + vSeed);
	float a = smoothstep(1.0, 0.2, length(vUv)) * (texture(uNoise, vUv * 0.4 + vSeed).g * 0.6 + 0.4);
	a *= smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.5, t) * 0.55;
	vec3 c = vec3(0.92, 0.95, 1.0) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4);
	MAP_OUT(c)
	ALPHA = a;
}
