// The beach's world in GLSL (src/render/home/beachWorld.ts WORLD_GLSL and SKY_COMMON): the shore
// line, the reef, the bed, the swash and the wet sand, and the sky's colour and clouds, shared by
// the dome, the water, the lens flare, the sand and the reflections. The clock is bb_time.
global uniform float bb_time;

uniform vec3 sun = vec3(-0.399, 0.638, -0.658);
uniform vec3 zenith = vec3(0.0080, 0.0887, 0.5394);
uniform vec3 horizon = vec3(0.2664, 0.5271, 0.8070);
uniform vec3 glow = vec3(0.7605, 0.8714, 0.9387);
uniform vec3 sun_col = vec3(1.0, 0.9130, 0.7913);
uniform sampler2D noise : repeat_enable, filter_linear_mipmap;

const float SEA = -0.120;
const float SWASH_P = 8.5;

float shoreZ(float x) { return -3.3 - 0.0055 * x * x + 0.35 * sin(0.11 * x); }
float reefZ(float x) { return -60.0 + 3.0 * sin(0.045 * x + 0.8) + 1.2 * sin(0.13 * x); }
float bedDepth(vec2 p) {
	float d = shoreZ(p.x) - p.y;
	float rr = reefZ(p.x) - p.y;
	float depth = 1.6 * (1.0 - exp(-d / 9.0)) + 0.015 * d;
	return depth * (1.0 - 0.85 * exp(-rr * rr / 45.0)) + 9.0 * smoothstep(0.0, 14.0, rr);
}
// the ground round the water line (the beach's face and the bed: all the water needs)
float groundNear(vec2 p) {
	float d = shoreZ(p.x) - p.y;
	if (d > 0.0) return SEA - bedDepth(p);
	float l = min(-d / 2.2, 1.0);
	return SEA + 0.12 * (1.0 - (1.0 - l) * (1.0 - l));
}
// the swash: each little wave rolls in through the shallows, runs up the sand and drains back.
// u is its phase (0 at the trough, 0.3 at the top of the run-up), A its height.
float swashLevel(vec2 p, out float u, out float A) {
	float d = max(shoreZ(p.x) - p.y, 0.0);
	float ph = bb_time / SWASH_P + d * 0.11 - p.x * 0.013 + 0.12 * sin(p.x * 0.07);
	float k = floor(ph);
	u = ph - k;
	A = (0.056 + 0.024 * sin(k * 2.39 + 1.3)) * (0.3 + 0.7 * exp(-d / 6.0));
	float f = u < 0.3 ? 1.0 - (1.0 - u / 0.3) * (1.0 - u / 0.3) : (1.0 - (u - 0.3) / 0.7) * (1.0 - (u - 0.3) / 0.7);
	return SEA - 0.03 + A * f;
}
// how wet sand at height h is: soaked under the swash's reach (damp a little above it), and a
// glassy film of water for a moment after each wave drains off it
void sandWet(vec2 p, float h, out float wet, out float film) {
	float u, A;
	swashLevel(p, u, A);
	float rel = h - (SEA - 0.03);
	float s = rel / A;
	// (damp to just above the biggest waves' reach, whichever wave this is)
	wet = 1.0 - smoothstep(0.06, 0.13, rel);
	film = 0.0;
	if (s < 1.0) {
		float sc = max(s, 0.0);
		float up = 0.3 * (1.0 - sqrt(1.0 - sc));
		float dn = 0.3 + 0.7 * (1.0 - sqrt(sc));
		film = (u > up && u < dn) ? 1.0 : exp(-fract(u - dn) * SWASH_P / 1.7);
	}
}

vec3 skyCol(vec3 d) {
	float h = max(d.y, 0.0);
	float s = max(dot(d, sun), 0.0);
	// deep tropical blue overhead, paling to a soft white haze lying on the horizon
	vec3 col = mix(horizon, zenith, pow(h, 0.42));
	col = mix(col, glow, exp(-h * 30.0) * 0.45);
	// warmer and brighter on the sun's side, and the glare round the sun
	float side = max(dot(normalize(d.xz + vec2(1e-5)), normalize(sun.xz)), 0.0);
	col += glow * pow(1.0 - h, 6.0) * 0.1 * side * side;
	col += sun_col * (pow(s, 5.0) * 0.1 + pow(s, 48.0) * 0.32 + pow(s, 700.0) * 1.5);
	return col;
}
// the open sea right out at the horizon: the sky's haze mirrored on it, a touch deeper
vec3 farSea(vec3 d) {
	return skyCol(normalize(vec3(d.x, 0.0, d.z))) * vec3(0.62, 0.8, 0.92);
}
vec2 cloudUV(vec3 d) { return d.xz / (max(d.y, 0.0) + 0.07) * 0.15 + vec2(bb_time * 0.0021, bb_time * 0.0008); }
// two octaves for the shapes, and a fine third that frays their edges
float cloudD(vec2 uv) {
	return texture(noise, uv).r * 0.62 + texture(noise, uv * 2.3 + 0.37).g * 0.3 + (texture(noise, uv * 6.3 + 0.71).b - 0.5) * 0.17;
}
// (a vertex shader has no derivatives: the same at the top mip)
float cloudD_lod(vec2 uv) {
	return textureLod(noise, uv, 0.0).r * 0.62 + textureLod(noise, uv * 2.3 + 0.37, 0.0).g * 0.3 + (textureLod(noise, uv * 6.3 + 0.71, 0.0).b - 0.5) * 0.17;
}
// a few fair-weather clouds lying low round the horizon, almost none overhead
float cloudCover(float h) { return mix(0.55, 0.72, smoothstep(0.02, 0.4, h)); }
