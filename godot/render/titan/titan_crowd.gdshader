// The crowd packed into the square round the Titan Ring: tens of thousands of people standing in
// rows behind the barriers, drawn without a triangle each. The mesh is only an envelope over them
// (a ring at head height with walls at its inner and outer edges, titan_venue.gd); each pixel
// casts its view ray in and steps it row by row, meeting each row's people as a ring of upright
// figure cards (the indoor arena's painted sprite atlas, posed per person). The first figure the
// ray meets is drawn, a gap lets it on to the next row, and a ray that reaches the ground between
// them hits the paving. So the crowd has true depth and parallax from the ring, from the roofs and
// from in among them (the crowd shot). Lit by the venue's sun: the titans' shadows sweep over it.
//
// The people follow the same uniforms as the indoor crowd (crowd.gd ArenaCrowd drives them): the
// excitement, each side's joy and dismay, boos and the Mexican wave; and `panic`: when a titan
// comes crashing down near them, they duck and cover.
//
// Per vertex: CUSTOM0 = (front radius r0, row depth d, ground height y0, 0); CUSTOM1.x = rows.
shader_type spatial;
render_mode cull_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
uniform sampler2D bounds : filter_nearest;
uniform float wave = 0.0;
uniform float wave_a = 0.0;
uniform float excite = 0.15;
uniform float boo = 0.0;
uniform vec2 joy = vec2(0.0);
uniform vec2 dismay = vec2(0.0);
uniform vec4 hot[4];
uniform vec3 skin[7];
uniform vec3 pants[8];
uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
// The crowd shot's fan (Director.crowd_seat): where they stand (xz), how far round them people
// are on their feet (z) and how wildly they cheer (w).
uniform vec4 fan_seat = vec4(0.0);
// A titan crashing down nearby: (x, z, radius, how fresh 0..1).
uniform vec4 panic = vec4(0.0);
// Most rows a ray is stepped through before it settles for what it has.
uniform int max_rows = 12;

// crowd.gdshader's atlas: 34 figures by 7 poses; a figure's cell is 0.9 m by 2.1 m (over 15).
const float COLS = 34.0;
const float POSES = 7.0;
const float SPR_W = 0.9 / 15.0;
const float SPR_H = 2.1 / 15.0;
// a person takes 0.55 m of their row
const float SEAT_W = 0.55 / 15.0;
const float CARD = 0.5;
const float PI_ = 3.14159265;
// the boulevard runs out of the square along x: nobody stands in it
const float LANE = 2.05;

varying flat vec4 v_tier;
varying flat float v_rows;
varying vec3 v_world;

