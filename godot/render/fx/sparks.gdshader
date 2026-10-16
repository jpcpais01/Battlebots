// Hot metal sparks as motion-blurred streaks (sparks.ts). Each spark is one quad that is
// stretched on screen from where the spark is back along its velocity: a fast spark reads as a
// line, a slow one as a dot. White hot, cooling through its tint to a dull ember; it skips and
// skids on the deck (sparks.ts update, solved in closed form here: see fx_common).
//
// Instance (FxSparks.emit): origin = spawn point, basis x = velocity,
// basis y = (spawn time, life, width), basis z = (drag, gravity, seed); COLOR = tint.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
#include "res://render/fx/fx_common.gdshaderinc"

uniform float now;
uniform float streak = 0.028;
uniform float glow = 4.0;

varying vec3 v_c;
varying vec2 v_uv;
varying float v_heat;

void vertex() {
	vec3 p = MODEL_MATRIX[3].xyz;
	vec3 v = MODEL_MATRIX[0].xyz;
	float t0 = MODEL_MATRIX[1].x;
	float life = MODEL_MATRIX[1].y;
	float width = MODEL_MATRIX[1].z;
	float drag = MODEL_MATRIX[2].x;
	float grav = MODEL_MATRIX[2].y;
	float seed = MODEL_MATRIX[2].z;
	float tau = now - t0;
	// life left at the start of the current hop
	float L = life;
	bool dead = width <= 0.0 || tau < 0.0 || tau >= life;
	float g0 = fx_ground(p.xz) + 0.01;
	if (p.y < g0) {
		p.y = g0;
	}
	// hits the deck: a low skipping bounce (20-45% of its fall), it skids on at 70%, and loses
	// 15% of the life it has left
	for (int b = 0; b < 4 && !dead; b++) {
		float te = min(tau, L);
		vec2 xz = p.xz + v.xz * fx_carry(drag, te);
		float y = fx_y(p.y, v.y, drag, grav, te);
		if (y >= fx_ground(xz) + 0.01) {
			dead = tau >= L;
			break;
		}
		float lo = 0.0;
		float hi = te;
		for (int s = 0; s < 10; s++) {
			float mid = 0.5 * (lo + hi);
			vec2 mxz = p.xz + v.xz * fx_carry(drag, mid);
			if (fx_y(p.y, v.y, drag, grav, mid) < fx_ground(mxz) + 0.01) {
				hi = mid;
			} else {
				lo = mid;
			}
		}
		float th = hi;
		float e = exp(-drag * th);
		vec2 hxz = p.xz + v.xz * fx_carry(drag, th);
		float vy = fx_vy(v.y, drag, grav, th);
		float r = 0.2 + fx_hash(seed + float(b) * 7.31) * 0.25;
		p = vec3(hxz.x, fx_ground(hxz) + 0.01, hxz.y);
		v = vec3(v.x * e * 0.7, vy < 0.0 ? -vy * r : vy, v.z * e * 0.7);
		L = (L - th) * 0.85;
		tau -= th;
		dead = tau >= L;
	}
	float e = exp(-drag * tau);
	vec3 pos = vec3(p.x + v.x * fx_carry(drag, tau), fx_y(p.y, v.y, drag, grav, tau), p.z + v.z * fx_carry(drag, tau));
	pos.y = max(pos.y, fx_ground(pos.xz) + 0.01);
	vec3 vel = vec3(v.x * e, fx_vy(v.y, drag, grav, tau), v.z * e);
	v_heat = max(0.0, (L - tau) / life);
	v_c = COLOR.rgb;
	v_uv = VERTEX.xy;
	vec4 mh = VIEW_MATRIX * vec4(pos, 1.0);
	if (dead || mh.z > -0.06) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		vec3 vv = (VIEW_MATRIX * vec4(vel, 0.0)).xyz;
		vec4 mt = vec4(mh.xyz - vv * streak, 1.0);
		mt.z = min(mt.z, -0.06);
		vec4 ch = PROJECTION_MATRIX * mh;
		vec4 ct = PROJECTION_MATRIX * mt;
		vec2 hv = VIEWPORT_SIZE * 0.5;
		vec2 sh = ch.xy / ch.w * hv;
		vec2 st = ct.xy / ct.w * hv;
		vec2 d = sh - st;
		float len = length(d);
		vec2 dir = len > 1e-3 ? d / len : vec2(0.0, 1.0);
		vec2 perp = vec2(-dir.y, dir.x);
		// never thinner than a pixel and a bit, or it shimmers in and out
		float w = max(1.3, width * PROJECTION_MATRIX[1][1] * hv.y / -mh.z);
		vec2 px = mix(sh, st, VERTEX.y) + dir * w * 0.5 * (1.0 - 2.0 * VERTEX.y) + perp * w * 0.5 * VERTEX.x;
		float cw = mix(ch.w, ct.w, VERTEX.y);
		float cz = mix(ch.z / ch.w, ct.z / ct.w, VERTEX.y);
		POSITION = vec4(px / hv * cw, cz * cw, cw);
	}
}

void fragment() {
	float across = 1.0 - v_uv.x * v_uv.x;
	float a = across * mix(1.0, 0.12, v_uv.y) * smoothstep(0.0, 0.18, v_heat);
	if (a < 0.01) {
		discard;
	}
	// white hot, then the spark's own colour, then a dull red ember
	vec3 c = v_heat > 0.55 ? mix(v_c, vec3(1.0, 0.96, 0.88), (v_heat - 0.55) / 0.45) : mix(vec3(0.85, 0.16, 0.03), v_c, v_heat / 0.55);
	ALBEDO = c * glow * (0.45 + 0.9 * v_heat) * a;
	ALPHA = a;
}
