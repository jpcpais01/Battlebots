// What the metal reflects: a dim studio room with softbox panels overhead and round the walls
// (the web lights robots with three's RoomEnvironment). Not drawn as the background.
shader_type sky;

float box(vec2 p, vec2 c, vec2 h) {
	vec2 d = abs(p - c) - h;
	return 1.0 - smoothstep(0.0, 0.03, max(d.x, d.y));
}

void sky() {
	vec3 d = EYEDIR;
	// hemisphere: cool above, warm dark below
	vec3 c = mix(vec3(0.016, 0.011, 0.008), vec3(0.11, 0.14, 0.2), smoothstep(-0.25, 0.35, d.y));
	float az = atan(d.z, d.x);
	float el = asin(clamp(d.y, -1.0, 1.0));
	float light = 0.0;
	// a big panel straight overhead and a ring of smaller ones round the ceiling
	light += 3.0 * smoothstep(0.93, 0.97, d.y);
	for (int i = 0; i < 6; i++) {
		float a = float(i) * 1.0472 + 0.3;
		vec2 p = vec2(mod(az - a + PI, TAU) - PI, el);
		light += 2.2 * box(p, vec2(0.0, 0.85), vec2(0.18, 0.08));
	}
	// two wall softboxes, one either side
	vec2 w1 = vec2(mod(az - 0.4 + PI, TAU) - PI, el);
	vec2 w2 = vec2(mod(az - 3.6 + PI, TAU) - PI, el);
	light += 1.6 * box(w1, vec2(0.0, 0.2), vec2(0.35, 0.16));
	light += 1.2 * box(w2, vec2(0.0, 0.25), vec2(0.25, 0.2));
	COLOR = c + vec3(1.0, 0.97, 0.92) * light;
}
