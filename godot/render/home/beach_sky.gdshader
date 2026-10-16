// The beach's sky dome (src/render/home/beachWorld.ts SKY_FRAG): deep tropical blue paling to a
// haze on the horizon, the sun and its glare, fair-weather cumulus and wisps of cirrus, and the far
// islands on the horizon. Drawn behind everything (the web puts it at the far plane).
shader_type spatial;
render_mode unshaded, cull_front, depth_draw_never, fog_disabled, shadows_disabled;

#include "res://render/home/beach_world.gdshaderinc"

varying vec3 v_dir;

void vertex() {
	v_dir = VERTEX;
	// as far off as the lens reaches, along the same ray (the web's gl_Position.xyww)
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 ray = normalize(w - CAMERA_POSITION_WORLD);
	POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(CAMERA_POSITION_WORLD + ray * 112.0, 1.0));
}

// a far island's outline: a bump of height hgt and half-width w at bearing c
float bump(float a, float c, float w, float hgt, float k) {
	float x = (a - c) / w;
	return hgt * pow(max(1.0 - x * x, 0.0), k);
}

// the skyline of far islands on the horizon (bearing a: 0 along +x, positive towards the sea)
float skyline(float a, out float haze) {
	float j = texture(noise, vec2(a * 2.3, 0.37)).r;
	float jj = texture(noise, vec2(a * 11.0, 0.71)).g;
	// the high island across the lagoon: a long green shoulder, and a sheer basalt peak on it
	float hi = max(bump(a, 0.38, 0.17, 0.022, 1.2), bump(a, 0.345, 0.05, 0.062, 0.7));
	hi = max(hi, bump(a, 0.395, 0.032, 0.046, 0.9));
	hi = max(hi, bump(a, 0.44, 0.05, 0.03, 1.3));
	hi *= 0.86 + 0.2 * j + 0.1 * (jj - 0.5);
	// further off, a lower island, and a long low motu fringed with palms
	float lo = bump(a, 0.98, 0.12, 0.016, 1.5) * (0.85 + 0.3 * jj);
	float motu = bump(a, 1.32, 0.16, 0.0042, 0.3);
	motu += motu > 0.0 ? 0.0028 * smoothstep(0.55, 0.8, texture(noise, vec2(a * 40.0, 0.2)).b) : 0.0;
	float far2 = bump(a, 2.45, 0.2, 0.012, 1.4) * (0.8 + 0.4 * j);
	// inland (behind the beach), the island's own mountains, far and blue
	float back = a < -0.15 && a > -2.95 ? (0.016 + 0.03 * j + 0.008 * jj) * smoothstep(-0.15, -0.5, a) * smoothstep(-2.95, -2.5, a) : 0.0;
	float e = max(max(hi, lo), max(max(motu, far2), back));
	haze = e == hi ? 0.5 : e == back ? 0.66 : 0.72;
	return e;
}

void fragment() {
	vec3 d = normalize(v_dir);
	float h = d.y;
	vec3 col = h >= 0.0 ? skyCol(d) : farSea(d);
	float s = max(dot(d, sun), 0.0);
	float a = 0.0;
	if (h > 0.0) {
		// fair-weather cumulus: bright white tops, soft blue-grey bellies, silver-edged near the sun
		vec2 uv = cloudUV(d);
		float dens = cloudD(uv);
		float cov = cloudCover(h);
		a = smoothstep(cov, cov + 0.14, dens) * smoothstep(0.0, 0.04, h);
		float toSun = cloudD(uv + normalize(sun.xz) * 0.035);
		float lit = clamp(0.6 + (dens - toSun) * 6.0, 0.0, 1.0);
		float thick = smoothstep(cov, cov + 0.35, dens);
		vec3 shade = mix(vec3(0.7, 0.77, 0.88), horizon, 0.35);
		vec3 bright = vec3(1.12, 1.11, 1.08) + sun_col * 0.1 * pow(s, 3.0);
		vec3 cc = mix(shade, bright, clamp(lit * (1.0 - 0.45 * thick) + 0.25, 0.0, 1.0));
		cc += sun_col * pow(s, 9.0) * (1.0 - thick) * 2.5;
		// far clouds melt into the haze
		cc = mix(cc, col, smoothstep(0.1, 0.0, h) * 0.55);
		// and the faintest wisps of cirrus, high up
		vec2 cu = vec2(uv.x * 0.8 + uv.y * 0.6, uv.y * 0.8 - uv.x * 0.6);
		float ci = texture(noise, vec2(cu.x * 0.2, cu.y * 1.7) + 0.5).b;
		ci = smoothstep(0.66, 0.95, ci) * smoothstep(0.06, 0.35, h) * 0.35;
		col = mix(col, vec3(1.02, 1.0, 0.98), ci);
		col = mix(col, cc, a);
	}
	// the sun's disc, dimmed when a cloud drifts over it
	col += sun_col * smoothstep(0.99955, 0.99972, s) * 22.0 * (1.0 - 0.85 * a);

	// the far islands, blue-green with distance, on the horizon
	float az = atan(-d.z, d.x);
	float haze;
	float e = skyline(az, haze);
	float aa = fwidth(h) * 1.2 + 1e-5;
	float m = smoothstep(-aa, aa, e - h) * step(-0.002, h);
	if (m > 0.0) {
		float g = texture(noise, vec2(az * 26.0, h * 9.0)).r;
		float g2 = texture(noise, vec2(az * 70.0, h * 30.0 + 0.3)).g;
		vec3 land = vec3(0.1, 0.19, 0.09) * (0.65 + 0.55 * g + 0.25 * (g2 - 0.5));
		// sunlit crests, shadowed gullies, and a thread of white sand along the water
		land *= 0.8 + 0.5 * smoothstep(0.0, 1.0, (h / max(e, 1e-4)));
		land = mix(land, vec3(0.75, 0.72, 0.62), smoothstep(0.0009, 0.0002, h) * step(e, 0.006));
		vec3 hz = skyCol(normalize(vec3(d.x, 0.0, d.z)));
		col = mix(col, mix(land, hz, haze), m);
	}
	ALBEDO = col;
}
