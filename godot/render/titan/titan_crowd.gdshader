// The Titan Colosseum's crowd: well over a million fans in three tiers, drawn without a single
// triangle each. The mesh is only an envelope over the stands (a cone at the fans' head height,
// titan_build.gd envelope()); each pixel casts its view ray into the tier and steps it row by row,
// meeting each row's fans as a ring of upright figure cards (the indoor arena's painted sprite
// atlas, posed per seat). The first figure the ray meets is drawn, a gap lets the ray on to the
// next row, and a ray that dips under a row's seats has hit the steps. So the crowd has true depth
// and parallax from the field and from inside the stands alike (the crowd's-eye shot), seen from
// the front or, from behind, their backs.
//
// The fans follow the same uniforms as the indoor crowd (crowd.gd ArenaCrowd drives them): the
// arena's excitement, each side's joy and dismay, boos and the Mexican wave.
//
// Per vertex: CUSTOM0 = the tier (front radius r0, row depth d, first tread height y0, rise per
// row h); CUSTOM1.x = rows, CUSTOM1.y = the tier's index.
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;
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
// The two corners' colours (linear): fans on each side wear them.
uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
// The crowd shot's fan (Director.crowd_seat): where they stand (xz), how far round them the fans
// are on their feet (z) and how wildly they cheer (w).
uniform vec4 fan_seat = vec4(0.0);
// Most rows a ray is stepped through before it settles for what it has.
uniform int max_rows = 12;

// crowd.gdshader's atlas: 34 figures by 7 poses; a figure's cell is 0.9 m by 2.1 m (robot metres
// over 15 here: these are people at the titans' scale).
const float COLS = 34.0;
const float POSES = 7.0;
const float SPR_W = 0.9 / 15.0;
const float SPR_H = 2.1 / 15.0;
// a seat is 0.5 m wide; every 28 seats a stair aisle 2 seats wide runs up the tier
const float SEAT_W = 0.5 / 15.0;
const float SECTION = 28.0;
const float AISLE = 2.0;
// how far into its row's depth the fans stand (from the row's front edge)
const float CARD = 0.55;
const float PI_ = 3.14159265;

varying flat vec4 v_tier;
varying flat vec2 v_rows;
varying vec3 v_world;

