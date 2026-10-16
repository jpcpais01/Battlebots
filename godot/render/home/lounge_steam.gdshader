// Steam curling up off the lounge robot's coffee, always turned to the camera
// (src/render/home/lounge.ts STEAM_VERT / STEAM_FRAG).
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

global uniform float bb_time;
uniform sampler2D noise : filter_linear_mipmap, repeat_enable;
uniform float opacity = 0.5;
uniform vec3 color = vec3(0.905, 0.791, 0.687);

void vertex() {
	// a sheet standing up off its origin, swung round about the vertical to face the camera
	vec3 c = MODEL_MATRIX[3].xyz;
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	float s = length(MODEL_MATRIX[0].xyz);
	vec3 w = c + right * VERTEX.x * s + vec3(0.0, VERTEX.y * s, 0.0);
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(w, 1.0);
}

void fragment() {
	float t = bb_time;
	// (the baked uvs are three's: v 0 at the foot of the sheet)
	vec2 uv = UV;
	float y = uv.y;
	float sway = (sin(y * 5.0 - t * 1.6) * 0.12 + sin(y * 11.0 - t * 2.7) * 0.04) * y;
	float x = uv.x - 0.5 - sway;
	float width = 0.1 + 0.32 * y;
	float body = 1.0 - smoothstep(width * 0.3, width, abs(x));
	float n = texture(noise, vec2(uv.x * 0.5 + t * 0.02, y * 0.6 - t * 0.25)).r;
	float n2 = texture(noise, vec2(uv.x * 1.3 - t * 0.03, y * 1.4 - t * 0.45)).g;
	float a = body * smoothstep(0.38, 0.8, n * 0.6 + n2 * 0.5) * smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.45, 1.0, y));
	ALBEDO = color;
	ALPHA = a * opacity;
}
