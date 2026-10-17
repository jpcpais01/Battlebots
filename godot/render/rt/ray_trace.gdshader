// The "Ray tracing" setting's screen-space pass (src/render/rt.ts ScreenSpaceLighting, LIGHT and
// REFLECT): global illumination, ambient occlusion, contact shadows and glossy reflections traced
// against the depth buffer the scene has already drawn. RayTrace (ray_trace.gd) draws it as one
// screen-covering quad, first in the transparent pass, so it reads the opaque scene (colour and
// depth) and the transparent things (beams, sparks, the crowd's glow) draw over it untouched.
//
// The web traces at half resolution with a 4x4 jitter and blurs; a phone's tiled GPU would rather
// not have extra targets, so this runs at full resolution but does a half-resolution amount of
// work: the four pixels of each 2x2 quad split every job between them and share the results
// through the derivative units (depth-aware), which costs no extra pass at all. The light pass's
// spiral is dealt out four ways and the results averaged; the contact-shadow ray is marched in
// interleaved quarters, the quad taking its nearest blocker; the reflection rays take a third of
// the steps, offset between pixels and quads, and are averaged; the normal comes from the quad's
// own depths wherever its pixels lie on one surface.
//
// Nothing is written over: the result goes out as premultiplied alpha, so the frame is multiplied
// by the occlusion (alpha) and the bounce and reflections are added (colour). An error reading
// the screen texture's brightness then only scales the added light, never the picture.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_test_disabled, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;
// how much of it shows: occlusion, bounce, contact shadows, reflections (rt.ts uRTk)
uniform vec4 amounts = vec4(0.85, 0.45, 1.0, 1.0);
// the key light (world space), for its contact shadows
uniform vec3 key_pos = vec3(2.2, 13.0, 3.0);
// the ring's canvas: strength, roughness (rt.ts CANVAS_GLOSS; strength 0 away from the arena)
uniform vec2 canvas_look = vec2(0.6, 0.3);
// the floor round the stage: strength, roughness, height (rt.ts ReflectLook.floor)
uniform vec3 floor_look = vec3(0.0, 0.5, -0.62);
// the canvas reaches past the corners to its rolled edge (RING_CORNER + 0.55)
uniform float ring_r = 5.55;
// how far round a pixel the light pass looks for what crowds it, in metres
uniform float radius = 0.55;

// samples per pixel (each quad of four pixels shares a spiral four times as long)
const int SAMPLES = 4;
// steps along the contact-shadow and reflection rays per pixel (the quad marches four times as
// many between its pixels), and halvings to home in on a reflection's hit
const int CS_STEPS = 2;
const float CS_LEN = 0.32;
const int STEPS = 8;
const int REFINE = 5;
const float MAX_DIST = 9.0;
// the golden angle: the spiral's taps spread evenly however many there are
const float GOLDEN = 2.39996323;
// a 4x4 ordered pattern, for where neighbouring quads start their steps
const int BAYER[16] = int[](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

// The four pixels of a quad average their results through the derivative units: a pixel's
// neighbour across the quad is itself plus or minus its derivative.
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
#define DFDX dFdx
#define DFDY dFdy
#else
#define DFDX dFdxFine
#define DFDY dFdyFine
#endif

void vertex() {
	// (a 2x2 quad straight onto the screen; RayTrace keeps it from being culled)
	POSITION = vec4(VERTEX.xy, 0.5, 1.0);
}

float ndc_z(float d) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return d * 2.0 - 1.0;
#else
	return d;
#endif
}

bool is_sky(float d) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return d >= 0.9999999;
#else
	// (reversed depth: the far plane is 0)
	return d <= 0.0000001;
#endif
}

// The depth buffer is only ever read one whole pixel at a time, and a position is always rebuilt
// from the centre of the very pixel its depth came from (rt.ts VIEW: filtered lookups between
// rows flip with rounding and draw lines across the floor).
float depth_px(ivec2 p, ivec2 size) {
	return texelFetch(depth_tex, clamp(p, ivec2(0), size - ivec2(1)), 0).r;
}

vec2 px_uv(ivec2 p, ivec2 size) {
	return (vec2(clamp(p, ivec2(0), size - ivec2(1))) + 0.5) / vec2(size);
}

ivec2 uv_px(vec2 uv, ivec2 size) {
	return ivec2(floor(uv * vec2(size)));
}

vec3 view_pos(vec2 uv, float d, mat4 ip) {
	vec4 v = ip * vec4(uv * 2.0 - 1.0, ndc_z(d), 1.0);
	return v.xyz / v.w;
}

