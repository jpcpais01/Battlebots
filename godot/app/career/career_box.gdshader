// A CSS box in one draw (CareerBox's fill): a rounded rectangle filled with a linear or radial
// gradient (style.css/careerUi.css `background: linear-gradient(...)`), its border (with a thicker
// coloured top, `border-top: 3px solid`) and the cr-drop card's shine sweeping across it.
// Colours are the canvas's own sRGB values, mixed premultiplied as browsers mix gradients.
shader_type canvas_item;

uniform vec2 size = vec2(100.0, 100.0);
uniform float radius = 16.0;
uniform vec4 c0 = vec4(1.0);
uniform vec4 c1 = vec4(1.0);
uniform vec4 c2 = vec4(1.0);
uniform vec4 c3 = vec4(1.0);
// the stops along the gradient (0..1): c0 at s0, c1 at s1, c2 at s2, c3 at s3. s1 < 0: c0 to c2
// only; s3 < 0: no fourth stop (a hard stop is two at one place)
uniform float s0 = 0.0;
uniform float s1 = -1.0;
uniform float s2 = 1.0;
uniform float s3 = -1.0;
// CSS degrees: 180 runs top to bottom, 90 left to right
uniform float angle = 180.0;
// radial-gradient(circle at centre, ...): the gradient runs out to `reach` of the box's width
uniform bool radial = false;
uniform vec2 centre = vec2(0.5, 0.5);
uniform float reach = 0.5;
uniform vec4 border = vec4(0.0);
uniform float border_w = 0.0;
uniform vec4 top = vec4(0.0);
uniform float top_w = 0.0;
// the shine band's centre across the box, -1 (off the left) .. 2 (off the right)
uniform float shine = -9.0;
// box-shadow: 0 off blur colour, outside the box only (as CSS clips it); the fill's rect reaches
// `margin` past the box on every side to have room for it
uniform vec4 glow_c = vec4(0.0);
uniform float glow_b = 0.0;
uniform vec2 glow_off = vec2(0.0);
uniform float margin = 0.0;

vec4 pm(vec4 c) { return vec4(c.rgb * c.a, c.a); }

// the vertex colour (modulate: the box fading in and out)
varying vec4 tint;

void vertex() {
	tint = COLOR;
}

void fragment() {
	vec2 p = UV * (size + 2.0 * margin) - margin;
	vec2 h = size * 0.5;
	vec2 q = abs(p - h) - (h - vec2(radius));
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	float aa = max(fwidth(d), 1e-4);
	float inside = clamp(0.5 - d / aa, 0.0, 1.0);
	float t;
	if (radial) {
		t = length(p - centre * size) / max(reach * size.x, 1.0);
	} else {
		float a = radians(angle);
		vec2 dir = vec2(sin(a), -cos(a));
		float len = abs(size.x * dir.x) + abs(size.y * dir.y);
		t = dot(p - h, dir) / max(len, 1.0) + 0.5;
	}
	vec4 col;
	if (s1 < 0.0) {
		col = mix(pm(c0), pm(c2), clamp((t - s0) / max(s2 - s0, 1e-4), 0.0, 1.0));
	} else if (t < s1) {
		col = mix(pm(c0), pm(c1), clamp((t - s0) / max(s1 - s0, 1e-4), 0.0, 1.0));
	} else if (s3 < 0.0 || t < s2) {
		col = mix(pm(c1), pm(c2), clamp((t - s1) / max(s2 - s1, 1e-4), 0.0, 1.0));
	} else {
		col = mix(pm(c2), pm(c3), clamp((t - s2) / max(s3 - s2, 1e-4), 0.0, 1.0));
	}
	if (shine > -5.0) {
		// linear-gradient(105deg, transparent 35%, white .35 50%, transparent 65%), slid across
		float x = (p.x + (h.y - p.y) * 0.268) / size.x - shine;
		float k = max(0.0, 1.0 - abs(x) / 0.15) * 0.35;
		col = vec4(k) + col * (1.0 - k);
	}
	// the border: a hairline round the sides, the top one thicker in its own colour
	float bw = max(border_w, 0.0);
	if (bw > 0.0 || top_w > 0.0) {
		vec2 ih = h - vec2(bw, 0.0);
		float ty = max(top_w, bw);
		vec2 ic = vec2(h.x, (ty + size.y - bw) * 0.5);
		vec2 ihs = vec2(h.x - bw, (size.y - bw - ty) * 0.5);
		float ir = max(radius - bw, 0.0);
		vec2 iq = abs(p - ic) - (ihs - vec2(ir));
		float id = length(max(iq, 0.0)) + min(max(iq.x, iq.y), 0.0) - ir;
		float edge = clamp(0.5 + id / aa, 0.0, 1.0);
		vec4 bc = (top_w > 0.0 && p.y < ty + radius * 0.5) ? top : border;
		col = mix(col, pm(bc) + col * (1.0 - bc.a), edge);
	}
	col *= inside;
	if (glow_c.a > 0.0) {
		// a blur of `glow_b` is a gaussian of sigma glow_b / 2: about half at the edge, gone by glow_b
		vec2 gq = abs(p - glow_off - h) - (h - vec2(radius));
		float gd = length(max(gq, 0.0)) + min(max(gq.x, gq.y), 0.0) - radius;
		float g = glow_c.a * (1.0 - smoothstep(-glow_b, glow_b, gd)) * (1.0 - inside);
		col += vec4(glow_c.rgb * g, g);
	}
	COLOR = vec4(col.a > 0.0 ? col.rgb / col.a : vec3(0.0), col.a) * tint;
}
