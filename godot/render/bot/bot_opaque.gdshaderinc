// Robot plating: rigidly skinned on the GPU (one bone per corner, see bot_model.gd), colour,
// metalness and roughness per material key from the robot's paint (web: skin.ts + bake.ts
// vertexPBR), with the battle damage (damageLook.ts patchDamage), the fine surface finish
// (surfaceDetail.ts) and the contact occlusion near the robots (ao.ts, botModel.ts options).
//
// Built two ways. With SKIN_FIXED defined (BotModel.opaque_shader: "shader_type spatial;",
// "#define SKIN_FIXED <kind>", then this file) it draws that one skin and nothing of the other
// eighteen, and with SKIN_FIXED 0 (the plain paint, most robots) no skin code at all: a phone
// pays for the registers of every branch a shader has, taken or not. Without it
// (render/bot_opaque.gdshader) the skins are picked while it runs, two at once while one paints
// on over the other (BotModel.paint_on).
#ifndef SKIN_FIXED
#define SKINNED
#define SKIN_SWEEP
#else
#if SKIN_FIXED != 0
#define SKINNED
#endif
#endif

#include "res://render/bot/bot_damage.gdshaderinc"
#include "res://render/ao/contact_ao.gdshaderinc"
#ifdef SKINNED
#include "res://render/skins/skin.gdshaderinc"
#endif

// 31 bones, three rows each: the bone's turn and scale in .xyz, its place in .w
uniform vec4 bones[93];
// per material key: linear colour and metalness, then roughness
uniform vec4 surf[12];
uniform float rough[12];
uniform float time = 0.0;
// marks in a bone's own frame: xyz centre, w radius
uniform vec4 marks[12];
// per mark: the bone it sits on, its kind (0 none, 1 a torn-off part's socket, 2 oil), its strength
uniform vec3 mark_b[12];
// marks in use: slots below this (the first four are the sockets, the rest oil)
uniform int mark_count = 0;
// the contact occlusion's spheres that can reach each bone (bot_model.gd ao_lists): bone b's
// are list entries (ao_at[b] & 1023) on, (ao_at[b] >> 10) of them; off: every sphere, as before.
// The list packs four sphere numbers to an int, a byte each (std140 pads an int array to 16
// bytes an element: packed, 768 entries take 768 bytes)
uniform bool ao_listed = false;
uniform ivec4 ao_pack[48];
uniform int ao_at[31];
// oily grime over the whole robot, 0..1
uniform float grime = 0.0;
// brushed grain, patchy sheen and a faint ripple in the plating (the web's high quality only;
// Settings sets it with the graphics quality)
global uniform bool bb_surface_detail;
#ifdef SKINNED
// the skin over the plating (render/skins/skins.gd apply): four linear colours each (0-3, then
// 4-7, the one being painted over) and their numbers
uniform vec4 skin_c[8];
uniform vec4 skin_p[2];
#endif
#ifdef SKIN_SWEEP
// the skins' kinds: x the one worn, y the one it is replacing while skin_wipe sweeps up the robot
uniform ivec2 skin_kind = ivec2(0);
// the model-space height of the new skin's edge as it paints on (the old one above it), and the
// line of light along it; 100: no sweep
uniform float skin_wipe = 100.0;
uniform vec3 skin_band = vec3(0.0);
#define SKIN_A skin_kind.x
#else
#define SKIN_A SKIN_FIXED
#endif

varying flat float v_key;
varying vec3 v_dmg_p;
varying float v_wear;
varying flat float v_bone;
varying float v_dent;
// the contact occlusion, worked out per corner: it changes over the spheres' size, which the
// finely split plating follows closely, and a corner is far cheaper than every pixel it covers
varying float v_ao;
#ifdef SKINNED
// the plating's rest-space normal (the skins' box mapping)
varying vec3 v_rn;
#endif
#ifdef SKIN_SWEEP
// the model-space height (the sweep)
varying float v_my;
#endif

