// Electric arcs (fx.ts Fx.arc / the arcs in Fx.update): four jagged branches of five random
// steps each crackle out from the source, redrawn at random every frame, for as long as the
// arc lasts. One-pixel additive lines in one colour, like the web's LineBasicMaterial (which
// ignores each arc's own colour too).
//
// Mesh: 40 line vertices, VERTEX = (branch, step, end). Instance: origin = source,
// basis x = (start time, life, slot).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
#include "res://render/fx/fx_common.gdshaderinc"

uniform float now;
uniform float frame;
uniform vec3 color;

void vertex() {
	float t = now - MODEL_MATRIX[0].x;
	float seed = fract(frame * 0.6180339) * 917.0 + MODEL_MATRIX[0].z * 31.7 + VERTEX.x * 5.3;
	vec3 w = fx_dir(seed) * 0.07;
	vec3 p = MODEL_MATRIX[3].xyz;
	int n = int(VERTEX.y + VERTEX.z + 0.5);
	for (int s = 0; s < 5; s++) {
		if (s >= n) {
			break;
		}
		p += w + fx_dir(seed + 1.37 * float(s + 1)) * 0.06;
	}
	POSITION = (t < 0.0 || t >= MODEL_MATRIX[0].y) ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * (VIEW_MATRIX * vec4(p, 1.0));
}

void fragment() {
	ALBEDO = color;
	ALPHA = 1.0;
}
