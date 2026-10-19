// holo.ts holoRobot: the plaza's giant holographic fighting robot shadow-boxing, its boxes posed
// by eleven bone matrices (uBones, posed by render/map/world_map.gd each frame) by the bone in
// CUSTOM0.x (CUSTOM0.y: a bright part, the visor and core), a slice glitching sideways now and then.
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform mat4 uBones[11];
uniform float uBase;

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
varying float vBright;
varying float vHeight;

void vertex() {
	vUv = UV;
	vBright = CUSTOM0.y;
	mat4 B = uBones[int(CUSTOM0.x + 0.5)];
	vec4 w = B * vec4(VERTEX, 1.0);
	vN = normalize(mat3(B) * NORMAL);
	// now and then a slice of it glitches sideways
	float slot = floor(uTime * 7.0);
	float g = fract(sin(slot * 91.7) * 4375.85);
	float band = floor(w.y / 9.0);
	float hit = step(0.86, g) * step(0.6, fract(sin(band * 12.9 + slot) * 437.5));
	w.x += hit * (fract(sin(slot * 7.1 + band) * 91.3) - 0.5) * 9.0;
	vHeight = w.y;
	vWorld = w.xyz;
	VERTEX = w.xyz + uMapShift;
}

void fragment() {
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	float rim = pow(max(1.0 - abs(dot(V, normalize(vN))), 0.0), 1.6);
	vec2 px = fwidth(vUv);
	// every plate outlined, like a wireframe
	vec2 e = min(vUv, 1.0 - vUv);
	float edge = max(fband(e.x, 0.0, 0.05, px.x), fband(e.y, 0.0, 0.05, px.y));
	float h = clamp((vHeight - uBase) / 115.0, 0.0, 1.0);
	vec3 col = mix(vec3(0.3, 0.9, 1.0), vec3(1.0, 0.35, 0.8), smoothstep(0.15, 0.95, h));
	float k = 0.1 + rim * 0.5 + edge * 0.9 + vBright * 1.4;
	k *= scanline(vWorld.y, 2.5);
	// the odd flicker
	k *= 0.75 + 0.25 * step(0.06, fract(sin(floor(uTime * 13.0) * 12.7) * 4375.8));
	MAP_OUT_ADD(col * k * holoLevel() * 0.14)
}
