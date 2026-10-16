// A CSS-style panel in one pass (style.css .tile, .bcard, .bcard .g): a rounded rect filled with a
// linear-gradient at a CSS angle, a radial tint over it (radial-gradient(circle at x y, tint,
// transparent r)), a 1px hairline border and an optional bar fading along the top edge
// (.bcard::after). Colours are plain sRGB, blended as the browser does.
shader_type canvas_item;

uniform vec2 rect_size = vec2(64.0);
uniform float radius = 12.0;
uniform vec4 c0 : source_color = vec4(0.12, 0.14, 0.2, 0.9);
uniform vec4 c1 : source_color = vec4(0.04, 0.05, 0.08, 0.92);
// CSS degrees: 180 runs top to bottom, 90 left to right
uniform float angle = 180.0;
// where c1 is reached along the line (0..1); past it, flat c1
uniform float stop1 = 1.0;
uniform vec4 tint : source_color = vec4(0.0);
uniform vec2 tint_at = vec2(0.5, 0.38);
// the tint's fade-out, as a share of the distance to the farthest corner
uniform float tint_r = 0.7;
uniform vec4 border : source_color = vec4(1.0, 1.0, 1.0, 0.1);
uniform float border_w = 1.0;
uniform vec4 bar : source_color = vec4(0.0);
uniform float bar_h = 0.0;
// 1: the bar runs from the left edge, -1: from the right; it fades out by 70% across
uniform float bar_dir = 1.0;

float rbox(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + vec2(r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 over(vec4 under, vec4 top) {
	float a = top.a + under.a * (1.0 - top.a);
	vec3 c = (top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / max(a, 1e-5);
	return vec4(c, a);
}

void fragment() {
	vec2 p = UV * rect_size;
	vec2 h = rect_size * 0.5;
	float d = rbox(p - h, h, min(radius, min(h.x, h.y)));
	float cover = clamp(0.5 - d, 0.0, 1.0);
	// linear-gradient(angle): the line through the centre, as long as the box's shadow on it
	float a = radians(angle);
	vec2 dir = vec2(sin(a), -cos(a));
	float len = abs(rect_size.x * dir.x) + abs(rect_size.y * dir.y);
	float t = clamp(dot(p - h, dir) / len + 0.5, 0.0, 1.0);
	vec4 col = mix(c0, c1, clamp(t / max(stop1, 1e-4), 0.0, 1.0));
	// radial-gradient(circle at tint_at, tint, transparent tint_r) on top
	if (tint.a > 0.0) {
		vec2 at = tint_at * rect_size;
		vec2 far = max(at, rect_size - at);
		float k = length(p - at) / (length(far) * tint_r);
		col = over(col, vec4(tint.rgb, tint.a * clamp(1.0 - k, 0.0, 1.0)));
	}
	if (bar_h > 0.0 && p.y < bar_h) {
		float x = bar_dir > 0.0 ? UV.x : 1.0 - UV.x;
		col = over(col, vec4(bar.rgb, bar.a * clamp(1.0 - x / 0.7, 0.0, 1.0)));
	}
	if (border_w > 0.0) {
		float edge = clamp(d + border_w + 0.5, 0.0, 1.0);
		col = over(col, vec4(border.rgb, border.a * edge));
	}
	COLOR = vec4(col.rgb, col.a * cover);
}
