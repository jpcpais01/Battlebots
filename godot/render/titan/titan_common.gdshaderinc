// Shared by the Titan Colosseum's shaders (render/titan): the venue's fixed light (a low golden
// sun), its ambient sky, the stadium's dimensions and a few noise helpers. One world unit is a
// robot metre; the titans are 15 times that, so the stadium is built to the titans' scale and
// everything human in it (the fans, the seats, the steps) is built at 1/15.
//
// Everything far from the fight (stands, crowd, roof, rim) is unshaded and lit here, by the same
// sun and sky the robots get from the DirectionalLight3D and the ambient sky (titan_venue.gd sets
// those from these numbers), and the haze is Godot's fog.

// Towards the sun (30 degrees up, over the north-west rim) and its colour in linear light.
const vec3 T_SUN_DIR = vec3(-0.5496, 0.4997, -0.6695);
const vec3 T_SUN_COL = vec3(1.0, 0.70, 0.44) * 2.35;
// The sky's light on an upward face and on a face turned to the horizon, and the ground's bounce.
const vec3 T_SKY_TOP = vec3(0.20, 0.27, 0.42);
const vec3 T_SKY_SIDE = vec3(0.30, 0.27, 0.27);
const vec3 T_BOUNCE = vec3(0.13, 0.12, 0.07);

// The plain (the sim's arena floor) and the stadium round it (titan_venue.gd has the same numbers).
const float T_GROUND_Y = -0.62;
const float T_R_IN = 21.0;
const float T_R_RIM = 51.0;
const float T_H_RIM = 26.6;
const float T_R_CANOPY = 42.5;
const float T_H_CANOPY = 26.0;

global uniform float bb_time;
global uniform float bb_hype;
global uniform float bb_flash;

float t_hash(float n) { return fract(sin(n) * 43758.5453); }
float t_hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

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

// Sunlight left at world point p by the stadium's own rim and roof: the sun ray from p must clear
// the roof's inner edge and the rim to reach it (both are circles round the centre).
float t_rim_light(vec3 p) {
	vec2 sh = normalize(T_SUN_DIR.xz);
	float tan_el = T_SUN_DIR.y / length(T_SUN_DIR.xz);
	float b = dot(p.xz, sh);
	float c0 = dot(p.xz, p.xz);
	// where the ray leaves the rim's circle, and how high it is there
	float t_rim = -b + sqrt(max(b * b - (c0 - T_R_RIM * T_R_RIM), 0.0));
	float lit = smoothstep(-0.9, 0.9, p.y + t_rim * tan_el - T_H_RIM);
	// and under the roof's inner edge on the way (if it gets that far out)
	float dc = b * b - (c0 - T_R_CANOPY * T_R_CANOPY);
	if (dc > 0.0) {
		float t_c = -b + sqrt(dc);
		if (t_c > 0.0) lit = min(lit, smoothstep(-0.7, 0.7, p.y + t_c * tan_el - T_H_CANOPY));
	}
	return lit;
}

// The light a matte surface with normal n gets at p: the sun (shadowed by the rim), the sky and
// the warm bounce off the plain.
vec3 t_light(vec3 p, vec3 n, float sun_k) {
	float ndl = max(dot(n, T_SUN_DIR), 0.0);
	vec3 sky = mix(T_SKY_SIDE, T_SKY_TOP, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
	vec3 bounce = T_BOUNCE * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0);
	return T_SUN_COL * ndl * sun_k + sky + bounce;
}
