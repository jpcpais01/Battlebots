// A streak of light behind a reveal's rarity word (pull_show.gd): a bright horizontal band in the
// rarity's colour (`color`, sRGB) that shoots out from the left (`grow` 0..1) and fades to the
// right, with a thin white-hot core and a shimmer running along it. Drawn additively.
shader_type canvas_item;
render_mode blend_add;

uniform vec4 color : source_color = vec4(1.0, 0.8, 0.3, 1.0);
uniform float grow = 0.0;
uniform float strength = 1.0;

void fragment() {
	float y = abs(UV.y - 0.5) * 2.0;
	float band = exp(-y * y * 9.0);
	float core = exp(-y * y * 160.0);
	float reach = 1.0 - smoothstep(grow * 0.85, grow, UV.x);
	float fade = 1.0 - smoothstep(0.1, 1.0, UV.x);
	float shimmer = 0.75 + 0.25 * sin(UV.x * 40.0 - TIME * 9.0);
	vec3 c = color.rgb * band * 0.55 * shimmer + mix(color.rgb, vec3(1.0), 0.6) * core * 0.9;
	COLOR = vec4(c * reach * fade * strength, 1.0);
}
