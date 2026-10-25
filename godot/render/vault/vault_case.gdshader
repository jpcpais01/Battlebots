// The glass of the featured skin's display case (vault_stage.gd): only its edges and a couple of
// tall highlights catch the light, added over what's inside.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color = vec3(0.6, 0.75, 1.0);
uniform float energy = 1.0;

varying vec3 v_p;

void vertex() {
	v_p = VERTEX;
}

void fragment() {
	float f = abs(dot(NORMAL, VIEW));
	float edge = pow(1.0 - f, 3.0);
	// two long streaks of reflected light down the glass
	float ang = atan(v_p.z, v_p.x);
	float streak = smoothstep(0.92, 1.0, cos(ang * 1.0 - 0.9)) * 0.6 + smoothstep(0.97, 1.0, cos(ang - 1.5)) * 0.4;
	ALBEDO = color * energy * (edge * 0.9 + streak * 0.35 * f);
}
