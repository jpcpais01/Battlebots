// city.ts traffic: cars on every street (a warm white stream one way, red tail lights the other,
// like a long exposure) and flying cars on sky lanes over the avenues: points moved here. Per
// car: the street's ends (CUSTOM0.xy, CUSTOM1.xy) and phase, speed, offset across, kind (CUSTOM2).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform float uCarY = 3.9;

varying vec3 vCol;

void vertex() {
	vec2 aA = CUSTOM0.xy, aB = CUSTOM1.xy;
	vec4 aCar = CUSTOM2;
	vec2 d = aB - aA;
	float len = length(d);
	vec2 dir = d / len;
	vec2 across = vec2(-dir.y, dir.x);
	bool air = aCar.w >= 2.0;
	float off = air ? mod(aCar.z + 500.0, 1000.0) - 500.0 : aCar.z;
	float alt = air ? floor((aCar.z + 500.0) / 1000.0) : 0.0;
	float side = sign(off);
	float t = fract(aCar.x + uTime * aCar.y / len * side);
	vec3 p = vec3(aA + d * t + across * off, 0.0).xzy;
	p.y = air ? alt + sin(uTime * 0.7 + aCar.x * 40.0) * 1.5 : uCarY;
	// fade in and out at the ends of the street
	float fade = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
	if (air) {
		float h = fract(aCar.w);
		vCol = (h < 0.4 ? vec3(0.25, 0.94, 1.0) : h < 0.75 ? vec3(1.0, 0.25, 0.64) : vec3(1.0, 0.85, 0.5)) * 1.6;
	} else {
		vCol = side > 0.0 ? vec3(1.0, 0.88, 0.7) : vec3(1.0, 0.12, 0.08);
	}
	vCol *= fade;
	VERTEX = p + uMapShift;
	float z = -(VIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	// (sizes in pixels at a 1000 px tall screen: city.ts setPixelScale)
	POINT_SIZE = clamp((air ? 3.4 : 2.2) * (VIEWPORT_SIZE.y / 1000.0) * 260.0 / z, 1.2, air ? 9.0 : 6.0) * fade;
}

void fragment() {
	vec2 c = POINT_COORD - 0.5;
	float k = smoothstep(0.5, 0.15, length(c));
	MAP_OUT_ADD(vCol * k * uGlow * 0.3)
}
