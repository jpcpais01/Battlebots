// roads.ts traffic: cars on the country roads, points that look their road up in a float texture
// (two rows a road: centre line, then direction). Per car: road, phase, speed and way, lane offset
// (CUSTOM0), and the road's length (CUSTOM1.x).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform sampler2D uPath : filter_nearest, repeat_disable;
// roadnet.ts STEP
const float STEP = 4.0;

varying vec3 vCol;

void vertex() {
	vec4 aCar = CUSTOM0;
	float aLen = CUSTOM1.x;
	int row = int(aCar.x + 0.5) * 2;
	float dir = sign(aCar.z);
	float s = fract(aCar.y + uTime * aCar.z / aLen) * aLen;
	float f = s / STEP;
	int i0 = int(floor(f));
	float t = fract(f);
	int i1 = min(i0 + 1, int(aLen / STEP + 0.5));
	vec3 p = mix(texelFetch(uPath, ivec2(i0, row), 0).xyz, texelFetch(uPath, ivec2(i1, row), 0).xyz, t);
	vec2 tg = normalize(mix(texelFetch(uPath, ivec2(i0, row + 1), 0).xy, texelFetch(uPath, ivec2(i1, row + 1), 0).xy, t));
	// (right-hand traffic: the lane offset is to the right of the way the car goes)
	p.xz += vec2(-tg.y, tg.x) * aCar.w;
	float fade = smoothstep(0.0, 24.0, s) * smoothstep(aLen, aLen - 24.0, s);
	vCol = (dir > 0.0 ? vec3(1.0, 0.88, 0.7) : vec3(1.0, 0.12, 0.08)) * fade;
	VERTEX = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	float z = -(VIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	POINT_SIZE = clamp(2.2 * (VIEWPORT_SIZE.y / 1000.0) * 260.0 / z, 1.2, 6.0) * fade;
}

void fragment() {
	float k = smoothstep(0.5, 0.15, length(POINT_COORD - 0.5));
	MAP_OUT_ADD(vCol * k * uGlow * 0.3)
}
