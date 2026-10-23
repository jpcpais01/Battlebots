// The glint that runs across the loading screen's big app icon (app/boot/boot_emblem.gd): a soft
// diagonal band of light, added over the icon and cut to the tile's rounded shape.
shader_type canvas_item;
render_mode blend_add;

// where the band is along its run: 0 at the top-left corner, 1 at the bottom-right
uniform float pos = -1.0;
uniform float strength = 0.0;

void fragment() {
	float a = texture(TEXTURE, UV).a;
	float d = (UV.x * 0.7 + UV.y * 0.3) - pos;
	float band = exp(-d * d * 260.0) + 0.35 * exp(-(d + 0.07) * (d + 0.07) * 900.0);
	COLOR = vec4(1.0, 0.97, 0.9, band * strength * a);
}
