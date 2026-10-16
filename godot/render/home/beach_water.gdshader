// The lagoon (src/render/home/beachWorld.ts WATER_VERT / WATER_FRAG): one surface from the swash
// zone out to the horizon, lifted by each little wave as it runs up the sand. The bed seen down
// through it (refracted, Beer-Lambert absorption, caustics), the sky and the sun on it, the swash's
// frothy edge, surf on the reef, and haze out to the horizon. `low` is the web's LOW define.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, fog_disabled, shadows_disabled, world_vertex_coords;

#include "res://render/home/beach_world.gdshaderinc"

uniform sampler2D normals : repeat_enable, filter_linear_mipmap;
uniform vec3 sand = vec3(0.82, 0.66, 0.38);
uniform vec3 absorb = vec3(0.85, 0.13, 0.075);
uniform vec3 scatter = vec3(0.002, 0.075, 0.2);
uniform vec3 foam_col = vec3(0.96, 0.98, 1.0);
uniform float fog_density = 0.0058;
uniform bool low = false;

varying vec3 v_w;

void vertex() {
	float u, A;
	VERTEX.y = swashLevel(VERTEX.xz, u, A);
	v_w = VERTEX;
}

vec2 nrm(vec2 uv) { return texture(normals, uv).xy * 2.0 - 1.0; }

