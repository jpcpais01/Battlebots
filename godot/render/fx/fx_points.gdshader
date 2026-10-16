// Fx's glowing particles (fx.ts `points`: burst, dust, siphon motes): additive camera-facing
// sprites of the soft glow gradient, sized like the web's points (size * height/2 / depth px),
// fading with the life they have left and bouncing off the deck at 0.02 m.
//
// Instance (Fx._emit): origin = spawn point, basis x = velocity, basis y = (spawn time, life,
// size), basis z = (drag, gravity); COLOR = colour.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
#include "res://render/fx/fx_common.gdshaderinc"

uniform float now;

varying vec3 v_c;
varying float v_a;
varying vec2 v_uv;

void vertex() {
	vec3 v = MODEL_MATRIX[0].xyz;
	float t0 = MODEL_MATRIX[1].x;
	float life = MODEL_MATRIX[1].y;
	float size = MODEL_MATRIX[1].z;
	float tau = now - t0;
	vec3 pos = fx_fly(MODEL_MATRIX[3].xyz, v, MODEL_MATRIX[2].x, MODEL_MATRIX[2].y, tau, 0.02, 0.3, 1.0);
	v_c = COLOR.rgb;
	v_a = clamp(1.0 - tau / life, 0.0, 1.0);
	v_uv = VERTEX.xy * 2.0;
	vec4 mv = VIEW_MATRIX * vec4(pos, 1.0);
	mv.xy += VERTEX.xy * size / PROJECTION_MATRIX[1][1];
	POSITION = (tau < 0.0 || tau >= life || size <= 0.0) ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * mv;
}

void fragment() {
	float a = fx_glow(length(v_uv)) * v_a;
	if (a < 0.01) {
		discard;
	}
	ALBEDO = v_c * a;
	ALPHA = a;
}
