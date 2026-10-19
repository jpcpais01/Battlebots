// What both screen-space traces share (ray_trace.gdshader in the arena, the garage and the home
// scenes; map_trace.gdshader on the world map): the frame and its depth, read one whole pixel at a
// time, positions and normals rebuilt from them, and the 2x2 quad's derivative tricks.
// (no mipmaps: the screen copy's mip chain is built by the renderer behind our back, and on phones
// its upper levels were read back as stale blocks; the traces read the full-size copy only, which
// also spares the renderer building the chain every frame)
uniform sampler2D screen_tex : hint_screen_texture, filter_linear, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;

// The four pixels of a quad average their results through the derivative units: a pixel's
// neighbour across the quad is itself plus or minus its derivative.
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
#define DFDX dFdx
#define DFDY dFdy
#else
#define DFDX dFdxFine
#define DFDY dFdyFine
#endif

// Can this pixel trust the quad tricks? Fine derivatives, quads on even pixels: checked on values
// whose answers are known, at the same place in the shader as the tricks they vouch for. A GPU
// that answers coarsely (one row's difference for both rows), or zero, fails it, and its pixels
// keep their own results instead of mixing in wrong neighbours.
bool quad_ok(ivec2 fc) {
	float ox = float(fc.x & 1);
	float oy = float(fc.y & 1);
	float both = ox * oy;
	return abs(DFDX(ox) - 1.0) < 0.25 && abs(DFDY(oy) - 1.0) < 0.25
		&& abs(DFDX(both) - oy) < 0.25 && abs(DFDY(both) - ox) < 0.25;
}

float ndc_z(float d) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return d * 2.0 - 1.0;
#else
	return d;
#endif
}

bool is_sky(float d) {
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	return d >= 0.9999999;
#else
	// (reversed depth: the far plane is 0)
	return d <= 0.0000001;
#endif
}

// The depth buffer is only ever read one whole pixel at a time, and a position is always rebuilt
// from the centre of the very pixel its depth came from (rt.ts VIEW: filtered lookups between
// rows flip with rounding and draw lines across the floor).
float depth_px(ivec2 p, ivec2 size) {
	return texelFetch(depth_tex, clamp(p, ivec2(0), size - ivec2(1)), 0).r;
}

vec2 px_uv(ivec2 p, ivec2 size) {
	return (vec2(clamp(p, ivec2(0), size - ivec2(1))) + 0.5) / vec2(size);
}

ivec2 uv_px(vec2 uv, ivec2 size) {
	return ivec2(floor(uv * vec2(size)));
}

vec3 view_pos(vec2 uv, float d, mat4 ip) {
	vec4 v = ip * vec4(uv * 2.0 - 1.0, ndc_z(d), 1.0);
	return v.xyz / v.w;
}

// only the view depth (the third and fourth rows of the inverse projection)
float view_z(vec2 uv, float d, mat4 ip) {
	vec4 n = vec4(uv * 2.0 - 1.0, ndc_z(d), 1.0);
	return dot(vec4(ip[0].z, ip[1].z, ip[2].z, ip[3].z), n) / dot(vec4(ip[0].w, ip[1].w, ip[2].w, ip[3].w), n);
}

vec3 pos_px(ivec2 p, ivec2 size, mat4 ip) {
	return view_pos(px_uv(p, size), depth_px(p, size), ip);
}

// the scene where a screen position lands: that pixel's own depth, at that pixel's centre
vec3 pos_at(vec2 uv, ivec2 size, mat4 ip) {
	return pos_px(uv_px(uv, size), size, ip);
}

float z_at(vec2 uv, ivec2 size, mat4 ip) {
	ivec2 p = uv_px(uv, size);
	return view_z(px_uv(p, size), depth_px(p, size), ip);
}

vec2 project(vec3 p, mat4 pm) {
	vec4 c = pm * vec4(p, 1.0);
	return c.xy / c.w * 0.5 + 0.5;
}

// of two steps either side, the one nearer in depth (so an edge doesn't bend the surface behind
// it), but never a step of nothing (at the screen's edge a neighbour is the pixel itself)
vec3 pick_step(vec3 back, vec3 fwd) {
	bool f = abs(fwd.z) < abs(back.z);
	if (dot(fwd, fwd) < 1e-12) {
		f = false;
	}
	if (dot(back, back) < 1e-12) {
		f = true;
	}
	return f ? fwd : back;
}

// the surface normal from the depth of the pixels round pixel c
vec3 view_normal(ivec2 c, vec3 p, ivec2 size, mat4 ip) {
	vec3 dx = pick_step(p - pos_px(c - ivec2(1, 0), size, ip), pos_px(c + ivec2(1, 0), size, ip) - p);
	vec3 dy = pick_step(p - pos_px(c - ivec2(0, 1), size, ip), pos_px(c + ivec2(0, 1), size, ip) - p);
	vec3 n = cross(dx, dy);
	float len = length(n);
	// (a degenerate spot faces the camera rather than turning into NaN; either winding faces it)
	n = len > 1e-12 ? n / len : vec3(0.0, 0.0, 1.0);
	return dot(n, p) > 0.0 ? -n : n;
}

// Is x a real number? Checked on its bits, which no driver's fast maths can reason away (some
// treat a NaN as never there and let it through a comparison; max and min with one differ
// between GPUs).
bool finite(float x) {
	return (floatBitsToUint(x) & 0x7f800000u) != 0x7f800000u;
}

bool finite3(vec3 v) {
	return finite(v.x) && finite(v.y) && finite(v.z);
}

// a colour read from the frame, safe to add up: broken pixels count as black, blinding ones are
// capped (rt.ts COPY)
vec3 safe_col(vec3 c) {
	return finite3(c) ? clamp(c, vec3(0.0), vec3(24.0)) : vec3(0.0);
}

// how alike two view depths are, for averaging across a quad (rt.ts BLUR)
float alike(float z, float zn) {
	return max(0.0, 1.0 - abs(zn - z) / (0.03 * -z + 0.02));
}

