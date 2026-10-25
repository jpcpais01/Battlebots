// The Titan Ring's ropes: steel cables as thick as a man is tall (titan_ring.gd cables()), each a
// ribbon the vertex shader turns to face the lens and shades as a round cable of twisted strands.
// They bow with the same rope physics as the indoor ring's (arena.gd uploads `rope`): pressed
// into a V by a titan leaning on them, swinging free after a slam.
// CUSTOM0 = (rope, t post to post, across -1..1, 0), CUSTOM1.xyz = along the side, UV2 = outward.
shader_type spatial;
render_mode cull_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

uniform vec4 rope[24];
uniform float radius = 0.032;
uniform float flare = 0.0;

varying float v_across;
varying float v_len;
varying vec3 v_world;
varying vec3 v_side;
varying vec3 v_along;

float rope_bow(vec4 rp, float t) {
	float s = clamp(rp.x, 0.08, 0.92);
	float vee = t < s ? t / s : (1.0 - t) / (1.0 - s);
	return rp.y * mix(vee, sin(3.14159265 * t), rp.z);
}

void vertex() {
	int k = int(CUSTOM0.x + 0.5);
	float t = CUSTOM0.y;
	vec3 along = CUSTOM1.xyz;
	vec3 p = VERTEX;
	p.xz += UV2 * rope_bow(rope[k], t);
	// (a little sag between the posts too: a cable this long is never quite straight)
	p.y -= sin(3.14159265 * t) * 0.03;
	vec3 wp = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - wp);
	vec3 side = normalize(cross(along, to_cam));
	wp += side * radius * CUSTOM0.z;
	v_world = wp;
	v_side = side;
	v_along = along;
	v_across = CUSTOM0.z;
	v_len = UV.x;
	VERTEX = (inverse(MODEL_MATRIX) * vec4(wp, 1.0)).xyz;
	NORMAL = (inverse(MODEL_MATRIX) * vec4(to_cam, 0.0)).xyz;
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	float a = clamp(v_across, -1.0, 1.0);
	// the round cable's normal at this point across the ribbon
	vec3 to_cam = normalize(cam - v_world);
	vec3 nw = normalize(v_side * a + to_cam * sqrt(max(1.0 - a * a, 0.0)));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	// twisted strands: a helix of grooves along the cable
	float helix = fract(v_len / 0.09 + a * 0.45);
	float groove = smoothstep(0.0, 0.25, helix) * smoothstep(1.0, 0.75, helix);
	vec3 steel = vec3(0.5, 0.5, 0.52) * (0.6 + 0.4 * groove);
	// greasy and dark at the core of each strand
	steel *= 0.75 + 0.25 * t_noise(vec2(v_len * 4.0, a * 2.0));
	ALBEDO = steel;
	METALLIC = 0.85;
	ROUGHNESS = 0.38 + 0.2 * (1.0 - groove);
	EMISSION = vec3(1.0, 0.6, 0.3) * flare * 0.25;
	FOG = t_haze(v_world, cam);
}
