// The "Ray tracing" setting on the world map: the arena's screen-space trace (ray_trace.gdshader)
// rebuilt for a city seen from hundreds of metres up, where a robot's half metre is less than a
// pixel. RayTrace (ray_trace.gd) swaps it in on the map, on the same screen-covering quad, first
// in the transparent pass, reading the opaque map's colour and depth:
// - occlusion and one bounce over a radius that follows the zoom (the street at the foot of a
//   tower darkens, a sunlit wall warms the road, a neon trim tints the pavement at night);
// - the low sun's shadows traced through the depth buffer, where the baked height map says the
//   sun gets in: trees, the wheel, the cranes, the train and every tower's foot cast their own;
// - reflections in the sea and the lake, rippled by the same waves the water draws, the skyline,
//   the cranes and the neon standing in the bay, and the sky the water already shows where a ray
//   leaves the screen;
// - after dark the city's streets are wet: puddles holding the shop lights and the neon.
// The map's own shaders are unlit (map_common.gdshaderinc): this reads their sun, sky, haze and
// shadow map so the light it takes away or adds is the light those shaders put there.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_test_disabled, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;

#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_sea.gdshaderinc"
#include "res://render/rt/rt_common.gdshaderinc"

// how much of it shows: occlusion, bounce, sun shadows, reflections
uniform vec4 amounts = vec4(0.9, 0.35, 1.0, 1.0);
// how far round a pixel the light pass looks (m), the sun rays' length (m) and the reflections'
// reach (m): all follow the zoom (RayTrace.set_map_view)
uniform vec3 reach = vec3(18.0, 60.0, 1200.0);
// samples per pixel and steps along a reflection (more on Heavy)
uniform int samples = 4;
uniform int steps = 10;
// the city (layout.ts CITY: centre x, z, radius) and its streets' height (CITY_Y)
uniform vec4 city = vec4(30.0, -70.0, 470.0, 3.2);
// the lake above the falls (layout.ts LAKE: centre x, z, radius across x, its water's level)
uniform vec4 lake = vec4(-300.0, -905.0, 123.5, 213.7);
// the park's pond (layout.ts POND: centre x, z, radius, its water's level)
uniform vec4 pond = vec4(-168.0, -212.0, 30.0, 3.32);

