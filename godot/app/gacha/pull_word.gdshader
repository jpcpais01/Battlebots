// A reveal's rarity word (pull_show.gd): text filled top to bottom with the rarity's gradient (as
// app/ui/text_grad.gdshader), a band of white light sweeping across it (`sweep`: its x, in the
// label's pixels; `band` its width).
shader_type canvas_item;

uniform vec4 top : source_color = vec4(1.0);
uniform vec4 bottom : source_color = vec4(1.0);
uniform float height = 40.0;
uniform float y0 = 0.0;
uniform float sweep = -999.0;
uniform float band = 60.0;

varying vec2 lp;

void vertex() {
	lp = VERTEX;
}

void fragment() {
	float k = clamp((lp.y - y0) / max(height, 1.0), 0.0, 1.0);
	vec3 c = mix(top.rgb, bottom.rgb, k);
	// (slanted, like light off a blade)
	float d = abs(lp.x - sweep + (lp.y - y0) * 0.35);
	float shine = exp(-d * d / (band * band) * 4.0);
	COLOR.rgb = mix(c, vec3(1.0), shine * 0.85);
}
