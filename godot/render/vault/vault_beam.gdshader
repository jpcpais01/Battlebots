// Light in the Skin Vault that has no surface (vault_stage.gd): the beam that falls on the robot
// at a reveal, the shock ring of a burst. Additive, fading to its edges and to the top of the mesh
// (`fade`: 0 none), in `color` (linear, HDR) at `alpha`.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 color = vec3(1.0);
uniform float alpha = 1.0;
uniform float fade = 1.0;
uniform float height = 1.0;

varying vec3 v_p;

void vertex() {
	v_p = VERTEX;
}

void fragment() {
	float edge = pow(abs(dot(NORMAL, VIEW)), 1.5);
	float up = fade > 0.0 ? 1.0 - smoothstep(0.0, height, (v_p.y + height * 0.5) * fade) : 1.0;
	float flick = 0.85 + 0.15 * sin(TIME * 30.0 + v_p.y * 6.0);
	ALBEDO = color * alpha * edge * up * flick;
}