void vertex() {
	v_tier = CUSTOM0;
	v_rows = CUSTOM1.xy;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// Where the ray c + d t meets the cylinder of radius r round the y axis: the far root (leaving it,
// going outwards) or the near root (coming in); -1 when it misses.
float cyl(vec3 c, vec3 d, float r, bool far_root) {
	float a = dot(d.xz, d.xz);
	float b = dot(c.xz, d.xz);
	float k = dot(c.xz, c.xz) - r * r;
	float disc = b * b - a * k;
	if (disc < 0.0 || a < 1e-8) return -1.0;
	float s = sqrt(disc);
	return far_root ? (-b + s) / a : (-b - s) / a;
}

// One seat's fan at the point q on its row's card: rgb lit colour, a coverage (0 when the seat is
// empty or the point misses the figure). `sf` is the point's seat coordinate along the row,
// `seat` the seat tried (this one or a neighbour), `yt` the row's tread height, `back` when the
// fan is seen from behind, `lod` the atlas mip for this distance.
vec4 fan(float seat, float sf, float row, float tier, float yt, vec3 q, bool back, float lod, vec3 light, float sun_side) {
	float seed = t_hash(seat * 0.1731 + row * 7.913 + tier * 131.7);
	// a few empty seats, and the stair aisles
	if (fract(seed * 91.3) < 0.035 || mod(seat, SECTION) < AISLE) return vec4(0.0);
	float exc = fract(seed * 7.13);
	// each fan backs the robot from their side of the stadium (a few sit with the other lot)
	float sup = step(q.x + (t_hash(seed * 5.3) - 0.5) * 40.0, 0.0);
	float jy = mix(joy.x, joy.y, sup);
	float dm = mix(dismay.x, dismay.y, sup);
	float react = clamp(jy - fract(seed * 13.37) * 0.9, 0.0, 1.0);
	float upset = clamp(dm - fract(seed * 29.11) * 0.9, 0.0, 1.0);
	float e = excite * (0.6 + 0.8 * exc);
	// the fans round the crowd shot's lens are up on their feet, arms in the air
	float near = fan_seat.w * (1.0 - smoothstep(fan_seat.z * 0.4, fan_seat.z, distance(q.xz, fan_seat.xy)));
	e += near;
	react = max(react, near * (0.4 + 0.6 * fract(seed * 3.9)));
	float ang = atan(q.z, q.x);
	float da = abs(mod(ang - wave_a + PI_, 2.0 * PI_) - PI_);
	float wv = wave * smoothstep(0.3, 0.0, da);
	float stand_t = mix(0.78, 0.32, exc);
	float stand = smoothstep(stand_t - 0.1, stand_t + 0.1, e + react * 1.5 + upset * 0.8 + wv);
	float t_ = bb_time;
	float r = t_hash(floor(t_ * (0.5 + exc * 0.7) + seed * 13.0) * 1.37 + seed * 91.7);
	float clap = 1.0 + step(0.5, fract(t_ * (3.2 + exc) + seed * 5.0));
	float pose;
	if (upset > 0.04 && upset >= react) pose = 5.0;
	else if (react > 0.04) pose = r < 0.6 ? 4.0 : 3.0;
	else if (boo > fract(seed * 3.71) * 2.2) pose = 6.0;
	else if (e < 0.25) pose = r < 0.88 ? 0.0 : clap;
	else if (e < 0.55) pose = r < 0.45 ? 0.0 : r < 0.85 ? clap : 3.0;
	else if (e < 0.85) pose = r < 0.15 ? 0.0 : r < 0.55 ? clap : r < 0.8 ? 3.0 : 4.0;
	else pose = r < 0.1 ? clap : r < 0.45 ? 3.0 : 4.0;
	if (stand < 0.5 && pose == 4.0) pose = clap;
	if (wv > 0.45) pose = 4.0;
	float t = t_ * (5.0 + exc * 3.0) + seed * 20.0;
	float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
	float lift = (-0.46 * (1.0 - stand) + hop * stand + wv * 0.28) / 15.0;

	float s = 0.86 + 0.16 * t_hash(seed * 17.1);
	float col = floor(t_hash(seed * 3.3) * 30.0);
	float flip = t_hash(seed * 8.1) < 0.5 ? -1.0 : 1.0;
	// across the figure (-0.5..0.5 of its cell) and up it (0 feet, 1 top of the cell)
	float sway = sin(t_ * (0.9 + exc) + seed * 30.0) * (0.012 + 0.03 * min(e + react, 1.0)) / 15.0;
	float gy = (q.y - yt - lift) / (SPR_H * s);
	float gx = ((sf - seat - 0.5) * SEAT_W - sway * gy) / (SPR_W * s);
	if (back) flip = -flip;
	float lx = gx * flip + 0.5;

	// now and then a fan waves a flag in their side's colours over the heads
	if (fract(seed * 61.7) < 0.022 && stand > 0.3) {
		float fx = gx * 0.9 - 0.15;
		float fy = gy - 0.95 - abs(sin(t * 0.4)) * 0.05;
		float wv2 = sin(fx * 9.0 - t_ * 7.0 + seed) * 0.06;
		if (fx > -0.05 && fx < 1.2 && fy - wv2 > 0.0 && fy - wv2 < 0.55) {
			vec3 fc = mix(team0, team1, sup) * (0.75 + 0.25 * sin(fx * 9.0 - t_ * 7.0 + seed + 1.0));
			return vec4(fc * light * 0.9, 1.0);
		}
	}
	if (lx < 0.0 || lx > 1.0 || gy < 0.0 || gy > 1.0) return vec4(0.0);
	vec4 bb = texelFetch(bounds, ivec2(int(col + 0.5), int(pose + 0.5)), 0);
	if (lx < bb.x || lx > bb.y || gy < bb.z || gy > bb.w) return vec4(0.0);
	vec4 tex = textureLod(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES), lod);
	float a = lod < 0.8 ? smoothstep(0.35, 0.65, tex.a) : tex.a;
	if (a < 0.02) return vec4(0.0);

	// their colours: half wear their side's colour, the rest whatever they came in
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
	// seen from behind: no faces, just the backs of heads
	if (back && gy > 0.72 && !bot) sk = hair;

	vec3 c = mix(gy > 0.60 ? hair : pa, shirt, tex.g);
	c = mix(c, bot ? hair * 2.0 + 0.2 : sk, tex.b * (1.0 - smoothstep(0.5, 0.95, tex.g)));
	c = mix(c, accent, smoothstep(0.5, 0.95, min(tex.g, tex.b)));
	// the drawn shading, the side the sun is on, and the row in front shading legs and bellies
	// (a sign held up seen from behind is its plain board: no lettering)
	float shade = back && gy > 0.68 ? textureLod(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES), lod + 3.5).r : tex.r;
	c *= shade * mix(0.45, 1.0, smoothstep(0.25, 0.62, gy));
	vec3 lit = light * (1.0 + 0.35 * sun_side * gx * flip);
	c *= lit * (0.82 + 0.3 * t_hash(seed * 31.7));
	if (back && lod < 2.0) {
		// close up from behind, a fan stands against the bright plain: their edges catch its light
		float ea = textureLod(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES), lod + 2.5).a;
		float rim = 1.0 - smoothstep(0.3, 0.75, ea);
		c = c * 1.5 + rim * (T_SUN_COL * 0.05 + vec3(0.04, 0.06, 0.025));
	}
	// phone cameras going off at the big moments
	float flash = step(0.9996 - bb_flash * 0.004 - e * 0.0004, t_hash(seed * 77.7 + floor(t_ * 9.0) * 0.311));
	if (!back && gy > 0.6 && gy < 0.85) c += vec3(1.5, 1.45, 1.35) * flash;
	return vec4(c, a);
}

