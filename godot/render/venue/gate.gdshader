// The tunnel gates' energy curtain (venue.ts): a rim, scan lines, a sheen, and ripples where a
// robot pushes through (hit: world point, strength).
shader_type spatial;
// (a ShaderMaterial without fog on the web)
render_mode unshaded, cull_back, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform vec3 color = vec3(1.0);
uniform vec2 size = vec2(1.0);
uniform vec4 hit = vec4(0.0, -100.0, 0.0, 0.0);

varying vec3 w_pos;

void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 m = UV * size;
	float t = bb_time;
	float rim = smoothstep(0.12, 0.0, min(min(m.x, size.x - m.x), size.y - m.y));
	float scan = smoothstep(0.75, 1.0, sin(m.y * 18.0 - t * 3.0) * 0.5 + 0.5);
	float sheen = 0.5 + 0.5 * sin(m.x * 4.0 + t * 1.3 + sin(m.y * 3.0 - t * 2.1) * 1.5);
	float d = distance(w_pos, hit.xyz);
	float h = hit.w * exp(-d * d * 1.2) * (0.65 + 0.35 * sin(d * 16.0 - t * 12.0));
	float k = rim * 1.1 + scan * 0.22 + sheen * 0.12 + h * 1.6;
	ALBEDO = vec3(0.006, 0.008, 0.014) + color * k;
}
