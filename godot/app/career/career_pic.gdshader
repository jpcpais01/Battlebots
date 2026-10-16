// A part's or a trophy's picture with the web's CSS filters: grayscale and brightness (sold parts,
// trophies not won yet) and a drop-shadow glow in a colour (trophies won). The texture carries a
// transparent margin for the glow to spread into.
shader_type canvas_item;

uniform float gray = 0.0;
uniform float bright = 1.0;
uniform vec4 glow = vec4(0.0);
// the glow's reach, in UV units of the texture
uniform float spread = 0.05;

// the vertex colour (the node's modulate), before the texture is multiplied in
varying vec4 tint;

void vertex() {
	tint = COLOR;
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
	c.rgb = mix(c.rgb, vec3(l), gray) * bright;
	if (glow.a > 0.0) {
		// drop-shadow(0 0 r colour): the alpha blurred over two rings of taps
		float a = 0.0;
		for (int i = 0; i < 12; i++) {
			float ang = float(i) * 0.5236;
			vec2 o = vec2(cos(ang), sin(ang));
			a += texture(TEXTURE, UV + o * spread * 0.45).a + texture(TEXTURE, UV + o * spread).a * 0.6;
		}
		a = clamp(a / 19.2, 0.0, 1.0) * glow.a;
		vec4 g = vec4(glow.rgb, a);
		c = vec4(mix(g.rgb * g.a, c.rgb, c.a) / max(c.a + g.a * (1.0 - c.a), 1e-4), c.a + g.a * (1.0 - c.a));
	}
	COLOR = c * tint;
}
