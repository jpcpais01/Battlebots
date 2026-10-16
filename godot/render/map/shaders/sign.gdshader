// city.ts signMaterial: the neon signs, a MultiMesh of quads (COLOR their neon, INSTANCE_CUSTOM
// their width, height, character set and flicker seed), characters drawn from a hash.
shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec2 vUv;
varying flat vec4 vSign;
varying vec3 vCol;
varying vec3 vWorld;

void vertex() {
	vUv = UV;
	vSign = INSTANCE_CUSTOM;
	vCol = COLOR.rgb;
	vWorld = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz - uMapShift;
}

void fragment() {
	// metres across and down the sign
	vec2 m = vUv * vSign.xy;
	vec2 px = max(fwidth(m), vec2(1e-3));
	float W = vSign.x;
	// the frame
	vec2 e = min(m, vSign.xy - m);
	float frame = fband(min(e.x, e.y), 0.15, 0.45, length(px));
	// characters stacked down it (or along it, on a wide sign): each a 3x4 grid of strokes
	// picked from a hash
	bool wide = vSign.x > vSign.y;
	float gs = wide ? vSign.y * 0.7 : W * 0.8;
	vec2 g;
	if (wide) g = vec2((m.x - gs * 0.4) / (gs * 0.85), (m.y - (vSign.y - gs) * 0.5) / gs);
	else {
		g = (m - vec2((W - gs) * 0.5, 0.0)) / gs;
		g.y = (vSign.y - m.y) / gs * 0.9;
	}
	vec2 gid = floor(g);
	vec2 gf = fract(g) * vec2(3.0, 4.0);
	vec2 sid = floor(gf);
	float h = hash12(gid * 3.1 + sid * 7.7 + vSign.z * 13.0);
	float stroke = wide
		? step(0.45, h) * step(0.0, g.y) * step(g.y, 1.0) * step(0.0, g.x) * step(g.x, floor((W - gs * 0.8) / (gs * 0.85)))
		: step(0.45, h) * step(0.0, g.x) * step(g.x, 1.0) * step(0.4, g.y) * step(g.y, floor(vSign.y / gs * 0.9));
	vec2 sf = fract(gf);
	stroke *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
	// the strokes blur into a soft glow once too small to read
	float tiny = smoothstep(0.08, 0.3, px.x / gs);
	float lightOn = mix(stroke, 0.35, tiny);
	// a flicker now and then, and the odd sign half dead
	float t = floor(uTime * 12.0 + vSign.w * 40.0);
	float flick = step(0.04, hash12(vec2(t, vSign.w * 91.0)));
	float k = max(frame, lightOn) * flick;
	vec3 c = vCol * k * uGlow * (0.7 + 0.3 * uDusk) + vec3(0.03, 0.03, 0.04) * (1.0 - k);
	MAP_OUT(c)
}
