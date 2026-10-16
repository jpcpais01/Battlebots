// What metal reflects in the gym (gym.ts constructor, "reflections: this room": a PMREM of a box
// room seen from a metre up): brown walls, a dark floor, the three bright windows on the right
// wall, the hanging lamps and the lit doorway. Traced here per direction instead of rendered:
// it only lights and reflects (the world environment's background stays a colour), and it stands
// still, so the reflections are only rendered once.
shader_type sky;

// stage.ts applyLook: the look's environment intensity
uniform float intensity = 0.7;
// the hemisphere light's slope (HomeStage sets it from the look, as for the beach)
uniform vec3 hemi_tilt = vec3(0.0);

// (linear: 0x4a3c32, 0x2a2826, 0xfff0dc x 6, 0xfff2e0 x 2)
const vec3 WALL = vec3(0.0685, 0.0452, 0.0319);
const vec3 FLOOR = vec3(0.0232, 0.0212, 0.0194);
const vec3 BRIGHT = vec3(6.0, 5.227, 4.297);
const vec3 DOORWAY = vec3(2.0, 1.776, 1.491);

// the box: 12 x 4.2 x 10, its floor a metre under the eye
const vec3 BOX_LO = vec3(-6.0, -1.0, -5.0);
const vec3 BOX_HI = vec3(6.0, 3.2, 5.0);
const float FLOOR_Y = -0.99;
// gym.ts WINDOWS (z), on the wall at x 5.95, 1.95 up, 1.5 x 1.1
const vec3 WINDOWS = vec3(-2.6, 0.4, 3.4);
// gym.ts LAMPS (x, z), 0.15 spheres 1.9 up
const vec4 LAMPS_X = vec4(0.5, 3.5, -3.4, -2.6);
const vec4 LAMPS_Z = vec4(0.55, 3.3, -2.2, 3.0);

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
	if (d.y < 0.0) {
		float tf = FLOOR_Y / d.y;
		if (tf < t) {
			col = FLOOR;
			t = tf;
		}
	}
	if (d.x > 0.0) {
		float tw = 5.95 / d.x;
		vec3 p = d * tw;
		if (tw <= t && abs(p.y - 1.95) < 0.55) {
			vec3 dz = abs(p.z - WINDOWS);
			if (min(min(dz.x, dz.y), dz.z) < 0.75) {
				col = BRIGHT;
				t = tw;
			}
		}
	}
	if (d.z > 0.0) {
		float td = 4.95 / d.z;
		vec3 p = d * td;
		if (td <= t && abs(p.x + 2.6) < 0.95 && abs(p.y - 0.35) < 1.35) {
			col = DOORWAY;
			t = td;
		}
	}
	for (int i = 0; i < 4; i++) {
		float tl = hit_sphere(d, vec3(LAMPS_X[i], 1.9, LAMPS_Z[i]), 0.15);
		if (tl > 0.0 && tl < t) {
			col = BRIGHT;
			t = tl;
		}
	}
	return col;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	COLOR = max(room(d) * intensity + hemi_tilt * d.y, vec3(0.0));
}
