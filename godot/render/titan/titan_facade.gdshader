// The titan city's buildings (titan_city.gd building_mesh): every wall's windows, floors, shops
// and cornices drawn on its box, in metres (UV is in units, 15 m each). Behind each window is a
// room (interior mapping: the view ray meets its walls, floor and ceiling, so the room moves
// with the view as a real one does), lit by the evening through the glass or by its own lamp;
// the glass reflects the sky and catches the low sun. Far off, a wall averages into its own
// colour so the windows never shimmer. Lit by the venue's sun (the titans' shadows fall on it).
//
// UV: (units along the wall from its left edge, height above the street); UV2: (style, seed);
// COLOR: the paint; CUSTOM0: (wall width, building height, storey height, roof kind).
// Styles: 0 classic stone, 1 painted plaster, 2 brick, 3 concrete offices, 4 glass towers,
// 5 harbour sheds; 9 a tiled roof.
shader_type spatial;
render_mode cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

varying vec3 v_world;
varying flat vec4 v_info;
varying flat vec2 v_style;
varying vec3 v_col;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_info = CUSTOM0;
	v_style = UV2;
	v_col = COLOR.rgb;
}

// The room behind a window (after map_facade.gdshaderinc facadeRoom): p where the ray goes
// through the glass in metres from the room's floor at its left wall, rs the room's size, d the
// ray in the facade's frame (x along, y up, z in), rh the room's random number, on its lamp.
vec3 room(vec2 p, vec2 rs, vec3 d, float depth, float rh, float on, vec3 lamp, vec3 day) {
	d.z = max(d.z, 0.06);
	float dx = sign(d.x) * max(abs(d.x), 1e-4), dy = sign(d.y) * max(abs(d.y), 1e-4);
	float tx = ((d.x > 0.0 ? rs.x : 0.0) - p.x) / dx;
	float ty = ((d.y > 0.0 ? rs.y : 0.0) - p.y) / dy;
	float tz = depth / d.z;
	float t = min(min(tx, ty), tz);
	vec3 h = vec3(p, 0.0) + d * t;
	float r1 = fract(rh * 7.13), r2 = fract(rh * 13.7), r3 = fract(rh * 3.31);
	vec3 wall = r1 < 0.4 ? vec3(0.78, 0.74, 0.66) : r1 < 0.7 ? vec3(0.64, 0.67, 0.7) : r1 < 0.9 ? vec3(0.8, 0.68, 0.52) : vec3(0.52, 0.6, 0.52);
	vec3 col;
	if (t == tz) {
		col = wall;
		float fx = h.x / rs.x;
		float low = step(h.y, 0.75 + 0.25 * r2) * step(abs(fx - (0.3 + 0.4 * r3)), 0.18 + 0.2 * r1);
		float tall = step(h.y, 1.95) * step(abs(fx - fract(r3 + 0.45)), 0.07 + 0.06 * r2) * step(0.45, r2);
		float pic = step(abs(h.y - 1.55), 0.28) * step(abs(fx - fract(r1 + 0.3)), 0.1) * step(r3, 0.6);
		col = mix(col, r2 < 0.5 ? vec3(0.22, 0.15, 0.1) : vec3(0.16, 0.17, 0.2), max(low, tall));
		col = mix(col, r1 < 0.5 ? vec3(0.2, 0.32, 0.45) : vec3(0.55, 0.3, 0.2), pic * (1.0 - max(low, tall)));
	} else if (t == ty) {
		col = d.y > 0.0 ? vec3(0.85, 0.84, 0.8) : r3 < 0.5 ? vec3(0.36, 0.24, 0.15) : vec3(0.3, 0.3, 0.33);
	} else {
		col = wall * 0.85;
		col *= 1.0 - 0.45 * step(h.y, 2.1) * step(abs(h.z - depth * 0.6), 0.45) * step(0.5, r2);
	}
	vec3 lc = vec3(rs.x * 0.5, rs.y, depth * 0.45);
	vec3 dl = h - lc;
	float k = 1.0 / (1.0 + 0.16 * dot(dl, dl));
	vec3 c = col * (lamp * on * (0.25 + 1.1 * k) + day * (1.0 - 0.75 * h.z / depth));
	if (t == ty && d.y > 0.0) c += lamp * on * 1.6 * smoothstep(1.0, 0.4, length(dl.xz / vec2(rs.x * 0.3, depth * 0.22)));
	return c;
}

