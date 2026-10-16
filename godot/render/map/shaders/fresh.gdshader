// sea.ts freshWater: the river from the hills to the sea (its current, rapids and falls), the lake
// above the falls and the park pond. aFlow (CUSTOM0): distance along, distance across, how fast it
// runs, how much is falling; aBed (CUSTOM1): which way it flows, its depth, its churn. Pulled
// forward in depth like three's polygonOffset(-1, -2).
shader_type spatial;
render_mode unshaded, world_vertex_coords, cull_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"
#include "res://render/map/shaders/map_sea.gdshaderinc"

uniform vec2 uMouthS;

varying vec3 vWorld;
varying vec4 vFlow;
varying vec4 vBed;

void vertex() {
	vFlow = CUSTOM0;
	vBed = CUSTOM1;
	vWorld = VERTEX - uMapShift;
	POLY_OFFSET(2.0)
}

// The pattern on the water carried downstream at vel (m/s), through flow space p (metres
// across, metres along). Two copies slide along and cross-fade, each starting over every
// couple of seconds from a fresh spot, so water running fast mid-channel and slow by the banks
// never drags the pattern out into smears however long the map is open.
vec4 drift(vec2 p, float vel, vec2 scale, float seed) {
	const float RATE = 0.45;
	float t = uTime * RATE + seed;
	float f0 = fract(t), f1 = fract(t + 0.5);
	vec4 a = texture(uNoise, (p - vec2(0.0, f0 * vel / RATE)) * scale + floor(t) * vec2(0.37, 0.61));
	vec4 b = texture(uNoise, (p - vec2(0.0, f1 * vel / RATE)) * scale + floor(t + 0.5) * vec2(0.71, 0.29) + 0.5);
	float k = abs(1.0 - 2.0 * f0);
	// (the blend of two loses contrast mid-way; stretched back so it doesn't pulse)
	return (mix(a, b, k) - 0.5) * inversesqrt(k * k + (1.0 - k) * (1.0 - k)) + 0.5;
}

