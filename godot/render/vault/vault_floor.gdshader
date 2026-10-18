// The Skin Vault's floating platform (vault_stage.gd): a disc of glossy dark violet glass with a
// neon polar grid sunk in it, rings of light rolling out from the robot's turntable, the turntable
// itself glowing in the colour of what's being pulled, and round its rim a band of chasing
// lights. Its sides are dark metal studded with lights, fading into the void underneath.
shader_type spatial;
render_mode cull_back;

// the platform's middle and the turntable's middle (world xz)
uniform vec2 center = vec2(0.0);
uniform vec2 table = vec2(0.0);
uniform float table_r = 1.15;
// the turntable's colour (linear) and a pulse rolling out over the floor (a burst)
uniform vec3 table_col = vec3(0.9, 0.3, 1.0);
uniform float pulse = 0.0;
uniform vec3 pulse_col = vec3(1.0, 0.8, 0.3);
uniform float radius = 8.0;

varying vec3 v_world;
varying float v_top;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_top = NORMAL.y;
}

void fragment() {
	vec2 p = v_world.xz;
	float t = TIME;
	if (v_top > 0.5) {
		vec2 q = p - center;
		float r = length(q);
		float a = atan(q.y, q.x);
		// the glass: deep violet, glossy
		ALBEDO = vec3(0.025, 0.018, 0.05);
		METALLIC = 0.2;
		ROUGHNESS = 0.2;
		SPECULAR = 0.4;
		// the grid: rings every metre, spokes every 15 degrees
		float dr = 0.5 - abs(fract(r) - 0.5);
		float ring = 1.0 - smoothstep(0.012, 0.012 + fwidth(r) * 1.5, dr);
		float sa = a * 24.0 / TAU;
		float ds = 0.5 - abs(fract(sa) - 0.5);
		float sw = 0.012 / max(r * TAU / 24.0, 0.01);
		float spoke = 1.0 - smoothstep(sw, sw + fwidth(sa) * 1.5, ds);
		spoke *= smoothstep(1.5, 2.2, r);
		float grid = max(ring, spoke) * (1.0 - smoothstep(radius - 0.6, radius - 0.3, r));
		// (the far grid fades so it doesn't shimmer)
		grid *= 1.0 - smoothstep(14.0, 24.0, length(v_world - CAMERA_POSITION_WORLD));
		vec3 gcol = mix(vec3(0.15, 0.6, 1.0), vec3(1.0, 0.25, 0.85), 0.5 + 0.5 * sin(a * 2.0 + t * 0.4));
		vec3 em = gcol * grid * 0.9;
		// rings rolling out from the turntable
		float rt = length(p - table);
		float wave = fract(rt * 0.22 - t * 0.35);
		em += gcol * grid * smoothstep(0.85, 1.0, wave) * 1.6;
		// the burst's pulse
		float pr = pulse * 14.0;
		em += pulse_col * exp(-abs(rt - pr) * 3.0) * (1.0 - pulse) * 2.5 * (0.4 + grid);
		// the turntable: a disc with a bright rim and segments chasing round
		float tr = rt - table_r;
		float ta = atan(p.y - table.y, p.x - table.x);
		float rim = exp(-abs(tr) * 40.0) * 2.4 + exp(-abs(tr) * 8.0) * 0.4;
		float seg = smoothstep(0.3, 0.7, sin(ta * 12.0 - t * 3.0)) * step(abs(tr + 0.12), 0.05);
		float inner = (1.0 - smoothstep(-0.02, 0.0, tr)) * 0.06;
		em += table_col * (rim + seg * 1.6 + inner);
		ALBEDO = mix(ALBEDO, vec3(0.06, 0.05, 0.09), 1.0 - smoothstep(-0.03, 0.0, tr));
		// the rim of the platform: a band of chasing lights
		float edge = r - (radius - 0.18);
		float chase = smoothstep(0.6, 0.9, sin(a * 60.0 + t * 4.0));
		em += mix(vec3(1.0, 0.2, 0.8), vec3(0.2, 0.8, 1.0), 0.5 + 0.5 * sin(a * 3.0 - t)) * exp(-abs(edge) * 30.0) * (1.2 + chase * 3.0);
		EMISSION = em;
	} else {
		// the sides: dark metal with a row of lights, fading out underneath
		float a = atan(p.y - center.y, p.x - center.x);
		ALBEDO = vec3(0.03, 0.025, 0.045);
		METALLIC = 0.8;
		ROUGHNESS = 0.35;
		float lamp = 1.0 - smoothstep(0.25, 0.4, length(vec2((fract(a * 40.0 / TAU) - 0.5) * 2.0, (v_world.y + 0.25) * 8.0)));
		EMISSION = vec3(0.4, 0.8, 1.0) * lamp * (2.0 + sin(a * 40.0 + t * 3.0)) * 0.8;
		EMISSION += vec3(0.6, 0.1, 0.5) * smoothstep(-0.9, -0.1, v_world.y) * 0.08;
	}
}

// The stage lights only graze the glass (a soft pool and a small sharp glint) so its neon reads;
// the sides take them as metal.
void light() {
	// (the top faces up)
	float v_glass = step(0.5, (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).y);
	float nl = max(dot(NORMAL, LIGHT), 0.0);
	vec3 h = normalize(LIGHT + VIEW);
	float glint = pow(max(dot(NORMAL, h), 0.0), mix(24.0, 220.0, v_glass));
	DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * nl * mix(1.0, 0.18, v_glass) / PI;
	SPECULAR_LIGHT += LIGHT_COLOR * ATTENUATION * nl * glint * mix(0.5, 0.35, v_glass);
}
