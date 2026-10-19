// The crowd (src/render/crowd.ts): every fan a billboard sprite from the painted atlas, posed and
// lit in the vertex shader from what the fight is doing (crowd.gd drives the uniforms).
// VERTEX iPos (the seat), UV the quad corner (x -0.5..0.5, y 0..1), CUSTOM0 iData (scale, column,
// seed, flags), CUSTOM1 iShirt (rgb, skin index/255), CUSTOM2 iHair (rgb, pants index/255),
// CUSTOM3 iAccent (rgb).
// Fans in the bowl's seats also draw their seat's moulded back (venue.ts, the seat-back block)
// inside their own quad: each pixel's view ray is cast onto the real shell's plane, so the shell
// sits exactly where the old 8-triangle geometry did (tools/bake/seat_backs.ts took that out of
// the stands and packed each seat into iData.w).
shader_type spatial;
render_mode unshaded, cull_disabled, world_vertex_coords;
#include "res://render/venue/common.gdshaderinc"

const float COLS = 34.0;
const float POSES = 7.0;
const float SPR_W = 0.9;
const float SPR_H = 2.1;
const float PI_ = 3.14159265;

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
uniform sampler2D bounds : filter_nearest;
uniform float wave = 0.0;
uniform float wave_a = 0.0;
uniform float excite = 0.15;
uniform float boo = 0.0;
uniform vec2 joy = vec2(0.0);
uniform vec2 dismay = vec2(0.0);
uniform float day = 0.0;
uniform vec3 day_light = vec3(1.0);
uniform vec4 hot[4];
uniform vec3 skin[7];
uniform vec3 pants[8];

varying vec4 v_uv;
varying vec3 v_shirt;
varying vec3 v_hair;
varying vec3 v_skin;
varying vec3 v_pants;
varying vec3 v_accent;
// the figure's cell coordinates (atlas x 0..1, height 0..1) and its tight bounds in this pose
varying vec2 v_cell;
varying flat vec4 v_bb;
// the seat back: shell coordinates in metres as a projective pair (xy / z), and its lit colour
varying vec3 v_seat;
varying flat vec3 v_seat_c;

// venue.ts: the two tiers' seat colours (linear), the bowl's straight runs (bowl.ts AX - RC, AZ - RC)
const vec3 SEAT_LOW = vec3(0.10224, 0.011881, 0.015996);
const vec3 SEAT_UP = vec3(0.012286, 0.025187, 0.072272);
const vec2 BOWL_RUN = vec2(6.0, 3.0);

float h1(float n) { return fract(sin(n) * 43758.5453); }

