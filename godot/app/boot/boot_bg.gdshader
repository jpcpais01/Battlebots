// The loading screen's backdrop (index.html .boot): the deep blue sky, two slow pools of light
// drifting through it, the ribbons of light flowing low across the screen, the vignette and a fine
// grain. One full-screen pass, only while the game loads. Colours are the web's (2D is sRGB).
shader_type canvas_item;

// the screen's size in canvas units (the ribbons' lines are a fixed width in those)
uniform vec2 size = vec2(1280.0, 720.0);
// seconds since the screen came up (the CSS animations' clock)
uniform float t = 0.0;

vec3 hex(int c) {
	return vec3(float((c >> 16) & 255), float((c >> 8) & 255), float(c & 255)) / 255.0;
}

// CSS ease-in-out, played forwards then backwards (animation-direction: alternate)
float drift(float time, float dur, float delay, bool reverse) {
	float u = (time - delay) / dur;
	float k = mod(u, 2.0);
	k = k > 1.0 ? 2.0 - k : k;
	if (reverse) k = 1.0 - k;
	return k * k * (3.0 - 2.0 * k);
}

// a radial-gradient(closest-side, c, transparent) pool of light: centre and radii in screen units
float pool(vec2 p, vec2 c, vec2 r) {
	return clamp(1.0 - length((p - c) / r), 0.0, 1.0);
}

// one bundle of ribbons (index.html strip()): n waves, each a sum of two sines repeating every 800
// units of a 1600-unit strip twice the screen's width, sliding half its width every `dur` seconds
vec4 strip(vec2 px, float band_top, float band_h, int n, float base, float p0, vec3 col, float w, float dur) {
	float sx = size.x / 800.0;
	float sy = band_h / 300.0;
	// (every wave stays between 60 and 285 of the band's 300 units: nothing to draw outside them,
	// which is most of the screen)
	if (px.y < band_top + 60.0 * sy - 2.0 || px.y > band_top + 285.0 * sy + 2.0) {
		return vec4(col, 0.0);
	}
	float slide = fract(t / dur);
	float X = (px.x / size.x + slide) * 800.0;
	float line = 0.0;
	float first = 0.0;
	float last = 0.0;
	// each wave's phases step by a fixed angle from the last one's, so the sines are carried
	// along by rotation rather than worked out afresh (a phone's GPU pays per pixel for each)
	float b1 = TAU * X / 800.0 + p0;
	float b2 = TAU * X / 400.0 + p0 * 1.7;
	vec2 r1 = vec2(sin(b1), cos(b1));
	vec2 r2 = vec2(sin(b2), cos(b2));
	vec2 ra = vec2(sin(1.57079633 / float(n)), cos(1.57079633 / float(n)));
	vec2 d1 = vec2(sin(0.16), cos(0.16));
	vec2 d2 = vec2(sin(-0.22), cos(-0.22));
	vec2 da = vec2(sin(3.14159265 / float(n)), cos(3.14159265 / float(n)));
	for (int i = 0; i < 8; i++) {
		if (i >= n) break;
		float fi = float(i);
		float a1 = 58.0 - fi * 5.0;
		float a2 = 14.0 + fi * 2.0;
		float y = base + fi * 7.0 + a1 * r1.x + a2 * r2.x;
		float dy = a1 * r1.y * TAU / 800.0 + a2 * r2.y * TAU / 400.0;
		float ypx = band_top + y * sy;
		if (i == 0) first = ypx;
		last = ypx;
		float slope = dy * sy / sx;
		float d = abs(px.y - ypx) * inversesqrt(1.0 + slope * slope);
		float a = 0.1 + 0.45 * ra.x;
		line = max(line, a * clamp(w * 0.5 + 0.5 - d, 0.0, 1.0));
		r1 = vec2(r1.x * d1.y + r1.y * d1.x, r1.y * d1.y - r1.x * d1.x);
		r2 = vec2(r2.x * d2.y + r2.y * d2.x, r2.y * d2.y - r2.x * d2.x);
		ra = vec2(ra.x * da.y + ra.y * da.x, ra.y * da.y - ra.x * da.x);
	}
	float sheet = (px.y - min(first, last)) * (max(first, last) - px.y) > 0.0 ? 0.06 : 0.0;
	float alpha = 1.0 - (1.0 - line) * (1.0 - sheet);
	return vec4(col, alpha);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = UV;
	vec2 px = uv * size;
	// radial-gradient(120% 90% at 50% 120%, #0d2266 0%, #071240 34%, #040a24 62%, #03050d 100%)
	float g = length((uv - vec2(0.5, 1.2)) / vec2(1.2, 0.9));
	vec3 c = mix(hex(0x0d2266), hex(0x071240), clamp(g / 0.34, 0.0, 1.0));
	c = mix(c, hex(0x040a24), clamp((g - 0.34) / 0.28, 0.0, 1.0));
	c = mix(c, hex(0x03050d), clamp((g - 0.62) / 0.38, 0.0, 1.0));
	// radial-gradient(55% 50% at 50% 46%, rgba(40, 92, 220, 0.3), transparent 70%)
	float h = length((uv - vec2(0.5, 0.46)) / vec2(0.55, 0.5));
	c = mix(c, vec3(40.0, 92.0, 220.0) / 255.0, 0.3 * clamp(1.0 - h / 0.7, 0.0, 1.0));
	// the two pools of light (.bt-aura), drifting 10vw, 7vh and growing 15%
	float k1 = drift(t, 21.0, 0.0, false);
	vec2 c1 = (vec2(0.2, 0.1) + vec2(0.1, 0.07) * k1) * size;
	c = mix(c, vec3(70.0, 110.0, 255.0) / 255.0, 0.22 * pool(px, c1, vec2(0.45, 0.5) * size * (1.0 + 0.15 * k1)));
	float k2 = drift(t, 27.0, -9.0, true);
	vec2 c2 = (vec2(0.875, 0.9) + vec2(0.1, 0.07) * k2) * size;
	c = mix(c, vec3(140.0, 80.0, 255.0) / 255.0, 0.16 * pool(px, c2, vec2(0.425, 0.45) * size * (1.0 + 0.15 * k2)));
	// the ribbons (.bt-waves: 52vh tall, 2vh off the bottom, faded out at both sides, 0.9 opaque)
	float band_h = 0.52 * size.y;
	float band_top = size.y * 0.98 - band_h;
	float mask = smoothstep(0.0, 0.15, uv.x) * (1.0 - smoothstep(0.85, 1.0, uv.x)) * 0.9;
	vec4 b = strip(px, band_top, band_h, 6, 170.0, 2.6, hex(0x9a8cff), 1.0, 47.0);
	c = mix(c, b.rgb, b.a * mask);
	vec4 a = strip(px, band_top, band_h, 8, 140.0, 0.4, hex(0xa8d8ff), 1.1, 30.0);
	c = mix(c, a.rgb, a.a * mask);
	// fine grain (no banding in the dark gradients), then the vignette
	c = mix(c, vec3(1.0), 0.035 * 0.9 * hash(floor(px)));
	float v = length((uv - vec2(0.5, 0.48)) / vec2(0.8, 0.75));
	c *= 1.0 - 0.6 * clamp((v - 0.5) / 0.5, 0.0, 1.0);
	COLOR = vec4(c, 1.0);
}