// steps along the sun's ray per pixel (the quad marches four times as many between its pixels),
// and halvings to home in on a reflection's hit
const int CS_STEPS = 5;
const int REFINE = 5;
const float GOLDEN = 2.39996323;
const int BAYER[16] = int[](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

void vertex() {
	POSITION = vec4(VERTEX.xy, 0.5, 1.0);
}

float lum3(vec3 c) {
	return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// a colour read off the frame, kept from smearing (broken pixels, blinding glows)
vec3 safe(vec3 c, float top) {
	return c.r + c.g + c.b < 1e4 ? min(c, vec3(top)) : vec3(0.0);
}

void fragment() {
	mat4 ip = INV_PROJECTION_MATRIX;
	mat4 pm = PROJECTION_MATRIX;
	ivec2 size = textureSize(depth_tex, 0);
	ivec2 home = uv_px(SCREEN_UV, size);
	vec2 uv0 = px_uv(home, size);
	float d = depth_px(home, size);
	bool sky = is_sky(d);
	vec3 p = view_pos(uv0, d, ip);
	ivec2 fc = ivec2(FRAGCOORD.xy);
	int q = (fc.x & 1) + 2 * (fc.y & 1);
	vec2 sgn = vec2((fc.x & 1) == 0 ? 1.0 : -1.0, (fc.y & 1) == 0 ? 1.0 : -1.0);
	ivec2 qc = ivec2((fc.x >> 1) & 3, (fc.y >> 1) & 3);
	float qjit = (float(BAYER[qc.y * 4 + qc.x]) + 0.5) / 16.0;
	float z = sky ? -1e7 : p.z;
	float sx = alike(z, z + DFDX(z) * sgn.x);
	float sy = alike(z, z + DFDY(z) * sgn.y);
	vec3 n = cross(DFDX(p), DFDY(p));
	float nl = length(n);
	if (sx > 0.5 && sy > 0.5 && nl > 1e-12) {
		n /= nl;
		n = dot(n, p) > 0.0 ? -n : n;
	} else {
		n = view_normal(home, p, size, ip);
	}
	// where it is on the map, which way it faces, and how much of the haze is in front of it
	vec3 w = (INV_VIEW_MATRIX * vec4(p, 1.0)).xyz - uMapShift;
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec3 up = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	float fog = sky ? 1.0 : mapFog(p);
	// a pixel's width on the ground here (m)
	float px_m = -p.z * 2.0 / (abs(pm[1][1]) * float(size.y));

	// --- light: what crowds this pixel (occlusion) and what its neighbours give off (one bounce)
	float radius = reach.x;
	float r_px = clamp(radius * abs(pm[1][1]) * 0.5 * float(size.y) / max(-p.z, 0.5), 3.0, 90.0);
	float r2 = radius * radius;
	float occ = 0.0;
	vec3 bounce = vec3(0.0);
	if (!sky && fog < 0.98) {
		for (int i = 0; i < samples; i++) {
			float k = float(i * 4 + q);
			float a = (k + 0.5) / float(samples * 4);
			float ang = k * GOLDEN;
			float rad = a * a * r_px + 1.5;
			vec2 suv = uv0 + vec2(cos(ang), sin(ang)) * rad / vec2(size);
			if (suv.x < 0.0 || suv.y < 0.0 || suv.x >= 1.0 || suv.y >= 1.0) {
				continue;
			}
			vec3 v = pos_at(suv, size, ip) - p;
			float vv = dot(v, v);
			float cosv = dot(v, n) * inversesqrt(vv + 1e-4);
			float h = max(0.0, cosv - 0.1) * max(0.0, 1.0 - vv / r2);
			occ += h;
			float lod = clamp(log2(rad * 0.5 + 1.0) + 0.5, 0.0, 5.0);
			// (the map's glows run seven times over with bloom on: a neon trim tints the street, it
			// doesn't flood it)
			bounce += safe(textureLod(screen_tex, suv, lod).rgb, 3.0) * h;
		}
	}
	float ao = clamp(1.0 - occ * 2.6 / float(samples), 0.0, 1.0);
	bounce /= float(samples);

	// --- the sun: a ray at it from every spot the baked shadows leave lit. Each pixel takes every
	// fourth step; the quad keeps the nearest blocker any of it found.
	vec3 l = normalize((VIEW_MATRIX * vec4(uSunDir, 0.0)).xyz);
	float cs_len = reach.y;
	bool facing = false;
	float sun_share = 0.0;
	float t_hit = 1e5;
	if (amounts.z > 0.0 && !sky && uNight < 0.999 && fog < 0.95) {
		float cs = cloudShade(w.xz);
		float ndl = max(dot(nw, uSunDir), 0.0);
		vec3 sun = uSunCol * (ndl * sunShadow(w + nw * 3.5) * cs);
		// how much of what this pixel shows is the sun's (what a shadow here takes away)
		float lit_all = lum3(ambient(nw) * mix(0.82, 1.0, cs) + sun);
		sun_share = lum3(sun) / max(lit_all, 1e-4) * (1.0 - uNight);
		facing = dot(l, n) > 0.03 && sun_share > 0.02;
		if (facing) {
			for (int i = 0; i < CS_STEPS; i++) {
				float t = (float(i * 4 + q) + 0.5) * (cs_len / float(CS_STEPS * 4)) + px_m;
				vec3 s = p + n * px_m + l * t;
				vec2 suv = project(s, pm);
				if (suv.x < 0.0 || suv.y < 0.0 || suv.x >= 1.0 || suv.y >= 1.0) {
					break;
				}
				float dz = z_at(suv, size, ip) - s.z;
				// something solid between here and the sun, not a thin thing standing well in front
				// of the ray (a crane's leg, a lamp post) that it only passes behind
				if (dz > px_m * 0.6 + 0.002 * -s.z && dz < 6.0 + 0.01 * -s.z) {
					t_hit = t;
					break;
				}
			}
		}
	}
	float tn = t_hit + DFDX(t_hit) * sgn.x;
	t_hit = sx > 0.5 ? min(t_hit, tn) : t_hit;
	tn = t_hit + DFDY(t_hit) * sgn.y;
	t_hit = sy > 0.5 ? min(t_hit, tn) : t_hit;
	float shade = 1.0;
	if (facing && t_hit < 1e4) {
		// a full shadow close by, softening out towards the end of the ray (the sun is a disc)
		float lit = smoothstep(0.45, 1.0, t_hit / cs_len);
		// (zoomed far out a pixel is metres across: a cable's or a rail's shadow would only come
		// out as a chain of dots, and the baked shadows carry the big shapes)
		float sh = 1.0 - sun_share * (1.0 - lit) * 0.85 * (1.0 - smoothstep(0.9, 1.8, px_m));
		// a ray shorter than a few pixels says nothing
		shade = mix(1.0, sh, clamp(length(project(p + l * cs_len, pm) - uv0) * float(size.y) * 0.25, 0.0, 1.0));
	}

	// --- reflections: the sea and the lake (rippled by their own waves) and, after dark, the
	// city's wet streets. Each is flat and level, so it's known by where it lies.
	float refl_a = 0.0;
	vec3 refl_c = vec3(0.0);
	float shiny = 0.0;
	if (amounts.w > 0.0 && !sky && fog < 0.97 && nw.y > 0.9) {
		float tol = 0.06 + 0.0004 * -p.z;
		float kind = 0.0;
		float wet = 0.0;
		vec2 suv_sea = w.xz / (2.0 * uFine) + 0.5;
		bool in_fine = suv_sea.x > 0.0 && suv_sea.y > 0.0 && suv_sea.x < 1.0 && suv_sea.y < 1.0;
		float depth_m = in_fine ? texture(uDepth, suv_sea).r : 1.0;
		vec2 lk = (w.xz - lake.xy) / vec2(lake.z, lake.z / 1.25);
		vec2 pd = (w.xz - pond.xy) / vec2(pond.z, pond.z * 0.8);
		if (abs(w.y) < tol && depth_m > 0.004) {
			kind = 1.0;
		} else if (abs(w.y - lake.w) < tol && dot(lk, lk) < 1.0) {
			kind = 1.0;
		} else if (abs(w.y - pond.w) < tol && dot(pd, pd) < 1.0) {
			kind = 1.0;
		} else if (uNight > 0.01 && w.y > city.w - 0.6 && w.y < city.w + 1.2 && length(w.xz - city.xy) < city.z) {
			// puddles and a damp sheen between them, fading out at the city's edge
			float pud = texture(uNoise, w.xz / 17.0).a * 0.6 + texture(uNoise, w.xz / 5.3).b * 0.4;
			wet = mix(0.35, 1.0, smoothstep(0.42, 0.62, pud)) * smoothstep(city.z, city.z - 60.0, length(w.xz - city.xy)) * uNight;
			kind = wet > 0.01 ? 2.0 : 0.0;
		}
		if (kind > 0.0) {
			shiny = 1.0;
			vec3 V = normalize(-p);
			vec3 Vw = (INV_VIEW_MATRIX * vec4(V, 0.0)).xyz;
			vec3 nr;
			float rough;
			if (kind < 1.5) {
				// the water's own waves (map_sea.gdshaderinc waveN), calmer where they're smaller
				// than a pixel, as the sea draws them
				nr = waveN(w.xz, mix(0.5, 0.05, smoothstep(2.0, 18.0, px_m / max(Vw.y, 0.15))));
				rough = 0.12;
			} else {
				vec2 g = texture(uNoise, w.xz / 3.1 + vec2(0.37, 0.11)).rg - 0.5;
				nr = normalize(vec3(g.x * 0.03, 1.0, g.y * 0.03));
				rough = mix(0.85, 0.45, smoothstep(0.5, 0.9, wet));
			}
			vec3 rw = reflect(-Vw, nr);
			rw.y = max(rw.y, 0.03);
			rw = normalize(rw);
			float fres = 0.04 + 0.96 * pow(1.0 - max(dot(Vw, nr), 0.0), 5.0);
			// From up here a real lens would see little in the water (Fresnel is faint looking
			// down): the bay holds the skyline the way a photograph of a harbour at dusk does.
			float a = kind < 1.5 ? clamp(fres * 0.85 + mix(0.2, 0.26, uNight), 0.0, 0.92) : wet * mix(0.12, 0.42, wet) + fres * 0.3 * wet;
			vec3 r = normalize((VIEW_MATRIX * vec4(rw, 0.0)).xyz);
			// marched across the screen in even steps, its depth as 1/z (ray_trace.gdshader)
			float len = reach.z;
			if (r.z > 0.0) {
				len = min(len, (-1.0 - p.z) / r.z);
			}
			vec3 e = p + r * len;
			vec2 uv_a = uv0;
			vec2 uv_b = project(e, pm);
			float iz_a = 1.0 / p.z;
			float iz_b = 1.0 / e.z;
			vec2 dv = uv_b - uv_a;
			float fmax = 1.0;
			if (abs(dv.x) > 1e-6) {
				fmax = min(fmax, ((dv.x > 0.0 ? 1.0 : 0.0) - uv_a.x) / dv.x);
			}
			if (abs(dv.y) > 1e-6) {
				fmax = min(fmax, ((dv.y > 0.0 ? 1.0 : 0.0) - uv_a.y) / dv.y);
			}
			fmax = clamp(fmax, 0.0, 1.0);
			uv_b = uv_a + dv * fmax;
			iz_b = mix(iz_a, iz_b, fmax);
			float step_f = 1.0 / float(steps);
			// (each pixel of a quad a quarter step on from the last, every quad alike: a ray that
			// finds a lit window and its neighbour's that doesn't average out, they don't sparkle)
			float off = (float(q) + 0.5) * 0.25;
			float f_hit = 2.0;
			for (int i = 0; i < steps; i++) {
				float f = (float(i) + off) * step_f;
				float rz = 1.0 / mix(iz_a, iz_b, f);
				float dz = z_at(mix(uv_a, uv_b, f), size, ip) - rz;
				float prev_z = 1.0 / mix(iz_a, iz_b, max(f - step_f, 0.0));
				if (dz > 0.0 && dz < 0.02 * -rz + 2.0 + abs(rz - prev_z) * 1.5) {
					f_hit = f;
					break;
				}
			}
			// What a ray that leaves the screen sees is the sky the water already holds and the
			// street needn't: only what the rays find comes in (fading out as they run out), so
			// what nothing is reflected in keeps its own colour.
			vec3 c = skyRefl(rw) * mix(0.75, 1.0, cloudShade(w.xz));
			float got = 0.0;
			if (f_hit <= 1.0) {
				float lo = max(0.0, f_hit - step_f);
				float hi = f_hit;
				for (int j = 0; j < REFINE; j++) {
					float m = (lo + hi) * 0.5;
					if (z_at(mix(uv_a, uv_b, m), size, ip) - 1.0 / mix(iz_a, iz_b, m) > 0.0) {
						hi = m;
					} else {
						lo = m;
					}
				}
				vec2 huv = mix(uv_a, uv_b, hi);
				float hz = 1.0 / mix(iz_a, iz_b, hi);
				float th = abs(r.z) > 1e-4 ? (hz - p.z) / r.z : length(huv - uv0) * len;
				vec2 edge = smoothstep(vec2(0.0), vec2(0.08), huv) * smoothstep(vec2(0.0), vec2(0.08), 1.0 - huv);
				float found = edge.x * edge.y * (1.0 - smoothstep(reach.z * 0.6, reach.z, th));
				// gloss blurs with distance, measured in pixels the cone grows by
				float cone = rough * th / max(px_m, 1e-3);
				float lod = clamp(log2(1.0 + cone * (kind < 1.5 ? 0.15 : 0.3)) + rough * (kind < 1.5 ? 2.0 : 3.0), 0.0, 6.0);
				c = mix(c, safe(textureLod(screen_tex, huv, lod).rgb, 24.0), found);
				got = max(got, found);
			}
			a *= got;
			// the sun's glitter on the water stays: only the sky's share is what gets replaced
			vec3 col0 = textureLod(screen_tex, uv0, 0.0).rgb;
			a *= 1.0 - smoothstep(1.6, 4.0, lum3(col0));
			refl_a = a * (1.0 - fog);
			refl_c = c * refl_a;
		}
	}

	// --- the quad's four results, averaged (each neighbour weighted by how alike its depth is)
	float wt = sky ? 0.0 : 1.0;
	vec4 lw = vec4(bounce, mix(1.0, ao, amounts.x) * mix(1.0, shade, amounts.z)) * wt;
	float rw8 = shiny;
	vec4 rf = vec4(refl_c, refl_a) * rw8;
	vec4 lw_x = DFDX(lw);
	vec4 rf_x = DFDX(rf);
	float wt_x = DFDX(wt);
	float rw_x = DFDX(rw8);
	lw += (lw + lw_x * sgn.x) * sx;
	rf += (rf + rf_x * sgn.x) * sx;
	wt += (wt + wt_x * sgn.x) * sx;
	rw8 += (rw8 + rw_x * sgn.x) * sx;
	vec4 lw_y = DFDY(lw);
	vec4 rf_y = DFDY(rf);
	float wt_y = DFDY(wt);
	float rw_y = DFDY(rw8);
	lw += (lw + lw_y * sgn.y) * sy;
	rf += (rf + rf_y * sgn.y) * sy;
	wt += (wt + wt_y * sgn.y) * sy;
	rw8 += (rw8 + rw_y * sgn.y) * sy;
	vec4 light = wt > 1e-4 ? lw / wt : vec4(0.0, 0.0, 0.0, 1.0);
	vec4 refl = rw8 > 1e-4 ? rf / rw8 : vec4(0.0);
	// (shared only between the shiny pixels of a quad: a wall's foot doesn't get the street's)
	refl *= shiny;

	// glowing windows, neon and lamps give light rather than take shade; the haze in front of a
	// spot hides what happens there
	vec3 col = textureLod(screen_tex, uv0, 0.0).rgb;
	float keep = mix(1.0, light.a, (1.0 - smoothstep(1.2, 3.0, lum3(col))) * (1.0 - fog));
	// (after dark what's around is the city's own glow on dark ground: a lighter touch, or the
	// lit windows and the coloured containers would light the yards like day)
	vec3 add = light.rgb * amounts.y * mix(1.0, 0.45, uNight) * (1.0 - fog);
	if (sky) {
		keep = 1.0;
		add = vec3(0.0);
		refl = vec4(0.0);
	}
	// what was there, shaded, under the reflection's share; the bounce and the reflection on top
	ALBEDO = mapAlbedo(add + refl.rgb);
	ALPHA = 1.0 - keep * (1.0 - refl.a);
}
