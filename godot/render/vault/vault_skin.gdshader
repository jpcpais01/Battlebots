// The featured skin, in the round (vault_stage.gd): a ball of armour plating wearing today's
// featured Epic in its display case, drawn by the same patterns as the robots
// (skin.gdshaderinc) at the robots' scale. Skins.apply() fills skin_kind/skin_c/skin_p.
shader_type spatial;

#include "res://render/skins/skin.gdshaderinc"

uniform ivec2 skin_kind = ivec2(0);
uniform vec4 skin_c[8];
uniform vec4 skin_p[2];

varying vec3 v_p;
varying vec3 v_n;

void vertex() {
	v_p = VERTEX;
	v_n = NORMAL;
}

void fragment() {
	vec3 rn = normalize(v_n);
	vec3 p = v_p + vec3(3.1, 1.7, 2.3);
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 vw = normalize((INV_VIEW_MATRIX * vec4(VIEW, 0.0)).xyz);
	SkinOut base = SkinOut(vec3(0.5), 0.3, 0.4, vec3(0.0), 0.0);
	float sec = step(0.62, abs(rn.y + sin(rn.x * 3.0) * 0.08));
	SkinOut o = skin_eval(skin_kind.x, skin_c[0], skin_c[1], skin_c[2], skin_c[3], skin_p[0], p, rn, nw, vw, TIME, sec, base);
	ALBEDO = o.albedo;
	METALLIC = o.metal;
	ROUGHNESS = clamp(o.rough, 0.05, 1.0);
	EMISSION = o.emit;
}
