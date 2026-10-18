// A skin card in the 10-pull (app/gacha/pull_show.gd) and the collection: a rounded card in
// `rim`'s colour. Face down (front 0): brushed dark metal with the vault's emblem, its edge already
// glowing the colour of what's under it. Face up: a deep panel lit from behind the swatch, rays
// turning for a Rare or better, and a shine sliding across an Epic.
shader_type canvas_item;

uniform vec4 rim : source_color = vec4(0.55, 0.72, 0.95, 1.0);
uniform float front = 0.0;
// 0 Common, 1 Rare, 2 Epic
uniform float tier = 0.0;
uniform vec2 size = vec2(100.0, 140.0);
uniform float radius = 14.0;
// how bright the card is lit (a reveal flares it); `dim` a card not owned
uniform float glow = 1.0;
uniform float dim = 0.0;
uniform float seed = 0.0;

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	// the rect is the card plus a margin all round for its glow
	vec2 px = (UV - 0.5) * (size + vec2(36.0));
	float d = box(px, size * 0.5, radius);
	vec3 c = rim.rgb;
	vec4 col = vec4(0.0);
	// the glow outside
	float out_g = exp(-max(d, 0.0) * 0.16) * step(0.0, d) * (0.25 + tier * 0.22) * glow;
	col = vec4(c, out_g);
	if (d < 0.0) {
		vec2 uv = px / size + 0.5;
		vec3 fill;
		if (front < 0.5) {
			// face down: brushed metal, diagonal grooves and the emblem
			float brushed = 0.5 + 0.5 * sin(uv.y * 600.0 + sin(uv.x * 30.0) * 2.0);
			fill = vec3(0.07, 0.08, 0.1) + brushed * 0.012;
			float diag = abs(fract((uv.x + uv.y * 1.4) * 7.0) - 0.5);
			fill += vec3(0.03) * (1.0 - smoothstep(0.02, 0.05, diag));
			vec2 e = (uv - 0.5) * vec2(size.x / size.y, 1.0);
			float er = length(e);
			fill = mix(fill, c * 0.6, 1.0 - smoothstep(0.004, 0.01, abs(er - 0.12)));
			fill += c * exp(-er * 16.0) * (0.4 + 0.3 * sin(TIME * 3.0 + seed)) * (0.5 + tier * 0.4);
		} else {
			// face up: deep, lit from behind the swatch
			vec2 e = (uv - vec2(0.5, 0.38)) * vec2(size.x / size.y, 1.0);
			float er = length(e);
			fill = mix(vec3(0.03, 0.035, 0.05), c * 0.22, exp(-er * 3.5));
			if (tier > 0.5) {
				float ang = atan(e.y, e.x);
				float rays = pow(0.5 + 0.5 * sin(ang * 10.0 + TIME * (0.4 + tier * 0.4) + seed), 5.0);
				fill += c * rays * exp(-er * 3.0) * 0.18 * tier;
			}
			// the bottom band carries the name
			fill = mix(fill, vec3(0.02, 0.025, 0.035), smoothstep(0.66, 0.7, uv.y) * 0.8);
			if (tier > 1.5) {
				// a shine sliding across
				float s = fract(TIME * 0.35 + seed * 0.1);
				float band = exp(-pow((uv.x + uv.y * 0.5 - s * 2.2 + 0.3) * 9.0, 2.0));
				fill += vec3(1.0, 0.95, 0.8) * band * 0.18;
			}
		}
		fill *= 1.0 - dim * 0.55;
		// the border: a bright hairline in the rarity colour
		float edge = 1.0 - smoothstep(1.5, 3.0, -d);
		fill = mix(fill, c * (0.9 + tier * 0.4) * glow, edge * (0.7 + 0.3 * front) * (1.0 - dim * 0.6));
		float a = smoothstep(0.0, -1.2, d);
		col = mix(col, vec4(fill, 1.0), a);
	}
	COLOR = col;
}
