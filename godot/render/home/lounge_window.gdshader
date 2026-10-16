// The lounge's window (src/render/home/lounge.ts WIN_FRAG): the city at night seen through rainy
// glass. The street and the skyline are two planes far behind the glass (so they shift properly
// as the camera moves). Drops run down the glass leaving trails of beads, little beads come and go,
// and through the drops the city is sharp and bent while the misted glass round them blurs it.
shader_type spatial;
render_mode unshaded, cull_back, shadows_disabled, fog_disabled;

global uniform float bb_time;
uniform sampler2D near : source_color, filter_linear_mipmap, repeat_disable;
uniform sampler2D near_fx : filter_linear_mipmap, repeat_disable;
uniform sampler2D far : source_color, filter_linear_mipmap, repeat_disable;
uniform sampler2D noise : filter_linear_mipmap, repeat_enable;
// lightning behind the clouds (0..~1.4)
uniform float flash = 0.0;
// RenderSettings.glow(1.6): how hard the city's bright lights bloom
uniform float glow = 1.6;
uniform vec3 warm = vec3(1.0, 0.62, 0.32);
// the Low tier: no little beads
uniform bool low = false;

varying vec3 w_pos;

void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

// drops running down the glass, each with its trail of beads: xy bends the view, z is how wet
vec3 runners(vec2 p, float t) {
	vec2 q = p * vec2(2.3, 1.9);
	float col = floor(q.x);
	q.y += t * 0.05 + h21(vec2(col, 3.7)) * 7.0;
	vec2 id = floor(q);
	vec2 f = fract(q) - 0.5;
	float n = h21(id);
	float ph = fract(t * (0.09 + 0.12 * n) + n * 7.3);
	float y = 0.42 - 0.84 * ph * ph;
	float x = (n - 0.5) * 0.55 + 0.05 * sin(f.y * 9.0 + n * 40.0);
	vec2 d = (f - vec2(x, y)) * vec2(1.0, 0.85);
	float drop = 1.0 - smoothstep(0.045, 0.07, length(d));
	float tr = smoothstep(y - 0.01, y + 0.04, f.y) * (1.0 - 0.75 * smoothstep(y, 0.5, f.y));
	float by = fract(f.y * 9.0 + n) - 0.5;
	float bead = (1.0 - smoothstep(0.012, 0.03, length(vec2(f.x - x, by / 9.0)))) * tr * step(0.2, fract(n * 31.0 + floor(f.y * 9.0) * 0.37));
	float trail = (1.0 - smoothstep(0.0, 0.02, abs(f.x - x))) * tr * 0.35;
	return vec3(d * drop * 1.6 + vec2(f.x - x, by / 9.0) * bead, max(drop, max(bead, trail)));
}

// beads that gather on the glass, sit a while and run off
vec3 beads(vec2 p, float t) {
	vec2 q = p * vec2(24.0, 21.0);
	vec2 id = floor(q);
	vec2 f = fract(q) - 0.5;
	float n = h21(id);
	vec2 c = (vec2(n, fract(n * 13.7)) - 0.5) * 0.6;
	float life = fract(t * 0.04 + n * 5.0);
	float r = max(0.002, (0.16 + 0.22 * fract(n * 7.1)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.8, 1.0, life)));
	vec2 d = f - c;
	float m = (1.0 - smoothstep(r * 0.45, r, length(d))) * step(0.35, n);
	return vec3(d * m * 0.6, m);
}

