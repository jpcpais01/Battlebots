// The moving-head beams on the roof catwalk (show.ts buildBeams): one open cone per head, aimed in
// the shader from a few eased uniforms, sweeping the stands, wheeling in a fan or circling the ring.
// CUSTOM0.xyz aPos (the lamp), CUSTOM1.xy aId (index, side: 0 the -x half, 1 the +x half).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float level = 0.0;
uniform float fan = 0.0;
uniform float focus = 0.0;
uniform float strobe = 0.0;
uniform float mono = 0.0;
uniform float white = 0.0;
uniform vec3 col_a = vec3(1.0, 0.195, 0.014);
uniform vec3 col_b = vec3(0.05, 0.745, 1.0);
uniform vec3 col_m = vec3(1.0, 0.905, 0.745);
uniform float glow = 1.6;

varying float v_t;
varying vec3 v_c;
// three's vN (view space): the baked cone has no normals, so it rides in its own varying
varying vec3 v_n;

// the height of the stands at offset d out from the front row
float stand_y(float d) { return d < 13.5 ? -0.1 + d * 0.47 : 9.4 + (d - 13.5) * 0.66; }

void vertex() {
	vec3 a_pos = CUSTOM0.xyz;
	vec2 a_id = CUSTOM1.xy;
	float i = a_id.x, dirn = mod(i, 2.0) * 2.0 - 1.0;
	float t = bb_time * (0.6 + 0.6 * bb_hype);
	// sweeping the seats, each head on its own lazy loop
	float a = i * 0.314 + t * 0.11 * dirn + 0.6 * sin(t * 0.17 + i);
	float d = 8.0 + 9.0 * (0.5 + 0.5 * sin(t * 0.23 + i * 1.7));
	vec3 sweep = vec3(cos(a) * (13.0 + d), stand_y(d), sin(a) * (10.0 + d));
	// ballyhoo: a fan of beams wheeling round under the roof
	float b = i * 1.2566 + bb_time * 0.9 * dirn;
	float s = 0.55 + 0.45 * sin(bb_time * 1.3 + i * 0.7);
	vec3 fan_t = a_pos + normalize(vec3(cos(b) * s, -1.0, sin(b) * s)) * 34.0;
	// on the ring, circling just off the centre
	float c = i * 2.39996 + bb_time * 1.4;
	vec3 ring = vec3(cos(c) * 1.4, 0.4, sin(c) * 1.4);
	vec3 tgt = mix(mix(sweep, fan_t, fan), ring, focus);
	vec3 dv = tgt - a_pos;
	float len = length(dv) * 1.1;
	vec3 dir = dv / length(dv);
	vec3 ref = abs(dir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
	vec3 u = normalize(cross(ref, dir)), w = cross(dir, u);
	float along = -VERTEX.y;
	vec3 radial = u * VERTEX.x + w * VERTEX.z;
	v_t = along;
	VERTEX = a_pos + dir * along * len + radial * (0.1 + along * len * 0.045);
	v_n = (MODELVIEW_MATRIX * vec4(radial, 0.0)).xyz;
	vec3 col = mix(mix(col_a, col_b, a_id.y), col_m, mono);
	float st = mix(1.0, step(0.45, fract(bb_time * 6.0 + i * 0.37)), strobe);
	float flick = 0.75 + 0.25 * sin(bb_time * 0.7 + i * 2.1);
	v_c = mix(col, vec3(1.0), white) * level * st * flick * (1.0 + white);
}

void fragment() {
	CLEAR_VIEW
	// brightest through the middle of the shaft, nothing at its edges
	float edge = abs(dot(normalize(v_n), normalize(VIEW)));
	edge *= edge;
	// hot at the lens, thinning out through the haze
	float k = (0.06 + 0.5 * (1.0 - v_t) * (1.0 - v_t)) * (1.0 - smoothstep(0.82, 1.0, v_t));
	ALBEDO = v_c * edge * k * 0.42 * glow;
}
