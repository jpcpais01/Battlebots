// The corner lifts' light shafts (corners.ts): a column rising from the hatch (fade_top) or a
// spot cone, brightest looking through the middle of the shaft. k: how lit.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, fog_disabled;

uniform vec3 color = vec3(1.0);
uniform float k = 0.0;
uniform bool fade_top = false;

void fragment() {
	float edge = pow(abs(dot(normalize(NORMAL), normalize(VIEW))), 1.6);
	float y = UV.y;
	float along = fade_top ? (1.0 - y) * (1.0 - y) : 0.2 + 0.8 * y;
	ALBEDO = color * edge * along * k;
}
