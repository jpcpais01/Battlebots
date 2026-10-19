// Photographers' flashes round the ring (floor.ts flashPoints): a burst of shots after a big
// moment (burst: when, burst_k: how big), and the odd shot during a lull.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float now = 0.0;
uniform float burst = -99.0;
uniform float burst_k = 0.0;
uniform float glow = 2.2;

varying float v_a;

float h(float n) { return fract(sin(n) * 43758.5453); }

void vertex() {
	float s = h(dot(VERTEX.xz, vec2(12.9898, 78.233)));
	float dt = now - burst;
	float a = 0.0;
	// two shots each, spread over the first second, only for the keener ones on smaller moments
	for (int k = 0; k < 2; k++) {
		float at = h(s * 17.0 + float(k) * 3.1) * 0.9 + float(k) * 0.35;
		a = max(a, step(s, 0.35 + burst_k) * smoothstep(0.09, 0.0, abs(dt - at - 0.045)));
	}
	a = max(a, step(0.9975, h(floor(bb_time * 10.0) + s * 91.0)));
	v_a = a;
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	POINT_SIZE = a > 0.0 ? min(VIEWPORT_SIZE.y * 0.3 / -mv.z, VIEWPORT_SIZE.y * 0.08) : 0.0;
}

void fragment() {
	vec2 d = POINT_COORD - 0.5;
	float r = dot(d, d);
	if (r > 0.25) discard;
	float a = pow(smoothstep(0.25, 0.0, r), 1.6) * v_a;
	ALBEDO = vec3(1.0, 0.97, 0.92) * a * glow;
	ALPHA = a;
}
