// The Titan Ring's steel (titan_ring.gd): the deck the titans fight on (plates welded in rows,
// bolted seams, a worn emblem, hazard stripes round the edge, the lift hatches, each corner in
// its fighter's colours, cracks and scorches where they fall), its lip, the girders and panels
// of the stage's walls, the pylons, their collars and floodlights, the plinth and the stairs.
// Lit by the venue's sun. UV2.x: the kind (titan_ring.gd K_*), UV2.y a detail.
shader_type spatial;
render_mode cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
// The lift hatches (holes in the deck: the corners' doors and lift decks show through).
uniform vec2 hatch0 = vec2(100.0);
uniform vec2 hatch1 = vec2(100.0);
uniform float hatch_r = 0.74;
// Cracks and scorches on the deck: (x, z, radius, strength), from TitanFx.
uniform vec4 cracks[8];
// The floodlights' strength (0 off, 1 on) and the arena's rope flash.
uniform float lamps = 1.0;
uniform float flare = 0.0;

varying vec3 v_world;
varying flat vec2 v_kind;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_kind = UV2;
}

float oct_apothem(vec2 p) {
	float a = atan(p.y, p.x);
	float s = round(a / (3.14159265 / 4.0)) * (3.14159265 / 4.0);
	return p.x * cos(s) + p.y * sin(s);
}

