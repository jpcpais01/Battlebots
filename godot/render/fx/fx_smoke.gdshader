// Fx's smoke and vapour puffs (fx.ts `smokePts`): normally blended soft sprites (so they can be
// dark) that swell as they rise, fade in quickly and thin out as they spread. They settle on the
// deck at 0.015 m (a dead bounce that halves their drift).
//
// Instance (Fx._emit_smoke): origin = spawn point, basis x = velocity, basis y = (spawn time,
// life, size), basis z = (drag, gravity); COLOR = grey; INSTANCE_CUSTOM = (grow, peak alpha).
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
#include "res://render/fx/fx_common.gdshaderinc"

uniform float now;

varying vec3 v_c;
varying float v_a;
varying vec2 v_uv;

void vertex() {
	vec3 v = MODEL_MATRIX[0].xyz;
	float t0 = MODEL_MATRIX[1].x;
	float life = MODEL_MATRIX[1].y;
	float tau = now - t0;
	vec3 pos = fx_fly(MODEL_MATRIX[3].xyz, v, MODEL_MATRIX[2].x, MODEL_MATRIX[2].y, tau, 0.015, 0.2, 0.5);
	float k = clamp(1.0 - tau / life, 0.0, 1.0);
	float size = MODEL_MATRIX[1].z * (1.0 + (1.0 - k) * INSTANCE_CUSTOM.x * 6.0);
	v_c = COLOR.rgb;
	v_a = INSTANCE_CUSTOM.y * min(1.0, (1.0 - k) * 8.0) * k;
	v_uv = VERTEX.xy * 2.0;
	vec4 mv = VIEW_MATRIX * vec4(pos, 1.0);
	// (a puff right at the lens fades away, as steam does, rather than blending over the screen)
	v_a *= smoothstep(0.2, 0.7, -mv.z);
	mv.xy += VERTEX.xy * size / PROJECTION_MATRIX[1][1];
	POSITION = (tau < 0.0 || tau >= life || MODEL_MATRIX[1].z <= 0.0) ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * mv;
}

void fragment() {
	float a = fx_glow(length(v_uv)) * v_a;
	if (a < 0.01) {
		discard;
	}
	ALBEDO = v_c;
	ALPHA = a;
}
