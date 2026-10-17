// The referee drone's two fans (render/referee/referee.gd): a disc in each duct, drawn as the
// blur of a spinning two-blade prop, with the slow strobing turn a camera's shutter gives it.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;
#include "res://render/venue/common.gdshaderinc"
#include "res://render/referee/referee.gdshaderinc"

varying vec2 v_uv;
varying float v_side;

void vertex() {
	int b = int(CUSTOM0.x + 0.5);
	v_uv = UV;
	v_side = b == 1 ? 1.0 : -1.0;
	VERTEX = ref_bone_point(b, VERTEX);
}

void fragment() {
	float r = length(v_uv);
	float a = atan(v_uv.y, v_uv.x) - TIME * 2.3 * v_side;
	float blade = pow(abs(cos(a)), 10.0);
	float ghost = pow(abs(cos(a + 0.5 * v_side)), 6.0) * 0.4;
	float disc = smoothstep(1.0, 0.94, r) * smoothstep(0.16, 0.24, r);
	float tip = smoothstep(0.08, 0.0, abs(r - 0.93)) * 0.25;
	ALBEDO = vec3(0.62, 0.68, 0.74);
	ALPHA = clamp((0.07 + 0.3 * max(blade, ghost)) * disc + tip, 0.0, 1.0) * 0.8;
	FOG = bb_fog(VERTEX);
}
