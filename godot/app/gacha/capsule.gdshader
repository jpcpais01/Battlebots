// The paint capsule a pull drops in (app/gacha/pull_show.gd): a gunmetal canister with chrome
// bands, studded round a seam that leaks light in the colour of what's inside (`seam`) as it
// charges, the emblem on its top lit the same, and cracks of light spreading over it before it
// bursts. `half`: 0 the whole capsule, 1 its top half only, 2 its bottom half (flying apart).
shader_type canvas_item;

uniform vec4 seam : source_color = vec4(0.55, 0.72, 0.95, 1.0);
uniform float charge = 0.0;
uniform float crack = 0.0;
uniform int half = 0;
// width / height of the rect
uniform float aspect = 0.75;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 studio(vec3 r) {
	float sky = smoothstep(-0.3, 0.9, r.y);
	vec3 c = mix(vec3(0.03, 0.035, 0.05), vec3(0.6, 0.66, 0.78), sky);
	c += vec3(2.0) * smoothstep(0.82, 0.97, dot(r, normalize(vec3(-0.5, 0.7, 0.5))));
	c += vec3(0.4, 0.7, 1.3) * smoothstep(0.8, 0.97, dot(r, normalize(vec3(0.9, 0.0, 0.3)))) * 0.6;
	return c;
}

vec3 to_srgb(vec3 c) {
	c = clamp(c, 0.0, 1.0);
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void fragment() {
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	// y up
	p.y = -p.y;
	float bw = 0.2;
	float len = 0.2;
	if ((half == 1 && p.y < -0.004) || (half == 2 && p.y > 0.004)) {
		COLOR = vec4(0.0);
	} else {
		vec2 cp = vec2(0.0, clamp(p.y, -len, len));
		float sd = length(p - cp) - bw;
		vec3 sc = seam.rgb;
		vec3 col = vec3(0.0);
		float a = 0.0;
		// light leaking out of the seam: a blade of light either side
		float leak = exp(-abs(p.y) * (90.0 - charge * 50.0)) * exp(-max(sd, 0.0) * (14.0 - charge * 8.0)) * charge;
		if (half != 0) leak *= 0.0;
		// (outside only: inside, the body keeps its own colour)
		float halo = exp(-max(sd, 0.0) * 16.0) * charge * 0.35 * step(0.0, sd);
		if (sd < 0.0) {
			vec2 nxy = (p - cp) / bw;
			vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
			vec3 v = vec3(0.0, 0.0, 1.0);
			float y = p.y;
			// chrome bands near the ends, the gunmetal body between
			float band = step(abs(abs(y) - len * 0.62), 0.022);
			vec3 base = mix(vec3(0.11, 0.12, 0.15), vec3(0.8, 0.82, 0.86), band);
			float rough = mix(0.32, 0.06, band);
			// fine machined rings on the body
			base *= 0.92 + 0.08 * sin(y * 260.0);
			vec3 r = reflect(-v, n);
			vec3 f0 = base;
			float ndv = clamp(n.z, 0.0, 1.0);
			vec3 fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0) * (1.0 - rough);
			vec3 lit = fres * studio(r) * (1.0 - rough * 0.5) + base * 0.05;
			lit += vec3(1.0) * pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7) + v)), 0.0), 40.0 / (rough + 0.05)) * 0.4;
			// the seam: a dark groove that opens onto light
			float g = abs(y);
			float groove = 1.0 - smoothstep(0.006, 0.012, g);
			lit = mix(lit, vec3(0.01), groove * (1.0 - charge));
			lit += sc * groove * (0.4 + charge * 5.0);
			lit += sc * exp(-g * 40.0) * charge * 0.8;
			// studs round the seam
			float stud = 1.0 - smoothstep(0.008, 0.012, length(vec2(fract(nxy.x * 3.0 + 0.5) - 0.5, (abs(y) - 0.035) * 10.0)) * 0.1);
			stud *= step(0.0, abs(y) - 0.02) * step(abs(y), 0.05) * step(abs(nxy.x), 0.85);
			lit = mix(lit, vec3(0.6, 0.62, 0.66) * (0.4 + n.z * 0.8), stud);
			// the emblem on top: a ring lit from inside
			vec2 e = vec2(p.x, p.y - len * 0.25);
			float er = length(e);
			float ring = 1.0 - smoothstep(0.004, 0.008, abs(er - 0.045));
			float core = 1.0 - smoothstep(0.018, 0.026, er);
			lit = mix(lit, sc * (1.5 + charge * 3.0), ring * 0.9);
			lit += sc * core * (0.3 + charge * 2.5);
			// cracks of light spreading from the seam before it bursts
			if (crack > 0.0) {
				vec2 cq = vec2(nxy.x * 6.0, y * 18.0);
				float k = 0.0;
				for (int i = 0; i < 3; i++) {
					float fi = float(i);
					float line = abs(fract(cq.x * (0.7 + fi * 0.3) + sin(cq.y * (1.3 + fi) + fi * 2.0) * 0.6 + hash(vec2(fi, 3.0))) - 0.5);
					k = max(k, 1.0 - smoothstep(0.0, 0.05, line));
				}
				float reach = smoothstep(crack * 0.25, 0.0, abs(y) - 0.0) ;
				lit += sc * k * reach * 3.0 * crack;
			}
			// the rim darkens into the outline
			lit *= mix(0.6, 1.0, smoothstep(0.0, -0.02, sd));
			col = lit;
			a = smoothstep(0.0, -0.003, sd);
		}
		vec3 glow = sc * (leak * 2.0 + halo);
		vec3 outc = col * a + glow;
		float oa = max(a, clamp(max(leak * 1.6, halo), 0.0, 1.0));
		COLOR = vec4(to_srgb(outc / max(oa, 1e-3)), oa);
	}
}
