// A glint of light sliding across a button now and then (vault_screen.gd: the ×10 pull, the free
// pull, the featured card): a slanted soft band, added over the face, kept inside its rounded
// corners (`rect` the size in pixels, `radius`). Every `period` seconds, offset by `phase`.
shader_type canvas_item;
render_mode blend_add;

uniform vec2 rect = vec2(200.0, 70.0);
uniform float radius = 18.0;
uniform float period = 3.5;
uniform float phase = 0.0;
uniform float strength = 0.35;

void fragment() {
	vec2 p = UV * rect;
	// inside the rounded rect
	vec2 q = abs(p - rect * 0.5) - (rect * 0.5 - vec2(radius));
	float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	float inside = 1.0 - smoothstep(-1.0, 0.5, sd);
	float t = fract(TIME / period + phase);
	// the band crosses in the first 30% of the period
	float x = mix(-0.4, 1.4, t / 0.3);
	float d = UV.x + (UV.y - 0.5) * 0.45 * rect.y / rect.x * 2.0 - x;
	float glint = exp(-d * d * 260.0) + exp(-d * d * 30.0) * 0.35;
	COLOR = vec4(vec3(1.0, 0.97, 0.9) * glint * strength * inside * step(t, 0.3), 1.0);
}
