// The titan city's ground (titan_city.gd ground_mesh), all of it from world position: the
// square's paving (granite rings round the Titan Ring, a safety line, drains and the odd puddle
// holding the sky), the streets on the city's grid (asphalt, lane markings, zebra crossings,
// kerbs and pavements), the boulevard (tram rails either side of a garden), the quay's stone
// wall, and across the water the container terminal's concrete. Scars where something huge came
// down (cracks[], from TitanFx) and the titans' shadows (the venue's sun) fall on it.
//
// UV2.x: 0 the city's ground, 1 a quay wall (UV: along it, height), 2 the far shore.
shader_type spatial;
render_mode cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

const float PITCH = 9.6;
const float HALF_STREET = 0.8;
const float SQ_X = 13.6;
const float SQ_S = 13.6;
const float SQ_N = -13.6;
const float BLVD = 1.9;
const float MEDIAN = 0.42;
const float QUAY_Z = -15.2;

// Cracks and scorches: (x, z, radius, strength), from TitanFx.
uniform vec4 cracks[16];

varying vec3 v_world;
varying flat float v_kind;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_kind = UV2.x;
}

// Distance from x to the nearest street centre line on the grid (they run at 4.8 + 9.6 k).
float street_d(float x) {
	return abs(mod(x - 4.8 + PITCH * 0.5, PITCH) - PITCH * 0.5);
}

