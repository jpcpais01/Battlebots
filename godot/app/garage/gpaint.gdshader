// A CSS box drawn in one pass (style.css / garageParts.css backgrounds the garage leans on): a
// rounded rectangle with a solid fill, two gradient layers (linear, radial, conic or repeating
// lines), inset shadows, a border, and outer box-shadows (a drop shadow, a glow, a solid ring).
// Layers composite in CSS order (the first listed background on top), in premultiplied colour, as
// browsers interpolate gradients. GPaint (gpaint.gd) sets it up from a CSS-like description.
shader_type canvas_item;
render_mode blend_premul_alpha;

uniform vec2 size = vec2(100.0);
// where the box's top left corner is in the item's own space (negative when it reaches out)
uniform vec2 origin = vec2(0.0);
uniform float radius = 0.0;
uniform vec4 fill = vec4(0.0);
uniform float border_w = 0.0;
uniform vec4 border_col = vec4(0.0);

// gradient layers: kind 0 none, 1 linear (angle in CSS degrees), 2 radial (centre as a fraction,
// radii in units; 0 = a circle to the farthest corner), 3 conic (from the top, clockwise),
// 4 repeating radial rings, 5 repeating vertical lines (stops in units, for 4 and 5)
uniform int a_kind = 0;
uniform int a_n = 0;
uniform vec4 a_c[7];
uniform float a_p[7];
uniform float a_angle = 180.0;
uniform vec2 a_center = vec2(0.5);
uniform vec2 a_rad = vec2(0.0);
uniform int b_kind = 0;
uniform int b_n = 0;
uniform vec4 b_c[7];
uniform float b_p[7];
uniform float b_angle = 180.0;
uniform vec2 b_center = vec2(0.5);
uniform vec2 b_rad = vec2(0.0);
uniform int s_kind = 0;
uniform int s_n = 0;
uniform vec4 s_c[3];
uniform float s_p[3];
uniform vec2 s_center = vec2(0.5);
uniform float s_period = 3.0;

// inset shadows: a band along the bottom (inset 0 -Npx 0), an inner glow (inset 0 0 blur)
uniform vec4 inset_col = vec4(0.0);
uniform float inset_h = 0.0;
uniform vec4 iglow_col = vec4(0.0);
uniform float iglow_blur = 0.0;
// outer shadows, top first as CSS lists them: a ring (0 0 0 w), a glow and a drop shadow
uniform vec4 ring_col = vec4(0.0);
uniform float ring_w = 0.0;
uniform vec4 glow_col = vec4(0.0);
uniform float glow_blur = 0.0;
uniform vec2 glow_off = vec2(0.0);
uniform vec4 drop_col = vec4(0.0);
uniform float drop_blur = 0.0;
uniform vec2 drop_off = vec2(0.0);
// the whole thing's opacity
uniform float alpha = 1.0;

varying vec2 lp;

void vertex() {
	lp = VERTEX + origin;
}

