// What lights the workshop from all round (src/render/garage.ts GARAGE_LOOK), and the part
// pictures (src/render/partPreview.ts): three's studio environment (stage.ts: RoomEnvironment
// through PMREM) at `env_k`, plus a hemisphere light.
// The room is the arena's softbox panels (render/studio_sky.gdshader) and a smooth fill fitted so
// a matte surface takes from it what it takes from three's room, facing any way (measured by
// tools/bake/web/garage3d_env.ts, fitted by garage3d_env.py: three's room is lit unevenly, twice as
// bright facing +z as facing -z). A sky split at the horizon lights
// a surface as three's HemisphereLight does, mix(ground, sky, 0.5 + 0.5 n.y): `hemi_sky` and
// `hemi_ground` are its colours times its intensity over pi (linear).
// The environment's strength is in the sky, not the ambient energy: three scales reflections by it
// too, and the Compatibility renderer ignores the ambient energy of a sky (Garage.sky_material sets
// the energy to 1).
// (The Compatibility renderer clamps an ambient sky's light to 1, so there the brightest of the room
// is lost and the workshop comes out darker than on the web; Mobile keeps it.)
shader_type sky;

uniform float env_k = 0.62;
uniform vec3 hemi_sky = vec3(0.12, 0.15, 0.19);
uniform vec3 hemi_ground = vec3(0.006, 0.005, 0.004);

float box(vec2 p, vec2 c, vec2 h) {
	vec2 d = abs(p - c) - h;
	return 1.0 - smoothstep(0.0, 0.03, max(d.x, d.y));
}

void sky() {
	vec3 d = EYEDIR;
	float az = atan(d.z, d.x);
	float el = asin(clamp(d.y, -1.0, 1.0));
	float light = 0.0;
	light += 3.0 * smoothstep(0.93, 0.97, d.y);
	for (int i = 0; i < 6; i++) {
		float a = float(i) * 1.0472 + 0.3;
		vec2 p = vec2(mod(az - a + PI, TAU) - PI, el);
		light += 2.2 * box(p, vec2(0.0, 0.85), vec2(0.18, 0.08));
	}
	vec2 w1 = vec2(mod(az - 0.4 + PI, TAU) - PI, el);
	vec2 w2 = vec2(mod(az - 3.6 + PI, TAU) - PI, el);
	light += 1.6 * box(w1, vec2(0.0, 0.2), vec2(0.35, 0.16));
	light += 1.2 * box(w2, vec2(0.0, 0.25), vec2(0.25, 0.2));
	// the room's walls, floor and ceiling: what the panels leave of three's room (order-2
	// spherical harmonics, garage3d_env.py)
	float fill = 0.8716 + 0.0821 * d.x + 0.4226 * d.y + 0.7153 * d.z + 0.1647 * d.x * d.y + 1.1408 * d.y * d.z - 0.1947 * (3.0 * d.y * d.y - 1.0) - 0.6252 * d.x * d.z - 0.8715 * (d.x * d.x - d.z * d.z);
	fill = max(fill, 0.0);
	vec3 room = vec3(1.0, 0.97, 0.92) * light + vec3(fill);
	COLOR = env_k * room + mix(hemi_ground, hemi_sky, smoothstep(-0.02, 0.02, d.y));
}
