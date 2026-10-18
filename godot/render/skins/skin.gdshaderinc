// Skins: special paint jobs won from the Skin Vault (app/gacha). Each is a pattern family
// (`kind`) drawn in four colours with a few numbers (`par`): x the pattern's scale, y its speed,
// z the plating's metalness, w its roughness. Commons are printed patterns, Rares are rich
// materials, Epics move.
//
// Shared by the robots (render/bot_opaque.gdshader) and the vault's swatches
// (render/skins/skin_orb.gdshader), so a skin looks the same on the card as on the robot. Every
// pattern is read from the plating's own rest-space coordinates (the bone's frame), so it stays
// painted on the metal as the robot moves, dents and tears apart.
//
// A shader built for one skin defines SKIN_FIXED as its kind (render/bot/bot_opaque.gdshaderinc):
// the other kinds' code is left out of it altogether.
//
// Kinds (render/skins/skins.gd keeps the same numbers):
//   0 none (the paint as it is)
//   1 camo, 2 digital camo, 3 stripes (tiger, zebra), 4 bands (hazard, candy), 5 checker,
//   6 carbon weave,
//   7 thin film (chameleon, oil slick), 8 scales, 9 marble, 10 hex plating, 11 ice, 12 circuit,
//   13 lava, 14 nebula, 15 storm, 16 synthwave grid, 17 aurora, 18 data rain, 19 liquid metal

// the one kind compiled in, or -1 for all of them
#ifdef SKIN_FIXED
#define SK_ONLY SKIN_FIXED
#else
#define SK_ONLY -1
#endif

struct SkinOut {
	vec3 albedo;
	float metal;
	float rough;
	vec3 emit;
	// a height for the bump (the caller turns its screen-space slope into a normal)
	float h;
};

float sk_hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 sk_hash3(vec3 p) {
	return vec3(sk_hash(p), sk_hash(p + 19.19), sk_hash(p + 47.77));
}

float sk_noise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(sk_hash(i), sk_hash(i + vec3(1, 0, 0)), f.x), mix(sk_hash(i + vec3(0, 1, 0)), sk_hash(i + vec3(1, 1, 0)), f.x), f.y),
			mix(mix(sk_hash(i + vec3(0, 0, 1)), sk_hash(i + vec3(1, 0, 1)), f.x), mix(sk_hash(i + vec3(0, 1, 1)), sk_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float sk_fbm(vec3 p) {
	return sk_noise(p) * 0.55 + sk_noise(p * 2.03 + 11.1) * 0.3 + sk_noise(p * 4.11 + 23.7) * 0.15;
}

// the nearest and second nearest of a jittered lattice of points (Worley): cells, cracks, plates
vec2 sk_cells(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int z = -1; z <= 1; z++)
	for (int y = -1; y <= 1; y++)
	for (int k = -1; k <= 1; k++) {
		vec3 o = vec3(float(k), float(y), float(z));
		vec3 r = o + sk_hash3(i + o) * 0.85 - f;
		float d = dot(r, r);
		if (d < d1) {
			d2 = d1;
			d1 = d;
		} else if (d < d2) {
			d2 = d;
		}
	}
	return sqrt(vec2(d1, d2));
}

// a 2D pattern's coordinates on a 3D part: the plane facing the plating most (box mapping)
vec2 sk_box(vec3 p, vec3 n) {
	vec3 a = abs(n);
	if (a.x > a.y && a.x > a.z) return p.zy;
	if (a.y > a.z) return p.xz;
	return p.xy;
}

// a soft step `w` wide (anti-aliased by the caller's pixel footprint)
float sk_edge(float e, float v, float w) {
	return smoothstep(e - w, e + w, v);
}

// three colours round a loop (thin films, colour-cycling glows)
vec3 sk_loop3(vec3 a, vec3 b, vec3 c, float t) {
	t = fract(t) * 3.0;
	return t < 1.0 ? mix(a, b, smoothstep(0.0, 1.0, t)) : t < 2.0 ? mix(b, c, smoothstep(1.0, 2.0, t)) : mix(c, a, smoothstep(2.0, 3.0, t));
}

// distance to the nearest edge of a hexagon tiling (pointy side up), and the cell's id
vec3 sk_hex(vec2 p) {
	const vec2 s = vec2(1.0, 1.7320508);
	vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
	vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
	vec4 c = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 9.73);
	vec2 q = abs(c.xy);
	float edge = 0.5 - max(dot(q, s * 0.5), q.x);
	return vec3(edge, c.zw);
}

