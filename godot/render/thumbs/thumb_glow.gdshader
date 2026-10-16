// A part picture's lights (src/render/partPreview.ts glowMat): accent strips, the power core and
// the rarity trim, unlit, in the bot's colours (botModel.ts botGlows).
shader_type spatial;
render_mode unshaded, cull_back, shadows_disabled;

// 0 accent, 1 core, then each rarity's colour
uniform vec4 cols[8];

varying flat float v_ch;

void vertex() {
	int ch = int(CUSTOM0.x + 0.5);
	v_ch = float(ch < 2 ? ch : 2 + int(CUSTOM1.x + 0.5));
}

void fragment() {
	ALBEDO = cols[int(v_ch + 0.5)].rgb;
}
