// What the street life's shaders share (render/map/street_life.gd): where a vehicle or a walker
// is at this moment, from its instance's numbers (MODEL_MATRIX carries them, not a placement:
// see StreetLife._vehicle and _put), the ground under it, and its size. Needs
// map_common.gdshaderinc first.

// the terrain's height grid (WorldMap's ground), sampled as the terrain mesh interpolates it
uniform sampler2D uGround : filter_linear, repeat_disable;
// its half size, cell and points across
uniform vec3 uGroundK = vec3(1600.0, 12.5, 257.0);

float lifeGround(vec2 xz) {
	vec2 uv = ((xz + uGroundK.x) / uGroundK.y + 0.5) / uGroundK.z;
	return textureLod(uGround, uv, 0.0).r;
}

// a vehicle kind's length, width, height: car, taxi, van, bus
vec3 lifeDims(float kind) {
	return kind < 1.5 ? vec3(4.4, 1.8, 1.45) : kind < 2.5 ? vec3(5.3, 2.0, 2.25) : vec3(12.0, 2.55, 3.15);
}

// A vehicle now: the middle of its footprint (on the ground, or up on a bridge's deck), its
// heading (xz, unit), and how much of it there is (it shrinks away at its street's ends, as the
// web's lights fade there). As traffic.gdshader moves the lights: t of the way from A along d,
// `off` across (its sign the way it drives).
void lifeVehicle(mat4 M, out vec3 c, out vec2 fw, out float fade) {
	vec2 d = M[0].xy;
	float off = M[0].z;
	float len = length(d);
	vec2 dir = d / len;
	float side = off < 0.0 ? -1.0 : 1.0;
	float speed = M[1].y;
	float t = fract(M[1].x + uTime * speed / len * side);
	vec2 p = M[3].xz + d * t + vec2(-dir.y, dir.x) * off;
	fade = speed > 0.0 ? smoothstep(0.0, 0.02, t) * smoothstep(1.0, 0.98, t) : 1.0;
	float s = t * len;
	float b0 = M[2].y, b1 = M[2].z;
	float deck = b1 > b0 ? clamp(min(s - b0, b1 - s) / 6.0 + 1.0, 0.0, 1.0) : 0.0;
	c = vec3(p.x, mix(lifeGround(p), M[3].y + 1.4, deck), p.y);
	fw = dir * side;
}

// A walker now: where their feet are, which way they're going, and how far they've walked (m),
// up and down their stretch of pavement (from M[3] along M[0].xy) at M[1].y m/s
void lifeWalker(mat4 M, out vec3 c, out vec2 fw, out float walked) {
	vec2 d = M[0].xy;
	float len = max(length(d), 1.0);
	float u = M[1].x + uTime * M[1].y / len;
	float h = fract(u * 0.5);
	vec2 p = M[3].xz + d * abs(h * 2.0 - 1.0);
	c = vec3(p.x, lifeGround(p), p.y);
	fw = d / len * (h < 0.5 ? -1.0 : 1.0);
	walked = u * len;
}

// a vehicle's right (the basis right, up, heading keeps the mesh's winding)
vec2 lifeRight(vec2 fw) {
	return vec2(fw.y, -fw.x);
}
