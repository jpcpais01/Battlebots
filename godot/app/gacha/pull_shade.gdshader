// The shade behind a pull's words (pull_show.gd): deep violet on the left, fading out to the right.
shader_type canvas_item;

void fragment() {
	float a = 0.78 * (1.0 - smoothstep(0.0, 1.0, UV.x));
	COLOR = vec4(0.02, 0.0, 0.05, a * a * 1.2);
}
