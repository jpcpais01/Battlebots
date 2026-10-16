// Robot lights: accent strips, the power core and rarity trim, unlit and bright enough to bloom.
shader_type spatial;
render_mode unshaded, shadows_disabled;

uniform vec4 bones[93];
// 0 accent, 1 core, then one per slot's rarity colour
uniform vec4 cols[8];

varying flat float v_ch;

void vertex() {
	int code = int(CUSTOM1.x + 0.5);
	int b = code & 31;
	vec4 r0 = bones[b * 3];
	vec4 r1 = bones[b * 3 + 1];
	vec4 r2 = bones[b * 3 + 2];
	vec4 v = vec4(VERTEX, 1.0);
	VERTEX = vec3(dot(r0, v), dot(r1, v), dot(r2, v));
	int ch = int(CUSTOM0.x + 0.5);
	v_ch = float(ch < 2 ? ch : 2 + (code >> 9));
}

void fragment() {
	ALBEDO = cols[int(v_ch + 0.5)].rgb;
}
