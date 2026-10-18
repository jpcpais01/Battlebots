// What the metal reflects in the Skin Vault (vault_stage.gd): the violet night overhead, a magenta
// glow round the horizon, the dark platform below, and two soft bright patches standing for the
// machine's neon and the stage lights. It only lights and reflects (the background is drawn by
// vault_space.gdshader).
shader_type sky;

uniform float intensity = 0.8;
// the hemisphere light's slope (HomeStage.HomeLook sets it)
uniform vec3 hemi_tilt = vec3(0.0);

void sky() {
	vec3 d = EYEDIR;
	vec3 col = mix(vec3(0.03, 0.012, 0.07), vec3(0.09, 0.04, 0.2), smoothstep(-0.1, 0.8, d.y));
	col += vec3(0.5, 0.08, 0.42) * exp(-abs(d.y) * 5.0) * 0.25;
	col = mix(col, vec3(0.02, 0.015, 0.04), smoothstep(0.0, -0.3, d.y));
	// the machine's neon behind (-z) and the stage's cool light from the front right
	col += vec3(1.4, 0.3, 1.1) * smoothstep(0.8, 0.97, dot(d, normalize(vec3(-0.1, 0.7, -1.0))));
	col += vec3(0.6, 1.6, 2.4) * smoothstep(0.8, 0.98, dot(d, normalize(vec3(0.9, 0.5, 0.4))));
	col += vec3(1.8, 1.7, 2.0) * smoothstep(0.86, 0.99, dot(d, normalize(vec3(-0.3, 0.9, 0.4))));
	COLOR = max(col * intensity + hemi_tilt * d.y, vec3(0.0));
}