float box_sd(vec2 p, vec2 sz, float r) {
	vec2 q = abs(p - sz * 0.5) - sz * 0.5 + vec2(r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// a gaussian-blurred edge: how much of a shape `d` units outside it a blur of `blur` leaves
float soft(float d, float blur) {
	float s = max(blur * 0.5, 0.001);
	float x = d / (s * 1.41421356);
	// erfc approximation (Abramowitz and Stegun 7.1.26), halved
	float t = 1.0 / (1.0 + 0.3275911 * abs(x));
	float e = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * exp(-x * x);
	return x >= 0.0 ? 0.5 * e : 1.0 - 0.5 * e;
}

vec4 premul(vec4 c) {
	return vec4(c.rgb * c.a, c.a);
}

vec4 over(vec4 top, vec4 under) {
	return top + under * (1.0 - top.a);
}

// where along a layer this point is (0..1 for linear, radial and conic; units for repeating ones)
float layer_t(int kind, float angle, vec2 center, vec2 rad, vec2 p) {
	if (kind == 1) {
		float a = radians(angle);
		vec2 dir = vec2(sin(a), -cos(a));
		float len = abs(size.x * dir.x) + abs(size.y * dir.y);
		return dot(p - size * 0.5, dir) / max(len, 0.001) + 0.5;
	}
	vec2 c = center * size;
	if (kind == 2) {
		if (rad.x <= 0.0) {
			vec2 far = max(c, size - c);
			return length(p - c) / max(length(far), 0.001);
		}
		return length((p - c) / rad);
	}
	if (kind == 3) {
		vec2 d = p - c;
		return fract(atan(d.x, -d.y) / 6.28318531 + 1.0);
	}
	if (kind == 4) {
		return length(p - c);
	}
	return p.x;
}

vec4 ramp_a(float t) {
	vec4 c = premul(a_c[0]);
	for (int i = 1; i < 7; i++) {
		if (i >= a_n) break;
		float p0 = a_p[i - 1];
		float p1 = a_p[i];
		if (t >= p1) {
			c = premul(a_c[i]);
		} else if (t > p0) {
			c = mix(premul(a_c[i - 1]), premul(a_c[i]), (t - p0) / max(p1 - p0, 0.0001));
		}
	}
	return c;
}

vec4 ramp_b(float t) {
	vec4 c = premul(b_c[0]);
	for (int i = 1; i < 7; i++) {
		if (i >= b_n) break;
		float p0 = b_p[i - 1];
		float p1 = b_p[i];
		if (t >= p1) {
			c = premul(b_c[i]);
		} else if (t > p0) {
			c = mix(premul(b_c[i - 1]), premul(b_c[i]), (t - p0) / max(p1 - p0, 0.0001));
		}
	}
	return c;
}

void fragment() {
	// (the item's modulate, and its parents' fades, arrive in COLOR)
	vec4 vc = COLOR;
	vec2 p = lp;
	float aa = max(fwidth(p.x), 0.5);
	float d = box_sd(p, size, radius);
	float inside = clamp(0.5 - d / aa, 0.0, 1.0);
	vec4 col = premul(fill);
	if (a_kind > 0) {
		float t = layer_t(a_kind, a_angle, a_center, a_rad, p);
		if (a_kind >= 4) t = mod(t, s_period);
		col = over(ramp_a(t), col);
	}
	if (b_kind > 0) {
		float t = layer_t(b_kind, b_angle, b_center, b_rad, p);
		if (b_kind >= 4) t = mod(t, s_period);
		col = over(ramp_b(t), col);
	}
	if (s_kind > 0) {
		float t = mod(layer_t(s_kind, 0.0, s_center, vec2(0.0), p), s_period);
		vec4 sc = t < s_p[0] ? premul(s_c[0]) : premul(s_c[1]);
		col = over(sc, col);
	}
	if (inset_h > 0.0) {
		float band = clamp((p.y - (size.y - inset_h)) / aa + 0.5, 0.0, 1.0);
		col = over(premul(inset_col) * band, col);
	}
	if (iglow_blur > 0.0) {
		col = over(premul(iglow_col) * soft(-d, iglow_blur), col);
	}
	if (border_w > 0.0) {
		float b = clamp(0.5 - (-d - border_w) / aa, 0.0, 1.0);
		col = over(premul(border_col) * b, col);
	}
	col *= inside;
	// outer shadows, only outside the box (CSS clips them away under it)
	vec4 outer = vec4(0.0);
	if (drop_col.a > 0.0) {
		float dd = box_sd(p - drop_off, size, radius);
		outer = over(premul(drop_col) * soft(dd, drop_blur), outer);
	}
	if (glow_col.a > 0.0) {
		float dg = box_sd(p - glow_off, size, radius);
		outer = over(premul(glow_col) * soft(dg, glow_blur), outer);
	}
	if (ring_w > 0.0) {
		float r = clamp(0.5 - (d - ring_w) / aa, 0.0, 1.0);
		outer = over(premul(ring_col) * r, outer);
	}
	col = over(col, outer * (1.0 - inside));
	COLOR = col * alpha * vc.a;
}