// The crowd as seen from far off, where a fan is a pixel or less: what a pixel's patch of the
// row averages to. Soft blotches a few fans across, whole patches in one side's colours, the
// stair aisles (box-filtered over the pixel's width, `w` seats) and a faint grain.
vec4 crowd_far(float sf, float row, float tier, vec3 q, float w, vec3 light) {
	float sec = floor(sf / SECTION);
	float sup = step(q.x + (t_noise(vec2(sec * 0.61, tier * 3.1)) - 0.5) * 34.0, 0.0);
	vec3 team = mix(team0, team1, sup);
	vec2 cell = vec2(sf / 4.0, row / 1.5);
	float detail = smoothstep(0.6, 2.5, 4.0 / w);
	float n = mix(0.5, t_noise(cell + tier * 17.0), detail);
	float patch_ = t_noise(vec2(sf / 22.0, row / 6.0) + tier * 5.3 + 40.0);
	vec3 neutral = mix(vec3(0.035, 0.032, 0.034), vec3(0.3, 0.28, 0.26), n);
	float tk = smoothstep(0.35, 0.75, patch_) * 0.75 + 0.2;
	vec3 c = mix(neutral, team * (0.28 + 0.2 * n), tk * 0.55);
	// faces and arms
	c = mix(c, vec3(0.36, 0.22, 0.15), 0.16);
	// a grain finer than the blotches, fading with distance before it can shimmer
	float g = t_hash2(floor(vec2(sf, row * 3.0)));
	c *= 1.0 + (g - 0.5) * 0.3 * smoothstep(0.3, 1.0, 1.0 / w);
	vec4 f = vec4(c * light, 0.85);
	// the aisles' stairs: stone, as much of the pixel as they cover
	float m = mod(sf, SECTION);
	float ais = clamp((min(m + w * 0.5, AISLE) - max(m - w * 0.5, 0.0)) / w, 0.0, 1.0)
		+ clamp((min(m + w * 0.5, SECTION + AISLE) - max(m - w * 0.5, SECTION)) / w, 0.0, 1.0);
	ais = clamp(ais, 0.0, 1.0);
	f = mix(f, vec4(vec3(0.5, 0.43, 0.34) * light * 0.75, 1.0), ais);
	return f;
}

