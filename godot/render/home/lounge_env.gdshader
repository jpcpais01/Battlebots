// What metal reflects in the lounge (lounge.ts constructor, "reflections: this room at night": a
// PMREM of a box room seen from a metre up): dark warm walls, the cold window, the two lamps and
// the TV's fire. Traced here per direction instead of rendered, as gym_env.gdshader does: it only
// lights and reflects (the background stays a colour), and it stands still.
shader_type sky;

// stage.ts applyLook: the look's environment intensity
uniform float intensity = 0.6;
// the hemisphere light's slope (HomeStage sets it from the look)
uniform vec3 hemi_tilt = vec3(0.0);

// (linear: 0x2a2420; 0x3a4c7a x 1.4; 0xffc890 x 7; 0xff8a40 x 2)
const vec3 WALL = vec3(0.0232, 0.0176, 0.0144);
const vec3 GLASS = vec3(0.0592, 0.1012, 0.2724);
const vec3 WARM = vec3(7.0, 4.043, 1.952);
const vec3 TV = vec3(2.0, 0.5084, 0.1026);

// the box: 8.4 x 3 x 6.4, its floor a metre under the eye
const vec3 BOX_LO = vec3(-4.2, -1.0, -2.4);
const vec3 BOX_HI = vec3(4.2, 2.0, 4.0);

float hit_sphere(vec3 d, vec3 c, float r) {
	float b = dot(d, c);
	float h = b * b - dot(c, c) + r * r;
	return h < 0.0 ? -1.0 : b - sqrt(h);
}

vec3 room(vec3 d) {
	vec3 inv = 1.0 / max(abs(d), vec3(1e-5)) * sign(d + vec3(1e-7));
	vec3 tb = max(BOX_LO * inv, BOX_HI * inv);
	float t = min(min(tb.x, tb.y), tb.z);
	vec3 col = WALL;
	// the window: 7.2 x 2.4 at z -2.35, its middle 0.55 up
	if (d.z < 0.0) {
		float tw = -2.35 / d.z;
		vec3 p = d * tw;
		if (tw <= t && abs(p.x) < 3.6 && abs(p.y - 0.55) < 1.2) {
			col = GLASS;
			t = tw;
		}
	}
	// the TV: 1.9 x 1.1 at z 3.9, its middle 0.42 up
	if (d.z > 0.0) {
		float tv = 3.9 / d.z;
		vec3 p = d * tv;
		if (tv <= t && abs(p.x) < 0.95 && abs(p.y - 0.42) < 0.55) {
			col = TV;
			t = tv;
		}
	}
	// the arc lamp and the table lamp
	float l0 = hit_sphere(d, vec3(0.2, 0.95, 0.0), 0.16);
	if (l0 > 0.0 && l0 < t) {
		col = WARM;
		t = l0;
	}
	float l1 = hit_sphere(d, vec3(-2.05, -0.05, -0.3), 0.16);
	if (l1 > 0.0 && l1 < t) {
		col = WARM;
	}
	return col;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	COLOR = max(room(d) * intensity + hemi_tilt * d.y, vec3(0.0));
}
