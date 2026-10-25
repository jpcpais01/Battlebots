// Aegis bubble: a fresnel shell, added on top (botModel.ts shield material).
shader_type spatial;
// (fog_disabled: Godot mixes the fog colour into an added layer, which would draw the whole
// bubble in the haze's colour out of doors)
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

uniform vec3 color = vec3(0.045, 1.0, 0.69);
uniform float alpha = 0.0;

void fragment() {
	float f = pow(max(1.0 - abs(dot(NORMAL, VIEW)), 0.0), 2.5);
	ALBEDO = color * (0.2 + f * 1.2) * (0.02 + f * 0.7) * alpha * 0.6;
}
