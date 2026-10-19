// What every world-map shader shares (src/render/map/kit.ts MAP_GLSL, MAP_OUT, AA_GLSL, HOLO_GLSL):
// the low golden-hour sun, the sky and ground fill, the clouds' shadows drifting over, the shadow
// height map and the haze. The GLSL below is the web's, word for word where it can be; its uniform
// names are kept (uTime, uNoise...) so the ported shaders read like the originals. The day/night
// values are shader globals the map drives (render/map/world_map.gd apply_time, project.godot
// [shader_globals]); the textures and the shift are per material (set once by MapMaterials).
global uniform float map_time;
global uniform vec3 map_sun_col;
global uniform vec3 map_sky;
global uniform vec3 map_gnd;
global uniform float map_dusk;
global uniform float map_night;
global uniform float map_glow;
// the haze: its colour (linear) and FogExp2 density
global uniform vec4 map_fog;

#define uTime map_time
#define uSunCol map_sun_col
#define uSky map_sky
#define uGnd map_gnd
#define uDusk map_dusk
#define uNight map_night
#define uGlow map_glow
#define texture2D texture

// kit.ts SUN: towards the sun, low in the west-south-west, normalize(-0.78, 0.53, 0.45)
const vec3 uSunDir = vec3(-0.74648839, 0.50722929, 0.43066638);

uniform sampler2D uNoise : filter_linear_mipmap, repeat_enable;
uniform sampler2D uShadow : filter_linear, repeat_disable;
uniform float uShadowHalf = 1600.0;
// where the map is drawn relative to where it is (kit.ts uMapShift: zero on the map itself)
uniform vec3 uMapShift = vec3(0.0);

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// 1 in sunlight, 0 in a shadow (terrain, buildings), softened over a couple of metres; the
// shadows are the day sun's, so they fade away as night falls (the moon's soft light casts none)
float sunShadow(vec3 w) {
	vec2 uv = w.xz / (2.0 * uShadowHalf) + 0.5;
	if (uNight > 0.999 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
	float top = texture(uShadow, uv).r;
	return mix(smoothstep(top - 2.0, top + 1.0, w.y), 1.0, uNight);
}
// the clouds' shadows drifting over everything
float cloudShade(vec2 xz) {
	float c = texture(uNoise, xz / 2300.0 + vec2(uTime * 0.0021, uTime * 0.0009)).b;
	return mix(1.0, 0.6, smoothstep(0.52, 0.72, c));
}
vec3 ambient(vec3 n) { return mix(uGnd, uSky, n.y * 0.5 + 0.5); }
// the sky looking along r (what glass and water reflect): warm horizon and the sun's glow by
// day; by night a deep blue zenith over a horizon lit violet by the city, and the moon
vec3 skyCol(vec3 r) {
	float up = clamp(r.y, 0.0, 1.0);
	float toSun = max(dot(normalize(r), uSunDir), 0.0);
	vec3 day = mix(vec3(1.0, 0.82, 0.68), vec3(0.32, 0.5, 0.86), pow(up, 0.55)) + vec3(1.0, 0.7, 0.4) * pow(toSun, 8.0) * 0.8;
	vec3 night = mix(vec3(0.2, 0.12, 0.26), vec3(0.02, 0.035, 0.09), pow(up, 0.4)) + vec3(0.5, 0.6, 0.9) * pow(toSun, 60.0) * 0.5;
	return mix(day, night, uNight);
}
// the light a matte surface with normal n gets at w
vec3 mapLight(vec3 n, vec3 w) {
	float ndl = max(dot(n, uSunDir), 0.0);
	float cs = cloudShade(w.xz);
	// (looked up a few metres out from the surface, so a sunlit wall doesn't shade itself)
	return ambient(n) * mix(0.82, 1.0, cs) + uSunCol * (ndl * sunShadow(w + n * 3.5) * cs);
}

// mapLight with the sun's share scaled by k (0: something nearer than the shadow map knows of, a
// balcony, a window's reveal, a parapet, shades it; the sky's light still gets in), and the shadow
// map looked up `lift` metres out from the surface
vec3 mapLightK(vec3 n, vec3 w, float k, float lift) {
	float cs = cloudShade(w.xz);
	return ambient(n) * mix(0.82, 1.0, cs) + uSunCol * (max(dot(n, uSunDir), 0.0) * sunShadow(w + n * lift) * cs * k);
}

// kit.ts MAP_OUT: the haze, three's FogExp2 on the view depth, towards the haze colour as the
// background shows it (the web's bloom path: mixed in linear light, tone mapped after)
float mapFog(vec3 view) {
	float d = map_fog.w * -view.z;
	return 1.0 - exp(-d * d);
}
// The colour as ALBEDO takes it. The compatibility renderer (GL: old phones, and the container's
// render checks) decodes ALBEDO as if it were sRGB (srgb_to_linear's cubic) before lighting and
// fog: these shaders compute linear light, so it gets it encoded (the inverse approximation),
// and comes back to the same linear colour. Vulkan (Mobile) takes it as it is.
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
vec3 mapAlbedo(vec3 c) { return max(vec3(1.055) * pow(max(c, vec3(0.0)), vec3(0.416666667)) - vec3(0.055), vec3(0.0)); }
#else
vec3 mapAlbedo(vec3 c) { return c; }
#endif
// an opaque or alpha-blended surface: Godot mixes FOG in before blending, as three does
#define MAP_OUT(c) ALBEDO = mapAlbedo(c); FOG = vec4(map_fog.rgb, mapFog(VERTEX));
// additive light: three mixes the haze into what is added (so far glows go hazy, not dark)
#define MAP_OUT_ADD(c) ALBEDO = mapAlbedo(mix((c), map_fog.rgb, mapFog(VERTEX)));

// kit.ts AA_GLSL: filtered pulse trains and bands, so window grids and trim never shimmer
// integral of a pulse train that is on for the first 'duty' of every unit cell
float pulseI(float x, float duty) { return floor(x) * duty + min(fract(x), duty); }
// that pulse train box-filtered over a width w (in cells): its exact average there
float fpulse(float x, float duty, float w) {
	w = max(w, 1e-4);
	return (pulseI(x + 0.5 * w, duty) - pulseI(x - 0.5 * w, duty)) / w;
}
// a band [a, b] box-filtered over a width w
float fband(float x, float a, float b, float w) {
	w = max(w, 1e-4);
	return clamp((min(x + 0.5 * w, b) - max(x - 0.5 * w, a)) / w, 0.0, 1.0);
}

// kit.ts HOLO_GLSL: how bright the holograms are (only out at night) and their scanline
float holoLevel() { return uGlow * 1.5 * uNight; }
float scanline(float y, float speed) { return 0.6 + 0.4 * step(0.5, fract(y * 0.5 - uTime * speed)); }

// three's polygonOffset (pulling a surface forward in depth): Godot has none, so the vertex is
// moved a hair towards the lens along its view ray (the map's near plane scales with the zoom,
// so a fixed share of the depth is a fixed share of the depth buffer's precision)
#define POLY_OFFSET(units) { vec4 mv_ = VIEW_MATRIX * vec4(VERTEX, 1.0); mv_.xyz *= 1.0 - 5e-6 * (units); POSITION = PROJECTION_MATRIX * mv_; }
