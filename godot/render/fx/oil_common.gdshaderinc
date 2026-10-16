// Wet motor oil (oil.ts oilMaterial): near-black, almost mirror-glossy, with a thin-film rainbow
// that swirls over it and brightens at grazing angles.
float oil_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oil_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(oil_hash(i), oil_hash(i + vec2(1.0, 0.0)), f.x), mix(oil_hash(i + vec2(0.0, 1.0)), oil_hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// thin-film interference: the oil-slick rainbow, shifting with the film's thickness and the view angle
vec3 oil_film(float t) { return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }

// three's MeshStandardMaterial({ color: 0x020203, roughness: 0.05, metalness: 0.25 }) plus the film
void oil_surface(vec3 world, vec3 view, vec3 normal, float film, out vec3 albedo, out vec3 emission) {
	albedo = vec3(0.000607, 0.000607, 0.000911);
	float graze = 1.0 - abs(dot(view, normal));
	float thick = oil_noise(world.xz * 9.0) * 0.9 + oil_noise(world.xz * 23.0 + 4.0) * 0.4 + graze * 1.4;
	emission = oil_film(thick) * film * (0.35 + graze * graze * 1.6);
}
