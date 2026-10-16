// Impact flashes (fx.ts Fx.flash): an additive glow sprite that swells from 0.4 to 1.3 of its
// size and fades out over its short life.
//
// Instance: origin = where, basis x = (start time, life, size); COLOR = colour (already glowing).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
#include "res://render/fx/fx_common.gdshaderinc"

uniform float now;

varying vec3 v_c;
varying float v_a;
varying vec2 v_uv;

void vertex() {
	float t = now - MODEL_MATRIX[0].x;
	float life = MODEL_MATRIX[0].y;
	float k = clamp(t / life, 0.0, 1.0);
	float s = MODEL_MATRIX[0].z * (0.4 + k * 0.9);
	v_c = COLOR.rgb;
	v_a = 1.0 - k;
	v_uv = VERTEX.xy * 2.0;
	vec4 mv = VIEW_MATRIX * vec4(MODEL_MATRIX[3].xyz, 1.0);
	mv.xy += VERTEX.xy * s;
	POSITION = (t < 0.0 || t >= life) ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * mv;
}

void fragment() {
	float a = fx_glow(length(v_uv)) * v_a;
	if (a < 0.004) {
		discard;
	}
	ALBEDO = v_c;
	ALPHA = a;
}