void fragment() {
	vec3 w = vWorld;
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - w);
	vec2 dir = normalize(vBed.xy);
	vec3 along = vec3(dir.x, 0.0, dir.y), across = vec3(-dir.y, 0.0, dir.x);
	float d = max(vBed.z, 0.0);
	float speed = vFlow.z, fall = vFlow.w, churn = vBed.w;
	// (ripples smaller than a pixel would only shimmer)
	float lod = 1.0 - smoothstep(1.5, 12.0, length(fwidth(w.xz)));
	// the current: fastest down the deep middle, held back over the shallows
	float vel = speed * 3.2 * mix(0.35, 1.0, smoothstep(0.2, 2.0, d));
	vec2 p = vFlow.yx;
	// (long swirls a few metres across, and the fine chop on them drawn out down the current)
	vec4 big = drift(p, vel, vec2(1.0 / 90.0, 1.0 / 200.0), 0.0);
	vec4 fine = drift(p, vel * 1.15, vec2(1.0 / 24.0, 1.0 / 150.0), 0.37);
	// a slow pattern that stays put: the stones on the bed, and the standing waves over them
	vec4 still = texture(uNoise, w.xz / 80.0 + uTime * vec2(0.002, 0.0013));
	float rapid = smoothstep(1.3, 3.8, speed) * (1.0 - fall);
	vec2 g = (big.rg - 0.5) * vec2(1.3, 0.8) + (fine.rg - 0.5) * 0.8;
	g.y += cos(vFlow.x * 0.6 + still.g * 8.0) * 0.4 * rapid;
	vec3 n = normalize(vec3(0.0, 1.0, 0.0) + (across * g.x + along * g.y) * (0.3 + 0.55 * rapid + 0.5 * churn) * lod);
	// light: the valley walls' shadows and the clouds' fall across it
	float sun = sunShadow(w + vec3(0.0, 1.0, 0.0)) * cloudShade(w.xz);
	vec3 amb = ambient(vec3(0.0, 1.0, 0.0));
	// the water itself: glacial teal down the deep channel, clear green over the shallows, the
	// stony bed showing through near the banks with the sun's caustics rippling over it
	vec3 body = mix(vec3(0.12, 0.42, 0.38), vec3(0.025, 0.17, 0.22), smoothstep(0.2, 2.6, d));
	float clear = exp(-d * 1.2);
	body = mix(body, vec3(0.46, 0.42, 0.33) * (0.7 + 0.6 * still.a), clear * 0.7);
	body *= amb * 1.15 + uSunCol * 0.4 * sun;
	float caus = 1.0 - smoothstep(0.0, 0.035, abs(fine.r - still.r));
	body += uSunCol * caus * clear * clear * 0.3 * sun * lod;
	// the sky in it, the sun's highlight, and glitter carried off down the current
	vec3 r = reflect(-V, n);
	float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
	vec3 c = mix(body, skyRefl(r) * mix(0.7, 1.0, sun), clamp(fres, 0.0, 1.0) * 0.85);
	float sd = max(dot(r, uSunDir), 0.0);
	c += uSunCol * (pow(sd, 70.0) * 0.3 + pow(sd, 600.0) * 4.0) * sun;
	c += uSunCol * smoothstep(0.8, 0.96, fine.a) * pow(sd, 12.0) * 2.5 * sun * lod;
	// foam
	vec3 white = vec3(0.93, 0.96, 1.0) * (amb * 1.1 + uSunCol * 0.55 * sun);
	float fn = big.a * 0.6 + fine.a * 0.4;
	// lace along the banks where the current tears at the shallows (on still water, a thin line
	// lapping in and out at the shore)
	float run = min(speed, 1.0);
	float edge = 1.0 - smoothstep(0.0, mix(0.15, 0.8, run), d + (1.0 - run) * 0.08 * sin(uTime * 1.3 + still.g * 12.0));
	float foam = edge * smoothstep(0.55, 0.8, fn + edge * 0.3) * mix(0.35, 0.8, run);
	// bubbles riding the current in long lines; whitecaps all over the rapids
	float moving = smoothstep(0.5, 1.2, speed);
	foam = max(foam, smoothstep(0.66, 0.84, fine.a) * 0.35 * moving * (1.0 - rapid));
	foam = max(foam, smoothstep(0.7 - 0.25 * rapid, 0.9 - 0.15 * rapid, fn) * (0.25 + 0.75 * rapid) * moving);
	// the water boiling white below a fall, breaking up as it drifts on downstream
	float boil = churn * (1.0 - fall);
	foam = max(foam, boil * smoothstep(0.6 - boil * 0.5, 0.85 - boil * 0.3, fn));
	c = mix(c, white * (0.85 + 0.15 * fine.g), clamp(foam, 0.0, 1.0) * 0.92);
	// over a fall: ropes of white water pouring down, with glimpses of the dark water between,
	// lit by how the face of the fall itself turns to the sun
	vec3 face = normalize(cross(dFdx(w), dFdy(w)));
	face *= sign(face.y + 1e-4);
	vec3 lit = vec3(0.93, 0.96, 1.0) * (ambient(face) * 1.15 + uSunCol * 0.6 * max(dot(face, uSunDir), 0.0) * sun);
	vec4 rope = texture(uNoise, vec2(vFlow.y / 22.0, vFlow.x / 70.0 - uTime * 0.38));
	float wf = clamp(fall * 1.15, 0.0, 1.0);
	float sheet = mix(0.55, 1.08, smoothstep(0.25, 0.7, rope.g * 0.7 + rope.r * 0.3)) * (0.85 + 0.15 * fine.a);
	float pour = smoothstep(0.3, 0.6, rope.g * 0.5 + fn * 0.5 + (wf - 0.9) * 2.0);
	c = mix(c, lit * sheet, wf * mix(smoothstep(0.35, 0.6, fn), 1.0, wf) * mix(0.5, 1.0, pour));
	// the last stretch turns into the sea, so by where it meets it they're one and the same
	float toSea = smoothstep(uMouthS.x, uMouthS.y, vFlow.x);
	if (toSea > 0.0) c = mix(c, seaColor(w, 0.07, CAMERA_POSITION_WORLD), toSea);
	MAP_OUT(c)
}
