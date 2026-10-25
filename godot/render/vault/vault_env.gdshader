// What the metal and the polished floor reflect in the Skin Vault (vault_stage.gd): a dark room,
// its ceiling's cool light panels overhead, the walls' neon strips as two bands round the horizon
// (magenta low, cyan higher), soft boxes front and behind for the steel to catch, and the key
// light front right.
// It only lights and reflects: the room itself is drawn by its walls.
shader_type sky;

uniform float intensity = 0.8;
// the hemisphere light's slope (HomeStage.HomeLook sets it)
uniform vec3 hemi_tilt = vec3(0.0);

void sky() {
	vec3 d = EYEDIR;
	vec3 col = vec3(0.02, 0.018, 0.03);
	col += vec3(0.45, 0.5, 0.65) * smoothstep(0.5, 0.95, d.y) * 0.5;
	col += vec3(1.3, 0.15, 0.75) * exp(-abs(d.y - 0.02) * 35.0) * 0.5;
	col += vec3(0.12, 0.85, 1.3) * exp(-abs(d.y - 0.35) * 25.0) * 0.5;
	// (a soft lift overhead and two broad soft boxes, front and behind, for the steel to catch)
	col += vec3(0.18, 0.19, 0.24) * smoothstep(-0.1, 0.7, d.y);
	col += vec3(0.7, 0.75, 0.9) * smoothstep(0.75, 0.95, dot(d, normalize(vec3(0.2, 0.45, 1.0))));
	col += vec3(0.5, 0.45, 0.55) * smoothstep(0.8, 0.97, dot(d, normalize(vec3(-0.4, 1.3, -1.0))));
	col += vec3(1.8, 1.8, 2.0) * smoothstep(0.86, 0.99, dot(d, normalize(vec3(-0.3, 0.9, 0.4))));
	col = mix(col, vec3(0.012, 0.01, 0.016), smoothstep(-0.02, -0.3, d.y));
	COLOR = max(col * intensity + hemi_tilt * d.y, vec3(0.0));
}
