// roads.ts ribbonMaterial: the country roads, draped over the terrain, and the city streets over
// the bridges and the alleys. aRoad (CUSTOM0): across, along, half width, kind (+16: the
// embankment or wall under it).
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_road.gdshaderinc"

varying vec4 vRoad;
varying vec3 vN;
varying vec3 vWorld;

void vertex() {
	vRoad = CUSTOM0;
	vN = NORMAL;
	vWorld = VERTEX - uMapShift;
}

void fragment() {
	vec3 w = vWorld;
	vec4 nz = texture(uNoise, w.xz / 37.0);
	vec4 nz2 = texture(uNoise, w.xz / 53.0 + 0.37);
	float o = vRoad.x, s = vRoad.y, hw = vRoad.z;
	float kind = mod(vRoad.w, 16.0);
	// (derivatives taken up here, outside the branches)
	vec2 px = vec2(fwidth(o), fwidth(s)) + 1e-4;
	float pw = length(fwidth(w));
	vec3 glow = vec3(0.0);
	vec3 c;
	if (vRoad.w > 15.5) {
		if (kind > 1.5 && kind < 2.5) {
			// a dry-stone wall under the mountain road
			vec2 q = vec2(s / 1.1, w.y / 0.55);
			q.x += 0.5 * mod(floor(q.y), 2.0);
			c = vec3(0.34, 0.31, 0.27) * (0.7 + 0.5 * hash12(floor(q)));
			c *= 1.0 - 0.45 * max(fpulse(q.x, 0.08, pw / 1.1), fpulse(q.y, 0.1, pw / 0.55));
		} else {
			// a grassy embankment, earth showing through here and there
			c = mix(R_GRASS * (0.75 + 0.45 * nz.g), vec3(0.3, 0.22, 0.14) * (0.8 + 0.4 * nz.r), smoothstep(0.55, 0.75, nz2.a));
		}
	} else {
		c = roadColor(kind, o, s, hw, px, nz, nz2, w.xz, glow);
	}
	c = c * mapLight(normalize(vN), w) + glow;
	MAP_OUT(c)
}
