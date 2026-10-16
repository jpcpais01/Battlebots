// holo.ts holoAds: tall holographic adverts projected out in front of the tallest towers,
// glitching now and then. Per ad (copied to its four corners): where and which way (CUSTOM0: aAt),
// its size, seed and hue (CUSTOM1: aAd).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec2 vUv;
varying vec4 vAd;
varying vec3 vWorld;
varying float vGlitch;

void vertex() {
	vec4 aAt = CUSTOM0, aAd = CUSTOM1;
	vUv = UV;
	vAd = aAd;
	float slot = floor(uTime * 5.0 + aAd.z * 50.0);
	vGlitch = step(0.93, fract(sin(slot * 17.3 + aAd.z * 91.0) * 4375.85));
	vec2 q = VERTEX.xy * aAd.xy;
	// a glitch jerks it sideways and stretches it
	q.x += vGlitch * (fract(sin(slot * 3.7) * 931.7) - 0.5) * aAd.x * 0.4;
	float c = cos(aAt.w), s = sin(aAt.w);
	vec3 w = aAt.xyz + vec3(c * q.x, q.y + sin(uTime * 0.5 + aAd.z * 20.0) * 1.2, -s * q.x);
	vWorld = w;
	VERTEX = w + uMapShift;
}

void fragment() {
	vec2 m = vUv * vAd.xy;
	vec2 px = max(fwidth(m), vec2(1e-3));
	float W = vAd.x, H = vAd.y;
	float hi = vAd.w;
	vec3 a = hi < 0.5 ? vec3(1.0, 0.3, 0.7) : hi < 1.5 ? vec3(0.3, 0.95, 1.0) : hi < 2.5 ? vec3(1.0, 0.65, 0.3) : hi < 3.5 ? vec3(0.65, 0.45, 1.0) : vec3(0.55, 1.0, 0.5);
	vec3 b = a.gbr;
	// a soft colour field, brighter towards the edges
	vec2 e = min(m, vAd.xy - m);
	float frame = fband(min(e.x, e.y), 0.0, 0.5, length(px));
	float fade = smoothstep(0.0, 4.0, min(e.x, e.y));
	vec3 c = mix(a, b, vUv.y) * (0.12 + 0.1 * fade);
	// a stack of big characters down the middle, changing every few seconds
	float slot = floor(uTime / 5.0 + vAd.z * 7.0);
	float gs = W * 0.62;
	vec2 g = (m - vec2((W - gs) * 0.5, 0.0)) / gs;
	g.y = (H - m.y) / gs * 0.85;
	vec2 gid = floor(g), gf = fract(g) * vec2(3.0, 4.0);
	float on = step(0.48, hash12(gid * 3.1 + floor(gf) * 7.7 + slot)) * step(0.0, g.x) * step(g.x, 1.0) * step(0.3, g.y) * step(g.y, floor(H / gs * 0.85) - 0.2);
	vec2 sf = fract(gf);
	on *= step(0.15, sf.x) * step(sf.x, 0.85) * step(0.15, sf.y) * step(sf.y, 0.85);
	on = mix(on, 0.3 * step(0.0, g.x) * step(g.x, 1.0), smoothstep(0.08, 0.3, px.x / gs));
	c += a * on * 0.9 + frame * b * 0.8;
	// scan lines rolling up, a bright line sweeping down
	c *= scanline(m.y * 1.6, 3.0);
	c += a * smoothstep(0.985, 1.0, 1.0 - abs(fract(uTime * 0.25 + vAd.z) - vUv.y)) * 0.5;
	// flicker and a colour split on a glitch
	c *= 0.8 + 0.2 * step(0.1, fract(sin(floor(uTime * 11.0 + vAd.z * 30.0) * 3.7) * 437.5));
	c = mix(c, c.brg * 1.4, vGlitch);
	MAP_OUT_ADD(c * holoLevel() * 0.26)
}
