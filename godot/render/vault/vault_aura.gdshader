// The glory behind the robot at a reveal (vault_stage.gd): a disc of light turned to face the
// camera, god rays wheeling slowly round a bright heart, in the rarity's colour (linear, HDR) at
// `alpha`. Drawn behind the robot with the depth test on, so the robot stands out against it.
// `rays` how many, `burst` 0..1 a ring of light racing out as it comes in.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 color = vec3(1.0);
uniform float alpha = 0.0;
uniform float rays = 12.0;
uniform float burst = 1.0;

void vertex() {
	// (a billboard: the quad turned to face the camera, kept where it is)
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
}

void fragment() {
	vec2 uv = UV - 0.5;
	float r = length(uv) * 2.0;
	float a = atan(uv.y, uv.x);
	float t = TIME;
	// two wheels of rays turning against each other, thin and fat
	float r1 = pow(0.5 + 0.5 * cos(a * rays + t * 0.35), 10.0);
	float r2 = pow(0.5 + 0.5 * cos(a * (rays * 0.5 + 1.0) - t * 0.22 + 1.7), 5.0);
	float fall = 1.0 - smoothstep(0.0, 1.0, r);
	float shafts = (r1 * 0.85 + r2 * 0.45) * fall * fall * smoothstep(0.05, 0.25, r);
	float heart = exp(-r * r * 9.0);
	float haze = fall * fall * fall * 0.25;
	// the ring racing out as it arrives
	float ring = exp(-abs(r - burst * 1.1) * 18.0) * (1.0 - burst) * 2.5;
	ALBEDO = color * alpha * (shafts + heart * 1.1 + haze + ring);
}
