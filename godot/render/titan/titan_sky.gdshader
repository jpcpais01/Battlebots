// The Titan Colosseum's sky (a dome round the stadium, titan_venue.gd): a low golden sun over the
// north-west rim, the sky deepening to blue overhead, and banks of warm cloud. The same numbers
// feed the ambient light the robots get (VenueLook reads them as the venue's dome: uZenith...).
shader_type spatial;
render_mode unshaded, cull_front, fog_disabled, shadows_disabled, depth_draw_never;

uniform vec3 uZenith = vec3(0.07, 0.15, 0.36);
uniform vec3 uHorizon = vec3(0.85, 0.6, 0.42);
uniform vec3 uGlowCol = vec3(1.0, 0.55, 0.22);
uniform vec3 uHaze = vec3(0.8, 0.62, 0.48);
uniform vec3 uGnd = vec3(0.2, 0.16, 0.1);
uniform vec3 uSunDir = vec3(-0.5496, 0.4997, -0.6695);
uniform vec3 uSunCol = vec3(1.0, 0.8, 0.55);
uniform vec4 uCloud = vec4(0.45, 0.55, 0.0, 1.0);
global uniform float bb_time;

varying vec3 v_dir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; }
	return s;
}

void vertex() {
	v_dir = (MODEL_MATRIX * vec4(VERTEX, 0.0)).xyz;
}

void fragment() {
	vec3 d = normalize(v_dir);
	float h = d.y;
	vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, h));
	float s = max(dot(d, normalize(uSunDir)), 0.0);
	c += uGlowCol * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 0.8);
	c += uSunCol * smoothstep(0.9993, 0.9996, s) * 14.0;
	// banks of cloud, lit gold on the sun's side and rose-grey away from it
	vec2 cp = d.xz / max(h + 0.12, 0.05) * 1.4 + vec2(bb_time * 0.004, 0.0);
	float cl = smoothstep(0.5 - uCloud.x * 0.3, 0.85, fbm(cp));
	vec3 cloud_c = mix(vec3(0.55, 0.42, 0.42), vec3(1.25, 0.82, 0.48), pow(s, 2.0));
	c = mix(c, cloud_c, cl * smoothstep(0.02, 0.15, h) * 0.85);
	c = mix(c, uHaze, 1.0 - smoothstep(-0.02, 0.1, h));
	ALBEDO = c;
}
