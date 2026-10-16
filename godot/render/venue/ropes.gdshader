// Ring ropes (arena.ts buildRopes): armoured cables with a neon core, bowed in the vertex shader
// by the rope physics in arena.gd; the straps follow the ropes they are tied to.
// CUSTOM0 aRope (first rope of the side), CUSTOM1 aH (height 0..2), CUSTOM2 aKind (0 rope, 1 strap),
// CUSTOM3 aT (0..1 post to post), UV2 aOut (outward xz).
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"

uniform vec3 color = vec3(0.084, 0.79, 1.15);
uniform vec4 rope[24];

varying float v_t;
varying float v_kind;

// pressed: straight lines from each post to the contact (a V); free: a swinging arc
float rope_bow(vec4 rp, float t) {
	float s = clamp(rp.x, 0.08, 0.92);
	float vee = t < s ? t / s : (1.0 - t) / (1.0 - s);
	return rp.y * mix(vee, sin(3.14159265 * t), rp.z);
}

void vertex() {
	float fh = clamp(CUSTOM1.x, 0.0, 2.0);
	float i0 = min(floor(fh), 1.0);
	int k0 = int(CUSTOM0.x + i0 + 0.5);
	float t = CUSTOM3.x;
	VERTEX.xz += UV2 * mix(rope_bow(rope[k0], t), rope_bow(rope[k0 + 1], t), fh - i0);
	v_t = t;
	v_kind = CUSTOM2.x;
}

void fragment() {
	float rf = abs(dot(normalize(NORMAL), normalize(VIEW)));
	vec3 c;
	if (v_kind < 0.5) {
		// a dark sleeve round a neon core, with light rippling along it
		float core = smoothstep(0.35, 0.9, rf);
		float ripple = 0.5 + 0.5 * sin(v_t * 18.85 - bb_time * 3.0);
		vec3 lit = color * (0.85 + 0.35 * bb_hype * ripple);
		c = mix(vec3(0.03, 0.035, 0.045) + color * 0.05, lit, core);
	} else {
		c = vec3(0.55, 0.57, 0.62) * (0.25 + 0.6 * rf);
	}
	ALBEDO = c;
	FOG = bb_fog(VERTEX);
}
