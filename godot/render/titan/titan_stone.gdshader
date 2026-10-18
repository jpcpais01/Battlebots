// The Titan Colosseum's stone and concrete (titan_build.gd bowl()): warm travertine ashlar, the
// podium's blind arcade, paving, the tier fronts with their LED ribbons and perimeter boards, the
// attic's open arcade against the sky, the gate blocks and their tunnels. Unshaded: lit here by
// the venue's sun and sky (titan_common), with the rim's own shadow worked out per pixel.
// UV = (metres along, height or radius), UV2 = (pattern, extra); see TitanBuild.bowl().
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);

varying vec3 v_w;
varying vec3 v_n;
varying vec2 v_pat;

const vec3 STONE = vec3(0.62, 0.53, 0.42);

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_pat = UV2;
}

// Ashlar: courses `h` tall, blocks `w` long (staggered), mortar, each block's own tint and the
// weather streaking down the face.
vec3 ashlar(vec2 q, float w, float h, out float mortar) {
	float row = floor(q.y / h);
	float x = q.x / w + row * 0.5;
	vec2 cell = vec2(floor(x), row);
	vec2 f = vec2(fract(x), fract(q.y / h));
	vec2 e = min(f, 1.0 - f) * vec2(w, h);
	mortar = 1.0 - smoothstep(0.004, 0.012, min(e.x, e.y));
	float tint = t_hash2(cell);
	vec3 c = STONE * (0.82 + 0.3 * tint) * vec3(1.0, 0.98 - 0.05 * t_hash2(cell + 3.1), 0.95);
	float streak = t_fbm(vec2(q.x * 3.0, q.y * 0.35));
	c *= 0.86 + 0.24 * streak;
	return mix(c, c * 0.55, mortar);
}

// The LED ribbon's picture at u (metres round the bowl) and v (0..1 up the band).
vec3 led(float u, float v, float speed, float scale) {
	float t = bb_time * speed;
	float k = fract((u * scale - t) * 0.05);
	vec3 c = mix(team0, team1, step(0.5, fract(u * scale * 0.01 + floor(t * 0.05))));
	// chevrons sweeping round, with a bright head
	float chev = fract(u * scale * 0.22 - abs(v - 0.5) * 0.9 - t * 0.6);
	c *= 0.35 + 0.9 * smoothstep(0.45, 0.55, chev) * (1.0 - smoothstep(0.85, 1.0, chev));
	c += vec3(1.0, 0.95, 0.85) * smoothstep(0.97, 1.0, k) * 1.5;
	c *= 1.0 + bb_hype * 0.6 + bb_flash * 2.0;
	// the LED pitch
	vec2 px = fract(vec2(u * scale * 6.0, v * 8.0));
	c *= 0.65 + 0.35 * step(0.25, px.x) * step(0.25, px.y);
	return c * 1.6;
}

