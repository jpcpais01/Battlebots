// The shade behind a pull's words (pull_show.gd): deep violet on the left, fading out to the right,
// stained with the rarity's colour (`tint`, sRGB) and glowing faintly in it along the left edge.
shader_type canvas_item;

uniform vec4 tint : source_color = vec4(0.4, 0.2, 0.9, 1.0);
uniform float stain = 0.0;

void fragment() {
	float a = 0.78 * (1.0 - smoothstep(0.0, 1.0, UV.x));
	vec3 deep = vec3(0.02, 0.0, 0.05);
	vec3 c = mix(deep, tint.rgb * 0.22, stain * 0.7);
	// the rarity's light leaking in at the left, strongest at the middle of the height
	float edge = exp(-UV.x * 9.0) * (1.0 - pow(abs(UV.y - 0.5) * 2.0, 2.0));
	c += tint.rgb * edge * stain * 0.35;
	COLOR = vec4(c, clamp(a * a * 1.2 + edge * stain * 0.3, 0.0, 1.0));
}