// Cracks radiating from impacts: 0..1 how much of a crack line is here.
float crack_at(vec2 p, out float scorch) {
	float c = 0.0;
	scorch = 0.0;
	for (int i = 0; i < 16; i++) {
		vec4 k = cracks[i];
		if (k.w <= 0.0) continue;
		vec2 d = p - k.xy;
		float r = length(d);
		if (r > k.z * 1.6) continue;
		float a = atan(d.y, d.x);
		// a dozen jagged spokes, broken up along their length
		float sp = abs(fract(a * 1.9 + t_noise(vec2(r * 9.0, float(i))) * 0.35 + float(i) * 0.37) - 0.5);
		float line = smoothstep(0.03, 0.0, sp * r * 1.6) * smoothstep(k.z * 1.5, k.z * 0.3, r);
		// and the crater's ring of broken slabs
		float ring = smoothstep(0.02, 0.0, abs(r - k.z * 0.45 * (0.9 + 0.2 * t_noise(vec2(a * 3.0, float(i)))))) * 0.7;
		c = max(c, (line + ring) * k.w);
		scorch = max(scorch, smoothstep(k.z * 0.7, 0.0, r) * k.w);
	}
	return clamp(c, 0.0, 1.0);
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec2 p = v_world.xz;
	float fw = max(fwidth(p.x), fwidth(p.y));
	vec3 albedo = vec3(0.4);
	float rough = 0.9;
	float spec = 0.3;

	if (v_kind > 1.5) {
		// the container terminal: concrete apron, yard lines, rails
		float n = t_fbm(p * 0.6);
		albedo = vec3(0.46, 0.45, 0.43) * (0.8 + 0.3 * n);
		float lines = max(t_band(p.x, 3.2, 0.03, fw), t_band(p.y, 1.1, 0.025, fw));
		albedo = mix(albedo, vec3(0.75, 0.68, 0.3), lines * 0.5 * (1.0 - smoothstep(0.02, 0.1, fw)));
	} else if (v_kind > 0.5) {
		// a quay wall: big stone blocks, dark and weedy where the tide reaches
		vec2 q = vec2(UV.x / 0.12 + floor(UV.y / 0.06) * 0.5, UV.y / 0.06);
		float joint = max(t_band(q.x, 1.0, 0.06, fwidth(q.x)), t_band(q.y, 1.0, 0.1, fwidth(q.y)));
		albedo = vec3(0.5, 0.46, 0.4) * (0.8 + 0.3 * t_hash2(floor(q))) * (1.0 - joint * 0.35);
		float wet = smoothstep(0.1, 0.0, v_world.y - T_WATER_Y - 0.03);
		albedo = mix(albedo, vec3(0.08, 0.1, 0.07), wet * 0.85);
		rough = mix(0.9, 0.35, wet);
	} else {
		float ax = abs(p.x);
		bool plaza = ax <= SQ_X && p.y <= SQ_S && p.y >= SQ_N;
		float sx = street_d(p.x);
		float sz = street_d(p.y);
		bool on_x_street = sx < HALF_STREET;
		bool on_z_street = sz < HALF_STREET;
		bool boulevard = abs(p.y) < BLVD && ax > SQ_X - 0.01;
		if (plaza) {
			float r = length(p);
			float a = atan(p.y, p.x);
			// granite: rings of slabs (1.5 m deep), cut into lengths round each ring
			float ring = r / 0.1;
			float ri = floor(ring);
			float seg = a * r / 0.16;
			float si = floor(seg + t_hash(ri) * 3.0);
			float h = t_hash2(vec2(ri, si));
			vec3 granite = mix(vec3(0.58, 0.55, 0.5), vec3(0.68, 0.64, 0.58), h);
			// a band of dark stone every 15 slabs
			float dark = step(mod(ri, 15.0), 1.5);
			granite = mix(granite, vec3(0.28, 0.27, 0.27), dark);
			float jr = t_band(ring, 1.0, 0.06, fwidth(ring));
			float ja = t_band(seg + t_hash(ri) * 3.0, 1.0, 0.04, fwidth(seg));
			float joints = max(jr, ja) * (1.0 - smoothstep(0.004, 0.02, fw));
			albedo = granite * (1.0 - joints * 0.4) * (0.88 + 0.2 * t_fbm(p * 3.0));
			// the stage's apron: dark, with a safety line and hatched no-go zone round it
			if (r < 6.3) {
				albedo = vec3(0.17, 0.17, 0.18) * (0.85 + 0.25 * t_fbm(p * 5.0));
				float line = t_band(r, 1e4, 0.08, fw) * 0.0 + (1.0 - smoothstep(0.035 - fw, 0.035 + fw, abs(r - 6.15)));
				float hatch = step(5.75, r) * step(r, 6.05) * step(0.5, fract((p.x + p.y) * 2.2));
				albedo = mix(albedo, vec3(0.85, 0.66, 0.08), max(line, hatch * (1.0 - smoothstep(0.05, 0.2, fw))) * 0.9);
			}
			// drains and the puddles round them, holding the sky
			float puddle = smoothstep(0.66, 0.74, t_fbm(p * 0.9 + 3.0)) * step(6.4, r);
			rough = mix(0.82, 0.08, puddle);
			spec = mix(0.3, 0.6, puddle);
			albedo *= 1.0 - puddle * 0.55;
		} else if (boulevard) {
			float az = abs(p.y);
			if (az < MEDIAN) {
				// the median: lawn with a gravel path down the middle
				float path = 1.0 - smoothstep(0.08, 0.1, az);
				albedo = mix(vec3(0.16, 0.24, 0.08) * (0.7 + 0.5 * t_fbm(p * 6.0)), vec3(0.55, 0.5, 0.42), path);
			} else {
				// lanes, and the tram's rails in the outer lanes
				albedo = vec3(0.2, 0.2, 0.21) * (0.85 + 0.25 * t_fbm(p * 2.0));
				float dash = step(0.5, fract(p.x / 0.6));
				float lane = (t_band(az, 1e4, 0.012, fw) * 0.0) + (1.0 - smoothstep(0.006 - fw, 0.006 + fw, abs(az - 1.0))) * dash;
				float edge = 1.0 - smoothstep(0.008 - fw, 0.008 + fw, abs(az - MEDIAN - 0.04));
				float rail = 0.0;
				for (int k = 0; k < 2; k++) {
					float rc = 1.45 + float(k) * 0.096;
					rail = max(rail, 1.0 - smoothstep(0.002, 0.004 + fw, abs(az - rc)));
				}
				albedo = mix(albedo, vec3(0.85), max(lane, edge) * 0.85);
				albedo = mix(albedo, vec3(0.55, 0.53, 0.5), rail);
				rough = mix(rough, 0.3, rail);
				// the kerb and pavement at the boulevard's edges
				if (az > BLVD - 0.25) albedo = vec3(0.55, 0.52, 0.48) * (0.85 + 0.2 * t_fbm(p * 8.0));
			}
		} else if (on_x_street || on_z_street) {
			// asphalt, patched and worn, with the city's markings
			albedo = vec3(0.19, 0.19, 0.2) * (0.8 + 0.3 * t_fbm(p * 1.5)) * (0.9 + 0.15 * t_noise(p * 25.0));
			float d = on_x_street ? sx : sz;
			float along = on_x_street ? p.y : p.x;
			// near an intersection: zebra crossings, no lane lines through the box
			float cross_d = on_x_street ? sz : sx;
			bool junction = on_x_street && on_z_street;
			if (!junction) {
				float centre = 1.0 - smoothstep(0.006 - fw, 0.006 + fw, abs(d - 0.012));
				float dash = step(0.45, fract(along / 0.5));
				float lanes = (1.0 - smoothstep(0.005 - fw, 0.005 + fw, abs(d - 0.38))) * dash;
				float zebra = step(cross_d, HALF_STREET + 0.3) * step(HALF_STREET + 0.06, cross_d) * step(0.5, fract(d / 0.06)) * step(d, HALF_STREET - 0.05);
				albedo = mix(albedo, vec3(0.86, 0.85, 0.8), max(max(centre, lanes), zebra) * 0.85 * (1.0 - smoothstep(0.03, 0.12, fw)));
			}
			// the kerb's edge and the gutter
			float kerb = smoothstep(HALF_STREET - 0.03, HALF_STREET - 0.005, d);
			albedo = mix(albedo, vec3(0.5, 0.48, 0.45), kerb);
		} else {
			// pavements (and whatever is under the buildings)
			vec2 q = p / 0.04;
			float joints = max(t_band(q.x, 1.0, 0.06, fwidth(q.x)), t_band(q.y, 1.0, 0.06, fwidth(q.y))) * (1.0 - smoothstep(0.002, 0.008, fw));
			albedo = vec3(0.6, 0.57, 0.53) * (0.82 + 0.25 * t_fbm(p * 4.0)) * (1.0 - joints * 0.25);
		}
		// the quay's edge: granite coping and a painted line
		float qd = p.y - QUAY_Z;
		if (qd < 0.18) {
			albedo = mix(albedo, vec3(0.62, 0.6, 0.55), smoothstep(0.18, 0.14, qd));
			albedo = mix(albedo, vec3(0.85, 0.7, 0.1), (1.0 - smoothstep(0.004, 0.006 + fw, abs(qd - 0.11))) * 0.8);
		}
		// scars where something huge came down
		float scorch;
		float ck = crack_at(p, scorch);
		albedo *= 1.0 - scorch * 0.55;
		albedo = mix(albedo, vec3(0.03), ck * 0.85);
	}
	ALBEDO = albedo;
	ROUGHNESS = rough;
	SPECULAR = spec;
	FOG = t_haze(v_world, cam);
}