// The skin `kind` over the plating at rest-space point p (rest normal rn), with world normal nw,
// world direction to the eye vw, the time t and `sec` 1 on the second plating (stripes, guards,
// trim). `base` is the paint underneath (kind 0 keeps it).
SkinOut skin_eval(int kind, vec4 c0, vec4 c1, vec4 c2, vec4 c3, vec4 par, vec3 p, vec3 rn, vec3 nw, vec3 vw, float t, float sec, SkinOut base) {
	SkinOut o = base;
	if (kind == 0) return o;
	o.albedo = c0.rgb;
	o.metal = par.z;
	o.rough = par.w;
	o.emit = vec3(0.0);
	o.h = 0.0;
	float s = par.x;
	float sp = par.y;
	vec3 q = p * s;
	// how much of the pattern one pixel covers: fine detail fades out instead of shimmering
	float fw = max(length(fwidth(q)), 1e-4);
	float graze = 1.0 - clamp(dot(nw, vw), 0.0, 1.0);

#if SK_ONLY < 0 || SK_ONLY == 1
	if (kind == 1) {
		// camo: three layers of soft blobs over the base colour
		float a = sk_fbm(q);
		float b = sk_fbm(q * 1.3 + 37.0);
		float c = sk_fbm(q * 2.4 + 71.0);
		float w = fw * 0.6 + 0.012;
		o.albedo = mix(o.albedo, c1.rgb, sk_edge(0.52, a, w));
		o.albedo = mix(o.albedo, c2.rgb, sk_edge(0.58, b, w));
		o.albedo = mix(o.albedo, c3.rgb, sk_edge(0.66, c, w));
		o.albedo *= mix(1.0, 0.82, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 2
	if (kind == 2) {
		// digital camo: the camo's blobs sampled on a grid of small squares
		vec3 g = floor(q * 6.0) / 6.0;
		vec3 g2 = floor(q * 3.0) / 3.0;
		float jit = sk_hash(g * 13.0) * 0.18;
		float a = sk_fbm(g2 * 1.1) + jit;
		float b = sk_fbm(g * 1.4 + 29.0) + jit;
		float c = sk_fbm(g * 2.1 + 55.0) + sk_hash(g * 7.0 + 3.0) * 0.12;
		float fade = smoothstep(0.08, 0.2, fw);
		o.albedo = mix(o.albedo, c1.rgb, mix(step(0.6, a), 0.4, fade));
		o.albedo = mix(o.albedo, c2.rgb, mix(step(0.68, b), 0.25, fade));
		o.albedo = mix(o.albedo, c3.rgb, mix(step(0.76, c), 0.1, fade));
		o.albedo *= mix(1.0, 0.82, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 3
	if (kind == 3) {
		// stripes: warped, tapering bands round the parts (tiger, zebra), fading to c2 underneath
		float u = dot(q, vec3(0.32, 1.0, 0.18)) + sk_fbm(q * 0.9 + 4.0) * 1.1;
		float f = fract(u * 1.6);
		float thick = 0.17 + 0.24 * sk_noise(q * vec3(2.2, 0.6, 2.2) + 9.0);
		float d = abs(f - 0.5);
		float w = fw * 1.6 + 0.01;
		float stripe = 1.0 - sk_edge(thick, d * (1.0 + 0.5 * sk_noise(q * 5.0)), w);
		vec3 coat = mix(c0.rgb, c2.rgb, smoothstep(-0.1, -0.8, rn.y) * 0.6 + sec * 0.2);
		o.albedo = mix(coat, c1.rgb, stripe);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 4
	if (kind == 4) {
		// bands: bold diagonal stripes (hazard, candy), a thin pinstripe of c2 between
		float u = dot(q, vec3(0.7071, 0.7071, 0.35)) + sec * 0.5;
		float f = fract(u);
		float w = fw * 0.8 + 0.004;
		float band = sk_edge(0.5, f, w) * (1.0 - sk_edge(0.98, f, w));
		o.albedo = mix(c0.rgb, c1.rgb, band);
		float pin = (1.0 - sk_edge(0.035, abs(f - 0.5), w)) * c2.a;
		o.albedo = mix(o.albedo, c2.rgb, pin * (1.0 - smoothstep(0.1, 0.4, fw)));
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 5
	if (kind == 5) {
		// checker: a racing flag in solid squares
		vec3 g = floor(q);
		float k = mod(g.x + g.y + g.z, 2.0);
		vec3 f = abs(fract(q) - 0.5);
		float seam = 1.0 - sk_edge(0.47, max(f.x, max(f.y, f.z)), fw + 0.004);
		o.albedo = mix(c0.rgb, c1.rgb, mix(k, 0.5, smoothstep(0.15, 0.5, fw)));
		o.albedo *= mix(0.94, 1.0, seam);
		o.albedo *= mix(1.0, 0.8, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 6
	if (kind == 6) {
		// carbon weave: a 2x2 twill of tows under a deep clear coat
		vec2 uv = sk_box(q, rn) * 8.0;
		vec2 g = floor(uv);
		vec2 f = fract(uv);
		float dir = mod(floor((g.x + g.y) * 0.5), 2.0);
		float along = dir < 0.5 ? f.x : f.y;
		float across = dir < 0.5 ? f.y : f.x;
		float tow = sin(across * 3.14159);
		float fibre = 0.5 + 0.5 * sin(along * 3.14159 * 2.0 + across * 40.0);
		float fade = smoothstep(0.25, 0.7, fw * 8.0);
		float shade = mix(0.3 + 0.7 * tow * (0.75 + 0.25 * fibre), 0.62, fade);
		// the tows catch the light by their direction: one set bright where the other is dark
		float aniso = mix(dir, 1.0 - dir, step(0.5, abs(nw.y)));
		o.albedo = mix(c0.rgb, c1.rgb, shade * (0.55 + 0.45 * aniso));
		o.h = (1.0 - fade) * tow * 0.4;
		o.albedo *= mix(1.0, 0.8, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 7
	if (kind == 7) {
		// thin film: the colour slides round c1 -> c2 -> c3 with the viewing angle (chameleon,
		// oil slick), swirled a little over the part
		float swirl = sk_fbm(q * 2.2) * 1.6 + sk_noise(q * 6.0) * 0.25;
		float phase = graze * 0.9 + swirl + nw.y * 0.25 + sec * 0.33;
		vec3 film = sk_loop3(c1.rgb, c2.rgb, c3.rgb, phase);
		o.albedo = mix(c0.rgb, film, 0.25 + 0.6 * graze * graze + 0.15 * graze);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 8
	if (kind == 8) {
		// scales: rows of overlapping domed scales, each rimmed in c2
		vec2 uv = sk_box(q, rn) * vec2(4.0, 5.0);
		float best = 0.72;
		float best_row = -1e9;
		vec2 best_c = vec2(0.0);
		for (int r = 0; r < 2; r++) {
			float row = floor(uv.y) + float(r);
			float off = mod(row, 2.0) * 0.5;
			float cx = floor(uv.x - off + 0.5) + off;
			for (int k = -1; k <= 1; k++) {
				vec2 cc = vec2(cx + float(k), row);
				float l = length((uv - cc) * vec2(1.0, 1.25));
				// a lower row's scales lie over the row above
				if (l < 0.72 && (row > best_row || (row == best_row && l < best))) {
					best = l;
					best_row = row;
					best_c = cc;
				}
			}
		}
		float dome = 1.0 - best / 0.72;
		float rim = 1.0 - smoothstep(0.08, 0.2, dome);
		float tint = sk_hash(vec3(best_c, 3.0));
		o.albedo = mix(c0.rgb, c1.rgb, smoothstep(0.0, 0.9, dome) * 0.8 + tint * 0.2);
		o.albedo = mix(o.albedo, c2.rgb, rim * (1.0 - smoothstep(0.2, 0.6, fw * 4.0)));
		o.metal = mix(par.z, 1.0, rim);
		o.h = sqrt(max(dome, 0.0)) * 0.5;
		o.albedo *= mix(1.0, 0.8, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 9
	if (kind == 9) {
		// marble: cloudy stone shot through with fine veins of metal (c2, metallic)
		float w = sk_fbm(q * 0.7) * 5.0 + sk_fbm(q * 2.0 + 5.0);
		float v = abs(sin(q.x * 1.3 + q.y * 0.6 + w));
		float vein = smoothstep(0.74, 0.95, 1.0 - v) + smoothstep(0.86, 0.98, 1.0 - abs(sin(q.z * 2.1 - q.y + w * 1.7))) * 0.8;
		vein = clamp(vein * (1.0 - smoothstep(0.3, 1.2, fw)), 0.0, 1.0);
		float cloud = sk_fbm(q * 1.4 + 31.0);
		o.albedo = mix(c0.rgb, c1.rgb, smoothstep(0.35, 0.8, cloud) * 0.6);
		o.albedo = mix(o.albedo, c2.rgb, vein);
		o.metal = mix(par.z, 1.0, vein);
		o.rough = mix(par.w, 0.18, vein);
		o.albedo *= mix(1.0, 0.85, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 10
	if (kind == 10) {
		// hex plating: bevelled hexagon plates, their seams lit from inside in c2
		vec3 hx = sk_hex(sk_box(q, rn) * 2.2);
		float w = fw * 2.2 + 0.01;
		float seam = 1.0 - sk_edge(0.05, hx.x, w);
		float bevel = smoothstep(0.05, 0.18, hx.x);
		float tint = sk_hash(vec3(hx.yz, 1.0));
		o.albedo = mix(c0.rgb, c1.rgb, tint * 0.6) * mix(0.7, 1.0, bevel);
		o.albedo = mix(o.albedo, c3.rgb, seam);
		o.emit = c2.rgb * seam * (1.0 - smoothstep(0.3, 1.0, fw * 2.2)) * 1.6;
		o.h = bevel * 0.35;
		o.albedo *= mix(1.0, 0.8, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 11
	if (kind == 11) {
		// ice: deep blue glass cracked in white, frost gathering at the edges
		vec2 cl = sk_cells(q * 1.6);
		float crack = 1.0 - smoothstep(0.0, 0.05 + fw * 2.0, cl.y - cl.x);
		vec2 cf = sk_cells(q * 4.5 + 13.0);
		float fine = (1.0 - smoothstep(0.0, 0.04 + fw * 4.0, cf.y - cf.x)) * 0.45;
		float depth = sk_fbm(q * 0.9);
		o.albedo = mix(c0.rgb, c1.rgb, depth);
		float frost = smoothstep(0.55, 0.85, sk_fbm(q * 3.0 + 3.0) + graze * 0.4);
		o.albedo = mix(o.albedo, c2.rgb, max(max(crack, fine), frost * 0.7));
		o.rough = mix(par.w, 0.5, max(crack * 0.6, frost));
		o.emit = c3.rgb * (depth * 0.25 + crack * 0.5) * 0.35;
		o.h = -crack * 0.3;
		o.albedo *= mix(1.0, 0.85, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 12
	if (kind == 12) {
		// circuit: copper traces and gold pads on a board, a few status LEDs lit
		vec2 uv = sk_box(q, rn) * 5.0;
		vec2 g = floor(uv);
		vec2 f = fract(uv) - 0.5;
		float hsh = sk_hash(vec3(g, 7.0));
		float w = fw * 5.0 + 0.02;
		// each cell runs a trace across it one way or the other, some turn the corner
		float tr = hsh < 0.5 ? abs(f.y) : abs(f.x);
		if (hsh > 0.8) tr = min(abs(f.x) + max(f.y, 0.0) * 9.0, abs(f.y) + max(f.x, 0.0) * 9.0);
		float trace = 1.0 - sk_edge(0.08, tr, w);
		float pad = 1.0 - sk_edge(0.17, length(f - (sk_hash3(vec3(g, 2.0)).xy - 0.5) * 0.4), w);
		pad *= step(0.62, sk_hash(vec3(g, 5.0)));
		float led = pad * step(0.55, sk_hash(vec3(g, 9.0)));
		o.albedo = mix(c0.rgb * (0.85 + 0.15 * hsh), c1.rgb, trace);
		o.albedo = mix(o.albedo, c2.rgb, pad);
		o.metal = mix(par.z, 1.0, max(trace, pad));
		o.rough = mix(par.w, 0.25, max(trace, pad));
		o.emit = c3.rgb * led * 3.5 + c1.rgb * trace * 0.06;
		o.h = (trace + pad) * 0.12;
		o.albedo *= mix(1.0, 0.85, sec);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 13
	if (kind == 13) {
		// lava: plates of black crust drifting on molten rock that glows through the cracks
		vec3 flow = vec3(0.0, -t * sp * 0.08, t * sp * 0.03);
		vec3 wq = q + vec3(sk_noise(q * 0.7 + flow), sk_noise(q * 0.7 + 7.0), sk_noise(q * 0.7 - flow)) * 0.6;
		vec2 cl = sk_cells(wq + flow);
		float gap = cl.y - cl.x;
		float crack = 1.0 - smoothstep(0.0, 0.1 + fw * 0.5, gap);
		float pulse = 0.75 + 0.25 * sin(t * sp * 2.2 + sk_noise(q * 1.3) * 6.28);
		float halo = 1.0 - smoothstep(0.0, 0.22, gap);
		float heat = crack * pulse + halo * halo * 0.22 * pulse;
		vec3 molten = mix(c1.rgb, c2.rgb, smoothstep(0.55, 1.0, heat));
		float crust = sk_fbm(wq * 3.0);
		o.albedo = mix(c0.rgb * (0.35 + crust * 0.6), molten * 0.3, crack);
		o.emit = c1.rgb * halo * 0.25;
		o.rough = mix(0.9, 0.5, crack);
		o.metal = 0.0;
		o.emit += molten * heat * (1.9 - sec * 0.5) + c3.rgb * smoothstep(0.6, 1.0, sk_noise(q * 2.0 + flow * 3.0)) * crack * 1.5;
		o.h = (1.0 - crack) * 0.35 + crust * 0.1;
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 14
	if (kind == 14) {
		// nebula: a window onto deep space, the clouds and stars seen in the plating's reflection
		vec3 r = reflect(-vw, nw);
		vec3 d = normalize(r * 2.0 + p * 0.6);
		vec3 drift = vec3(t * sp * 0.02, t * sp * 0.013, 0.0);
		float n1 = sk_fbm(d * 2.2 + drift + 3.0);
		float n2 = sk_fbm(d * 4.1 - drift * 1.7 + 11.0);
		vec3 cloud = mix(c1.rgb, c2.rgb, smoothstep(0.35, 0.75, n2));
		cloud = mix(cloud, c3.rgb, smoothstep(0.62, 0.85, n1 * n2 * 1.8));
		float dens = smoothstep(0.48, 0.86, n1) * (0.6 + 0.4 * n2);
		// stars: one per lattice cell of directions, twinkling on its own beat
		vec3 sd = d * 30.0;
		vec3 si = floor(sd);
		vec3 sh = sk_hash3(si);
		float sdist = length(fract(sd) - 0.5 - (sh - 0.5) * 0.6);
		float star = step(0.72, sh.x) * (1.0 - smoothstep(0.03, 0.11 + fw * 2.0, sdist));
		float tw = 0.55 + 0.45 * sin(t * (2.0 + sh.y * 4.0) + sh.z * 6.28);
		o.albedo = c0.rgb + cloud * dens * 0.05;
		o.metal = 0.0;
		o.rough = 0.42;
		o.emit = cloud * (dens * 1.15 + 0.02) * (1.0 - sec * 0.3) + vec3(1.0, 0.97, 0.92) * star * tw * 7.0;
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 15
	if (kind == 15) {
		// storm: electric arcs crawling over dark plating, flickering in bursts
		vec3 m = vec3(0.0, t * sp * 0.9, t * sp * 0.55);
		float n = sk_noise(q * 1.4 + m + sk_noise(q * 3.0 - m) * 0.8);
		float n2 = sk_noise(q * 2.9 - m * 1.3 + 17.0);
		float r1 = 1.0 - abs(n * 2.0 - 1.0);
		float r2 = 1.0 - abs(n2 * 2.0 - 1.0);
		float k = 1.0 - smoothstep(0.0, 0.5, fw);
		float arc = pow(r1, 22.0) * k + pow(r2, 30.0) * 0.6 * k;
		float burst = floor(t * 9.0);
		float flick = 0.35 + 0.65 * step(0.35, sk_hash(vec3(burst, 1.0, 3.0)));
		float charge = sk_fbm(q * 0.6 + m * 0.3);
		o.albedo = c0.rgb * (0.7 + charge * 0.5);
		o.emit = (c1.rgb * arc * 3.2 + c2.rgb * pow(arc, 3.0) * 5.0) * flick + c1.rgb * smoothstep(0.55, 0.9, charge) * 0.18;
		o.h = arc * 0.1;
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 16
	if (kind == 16) {
		// synthwave: a neon grid scrolling over a sunset, its glow sliding between c1 and c2
		vec2 uv = sk_box(q, rn) * 3.0 + vec2(0.0, t * sp * 0.6);
		vec2 g = abs(fract(uv) - 0.5);
		vec2 lw = fwidth(uv) * 1.2 + 0.03;
		float line = max(1.0 - smoothstep(0.0, lw.x, 0.5 - g.x), 1.0 - smoothstep(0.0, lw.y, 0.5 - g.y));
		line *= 1.0 - smoothstep(0.25, 0.8, fw * 3.0);
		float glow = max(1.0 - smoothstep(0.0, 0.18, 0.5 - g.x), 1.0 - smoothstep(0.0, 0.18, 0.5 - g.y)) * 0.25;
		vec3 neon = mix(c1.rgb, c2.rgb, 0.5 + 0.5 * sin(p.y * 2.4 - t * sp * 1.4));
		float sun = smoothstep(-0.3, 0.6, rn.y + sin(q.x * 0.5) * 0.1);
		o.albedo = mix(c0.rgb, c3.rgb * 0.5, sun * 0.3);
		o.emit = neon * (line * 2.8 + glow) + c3.rgb * sun * 0.06;
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 17
	if (kind == 17) {
		// aurora: thin ribbons of light folding and drifting over dark plating
		float x = dot(q, vec3(1.0, 0.0, 0.6)) + sk_fbm(q * 0.45 + vec3(0.0, 0.0, t * sp * 0.1)) * 2.6;
		float band = 1.0 - abs(fract(x * 1.3 + t * sp * 0.08) - 0.5) * 2.0;
		float ribbon = pow(band, 7.0);
		float band2 = 1.0 - abs(fract(x * 2.1 - t * sp * 0.11 + 0.3) - 0.5) * 2.0;
		ribbon += pow(band2, 12.0) * 0.6;
		// fine vertical rays rippling down each ribbon
		float rays = sk_noise(vec3(x * 14.0, q.y * 0.4 - t * sp * 0.9, 1.0));
		float light = ribbon * (0.35 + 0.65 * rays) * (1.0 - smoothstep(0.2, 0.9, fw));
		vec3 hue = mix(c1.rgb, c2.rgb, smoothstep(0.2, 0.9, fract(q.y * 0.22 + x * 0.05 + 10.0)));
		hue = mix(hue, c3.rgb, smoothstep(0.7, 1.0, rays) * ribbon);
		o.albedo = c0.rgb + hue * ribbon * 0.04;
		o.emit = hue * (light * 3.2 + ribbon * 0.25) * (1.0 - sec * 0.3);
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 18
	if (kind == 18) {
		// data rain: columns of glyphs falling down the plating, each led by a bright head
		vec2 uv = sk_box(q, rn) * vec2(7.0, 4.0);
		float col = floor(uv.x);
		float ch = sk_hash(vec3(col, 1.0, 9.0));
		float speed = (0.6 + ch * 0.9) * sp;
		float y = uv.y * 2.0 + t * speed * 3.0;
		float cell = floor(y);
		vec2 f = vec2(fract(uv.x), fract(y));
		// the glyph: a 3x4 grid of bits, re-rolled now and then
		vec2 bit = floor(f * vec2(3.0, 4.0));
		float roll = floor(t * (2.0 + ch * 3.0));
		float on = step(0.45, sk_hash(vec3(col * 3.0 + bit.x, cell * 5.0 + bit.y, roll + 0.5)));
		vec2 bf = fract(f * vec2(3.0, 4.0)) - 0.5;
		on *= 1.0 - smoothstep(0.32, 0.45, max(abs(bf.x), abs(bf.y)));
		// a trail fading behind the head
		float len = 9.0 + ch * 10.0;
		float head = fract((cell + sk_hash(vec3(col, 4.0, 2.0)) * 40.0) / len);
		float trail = pow(head, 3.0);
		float lead = step(0.94, head);
		float k = 1.0 - smoothstep(0.1, 0.35, fw * 7.0);
		o.albedo = c0.rgb;
		o.rough = 0.12;
		o.emit = (c1.rgb * trail * on * 2.4 + c2.rgb * lead * on * 4.0) * k + c1.rgb * trail * 0.05;
	}
#endif
#if SK_ONLY < 0 || SK_ONLY == 19
	if (kind == 19) {
		// liquid metal: polished metal under travelling ripples, darker in the troughs
		vec3 m = vec3(t * sp * 0.7);
		float h = sin(dot(q, vec3(1.7, 0.6, 0.4)) * 2.0 - m.x * 2.0) * 0.4
				+ sin(dot(q, vec3(-0.5, 1.4, 0.9)) * 2.6 - m.y * 2.6) * 0.3
				+ sin(dot(q, vec3(0.2, -0.8, 1.6)) * 3.3 + m.z * 1.8) * 0.2
				+ (sk_noise(q * 2.0 + m * 0.4) - 0.5) * 0.5;
		h *= 1.0 - smoothstep(0.3, 1.0, fw);
		o.albedo = mix(c1.rgb, c0.rgb, smoothstep(-0.7, 0.3, h));
		o.metal = 1.0;
		o.rough = par.w;
		o.emit = c2.rgb * pow(smoothstep(0.55, 0.95, h), 3.0) * 0.6;
		o.h = h * 3.0;
	}
#endif
	return o;
}
