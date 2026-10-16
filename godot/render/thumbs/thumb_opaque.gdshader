// A part picture's plating (src/render/partPreview.ts opaqueMat: bake.ts vertexPBR): colour,
// metalness and roughness per material key from the paint. No damage, no contact shadows.
shader_type spatial;
render_mode cull_back;

// per material key: linear colour and metalness, then roughness (BotModel's surf and rough)
uniform vec4 surf[12];
uniform float rough[12];

varying flat float v_key;

void vertex() {
	v_key = CUSTOM0.x;
}

void fragment() {
	int k = int(v_key + 0.5);
	ALBEDO = surf[k].rgb;
	METALLIC = surf[k].a;
	ROUGHNESS = rough[k];
}
