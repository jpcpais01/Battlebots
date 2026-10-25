// Shared by the titan city's shaders (render/titan): the evening's fixed light (a low sun going
// down over the harbour), the sky's ambient for the unshaded far things, the haze, and a few
// noise helpers. One world unit is a robot metre and the titans are 15 times that: everything
// here is built at the titans' scale (a 3.3 m storey is 0.22 units, a person 0.11).
//
// Near things are lit by Godot's own lights (the venue's sun, a DirectionalLight3D with these
// numbers, and the ambient sky). Far things (the skyline, the hills, the water's sky) light
// themselves with the same sun and sky here. Every shader writes the haze itself (t_haze into
// FOG): thicker low down, glowing gold towards the sun, so the city fades into the evening.

// Towards the sun (12.7 degrees up, over the harbour to the north-north-west) and its light.
const vec3 T_SUN_DIR = vec3(-0.4202, 0.2201, -0.8804);
const vec3 T_SUN_COL = vec3(1.0, 0.6, 0.34) * 2.6;
// The sky's light on an upward face and on a face turned to the horizon, and the ground's bounce.
const vec3 T_SKY_TOP = vec3(0.16, 0.22, 0.38);
const vec3 T_SKY_SIDE = vec3(0.34, 0.27, 0.26);
const vec3 T_BOUNCE = vec3(0.16, 0.12, 0.08);
// The haze: its colour away from the sun and towards it, how thick it is at the water and how
// fast it thins with height (units).
const vec3 T_HAZE = vec3(0.4, 0.39, 0.45);
const vec3 T_HAZE_SUN = vec3(0.98, 0.6, 0.35);
const float T_HAZE_K = 0.0032;
const float T_HAZE_H = 18.0;
// The plaza and the water (the sim's arena floor, and 3.3 m below the quay).
const float T_PLAZA_Y = -0.62;
const float T_WATER_Y = -0.84;

global uniform float bb_time;
global uniform float bb_hype;
global uniform float bb_flash;

float t_hash(float n) { return fract(sin(n) * 43758.5453); }
float t_hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 t_hash22(vec2 p) {
	return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float t_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = t_hash2(i), b = t_hash2(i + vec2(1.0, 0.0));
	float c = t_hash2(i + vec2(0.0, 1.0)), d = t_hash2(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float t_fbm(vec2 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * t_noise(p);
		p = p * 2.03 + vec2(17.1, 9.2);
		a *= 0.5;
	}
	return s;
}

// A stripe of width w every period, anti-aliased over the pixel's footprint fw.
float t_band(float x, float period, float w, float fw) {
	float d = abs(fract(x / period + 0.5) - 0.5) * period;
	return 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, d);
}

// The haze between the lens at `cam` and the world point `p`: (colour, amount) for FOG. The air
// is thickest at the water and thins with height (an exponential atmosphere, integrated along
// the ray), and lights up gold looking towards the low sun.
vec4 t_haze(vec3 p, vec3 cam) {
	vec3 d = p - cam;
	float dist = length(d);
	vec3 v = d / max(dist, 1e-4);
	float y0 = cam.y - T_WATER_Y;
	float dy = d.y;
	// mean density along the ray: (e^-y0/H - e^-y1/H) H / dy, or e^-y0/H when level
	float e0 = exp(-max(y0, 0.0) / T_HAZE_H);
	float mean = abs(dy) > 0.05 ? (e0 - exp(-max(y0 + dy, 0.0) / T_HAZE_H)) * T_HAZE_H / dy : e0;
	float a = 1.0 - exp(-T_HAZE_K * dist * mean);
	float s = max(dot(v, T_SUN_DIR), 0.0);
	vec3 c = mix(T_HAZE, T_HAZE_SUN, s * s * s * 0.85 + pow(s, 24.0) * 0.6);
	return vec4(c, a);
}

// The light a matte surface with normal n gets from the sun (sun_k: how much of it reaches it)
// and the sky: for the unshaded far things.
vec3 t_light(vec3 n, float sun_k) {
	float ndl = max(dot(n, T_SUN_DIR), 0.0);
	vec3 sky = mix(T_SKY_SIDE, T_SKY_TOP, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
	vec3 bounce = T_BOUNCE * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0);
	return T_SUN_COL * ndl * sun_k + sky + bounce;
}

// The evening sky along direction r (the dome, and what glass and water reflect).
vec3 t_sky(vec3 r) {
	float h = r.y;
	// (the blue overhead is kept short of full saturation: the tone curve clips deep blues to a flat
	// patch with a hard edge)
	vec3 zen = vec3(0.12, 0.155, 0.29);
	vec3 hor = vec3(0.86, 0.56, 0.38);
	vec3 c = mix(hor, zen, smoothstep(-0.02, 0.7, h));
	float s = max(dot(r, T_SUN_DIR), 0.0);
	c += vec3(1.0, 0.5, 0.18) * (pow(s, 5.0) * 0.6 + pow(s, 48.0) * 1.1);
	// below the horizon: the hills and the far shore in the haze
	c = mix(c, vec3(0.32, 0.27, 0.27), smoothstep(0.02, -0.06, h));
	return c;
}