void fragment() {
	vec3 p = v_w;
	vec3 nrm = normalize(v_n);
	float pat = v_pat.x;
	float extra = v_pat.y;
	vec2 q = UV;
	vec3 albedo = STONE;
	vec3 glow = vec3(0.0);
	float ao = 1.0;
	float mortar = 0.0;
	if (pat < 0.5) {
		albedo = ashlar(q, 0.9, 0.45, mortar);
	} else if (pat < 1.5) {
		// the podium: a blind arcade of tall arches, a cornice, and a band of dark openings at the foot
		albedo = ashlar(q, 0.75, 0.3, mortar);
		float bay = 2.4;
		float x = fract(q.x / bay) - 0.5;
		float y = q.y - T_GROUND_Y;
		float hw = 0.36;
		float spring = 1.15;
		float in_arch = step(abs(x) * bay, hw) * step(y, spring) + step(length(vec2(x * bay, max(y - spring, 0.0))), hw) * step(spring, y);
		in_arch *= step(0.06, y);
		float depth = smoothstep(0.0, 0.08, hw - max(abs(x * bay), length(vec2(x * bay, max(y - spring, 0.0))) * step(spring, y)));
		albedo = mix(albedo, albedo * mix(0.42, 0.25, depth), in_arch);
		// a bronze titan's shield in every fourth arch
		float sh = length(vec2(x * bay, y - 0.9));
		if (mod(floor(q.x / bay), 4.0) == 0.0 && sh < 0.2) {
			albedo = vec3(0.45, 0.28, 0.1) * (0.7 + 0.6 * smoothstep(0.2, 0.0, sh)) * (sh > 0.16 ? 0.6 : 1.0);
			mortar = 0.0;
		}
		// cornice and plinth
		float top = smoothstep(1.62, 1.66, y);
		albedo = mix(albedo, STONE * 1.05, top);
		ao *= mix(1.0, 0.7, smoothstep(1.58, 1.62, y) * (1.0 - top));
		ao *= 0.75 + 0.25 * smoothstep(0.0, 0.25, y);
	} else if (pat < 2.5) {
		// paving slabs
		vec2 s = vec2(q.x, q.y) / 0.6;
		vec2 f = fract(s);
		vec2 e = min(f, 1.0 - f) * 0.6;
		mortar = 1.0 - smoothstep(0.003, 0.009, min(e.x, e.y));
		albedo = STONE * (0.78 + 0.22 * t_hash2(floor(s))) * mix(1.0, 0.6, mortar);
		albedo *= 0.85 + 0.2 * t_fbm(q * 1.7);
	} else if (pat < 3.5) {
		// a tier's front wall: stone, with an LED ribbon round the bowl in its middle third
		albedo = ashlar(q, 0.9, 0.4, mortar);
		float wall_bottom = extra < 0.5 ? 7.35 : 14.76;
		float h = q.y - wall_bottom;
		float span = extra < 0.5 ? 1.62 : 1.51;
		float v = (h - span * 0.42) / (span * 0.3);
		if (v > 0.0 && v < 1.0) {
			albedo = vec3(0.02);
			glow = led(q.x, v, 3.0 + extra, 1.0 + extra * 0.3);
			mortar = 0.0;
		}
		ao *= mix(0.62, 1.0, smoothstep(0.0, 0.3, h));
	} else if (pat < 4.5) {
		// the attic's open arcade: arches with the sky through them, pilasters between
		float bay = 1.7;
		float x = fract(q.x / bay) - 0.5;
		float y = q.y - 21.1;
		float hw = 0.52;
		float spring = 3.3;
		float r = length(vec2(x * bay, max(y - spring, 0.0)));
		bool open = y > 0.55 && (y < spring ? abs(x * bay) < hw : r < hw);
		if (open) discard;
		albedo = ashlar(q, 0.85, 0.42, mortar);
		float edge = y < spring ? hw - abs(x * bay) : hw - r;
		ao *= mix(0.6, 1.0, smoothstep(-0.12, -0.02, edge) + step(0.0, -edge) * 0.0);
		// the pilasters stand proud, a cornice runs round the top
		float pil = smoothstep(0.1, 0.12, abs(abs(x) - 0.5) * bay);
		albedo *= mix(1.1, 1.0, pil);
		albedo *= mix(1.0, 1.15, smoothstep(5.2, 5.3, y));
	} else if (pat < 5.5) {
		// the perimeter boards along the front of the lower tier
		float h = q.y - 1.2;
		float span = 0.42;
		float v = h / span;
		albedo = vec3(0.025);
		glow = led(q.x * 1.6, v, 6.0, 1.4);
		glow *= 0.8 + 0.2 * step(0.08, v) * step(v, 0.92);
	} else if (pat < 6.5) {
		// a gate block: huge courses, with vertical grooves lit in the gate's corner colour and
		// a frieze at the top
		albedo = ashlar(q, 1.2, 0.6, mortar) * 0.95;
		float side = step(0.0, p.x);
		vec3 tc = mix(team1, team0, side);
		if (extra < 0.5) {
			float gx = abs(fract(q.x / 1.13 + 0.5) - 0.5) * 1.13;
			float groove = 1.0 - smoothstep(0.03, 0.05, gx);
			float above = step(3.6, q.y);
			glow += tc * groove * above * (1.2 + 0.8 * sin(q.y * 1.3 - bb_time * 2.0) + bb_hype) * smoothstep(9.3, 8.5, q.y);
			albedo *= 1.0 - 0.5 * groove * above;
		}
		albedo *= mix(1.0, 1.25, smoothstep(8.6, 8.7, q.y));
		ao *= 0.8 + 0.2 * smoothstep(-0.6, 0.6, q.y);
	} else if (pat < 7.5) {
		// the tunnel: dark concrete, strip lights running back into the dark, a glowing far end
		albedo = vec3(0.12, 0.11, 0.1) * (0.7 + 0.3 * t_fbm(q * 2.0));
		float depth = clamp(length(p.xz) - 20.6, 0.0, 8.0) / 7.0;
		ao *= mix(0.55, 0.1, depth);
		if (extra > 1.5) {
			albedo = vec3(0.02);
			glow = mix(team1, team0, step(0.0, p.x)) * 0.6;
		} else if (extra < 0.5) {
			float strip = 1.0 - smoothstep(0.01, 0.025, abs(fract(q.y * 1.2) - 0.5) * 0.83);
			glow = vec3(1.0, 0.85, 0.6) * strip * step(0.5, fract(length(p.xz) * 0.8)) * 0.7;
		}
	} else {
		// plain dark concrete
		albedo = vec3(0.3, 0.27, 0.23) * (0.8 + 0.3 * t_fbm(q * 1.3));
	}
	vec3 light = t_light(p, nrm, t_rim_light(p + nrm * 0.05));
	ALBEDO = albedo * light * ao + glow;
}
