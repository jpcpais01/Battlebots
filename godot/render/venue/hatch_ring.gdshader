// The glowing ring round each corner's lift hatch (corners.ts): a seam and a dashed band,
// with two bright heads racing round when the corner runs hot (spin, chase).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform vec3 color = vec3(1.0);
uniform float glow = 1.4;
uniform float spin = 0.0;
uniform float chase = 0.0;
uniform float r = 0.74;

varying vec2 v_p;

void vertex() {
	v_p = VERTEX.xy;
}

void fragment() {
	CLEAR_VIEW
	float rr = length(v_p) - r;
	float a = atan(v_p.y, v_p.x) / 6.2831853;
	float seam = smoothstep(0.0, 0.006, rr) * (1.0 - smoothstep(0.016, 0.024, rr));
	float band = smoothstep(0.034, 0.04, rr) * (1.0 - smoothstep(0.07, 0.076, rr));
	float seg = fract(a * 24.0 + spin);
	float dash = band * smoothstep(0.0, 0.06, seg) * (1.0 - smoothstep(0.52, 0.58, seg));
	float head = pow(0.5 + 0.5 * cos((a - spin * 0.25) * 12.566371), 6.0);
	float k = seam * (0.8 + chase) + dash * (0.35 + head * chase * 2.5);
	ALBEDO = color * k * glow;
}
