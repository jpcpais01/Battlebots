// A soft halo of light round a ten-pull's light (vault_stage.gd): a bigger ball added over it,
// brightest through its middle and fading to nothing at its edge.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;

uniform vec3 color = vec3(1.0);
uniform float energy = 1.0;

void fragment() {
	float f = abs(dot(NORMAL, VIEW));
	ALBEDO = color * energy * pow(f, 2.5);
}
