// The pull's stage (app/gacha/pull_show.gd): a deep vault lit from a point (`at`, in the rect's
// 0..1 coordinates, where the capsule sits): a pool of light, god rays turning round it, dust
// rising through them, a ring of light rushing out when the capsule bursts and a flash over it
// all. `tint` is the colour the pull is showing (the best rarity so far).
shader_type canvas_item;

uniform vec2 at = vec2(0.5, 0.5);
uniform vec4 tint : source_color = vec4(0.55, 0.72, 0.95, 1.0);
// 0..1: how much light the capsule is giving off
uniform float power = 0.0;
// 0..1: god rays
uniform float rays = 0.0;
// the shock ring's radius (in heights; < 0: none) and a white flash over everything
uniform float ring = -1.0;
uniform float flash = 0.0;
// the stage's own fade
uniform float alpha = 1.0;
// width / height
uniform float aspect = 1.7778;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	vec2 uv = UV;
	vec2 q = (uv - at) * vec2(aspect, 1.0);
	float r = length(q);
	float a = atan(q.y, q.x);
	vec3 t = tint.rgb;
	// the vault: near black, a faint blue wash from above
	vec3 c = mix(vec3(0.012, 0.016, 0.03), vec3(0.03, 0.04, 0.07), smoothstep(1.0, 0.0, uv.y));
	// a floor: a grid of faint lines in perspective under the capsule
	float fy = uv.y - at.y - 0.18;
	if (fy > 0.0) {
		float z = 0.12 / fy;
		vec2 g = vec2((uv.x - at.x) * z * 6.0, z * 3.0 - TIME * 0.4);
		vec2 gl = abs(fract(g) - 0.5);
		float line = (1.0 - smoothstep(0.0, 0.04 * z + 0.02, 0.5 - max(gl.x, gl.y)));
		c += t * line * 0.12 * smoothstep(0.0, 0.25, fy) * exp(-abs(uv.x - at.x) * 2.0) * (0.4 + power);
		// the pool of light on the floor
		vec2 e = vec2((uv.x - at.x) * aspect, fy * 4.0);
		c += t * exp(-dot(e, e) * 9.0) * (0.12 + power * 0.6);
	}
	// the glow round the capsule
	c += t * exp(-r * (5.0 - power * 2.0)) * (0.1 + power * 0.9);
	c += vec3(1.0) * exp(-r * 14.0) * power * 0.5;
	// god rays turning slowly, two sets against each other
	float rs = pow(0.5 + 0.5 * sin(a * 9.0 + TIME * 0.6), 6.0) * 0.6 + pow(0.5 + 0.5 * sin(a * 14.0 - TIME * 0.9 + 1.3), 8.0) * 0.5;
	rs *= smoothstep(0.02, 0.25, r) * exp(-r * 1.4);
	c += t * rs * rays * 0.9;
	// dust drifting up through the light
	vec2 dp = uv * vec2(aspect, 1.0) * 26.0 + vec2(0.0, TIME * 1.3);
	vec2 di = floor(dp);
	float dh = hash(di);
	vec2 dq = fract(dp) - 0.5 - (vec2(hash(di + 3.1), hash(di + 7.7)) - 0.5) * 0.6;
	float dust = step(0.86, dh) * (1.0 - smoothstep(0.03, 0.09, length(dq))) * (0.5 + 0.5 * sin(TIME * 3.0 + dh * 40.0));
	c += mix(vec3(0.6), t, 0.6) * dust * (0.12 + power * 0.6 + rays * 0.5) * exp(-r * 1.5);
	// the shock ring
	if (ring > 0.0) {
		float w = abs(r - ring);
		c += mix(vec3(1.0), t, 0.5) * exp(-w * 60.0) * 2.0 * exp(-ring * 1.5);
		c += t * exp(-w * 12.0) * 0.5 * exp(-ring * 1.5);
	}
	// vignette
	c *= 1.0 - smoothstep(0.55, 1.35, length((uv - 0.5) * vec2(aspect * 0.8, 1.0)));
	c = mix(c, mix(vec3(1.0), t, 0.25), flash);
	COLOR = vec4(c, alpha);
}