// The vomitories: every other section, a tunnel mouth 14 seats wide opens into the middle of each
// tier, under a parapet. 1 when the seat and row are in one (and where its roof is), else 0.
float vomitory(float seat, float row, float rows, out float roof_row) {
	float v0 = floor(rows * 0.42);
	roof_row = v0 + 9.0;
	float sec = floor(seat / SECTION);
	float m = mod(seat, SECTION);
	if (mod(sec, 2.0) != 1.0 || m < 7.0 || m >= 21.0) return 0.0;
	return step(v0, row) * step(row, roof_row - 0.5);
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 p = v_world;
	vec3 d = normalize(p - cam);
	float r0 = v_tier.x, dep = v_tier.y, y0 = v_tier.z, rise = v_tier.w;
	float rows = v_rows.x, tier = v_rows.y;
	float r_back = r0 + rows * dep;

	// start just before the envelope, or at the lens when it is in among the fans itself
	float cr = length(cam.xz);
	float t0 = max(0.0, length(p - cam) - 0.03);
	// (only for the envelope just round the lens: the tier's far side is marched from its surface)
	if (cr > r0 && cr < r_back && cam.y < y0 + (cr - r0) / dep * rise + 0.14 && length(p - cam) < 1.5) t0 = 0.0;
	vec3 s = cam + d * t0;
	float rs = length(s.xz);
	bool outward = dot(s.xz, d.xz) >= 0.0;
	float j = floor((rs - r0) / dep);
	if (outward) {
		if (rs > r0 + (j + CARD) * dep) j += 1.0;
	} else if (rs < r0 + (j + CARD) * dep) j -= 1.0;

	// the atlas mip: a screen pixel's size at this distance over one texel of a figure
	float pix = 2.0 / (PROJECTION_MATRIX[1][1] * VIEWPORT_SIZE.y);
	float texel = SPR_H / (float(textureSize(atlas, 0).y) / POSES);

	vec3 acc = vec3(0.0);
	float acc_a = 0.0;
	vec3 hit = vec3(0.0);
	bool step_hit = false;
	vec3 last_q = p;
	// rows the ray only passes high over (from a seat in the stands, the rows below fall away
	// under it) cost a step each, but no figures; it settles after max_rows rows with figures in
	int busy = 0;
	for (int it = 0; it < 192; it++) {
		if (j < 0.0 || j >= rows || busy >= max_rows) break;
		float rc = r0 + (j + CARD) * dep;
		float tc = cyl(cam, d, rc, outward);
		if (tc < t0 - 0.05) {
			// (a ray only grazing this row's circle turns back out)
			if (!outward) { outward = true; continue; }
			break;
		}
		vec3 q = cam + d * tc;
		last_q = q;
		float yt = y0 + j * rise;
		float ang = atan(q.z, q.x);
		float seats = floor(2.0 * PI_ * rc / SEAT_W);
		float sf = (ang / (2.0 * PI_) + 0.5) * seats;
		float si = floor(sf);
		float roof_row;
		if (vomitory(si, j, rows, roof_row) > 0.5) {
			// a tunnel mouth: dark under its roof, its parapet's lip on top; above that the ray
			// goes on to the rows behind
			float roof_y = y0 + roof_row * rise;
			if (q.y < roof_y + 0.012) {
				float sun_v = t_rim_light(q);
				float mm = mod(sf, SECTION);
				float edge = min(mm - 7.0, 21.0 - mm);
				vec3 st = vec3(0.5, 0.43, 0.34) * t_light(q, vec3(0.0, 0.3, 0.0) - normalize(vec3(q.x, 0.0, q.z)), sun_v);
				vec3 vc = q.y > roof_y - 0.006 || edge < 0.35 ? st * 0.8 : vec3(0.012, 0.011, 0.012) + st * 0.03 * (1.0 - (roof_y - q.y) / 0.2);
				acc += (1.0 - acc_a) * vc;
				acc_a = 1.0;
				break;
			}
			j += outward ? 1.0 : -1.0;
			continue;
		}
		if (q.y > yt + 0.2) {
			j += outward ? 1.0 : -1.0;
			continue;
		}
		busy++;
		if (q.y < yt) {
			step_hit = true;
			// back to where the ray came down onto this row's seats
			float ty = abs(d.y) > 1e-4 ? (yt - cam.y) / d.y : tc;
			hit = cam + d * clamp(ty, t0, tc);
			break;
		}
		float lod = max(0.0, log2(max(tc * pix / texel, 1e-4)));
		vec3 radial = vec3(q.x, 0.0, q.z) / max(rc, 1e-3);
		// the fans face the field: lit from the front when the sun is behind the lens's side
		float sun_k = t_rim_light(q + vec3(0.0, 0.08, 0.0));
		// (from behind, it's their backs the light falls on)
		vec3 n = outward ? -radial : radial;
		vec3 light = t_light(q, normalize(n + vec3(0.0, 0.35, 0.0)), sun_k);
		float side = dot(vec2(-radial.z, radial.x), normalize(T_SUN_DIR.xz)) * sun_k;
		// a fan's height in pixels here: from a few pixels down, the pixel shows what the patch of
		// crowd it covers averages to rather than whichever single fan it happens to hit
		float fan_px = SPR_H / max(tc * pix, 1e-6);
		float kf = 1.0 - smoothstep(2.5, 6.0, fan_px);
		vec4 f = vec4(0.0);
		if (kf < 0.999) {
			f = fan(si, sf, j, tier, yt, q, !outward, lod, light, side);
			// a fan's raised arm reaches into the next seat's
			float nb = fract(sf) < 0.5 ? si - 1.0 : si + 1.0;
			if (f.a < 0.99) {
				vec4 g = fan(nb, sf, j, tier, yt, q, !outward, lod, light, side);
				f = f.a >= g.a ? f : g;
			}
		}
		if (kf > 0.001) {
			float w = max(tc * pix / SEAT_W, 1e-3);
			f = mix(f, crowd_far(sf, j, tier, q, w, light), kf);
		}
		acc += (1.0 - acc_a) * f.a * f.rgb;
		acc_a += (1.0 - acc_a) * f.a;
		if (acc_a > 0.97) break;
		j += outward ? 1.0 : -1.0;
	}
	// a ray that left the tier (over the heads of its front or back row) without meeting enough
	// of anyone goes on to what is beyond: the bowl, the plain
	bool exited = !step_hit && (j < 0.0 || j >= rows);
	if (exited && acc_a < 0.5) discard;
	vec3 bg;
	if (exited) {
		bg = acc / max(acc_a, 1e-3);
	} else if (step_hit || acc_a < 0.97) {
		// the steps: seat rows in the tier's colour, the risers in stone, the aisles' stairs
		vec3 h = step_hit ? hit : last_q;
		float hr = length(h.xz);
		float rr = (hr - r0) / dep;
		float fr = fract(rr);
		float ang = atan(h.z, h.x);
		float seat = (ang / (2.0 * PI_) + 0.5) * floor(2.0 * PI_ * hr / SEAT_W);
		bool aisle = mod(seat, SECTION) < AISLE;
		vec3 seat_c = tier < 0.5 ? vec3(0.32, 0.045, 0.035) : tier < 1.5 ? vec3(0.62, 0.52, 0.38) : vec3(0.07, 0.11, 0.2);
		vec3 stone = vec3(0.55, 0.47, 0.37);
		vec3 base = aisle ? stone * (fr < 0.5 ? 1.0 : 0.82) : mix(stone * 0.7, seat_c, smoothstep(0.15, 0.3, fr) * (1.0 - smoothstep(0.85, 0.95, fr)));
		vec3 nrm = fr > 0.9 ? -normalize(vec3(h.x, 0.0, h.z)) : vec3(0.0, 1.0, 0.0);
		bg = base * t_light(h, nrm, t_rim_light(h)) * 0.8;
		if (!step_hit) bg = mix(bg, acc / max(acc_a, 1e-3), 0.0);
	} else {
		bg = vec3(0.0);
	}
	vec3 c = acc + (1.0 - acc_a) * bg;
	ALBEDO = c;
}
