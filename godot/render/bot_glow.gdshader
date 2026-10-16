// Robot lights: accent strips, the power core and rarity trim, unlit and bright enough to bloom.
// They ride the bent plating they're set in, and a damaged part's lights dim, then sputter
// (damageLook.ts patchDamageGlow).
shader_type spatial;
render_mode unshaded, shadows_disabled;

#include "res://render/bot/bot_damage.gdshaderinc"

uniform vec4 bones[93];
// 0 accent, 1 core, then one per slot's rarity colour
uniform vec4 cols[8];
uniform float time = 0.0;

varying flat float v_ch;
varying float v_glow_k;

void vertex() {
	int code = int(CUSTOM1.x + 0.5);
	int b = code & 31;
	float part = float((code >> 5) & 15);
	float w = wear[int(part)];
	vec3 dp;
	float db;
	dmg_rest(VERTEX, b, dp, db);
	float cav = 0.0;
	vec4 v = vec4(VERTEX + dmg_deform(dp, db, w, cav), 1.0);
	float k = 1.0 - w * 0.55;
	if (w > 0.45) {
		// sputter: drop out in random beats, more often the worse it gets
		float beat = floor(time * 9.0 + part * 3.1);
		float h = fract(sin(beat * 12.9898 + part * 78.233) * 43758.5453);
		k *= step((w - 0.45) * 1.4, h) * 0.85 + 0.15;
	}
	v_glow_k = w >= 0.999 ? 0.05 : k;
	vec4 r0 = bones[b * 3];
	vec4 r1 = bones[b * 3 + 1];
	vec4 r2 = bones[b * 3 + 2];
	VERTEX = vec3(dot(r0, v), dot(r1, v), dot(r2, v));
	int ch = int(CUSTOM0.x + 0.5);
	v_ch = float(ch < 2 ? ch : 2 + (code >> 9));
}

void fragment() {
	ALBEDO = cols[int(v_ch + 0.5)].rgb * v_glow_k;
}
