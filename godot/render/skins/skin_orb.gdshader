// A skin's swatch in the Skin Vault (app/gacha): a slowly turning ball of armour wearing it, lit
// like the garage (a softbox key, a cool rim, a studio sky in the reflections), with a halo in its
// rarity's colour. Drawn by the same patterns as the robots (skin.gdshaderinc), at the robots'
// scale, so the card shows what the robot will wear. `veil` hides it (a skin not owned yet: a
// dark silhouette with a hint of its colours).
shader_type canvas_item;

#include "res://render/skins/skin.gdshaderinc"

uniform ivec2 skin_kind = ivec2(0);
uniform vec4 skin_c[8];
uniform vec4 skin_p[2];
// the halo round the ball (sRGB) and how strong
uniform vec4 halo : source_color = vec4(1.0, 1.0, 1.0, 0.0);
// turns per second, and where it starts
uniform float spin = 0.05;
uniform float phase = 0.0;
uniform float veil = 0.0;
// the ball's radius in the rect (0.5 fills it)
uniform float radius = 0.4;
// the ball's size in metres: the patterns come out at the robots' scale
uniform float metres = 0.34;

vec3 aces(vec3 x) {
	return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 to_srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// the studio round the ball, seen in its reflections: a bright softbox above, a dim floor
vec3 studio(vec3 r, float rough) {
	float sky = smoothstep(-0.2, 0.9, r.y);
	vec3 c = mix(vec3(0.05, 0.055, 0.07), vec3(0.75, 0.8, 0.9), sky);
	float box = smoothstep(0.75 - rough * 0.5, 0.95, dot(r, normalize(vec3(-0.45, 0.75, 0.5))));
	c += vec3(2.4, 2.35, 2.2) * box * (1.0 - rough * 0.6);
	float rim = smoothstep(0.7 - rough * 0.4, 0.95, dot(r, normalize(vec3(0.9, 0.1, -0.3))));
	c += vec3(0.5, 0.8, 1.4) * rim * 0.8;
	return c;
}

void fragment() {
	vec2 uv = UV - 0.5;
	float d = length(uv) / radius;
	vec4 col = vec4(0.0);
	// the halo behind
	// (gone by the rect's edge, d 1.25, so it never shows as a box)
	float h = exp(-max(d - 0.92, 0.0) * 6.0) * smoothstep(1.24, 0.97, d);
	vec3 hc = halo.rgb;
	col = vec4(hc, h * halo.a * 0.55);
	if (d < 1.0) {
		vec3 n = vec3(uv.x, -uv.y, 0.0) / radius;
		n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy)));
		// turn the ball: the pattern's point and normal in its own (turning) frame
		float a = (TIME * spin + phase) * 6.2831853;
		mat3 turn = mat3(vec3(cos(a), 0.0, sin(a)), vec3(0.0, 1.0, 0.0), vec3(-sin(a), 0.0, cos(a)));
		mat3 tilt = mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.94, 0.34), vec3(0.0, -0.34, 0.94));
		vec3 rn = turn * (tilt * n);
		vec3 p = rn * metres + vec3(3.1, 1.7, 2.3);
		vec3 v = vec3(0.0, 0.0, 1.0);
		SkinOut base = SkinOut(vec3(0.5), 0.3, 0.4, vec3(0.0), 0.0);
		// the sweep line splits the ball between the two platings, like a robot's trim
		float sec = step(0.62, abs(rn.y + sin(rn.x * 3.0) * 0.08));
		SkinOut o = skin_eval(skin_kind.x, skin_c[0], skin_c[1], skin_c[2], skin_c[3], skin_p[0], p, rn, n, v, TIME, sec, base);
		// the pattern's relief bends the normal a little
		vec2 g = vec2(dFdx(o.h), dFdy(o.h));
		vec3 nb = normalize(n + vec3(-g.x, g.y, 0.0) * 6.0);
		float ndv = max(dot(nb, v), 0.0);
		vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
		vec3 hv = normalize(l + v);
		float rough = clamp(o.rough, 0.04, 1.0);
		vec3 f0 = mix(vec3(0.04), o.albedo, o.metal);
		vec3 fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0) * (1.0 - rough * 0.7);
		float lam = max(dot(nb, l), 0.0);
		vec3 diff = o.albedo * (1.0 - o.metal) * (0.18 + lam * 1.1 + max(-nb.y, 0.0) * 0.05);
		float shin = 2.0 / (rough * rough * rough + 0.002);
		vec3 spec = fres * (studio(reflect(-v, nb), rough) * 0.75 + vec3(pow(max(dot(nb, hv), 0.0), shin) * (shin + 2.0) / 8.0) * 0.25);
		vec3 lin = diff + spec + o.emit;
		// soft contact shading to the edge
		lin *= mix(0.55, 1.0, smoothstep(1.0, 0.75, d));
		// a hidden skin: a dark silhouette carrying a breath of its colours
		lin = mix(lin, vec3(0.012, 0.014, 0.02) + o.albedo * 0.03 + o.emit * 0.02, veil);
		vec3 c = to_srgb(aces(lin * 1.05));
		float edge = smoothstep(1.0, 0.985, d);
		col = mix(col, vec4(c, 1.0), edge);
	}
	COLOR = col;
}
