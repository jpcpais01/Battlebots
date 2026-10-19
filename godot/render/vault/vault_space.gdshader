// The Skin Vault's sky (render/vault/vault_stage.gd): deep space round the floating platform.
// Violet night overhead deepening to indigo below, slow drifting nebulae in magenta and teal, a
// field of twinkling stars, a banded ringed planet hanging over the machine, a small moon, and
// now and then a shooting star. Drawn behind everything (as far as the lens reaches).
shader_type spatial;
render_mode unshaded, cull_front, depth_draw_never, fog_disabled, shadows_disabled;

// the planet's direction and size (radians), and how strongly the nebulae glow
uniform vec3 planet_dir = vec3(-0.55, 0.42, -0.72);
uniform float planet_r = 0.2;
uniform float nebula = 1.0;
// a flash over the whole sky (a burst)
uniform float flash = 0.0;
uniform vec3 flash_col = vec3(1.0, 0.8, 0.4);

varying vec3 v_dir;

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 ray = normalize(w - CAMERA_POSITION_WORLD);
	v_dir = ray;
	POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(CAMERA_POSITION_WORLD + ray * 110.0, 1.0));
}

float hash3(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise3(p);
		p = p * 2.03 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return v;
}

// stars: one per cell of a grid on the direction, some bright, all twinkling
vec3 stars(vec3 d, float scale, float t) {
	vec3 p = d * scale;
	vec3 c = floor(p);
	vec3 f = fract(p) - 0.5;
	float h = hash3(c);
	vec3 o = vec3(hash3(c + 3.1), hash3(c + 7.7), hash3(c + 1.3)) - 0.5;
	float r = length(f - o * 0.7);
	float lit = step(0.72, h);
	float tw = 0.55 + 0.45 * sin(t * (1.5 + h * 4.0) + h * 40.0);
	float core = exp(-r * r * 900.0) * 3.5 + exp(-r * r * 90.0) * 0.25;
	vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.8, 0.95), hash3(c + 9.0));
	return tint * core * lit * tw * (0.4 + h * 0.8);
}

