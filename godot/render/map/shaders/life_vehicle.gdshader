// The city's vehicles (render/map/street_life.gd): cars, taxis, vans and buses driving the
// traffic's lanes and parked in the bays, each a body and a cabin shaped here per kind (the
// cabin's glass raked front and back), painted in the colours real traffic comes in, with
// glass, wheels, lights (lit at night) and a clear coat that catches the sky and the sun.
shader_type spatial;
render_mode unshaded, skip_vertex_transform, cull_back;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_facade.gdshaderinc"
#include "res://render/map/shaders/map_life.gdshaderinc"

varying vec3 vWorld;
// metres in the vehicle: x across (to its right), y up, z along (front +)
varying vec3 vL;
varying flat vec4 vInfo;
varying flat vec3 vDims;

void vertex() {
	vec3 c;
	vec2 fw;
	float fade;
	lifeVehicle(MODEL_MATRIX, c, fw, fade);
	float kind = MODEL_MATRIX[1].z;
	vec3 dims = lifeDims(kind);
	// per kind: the cabin's z at its foot and top (back, front), its half width, the body's top
	vec4 zc;
	float cw, yb;
	if (kind < 1.5) { zc = vec4(-0.34, 0.21, -0.2, 0.04); cw = 0.43; yb = 0.5; }
	else if (kind < 2.5) { zc = vec4(-0.5, 0.3, -0.5, 0.19); cw = 0.49; yb = 0.42; }
	else { zc = vec4(-0.5, 0.5, -0.5, 0.49); cw = 0.5; yb = 0.26; }
	vec3 v = VERTEX;
	vec3 l;
	if (UV.x < 0.5) {
		l = vec3(v.x, mix(0.12, yb, v.y), v.z);
	} else {
		float z = v.y < 0.5 ? (v.z < 0.0 ? zc.x : zc.y) : (v.z < 0.0 ? zc.z : zc.w);
		l = vec3(v.x * cw * 2.0, mix(yb, 1.0, v.y), z);
	}
	l *= vec3(dims.y, dims.z, dims.x) * fade;
	vec2 rt = lifeRight(fw);
	vec3 p = c + vec3(rt.x, 0.0, rt.y) * l.x + vec3(0.0, l.y, 0.0) + vec3(fw.x, 0.0, fw.y) * l.z;
	vWorld = p;
	vL = l;
	vInfo = vec4(kind, MODEL_MATRIX[2].x, UV.x, UV.y);
	vDims = dims;
	VERTEX = (VIEW_MATRIX * vec4(p, 1.0)).xyz;
}

// the colours cars come in: white, black, greys and silver most, then blue and red, a few others
vec3 paint(float h) {
	if (h < 0.24) return vec3(0.78, 0.79, 0.78);
	if (h < 0.42) return vec3(0.025, 0.026, 0.03);
	if (h < 0.56) return vec3(0.22, 0.23, 0.24);
	if (h < 0.68) return vec3(0.5, 0.52, 0.53);
	if (h < 0.77) return vec3(0.04, 0.1, 0.28);
	if (h < 0.86) return vec3(0.42, 0.03, 0.03);
	if (h < 0.9) return vec3(0.09, 0.2, 0.12);
	if (h < 0.94) return vec3(0.3, 0.2, 0.12);
	if (h < 0.97) return vec3(0.75, 0.42, 0.06);
	return vec3(0.55, 0.62, 0.7);
}

