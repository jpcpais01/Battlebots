// The moving heads' lenses (show.ts buildBeams lensMat): additive points in the beams' colour and
// level, driven by the same uniforms as show_beams. CUSTOM0.xy aId (index, side).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float level = 0.0;
uniform float fan = 0.0;
uniform float focus = 0.0;
uniform float strobe = 0.0;
uniform float mono = 0.0;
uniform float white = 0.0;
uniform vec3 col_a = vec3(1.0, 0.195, 0.014);
uniform vec3 col_b = vec3(0.05, 0.745, 1.0);
uniform vec3 col_m = vec3(1.0, 0.905, 0.745);
uniform float glow = 1.6;

varying vec3 v_c;

void vertex() {
	vec2 a_id = CUSTOM0.xy;
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	float st = mix(1.0, step(0.45, fract(bb_time * 6.0 + a_id.x * 0.37)), strobe);
	v_c = mix(mix(mix(col_a, col_b, a_id.y), col_m, mono), vec3(1.0), 0.5 + 0.5 * white) * (0.25 + level) * st;
	POINT_SIZE = min(VIEWPORT_SIZE.y * 0.55 / -mv.z, VIEWPORT_SIZE.y * 0.12);
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	CLEAR_VIEW
	vec2 d = POINT_COORD - 0.5;
	float r = dot(d, d);
	if (r > 0.25) discard;
	ALBEDO = v_c * glow * smoothstep(0.25, 0.02, r);
	ALPHA = 1.0;
}
