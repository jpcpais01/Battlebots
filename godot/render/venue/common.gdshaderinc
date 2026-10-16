// Shared by the arena's shaders (ports of the web game's three.js materials).
// Globals are driven by the game (project.godot [shader_globals]): the clock, the crowd's hype,
// the boards' strobe, the house-light exposure, the roaming follow-spots and the fog.
global uniform float bb_time;
global uniform float bb_hype;
global uniform float bb_flash;
global uniform float bb_house;
global uniform vec4 bb_spot0;
global uniform vec4 bb_spot1;
global uniform vec4 bb_spot2;
global uniform vec3 bb_fog_color;
global uniform float bb_fog_density;

// house.ts HOUSE_GLSL: spill from the ring on a house surface at world position w
float house_light(vec3 w) {
	float d = length(w.xz);
	float spill = exp(-max(d - 8.0, 0.0) * 0.12) * mix(1.0, 0.5, smoothstep(2.0, 20.0, w.y));
	return bb_house * mix(0.3, 1.0, spill);
}

float spot_k(vec4 sp, vec3 w) {
	return sp.w * smoothstep(sp.z, sp.z * 0.55, distance(w.xz, sp.xy));
}

// three's FogExp2, on view depth
vec4 bb_fog(vec3 view_pos) {
	float d = -view_pos.z * bb_fog_density;
	return vec4(bb_fog_color, 1.0 - exp(-d * d));
}

float bb_hash(float n) { return fract(sin(n) * 43758.5453); }

// The camera's clear view of the fight (render/clear/clear_view.gdshaderinc): VenueMaterials sets
// clear_ok on materials of anything rising above the floor; CLEAR_VIEW opens their fragment().
#include "res://render/clear/clear_view.gdshaderinc"
uniform bool clear_ok = false;
// A shader that can discard loses the GPU's early depth test (hidden pixels get fully shaded
// first), so generated materials start with NO_CLEAR and only the ones marked get the discard.
#ifdef NO_CLEAR
#define CLEAR_VIEW
#else
#define CLEAR_VIEW if (clear_ok && clear_view_gone((INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xz, FRAGCOORD.xy)) discard;
#endif