void vertex() {
	int code = int(CUSTOM1.x + 0.5);
	int b = code & 31;
	vec3 dp;
	float db;
	dmg_rest(VERTEX, b, dp, db);
	float w = wear[(code >> 5) & 15];
	// the metal around a torn-off part's socket is wrenched and wrecked (sockets: the first slots)
	for (int k = 0; k < min(mark_count, 4); k++) {
		if (mark_b[k].y == 1.0 && abs(mark_b[k].x - db) < 0.5)
			w = max(w, mark_b[k].z * (1.0 - smoothstep(marks[k].w * 0.35, marks[k].w, distance(dp, marks[k].xyz))));
	}
	float cav = 0.0;
	vec3 n = NORMAL;
#ifdef SKINNED
	v_rn = NORMAL;
#endif
	vec3 d;
	if (IN_SHADOW_PASS) {
		// the shadow map only needs where the bent plating is: no normals' Jacobian, no dings,
		// no occlusion (the light's normal bias is far coarser than any of them)
		d = dmg_deform(dp, db, w, cav);
	} else {
		mat3 J = mat3(0.0);
		d = dmg_deform_j(dp, db, w, cav, J);
		if (w > 0.01 || dot(d, d) > 0.0) {
			// the bent surface's true normal: the inverse transpose of the bend's Jacobian, applied
			// through its cofactors
			vec3 c0 = vec3(1.0, 0.0, 0.0) + J[0];
			vec3 c1 = vec3(0.0, 1.0, 0.0) + J[1];
			vec3 c2 = vec3(0.0, 0.0, 1.0) + J[2];
			n = normalize(cross(c1, c2) * n.x + cross(c2, c0) * n.y + cross(c0, c1) * n.z);
			if (w > 0.01) {
				// and a worn shell is covered in small dings that catch the light
				float vis = 1.0 - (1.0 - w) * (1.0 - w);
				vec3 r = dp * 31.0;
				vec3 small = vec3(dmg_noise(r + 5.1), dmg_noise(r + 23.9), dmg_noise(r + 61.3)) - 0.5;
				n = normalize(n + small * (vis * 0.9 + smoothstep(0.45, 1.0, w) * 0.7));
			}
		}
	}
	v_dmg_p = dp;
	v_wear = w;
	v_bone = db;
	v_dent = cav;
	vec4 r0 = bones[b * 3];
	vec4 r1 = bones[b * 3 + 1];
	vec4 r2 = bones[b * 3 + 2];
	vec4 v = vec4(VERTEX + d, 1.0);
	VERTEX = vec3(dot(r0, v), dot(r1, v), dot(r2, v));
	NORMAL = normalize(vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n)));
	v_key = CUSTOM0.x;
#ifdef SKIN_SWEEP
	v_my = VERTEX.y;
#endif
	// limbs, torsos and the opponent shade each other; legs and feet darken towards the canvas
	v_ao = 1.0;
	if (!IN_SHADOW_PASS) {
		vec3 world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		vec3 nw = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
		float occ = 1.0;
		if (ao_listed) {
			int at = ao_at[b];
			int end = (at & 1023) + (at >> 10);
			for (int j = at & 1023; j < end; j++) {
				int k = (ao_pack[j >> 4][(j >> 2) & 3] >> ((j & 3) * 8)) & 255;
				occ *= ao_sphere(ao_sphere_at(k), world, nw, 1.8);
			}
		} else {
			occ = ao_spheres(world, nw, 1.8);
		}
		v_ao = occ * ao_ground(world, nw, 0.0, 0.5, 0.5);
	}
}

