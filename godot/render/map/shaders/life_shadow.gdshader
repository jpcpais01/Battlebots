// The street life's shadows (render/map/street_life.gd): for every vehicle, walker and piece of
// roof kit, its box's footprint swept away from the sun to the ground (a hexagon), laid over
// what's below as a dark film (blended, not multiplied: the same on every renderer). Where a building's shadow already falls (and at night) just the dark
// under it is left. Roof kit's shadows are clipped to their roof.
shader_type spatial;
render_mode unshaded, skip_vertex_transform, cull_disabled, blend_mix, depth_draw_never, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_life.gdshaderinc"

varying vec3 vWorld;
// the roof a kit's shadow stays on (x0, z0, x1, z1)
varying flat vec4 vClip;
// how dark
varying flat float vK;

void vertex() {
	mat4 M = MODEL_MATRIX;
	float kind = M[1].z;
	vec3 c;
	vec2 fw;
	float L, W, H;
	vClip = vec4(-1e5, -1e5, 1e5, 1e5);
	if (kind < 9.5) {
		float fade;
		lifeVehicle(M, c, fw, fade);
		vec3 d = lifeDims(kind) * fade;
		L = d.x * 0.97;
		W = d.y * 0.95;
		H = d.z;
	} else if (kind < 19.5) {
		float walked;
		lifeWalker(M, c, fw, walked);
		L = 0.32;
		W = 0.42;
		H = 1.6 + 0.26 * fract(M[2].x * 7.7);
	} else {
		c = M[3].xyz;
		fw = vec2(0.0, 1.0);
		L = M[0].z;
		W = M[0].x;
		H = M[0].y;
		vClip = vec4(M[2].xyz, M[1].x);
	}
	// in sunlight: the shadow cast away from the sun; in a building's shadow or at night, none
	float sunlit = sunShadow(c + vec3(0.0, 0.6, 0.0)) * (1.0 - uNight);
	vec2 o = -uSunDir.xz / uSunDir.y * H * sunlit;
	vec2 rt = lifeRight(fw);
	float su = dot(o, fw) >= 0.0 ? 1.0 : -1.0;
	float sv = dot(o, rt) >= 0.0 ? 1.0 : -1.0;
	// the hexagon round the footprint and the footprint moved by o: the corner furthest back,
	// the two side corners at both ends, the corner furthest forward moved
	int k = int(VERTEX.x + 0.5);
	vec2 uv = k == 0 ? vec2(-su, -sv) : k < 3 ? vec2(su, -sv) : k == 3 ? vec2(su, sv) : vec2(-su, sv);
	float moved = k >= 2 && k <= 4 ? 1.0 : 0.0;
	vec2 p = c.xz + fw * uv.x * L * 0.5 + rt * uv.y * W * 0.5 + o * moved;
	vWorld = vec3(p.x, c.y + 0.05, p.y);
	vK = mix(0.45, 0.72, sunlit);
	// (pulled towards the lens a hair, over the ground it lies on)
	VERTEX = (VIEW_MATRIX * vec4(vWorld, 1.0)).xyz * (1.0 - 4e-5);
}

void fragment() {
	if (vWorld.x < vClip.x || vWorld.z < vClip.y || vWorld.x > vClip.z || vWorld.z > vClip.w) discard;
	// the shade's own colour: the sky's blue the sun no longer drowns
	ALBEDO = mapAlbedo(vec3(0.012, 0.016, 0.03) * (1.0 - 0.7 * uNight));
	ALPHA = vK * (1.0 - mapFog(VERTEX));
}
