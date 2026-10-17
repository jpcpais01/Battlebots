// The referee drone (render/referee/referee.gd): one draw for the hull, its fan ducts, the arms
// and the gloves. The hull's look is worked out here from where on it a pixel is: a glossy white
// crown, the referee's black-and-white stripes round its middle, a graphite belly with the status
// ring, and in front a glass LED screen that is its face (eyes, the count, K.O.).
shader_type spatial;
render_mode cull_back;
#include "res://render/venue/common.gdshaderinc"
#include "res://render/referee/referee.gdshaderinc"

// The hull ellipsoid's radii (referee.gd HULL).
const vec3 HULL = vec3(0.235, 0.2, 0.225);
// The screen on the hull, in radians round it (half width, half height) and its corner radius.
const vec2 SCREEN = vec2(0.64, 0.34);
const float SCREEN_Y = 0.03;
const float SCREEN_R = 0.2;
// LED pitch on the face, in face units (the screen is 2 tall).
const float PITCH = 0.1;
// Seven-segment digits, bit 0 = top (a) round to bit 6 = middle (g).
const int SEG[10] = int[](63, 6, 91, 79, 102, 109, 125, 7, 127, 111);

// The face: open, glad (^ ^), wide, stern.
uniform vec4 eyes = vec4(1.0, 0.0, 0.0, 0.0);
// Where the eyes look, -1..1 across and up the screen.
uniform vec2 gaze = vec2(0.0);
// 0 eyes, 1 a number (face_num), 2 K.O., 3 dark.
uniform int face_mode = 0;
uniform int face_num = 0;
// Linear colours, brightness included.
uniform vec3 face_col = vec3(1.0, 2.0, 2.6);
uniform vec3 status = vec3(1.2, 1.9, 2.4);

varying vec3 v_rest;
varying float v_key;

void vertex() {
	int b = int(CUSTOM0.x + 0.5);
	v_key = CUSTOM0.y;
	v_rest = VERTEX;
	VERTEX = ref_bone_point(b, VERTEX);
	NORMAL = normalize(ref_bone_dir(b, NORMAL));
}

