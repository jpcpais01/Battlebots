// The LED boards (venue.ts ledMaterial), shared by led.gdshader and led_ads.gdshader.
#include "res://render/venue/common.gdshaderinc"

const float AD_COLS = 4.0;
const float AD_ROWS = 3.0;
const float AD_COUNT = 12.0;

uniform sampler2D map : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);

varying vec3 v_led;

void vertex() {
	v_led = CUSTOM0.xyz;
}

void fragment() {
	float len = v_led.x, speed = v_led.y, glow = v_led.z;
	vec2 uv = UV;
	vec3 c;
#ifdef ADS
	{
		float x = uv.x / len - bb_time * speed;
		float seg = floor(x), f = x - seg;
		float t = bb_time / 8.0 + fract(seg * 0.618);
		float k = floor(t), wipe = clamp(fract(t) * 16.0, 0.0, 1.0);
		float idx = mod(seg * 5.0 + k - (f > wipe ? 1.0 : 0.0), AD_COUNT);
		vec2 cell = vec2(mod(idx, AD_COLS), AD_ROWS - 1.0 - floor(idx / AD_COLS));
		// gradients from the unwrapped coordinate, so cell edges don't drop to the smallest mip
		vec2 g = vec2(x / AD_COLS, uv.y / AD_ROWS);
		c = textureGrad(map, (cell + vec2(f, uv.y)) / vec2(AD_COLS, AD_ROWS), dFdx(g), dFdy(g)).rgb;
		c += vec3(0.9) * smoothstep(0.03, 0.0, abs(f - wipe)) * step(wipe, 0.999);
	}
#else
		c = texture(map, vec2(uv.x / len - bb_time * speed, uv.y)).rgb;
#endif
	float strobe = step(0.5, fract(bb_time * 5.0 + uv.x * 0.02));
	c = c * (1.0 + bb_flash) + mix(vec3(1.0, 0.45, 0.1), vec3(0.15, 0.75, 1.0), strobe) * bb_flash * 0.25;
	ALBEDO = c * glow * (0.85 + 0.25 * bb_hype);
	FOG = bb_fog(VERTEX);
}
