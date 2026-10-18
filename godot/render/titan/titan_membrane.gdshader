// The Titan Colosseum's roof membrane (titan_build.gd membrane()): a translucent sheet between the
// ribs. The low sun glows through it from above; from below it reads as a warm, pale canopy with
// the ribs' rhythm shading it, thinner where it is stretched near its free edge.
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_opaque, shadows_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

varying vec3 v_w;

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 p = v_w;
	float r = length(p.xz);
	float u = fract(atan(p.z, p.x) / 6.2831853 * 96.0);
	// each panel sags a little between its ribs: brighter where it's thin
	float panel = 1.0 - pow(abs(u - 0.5) * 2.0, 3.0);
	float edge = smoothstep(42.5, 46.0, r);
	vec3 through = T_SUN_COL * 0.32 * (0.6 + 0.4 * panel);
	vec3 below = vec3(0.86, 0.82, 0.74) * (T_SKY_SIDE + T_BOUNCE * 2.0);
	vec3 c = mix(through, below, 0.35) * (0.8 + 0.2 * edge);
	// seams
	c *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.03, abs(u - 0.5) - 0.47));
	ALBEDO = c;
	ALPHA = mix(0.78, 0.92, edge);
}
