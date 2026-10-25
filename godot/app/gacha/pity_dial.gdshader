// The Epic pity as a vault's combination dial (vault_screen.gd): a knurled brass bezel round a ring
// of 50 lamps, one for each pull since the last Epic (`fill` 0..1 of them lit, violet warming to
// gold, the ones past the soft pity `soft` burning amber, the next one blinking), and inside a
// turning black dial with its tick marks (`turn`, radians) under a gold pointer. `ready` makes the
// whole dial glow (a free pull waiting: tap it).
shader_type canvas_item;

uniform float fill = 0.0;
uniform float soft = 0.6;
uniform float lamps = 50.0;
uniform float turn = 0.0;
uniform float ready = 0.0;
uniform vec4 col_lo : source_color = vec4(0.69, 0.42, 1.0, 1.0);
uniform vec4 col_hi : source_color = vec4(1.0, 0.76, 0.24, 1.0);

void fragment() {
	vec2 uv = (UV - 0.5) * 2.0;
	float r = length(uv);
	// angle clockwise from the top, 0..1
	float a = fract(atan(uv.x, -uv.y) / 6.2831853 + 1.0);
	vec4 c = vec4(0.0);
	float aa = fwidth(r) * 1.2;
	// the glow round it when a free pull's waiting
	float halo = exp(-max(r - 0.98, 0.0) * 14.0) * step(0.98, r);
	c = vec4(col_hi.rgb, halo * ready * (0.55 + 0.25 * sin(TIME * 3.0)));
	// the bezel: brushed brass, knurled round its edge, lit from the top left
	float bez = smoothstep(0.84 - aa, 0.84, r) * (1.0 - smoothstep(0.98 - aa, 0.98, r));
	float light = 0.55 + 0.45 * dot(normalize(uv + 1e-4), normalize(vec2(-0.6, -0.8)));
	float knurl = 0.5 + 0.5 * sin(a * 6.2831853 * 90.0);
	vec3 brass = mix(vec3(0.42, 0.29, 0.12), vec3(1.0, 0.82, 0.48), light);
	brass *= mix(1.0, 0.75 + 0.25 * knurl, smoothstep(0.93, 0.95, r));
	brass = mix(brass, brass * 1.25, ready * 0.3);
	c = mix(c, vec4(brass, 1.0), bez);
	// the lamp ring
	float ring = smoothstep(0.66 - aa, 0.66, r) * (1.0 - smoothstep(0.84 - aa, 0.84, r));
	vec3 track = vec3(0.025, 0.025, 0.04);
	float idx = floor(a * lamps);
	float f = fract(a * lamps);
	float seg = smoothstep(0.08, 0.16, f) * (1.0 - smoothstep(0.84, 0.92, f)) * smoothstep(0.69, 0.71, r) * (1.0 - smoothstep(0.81, 0.83, r));
	float lit = step(idx + 0.5, fill * lamps);
	float k = idx / max(lamps - 1.0, 1.0);
	vec3 lc = mix(col_lo.rgb, col_hi.rgb, smoothstep(0.0, 1.0, k));
	lc = mix(lc, vec3(1.0, 0.45, 0.12), step(soft * lamps, idx) * 0.6);
	float next = (1.0 - lit) * step(idx, fill * lamps) * (0.5 + 0.5 * sin(TIME * 6.0));
	vec3 off = vec3(0.09, 0.09, 0.12);
	vec3 lamp = mix(off, lc * 1.25, lit) + lc * next * 0.6;
	c = mix(c, vec4(mix(track, lamp, seg), 1.0), ring);
	// the dial: black, turning marks, ticks round its edge (long every tenth)
	float dial = 1.0 - smoothstep(0.66 - aa, 0.66, r);
	float ta = fract(a - turn / 6.2831853);
	float tk = fract(ta * 100.0);
	float tl = step(0.9, fract(ta * 10.0 + 0.05));
	float tick = (1.0 - smoothstep(0.06, 0.14, abs(tk - 0.5) * 2.0 - 0.8)) * step(mix(0.58, 0.5, tl), r) * step(r, 0.64);
	vec3 face = vec3(0.04, 0.042, 0.05) * (0.85 + 0.15 * sin(r * 160.0));
	face += vec3(0.08) * light * smoothstep(0.3, 0.66, r);
	face = mix(face, vec3(0.8, 0.82, 0.86), tick * 0.85);
	c = mix(c, vec4(face, 1.0), dial);
	// the pointer: a gold wedge at the top, over the lamps
	vec2 pq = uv - vec2(0.0, -0.76);
	float tri = step(abs(pq.x) * 1.6, -pq.y + 0.09) * step(-0.07, pq.y) * step(pq.y, 0.09);
	c = mix(c, vec4(col_hi.rgb * 1.2, 1.0), tri);
	COLOR = c;
}
