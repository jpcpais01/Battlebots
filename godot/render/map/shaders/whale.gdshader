// holo.ts holoWhale: a 170 m holographic humpback swimming long slow laps high round the
// mega-towers, heaving as it swims, its pectoral fins beating, a wire grid over it.
shader_type spatial;
render_mode unshaded, world_vertex_coords, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

uniform vec3 uCentre;

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
varying float vBelly;

void vertex() {
	vUv = UV;
	float L = 170.0;
	vec2 R = vec2(300.0, 225.0);
	float t = -VERTEX.x;
	// round an ellipse, the body following the path
	float a = uTime * 0.03 - t * L / 262.0;
	vec3 c = uCentre + vec3(cos(a) * R.x, 0.0, sin(a) * R.y);
	vec3 fwd = normalize(vec3(-sin(a) * R.x, 0.0, cos(a) * R.y));
	vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
	// the body heaves up and down as it swims, the tail most; the whole whale rises and dives slowly
	float heave = sin(uTime * 0.9 - t * 3.6) * 0.045 * (0.2 + t * t * 1.6);
	c.y += sin(uTime * 0.11 - t * 0.5) * 34.0 + heave * L;
	// the pectoral fins beat slowly
	float fin = step(1.5, UV.y) * step(0.2, t) * step(t, 0.5);
	float flap = fin * sin(uTime * 0.9 + 1.2) * 0.4 * abs(VERTEX.z) * 3.0;
	vec3 p = c + vec3(0.0, (VERTEX.y + flap * 0.15) * L, 0.0) - side * VERTEX.z * L;
	vN = normalize(-side * VERTEX.z + vec3(0.0, VERTEX.y, 0.0) + 1e-4);
	vBelly = -VERTEX.y;
	vWorld = p;
	VERTEX = p + uMapShift;
}

void fragment() {
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	bool fin = vUv.y > 1.5;
	float rim = fin ? 0.5 : pow(max(1.0 - abs(dot(V, normalize(vN))), 0.0), 2.2);
	vec2 px = fwidth(vUv);
	// a wire grid along and round the body, grooves along the throat
	float wire = fin ? 0.0 : max(fband(fract(vUv.x * 32.0), 0.0, 0.08, px.x * 32.0), fband(fract(vUv.y * 10.0), 0.0, 0.06, px.y * 10.0));
	float groove = fin ? 0.0 : fband(fract(vUv.y * 40.0), 0.0, 0.3, px.y * 40.0) * step(0.02, vBelly) * step(vUv.x, 0.55);
	vec3 deep = vec3(0.12, 0.42, 1.0), pale = vec3(0.55, 0.95, 1.0);
	vec3 col = mix(deep, pale, clamp(rim + wire * 0.8 + groove * 0.5, 0.0, 1.0));
	float k = (0.16 + rim * 0.9 + wire * 0.45 + groove * 0.25) * scanline(vWorld.y, 1.4);
	// a shimmer travelling down it
	k *= 0.8 + 0.35 * smoothstep(0.85, 1.0, fract(vUv.x * 1.5 - uTime * 0.35));
	MAP_OUT_ADD(col * k * holoLevel() * 0.15)
}
