// The Titan Colosseum's turf (titan_build.gd plain() and deck()): the fighting deck's turf and the
// plain round it, mown in broad stripes, chalked with the arena's rings, worn and torn up where
// the titans fight. Lit by the sun (it takes the robots' and the stadium's shadows) and the sky.
// UV2.x on the deck: 0 turf, 1+ the stone kerb and wall (UV2.y: 0 face, 1 step top, 2 wall).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_disabled;
#include "res://render/titan/titan_common.gdshaderinc"
#include "res://render/ao/contact_ao.gdshaderinc"

// The two corners' lift hatches (holes in the turf: the hatch, its doors and its deck are the
// arena's) and their radius.
uniform vec2 hatch0 = vec2(100.0);
uniform vec2 hatch1 = vec2(100.0);
uniform float hatch_r = 0.74;
// Ground scars from the titans' heaviest landings: xz, radius, how fresh (titan_fx.gd).
uniform vec4 scars[12];
uniform bool deck = false;

varying vec3 v_w;
varying vec2 v_pat;

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_pat = UV2;
}

vec3 turf(vec2 xz, float dist) {
	// mown stripes across the stadium, and wide, slow patches of richer and drier grass
	float stripe = step(0.5, fract(xz.x / 2.2));
	vec3 c = mix(vec3(0.095, 0.2, 0.04), vec3(0.135, 0.255, 0.055), stripe);
	float big = t_fbm(xz * 0.09);
	c *= 0.82 + 0.36 * big;
	c = mix(c, vec3(0.2, 0.22, 0.07), smoothstep(0.62, 0.8, t_fbm(xz * 0.21 + 4.0)) * 0.5);
	// the grass's own grain, fading out with distance before it can shimmer
	float fine = t_noise(xz * vec2(60.0, 7.0)) * 0.5 + t_noise(xz * vec2(9.0, 70.0)) * 0.5;
	c *= mix(1.0, 0.8 + 0.4 * fine, 1.0 - smoothstep(4.0, 14.0, dist));
	return c;
}

void fragment() {
	vec3 p = v_w;
	vec2 xz = p.xz;
	float dist = length(p - CAMERA_POSITION_WORLD);
	vec3 c;
	float rough = 0.95;
	if (v_pat.x > 0.5) {
		// the deck's stone: big pale blocks, a lighter kerb along the top
		float h = v_pat.y > 1.5 ? 0.42 : 0.12;
		float ang = atan(xz.y, xz.x);
		vec2 q = vec2(ang * 5.4, p.y);
		float row = floor(q.y / h);
		vec2 cell = vec2(floor(q.x / 0.75 + row * 0.5), row);
		vec2 f = vec2(fract(q.x / 0.75 + row * 0.5), fract(q.y / h));
		vec2 e = min(f, 1.0 - f) * vec2(0.75, h);
		float mortar = 1.0 - smoothstep(0.004, 0.01, min(e.x, e.y));
		c = vec3(0.6, 0.52, 0.41) * (0.82 + 0.3 * t_hash2(cell)) * mix(1.0, 0.55, mortar);
		c *= 0.85 + 0.25 * t_fbm(vec2(q.x * 3.0, q.y * 0.4));
		if (v_pat.y > 0.5 && v_pat.y < 1.5) c *= 1.12;
		// grass stains and dirt kicked up the wall's foot
		c = mix(c, vec3(0.15, 0.17, 0.06), (1.0 - smoothstep(T_GROUND_Y, T_GROUND_Y + 0.12, p.y)) * 0.6);
		rough = 0.85;
	} else {
		if (deck) {
			if (distance(xz, hatch0) < hatch_r || distance(xz, hatch1) < hatch_r) discard;
		}
		c = turf(xz, dist);
		float r = length(xz);
		if (deck) {
			// the turf is worn to earth where the titans circle, most in the middle
			float wear = smoothstep(0.35, 0.75, t_fbm(xz * 1.3) + (1.0 - smoothstep(0.5, 4.2, r)) * 0.32);
			c = mix(c, vec3(0.16, 0.11, 0.06) * (0.8 + 0.4 * t_noise(xz * 20.0)), wear * 0.75);
			// a chalk ring round the fighting circle and the centre spot
			float ring = abs(r - 4.35);
			c = mix(c, vec3(0.75, 0.75, 0.68), (1.0 - smoothstep(0.035, 0.05, ring)) * (0.75 + 0.25 * t_noise(xz * 30.0)));
			c = mix(c, vec3(0.75, 0.75, 0.68), 1.0 - smoothstep(0.1, 0.12, r));
		} else {
			// chalked rings out on the plain, and the deck's dark shadow-line in the grass
			float ring = min(abs(r - 9.0), abs(r - 15.0));
			c = mix(c, vec3(0.72, 0.72, 0.66), (1.0 - smoothstep(0.045, 0.065, ring)) * 0.9);
			float ticks = abs(fract(atan(xz.y, xz.x) / 6.2831853 * 48.0) - 0.5);
			c = mix(c, vec3(0.72, 0.72, 0.66), step(ticks, 0.012) * step(15.0, r) * step(r, 16.4) * 0.85);
			c *= 0.65 + 0.35 * smoothstep(5.3, 6.4, r);
			// the plain darkens into the podium wall's foot
			c *= 0.7 + 0.3 * smoothstep(21.0, 19.5, r);
		}
		// scars: churned earth and cracks where a titan came down hard
		for (int i = 0; i < 12; i++) {
			vec4 s = scars[i];
			if (s.w <= 0.0) continue;
			vec2 d = xz - s.xy;
			float l = length(d);
			if (l > s.z * 1.6) continue;
			float a = atan(d.y, d.x);
			float crack = 1.0 - smoothstep(0.0, 0.05, abs(fract(a * 1.9 + t_noise(vec2(l * 3.0, a * 2.0)) * 0.6) - 0.5) * l);
			float core = 1.0 - smoothstep(s.z * 0.45, s.z, l + t_noise(d * 6.0) * 0.2);
			vec3 earth = vec3(0.11, 0.075, 0.045) * (0.7 + 0.5 * t_noise(d * 25.0));
			c = mix(c, earth, max(core, crack * (1.0 - smoothstep(s.z * 0.6, s.z * 1.6, l)) * 0.8) * s.w);
		}
		if (deck) {
			c *= ao_floor_map(xz);
		}
	}
	ALBEDO = c;
	ROUGHNESS = rough;
}