// only the view depth (the third and fourth rows of the inverse projection)
float view_z(vec2 uv, float d, mat4 ip) {
	vec4 n = vec4(uv * 2.0 - 1.0, ndc_z(d), 1.0);
	return dot(vec4(ip[0].z, ip[1].z, ip[2].z, ip[3].z), n) / dot(vec4(ip[0].w, ip[1].w, ip[2].w, ip[3].w), n);
}

vec3 pos_px(ivec2 p, ivec2 size, mat4 ip) {
	return view_pos(px_uv(p, size), depth_px(p, size), ip);
}

// the scene where a screen position lands: that pixel's own depth, at that pixel's centre
vec3 pos_at(vec2 uv, ivec2 size, mat4 ip) {
	return pos_px(uv_px(uv, size), size, ip);
}

float z_at(vec2 uv, ivec2 size, mat4 ip) {
	ivec2 p = uv_px(uv, size);
	return view_z(px_uv(p, size), depth_px(p, size), ip);
}

vec2 project(vec3 p, mat4 pm) {
	vec4 c = pm * vec4(p, 1.0);
	return c.xy / c.w * 0.5 + 0.5;
}

// of two steps either side, the one nearer in depth (so an edge doesn't bend the surface behind
// it), but never a step of nothing (at the screen's edge a neighbour is the pixel itself)
vec3 pick_step(vec3 back, vec3 fwd) {
	bool f = abs(fwd.z) < abs(back.z);
	if (dot(fwd, fwd) < 1e-12) {
		f = false;
	}
	if (dot(back, back) < 1e-12) {
		f = true;
	}
	return f ? fwd : back;
}

// the surface normal from the depth of the pixels round pixel c
vec3 view_normal(ivec2 c, vec3 p, ivec2 size, mat4 ip) {
	vec3 dx = pick_step(p - pos_px(c - ivec2(1, 0), size, ip), pos_px(c + ivec2(1, 0), size, ip) - p);
	vec3 dy = pick_step(p - pos_px(c - ivec2(0, 1), size, ip), pos_px(c + ivec2(0, 1), size, ip) - p);
	vec3 n = cross(dx, dy);
	float len = length(n);
	// (a degenerate spot faces the camera rather than turning into NaN; either winding faces it)
	n = len > 1e-12 ? n / len : vec3(0.0, 0.0, 1.0);
	return dot(n, p) > 0.0 ? -n : n;
}

