// Shared by the hit effects' shaders (ports of src/render/fx.ts, sparks.ts, steam.ts, oil.ts).
//
// The web steps every particle on the CPU each frame. Here a particle is written once, when it
// is born (spawn position, velocity, time and constants packed into its MultiMesh instance:
// see FxPool), and the vertex shader works out where it is now in closed form: linear drag
// with gravity has an exact solution, and the bounces off the deck are found by bisection.

// The ring and the ground round it (debris.ts groundAt, the part a spark can reach): the canvas
// octagon at 0, its steel base at -0.12, and the arena floor beyond.
const float FX_CANVAS = 5.1275;   // (RING_CORNER + 0.55) * cos(pi/8)
const float FX_BASE = 5.3123;     // (RING_CORNER + 0.75) * cos(pi/8)
const float FX_FLOOR = -0.62;

float fx_ground(vec2 xz) {
	// distance out along the nearest octagon side's normal (sides face k * 45 degrees)
	float a = atan(xz.y, xz.x);
	float k = round(a / 0.785398163);
	float oct = dot(xz, vec2(cos(k * 0.785398163), sin(k * 0.785398163)));
	return oct < FX_CANVAS ? 0.0 : (oct < FX_BASE ? -0.12 : FX_FLOOR);
}

// (1 - e^-dt) / d: how far a unit velocity carries under drag d in time t
float fx_carry(float d, float t) {
	return d > 1e-4 ? (1.0 - exp(-d * t)) / d : t;
}

// height after t under drag d and gravity g (g > 0 pulls down; the web steps the same ODE)
float fx_y(float y0, float vy, float d, float g, float t) {
	if (d <= 1e-4) {
		return y0 + vy * t - 0.5 * g * t * t;
	}
	return y0 + (vy + g / d) * fx_carry(d, t) - g / d * t;
}

float fx_vy(float vy, float d, float g, float t) {
	if (d <= 1e-4) {
		return vy - g * t;
	}
	return (vy + g / d) * exp(-d * t) - g / d;
}

float fx_hash(float n) {
	return fract(sin(n * 12.9898 + 4.1414) * 43758.5453);
}

// the web's Vector3.randomDirection: uniform on the sphere
vec3 fx_dir(float n) {
	float u = fx_hash(n) * 2.0 - 1.0;
	float t = fx_hash(n + 17.17) * 6.2831853;
	float s = sqrt(max(0.0, 1.0 - u * u));
	return vec3(s * cos(t), u, s * sin(t));
}

// fx.ts glowTexture: the alpha of its radial gradient at r (0 centre .. 1 edge)
float fx_glow(float r) {
	if (r >= 1.0) {
		return 0.0;
	}
	if (r < 0.18) {
		return mix(1.0, 0.85, r / 0.18);
	}
	if (r < 0.45) {
		return mix(0.85, 0.25, (r - 0.18) / 0.27);
	}
	return mix(0.25, 0.0, (r - 0.45) / 0.55);
}

// Flight under drag d and gravity g for tau seconds from (p, v), bouncing off a flat floor at
// height fl (fx.ts Fx.update): the height flips to rest of the fall speed, sideways speed keeps
// xzk. Returns the position; the velocity comes back in v.
vec3 fx_fly(vec3 p, inout vec3 v, float d, float g, float tau, float fl, float rest, float xzk) {
	p.y = max(p.y, fl);
	for (int b = 0; b < 3; b++) {
		if (fx_y(p.y, v.y, d, g, tau) >= fl) {
			break;
		}
		float lo = 0.0;
		float hi = tau;
		for (int s = 0; s < 10; s++) {
			float mid = 0.5 * (lo + hi);
			if (fx_y(p.y, v.y, d, g, mid) < fl) {
				hi = mid;
			} else {
				lo = mid;
			}
		}
		float e = exp(-d * hi);
		float c = fx_carry(d, hi);
		float vy = fx_vy(v.y, d, g, hi);
		p = vec3(p.x + v.x * c, fl, p.z + v.z * c);
		v = vec3(v.x * e * xzk, -vy * rest, v.z * e * xzk);
		tau -= hi;
	}
	float e = exp(-d * tau);
	float c = fx_carry(d, tau);
	vec3 pos = vec3(p.x + v.x * c, max(fl, fx_y(p.y, v.y, d, g, tau)), p.z + v.z * c);
	v = vec3(v.x * e, fx_vy(v.y, d, g, tau), v.z * e);
	return pos;
}