float sd_rbox(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sd_seg(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a;
	vec2 ba = b - a;
	return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// One eye, centred on p = 0; s is the side (+1 on the viewer's right).
float eye_sd(vec2 p, float s) {
	float wide = eyes.z;
	vec2 hs = vec2(0.24 + 0.07 * wide, max(0.05, 0.46 * eyes.x * (1.0 + 0.14 * wide)));
	float d = sd_rbox(p, hs, min(hs.x, hs.y) * 0.98);
	// glad: an upturned arc
	float arc = max(abs(length(p - vec2(0.0, -0.1)) - 0.25) - 0.1, -(p.y + 0.16));
	d = mix(d, arc, eyes.y);
	// stern: the top cut down towards the nose
	float brow = p.y - (hs.y * 0.5 + 0.8 * s * p.x) - (1.0 - eyes.w) * 2.0;
	return max(d, brow);
}

float digit_sd(vec2 p, int n) {
	int m = SEG[clamp(n, 0, 9)];
	const float W = 0.3;
	const float H = 0.64;
	float d = 1e3;
	if ((m & 1) != 0) d = min(d, sd_seg(p, vec2(-W, H), vec2(W, H)));
	if ((m & 2) != 0) d = min(d, sd_seg(p, vec2(W, H), vec2(W, 0.0)));
	if ((m & 4) != 0) d = min(d, sd_seg(p, vec2(W, 0.0), vec2(W, -H)));
	if ((m & 8) != 0) d = min(d, sd_seg(p, vec2(-W, -H), vec2(W, -H)));
	if ((m & 16) != 0) d = min(d, sd_seg(p, vec2(-W, 0.0), vec2(-W, -H)));
	if ((m & 32) != 0) d = min(d, sd_seg(p, vec2(-W, H), vec2(-W, 0.0)));
	if ((m & 64) != 0) d = min(d, sd_seg(p, vec2(-W, 0.0), vec2(W, 0.0)));
	return d - 0.1;
}

// What the screen shows lit, as a distance (negative inside), in face units.
float face_sd(vec2 f) {
	if (face_mode == 0) {
		vec2 g = gaze * vec2(0.34, 0.22);
		return min(eye_sd(f - vec2(0.6, 0.04) - g, 1.0), eye_sd(f - vec2(-0.6, 0.04) - g, -1.0));
	}
	if (face_mode == 1) {
		if (face_num >= 10) {
			return min(digit_sd(f - vec2(-0.48, 0.0), 1), digit_sd(f - vec2(0.48, 0.0), 0));
		}
		return digit_sd(f, face_num);
	}
	if (face_mode == 2) {
		vec2 k = f + vec2(0.58, 0.0);
		float d = sd_seg(k, vec2(-0.3, 0.66), vec2(-0.3, -0.66));
		d = min(d, sd_seg(k, vec2(-0.22, -0.02), vec2(0.32, 0.66)));
		d = min(d, sd_seg(k, vec2(-0.08, 0.16), vec2(0.34, -0.66)));
		vec2 o = f - vec2(0.56, 0.0);
		d = min(d, abs(sd_rbox(o, vec2(0.34, 0.66), 0.3)));
		return d - 0.1;
	}
	return 1e3;
}

void fragment() {
	int key = int(v_key + 0.5);
	vec3 alb = vec3(0.86);
	float met = 0.0;
	float rgh = 0.3;
	vec3 emi = vec3(0.0);
	if (key == 0) {
		vec3 n = v_rest / HULL;
		float u = atan(n.x, n.z);
		float v = asin(clamp(n.y, -1.0, 1.0));
		vec2 q = vec2(u, v - SCREEN_Y);
		float sd = sd_rbox(q, SCREEN, SCREEN_R);
		float aa = max(fwidth(sd), 1e-4);
		if (sd < 0.045) {
			// the face: dark glass with an LED dot matrix behind it, in a chrome bezel
			vec2 f = q / SCREEN.y;
			vec2 cell = (floor(f / PITCH) + 0.5) * PITCH;
			float px = max(fwidth(f.x), 1e-4);
			float lit_dot = smoothstep(0.04, -0.04, face_sd(cell));
			float dot_k = smoothstep(0.4 * PITCH + px, 0.4 * PITCH - px, length(f - cell));
			// far off the dots are under a pixel: show the shape they make, at their average glow
			float lit_far = smoothstep(px, -px, face_sd(f)) * 0.55;
			float near = smoothstep(2.0, 4.5, PITCH / px);
			float lit = mix(lit_far, lit_dot * dot_k, near);
			float off = mix(0.012, 0.03 * dot_k, near);
			float glass = smoothstep(aa, -aa, sd);
			alb = mix(vec3(0.72), vec3(0.008, 0.01, 0.014), glass);
			met = mix(1.0, 0.0, glass);
			rgh = mix(0.16, 0.04, glass);
			// (the glass edge darkens a touch, as if the screen sat back in the hull)
			float edge = smoothstep(-0.07, 0.0, sd);
			emi = face_col * (lit + off) * glass * (1.0 - edge * 0.6);
		} else if (n.y < -0.48) {
			// graphite belly and its status ring
			alb = vec3(0.035, 0.037, 0.042);
			met = 0.55;
			rgh = 0.38;
			float lat = asin(clamp(n.y, -1.0, 1.0));
			float rw = max(fwidth(lat), 1e-4);
			float ring = smoothstep(rw, -rw, abs(lat + 0.98) - 0.035);
			emi = status * ring * 0.8;
			alb *= 1.0 - ring;
			float trim = smoothstep(0.01, 0.0, abs(n.y + 0.49) - 0.012);
			alb = mix(alb, vec3(0.75), trim);
			met = mix(met, 1.0, trim);
		} else if (n.y > 0.6) {
			// the glossy white crown
			alb = vec3(0.88);
			rgh = 0.2;
			float trim = smoothstep(0.01, 0.0, abs(n.y - 0.61) - 0.012);
			alb = mix(alb, vec3(0.75), trim);
			met = trim;
			rgh = mix(rgh, 0.15, trim);
		} else {
			// the referee's shirt: black and white stripes
			float s = u / (2.0 * PI) * 16.0;
			float w = max(fwidth(s), 1e-4);
			float black = smoothstep(-w, w, abs(fract(s) - 0.5) - 0.25);
			alb = mix(vec3(0.86), vec3(0.025), black);
			rgh = mix(0.24, 0.42, black);
		}
	} else if (key == 1) {
		// graphite: ducts, joints, struts
		alb = vec3(0.045, 0.048, 0.055);
		met = 0.6;
		rgh = 0.34;
	} else if (key == 2) {
		// white gloves and arms
		alb = vec3(0.9);
		rgh = 0.42;
	} else if (key == 3) {
		alb = vec3(0.0);
		emi = status;
	} else if (key == 4 || key == 5) {
		// navigation lights, red to port and green to starboard, with a double flash
		float t = fract(TIME * 0.8 + (key == 4 ? 0.0 : 0.5));
		float flash = (t < 0.06 || (t > 0.14 && t < 0.2)) ? 1.0 : 0.22;
		alb = vec3(0.0);
		emi = (key == 4 ? vec3(3.0, 0.12, 0.08) : vec3(0.15, 3.0, 0.4)) * flash;
	} else if (key == 6) {
		// the beacon on the antenna
		float t = fract(TIME * 0.55);
		alb = vec3(0.0);
		emi = vec3(2.6, 2.4, 2.1) * (t < 0.05 ? 1.6 : 0.18);
	} else if (key == 7) {
		// chrome
		alb = vec3(0.8);
		met = 1.0;
		rgh = 0.14;
	} else {
		// glossy white trim
		alb = vec3(0.88);
		rgh = 0.2;
	}
	ALBEDO = alb;
	METALLIC = met;
	ROUGHNESS = rgh;
	EMISSION = emi;
	FOG = bb_fog(VERTEX);
}
