// The centre-hung screens (venue.ts screenMat: MeshBasicMaterial, map = the Scoreboard canvas,
// colour = glow 1.3, not tone mapped, fogged). The map is Scoreboard's SubViewport, which holds
// sRGB-encoded 2D: decoded here by hand, since a viewport texture skips the source_color decode
// on the Compatibility renderer.
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"

uniform sampler2D map : filter_linear, repeat_disable;
uniform vec3 color = vec3(1.3);

vec3 srgb_to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void fragment() {
	// (the baked canvas was bottom row first for three's uvs; a viewport's top row is first)
	ALBEDO = color * srgb_to_linear(texture(map, vec2(UV.x, 1.0 - UV.y)).rgb);
	FOG = bb_fog(VERTEX);
}