vec3 lamp_col(float h, bool office) {
	if (office) return h < 0.55 ? vec3(0.78, 0.9, 1.0) : h < 0.85 ? vec3(1.0, 0.84, 0.64) : vec3(1.0, 0.68, 0.4);
	return h < 0.6 ? vec3(1.0, 0.66, 0.36) : h < 0.85 ? vec3(1.0, 0.82, 0.6) : vec3(0.5, 0.65, 1.0);
}

float fresnel(float cv, float f0) {
	float m = 1.0 - clamp(cv, 0.0, 1.0);
	float m2 = m * m;
	return f0 + (1.0 - f0) * m2 * m2 * m;
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float style = v_style.x;
	float seed = v_style.y;
	vec3 paint = v_col;
	vec3 albedo = paint;
	float rough = 0.85;
	float metal = 0.0;
	float spec = 0.35;
	vec3 emit = vec3(0.0);
	float dist = length(v_world - cam);
	// a pixel's footprint in metres (for filtering the window grid with distance)
	vec2 uvm = UV * 15.0;
	float fw = max(fwidth(uvm.x), fwidth(uvm.y));

	if (style > 8.5) {
		// a tiled roof: courses of terracotta pantiles running up the slope, mossy and sun-faded
		vec2 q = vec2(UV.x * 15.0 / 0.32, UV.y * 15.0 / 0.42);
		float course = floor(q.y);
		float tile = fract(q.x + course * 0.5);
		float ridge = smoothstep(0.0, 0.5, abs(tile - 0.5));
		float h = t_hash2(vec2(floor(q.x + course * 0.5), course) + seed * 31.0);
		vec3 terra = mix(vec3(0.55, 0.22, 0.12), vec3(0.68, 0.36, 0.2), h) * mix(1.0, 0.75, ridge);
		terra *= 0.8 + 0.2 * smoothstep(0.0, 0.25, fract(q.y));
		float filt = smoothstep(0.15, 0.6, fw / 0.4);
		terra = mix(terra, vec3(0.6, 0.29, 0.16) * 0.88, filt);
		float moss = smoothstep(0.62, 0.8, t_fbm(v_world.xz * 3.0 + seed * 7.0));
		albedo = mix(terra, vec3(0.3, 0.3, 0.2), moss * 0.5);
		rough = 0.8;
	} else if (nw.y > 0.7) {
		// a flat roof: tar and gravel, a parapet round it, the odd skylight and plant
		vec3 roofc = mix(vec3(0.3, 0.29, 0.28), vec3(0.42, 0.4, 0.37), t_noise(v_world.xz * 40.0));
		roofc *= 0.85 + 0.25 * t_fbm(v_world.xz * 6.0 + seed);
		float sk = step(0.86, t_hash2(floor(v_world.xz * 6.0) + seed * 9.0)) * step(0.2, fract(v_world.x * 6.0)) * step(0.2, fract(v_world.z * 6.0));
		albedo = mix(roofc, vec3(0.12, 0.16, 0.2), sk * 0.8);
		rough = mix(0.95, 0.2, sk);
	} else {
		vec3 tw = normalize(cross(nw, vec3(0.0, 1.0, 0.0)));
		float width = v_info.x * 15.0;
		float height = v_info.y * 15.0;
		float um = uvm.x;
		float ym = uvm.y;
		// the bay and storey grid
		float bay = style < 0.5 ? 3.6 : style < 1.5 ? 3.2 : style < 2.5 ? 3.0 : style < 3.5 ? 3.4 : style < 4.5 ? 1.6 : 6.0;
		float gf = style > 3.5 ? 4.5 : 4.5;
		float storey = 3.3;
		float ncols = max(1.0, floor(width / bay));
		float margin = (width - ncols * bay) * 0.5;
		float cu = (um - margin) / bay;
		float col_i = floor(cu);
		float fx = fract(cu);
		bool in_cols = cu >= 0.0 && cu < ncols;
		bool ground = ym < gf;
		float fl = ground ? 0.0 : 1.0 + floor((ym - gf) / storey);
		float fy = ground ? ym / gf : fract((ym - gf) / storey);
		float top = height - ym;
		// the wall itself: plaster or stone or brick, weathered, darker at street level
		float n = t_fbm(vec2(um * 0.35, ym * 0.35) + seed * 50.0);
		vec3 wall = paint * (0.82 + 0.3 * n);
		if (style > 1.5 && style < 2.5) {
			// brick courses
			vec2 bq = vec2(um / 0.23 + floor(ym / 0.075) * 0.5, ym / 0.075);
			float mortar = max(t_band(bq.x, 1.0, 0.08, fwidth(bq.x)), t_band(bq.y, 1.0, 0.13, fwidth(bq.y)));
			wall = mix(wall * (0.85 + 0.3 * t_hash2(floor(bq) + seed)), vec3(0.62, 0.58, 0.52), mortar * 0.6 * (1.0 - smoothstep(0.02, 0.08, fw)));
		} else if (style < 0.5) {
			// dressed stone: courses and joints
			float course = t_band(ym, 0.55, 0.03, fw);
			wall *= 1.0 - course * 0.18;
		}
		// streaks of grime down from every sill, and the street's dirt
		float streak = smoothstep(0.55, 1.0, t_noise(vec2(um * 1.7, ym * 0.08 + seed * 3.0)));
		wall *= 1.0 - streak * 0.12;
		wall *= mix(0.72, 1.0, smoothstep(0.0, 2.5, ym));
		albedo = wall;

		// floor bands and cornices (classic and plaster), the parapet's coping, the slabs of offices
		float band = 0.0;
		if (style < 1.5) {
			band = ground ? 0.0 : t_band(ym - gf, storey, 0.22, fw) * step(gf, ym);
			band = max(band, t_band(ym - gf + 0.05, 1e4, 0.5, fw));
			float cornice = smoothstep(1.2, 0.6, top) * step(0.0, top);
			albedo = mix(albedo, paint * 1.12 + 0.05, max(band * 0.8, cornice));
			// the cornice's shadow below it
			albedo *= 1.0 - 0.35 * smoothstep(1.6, 1.25, top) * smoothstep(0.9, 1.25, top);
		} else if (style > 2.5 && style < 3.5) {
			band = ground ? 0.0 : t_band(ym - gf, storey, 0.9, fw);
			albedo = mix(albedo, paint * 0.9, band * 0.5);
		}

		// the windows (glass: a room behind it), the shops at street level
		float wx0, wx1, wy0, wy1;
		if (ground) {
			wx0 = 0.07; wx1 = 0.93; wy0 = 0.06; wy1 = 0.72;
		} else if (style < 0.5) {
			wx0 = 0.3; wx1 = 0.7; wy0 = 0.22; wy1 = 0.86;
		} else if (style < 1.5) {
			wx0 = 0.27; wx1 = 0.73; wy0 = 0.2; wy1 = 0.82;
		} else if (style < 2.5) {
			wx0 = 0.24; wx1 = 0.76; wy0 = 0.25; wy1 = 0.8;
		} else if (style < 3.5) {
			wx0 = 0.03; wx1 = 0.97; wy0 = 0.32; wy1 = 0.88;
		} else if (style < 4.5) {
			wx0 = 0.02; wx1 = 0.98; wy0 = 0.08; wy1 = 0.97;
		} else {
			wx0 = 0.15; wx1 = 0.85; wy0 = 0.55; wy1 = 0.8;
		}
		bool parapet = top < (style > 3.5 && style < 4.5 ? 0.6 : 1.1);
		// the inner edges of the opening, in metres across and up
		float ex = min(fx - wx0, wx1 - fx) * bay;
		float hgt = ground ? gf : storey;
		float ey = min(fy - wy0, wy1 - fy) * hgt;
		float win = in_cols && !parapet ? smoothstep(-fw * 0.6, fw * 0.6, min(ex, ey)) : 0.0;
		// a few shuttered windows on the old buildings, and the sheds' blind upper walls
		float rid = t_hash2(vec2(col_i, fl) + seed * 71.0);
		if (style < 1.5 && !ground && rid < 0.18) win *= 0.0;
		// far off: what the grid averages to, not one sample of it
		float far_k = smoothstep(0.25, 0.9, fw / (bay * min(wx1 - wx0, 0.6)));
		float cover = (wx1 - wx0) * (wy1 - wy0) * (style < 1.5 ? 0.82 : 1.0);
		if (win > 0.001 || far_k > 0.001) {
			vec3 d = normalize(v_world - cam);
			vec3 df = vec3(dot(d, tw), d.y, -dot(d, nw));
			bool office = style > 2.5 && style < 4.5;
			float share = office ? 0.42 : ground ? 0.75 : 0.3;
			vec2 rid2 = vec2(col_i, fl) + seed * 113.0;
			float rh = t_hash2(rid2);
			float on = step(t_hash2(rid2 * 1.37 + 4.1), share);
			vec3 lamp = lamp_col(fract(rh * 9.7), office) * (ground ? 1.4 : 1.0);
			// the evening light that comes in through the window: from the sky, more on the sunny side
			float sunny = max(dot(nw, T_SUN_DIR), 0.0);
			vec3 day = T_SKY_SIDE * 0.35 + T_SUN_COL * sunny * 0.06;
			vec2 rp = vec2((fx - wx0) * bay, (fy - wy0) * hgt + 0.9);
			vec2 rs = vec2((wx1 - wx0) * bay, hgt);
			vec3 inside = room(rp, max(rs, vec2(1.0, 2.6)), df, ground ? 6.0 : 4.5, rh, on, lamp, day);
			// the glass: a sky reflection by the view's angle, each pane a hair out of plane
			float cv = max(-dot(d, nw), 0.0);
			float f = fresnel(cv, style > 3.5 && style < 4.5 ? 0.12 : 0.05);
			vec3 r = reflect(d, normalize(nw + tw * (rh - 0.5) * 0.04));
			vec3 sky = t_sky(r);
			// (the city across the street fills the lower half of a reflection)
			sky = mix(vec3(0.16, 0.14, 0.14), sky, smoothstep(-0.12, 0.06, r.y));
			vec3 glass = inside * (1.0 - f) * (style > 3.5 && style < 4.5 ? 0.6 : 1.0) + sky * f * 0.85;
			// the averaged far wall: windows as a share of it, a share of them lit
			vec3 avg_glass = mix(sky * 0.12 + day * 0.2, lamp * 0.55, share * 0.8);
			vec3 frame_c = style < 1.5 ? vec3(0.85, 0.82, 0.76) : style < 2.5 ? vec3(0.2, 0.2, 0.2) : vec3(0.25, 0.27, 0.3);
			// the frame round the glass and a glazing bar across it
			float frame = 1.0 - smoothstep(0.04, 0.1, min(ex, ey));
			float bar = style < 2.5 && !ground ? t_band(fx, 1.0, 0.03 / (wx1 - wx0), fwidth(fx)) * step(abs(fx - 0.5), 0.01 + fw) : 0.0;
			float fr = max(frame, bar) * (1.0 - far_k);
			// near: the window itself; far: the average
			vec3 near_e = glass * (1.0 - fr);
			vec3 far_e = avg_glass * cover;
			emit = mix(near_e * win, far_e, far_k);
			albedo = mix(mix(albedo, frame_c, fr * win), mix(albedo * (1.0 - cover), albedo, 0.0), far_k * 0.0);
			albedo = mix(albedo, albedo * (1.0 - cover * 0.85), far_k);
			albedo = mix(albedo, vec3(0.02), win * (1.0 - fr) * (1.0 - far_k));
			rough = mix(rough, 0.12, win * (1.0 - fr) * (1.0 - far_k));
			spec = mix(spec, 0.65, win * (1.0 - fr) * (1.0 - far_k));
			// the shopfronts' awnings over the street
			if (ground && style < 2.5 && in_cols) {
				float awn = step(0.74, fy) * step(fy, 0.86) * step(0.05, fx) * step(fx, 0.95) * step(0.45, rid);
				vec3 ac = rid < 0.65 ? vec3(0.45, 0.08, 0.07) : rid < 0.8 ? vec3(0.08, 0.25, 0.18) : vec3(0.85, 0.8, 0.7);
				albedo = mix(albedo, ac * (0.8 + 0.2 * step(0.5, fract(fx * 10.0))), awn * (1.0 - far_k));
				emit *= 1.0 - awn;
			}
		}
		// glass towers: the curtain wall's spandrels and mullions
		if (style > 3.5 && style < 4.5) {
			float slab = 1.0 - smoothstep(0.0, 0.05 + fw * 0.02, abs(fract((ym - gf) / storey) - 0.03) * storey - 0.25);
			albedo = mix(albedo, paint * 0.6, slab);
			emit *= 1.0 - slab * 0.9;
			metal = 0.0;
		}
		// the parapet's coping
		if (top < 0.18) albedo = mix(albedo, vec3(0.75, 0.73, 0.7), 0.6);
	}

	ALBEDO = albedo;
	ROUGHNESS = rough;
	METALLIC = metal;
	SPECULAR = spec;
	EMISSION = emit;
	FOG = t_haze(v_world, cam);
}
