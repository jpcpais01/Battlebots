// A shaft of light through the vault's haze (vault_stage.gd): an open cone, its narrow end (the
// mesh's top) at the lamp, fading out along its length and to its edges. Additive, in `color`
// (linear, HDR) at `alpha`. The alarm beacons' sweeping beams.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 color = vec3(1.0, 0.1, 0.05);
uniform float alpha = 1.0;
uniform float height = 5.0;

varying float v_along;

void vertex() {
	// 0 at the lamp, 1 at the far end
	v_along = clamp((height * 0.5 - VERTEX.y) / height, 0.0, 1.0);
}

void fragment() {
	float edge = pow(abs(dot(NORMAL, VIEW)), 2.0);
	float fall = (1.0 - v_along) * (1.0 - v_along);
	ALBEDO = color * alpha * edge * fall;
}
