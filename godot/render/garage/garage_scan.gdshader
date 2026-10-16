// The equip scan's sheet of light (src/render/garage.ts sheetMat): an open cylinder, additive,
// both sides, brightest at its top edge (gl_FragColor = uColor * vY * vY * uA, alpha 1).
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, fog_disabled, shadows_disabled;

uniform vec3 color = vec3(0.0);
uniform float a = 0.0;

void fragment() {
	ALBEDO = color * UV.y * UV.y * a;
}
