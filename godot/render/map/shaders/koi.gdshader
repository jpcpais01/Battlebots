// holo.ts holoKoi: a giant holographic koi swimming slow circles round the mega-towers, its body
// following the circle and rippling side to side.
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform vec3 uCentre;

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;

void vertex() {
	vUv = UV;
	float L = 90.0;
	float R = 160.0;
	// swims a slow circle; the body follows the circle and ripples side to side
	float a0 = uTime * 0.075;
	float t = -VERTEX.x;
	float a = a0 - t * L / R;
	float wig = sin(uTime * 2.2 - t * 5.0) * 0.06 * (0.3 + t);
	float rr = R + wig * L;
	vec3 c = uCentre + vec3(cos(a) * rr, sin(uTime * 0.4 - t * 2.0) * 6.0, sin(a) * rr);
	vec3 side = vec3(cos(a), 0.0, sin(a));
	vec3 p = c + vec3(0.0, VERTEX.y * L, 0.0) + side * VERTEX.z * L;
	vN = normalize(side * VERTEX.z + vec3(0.0, VERTEX.y, 0.0) + 1e-4);
	vWorld = p;
	VERTEX = p + uMapShift;
}

void fragment() {
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	float rim = vUv.y > 1.5 ? 0.6 : pow(1.0 - abs(dot(V, normalize(vN))), 2.0);
	// koi patches: orange on white-cyan
	float spot = step(0.55, texture(uNoise, vUv * vec2(1.3, 0.5) + 0.3).g);
	vec3 col = mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 0.45, 0.25), spot);
	float k = (0.25 + rim) * scanline(vWorld.y, 2.0) * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.x * 9.0));
	MAP_OUT_ADD(col * k * holoLevel() * 0.18)
}