void fragment() {
	vec3 w = vWorld;
	vec3 V = normalize(CAMERA_POSITION_WORLD - w);
	vec3 n = normalize(cross(dFdx(w), dFdy(w)));
	if (dot(n, V) < 0.0) n = -n;
	float kind = vInfo.x, seed = vInfo.y, part = vInfo.z, face = vInfo.w;
	vec3 l = vL;
	vec3 dm = vDims;
	float H = dm.z, L = dm.x, W = dm.y;
	vec2 px = vec2(length(fwidth(l)));
	float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
	vec3 col = kind > 0.5 && kind < 1.5 ? vec3(0.8, 0.52, 0.03) : kind > 1.5 && kind < 2.5 && seed < 0.6 ? vec3(0.82, 0.83, 0.82) : paint(seed);
	if (kind > 2.5) col = seed < 0.5 ? vec3(0.75, 0.1, 0.08) : vec3(0.06, 0.25, 0.55);
	vec3 alb = col;
	float glass = 0.0;
	float gloss = 1.0;
	vec3 emit = vec3(0.0);
	bool top = face < 0.5;
	bool side = face > 0.5 && face < 2.5;
	bool front = face > 2.5 && face < 3.5;
	bool back = face > 3.5;
	float ay = l.y;
	if (part > 0.5) {
		// the cabin: glass all round under a painted roof (buses: a band of windows down the
		// sides above the livery, a big windscreen)
		if (!top) {
			glass = 1.0;
			if (kind > 2.5) {
				float yb = H * 0.26;
				glass = side ? fband(ay, yb + (H - yb) * 0.25, H - 0.25, px.y) * (1.0 - 0.8 * fpulse(l.z / 1.6, 0.08, px.x / 1.6)) : fband(ay, yb + 0.2, H - 0.2, px.y);
				alb = mix(col, vec3(0.86, 0.86, 0.84), fband(ay, H - 0.25, H, px.y));
			} else if (side) {
				// the pillars between the doors' windows
				glass = 1.0 - fband(l.z, -0.02 * L, 0.04 * L, px.x) * step(kind, 1.5);
			}
		} else if (kind > 0.5 && kind < 1.5) {
			// a taxi's roof light
			float sign_ = fband(abs(l.x), 0.0, 0.32, px.x) * fband(l.z, -0.35, 0.05, px.x);
			alb = mix(alb, vec3(0.9, 0.88, 0.8), sign_);
			emit += vec3(1.0, 0.85, 0.5) * sign_ * night * 0.6;
		}
	} else {
		// the body: wheels in their arches down the sides, bumpers, lights and grille
		float ax = L * (kind > 2.5 ? 0.34 : 0.31);
		if (side) {
			float r = kind > 2.5 ? 0.5 : 0.34;
			float wd = min(length(vec2(l.z - ax, ay - r)), length(vec2(l.z + ax, ay - r)));
			alb = mix(alb, vec3(0.02), fband(wd, 0.0, r + 0.06, px.x));
			alb = mix(alb, vec3(0.5), fband(wd, 0.0, r * 0.45, px.x));
			alb *= 1.0 - 0.4 * fband(ay, 0.0, 0.32, px.y);
			gloss = 1.0 - fband(wd, 0.0, r + 0.06, px.x);
		}
		if (front || back) {
			float bump = fband(ay, 0.0, 0.42, px.y);
			alb = mix(alb, vec3(0.06), bump * 0.85);
			float lamp = fband(abs(l.x), W * 0.3, W * 0.46, px.x) * fband(ay, H * 0.5 * 0.62, H * 0.5 * 0.85, px.y);
			if (kind > 1.5) lamp = fband(abs(l.x), W * 0.32, W * 0.46, px.x) * fband(ay, 0.45, 0.75, px.y);
			if (front) {
				alb = mix(alb, vec3(0.04), fband(abs(l.x), 0.0, W * 0.22, px.x) * fband(ay, 0.42, H * 0.5 * 0.8, px.y));
				alb = mix(alb, vec3(0.85, 0.87, 0.9), lamp);
				emit += vec3(1.0, 0.94, 0.82) * lamp * (0.15 + 2.5 * night);
			} else {
				alb = mix(alb, vec3(0.5, 0.03, 0.02), lamp);
				emit += vec3(1.0, 0.08, 0.04) * lamp * (0.1 + 1.4 * night);
			}
		}
		if (top && kind > 2.5) alb = vec3(0.6, 0.6, 0.6) * (0.9 + 0.1 * fpulse(l.z / 2.0, 0.85, px.x / 2.0));
	}
	vec3 c = alb * mapLightK(n, w + vec3(0.0, 0.4, 0.0), 1.0, 0.6);
	// the clear coat: the sky in it, the sun's glint
	vec3 r = reflect(-V, n);
	float F = facadeFresnel(dot(V, n), glass > 0.0 ? 0.06 : 0.04) * gloss;
	vec3 sky = facadeSky(r);
	vec3 sun = uSunCol * pow(max(dot(r, uSunDir), 0.0), 150.0) * 3.0 * sunShadow(w + vec3(0.0, 0.5, 0.0)) * cloudShade(w.xz);
	c = mix(c, vec3(0.012, 0.014, 0.017) + (kind > 2.5 ? LAMP_SOFT * 0.5 * night : vec3(0.0)), glass);
	c += (sky * (0.5 + 0.5 * glass) + sun) * F;
	c += emit;
	MAP_OUT(c)
}
