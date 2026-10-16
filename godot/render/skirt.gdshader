// LED skirt round the stage: chevrons scrolling round the ring, two bright sweeps chasing them
// (web: arena.ts skirt material; the lettering is left out).
shader_type spatial;
render_mode unshaded;

uniform vec3 col_a = vec3(2.4, 0.62, 0.06);
uniform vec3 col_b = vec3(0.13, 1.25, 1.6);
uniform float time = 0.0;
uniform float hype = 0.3;

void fragment() {
	float u = 1.0 - UV.x;
	float x = u * 48.0 - time * 0.24;
	float v = UV.y;
	float chev = step(0.5, fract(x + abs(v - 0.5) * 0.8));
	float band = step(0.18, v) * step(v, 0.82);
	float chase = smoothstep(0.85, 1.0, fract(u * 2.0 - time * (0.12 + 0.2 * hype)));
	float k = 0.5 + 0.4 * hype + chase * 0.7;
	vec3 c = (col_a * chev * band * 0.6 + col_b * (1.0 - band) * 0.5) * k;
	ALBEDO = c + vec3(0.018, 0.02, 0.028);
}