void fragment() {
	float t = bb_time;
	vec3 dir = normalize(w_pos - CAMERA_POSITION_WORLD);
	vec3 run = runners(w_pos.xy, t);
	vec3 bd = low ? vec3(0.0) : beads(w_pos.xy, t);
	float wet = clamp(run.z + bd.z, 0.0, 1.0);
	vec2 bend = run.xy + bd.xy;
	// a drop flips and sharpens what's behind it; the misted glass blurs it
	vec3 dn = normalize(dir - vec3(bend * 0.9, 0.0));
	float blur = mix(2.4, 0.0, wet);
	vec3 h_n = w_pos + dn * (22.0 / max(-dn.z, 0.05));
	vec2 nuv = vec2(h_n.x / 64.0 + 0.5, (h_n.y + 26.0) / 40.0);
	vec4 nr = texture(near, nuv, blur);
	// across the street people come and go: a few windows go dark and light up again, some
	// flicker blue with a television; the masts' beacons blink
	vec3 fm = texture(near_fx, nuv, blur).rgb;
	if (fm.r > 0.02) {
		float ph = clamp(fm.g / fm.r, 0.0, 1.0);
		float slot = floor(t / (6.0 + 10.0 * fract(ph * 7.3)) + ph * 23.0);
		float off = step(0.5, h21(vec2(ph * 97.0, slot)));
		float tv = step(0.86, ph);
		vec3 k = mix(vec3(1.0 - 0.85 * off), vec3(0.55, 0.72, 1.3) * (0.75 + 0.35 * sin(t * 6.0 + ph * 50.0) * sin(t * 1.7 + ph * 20.0)), tv);
		nr.rgb *= mix(vec3(1.0), k, min(1.0, fm.r * 1.5));
	}
	nr.rgb *= 1.0 + fm.b * (3.6 * pow(max(0.0, sin(t * 2.2 + nuv.x * 40.0)), 12.0) - 0.85);
	vec3 h_f = w_pos + dn * (160.0 / max(-dn.z, 0.05));
	vec2 uv_f = vec2(h_f.x / 420.0 + 0.37, (h_f.y + 40.0) / 120.0);
	vec3 far_c = texture(far, uv_f, blur).rgb;
	// planes crossing the sky far off, their lights blinking
	for (int i = 0; i < 2; i++) {
		float fi = float(i);
		float u = fract(t / (70.0 + 30.0 * fi) + fi * 0.37);
		vec2 ap = vec2(mix(-0.14, 0.44, fi > 0.5 ? 1.0 - u : u), 0.55 + 0.1 * fi + 0.03 * u);
		vec2 d = (uv_f - ap) * vec2(420.0, 120.0);
		float dot1 = exp(-dot(d, d) / (0.16 + blur * 0.5));
		float blink = step(0.88, fract(t * 1.1 + fi * 0.5));
		far_c += (vec3(0.9, 0.85, 0.75) * 0.5 + vec3(2.2, 0.35, 0.25) * blink) * dot1;
	}
	// lightning behind the clouds
	far_c += vec3(0.55, 0.6, 0.85) * flash * (0.25 + 0.75 * smoothstep(0.34, 0.9, uv_f.y));
	vec3 city = mix(far_c, nr.rgb, nr.a);
	float lum = max(city.r, max(city.g, city.b));
	city *= mix(1.0, glow, smoothstep(0.4, 1.0, lum));
	// rain falling past outside, lit by the city
	float st = texture(noise, vec2((w_pos.x + dir.x * 2.5) * 6.0, (w_pos.y + dir.y * 2.5) * 0.16 + t * 0.9)).g;
	city += vec3(0.5, 0.58, 0.75) * smoothstep(0.66, 0.92, st) * 0.1 * (1.0 - wet);
	// misted glass, thicker low down and round the frames, in patches: a little grey, and the
	// room's lamps faintly reflected in it
	float ex = abs(fract((w_pos.x + 3.6) / 1.8 + 0.5) - 0.5) * 1.8;
	float mist = 0.24 + 0.34 * (1.0 - smoothstep(0.35, 1.1, w_pos.y)) + 0.14 * (1.0 - smoothstep(0.0, 0.22, ex));
	mist += 0.16 * (texture(noise, w_pos.xy * vec2(0.35, 0.5)).b - 0.5);
	mist = clamp(mist, 0.12, 0.72);
	city = mix(city, vec3(0.06, 0.07, 0.09) + city * 0.7, mist * (1.0 - wet));
	city += warm * 0.03 * (1.0 - wet);
	// drops catch the lamp light on their upper edge
	float rim = pow(max(0.0, dot(normalize(bend + 1e-4), vec2(-0.45, 0.9))), 6.0) * wet;
	city += warm * rim * 0.5;
	ALBEDO = city;
}