// how alike two view depths are, for averaging across a quad (rt.ts BLUR)
float alike(float z, float zn) {
	return max(0.0, 1.0 - abs(zn - z) / (0.03 * -z + 0.02));
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
	// this pixel's quarter of its quad's work, and which way its neighbours lie across the quad
	ivec2 fc = ivec2(FRAGCOORD.xy);
	int q = (fc.x & 1) + 2 * (fc.y & 1);
	vec2 sgn = vec2((fc.x & 1) == 0 ? 1.0 : -1.0, (fc.y & 1) == 0 ? 1.0 : -1.0);
	ivec2 qc = ivec2((fc.x >> 1) & 3, (fc.y >> 1) & 3);
	float qjit = (float(BAYER[qc.y * 4 + qc.x]) + 0.5) / 16.0;
	float z = sky ? -1e5 : p.z;
	// how alike the neighbours across the quad are in depth: what they find counts here too
	float sx = alike(z, z + DFDX(z) * sgn.x);
	float sy = alike(z, z + DFDY(z) * sgn.y);
	// the normal from the quad's own positions when all of it is one surface, else from the
	// pixels round this one (an edge: the nearer side, so it doesn't bend the surface behind)
	vec3 n = cross(DFDX(p), DFDY(p));
	float nl = length(n);
	if (sx > 0.5 && sy > 0.5 && nl > 1e-12) {
		n /= nl;
		n = dot(n, p) > 0.0 ? -n : n;
	} else {
		n = view_normal(home, p, size, ip);
	}

	// --- light: what crowds this pixel (occlusion) and the light its neighbours give off (one
	// bounce: the orange skirt glows on the floor, a red robot tints the canvas)
	float r_px = clamp(radius * abs(pm[1][1]) * 0.5 * float(size.y) / max(-p.z, 0.05), 3.0, 90.0);
	float r2 = radius * radius;
	float occ = 0.0;
	vec3 bounce = vec3(0.0);
	if (!sky) {
		for (int i = 0; i < SAMPLES; i++) {
			float k = float(i * 4 + q);
			float a = (k + 0.5) / float(SAMPLES * 4);
			float ang = k * GOLDEN;
			float rad = a * a * r_px + 1.5;
			vec2 suv = uv0 + vec2(cos(ang), sin(ang)) * rad / vec2(size);
			if (suv.x < 0.0 || suv.y < 0.0 || suv.x >= 1.0 || suv.y >= 1.0) {
				continue;
			}
			vec3 v = pos_at(suv, size, ip) - p;
			float vv = dot(v, v);
			float cosv = dot(v, n) * inversesqrt(vv + 1e-4);
			// nearer neighbours count fully, ones at the edge of the radius fade out, ones beyond don't
			float h = max(0.0, cosv - 0.08) * max(0.0, 1.0 - vv / r2);
			occ += h;
			// (a mip a level finer than the web's: its copy was already half the screen)
			float lod = clamp(log2(rad * 0.5 + 1.0) + 0.5, 0.0, 5.0);
			vec3 c = textureLod(screen_tex, suv, lod).rgb;
			// keep broken pixels and blinding glows from smearing (rt.ts COPY)
			bounce += (c.r + c.g + c.b < 1e4 ? min(c, vec3(24.0)) : vec3(0.0)) * h;
		}
	}
	float ao = clamp(1.0 - occ * 1.8 / float(SAMPLES), 0.0, 1.0);
	bounce /= float(SAMPLES);

	// --- a short ray at the key light: what stands right in its way, closer than its shadow map
	// sees. Each pixel takes every fourth step; the quad keeps the nearest blocker any of it found.
	vec3 l = vec3(0.0, 1.0, 0.0);
	bool facing = false;
	float t_hit = 1e3;
	if (amounts.z > 0.0 && !sky) {
		vec3 kv = (VIEW_MATRIX * vec4(key_pos, 1.0)).xyz;
		l = normalize(kv - p);
		facing = dot(l, n) > 0.05;
		if (facing) {
			for (int i = 0; i < CS_STEPS; i++) {
				float t = (float(i * 4 + q) + 0.5) * (CS_LEN / float(CS_STEPS * 4)) + 0.02;
				vec3 s = p + n * 0.01 + l * t;
				vec2 suv = project(s, pm);
				if (suv.x < 0.0 || suv.y < 0.0 || suv.x >= 1.0 || suv.y >= 1.0) {
					break;
				}
				float dz = z_at(suv, size, ip) - s.z;
				// something solid sits between this point and the light (but not far behind it)
				if (dz > 0.015 && dz < 0.25) {
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
	if (facing) {
		float lit = t_hit < 1e2 ? mix(0.12, 0.55, t_hit / CS_LEN) : 1.0;
		// a stretch shorter than a pixel says nothing
		shade = mix(1.0, lit, clamp(length(project(p + l * CS_LEN, pm) - uv0) * float(size.y) * 0.25, 0.0, 1.0));
	}

	// --- reflections: the canvas and the floor round the stage are flat and face up, so their
	// pixels march a reflected ray through the depth buffer; a hit reads the colour mip that
	// matches how glossy the surface is and how far the ray went (sharp at contact, blurred away)
	float k = 0.0;
	float rough = 1.0;
	vec3 r = vec3(0.0);
	float fres = 0.0;
	float len = MAX_DIST;
	vec2 uv_a = uv0;
	vec2 uv_b = uv0;
	float iz_a = 1.0;
	float iz_b = 1.0;
	float f_hit = 2.0;
	if (amounts.w > 0.0 && !sky) {
		vec3 w = (INV_VIEW_MATRIX * vec4(p, 1.0)).xyz;
		vec3 up = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
		if (canvas_look.x > 0.0 && abs(w.y) < 0.03 && length(w.xz) < ring_r) {
			k = canvas_look.x;
			rough = canvas_look.y;
		} else if (floor_look.x > 0.0 && abs(w.y - floor_look.z) < 0.04) {
			k = floor_look.x;
			rough = floor_look.y;
		}
		// only the flat, upward-facing tops: not the robots' feet or the stage's rounded edge
		if (k > 0.0 && dot(n, up) < 0.92) {
			k = 0.0;
		}
		if (k > 0.0) {
			vec3 vdir = normalize(p);
			r = reflect(vdir, up);
			float cosv = max(0.0, dot(-vdir, up));
			// Schlick's Fresnel for a varnished surface: faint looking down, strong at a grazing angle
			fres = 0.04 + 0.96 * pow(1.0 - cosv, 5.0);
			// The ray is marched across the screen, not along its length in metres (the web's
			// steps): from here to where it leaves the screen (or 9 m, or the near plane), in even
			// steps on screen with its depth interpolated as 1/z, so a thin post 5 m off is
			// stepped across, not jumped over. Each pixel takes every fourth step.
			if (r.z > 0.0) {
				len = min(len, (-0.1 - p.z) / r.z);
			}
			vec3 e = p + r * len;
			uv_b = project(e, pm);
			iz_a = 1.0 / p.z;
			iz_b = 1.0 / e.z;
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
			// Each pixel of a quad starts its steps a quarter of a step on from the last, and quads
			// next to each other on a 4x4 ordered pattern between those: averaged over the quad,
			// a thin rail reflected far off comes out as a soft streak, not stepped over in bands.
			float step_f = 1.0 / float(STEPS);
			float off = (float(q) + qjit) * 0.25;
			for (int i = 0; i < STEPS; i++) {
				float f = (float(i) + off) * step_f;
				float rz = 1.0 / mix(iz_a, iz_b, f);
				float dz = z_at(mix(uv_a, uv_b, f), size, ip) - rz;
				// passed behind a surface, but not one far in front of the ray (a robot's back
				// standing in front of where the ray goes behind it)
				float prev_z = 1.0 / mix(iz_a, iz_b, max(f - step_f, 0.0));
				if (dz > 0.0 && dz < 0.15 + abs(rz - prev_z) * 1.5) {
					f_hit = f;
					break;
				}
			}
		}
	}
	vec4 refl = vec4(0.0);
	float rw = k > 0.0 ? 1.0 : 0.0;
	if (k > 0.0 && f_hit <= 1.0) {
		// home in on where the ray met it
		float lo = max(0.0, f_hit - 1.0 / float(STEPS));
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
		// how far the ray went, in metres (back along it from its depth)
		float th = abs(r.z) > 1e-4 ? (hz - p.z) / r.z : length(huv - uv0) * len;
		// fade where the trace runs out of screen, rather than cutting off at its edge
		vec2 edge = smoothstep(vec2(0.0), vec2(0.06), huv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - huv);
		float found = edge.x * edge.y * (1.0 - smoothstep(MAX_DIST * 0.6, MAX_DIST, th));
		// gloss blurs with distance: the further the ray travels, the wider its cone
		float lod = clamp(log2(1.0 + rough * th * 8.0) + rough * 2.0 + 1.0, 0.0, 6.0);
		vec3 c = textureLod(screen_tex, huv, lod).rgb;
		c = c.r + c.g + c.b < 1e4 ? min(c, vec3(24.0)) : vec3(0.0);
		refl = vec4(c * found * fres * k, found * k);
	}

	// --- the quad's four results, averaged (each neighbour weighted by how alike its depth is)
	float wt = sky ? 0.0 : 1.0;
	vec4 lw = vec4(bounce, mix(1.0, ao, amounts.x) * mix(1.0, shade, amounts.z * 0.85)) * wt;
	vec4 rf = refl * rw;
	vec4 lw_x = DFDX(lw);
	vec4 rf_x = DFDX(rf);
	float wt_x = DFDX(wt);
	float rw_x = DFDX(rw);
	lw += (lw + lw_x * sgn.x) * sx;
	rf += (rf + rf_x * sgn.x) * sx;
	wt += (wt + wt_x * sgn.x) * sx;
	rw += (rw + rw_x * sgn.x) * sx;
	vec4 lw_y = DFDY(lw);
	vec4 rf_y = DFDY(rf);
	float wt_y = DFDY(wt);
	float rw_y = DFDY(rw);
	lw += (lw + lw_y * sgn.y) * sy;
	rf += (rf + rf_y * sgn.y) * sy;
	wt += (wt + wt_y * sgn.y) * sy;
	rw += (rw + rw_y * sgn.y) * sy;
	vec4 light = wt > 1e-4 ? lw / wt : vec4(0.0, 0.0, 0.0, 1.0);
	vec3 refl_c = rw > 1e-4 ? rf.rgb / rw : vec3(0.0);

	// glowing screens, lamps and LEDs give light rather than take shade (rt.ts RT_COMPOSITE)
	vec3 col = textureLod(screen_tex, uv0, 0.0).rgb;
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	float keep = mix(1.0, light.a, 1.0 - smoothstep(1.2, 3.0, lum));
	vec3 add = light.rgb * amounts.y + refl_c;
	if (sky) {
		keep = 1.0;
		add = vec3(0.0);
	}
	ALBEDO = add;
	ALPHA = 1.0 - keep;
}
