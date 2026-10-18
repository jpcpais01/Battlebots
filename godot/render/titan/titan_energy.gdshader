// The deck's ropes, as beams of energy strung between the pylons (titan_build.gd ropes()), bowed
// by the same rope physics as the indoor ring's (arena.gd uploads `rope`): pressed into a V by a
// titan leaning on them, swinging free after a slam. They glow brighter where they're pressed
// and flare with the crowd. CUSTOM0 = (rope, t post to post, across -1..1, ribbon), UV2 = outward.
shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, shadows_disabled, fog_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

// The corners' colours (linear): the beams run from one side's colour to the other's.
uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
uniform vec4 rope[24];
uniform float flare = 0.0;

varying float v_t;
varying float v_across;
varying float v_press;
varying float v_x;

float rope_bow(vec4 rp, float t) {
	float s = clamp(rp.x, 0.08, 0.92);
	float vee = t < s ? t / s : (1.0 - t) / (1.0 - s);
	return rp.y * mix(vee, sin(3.14159265 * t), rp.z);
}

void vertex() {
	int k = int(CUSTOM0.x + 0.5);
	float t = CUSTOM0.y;
	float bow = rope_bow(rope[k], t);
	VERTEX.xz += UV2 * bow;
	v_t = t;
	v_x = (MODEL_MATRIX * vec4(VERTEX, 1.0)).x;
	v_across = CUSTOM0.z;
	v_press = clamp(rope[k].y * 4.0, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.25, abs(t - rope[k].x)));
}

void fragment() {
	float core = exp(-v_across * v_across * 14.0);
	float halo = exp(-v_across * v_across * 3.0) * 0.3;
	float t = bb_time;
	// energy racing along the beam in pulses
	float pulse = 0.7 + 0.3 * sin(v_t * 40.0 - t * 9.0) * sin(v_t * 13.0 + t * 3.0);
	float race = smoothstep(0.85, 1.0, sin(v_t * 18.0 - t * 6.0 + v_x)) * 0.6;
	// near the pylons the beam is fiercest, where it leaves the emitters
	float ends = 1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.06, min(v_t, 1.0 - v_t)));
	float k = (core * 1.1 + halo) * (pulse + race) * ends * (0.8 + 0.5 * bb_hype + flare * 1.5 + v_press * 3.0);
	vec3 col = mix(team1, team0, smoothstep(-2.5, 2.5, v_x));
	vec3 c = mix(col, vec3(1.0, 0.95, 0.9), core * core * 0.25 + v_press * 0.5) * k;
	ALBEDO = c;
}
