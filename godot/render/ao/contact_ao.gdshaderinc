// Contact occlusion near the robots (src/render/ao.ts): each robot is a handful of spheres (its
// joints and limb midpoints); lit surfaces near them darken analytically. ContactAO
// (contact_ao.gd) fills the globals every frame. Use the result as AO, with AO_LIGHT_AFFECT set
// to the share of direct light it also dims (the web's `direct`).

// Per robot (row) and sphere (column): centre xyz, radius; radius 0 marks a robot that's away.
global uniform sampler2D bb_ao_spheres : filter_nearest;
// Each robot's bounding sphere (xyz, radius): occlusion fades to exactly zero inside it.
global uniform vec4 bb_ao_b0;
global uniform vec4 bb_ao_b1;
// Top-down occlusion of the floor (y = 0), worked out once a frame (MAP_HALF metres either side).
global uniform sampler2D bb_ao_map : filter_linear, repeat_disable;

const int AO_PER = 24;
const float AO_RANGE2 = 20.25; // (4.5 radii)^2
const float AO_MAP_HALF = 7.5;

// What one sphere (centre xyz, radius w) leaves of the light at p: a factor 0.1..1.
float ao_sphere(vec4 s, vec3 p, vec3 n, float k) {
	vec3 d = s.xyz - p;
	float l2 = dot(d, d);
	float nl = dot(n, d) * inversesqrt(max(l2, 1e-8));
	float r2 = s.w * s.w;
	// cosine-weighted solid angle, windowed to reach exactly zero at 4.5 radii
	float fade = max(1.0 - l2 / (r2 * AO_RANGE2), 0.0);
	float o = max(nl, 0.0) * r2 / max(l2, 1e-4) * fade * fade;
	return 1.0 - min(o * k, 0.9);
}

// Sphere k of the two robots' (robot k / AO_PER, its sphere k % AO_PER).
vec4 ao_sphere_at(int k) {
	return texelFetch(bb_ao_spheres, ivec2(k % AO_PER, k / AO_PER), 0);
}

float ao_robot(vec3 p, vec3 n, float k, vec4 bb, int row) {
	vec3 bd = bb.xyz - p;
	if (bb.w <= 0.0 || dot(bd, bd) > bb.w * bb.w) return 1.0;
	float occ = 1.0;
	for (int i = 0; i < AO_PER; i++) {
		occ *= ao_sphere(texelFetch(bb_ao_spheres, ivec2(i, row), 0), p, n, k);
	}
	return occ;
}

// Occlusion at world point p with world normal n, strength k (ao.ts aoSpheres).
float ao_spheres(vec3 p, vec3 n, float k) {
	return ao_robot(p, n, k, bb_ao_b0, 0) * ao_robot(p, n, k, bb_ao_b1, 1);
}

// The floor's occlusion from the map (ao.ts aoFloorMap); past its edge nothing is near enough.
float ao_floor_map(vec2 xz) {
	vec2 uv = xz * (0.5 / AO_MAP_HALF) + 0.5;
	if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
	return texture(bb_ao_map, uv).r;
}

// Surfaces standing on the plane y = gy darken where they meet it (not the ground itself).
float ao_ground(vec3 p, vec3 n, float gy, float height, float k) {
	return 1.0 - k * (1.0 - smoothstep(0.0, height, p.y - gy)) * (1.0 - max(n.y, 0.0));
}

// The floor round the ring's stage: darkest at r0, clear by r1.
float ao_stage(vec3 p, float r0, float r1, float k) {
	return 1.0 - k * (1.0 - smoothstep(r0, r1, length(p.xz)));
}
