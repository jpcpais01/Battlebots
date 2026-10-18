// The banners down the middle tier's front wall (titan_build.gd banners()): each in one corner's
// colours, with a pale chevron and a gold edge, rippling in the wind from the top hem down.
// UV = (across 0..1, down 0..1), UV2 = (corner, banner number).
shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);

varying vec3 v_w;
varying vec3 v_n;
varying vec2 v_k;

void vertex() {
	float down = UV.y;
	float ph = UV2.y * 1.7;
	float t = bb_time;
	float sway = (sin(t * 1.3 + ph + down * 2.5) * 0.6 + sin(t * 2.9 + ph * 1.3 + down * 5.0) * 0.4) * down * down * 0.09;
	VERTEX += NORMAL * sway;
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_k = UV2;
}

void fragment() {
	vec2 q = UV;
	vec3 tc = v_k.x < 0.5 ? team0 : team1;
	vec3 c = tc * 0.55;
	// a pale chevron and a gold border; the tail cut into a swallowtail
	float chev = abs(fract(q.y * 2.2 - abs(q.x - 0.5) * 1.4) - 0.5);
	c = mix(c, vec3(0.85, 0.82, 0.75), 1.0 - smoothstep(0.08, 0.1, chev));
	float edge = min(min(q.x, 1.0 - q.x), q.y);
	c = mix(c, vec3(0.75, 0.52, 0.12), 1.0 - smoothstep(0.035, 0.05, edge));
	if (q.y > 0.88 && abs(q.x - 0.5) < (q.y - 0.88) * 3.5) discard;
	// folds catch the light
	float fold = 0.8 + 0.2 * sin(q.x * 18.0 + sin(bb_time * 1.3 + v_k.y) * 2.0);
	vec3 n = normalize(v_n) * (FRONT_FACING ? 1.0 : -1.0);
	ALBEDO = c * fold * t_light(v_w, n, t_rim_light(v_w));
}
