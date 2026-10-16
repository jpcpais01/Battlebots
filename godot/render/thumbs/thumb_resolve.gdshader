// A part picture at the card size (render/thumbs/part_thumbs.gd): each pixel is the mean of a 2x2
// block of the double-size drawing (one bilinear tap halfway between them), whose edges came out
// premultiplied on the transparent background; the colour is divided back out, so the picture
// has straight alpha like the web's (drawn on black and white there).
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D src : filter_linear, repeat_disable;
uniform bool to_srgb = false;

vec3 linear_to_srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void fragment() {
	vec4 t = texture(src, UV);
	if (t.a <= 0.004) {
		COLOR = vec4(0.0);
	} else {
		vec3 c = min(t.rgb / t.a, vec3(1.0));
		COLOR = vec4(to_srgb ? linear_to_srgb(c) : c, t.a);
	}
}
