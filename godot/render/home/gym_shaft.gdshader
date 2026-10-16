// Light you can see in the air (src/render/home/scene.ts shaftMaterial, SHAFT_FRAG): a sunbeam
// from a window, a hanging lamp's cone, the light through the open arena door. Bright where the
// geometry's v is 1 (the source), fading away from it, with dust drifting through it; added on.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

global uniform float bb_time;
uniform vec3 color = vec3(1.0);
uniform float opacity = 0.0;
// 1: fade out towards the sheet's left and right edges too
uniform float sides = 0.0;
uniform sampler2D noise : repeat_enable, filter_linear_mipmap;

varying vec3 w_pos;
varying vec3 w_n;

void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	w_n = normalize(mat3(MODEL_MATRIX) * NORMAL);
}

void fragment() {
	vec3 to_cam = CAMERA_POSITION_WORLD - w_pos;
	vec3 V = normalize(to_cam);
	// seen edge-on a sheet of light vanishes, so crossed sheets read as a soft volume
	float face = smoothstep(0.05, 0.55, abs(dot(normalize(w_n), V)));
	float along = pow(clamp(UV.y, 0.0, 1.0), 1.6);
	float side = mix(1.0, smoothstep(0.0, 0.32, UV.x) * smoothstep(1.0, 0.68, UV.x), sides);
	// drifting dust thickens and thins the light
	float dust = texture(noise, w_pos.xz * 0.45 + vec2(w_pos.y * 0.3, bb_time * 0.015)).r;
	dust = 0.55 + 0.9 * dust * dust;
	float near_cam = smoothstep(0.4, 1.6, length(to_cam));
	ALBEDO = color * (opacity * along * side * face * dust * near_cam);
}
