// nature.ts treeMaterial: the trees, a MultiMesh per kind and map tile (COLOR: the crown's colour),
// their crowns (CUSTOM0.x) soft puffs swaying in the breeze, in gusts that roll across the land.
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;
varying float vCrown;
varying float vH;

void vertex() {
	float aCrown = CUSTOM0.x;
	vCrown = aCrown;
	vCol = COLOR.rgb;
	vec3 base = MODEL_MATRIX[3].xyz;
	// (the tree's own height: turned about y and scaled evenly, so this undoes the instance)
	float py = (VERTEX.y - base.y) / length(MODEL_MATRIX[1].xyz);
	// the breeze: the crown sways, more at the top, in gusts that roll across the land
	float gust = 0.6 + 0.4 * sin(uTime * 0.7 + base.x * 0.013 + base.z * 0.009);
	float sway = sin(uTime * 1.9 + base.x * 0.31 + base.z * 0.17) * gust * aCrown * max(py, 0.0) * 0.035;
	VERTEX.x += sway;
	VERTEX.z += sway * 0.5;
	vWorld = VERTEX - uMapShift;
	vH = py;
	vN = normalize(NORMAL);
}

void fragment() {
	vec3 n = normalize(vN);
	vec3 trunk = vec3(0.32, 0.22, 0.15);
	// leafy grain, and the crowns darker deep inside (lower down)
	float leaf = texture(uNoise, vWorld.xz / 5.0 + vWorld.y / 7.0).r;
	vec3 alb = mix(trunk, vCol * (0.8 + 0.35 * leaf), vCrown);
	alb *= mix(0.62, 1.0, smoothstep(1.5, 6.0, vH));
	// soft wrap lighting on the crowns, and a warm glow where the low sun comes through them
	float ndl = dot(n, uSunDir);
	float wrap = mix(max(ndl, 0.0), clamp(ndl * 0.6 + 0.4, 0.0, 1.0), vCrown);
	float cs = cloudShade(vWorld.xz);
	float sh = sunShadow(vWorld + n * 3.0);
	vec3 light = ambient(n) * mix(0.82, 1.0, cs) + uSunCol * wrap * sh * cs;
	vec3 c = alb * light;
	MAP_OUT(c)
}
