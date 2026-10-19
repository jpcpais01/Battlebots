// Kit on the city's roofs (render/map/street_life.gd): condensers with their fans turning,
// air handlers with louvres and panel seams, stair housings with a door and a lamp over it.
// Per instance: the box's size is its scale, COLOR its colour, INSTANCE_CUSTOM its kind and seed.
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying vec2 vFace;
varying flat vec3 vSize;
varying flat vec2 vInfo;
varying flat float vFaceW;
varying flat float vFaceId;

void vertex() {
	vec4 w = MODEL_MATRIX * vec4(VERTEX, 1.0);
	vWorld = w.xyz;
	int k = int(UV.y + 0.5);
	vN = k == 0 ? vec3(0.0, 1.0, 0.0) : k == 1 ? vec3(1.0, 0.0, 0.0) : k == 2 ? vec3(-1.0, 0.0, 0.0) : k == 3 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
	vec3 s = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	vSize = s;
	vCol = COLOR.rgb;
	vInfo = INSTANCE_CUSTOM.xy;
	vec3 m = (VERTEX + vec3(0.5, 0.0, 0.5)) * s;
	bool sx = k == 1 || k == 2;
	vFace = k == 0 ? m.xz : vec2(sx ? m.z : m.x, m.y);
	vFaceW = sx ? s.z : s.x;
	vFaceId = float(k);
}

void fragment() {
	vec3 n = vN;
	vec3 w = vWorld;
	vec2 f = vFace;
	vec2 px = max(fwidth(f), vec2(1e-3));
	float pl = length(px);
	float kind = vInfo.x, seed = vInfo.y;
	vec4 nz = texture(uNoise, (w.xz + w.y) / 5.0);
	vec3 alb = vCol * (0.9 + 0.15 * nz.r);
	vec3 emit = vec3(0.0);
	float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
	bool top = vFaceId < 0.5;
	if (kind < 0.5) {
		// a condenser: a fan in the top, grilles round the sides
		if (top) {
			vec2 c = f - vSize.xz * 0.5;
			float r = min(vSize.x, vSize.z) * 0.4;
			float d = length(c);
			float a = atan(c.y, c.x) + uTime * (6.0 + 5.0 * seed);
			alb = mix(alb, vec3(0.06) * (1.0 + 0.8 * step(0.0, sin(a * 3.0)) * step(0.3 * r, d)), fband(d, 0.0, r, pl));
			alb = mix(alb, vec3(0.75), fband(d, r - 0.05, r, pl));
		} else {
			alb *= 1.0 - 0.45 * fband(f.y, 0.15, vSize.y - 0.15, px.y) * fband(f.x, 0.1, vFaceW - 0.1, px.x) * (0.6 + 0.4 * fpulse(f.x / 0.06, 0.5, px.x / 0.06));
		}
	} else if (kind < 1.5) {
		// an air handler: panels with seams, louvres along one end, two fans on top of long ones
		alb *= 1.0 - 0.15 * fpulse(f.x / 1.2, 0.04, px.x / 1.2);
		if (top) {
			float L = max(vSize.x, vSize.z);
			vec2 g = vSize.x > vSize.z ? f : f.yx;
			float d = min(length(g - vec2(L * 0.3, min(vSize.x, vSize.z) * 0.5)), length(g - vec2(L * 0.7, min(vSize.x, vSize.z) * 0.5)));
			alb = mix(alb, vec3(0.08), fband(d, 0.0, min(vSize.x, vSize.z) * 0.33, pl) * step(3.0, L));
		} else {
			alb *= 1.0 - 0.35 * fband(f.x, vFaceW * 0.7, vFaceW - 0.15, px.x) * fband(f.y, 0.2, vSize.y - 0.2, px.y) * fpulse(f.y / 0.12, 0.5, px.y / 0.12);
		}
	} else {
		// a stair housing: rendered like its building, a steel door, a lamp over it
		if (top) {
			alb = vec3(0.3, 0.3, 0.31) * (0.85 + 0.25 * nz.g);
			alb = mix(alb, vCol, fband(min(min(f.x, vSize.x - f.x), min(f.y, vSize.z - f.y)), 0.0, 0.3, pl));
		} else {
			float df = floor(fract(seed * 4.0) * 4.0) + 1.0;
			float door = step(abs(vFaceId - df), 0.5) * fband(abs(f.x - vFaceW * 0.5), 0.0, 0.5, px.x) * fband(f.y, 0.0, 2.1, px.y);
			alb = mix(alb, vec3(0.22, 0.24, 0.26), door);
			float lamp = step(abs(vFaceId - df), 0.5) * step(length((f - vec2(vFaceW * 0.5, 2.35)) / vec2(1.0, 0.7)), 0.12);
			alb = mix(alb, vec3(0.9, 0.85, 0.7), lamp);
			emit += vec3(1.0, 0.75, 0.45) * lamp * (0.2 + 2.0 * night);
			alb *= 1.0 - 0.2 * fband(f.y, 0.0, 0.4, px.y);
		}
	}
	vec3 c = alb * mapLightK(n, w + vec3(0.0, 1.2, 0.0), 1.0, 0.8) + emit;
	MAP_OUT(c)
}
