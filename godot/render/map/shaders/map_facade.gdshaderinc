// What the city's facades share (building.gdshader, tower.gdshader): the rooms seen through the
// windows (interior mapping: a box room behind every window, walls, floor, ceiling and a bit of
// furniture, so the inside moves with the view as a real room does), which rooms have their
// lights on (and the odd one switching on or off as the minutes pass), the lamps' colours, and
// the glass in front (the sky and the street reflected, per pane, each pane a hair out of plane
// as real glazing is). Needs map_common.gdshaderinc first.

// lamp colours: warm bulbs, neutral, cool office panels, a television's blue
const vec3 LAMP_WARM = vec3(1.0, 0.68, 0.4);
const vec3 LAMP_SOFT = vec3(1.0, 0.84, 0.64);
const vec3 LAMP_COOL = vec3(0.78, 0.9, 1.0);
const vec3 LAMP_TV = vec3(0.45, 0.62, 1.0);

// is the light on in room `id`: `share` of them are; a quarter of the rooms change their mind
// every minute or few (so the city lives a little as you watch)
float facadeOn(vec2 id, float seed, float share) {
	float h = hash12(id * 5.1 + seed * 13.0);
	float epoch = h < 0.25 ? floor(uTime / (45.0 + 220.0 * hash12(id * 2.3 + seed)) + hash12(id * 1.3)) : 0.0;
	return step(hash12(id + seed * 917.0 + epoch * 17.0), share);
}

// a room's lamp: offices mostly cool panels, homes mostly warm bulbs, the odd television
vec3 facadeLamp(float h, float office) {
	if (office > 0.5) return h < 0.55 ? LAMP_COOL : h < 0.85 ? LAMP_SOFT : LAMP_WARM;
	if (h > 0.9) return LAMP_TV * (0.7 + 0.3 * sin(uTime * 7.0 + h * 90.0) * sin(uTime * 3.1 + h * 40.0));
	return h < 0.6 ? LAMP_WARM : h < 0.85 ? LAMP_SOFT : LAMP_COOL;
}

// The room behind a window, as the view ray meets it (interior mapping). p: where the ray goes
// through the glass, metres from the room's floor at its left wall; rs: the room's width and
// height (floor to ceiling); d: the ray in the facade's frame (x across, y up, z in); depth: how
// deep the room is; rh: the room's own random number; on/lamp: its light; day: the daylight that
// comes in through the window. Returns the light coming back out (linear radiance).
vec3 facadeRoom(vec2 p, vec2 rs, vec3 d, float depth, float rh, float on, vec3 lamp, vec3 day) {
	d.z = max(d.z, 0.06);
	float dx = sign(d.x) * max(abs(d.x), 1e-4), dy = sign(d.y) * max(abs(d.y), 1e-4);
	float tx = ((d.x > 0.0 ? rs.x : 0.0) - p.x) / dx;
	float ty = ((d.y > 0.0 ? rs.y : 0.0) - p.y) / dy;
	float tz = depth / d.z;
	float t = min(min(tx, ty), tz);
	vec3 h = vec3(p, 0.0) + d * t;
	float r1 = fract(rh * 7.13), r2 = fract(rh * 13.7), r3 = fract(rh * 3.31);
	vec3 wall = r1 < 0.4 ? vec3(0.78, 0.75, 0.68) : r1 < 0.7 ? vec3(0.66, 0.69, 0.72) : r1 < 0.9 ? vec3(0.8, 0.7, 0.56) : vec3(0.55, 0.62, 0.55);
	vec3 col;
	if (t == tz) {
		col = wall;
		// against the back wall: desks or a sofa (a low dark band), a tall cupboard or shelves
		float fx = h.x / rs.x;
		float low = step(h.y, 0.7 + 0.25 * r2) * step(abs(fx - (0.3 + 0.4 * r3)), 0.18 + 0.2 * r1);
		float tall = step(h.y, 1.95) * step(abs(fx - fract(r3 + 0.45)), 0.07 + 0.06 * r2) * step(0.45, r2);
		// a picture, or a screen on the wall
		float pic = step(abs(h.y - 1.55), 0.28) * step(abs(fx - fract(r1 + 0.3)), 0.1) * step(r3, 0.6);
		col = mix(col, r2 < 0.5 ? vec3(0.22, 0.15, 0.1) : vec3(0.16, 0.17, 0.2), max(low, tall));
		col = mix(col, r1 < 0.5 ? vec3(0.2, 0.32, 0.45) : vec3(0.55, 0.3, 0.2), pic * (1.0 - max(low, tall)));
	} else if (t == ty) {
		// the ceiling, or the floor (boards or carpet)
		col = d.y > 0.0 ? vec3(0.85, 0.84, 0.8) : r3 < 0.5 ? vec3(0.36, 0.24, 0.15) : vec3(0.3, 0.3, 0.33);
	} else {
		// a side wall, with a doorway in some
		col = wall * 0.85;
		col *= 1.0 - 0.45 * step(h.y, 2.1) * step(abs(h.z - depth * 0.6), 0.45) * step(0.5, r2);
	}
	// lit by its lamp (a panel in the middle of the ceiling) and by the daylight from the window,
	// which fades towards the back of the room
	vec3 lc = vec3(rs.x * 0.5, rs.y, depth * 0.45);
	vec3 dl = h - lc;
	float k = 1.0 / (1.0 + 0.16 * dot(dl, dl));
	vec3 c = col * (lamp * on * (0.25 + 1.1 * k) + day * (1.0 - 0.75 * h.z / depth));
	// the lamp itself, on the ceiling
	if (t == ty && d.y > 0.0) c += lamp * on * 1.6 * smoothstep(1.0, 0.4, length(dl.xz / vec2(rs.x * 0.3, depth * 0.22)));
	return c;
}

// the glass's reflection along r: the sky above the horizon; below it the city across the
// street, its facades a patchwork of lit and shaded glass and stone (darker at night, its
// windows lit)
vec3 facadeSky(vec3 r) {
	vec4 nz = texture(uNoise, r.xz * 1.7 + r.y * 0.9);
	vec4 nw = texture(uNoise, r.xz * 9.0 + r.y * 4.0);
	vec3 city = mix(vec3(0.1, 0.11, 0.13), vec3(0.3, 0.29, 0.27), nz.r) * (1.0 - 0.92 * uNight) + vec3(1.0, 0.72, 0.45) * smoothstep(0.8, 0.86, nw.g) * 0.3 * uNight;
	return mix(city, skyCol(r), smoothstep(-0.1, 0.05, r.y));
}

// how much a pane reflects at view angle cosine `cv`, for glass reflecting `f0` head on (Schlick)
float facadeFresnel(float cv, float f0) {
	float m = 1.0 - clamp(cv, 0.0, 1.0);
	float m2 = m * m;
	return f0 + (1.0 - f0) * m2 * m2 * m;
}
