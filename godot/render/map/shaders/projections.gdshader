// projections.ts holoProjections: ad screens hanging in the air over downtown, each beamed up off a
// projector on a roof below (the beam a faint pyramid from the lens to the screen's corners, a lens
// flare at the projector), flipping between two battlebots ads with a glitch. Per vertex: what it
// is (VERTEX.z: 0 screen, 1 lens, 2 beam corner, 3 flare), the beam's uv (CUSTOM0); per screen:
// where and which way (CUSTOM1: aAt), size, seed and its two ads (CUSTOM2: aSz), the lens and tint
// (CUSTOM3: aFrom).
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform sampler2D uAds : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
// projections.ts AD_GRID: the atlas's columns and rows of ads
const float COLS = 2.0;
const float ROWS = 8.0;

varying vec3 vKind;
varying vec2 vBeam;
varying vec2 vSize;
varying vec4 vInfo;
varying vec3 vWorld;

float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void vertex() {
	vec2 aBeam = CUSTOM0.xy;
	vec4 aAt = CUSTOM1, aSz = CUSTOM2, aFrom = CUSTOM3;
	float seed = aSz.z;
	float kind = VERTEX.z;
	// now and then the projection glitches: jerks sideways for a beat
	float slot = floor(uTime * 4.0 + seed * 40.0);
	float glitch = step(0.94, h11(slot + seed * 97.0));
	// which ad is up, and how far into it (the flip itself is a glitch too)
	float tt = uTime / 7.0 + seed * 5.0;
	float flip = fract(tt);
	glitch = max(glitch, 1.0 - smoothstep(0.0, 0.05, flip));
	float c = cos(aAt.w), s = sin(aAt.w);
	vec3 right = vec3(c, 0.0, -s);
	vec3 fwd = vec3(s, 0.0, c);
	// (leaning back a little, towards the camera looking down)
	vec3 up = normalize(vec3(0.0, 1.0, 0.0) - fwd * 0.28);
	vec3 centre = aAt.xyz + vec3(0.0, sin(uTime * 0.6 + seed * 20.0) * 0.8, 0.0) + right * glitch * (h11(slot) - 0.5) * aSz.x * 0.08;
	vec3 w;
	if (kind < 0.5 || kind > 1.5 && kind < 2.5) {
		w = centre + right * VERTEX.x * aSz.x + up * VERTEX.y * aSz.y;
	} else if (kind < 1.5) {
		w = aFrom.xyz;
	} else {
		// the lens flare faces the camera
		vec3 cr = INV_VIEW_MATRIX[0].xyz;
		vec3 cu = INV_VIEW_MATRIX[1].xyz;
		w = aFrom.xyz + (cr * VERTEX.x + cu * VERTEX.y) * 7.0;
	}
	vKind = vec3(kind, floor(tt), flip);
	vBeam = kind > 2.5 ? VERTEX.xy + 0.5 : kind > 0.5 ? aBeam : VERTEX.xy + 0.5;
	vSize = aSz.xy;
	vInfo = vec4(seed, aSz.w, glitch, aFrom.w);
	vWorld = w;
	VERTEX = w + uMapShift;
}

vec3 tint(float i) {
	return i < 0.5 ? vec3(1.0, 0.3, 0.7) : i < 1.5 ? vec3(0.3, 0.95, 1.0) : i < 2.5 ? vec3(1.0, 0.65, 0.3) : i < 3.5 ? vec3(0.65, 0.45, 1.0) : vec3(0.55, 1.0, 0.6);
}
vec2 cell(float n, vec2 uv) {
	float col = mod(n, COLS), row = floor(n / COLS);
	uv = clamp(uv, vec2(0.004), vec2(0.996));
	return vec2((col + uv.x) / COLS, 1.0 - (row + 1.0 - uv.y) / ROWS);
}

void fragment() {
	float kind = vKind.x;
	float glitch = vInfo.z;
	vec3 tc = tint(vInfo.w);
	float flick = 0.85 + 0.15 * step(0.12, fract(sin(floor(uTime * 13.0 + vInfo.x * 30.0) * 3.7) * 437.5));
	vec3 c;
	// (derivatives up here, outside the branches)
	vec2 m = vBeam * vSize;
	vec2 px = max(fwidth(m), vec2(1e-3));
	if (kind < 0.5) {
		vec2 uv = vBeam;
		// the flip: the new ad wipes in from the top, rows jittering
		float a = mod(vInfo.y, 16.0), b = floor(vInfo.y / 16.0);
		float cur = mod(vKind.y, 2.0) < 1.0 ? a : b, prev = mod(vKind.y, 2.0) < 1.0 ? b : a;
		float wipe = smoothstep(0.0, 0.05, vKind.z);
		float row = floor(uv.y * 28.0);
		uv.x += glitch * (hash12(vec2(row, vKind.y + floor(uTime * 8.0))) - 0.5) * 0.08;
		float n = uv.y > 1.0 - wipe * 1.1 + (hash12(vec2(row, vKind.y)) - 0.5) * 0.1 ? cur : prev;
		float split = glitch * 0.012;
		c = vec3(texture(uAds, cell(n, uv + vec2(split, 0.0))).r, texture(uAds, cell(n, uv)).g, texture(uAds, cell(n, uv - vec2(split, 0.0))).b);
		// a faint tinted field and a frame with corner brackets
		vec2 e = min(m, vSize - m);
		float frame = fband(min(e.x, e.y), 0.0, 0.35, length(px));
		float corner = step(min(e.x, e.y), 1.2) * step(max(e.x, e.y), 5.0);
		c += tc * (0.05 + frame * 0.35 + corner * 0.8);
		c *= scanline(m.y * 1.6, 2.0) * flick;
		c += tc * smoothstep(0.97, 1.0, 1.0 - abs(fract(uTime * 0.3 + vInfo.x) - vBeam.y)) * 0.25;
		c = mix(c, c.brg * 1.3, glitch * 0.5);
		c *= 0.2;
	} else if (kind < 2.5) {
		// the beam: brightest at the lens, faint rays fanning out, fainter by day
		float t = vBeam.y;
		float across = (vBeam.x - 0.5) / max(t, 1e-3) + 0.5;
		float rays = 0.65 + 0.35 * sin(across * 46.0 + vInfo.x * 30.0 + sin(uTime * 0.7) * 2.0);
		float edge = smoothstep(0.12, 0.0, min(across, 1.0 - across));
		c = tc * (mix(0.8, 0.1, sqrt(t)) * rays + edge * 0.25) * flick * (1.0 - glitch * 0.6);
		c *= 0.035 * mix(0.45, 1.0, uNight);
	} else {
		// the lens
		float d = length(vBeam - 0.5) * 2.0;
		c = (tc + 0.5) * (smoothstep(1.0, 0.0, d) * 0.12 + smoothstep(0.25, 0.0, d) * 0.6) * flick;
		c *= 0.25;
	}
	MAP_OUT_ADD(c * holoLevel())
}
