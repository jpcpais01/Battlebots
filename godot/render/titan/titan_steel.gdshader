// The Titan Colosseum's steelwork (titan_build.gd roof() and the screens' frames): painted steel
// girders, masts and stays, and the floodlight faces on the roof's front ring. Unshaded, lit by the
// venue's sun and sky (titan_common). UV2.x: 0 steel, 1 floodlights, 2 stays (cables).
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

varying vec3 v_w;
varying vec3 v_n;
varying vec2 v_pat;

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_pat = UV2;
}

void fragment() {
	vec3 p = v_w;
	vec3 nrm = normalize(v_n);
	vec3 albedo = vec3(0.26, 0.28, 0.31);
	vec3 glow = vec3(0.0);
	if (v_pat.x > 0.5 && v_pat.x < 1.5) {
		// banks of floodlights along the front ring
		float a = atan(p.z, p.x) * 42.5;
		vec2 cell = vec2(fract(a * 1.1), fract((p.y - 25.5) * 3.0));
		float lamp = step(0.12, cell.x) * step(cell.x, 0.88) * step(0.15, cell.y) * step(cell.y, 0.85);
		albedo = vec3(0.05);
		glow = vec3(1.0, 0.93, 0.8) * lamp * (2.2 + bb_flash * 3.0);
	} else if (v_pat.x > 1.5) {
		albedo = vec3(0.12);
	}
	// a sheen along the girders where the low sun catches them
	vec3 v = normalize(p - CAMERA_POSITION_WORLD);
	float spec = pow(max(dot(reflect(v, nrm), T_SUN_DIR), 0.0), 24.0) * 0.6;
	float sun_k = t_rim_light(p + nrm * 0.1);
	ALBEDO = albedo * t_light(p, nrm, sun_k) + T_SUN_COL * spec * sun_k * 0.3 + glow;
}