void fragment() {
	vec3 d = normalize(v_dir);
	float t = TIME;
	float y = d.y;
	// the night: violet overhead, a magenta haze round the horizon, indigo deep below
	vec3 col = mix(vec3(0.012, 0.006, 0.04), vec3(0.03, 0.01, 0.07), smoothstep(-0.2, 0.9, y));
	col += vec3(0.16, 0.025, 0.14) * exp(-abs(y + 0.05) * 6.0);
	col += vec3(0.02, 0.05, 0.12) * exp(-abs(y - 0.25) * 3.0) * 0.6;
	// nebulae: two drifting layers of cloud
	vec3 q = d * 2.2 + vec3(t * 0.006, 0.0, t * 0.004);
	float n1 = fbm(q);
	float n2 = fbm(q * 1.7 + vec3(4.0, 1.0, 2.0) + n1 * 1.3);
	float cloud = smoothstep(0.42, 0.85, n2);
	vec3 neb = mix(vec3(0.9, 0.12, 0.6), vec3(0.08, 0.6, 0.8), smoothstep(0.35, 0.75, n1));
	col += neb * cloud * cloud * 0.55 * nebula * (0.6 + 0.4 * smoothstep(-0.4, 0.5, y));
	// dark dust lanes through them
	col *= 1.0 - 0.6 * smoothstep(0.55, 0.8, fbm(q * 3.1 + 11.0)) * cloud;
	// the stars, in two sizes
	col += stars(d, 90.0, t) + stars(d, 210.0, t * 1.3) * 0.5;
	// the ringed planet
	vec3 pd = normalize(planet_dir);
	vec3 pu = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
	vec3 pv = cross(pu, pd);
	vec2 uv = vec2(dot(d, pu), dot(d, pv)) / planet_r;
	float front = dot(d, pd);
	float rr = length(uv);
	// its rings: an ellipse round it, tilted, behind and in front of the globe
	mat2 tilt = mat2(vec2(cos(0.38), sin(0.38)), vec2(-sin(0.38), cos(0.38)));
	vec2 ru = tilt * uv;
	float re = length(vec2(ru.x, ru.y / 0.26));
	float ring = smoothstep(1.35, 1.45, re) * (1.0 - smoothstep(2.25, 2.35, re));
	ring *= 0.55 + 0.45 * sin(re * 38.0) * sin(re * 11.0 + 1.0);
	ring *= step(0.0, front);
	vec3 ring_col = vec3(0.85, 0.65, 0.95) * ring * 0.55;
	bool ring_front = ru.y < 0.0;
	if (rr < 1.0 && front > 0.0) {
		// a banded gas giant lit from the upper right
		vec3 n = vec3(uv, sqrt(1.0 - rr * rr));
		float lit = clamp(dot(n, normalize(vec3(0.6, 0.5, 0.6))), 0.0, 1.0);
		float bands = fbm(vec3(uv.y * 6.0 + sin(uv.x * 3.0) * 0.2, uv.x * 0.5 + t * 0.003, 1.0));
		vec3 pc = mix(vec3(0.95, 0.42, 0.55), vec3(1.0, 0.78, 0.5), smoothstep(0.3, 0.7, bands));
		pc = mix(pc, vec3(0.45, 0.25, 0.75), smoothstep(0.6, 0.9, sin(uv.y * 9.0 + bands * 3.0) * 0.5 + 0.5) * 0.5);
		vec3 planet = pc * (lit * 0.85 + 0.04) + vec3(0.6, 0.3, 1.0) * pow(max(1.0 - n.z, 0.0), 3.0) * 0.6;
		// the rings' shadow across it
		planet *= 1.0 - 0.5 * smoothstep(0.08, 0.0, abs(ru.y + 0.12));
		col = planet;
		if (ring_front) {
			col += ring_col;
		}
	} else {
		col += ring_col;
		// a soft atmosphere round its rim
		col += vec3(0.7, 0.3, 0.9) * exp(-max(rr - 1.0, 0.0) * 9.0) * 0.35 * step(0.0, front);
	}
	// a small moon
	vec3 md = normalize(vec3(0.75, 0.55, -0.4));
	vec3 mu = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
	vec2 muv = vec2(dot(d, mu), dot(d, cross(mu, md))) / 0.045;
	float mr = length(muv);
	if (mr < 1.0 && dot(d, md) > 0.0) {
		vec3 mn = vec3(muv, sqrt(1.0 - mr * mr));
		float crater = smoothstep(0.55, 0.62, noise3(vec3(muv * 3.0, 2.0)));
		col = vec3(0.75, 0.8, 0.95) * clamp(dot(mn, normalize(vec3(-0.7, 0.3, 0.6))), 0.0, 1.0) * (1.0 - crater * 0.3) + vec3(0.02, 0.01, 0.04);
	}
	// a shooting star now and then
	float sk = floor(t / 3.7);
	float sp = fract(t / 3.7);
	vec3 s0 = normalize(vec3(hash3(vec3(sk, 1.0, 2.0)) - 0.5, 0.35 + hash3(vec3(sk, 5.0, 1.0)) * 0.4, hash3(vec3(sk, 2.0, 9.0)) - 0.5));
	vec3 sdir = normalize(cross(s0, vec3(0.3, 1.0, 0.1)));
	if (hash3(vec3(sk, 3.0, 3.0)) > 0.45 && sp < 0.3) {
		float k = sp / 0.3;
		vec3 head = normalize(s0 + sdir * k * 0.5);
		vec3 tail = normalize(s0 + sdir * max(k - 0.12, 0.0) * 0.5);
		vec3 ab = head - tail;
		float h = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
		float dist = length(d - tail - ab * h);
		col += vec3(1.0, 0.9, 1.0) * exp(-dist * dist * 4e5) * h * 3.0 * sin(PI * k);
	}
	col += flash_col * flash * (0.25 + 0.15 * smoothstep(-0.2, 0.6, y));
	ALBEDO = col;
}
