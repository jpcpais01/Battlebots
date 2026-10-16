// The LED skirt round the stage (arena.ts): sponsor lettering scrolling round, and two bright
// sweeps chasing round the ring, faster when the crowd is up. map holds two masks (r: a, g: b).
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"

uniform sampler2D map : filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
uniform vec3 a = vec3(1.0);
uniform vec3 b = vec3(1.0);
uniform float flash = 0.0;

void fragment() {
	// read from outside the ring, the lettering runs against the corner order, top down
	float u = 1.0 - UV.x;
	vec4 t = texture(map, vec2(u * 6.0 - bb_time * 0.04, 1.0 - UV.y));
	float chase = smoothstep(0.85, 1.0, fract(u * 2.0 - bb_time * (0.12 + 0.2 * bb_hype)));
	float k = 0.5 + 0.4 * bb_hype + flash + chase * 0.7;
	ALBEDO = (a * t.r + b * t.g) * k + vec3(0.018, 0.02, 0.028);
	FOG = bb_fog(VERTEX);
}
