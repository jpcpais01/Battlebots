// sites.ts ferryBoat: the island ferry's wake, a foamy V trailing behind it (the boat moves it).
shader_type spatial;
render_mode unshaded, depth_draw_never, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec2 vUv;
varying vec3 vWorld;

void vertex() {
	vUv = UV;
	VERTEX.x *= mix(1.0, 0.3, UV.y);
	vWorld = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz - uMapShift;
}

void fragment() {
	float edge = abs(vUv.x - 0.5) * 2.0;
	float foam = texture(uNoise, vWorld.xz / 6.0).r;
	float a = smoothstep(0.2, 0.95, edge) * smoothstep(1.0, 0.5, edge) + (1.0 - smoothstep(0.0, 0.25, edge)) * 0.5;
	a *= vUv.y * vUv.y * (0.5 + foam * 0.7) * 0.8;
	MAP_OUT(vec3(0.95) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.4))
	ALPHA = a;
}
