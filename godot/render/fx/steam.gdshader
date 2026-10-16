// High-pressure vapour puffs (steam.ts VERT/FRAG). Each puff is a camera-facing card cut from
// the vapour atlas; fast puffs stretch along their motion (the jet reads as a hard streak of
// pressure), slow ones turn and swell. Lit from above, their thin parts erode away as they age,
// so the cloud frays into wisps instead of just fading.
//
// The web steps each puff on the CPU (drag, buoyancy and a curling turbulence that depends on
// where it is); here the vertex shader replays the same steps from the puff's birth, so nothing
// is touched on the CPU after a puff is emitted.
//
// Instance (FxSteam._puff): origin = spawn point, basis x = velocity, basis y = (spawn time,
// life, size), basis z = (grow, drag, peak alpha); COLOR = (spin angle, spin rate, seed / 100,
// atlas tile / 4); INSTANCE_CUSTOM.x = kind (0 core, 1 billow, 2 wisp).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;

uniform float now;
uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;

varying vec2 v_uv;
varying vec2 v_tile;
varying float v_a;
varying float v_age;
varying float v_shade;
varying float v_hot;

void vertex() {
	vec3 p = MODEL_MATRIX[3].xyz;
	vec3 v = MODEL_MATRIX[0].xyz;
	float t0 = MODEL_MATRIX[1].x;
	float life = MODEL_MATRIX[1].y;
	float size0 = MODEL_MATRIX[1].z;
	float grow = MODEL_MATRIX[2].x;
	float drag = MODEL_MATRIX[2].y;
	float peak = MODEL_MATRIX[2].z;
	float kind = INSTANCE_CUSTOM.x;
	bool core = kind < 0.5;
	float seed = COLOR.b * 100.0;
	float tau = now - t0;
	if (tau < 0.0 || tau >= life || size0 <= 0.0) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		// replay the web's steps: drag, then buoyancy (vapour is light), then the curl
		int n = int(clamp(ceil(tau * 40.0), 1.0, 80.0));
		float h = tau / float(n);
		float dr = exp(-drag * h);
		float buoy = core ? 0.3 : 1.1;
		float tb = core ? 0.0 : 1.6 * h;
		for (int i = 0; i < n; i++) {
			float tc = t0 + float(i + 1) * h;
			v *= dr;
			v.y += buoy * h;
			v.x += sin(p.y * 6.1 + tc * 2.3 + seed) * tb;
			v.y += sin(p.z * 5.3 + tc * 1.7 + seed * 1.3) * tb * 0.6;
			v.z += sin(p.x * 5.7 + tc * 2.1 + seed * 0.7) * tb;
			p += v * h;
		}
		float k = 1.0 - tau / life;
		float age = 1.0 - k;
		float rot = COLOR.r + COLOR.g * (tau - tau * tau / (2.0 * life));
		// swells fast, then slowly
		float swell = 1.0 - k * k;
		float size = size0 * (1.0 + grow * swell);
		// the core is clear right at the hinge and turns white as it condenses; all of it thins away
		float fade_in = min(1.0, age * (core ? 7.0 : 12.0));
		float a = peak * fade_in * (core ? k : min(1.0, k * 1.6));
		float streak_s = core ? 0.035 : (kind < 1.5 ? 0.012 : 0.0);
		vec4 mv = VIEW_MATRIX * vec4(p, 1.0);
		vec2 vv = (VIEW_MATRIX * vec4(v, 0.0)).xy;
		float sp = length(vv);
		float streak = sp * streak_s;
		vec2 rot_axis = vec2(cos(rot), sin(rot));
		vec2 vel_axis = sp > 1e-4 ? vv / sp : rot_axis;
		vec2 axis = normalize(mix(rot_axis, vel_axis, clamp(streak / size, 0.0, 1.0)) + vec2(1e-5, 0.0));
		vec2 perp = vec2(-axis.y, axis.x);
		float along = size + streak;
		vec2 off = axis * VERTEX.x * along + perp * VERTEX.y * size;
		mv.xy += off;
		POSITION = PROJECTION_MATRIX * mv;
		v_uv = VERTEX.xy + 0.5;
		float t = floor(COLOR.a * 4.0 + 0.5);
		v_tile = vec2(mod(t, 2.0), floor(t / 2.0)) * 0.5;
		// never let a puff right in front of the lens fill the screen
		v_a = a * smoothstep(0.2, 0.7, -mv.z);
		v_age = age;
		v_hot = core ? k : 0.0;
		v_shade = clamp(0.5 + off.y / max(along, size), 0.0, 1.0);
	}
}

void fragment() {
	// (three's canvas textures are flipped: v runs up the image)
	vec2 uv = v_tile + clamp(v_uv, 0.0, 1.0) * 0.5;
	float d = texture(atlas, vec2(uv.x, 1.0 - uv.y)).r;
	// thin vapour burns off first: the cloud frays into wisps as it ages
	float e = v_age * v_age * 0.6;
	float a = smoothstep(e, e + 0.3, d) * v_a * 0.85;
	if (a < 0.004) {
		discard;
	}
	// lit from the rig above, shadowed underneath; dense parts scatter more light
	float lit = clamp(v_shade * 0.75 + d * 0.45, 0.0, 1.0);
	vec3 col = mix(vec3(0.42, 0.47, 0.55), vec3(1.0, 0.99, 0.97), lit);
	col = mix(col, vec3(1.05, 1.05, 1.08), v_hot * 0.6);
	// premultiplied: the fresh core glows a little (adds light), the cloud mostly occludes
	ALBEDO = col * a;
	ALPHA = a * (1.0 - v_hot * 0.45);
}