float hazard(vec2 q, float fw) {
	return step(0.5, fract((q.x + q.y) * 3.2));
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	float kind = v_kind.x;
	vec3 albedo = vec3(0.3);
	float rough = 0.55;
	float metal = 0.6;
	vec3 emit = vec3(0.0);
	vec2 p = v_world.xz;
	float fw = max(fwidth(p.x), fwidth(p.y));

	if (kind < 0.5) {
		// the deck
		if (distance(p, hatch0) < hatch_r || distance(p, hatch1) < hatch_r) discard;
		float ap = oct_apothem(p);
		float r = length(p);
		// plates: 12 m by 6 m, rows offset, each its own shade of gunmetal
		vec2 q = vec2(p.x / 0.8 + floor(p.y / 0.4) * 0.5, p.y / 0.4);
		vec2 qi = floor(q);
		float h = t_hash2(qi);
		vec3 steel = mix(vec3(0.2, 0.21, 0.22), vec3(0.27, 0.27, 0.28), h);
		float seam = max(t_band(q.x, 1.0, 0.012, fwidth(q.x)), t_band(q.y, 1.0, 0.024, fwidth(q.y)));
		// bolt rows along the seams
		vec2 bq = fract(q * vec2(10.0, 5.0));
		float bolt = (1.0 - smoothstep(0.08, 0.14, length(vec2(bq.x - 0.5, (bq.y - 0.5) * 0.5)))) * step(fract(q.y), 0.08) * (1.0 - smoothstep(0.002, 0.006, fw));
		steel *= 1.0 - seam * 0.5;
		steel = mix(steel, vec3(0.42), bolt * 0.6);
		// wear: polished where the titans walk, grime in the corners, scuffs and oil
		float worn = smoothstep(4.6, 1.5, r) * (0.5 + 0.5 * t_fbm(p * 2.5));
		steel = mix(steel, vec3(0.42, 0.42, 0.41), worn * 0.35);
		float oil = smoothstep(0.7, 0.82, t_fbm(p * 1.3 + 7.0));
		steel *= 1.0 - oil * 0.45;
		// the emblem: two rings and eight spokes in worn white paint
		float ring1 = 1.0 - smoothstep(0.035 - fw, 0.035 + fw, abs(r - 2.2));
		float ring2 = 1.0 - smoothstep(0.02 - fw, 0.02 + fw, abs(r - 2.42));
		float ang = atan(p.y, p.x);
		float spoke = (1.0 - smoothstep(0.03 - fw, 0.03 + fw, abs(fract(ang / (3.14159265 / 4.0) + 0.5) - 0.5) * r * 0.785)) * step(0.7, r) * step(r, 2.0);
		float disc = 1.0 - smoothstep(0.62 - fw, 0.62 + fw, r);
		float paint = max(max(ring1, ring2), max(spoke * 0.8, disc * 0.9));
		paint *= smoothstep(0.25, 0.55, t_fbm(p * 4.0 + 3.0) + 0.25);
		vec3 side_col = mix(team1, team0, smoothstep(-0.6, 0.6, p.x + p.y * 0.4));
		vec3 emblem = mix(vec3(0.78, 0.76, 0.72), side_col * 0.75, disc);
		steel = mix(steel, emblem, paint * 0.85);
		// each fighter's corner painted in its colours
		vec2 c0 = vec2(cos(0.3927), sin(0.3927));
		vec2 c1 = -c0;
		float corner0 = smoothstep(0.995, 0.999, dot(normalize(p), c0)) * step(3.0, r);
		float corner1 = smoothstep(0.995, 0.999, dot(normalize(p), c1)) * step(3.0, r);
		steel = mix(steel, team0 * 0.6, corner0 * 0.7);
		steel = mix(steel, team1 * 0.6, corner1 * 0.7);
		// rings round the hatches
		float hr = min(distance(p, hatch0), distance(p, hatch1));
		steel = mix(steel, vec3(0.75, 0.62, 0.1), (1.0 - smoothstep(0.015, 0.03 + fw, abs(hr - hatch_r - 0.05))) * 0.9);
		// hazard stripes round the edge
		float edge = step(5.13 - 0.2, ap);
		steel = mix(steel, mix(vec3(0.04), vec3(0.85, 0.65, 0.05), hazard(p, fw)), edge * (1.0 - smoothstep(0.05, 0.2, fw)));
		steel = mix(steel, vec3(0.45, 0.36, 0.08), edge * smoothstep(0.05, 0.2, fw));
		// cracks and scorches where they came down (w: 1, plus how hot it still is)
		float scorch = 0.0, ck = 0.0, heat = 0.0;
		for (int i = 0; i < 8; i++) {
			vec4 k = cracks[i];
			if (k.w <= 0.0) continue;
			vec2 d = p - k.xy;
			float rr = length(d);
			if (rr > k.z * 1.5) continue;
			float a = atan(d.y, d.x);
			float sp = abs(fract(a * 1.6 + t_noise(vec2(rr * 12.0, float(i))) * 0.3 + float(i) * 0.31) - 0.5);
			float c = smoothstep(0.03, 0.0, sp * rr * 1.5) * smoothstep(k.z * 1.4, k.z * 0.2, rr) * min(k.w, 1.0);
			ck = max(ck, c);
			scorch = max(scorch, smoothstep(k.z, 0.0, rr) * min(k.w, 1.0));
			heat = max(heat, c * max(k.w - 1.0, 0.0) * smoothstep(k.z, 0.1, rr));
		}
		steel *= 1.0 - scorch * 0.5;
		steel = mix(steel, vec3(0.01), ck * 0.9);
		emit += vec3(1.0, 0.35, 0.08) * (ck * scorch * 0.4 + heat * 6.0);
		albedo = steel;
		metal = 0.75 - paint * 0.6;
		rough = mix(0.5, 0.32, worn) + oil * 0.1 + paint * 0.25;
	} else if (kind < 1.5) {
		// the lip: hazard stripes down its face, bolted plate on top
		if (v_kind.y < 0.5) {
			albedo = mix(vec3(0.03), vec3(0.85, 0.65, 0.05), hazard(vec2(UV.x, UV.y), fw));
			metal = 0.3;
			rough = 0.6;
		} else {
			albedo = vec3(0.22, 0.22, 0.23) * (0.85 + 0.3 * t_fbm(p * 6.0));
		}
	} else if (kind < 2.5) {
		// the stage's walls: ribbed panels, a strip of light under the lip in the fighters' colours
		float y = UV.y;
		float rib = t_band(y, 0.06, 0.012, fwidth(y));
		vec3 panel = vec3(0.17, 0.18, 0.19) * (0.85 + 0.25 * t_fbm(vec2(UV.x * 3.0, y * 8.0) + v_kind.y * 7.0));
		albedo = panel * (1.0 - rib * 0.4);
		float led = step(0.15, y) * step(y, 0.175);
		vec3 lc = mix(team1, team0, smoothstep(-2.0, 2.0, v_world.x + v_world.z * 0.4));
		emit += lc * led * (2.2 + bb_hype * 1.2 + flare * 2.0);
		albedo = mix(albedo, vec3(0.0), led);
		// rust weeping down from the bolts
		float rust = smoothstep(0.6, 0.9, t_noise(vec2(UV.x * 9.0, y * 2.0) + v_kind.y)) * smoothstep(0.62, 0.3, y);
		albedo = mix(albedo, vec3(0.3, 0.13, 0.05), rust * 0.5);
		metal = 0.45;
		rough = 0.6;
	} else if (kind < 3.5) {
		// girders: red-oxide primer, scuffed back to steel
		albedo = mix(vec3(0.32, 0.1, 0.06), vec3(0.24, 0.24, 0.25), v_kind.y) * (0.8 + 0.35 * t_fbm(vec2(UV.x * 12.0, UV.y * 30.0)));
		metal = 0.35;
		rough = 0.6;
	} else if (kind < 4.5) {
		// pylons: graphite steel, panel seams, hazard bands at the foot, the fighters' corners lit
		// in their colours
		float k = v_kind.y;
		float y = UV.y;
		albedo = vec3(0.13, 0.135, 0.145) * (0.85 + 0.25 * t_fbm(vec2(UV.x * 10.0, y * 4.0) + k * 5.0));
		float seam = t_band(UV.x, 0.21, 0.006, fwidth(UV.x)) + t_band(y, 0.3, 0.008, fwidth(y));
		albedo *= 1.0 - clamp(seam, 0.0, 1.0) * 0.4;
		float foot = step(y, 0.22);
		albedo = mix(albedo, mix(vec3(0.03), vec3(0.85, 0.65, 0.05), hazard(vec2(UV.x * 0.8, y), fw)), foot);
		bool corner = abs(k - 0.0) < 0.5 || abs(k - 4.0) < 0.5;
		if (corner) {
			vec3 tc = k < 0.5 ? team0 : team1;
			float stripe = step(0.3, y) * step(fract(UV.x / 0.42 + 0.1), 0.18);
			emit += tc * stripe * (2.0 + bb_hype + flare * 2.0);
			albedo = mix(albedo, vec3(0.0), stripe);
		}
		metal = 0.7;
		rough = 0.42;
	} else if (kind < 5.5) {
		// collars and platforms: safety yellow, chipped
		albedo = mix(vec3(0.75, 0.55, 0.06), vec3(0.3, 0.3, 0.3), smoothstep(0.62, 0.75, t_fbm(v_world.xy * 30.0 + v_world.zz * 20.0)));
		metal = 0.3;
		rough = 0.5;
	} else if (kind < 6.5) {
		// the floodlights' faces: a bank of lamps
		vec2 g = fract(UV * vec2(6.0, 3.0));
		float lamp = 1.0 - smoothstep(0.32, 0.42, length(g - 0.5));
		albedo = vec3(0.05);
		emit = vec3(1.0, 0.86, 0.66) * (lamp * 9.0 + 0.6) * lamps;
		metal = 0.0;
		rough = 0.3;
	} else if (kind < 7.5) {
		// the plinth: weathered concrete
		albedo = vec3(0.5, 0.49, 0.46) * (0.8 + 0.3 * t_fbm(v_world.xz * 8.0 + v_world.y * 4.0));
		metal = 0.0;
		rough = 0.92;
	} else if (kind < 8.5) {
		albedo = vec3(0.06, 0.065, 0.07);
		metal = 0.5;
		rough = 0.5;
		// the masts' red aviation beacons (titan_ring: the mast tops out at POST_TOP + 0.42)
		if (v_kind.y > 0.5 && v_world.y > 2.13) {
			emit = vec3(1.0, 0.03, 0.01) * 14.0 * (0.2 + 0.8 * step(0.45, fract(TIME * 0.5)));
		}
	} else {
		// the crews' stairs: galvanised grating and yellow rails
		albedo = v_kind.y > 1.5 ? vec3(0.8, 0.6, 0.06) : vec3(0.42, 0.43, 0.44);
		metal = 0.6;
		rough = 0.5;
	}
	ALBEDO = albedo;
	METALLIC = metal;
	ROUGHNESS = rough;
	EMISSION = emit;
	FOG = t_haze(v_world, cam);
}
