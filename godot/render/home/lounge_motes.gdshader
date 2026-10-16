// Dust turning slowly in the lounge's arc lamp light (src/render/home/lounge.ts MOTE_VERT /
// MOTE_FRAG): round points, each on its own slow orbit (its seed in CUSTOM0: phase, rate,
// twinkle, size), bright in the lamp's cone and barely there outside it; added on. In the sofa's
// frame, so it scales with the robot.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

global uniform float bb_time;
uniform vec3 col = vec3(1.3, 1.04, 0.754);
// only the first this many are drawn (the Low tier's fewer motes)
uniform int max_points = 1048576;

varying float v_a;

void vertex() {
	vec4 seed = CUSTOM0;
	float t = bb_time * seed.y + seed.x * 40.0;
	vec3 p = VERTEX + vec3(sin(t) * 0.12 + sin(t * 0.37) * 0.08, sin(t * 0.61 + 1.3) * 0.1, cos(t * 0.83) * 0.1);
	vec4 mv = MODELVIEW_MATRIX * vec4(p, 1.0);
	POINT_SIZE = max(1.0, seed.w * PROJECTION_MATRIX[1][1] * VIEWPORT_SIZE.y * 0.5 / max(-mv.z, 0.3));
	POSITION = VERTEX_ID < max_points ? PROJECTION_MATRIX * mv : vec4(0.0, 0.0, 2.0, 1.0);
	// bright in the lamp's cone, barely there outside it
	vec3 L = vec3(0.2, 1.93, 0.0);
	vec3 D = normalize(vec3(-0.35, -1.43, 0.45));
	float cone = smoothstep(0.55, 0.9, dot(normalize(p - L), D));
	v_a = (0.12 + 0.88 * cone) * (0.6 + 0.4 * sin(t * 2.3 + seed.z * 6.0));
}

void fragment() {
	vec2 d = POINT_COORD - 0.5;
	float a = max(0.0, 1.0 - dot(d, d) * 4.0);
	ALBEDO = col * (a * a * v_a * 0.7);
}
