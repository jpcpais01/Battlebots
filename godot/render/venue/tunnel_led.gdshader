// The entrance tunnels' LED strips (venue.ts): a chase running out towards the ring.
// CUSTOM1 the strip colour (HDR), CUSTOM0.x aChase (position along the run, < 0 for steady strips).
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"

varying vec3 v_c;

void vertex() {
	float k = 1.0;
	float chase = CUSTOM0.x;
	if (chase >= 0.0) {
		float f = fract(chase * 0.22 - bb_time * 0.55);
		k = 0.5 + 1.3 * smoothstep(0.82, 1.0, f) + 0.35 * (1.0 - smoothstep(0.0, 0.25, f));
	}
	v_c = CUSTOM1.rgb * k;
}

void fragment() {
	ALBEDO = v_c;
}
