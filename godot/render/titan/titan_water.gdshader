// The harbour and the sea beyond it (titan_city.gd water_mesh): wind-ruffled water at the titans'
// scale, reflecting the evening sky, a road of sun glitter running out to the low sun, the city's
// lit waterfront reflected along the quays. Unshaded: it lights itself with the venue's sun and
// sky (titan_common), and writes its own haze.
//
// The waves are real-sized and move at real speed (deep water: w = sqrt(g k), g = 9.81 m/s2 is
// 0.654 units/s2 here): a long swell from the sea, a wind chop, ripples near the lens. They are
// what keeps the world's clock honest next to the titans.
shader_type spatial;
render_mode unshaded, cull_back, shadows_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

// Wakes behind the boats: (x, z, heading, strength) each.
uniform vec4 wakes[6];
// Rings spreading from something heavy hitting the water (or the quay shaking): (x, z, age s,
// strength).
uniform vec4 splash = vec4(0.0);

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// One wave train's slope: direction a (rad), wavenumber k (rad/unit), steepness s (amplitude * k).
vec2 train(vec2 p, float t, float a, float k, float s) {
	vec2 d = vec2(cos(a), sin(a));
	float w = sqrt(0.654 * k);
	return d * (s * cos(dot(p, d) * k - w * t));
}

// The water's slope at p, the finer trains faded out where a pixel spans them (fade 0 far, 1 near).
vec2 slope(vec2 p, float t, float fw) {
	// the swell from the sea (the north-west), long and low
	vec2 s = train(p, t, 1.2, 2.1, 0.035) + train(p, t, 1.45, 2.9, 0.03) + train(p, t, 0.95, 1.6, 0.025);
	// the wind's chop, crossing it
	float f1 = 1.0 - smoothstep(0.1, 0.45, fw * 9.0);
	s += (train(p, t, 2.2, 9.0, 0.06) + train(p, t, 1.7, 12.5, 0.05) + train(p, t, 0.6, 7.3, 0.045)) * f1;
	// and the ripples, broken up by noise
	float f2 = 1.0 - smoothstep(0.1, 0.45, fw * 40.0);
	if (f2 > 0.001) {
		vec2 q = p * 26.0 + vec2(t * 0.9, -t * 0.4);
		float n0 = t_noise(q);
		float nx = t_noise(q + vec2(0.21, 0.0));
		float nz = t_noise(q + vec2(0.0, 0.21));
		s += vec2(nx - n0, nz - n0) * 0.35 * f2;
		s += (train(p, t, 2.6, 38.0, 0.05) + train(p, t, 1.1, 51.0, 0.04)) * f2;
	}
	return s;
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 d = normalize(v_world - cam);
	vec2 p = v_world.xz;
	float t = bb_time;
	float fw = max(fwidth(p.x), fwidth(p.y));
	vec2 s = slope(p, t, fw);
	// wakes: a V of churned water behind each boat
	float foam = 0.0;
	for (int i = 0; i < 6; i++) {
		vec4 w = wakes[i];
		if (w.w <= 0.0) continue;
		vec2 dir = vec2(cos(w.z), sin(w.z));
		vec2 rel = p - w.xy;
		float back = -dot(rel, dir);
		float side = abs(dot(rel, vec2(-dir.y, dir.x)));
		if (back < -0.2 || back > 9.0) continue;
		float vee = smoothstep(0.1, 0.0, abs(side - max(back, 0.0) * 0.33)) * smoothstep(9.0, 0.0, back);
		float trail = smoothstep(0.1, 0.0, side) * smoothstep(5.0, 0.0, back) * step(0.0, back);
		float bow = smoothstep(0.08, 0.0, length(rel + dir * 0.02)) * 0.5;
		foam = max(foam, (vee * 0.6 + trail + bow) * w.w * (0.55 + 0.45 * t_noise(p * 30.0 + t * 1.5)));
		s += vec2(-dir.y, dir.x) * sign(dot(rel, vec2(-dir.y, dir.x))) * vee * 0.25 * w.w;
	}
	// a splash's rings
	if (splash.w > 0.0) {
		float r = distance(p, splash.xy);
		float front = splash.z * 0.9;
		float ring = sin((r - front) * 18.0) * smoothstep(front, front - 1.5, r) * step(0.02, front) * exp(-splash.z * 0.5);
		vec2 rd = (p - splash.xy) / max(r, 1e-3);
		s += rd * ring * 0.15 * splash.w;
		foam = max(foam, smoothstep(0.4, 0.0, abs(r - front * 0.4)) * smoothstep(3.0, 0.0, splash.z) * splash.w);
	}
	// along the quays: the water slaps the stone
	float quay = smoothstep(0.25, 0.0, abs(p.y + 15.2)) + smoothstep(0.25, 0.0, abs(p.y + 62.0)) * step(-58.0, p.x);
	foam = max(foam, quay * 0.3 * smoothstep(0.45, 0.75, t_noise(p * 14.0 + vec2(t * 0.6, 0.0))));
	vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
	vec3 r = reflect(d, n);
	r.y = abs(r.y);
	float cv = max(dot(-d, n), 0.0);
	float f = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
	vec3 sky = t_sky(r);
	// the waterfront in the reflection: the city's walls and lit windows along the horizon to the
	// south, the far shore's to the north
	float low = smoothstep(0.12, 0.015, r.y);
	float south = smoothstep(-0.2, 0.3, r.z);
	float az = atan(r.x, r.z);
	// (its lit windows only as a warm cast: picked out one by one they'd sparkle as the waves move)
	vec3 city = mix(vec3(0.07, 0.065, 0.075), vec3(0.15, 0.12, 0.11), t_noise(vec2(az * 40.0, 0.0)));
	city += vec3(1.0, 0.65, 0.35) * 0.045;
	sky = mix(sky, city, low * mix(0.45, 0.9, south));
	// the sun's glitter: a sharp glint on each facet near the lens, a broad road of it far off
	float sd = max(dot(r, T_SUN_DIR), 0.0);
	float sharp = mix(1600.0, 260.0, smoothstep(0.0, 0.08, fw));
	vec3 glitter = T_SUN_COL * min(pow(sd, sharp) * 10.0 + pow(sd, 60.0) * 0.3, 4.0);
	// the water's body: dark green-blue, a little light scattered up through the wave crests
	vec3 deep = vec3(0.014, 0.034, 0.04) + vec3(0.02, 0.05, 0.045) * max(dot(n.xz, -T_SUN_DIR.xz), 0.0) * 0.5;
	vec3 c = mix(deep, sky, f) + glitter * (0.3 + 0.7 * f);
	c = mix(c, vec3(0.78, 0.76, 0.74) * (T_SKY_SIDE * 1.3 + T_SUN_COL * 0.22), clamp(foam, 0.0, 1.0));
	ALBEDO = c;
	FOG = t_haze(v_world, cam);
}