void fragment() {
	vec2 p = v_w.xz;
	float t = bb_time;
	float dist = length(v_w - CAMERA_POSITION_WORLD);
	float d = shoreZ(p.x) - p.y;
	float u, A;
	float lvl = swashLevel(p, u, A);
	float g = groundNear(p);
	// the swash's leading edge frays as it runs over the sand
	float rag = texture(noise, p * vec2(0.55, 0.9) + vec2(t * 0.011, 0.0)).g - 0.5;
	float depth = lvl - g + rag * 0.012 * smoothstep(1.5, -0.5, d);
	if (depth < -0.002) discard;
	float rr = reefZ(p.x) - p.y;
	float still = bedDepth(p) * step(0.0, d);

	// the surface: the little waves' slope, and ripples drifting across each other in the breeze
	float u2, A2;
	vec2 gS = vec2(swashLevel(p + vec2(0.2, 0.0), u2, A2) - lvl, swashLevel(p + vec2(0.0, 0.2), u2, A2) - lvl) / 0.2;
	float far = smoothstep(14.0, 80.0, dist);
	vec2 r1 = nrm(p * 0.07 + vec2(t * 0.009, t * 0.014));
	vec2 r2 = nrm(p * 0.19 + vec2(-t * 0.017, t * 0.011));
	vec2 r3 = nrm(p * 0.55 + vec2(t * 0.03, -t * 0.024));
	// glassy in the lagoon, livelier out past the reef
	float rough = mix(0.075, 0.17, smoothstep(-3.0, 10.0, rr)) * mix(0.45, 1.0, smoothstep(0.02, 0.5, depth));
	vec2 slope = gS + (r1 * 0.55 + r2 * 0.35 + r3 * 0.25 * (1.0 - far)) * rough;
	vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

	vec3 V = normalize(CAMERA_POSITION_WORLD - v_w);
	float NV = max(dot(n, V), 0.0);
	// (held back a little at grazing angles, so the lagoon keeps its colour right out to the reef)
	float fres = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.45) * 0.9;
	vec3 R = reflect(-V, n);
	R.y = abs(R.y);
	vec3 skyc = skyCol(R) * vec3(0.74, 0.88, 1.0);
	if (!low) {
		float cov = cloudCover(R.y);
		skyc = mix(skyc, vec3(0.95, 0.95, 0.96), smoothstep(cov, cov + 0.2, cloudD(cloudUV(R))) * smoothstep(0.0, 0.08, R.y) * 0.6);
	}

	// the bed, seen down through the water: refracted, rippling
	vec3 rd = refract(-V, n, 0.75);
	float down = max(-rd.y, 0.1);
	float bd = max(depth, 0.0);
	vec2 bp = low ? p : p + rd.xz * min(bd / down, 8.0);
	// light's way through the water: down from the surface to the bed, then up to the eye
	float path = bd * 1.4 + min(bd / down, 40.0);
	vec3 T = exp(-absorb * path);
	float bn = texture(noise, bp * 0.045).r;
	float bn2 = texture(noise, bp * 0.21 + 0.3).g;
	vec3 bed = sand * (0.84 + 0.2 * bn + 0.1 * (bn2 - 0.5)) * 0.8;
	// dark patches of sea grass and coral out in the lagoon, and the reef's coral heads
	float patchK = smoothstep(0.6, 0.68, texture(noise, bp * 0.03 + 0.17).b) * smoothstep(9.0, 18.0, d) * (1.0 - smoothstep(-6.0, 0.0, rr));
	bed = mix(bed, vec3(0.14, 0.17, 0.1), patchK * 0.75);
	float coral = exp(-rr * rr / 30.0) * smoothstep(0.4, 0.7, bn2);
	bed = mix(bed, vec3(0.32, 0.24, 0.2), coral * 0.7);
	if (!low) {
		// caustics dancing over the sand through the shallows
		float ca = texture(noise, bp * 0.9 + vec2(t * 0.031, t * 0.02)).b;
		float cb = texture(noise, bp * 1.03 - vec2(t * 0.022, t * 0.034)).b;
		float caus = pow(clamp(1.0 - abs(ca - cb) * 4.0, 0.0, 1.0), 3.0) * smoothstep(0.03, 0.25, bd) * smoothstep(5.0, 0.8, bd);
		bed *= 0.9 + 0.75 * caus * vec3(0.9, 1.0, 0.95);
	}
	vec3 water = bed * 0.95 * sun_col * T + scatter * (1.0 - T);
	// the light glowing through the face of each little wave as it steepens in the shallows
	float crest = smoothstep(0.18, 0.3, u) * smoothstep(0.42, 0.3, u) * smoothstep(0.0, 1.0, d) * smoothstep(5.0, 1.5, d);
	water += vec3(0.1, 0.32, 0.28) * crest * 0.35;
	vec3 col = mix(water, skyc, fres);

	// the sun on the water: a hot core, and glints wherever a ripple catches it
	vec3 H = normalize(sun + V);
	float NH = max(dot(n, H), 0.0);
	float spec = pow(NH, 900.0) * 10.0 + pow(NH, 110.0) * 0.7 + pow(NH, 14.0) * 0.06;
	if (!low) {
		vec2 fine = nrm(p * 1.9 + vec2(-t * 0.05, t * 0.04)) * 0.35 + r3 * 0.5;
		vec3 nf = normalize(vec3(-(slope.x + fine.x * 0.16), 1.0, -(slope.y + fine.y * 0.16)));
		spec += pow(max(dot(nf, H), 0.0), 1600.0) * 40.0 * (1.0 - far * 0.6);
	}
	col += sun_col * spec * smoothstep(0.0, 0.04, depth);

	// foam: the swash's frothy edge, a little wave spilling in the shallows, surf on the reef
	float fn = texture(noise, p * vec2(1.1, 1.9) + vec2(0.0, t * 0.04)).r;
	float fn2 = texture(noise, p * 3.1 - vec2(t * 0.03, 0.0)).g;
	float lace = smoothstep(0.42, 0.72, fn * 0.55 + fn2 * 0.45);
	float rising = 1.0 - smoothstep(0.26, 0.5, u);
	float edge = smoothstep(mix(0.03, 0.06, rising), 0.0, depth) * mix(lace * 0.75, 0.75 + 0.25 * lace, rising);
	float passed = u - 0.3;
	float spill = (passed > 0.0 ? exp(-passed * 10.0) : smoothstep(-0.03, 0.0, passed)) * smoothstep(0.3, 0.1, still) * step(0.0, d) * (0.4 + 0.6 * lace);
	float foam = max(edge, spill * 0.8);
	if (!low) {
		float pulse = smoothstep(0.2, 0.9, sin(t * 0.72 - p.x * 0.05 + 1.3 * sin(p.x * 0.013)) * 0.5 + 0.5);
		float reef = exp(-(rr + 0.5) * (rr + 0.5) / 5.0) * (0.45 + 0.55 * pulse);
		reef += smoothstep(-16.0, -1.0, rr) * smoothstep(1.0, -1.0, rr) * 0.3 * pulse;
		float caps = smoothstep(0.78, 0.88, texture(noise, p * 0.05 + vec2(t * 0.005, -t * 0.008)).r) * smoothstep(8.0, 20.0, rr);
		foam = max(foam, (reef * (0.55 + 0.45 * lace) + caps * lace * 0.6) * smoothstep(115.0, 40.0, dist));
	}
	vec3 fc = foam_col * (0.82 + 0.3 * max(dot(n, sun), 0.0)) * sun_col;
	col = mix(col, fc, clamp(foam, 0.0, 1.0) * 0.92);

	// haze out to the horizon, where the sea melts into the sky's colour
	float fog = 1.0 - exp(-pow(dist * fog_density, 2.0));
	col = mix(col, farSea(-V), max(fog, smoothstep(70.0, 118.0, dist) * 0.9));
	ALBEDO = col;
	ALPHA = max(smoothstep(0.0, 0.022, depth), clamp(foam, 0.0, 1.0) * smoothstep(-0.002, 0.004, depth));
}