void vertex() {
	v_tier = CUSTOM0;
	v_rows = CUSTOM1.x;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float cyl(vec3 c, vec3 d, float r, bool far_root) {
	float a = dot(d.xz, d.xz);
	float b = dot(c.xz, d.xz);
	float k = dot(c.xz, c.xz) - r * r;
	float disc = b * b - a * k;
	if (disc < 0.0 || a < 1e-8) return -1.0;
	float s = sqrt(disc);
	return far_root ? (-b + s) / a : (-b - s) / a;
}

// Whether anyone stands at this spot: not in the boulevard, not in the access lanes left every
// so often, thinner towards the back.
bool occupied(vec2 q, float seed, float row, float rows) {
	if (abs(q.y) < LANE && abs(q.x) > 8.0) return false;
	float ang = atan(q.y, q.x);
	// access lanes for the crews, every 40 degrees (but not across the boulevard)
	float lane = abs(fract(ang / (PI_ * 2.0 / 9.0) + 0.27) - 0.5) * length(q);
	if (lane < 0.09) return false;
	float thin = mix(0.03, 0.2, row / rows);
	return fract(seed * 91.3) >= thin;
}

// One person at the point q on their row's card: rgb colour (unlit), a coverage. `sf` is the
// point's place along the row, `seat` the place tried (this one or a neighbour), `yt` the ground,
// `back` when they're seen from behind, `lod` the atlas mip here.
vec4 fan(float seat, float sf, float row, float rows, float yt, vec3 q, bool back, float lod) {
	float seed = t_hash(seat * 0.1731 + row * 7.913);
	if (!occupied(q.xz, seed, row, rows)) return vec4(0.0);
	float exc = fract(seed * 7.13);
	// each backs the titan from their side of the square (a few came for the other one)
	float sup = step(q.x + (t_hash(seed * 5.3) - 0.5) * 8.0, 0.0);
	float jy = mix(joy.x, joy.y, sup);
	float dm = mix(dismay.x, dismay.y, sup);
	float react = clamp(jy - fract(seed * 13.37) * 0.9, 0.0, 1.0);
	float upset = clamp(dm - fract(seed * 29.11) * 0.9, 0.0, 1.0);
	float e = excite * (0.6 + 0.8 * exc);
	float near = fan_seat.w * (1.0 - smoothstep(fan_seat.z * 0.4, fan_seat.z, distance(q.xz, fan_seat.xy)));
	e += near;
	react = max(react, near * (0.4 + 0.6 * fract(seed * 3.9)));
	// ducking from a titan crashing down close by
	float fear = panic.w * (1.0 - smoothstep(panic.z * 0.5, panic.z, distance(q.xz, panic.xy))) * step(0.15, fract(seed * 4.7));
	float ang = atan(q.z, q.x);
	float da = abs(mod(ang - wave_a + PI_, 2.0 * PI_) - PI_);
	float wv = wave * smoothstep(0.3, 0.0, da);
	float t_ = bb_time;
	float r = t_hash(floor(t_ * (0.5 + exc * 0.7) + seed * 13.0) * 1.37 + seed * 91.7);
	float clap = 1.0 + step(0.5, fract(t_ * (3.2 + exc) + seed * 5.0));
	float pose;
	if (fear > 0.3) pose = 5.0;
	else if (upset > 0.04 && upset >= react) pose = 5.0;
	else if (react > 0.04) pose = r < 0.6 ? 4.0 : 3.0;
	else if (boo > fract(seed * 3.71) * 2.2) pose = 6.0;
	else if (e < 0.25) pose = r < 0.8 ? 0.0 : clap;
	else if (e < 0.55) pose = r < 0.4 ? 0.0 : r < 0.8 ? clap : 3.0;
	else if (e < 0.85) pose = r < 0.15 ? 0.0 : r < 0.55 ? clap : r < 0.8 ? 3.0 : 4.0;
	else pose = r < 0.1 ? clap : r < 0.45 ? 3.0 : 4.0;
	if (wv > 0.45) pose = 4.0;
	float t = t_ * (5.0 + exc * 3.0) + seed * 20.0;
	float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
	float lift = (hop + wv * 0.28 - fear * 0.5) / 15.0;

	float s = 0.86 + 0.16 * t_hash(seed * 17.1);
	float col = floor(t_hash(seed * 3.3) * 30.0);
	float flip = t_hash(seed * 8.1) < 0.5 ? -1.0 : 1.0;
	float sway = sin(t_ * (0.9 + exc) + seed * 30.0) * (0.012 + 0.03 * min(e + react, 1.0)) / 15.0;
	// (people don't stand in perfect files: each a little off their spot)
	float jx = (t_hash(seed * 2.17) - 0.5) * 0.35;
	float gy = (q.y - yt - lift) / (SPR_H * s);
	float gx = ((sf - seat - 0.5 - jx) * SEAT_W - sway * gy) / (SPR_W * s);
	if (back) flip = -flip;
	float lx = gx * flip + 0.5;

	// now and then a flag in their side's colours over the heads
	if (fract(seed * 61.7) < 0.03 && fear < 0.3) {
		float fx = gx * 0.9 - 0.15;
		float fy = gy - 0.95 - abs(sin(t * 0.4)) * 0.05;
		float wv2 = sin(fx * 9.0 - t_ * 7.0 + seed) * 0.06;
		if (fx > -0.05 && fx < 1.2 && fy - wv2 > 0.0 && fy - wv2 < 0.55) {
			vec3 fc = mix(team0, team1, sup) * (0.75 + 0.25 * sin(fx * 9.0 - t_ * 7.0 + seed + 1.0));
			return vec4(fc, 1.0);
		}
	}
	if (lx < 0.0 || lx > 1.0 || gy < 0.0 || gy > 1.0) return vec4(0.0);
	vec4 bb = texelFetch(bounds, ivec2(int(col + 0.5), int(pose + 0.5)), 0);
	if (lx < bb.x || lx > bb.y || gy < bb.z || gy > bb.w) return vec4(0.0);
	vec4 tex = textureLod(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES), lod);
	float a = lod < 0.8 ? smoothstep(0.35, 0.65, tex.a) : tex.a;
	if (a < 0.02) return vec4(0.0);

	float pick = t_hash(seed * 23.9);
	vec3 shirt;
	if (pick < 0.46) shirt = mix(team0, team1, sup) * (0.35 + 0.4 * t_hash(seed * 4.4));
	else {
		float p2 = t_hash(seed * 31.3);
		shirt = p2 < 0.22 ? vec3(0.62) : p2 < 0.5 ? vec3(0.03) : p2 < 0.6 ? vec3(0.42, 0.05, 0.04)
			: p2 < 0.7 ? vec3(0.6, 0.42, 0.06) : p2 < 0.8 ? vec3(0.05, 0.18, 0.07) : vec3(0.12, 0.14, 0.2);
	}
	vec3 hair = vec3(0.04, 0.025, 0.015) * (0.6 + 1.4 * t_hash(seed * 9.7));
	if (t_hash(seed * 12.1) < 0.15) hair = vec3(0.45, 0.32, 0.12);
	vec3 sk = skin[int(t_hash(seed * 2.9) * 6.99)];
	vec3 pa = pants[int(t_hash(seed * 6.1) * 7.99)];
	vec3 accent = mix(team0, team1, 1.0 - sup);
	bool bot = col > 22.5 && col < 27.5;
	if (back && gy > 0.72 && !bot) sk = hair;
	vec3 c = mix(gy > 0.60 ? hair : pa, shirt, tex.g);
	c = mix(c, bot ? hair * 2.0 + 0.2 : sk, tex.b * (1.0 - smoothstep(0.5, 0.95, tex.g)));
	c = mix(c, accent, smoothstep(0.5, 0.95, min(tex.g, tex.b)));
	float shade = back && gy > 0.68 ? textureLod(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES), lod + 3.5).r : tex.r;
	c *= shade * mix(0.5, 1.0, smoothstep(0.25, 0.62, gy));
	c *= 0.82 + 0.3 * t_hash(seed * 31.7);
	// phone screens held up, and their flashes at the big moments
	float flash = step(0.9993 - bb_flash * 0.006 - e * 0.0005, t_hash(seed * 77.7 + floor(t_ * 9.0) * 0.311));
	vec3 glow = vec3(0.0);
	if (!back && gy > 0.6 && gy < 0.85) glow = vec3(1.5, 1.45, 1.35) * flash * 4.0;
	return vec4(c + glow * 0.0, a);
}

