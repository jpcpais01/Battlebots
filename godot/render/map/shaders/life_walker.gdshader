// People walking the city's pavements (render/map/street_life.gd): a card each, turned to the
// lens, with a person drawn on it: head and hair, a top, trousers or a skirt, arms and legs
// swinging as they walk, rounded by the light.
shader_type spatial;
render_mode unshaded, skip_vertex_transform, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_life.gdshaderinc"

varying vec3 vWorld;
// metres on the card (x across, y up from the feet), as for someone 1.75 m tall
varying vec2 vQ;
// seed, how side-on they're walking to the lens, the stride's phase
varying flat vec3 vLook;
varying vec3 vRt;
varying vec3 vTo;

void vertex() {
	vec3 c;
	vec2 fw;
	float walked;
	lifeWalker(MODEL_MATRIX, c, fw, walked);
	float seed = MODEL_MATRIX[2].x;
	float hgt = 1.6 + 0.26 * fract(seed * 7.7);
	vec2 th = normalize((CAMERA_POSITION_WORLD - c).xz + vec2(1e-4, 0.0));
	vec2 rt = vec2(-th.y, th.x);
	vec3 p = c + vec3(rt.x, 0.0, rt.y) * VERTEX.x * 0.7 * hgt / 1.75 + vec3(0.0, VERTEX.y * hgt, 0.0);
	vQ = vec2(VERTEX.x * 0.7, VERTEX.y * 1.75);
	vLook = vec3(seed, abs(dot(fw, rt)), walked / 0.75 * 3.14159);
	vRt = vec3(rt.x, 0.0, rt.y);
	vTo = vec3(th.x, 0.0, th.y);
	vWorld = p;
	VERTEX = (VIEW_MATRIX * vec4(p, 1.0)).xyz;
}

// distance from p to the segment a-b
float seg(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a, ba = b - a;
	return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

void fragment() {
	vec2 q = vQ;
	float seed = vLook.x, side = vLook.y;
	float sw = sin(vLook.z);
	// the walk: legs and arms swing along the way they go (seen side on), barely from in front
	float lx = mix(0.075, 0.0, side);
	float fs = sw * 0.2 * side;
	float dl = min(seg(q, vec2(-lx, 0.9), vec2(-lx + fs, 0.06)), seg(q, vec2(lx, 0.9), vec2(lx - fs, 0.06)));
	float da = min(seg(q, vec2(-0.19 * (1.0 - side), 1.42), vec2(-0.21 * (1.0 - side) - fs * 0.6, 0.86)), seg(q, vec2(0.19 * (1.0 - side), 1.42), vec2(0.21 * (1.0 - side) + fs * 0.6, 0.86)));
	float torso = step(abs(q.x), mix(0.19, 0.13, side) - 0.04 * smoothstep(1.3, 0.95, q.y)) * step(0.88, q.y) * step(q.y, 1.48);
	float head = step(length(q - vec2(0.0, 1.61)), 0.105);
	float neck = step(abs(q.x), 0.045) * step(1.45, q.y) * step(q.y, 1.55);
	float legs = step(dl, 0.068);
	float arms = step(da, 0.05);
	float skirt = step(0.85, fract(seed * 3.3)) * step(abs(q.x), 0.19 - 0.12 * (q.y - 0.55)) * step(0.55, q.y) * step(q.y, 0.92);
	float body = max(max(max(torso, head), max(neck, legs)), max(arms, skirt));
	if (body < 0.5) discard;
	// their clothes and colouring
	float h1 = fract(seed * 13.1), h2 = fract(seed * 29.3), h3 = fract(seed * 5.7), h4 = fract(seed * 71.9);
	vec3 skin = h1 < 0.3 ? vec3(0.62, 0.42, 0.3) : h1 < 0.55 ? vec3(0.45, 0.28, 0.17) : h1 < 0.8 ? vec3(0.72, 0.52, 0.38) : vec3(0.25, 0.15, 0.09);
	vec3 hair = h4 < 0.45 ? vec3(0.03, 0.025, 0.02) : h4 < 0.75 ? vec3(0.16, 0.09, 0.04) : h4 < 0.9 ? vec3(0.55, 0.42, 0.22) : vec3(0.5, 0.5, 0.48);
	vec3 top = h2 < 0.18 ? vec3(0.8, 0.8, 0.78) : h2 < 0.36 ? vec3(0.04, 0.04, 0.05) : h2 < 0.48 ? vec3(0.06, 0.1, 0.25) : h2 < 0.58 ? vec3(0.5, 0.05, 0.05) : h2 < 0.68 ? vec3(0.25, 0.3, 0.2) : h2 < 0.76 ? vec3(0.75, 0.55, 0.1) : h2 < 0.86 ? vec3(0.35, 0.36, 0.38) : h2 < 0.93 ? vec3(0.45, 0.3, 0.2) : vec3(0.7, 0.35, 0.45);
	vec3 low = h3 < 0.4 ? vec3(0.08, 0.12, 0.25) : h3 < 0.65 ? vec3(0.04, 0.04, 0.045) : h3 < 0.82 ? vec3(0.42, 0.36, 0.25) : vec3(0.3, 0.3, 0.32);
	vec3 c = low;
	c = mix(c, vec3(0.03), step(q.y, 0.08) * legs);
	c = mix(c, top, max(torso, max(arms * step(1.08, q.y), skirt * 0.0)));
	c = mix(c, h3 < 0.3 ? top * 0.8 : low, skirt * (1.0 - torso));
	c = mix(c, skin, max(neck, arms * step(q.y, 1.08)));
	c = mix(c, skin, head);
	c = mix(c, hair, head * step(1.63 - 0.03 * step(0.5, h4), q.y));
	// rounded: lit as a little cylinder facing the lens
	float xn = clamp(q.x / 0.22, -1.0, 1.0);
	vec3 n = normalize(vTo * sqrt(max(1.0 - xn * xn, 0.0)) + vRt * xn + vec3(0.0, 0.2, 0.0));
	c = c * mapLightK(n, vWorld, 1.0, 0.4);
	MAP_OUT(c)
}