void fragment() {
	int key = int(v_key + 0.5);
	vec3 albedo = surf[key].rgb;
	float metal = surf[key].a;
	float rgh = rough[key];
	vec3 nrm = NORMAL;
	vec3 emit = vec3(0.0);
	// the skin: patterned over both platings, chipped, burnt and torn away with the paint below
	vec3 skin_emit = vec3(0.0);
	float paint_k = 1.0;
#ifdef SKINNED
#ifdef SKIN_SWEEP
	if (skin_kind.x != 0 || skin_kind.y != 0)
#endif
	{
		float is_paint = key <= 1 ? 1.0 : 0.0;
		float sec = key == 1 ? 1.0 : 0.0;
		vec3 nw = normalize((INV_VIEW_MATRIX * vec4(nrm, 0.0)).xyz);
		vec3 vw = normalize((INV_VIEW_MATRIX * vec4(VIEW, 0.0)).xyz);
		vec3 rn = normalize(v_rn);
		// each bone's plating starts the pattern somewhere else, so no two parts match
		vec3 sp = v_dmg_p + v_bone * vec3(1.37, 2.71, 0.93);
		SkinOut base = SkinOut(albedo, metal, rgh, vec3(0.0), 0.0);
		SkinOut a = skin_eval(SKIN_A, skin_c[0], skin_c[1], skin_c[2], skin_c[3], skin_p[0], sp, rn, nw, vw, time, sec, base);
#ifdef SKIN_SWEEP
		if (skin_wipe < 50.0) {
			SkinOut b = skin_eval(skin_kind.y, skin_c[4], skin_c[5], skin_c[6], skin_c[7], skin_p[1], sp, rn, nw, vw, time, sec, base);
			float above = step(skin_wipe, v_my);
			a.albedo = mix(a.albedo, b.albedo, above);
			a.metal = mix(a.metal, b.metal, above);
			a.rough = mix(a.rough, b.rough, above);
			a.emit = mix(a.emit, b.emit, above);
			a.h = mix(a.h, b.h, above);
		}
#endif
		albedo = mix(albedo, a.albedo, is_paint);
		metal = mix(metal, a.metal, is_paint);
		rgh = mix(rgh, a.rough, is_paint);
		skin_emit = a.emit * is_paint;
#if SK_ONLY < 0 || SK_ONLY == 6 || SK_ONLY == 8 || SK_ONLY == 10 || SK_ONLY == 11 || SK_ONLY == 12 || SK_ONLY == 13 || SK_ONLY == 15 || SK_ONLY == 19
		// the pattern's relief, from the screen-space slope of its height (the kinds that have one)
		float hgt = a.h * is_paint * 0.004;
		vec3 kdx = dFdx(VERTEX);
		vec3 kdy = dFdy(VERTEX);
		vec3 k1 = cross(kdy, nrm);
		vec3 k2 = cross(nrm, kdx);
		float kdet = dot(kdx, k1);
		vec3 kgrad = sign(kdet) * (dFdx(hgt) * k1 + dFdy(hgt) * k2);
		if (abs(kdet) > 0.0) nrm = normalize(abs(kdet) * nrm - kgrad);
#endif
	}
#endif
#ifdef SKIN_SWEEP
	if (skin_wipe < 50.0) {
		// the line of light the new skin paints on behind
		float d = abs(v_my - skin_wipe);
		emit += skin_band * (exp(-d * 60.0) * 3.0 + exp(-d * 9.0) * 0.35);
	}
#endif
	if (bb_surface_detail) {
		// surfaceDetail.ts: how much of the part one pixel covers; the fine finish fades past ~1 cm
		float fine = 1.0 - smoothstep(0.004, 0.014, length(fwidth(v_dmg_p)));
		// an uneven sheen: polished in places, dulled by handling in others
		float sheen = dmg_noise(v_dmg_p * 5.0 + 7.3) * 0.7 + dmg_noise(v_dmg_p * 19.0 + 1.7) * 0.3;
		rgh *= 0.8 + sheen * 0.4;
		// bare metal is brushed in fine streaks along the part
		float grain = dmg_noise(vec3(v_dmg_p.x * 7.0, v_dmg_p.y * 260.0, v_dmg_p.z * 7.0));
		rgh *= mix(1.0, 0.72 + grain * 0.56, metal * fine);
		rgh = clamp(rgh, 0.045, 1.0);
		// a faint hammered ripple (a bump from the screen-space slope of a height)
		float h = dmg_noise(v_dmg_p * 150.0) * 0.55 + dmg_noise(v_dmg_p * 41.0) * 0.45;
		vec3 sdx = dFdx(VERTEX);
		vec3 sdy = dFdy(VERTEX);
		vec3 q1 = cross(sdy, nrm);
		vec3 q2 = cross(nrm, sdx);
		float det = dot(sdx, q1);
		vec3 grad = sign(det) * (dFdx(h) * q1 + dFdy(h) * q2) * 0.0009 * fine;
		if (abs(det) > 0.0) nrm = normalize(abs(det) * nrm - grad);
	}
	float sock_w = 0.0;
	float oil = 0.0;
	for (int k = 0; k < mark_count; k++) {
		float kind = mark_b[k].y;
		if (kind == 0.0 || abs(mark_b[k].x - v_bone) > 0.5) continue;
		vec3 q = v_dmg_p - marks[k].xyz;
		float r = marks[k].w;
		if (kind == 1.0) {
			sock_w = max(sock_w, mark_b[k].z * (1.0 - smoothstep(r * 0.35, r, length(q) + (dmg_noise(v_dmg_p * 9.0) - 0.5) * r * 0.5)));
		} else {
			// oil runs down the part in streaks below where it hit
			float lane = dmg_noise(vec3(v_dmg_p.x * 26.0, 0.0, v_dmg_p.z * 26.0) + float(k) * 7.1);
			q.y = q.y < 0.0 ? q.y * mix(0.85, 0.22, smoothstep(0.35, 0.75, lane)) : q.y;
			float dd = length(q) / r + (dmg_noise(v_dmg_p * 13.0 + float(k) * 3.3) - 0.5) * 0.55;
			float blob = 1.0 - smoothstep(0.7, 0.95, dd);
			// a fine spatter of droplets round each splash
			float spat = smoothstep(0.78, 0.84, dmg_noise(v_dmg_p * 46.0 + float(k) * 11.0)) * (1.0 - smoothstep(1.0, 1.9, dd));
			oil = max(oil, max(blob, spat) * mark_b[k].z);
		}
	}
	if (v_dent > 0.02) {
		// a dent's floor sits in its own shade, and the paint there cracks and flakes off,
		// leaving scraped steel where the blow bit hardest
		float flake = dmg_noise(v_dmg_p * 38.0 + 2.9) * 0.6 + dmg_noise(v_dmg_p * 90.0) * 0.4;
		float bare = smoothstep(0.55, 0.62, v_dent * 0.75 + flake * 0.5);
		albedo *= 1.0 - v_dent * 0.28;
		albedo = mix(albedo, vec3(0.3, 0.31, 0.33) * (0.75 + flake * 0.5), bare);
		paint_k *= 1.0 - bare;
		metal = mix(metal, 0.95, bare);
		rgh = mix(rgh, 0.32 + flake * 0.3, bare);
		// and a rim of crazed paint round the bare patch
		float craze = smoothstep(0.42, 0.5, v_dent * 0.75 + flake * 0.5) * (1.0 - bare);
		albedo *= 1.0 - craze * smoothstep(0.55, 0.75, dmg_noise(v_dmg_p * 140.0)) * 0.6;
	}
	if (v_wear > 0.01 || sock_w > 0.01) {
		float w = max(v_wear, sock_w);
		float vis = 1.0 - (1.0 - w) * (1.0 - w);
		float heavy = smoothstep(0.45, 1.0, w);
		// damage gathers in a few hot spots (where the blows landed) and spreads from them
		float spot = dmg_noise(v_dmg_p * 3.4 + 1.3);
		float edge = dmg_noise(v_dmg_p * 22.0) * 0.6 + dmg_noise(v_dmg_p * 45.0) * 0.4;
		float spread = spot * 0.74 + edge * 0.26;
		// grime and scuffing over the whole part
		albedo *= 1.0 - vis * 0.25 * (0.4 + edge);
		// paint chips off to bare, scuffed steel, ragged at the edges
		float chip = smoothstep(0.58 - vis * 0.22, 0.63 - vis * 0.22, spread);
		albedo = mix(albedo, vec3(0.27, 0.28, 0.3) * (0.7 + edge * 0.5), chip);
		paint_k *= 1.0 - chip;
		metal = mix(metal, 0.95, chip);
		rgh = mix(rgh, 0.4 + edge * 0.3, chip);
		// soot and scorch bloom out of the worst spots
		float s_t = 0.66 - vis * 0.18 - heavy * 0.12;
		float scorch = smoothstep(s_t, s_t + 0.06, spot * 0.85 + edge * 0.2) * (0.35 + vis * 0.65);
		albedo *= mix(1.0, 0.1, scorch);
		paint_k *= 1.0 - scorch * 0.8;
		rgh = mix(rgh, 0.85, scorch);
		// a wrecked part's plating tears open onto dark, burnt innards
		float h_t = 0.68 - heavy * 0.26;
		float hole = smoothstep(h_t, h_t + 0.02, spread) * step(0.02, heavy);
		albedo = mix(albedo, vec3(0.03, 0.026, 0.024), hole);
		paint_k *= 1.0 - hole;
		metal = mix(metal, 0.5, hole);
		rgh = mix(rgh, 0.9, hole);
		// split plates crack along glowing seams (only in the ring round torn holes, so they read
		// as hot split edges), and the innards smoulder
		float ridge = 1.0 - abs(dmg_noise(v_dmg_p * 26.0 + 9.0) * 2.0 - 1.0);
		float crack = smoothstep(0.93, 0.98, ridge) * smoothstep(0.55, 0.9, w) * smoothstep(h_t - 0.05, h_t, spread) * (1.0 - hole);
		float flick = 0.65 + 0.35 * sin(time * 23.0 + v_dmg_p.y * 40.0) * sin(time * 7.0 + v_dmg_p.x * 30.0);
		float ember = smoothstep(h_t + 0.04, h_t + 0.1, spread) * smoothstep(0.45, 0.8, dmg_noise(v_dmg_p * 18.0 + 4.2)) * heavy;
		emit += vec3(1.0, 0.32, 0.06) * (crack * 1.3 + ember * 0.5) * flick;
	}
	// oily grime: big dull smudges over the whole robot, worst low down
	if (grime > 0.01) {
		float smudge = dmg_noise(v_dmg_p * 4.3 + 2.1) * 0.7 + dmg_noise(v_dmg_p * 17.0) * 0.3;
		float g = smoothstep(0.72 - grime * 0.4, 0.82 - grime * 0.4, smudge) * grime;
		albedo *= 1.0 - g * 0.7;
		oil = max(oil, g * 0.45);
	}
	// motor oil: near-black, wet and glossy, with a thin-film rainbow sheen
	if (oil > 0.01) {
		float graze = 1.0 - abs(dot(VIEW, nrm));
		albedo = mix(albedo, vec3(0.01, 0.0095, 0.009), oil * 0.94);
		rgh = mix(rgh, 0.06, oil);
		metal = mix(metal, 0.15, oil);
		float swirl = dmg_noise(v_dmg_p * 7.0 + 5.0) * 1.4 + graze * 1.8;
		vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + swirl));
		emit += film * (0.012 + graze * graze * 0.06) * oil;
	}
	emit += skin_emit * paint_k * (1.0 - oil * 0.9);
	ALBEDO = albedo;
	METALLIC = metal;
	ROUGHNESS = rgh;
	EMISSION = emit;
	NORMAL = nrm;
	AO = v_ao;
	AO_LIGHT_AFFECT = 0.6;
}