// The crowd from far off, where a person is a pixel or less: what a pixel's patch of it averages
// to. Soft blotches, whole patches in one side's colours, a faint grain.
vec4 crowd_far(float sf, float row, vec3 q, float w) {
	float sup = step(q.x + (t_noise(vec2(floor(sf / 30.0) * 0.61, 3.1)) - 0.5) * 8.0, 0.0);
	vec3 team = mix(team0, team1, sup);
	vec2 cell = vec2(sf / 4.0, row / 1.5);
	float detail = smoothstep(0.6, 2.5, 4.0 / w);
	float n = mix(0.5, t_noise(cell), detail);
	float patch_ = t_noise(vec2(sf / 22.0, row / 6.0) + 40.0);
	vec3 neutral = mix(vec3(0.035, 0.032, 0.034), vec3(0.3, 0.28, 0.26), n);
	float tk = smoothstep(0.35, 0.75, patch_) * 0.75 + 0.2;
	vec3 c = mix(neutral, team * (0.28 + 0.2 * n), tk * 0.55);
	c = mix(c, vec3(0.36, 0.22, 0.15), 0.16);
	float g = t_hash2(floor(vec2(sf, row * 3.0)));
	c *= 1.0 + (g - 0.5) * 0.3 * smoothstep(0.3, 1.0, 1.0 / w);
	// the boulevard and the lanes are empty paving
	float cover = occupied(q.xz, 0.5, row, 80.0) ? 0.9 : 0.0;
	return vec4(c, cover);
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 p = v_world;
	vec3 d = normalize(p - cam);
	float r0 = v_tier.x, dep = v_tier.y, y0 = v_tier.z;
	float rows = v_rows;
	float r_back = r0 + rows * dep;

	float cr = length(cam.xz);
	float t0 = max(0.0, length(p - cam) - 0.03);
	if (cr > r0 && cr < r_back && cam.y < y0 + 0.16 && length(p - cam) < 1.5) t0 = 0.0;
	vec3 s = cam + d * t0;
	float rs = length(s.xz);
	bool outward = dot(s.xz, d.xz) >= 0.0;
	float j = floor((rs - r0) / dep);
	if (outward) {
		if (rs > r0 + (j + CARD) * dep) j += 1.0;
	} else if (rs < r0 + (j + CARD) * dep) j -= 1.0;

	float pix = 2.0 / (PROJECTION_MATRIX[1][1] * VIEWPORT_SIZE.y);
	float texel = SPR_H / (float(textureSize(atlas, 0).y) / POSES);

	vec3 acc = vec3(0.0);
	float acc_a = 0.0;
	vec3 hit = vec3(0.0);
	bool ground_hit = false;
	vec3 last_q = p;
	int busy = 0;
	for (int it = 0; it < 160; it++) {
		if (j < 0.0 || j >= rows || busy >= max_rows) break;
		float rc = r0 + (j + CARD) * dep;
		float tc = cyl(cam, d, rc, outward);
		if (tc < t0 - 0.05) {
			if (!outward) { outward = true; continue; }
			break;
		}
		vec3 q = cam + d * tc;
		last_q = q;
		float yt = y0;
		if (q.y > yt + 0.2) {
			j += outward ? 1.0 : -1.0;
			continue;
		}
		busy++;
		if (q.y < yt) {
			ground_hit = true;
			float ty = abs(d.y) > 1e-4 ? (yt - cam.y) / d.y : tc;
			hit = cam + d * clamp(ty, t0, tc);
			break;
		}
		float lod = max(0.0, log2(max(tc * pix / texel, 1e-4)));
		float ang = atan(q.z, q.x);
		float seats = floor(2.0 * PI_ * rc / SEAT_W);
		float sf = (ang / (2.0 * PI_) + 0.5) * seats;
		float si = floor(sf);
		float fan_px = SPR_H / max(tc * pix, 1e-6);
		float kf = 1.0 - smoothstep(2.5, 6.0, fan_px);
		vec4 f = vec4(0.0);
		if (kf < 0.999) {
			f = fan(si, sf, j, rows, yt, q, !outward, lod);
			float nb = fract(sf) < 0.5 ? si - 1.0 : si + 1.0;
			if (f.a < 0.99) {
				vec4 g = fan(nb, sf, j, rows, yt, q, !outward, lod);
				f = f.a >= g.a ? f : g;
			}
		}
		if (kf > 0.001) {
			float w = max(tc * pix / SEAT_W, 1e-3);
			f = mix(f, crowd_far(sf, j, q, w), kf);
		}
		acc += (1.0 - acc_a) * f.a * f.rgb;
		acc_a += (1.0 - acc_a) * f.a;
		if (acc_a > 0.97) break;
		j += outward ? 1.0 : -1.0;
	}
	bool exited = !ground_hit && (j < 0.0 || j >= rows);
	if (exited && acc_a < 0.5) discard;
	vec3 bg;
	if (exited) {
		bg = acc / max(acc_a, 1e-3);
	} else {
		// the paving between their feet (in shadow under them)
		vec3 h = ground_hit ? hit : last_q;
		bg = vec3(0.3, 0.29, 0.27) * (0.8 + 0.3 * t_noise(h.xz * 60.0));
	}
	vec3 c = acc + (1.0 - acc_a) * bg;
	ALBEDO = c;
	// lit as upright figures facing the ring, a little from above
	vec3 radial = normalize(vec3(last_q.x, 0.0, last_q.z));
	vec3 nw = normalize((outward ? -radial : radial) + vec3(0.0, 0.6, 0.0));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	ROUGHNESS = 0.9;
	SPECULAR = 0.2;
	FOG = t_haze(p, cam);
}
