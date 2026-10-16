// nature.ts buildClouds: fair-weather cumulus, soft camera-facing billboards (per puff: its centre
// CUSTOM0, size CUSTOM1.x, seed CUSTOM2.x), sunlit on top, grey-violet underneath, banked up on the
// horizon and drifting over the hills, fading out as the camera nears them.
shader_type spatial;
render_mode unshaded, world_vertex_coords, depth_draw_never, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying vec3 vWorld;

void vertex() {
	vec3 aCentre = CUSTOM0.xyz;
	float aSize = CUSTOM1.x;
	vUv = VERTEX.xy;
	vSeed = CUSTOM2.x;
	vec3 c = aCentre + vec3(uTime * 2.2, 0.0, uTime * 0.8);
	// camera-facing quad (offset in view space, as the web does)
	float dist = -(VIEW_MATRIX * vec4(c + uMapShift, 1.0)).z;
	vNear = smoothstep(aSize * 1.2, aSize * 3.5, dist);
	vWorld = c + VERTEX.y * aSize * vec3(0.0, 1.0, 0.0);
	VERTEX = c + uMapShift + (INV_VIEW_MATRIX[0].xyz * VERTEX.x + INV_VIEW_MATRIX[1].xyz * VERTEX.y) * aSize;
}

void fragment() {
	float d = length(vUv);
	// a lumpy edge
	float edge = texture(uNoise, vUv * 0.35 + vSeed * 7.0).g;
	float a = smoothstep(1.0, 0.55, d + (edge - 0.5) * 0.45);
	// flat-ish base
	a *= smoothstep(-0.95, -0.55, vUv.y);
	if (a < 0.01) discard;
	// light: bright warm top, cool shaded underside, the low sun's side lit
	float top = clamp(vUv.y * 0.6 + 0.5, 0.0, 1.0);
	// (by night: lit from below, faintly, by the city)
	vec3 lit = uSunCol * 0.42 + mix(vec3(0.42, 0.42, 0.45), vec3(0.05, 0.05, 0.09), uNight);
	vec3 shade = mix(vec3(0.56, 0.55, 0.66), vec3(0.13, 0.08, 0.17), uNight);
	vec3 c = mix(shade, lit, smoothstep(0.15, 0.85, top + (edge - 0.5) * 0.3));
	MAP_OUT(c)
	// (thinner at night, so they don't blot out the city's lights)
	ALPHA = a * 0.92 * vNear * (1.0 - 0.5 * uNight);
}
