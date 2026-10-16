// Text filled with a top-to-bottom gradient (style.css background-clip: text: the logo's BOTS,
// the results verdict). The gradient spans the control's own box, as the web's spans the line.
shader_type canvas_item;

uniform vec4 top : source_color = vec4(1.0);
uniform vec4 bottom : source_color = vec4(1.0);
uniform float height = 40.0;
uniform float y0 = 0.0;

varying float ly;

void vertex() {
	ly = VERTEX.y;
}

void fragment() {
	float k = clamp((ly - y0) / max(height, 1.0), 0.0, 1.0);
	COLOR.rgb = mix(top.rgb, bottom.rgb, k);
}
