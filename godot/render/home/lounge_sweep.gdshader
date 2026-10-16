// Car headlights down in the street throwing the window's shape up across the lounge's ceiling as
// they pass, through the rain on the glass (src/render/home/lounge.ts SWEEP_FRAG); added on.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

global uniform float bb_time;
uniform sampler2D noise : filter_linear_mipmap, repeat_enable;
uniform vec3 col = vec3(0.09, 0.0792, 0.063);
// lounge.ts WIN.z: the glass
const float WIN_Z = -2.38;

varying vec3 w_pos;

void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float h11(float n) {
	return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

void fragment() {
	float c = bb_time / 7.0;
	float id = floor(c);
	// part of each spell passes with no car at all
	float u = fract(c) * (1.5 + h11(id * 1.3));
	float go = h11(id * 3.7) > 0.5 ? 1.0 : -1.0;
	float k = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.7, 1.0, u)) * (0.6 + 0.4 * h11(id * 5.1));
	float d = max(0.0, w_pos.z - WIN_Z);
	float px = go * mix(-6.5, 6.5, clamp(u, 0.0, 1.0));
	float x = w_pos.x - px + go * d * 0.7;
	float lit = (1.0 - smoothstep(0.7, 2.6, abs(x))) * (1.0 - smoothstep(0.3, 3.4, d));
	float span = 1.8 + d * 0.5;
	float m = abs(fract((w_pos.x - px * 0.2 + 3.6) / span) - 0.5) * span;
	float bars = smoothstep(0.02, 0.1 + d * 0.03, m);
	float rain = 0.5 + 0.9 * texture(noise, vec2(w_pos.x * 0.5, w_pos.z * 0.35 - bb_time * 0.12)).g;
	ALBEDO = col * (lit * bars * rain * k);
}
