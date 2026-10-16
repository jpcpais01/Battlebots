// sea.ts SKY_GLSL and SEA_GLSL: the sea's colour at a point on its surface, shared with the river
// (which turns into it at the mouth). Needs map_common.gdshaderinc first. `cam` is the lens's
// position (cameraPosition: Godot's built-ins can't be read in a helper).
uniform sampler2D uDepth : filter_linear, repeat_disable;
uniform float uFine = 1600.0;
uniform vec4 uMouth;

// sky colour reflected in water looking along r (shared by the sea and the river)
vec3 skyRefl(vec3 r) {
	return skyCol(r);
}
// a wave normal from two scrolling noise layers
vec3 waveN(vec2 xz, float k) {
	vec2 a = texture(uNoise, xz / 61.0 + vec2(uTime * 0.011, uTime * 0.007)).rg;
	vec2 b = texture(uNoise, xz / 23.0 - vec2(uTime * 0.017, -uTime * 0.012)).rg;
	vec2 g = (a - 0.5) * 0.9 + (b - 0.5) * 0.7;
	return normalize(vec3(g.x * k, 1.0, g.y * k));
}

// the water over the depth map, the sky in it, the sun's path, the surf, and the river's plume
// fanning out past its mouth
vec3 seaColor(vec3 w, float minD, vec3 cam) {
	vec2 uv = w.xz / (2.0 * uFine) + 0.5;
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	vec4 dm = texture(uDepth, clamp(uv, 0.0, 1.0));
	// depth 0 (shore) .. 1 (24 m and more)
	float d = max(mix(1.0, dm.r, inside), minD);
	vec3 V = normalize((cam - uMapShift) - w);
	float px = length(fwidth(w.xz));
	// calmer, smoother water far off (and no shimmering ripples smaller than a pixel)
	vec3 n = waveN(w.xz, mix(0.5, 0.05, smoothstep(2.0, 18.0, px)));
	float shade = cloudShade(w.xz);
	// the colour of the water itself: clear turquoise over the sand, deep blue further out
	vec3 shallow = vec3(0.18, 0.72, 0.68);
	vec3 mid = vec3(0.05, 0.38, 0.52);
	vec3 deep = vec3(0.02, 0.14, 0.3);
	vec3 body = mix(shallow, mid, smoothstep(0.0, 0.25, d));
	body = mix(body, deep, smoothstep(0.25, 1.0, d));
	// sand and reef showing through the shallows
	float reef = texture(uNoise, w.xz / 90.0).a;
	body = mix(body, vec3(0.55, 0.7, 0.5), (1.0 - smoothstep(0.0, 0.1, d)) * 0.45);
	body *= mix(1.0, 0.82 + 0.3 * reef, (1.0 - smoothstep(0.02, 0.2, d)) * 0.6);
	// the river's plume: its greener, cloudier water fanning out past the mouth and fading into
	// the sea, ragged at the edges, carried out on the current
	vec2 mp = w.xz - uMouth.xy;
	float al = dot(mp, uMouth.zw), ac = dot(mp, vec2(-uMouth.w, uMouth.z));
	vec4 pn = texture(uNoise, vec2(ac / 200.0, (al - uTime * 2.2) / 420.0));
	float spread = 45.0 + max(al, 0.0) * 0.55;
	float plume = smoothstep(spread, spread * 0.3, abs(ac) + (pn.g - 0.5) * 70.0) * smoothstep(-90.0, -30.0, al);
	plume *= 1.0 - smoothstep(110.0, 320.0, al + (pn.b - 0.5) * 120.0);
	vec4 pf = texture(uNoise, vec2(ac / 300.0, (al - uTime * 2.2) / 600.0));
	body = mix(body, mix(vec3(0.09, 0.36, 0.33), vec3(0.2, 0.42, 0.34), smoothstep(0.2, 0.8, pf.b)), plume * mix(0.65, 0.3, smoothstep(0.0, 300.0, al)));
	body *= ambient(vec3(0.0, 1.0, 0.0)) * 1.15 + uSunCol * 0.35 * uSunDir.y * shade;
	// the sky reflected (more of it at grazing angles)
	vec3 r = reflect(-V, n);
	float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
	vec3 c = mix(body, skyRefl(r) * mix(0.75, 1.0, shade), clamp(fres, 0.0, 1.0) * 0.85);
	// the sun's path: a broad sheen and the glitter in it
	float sd = max(dot(r, uSunDir), 0.0);
	c += uSunCol * (pow(sd, 90.0) * 0.6 + pow(sd, 900.0) * 6.0) * shade;
	// surf: bands rolling in to every shore, breaking into foam at the water's edge (calmed where
	// the river's current runs out against it)
	float shore = 1.0 - smoothstep(0.0, 0.07, d);
	float band = sin(d * 260.0 - uTime * 1.6 + reef * 6.0);
	float foam = shore * smoothstep(0.55, 0.95, band) * (0.5 + 0.5 * texture(uNoise, w.xz / 9.0 + uTime * 0.02).r) * (1.0 - plume * 0.7);
	foam = max(foam, 1.0 - smoothstep(0.0, 0.012, d - 0.002 * sin(uTime * 1.3 + w.x * 0.05)));
	return mix(c, vec3(0.96, 0.97, 0.95) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * 0.45 * shade), clamp(foam, 0.0, 1.0) * inside * 0.9);
}