void vertex() {
	vec3 ipos = VERTEX;
	vec4 idata = CUSTOM0;
	float seed = idata.z;
	// bits: 1 mirrored, 2 empty seat, 4 floor staff, 8 walker; 16 and up: the seat it sits in
	int packed = int(round(idata.w));
	float flags = float(packed & 15);
	bool empty = mod(flags, 4.0) >= 2.0;
	// floor staff never sit or join the wave; some walk up and down their patch
	bool staff = mod(flags, 8.0) >= 4.0;
	bool walker = flags > 7.5;
	bool calm = idata.y > 29.5 && idata.y < 32.5;
	float flip = mod(flags, 2.0) > 0.5 ? -1.0 : 1.0;
	float exc = fract(seed * 7.13);
	vec3 base = ipos;
	float stride = 0.0;
	float t_ = bb_time;
	if (walker) {
		float ph = t_ * 0.3 + seed * 6.283;
		vec2 tang = normalize(vec2(-ipos.z, ipos.x));
		base.xz += tang * sin(ph) * 1.3;
		float moving = step(0.25, abs(cos(ph)));
		float st = fract(t_ * 1.7 + seed * 3.0);
		stride = moving * (st < 0.25 ? 0.0 : st < 0.5 ? 1.0 : st < 0.75 ? 0.0 : 2.0);
	}

	// the wave: a band of standing fans sweeping round the bowl
	float ang = atan(ipos.z, ipos.x);
	float da = abs(mod(ang - wave_a + PI_, 2.0 * PI_) - PI_);
	float wv = staff ? 0.0 : wave * smoothstep(0.55, 0.0, da);

	// a robot part just came flying into the seats: everyone near it is up and losing it
	float hk = 0.0;
	vec3 hot_at = vec3(0.0);
	for (int i = 0; i < 4; i++) {
		vec4 h = hot[i];
		float k = h.w * (1.0 - smoothstep(0.6, 5.5, distance(ipos, h.xyz)));
		if (k > hk) { hk = k; hot_at = h.xyz; }
	}
	hk *= 0.75 + 0.5 * fract(seed * 3.97);
	vec2 to_hot = hot_at.xz - ipos.xz;
	float d_hot = length(to_hot);
	if (!empty && hk > 0.01 && d_hot > 0.4) base.xz += to_hot / d_hot * min(d_hot - 0.4, 0.35) * clamp(hk, 0.0, 1.0);

	// each fan backs the robot from their side of the arena (a few sit with the other lot)
	float sup = step(0.0, ipos.x + (h1(seed * 5.3) - 0.5) * 30.0);
	float jy = mix(joy.x, joy.y, sup);
	float dm = mix(dismay.x, dismay.y, sup);
	float react = clamp(jy - fract(seed * 13.37) * 0.9, 0.0, 1.0);
	float upset = clamp(dm - fract(seed * 29.11) * 0.9, 0.0, 1.0);
	float e = excite * (0.6 + 0.8 * exc);

	float stand_t = mix(0.78, 0.32, exc);
	float stand = staff ? 1.0 : smoothstep(stand_t - 0.1, stand_t + 0.1, e + react * 1.5 + upset * 0.8 + wv + hk * 3.0);

	float rate = 0.5 + exc * 0.7;
	float slot = floor(t_ * rate + seed * 13.0);
	float r = h1(slot * 1.37 + seed * 91.7);
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
	if (hk > 0.15) {
		float rh = h1(floor(t_ * (2.5 + exc * 2.0) + seed * 7.0) * 2.17 + seed * 53.1);
		pose = rh < 0.45 ? 4.0 : rh < 0.75 ? 5.0 : 3.0;
	}
	if (calm) pose = stride;

	float t = t_ * (5.0 + exc * 3.0) + seed * 20.0;
	float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
	hop += max(0.0, sin(t * 1.5)) * 0.26 * clamp(hk, 0.0, 1.0);
	float lift = -0.46 * (1.0 - stand) + hop * stand;
	lift += pose == 3.0 ? max(0.0, sin(t * 1.3)) * 0.03 : 0.0;
	lift += wv * 0.28;
	float sway = sin(t_ * (0.9 + exc + hk * 4.0) + seed * 30.0) * (0.012 + 0.03 * min(e + react + hk * 2.0, 1.0));
	if (empty || calm) { lift = 0.0; sway *= 0.3; }
	if (empty) pose = 0.0;

	// cylindrical billboard; fans differ a little in build as well as height
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 to_cam = cam - base;
	vec3 fwd = normalize(vec3(to_cam.x, 0.0, to_cam.z));
	vec3 right = vec3(fwd.z, 0.0, -fwd.x);
	float s = idata.x;
	float wide = empty ? 1.0 : 0.9 + 0.2 * h1(seed * 17.1);
	float fw = SPR_W * s * wide, fh = SPR_H * s;
	// the figure in this pose spans gx -0.5..0.5 across (mirrored or not) and gy 0..1 up its cell:
	// in metres on the billboard, x = gx * fw + sway * gy and y = gy * fh + lift
	vec4 bb = texelFetch(bounds, ivec2(int(idata.y + 0.5), int(pose + 0.5)), 0);
	float gx0 = flip > 0.0 ? bb.x - 0.5 : 0.5 - bb.y;
	float gx1 = flip > 0.0 ? bb.y - 0.5 : 0.5 - bb.x;
	vec2 lo = vec2(gx0 * fw + min(sway * bb.z, sway * bb.w), bb.z * fh + lift);
	vec2 hi = vec2(gx1 * fw + max(sway * bb.z, sway * bb.w), bb.w * fh + lift);

	// the seat back (venue.ts): 0.5 m wide on a 0.5 m quad from 0.36 m above the seat, set back
	// 0.32 of the row's depth, leaning 6 cm out at the top, facing the ring
	v_seat = vec3(0.0, 0.0, -1.0);
	v_seat_c = vec3(0.0);
	vec3 sb = vec3(0.0);
	vec3 tn = vec3(0.0);
	vec3 nrm = vec3(0.0);
	float k = -1.0;
	if (packed >= 16) {
		int code = (packed >> 4) - 1;
		int shade = code / 1681;
		int jz = (code - shade * 1681) / 41;
		int jx = code - shade * 1681 - jz * 41;
		vec3 st = ipos + vec3(float(jx - 20), 0.0, float(jz - 20)) * 0.002;
		// out from the bowl's rounded-rectangle outline (bowl.ts outline: corners round (6, 3))
		vec2 sn = normalize(st.xz - clamp(st.xz, -BOWL_RUN, BOWL_RUN));
		bool upper = st.y > 9.0;
		sb = vec3(st.x, st.y + 0.36, st.z) + vec3(sn.x, 0.0, sn.y) * (upper ? 0.272 : 0.288);
		tn = vec3(-sn.y, 0.0, sn.x);
		// the shell's plane (across, and up with its lean); the normal points away from the ring,
		// and only its front is drawn, as before
		nrm = vec3(sn.x * 0.5, -0.06, sn.y * 0.5);
		k = dot(sb - cam, nrm);
		if (k > 0.0) {
			// grow the quad over the shell's corners as seen from here (projected onto the billboard)
			vec3 lean = vec3(sn.x, 0.0, sn.y) * 0.12;
			float dc = dot(base - cam, -fwd);
			for (int c = 0; c < 4; c++) {
				float cu = (c & 1) == 0 ? -0.21 : 0.21;
				float cv = c < 2 ? 0.0 : 0.5;
				vec3 q = sb + tn * cu + vec3(0.0, cv, 0.0) + lean * cv - cam;
				float dq = dot(q, -fwd);
				if (dq > 0.05) {
					vec3 on = cam + q * (dc / dq) - base;
					vec2 sxy = vec2(dot(on, right), on.y);
					lo = min(lo, sxy - 0.02);
					hi = max(hi, sxy + 0.02);
				}
			}
			float ty = clamp(st.y / 20.0, 0.0, 1.0);
			float kk = (1.0 - sqrt(ty) * 0.5) * (0.85 + 0.3 * float(shade) / 100.0);
			v_seat_c = (upper ? SEAT_UP : SEAT_LOW) * kk * house_light(sb + vec3(0.0, 0.25, 0.0));
		}
	}
	// (each fan is its own quad, drawn nearest the ring first: BakedScene._front_first)
	vec2 xy = mix(lo, hi, vec2(UV.x + 0.5, UV.y));
	vec3 p = base + right * xy.x + vec3(0.0, xy.y, 0.0);
	if (k > 0.0) {
		// where this corner's view ray meets the shell's plane, in shell metres (across, up), as a
		// numerator and denominator so the GPU interpolates it exactly across the quad
		vec3 d = p - cam;
		float den = dot(d, nrm);
		vec3 o = cam - sb;
		v_seat = vec3(dot(d, tn) * k + dot(o, tn) * den, d.y * k + o.y * den, den);
	}

	float gy = (xy.y - lift) / fh;
	float gx = (xy.x - sway * gy) / fw;
	float lx = gx * flip + 0.5;
	v_cell = vec2(lx, gy);
	v_bb = bb;
	// the ring is the key light: the side of each fan turned towards it is brighter
	vec2 to_ring = -ipos.xz / max(1.0, length(ipos.xz));
	float side = dot(right.xz, to_ring) * gx * 2.0;
	v_uv = vec4((idata.y + lx) / COLS, (pose + 1.0 - gy) / POSES, gy, side);

	// light: brighter near the ring, team colour wash from each corner, roaming spotlights
	float hgt = clamp(ipos.y / 19.0, 0.0, 1.0);
	vec3 L = mix(vec3(0.44, 0.42, 0.45), vec3(0.15, 0.17, 0.25), sqrt(hgt));
	float sx = clamp(ipos.x / max(1.0, length(ipos.xz)), -1.0, 1.0);
	L += mix(vec3(1.0, 0.45, 0.12), vec3(0.15, 0.7, 1.0), sx * 0.5 + 0.5) * (0.2 * (1.0 - hgt * 0.6));
	L *= house_light(ipos);
	L = mix(L, day_light * (1.0 - 0.18 * hgt), day);
	vec3 sp = vec3(1.0, 0.95, 0.85);
	L += sp * smoothstep(bb_spot0.z, bb_spot0.z * 0.55, distance(ipos.xz, bb_spot0.xy)) * bb_spot0.w;
	L += sp * smoothstep(bb_spot1.z, bb_spot1.z * 0.55, distance(ipos.xz, bb_spot1.xy)) * bb_spot1.w;
	L += sp * smoothstep(bb_spot2.z, bb_spot2.z * 0.55, distance(ipos.xz, bb_spot2.xy)) * bb_spot2.w;
	L += mix(vec3(1.0, 0.5, 0.15), vec3(0.2, 0.75, 1.0), step(0.5, fract(t_ * 5.0))) * bb_flash * 0.35 * (1.0 - hgt);
	L *= (0.8 + 0.2 * bb_hype) * (0.78 + 0.32 * h1(seed * 31.7));
	v_shirt = CUSTOM1.rgb * L;
	v_hair = CUSTOM2.rgb * L;
	// robots have no skin: that mask is their LEDs, glowing softly in the robot's own colour
	bool bot = idata.y > 22.5 && idata.y < 27.5;
	v_skin = bot ? CUSTOM2.rgb * (0.45 + 1.2 * L) : skin[int(CUSTOM1.a * 255.0 + 0.5)] * L;
	v_pants = pants[int(CUSTOM2.a * 255.0 + 0.5)] * L;
	v_accent = CUSTOM3.rgb * L;
	VERTEX = p;
}

// sRGB to linear for a 0..1 tone, a cubic within a fraction of a percent of the exact curve
float srgb_lin(float g) {
	return g * (g * (g * 0.305306011 + 0.682171111) + 0.012522878);
}

void fragment() {
	// Everything that needs a neighbour's value comes first, then whatever lies in neither the
	// figure's bounds nor the seat back's leaves straight away: a quad's corners round the head
	// and either side of the seat are a fair share of the crowd's pixels.
	vec2 sh = v_seat.xy / v_seat.z;
	vec2 px = fwidth(sh);
	vec2 uv_dx = dFdx(v_uv.xy);
	vec2 uv_dy = dFdy(v_uv.xy);
	bool fig = all(greaterThanEqual(v_cell, v_bb.xz)) && all(lessThanEqual(v_cell, v_bb.yw));
	float pm = max(px.x, px.y);
	vec2 sq = abs(sh - vec2(0.0, 0.25));
	bool seat = v_seat.z > 0.0 && sq.x < 0.203 + pm && sq.y < 0.235 + pm;
	if (!fig && !seat) discard;
	// the fan, only inside the figure's bounds (the quad can be bigger: it also holds the seat back)
	vec4 t = vec4(0.0);
	float a = 0.0;
	if (fig) {
		t = textureGrad(atlas, v_uv.xy, uv_dx, uv_dy);
		// sharpen the mip-blurred edge (to about a pixel: what the edge's slope is across a pixel
		// at the mip the GPU picks; the 0.5 cut itself is exact)
		a = clamp((t.a - 0.5) * 2.0 + 0.5, 0.0, 1.0);
	}
	float ly = v_uv.z;
	vec3 c = mix(ly > 0.60 ? v_hair : v_pants, v_shirt, t.g);
	c = mix(c, v_skin, t.b * (1.0 - smoothstep(0.5, 0.95, t.g)));
	c = mix(c, v_accent, smoothstep(0.5, 0.95, min(t.g, t.b)));
	// drawn shading, the ring's side light, and the row in front shading legs and bellies
	c *= t.r * (1.0 + 0.45 * v_uv.w) * mix(0.5, 1.0, smoothstep(0.25, 0.62, ly));
	// the seat back behind them: a shell 0.41 m across from 1.5 to 48.5 cm up its quad, its top
	// corners rounded (venue.ts SEAT_PTS), lighter at the top edge and in the middle (seatShade)
	if (a < 1.0 && seat) {
		vec2 q = sq;
		float r = sh.y > 0.25 ? 0.109 : 0.0;
		vec2 e = q - vec2(0.203, 0.235) + r;
		float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r;
		float cov = clamp(0.5 - sd / max(pm, 1e-5), 0.0, 1.0);
		float u = sh.x * 2.0 + 0.5, y = (1.0 - sh.y * 2.0) * 64.0;
		float tone = y < 16.0 ? 255.0 - 47.0 * (y / 16.0) : 208.0 - 86.0 * ((y - 16.0) / 48.0);
		float side = 1.0 - 0.35 * min(1.0, abs(u * 64.0 - 32.0) / 26.0);
		float g = srgb_lin(clamp(tone * side / 255.0, 0.0, 1.0));
		// the fan stands in front: their edge blends over the shell
		c = mix(v_seat_c * g, c, a);
		a += cov * (1.0 - a);
	}
	// (alpha-to-coverage would smooth these edges, but Godot draws it in the sorted alpha pass,
	// after the stands: kept in the opaque pass, the fans hide the stands' pixels behind them)
	if (a < 0.5) discard;
	ALBEDO = c;
	FOG = bb_fog(VERTEX);
}
