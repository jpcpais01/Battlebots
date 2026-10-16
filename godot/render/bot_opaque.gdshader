// Robot plating: rigidly skinned on the GPU (one bone per corner, see bot_model.gd), colour,
// metalness and roughness per material key from the robot's paint (web: skin.ts + bake.ts).
shader_type spatial;

// 31 bones, three rows each: the bone's turn and scale in .xyz, its place in .w
uniform vec4 bones[93];
// per material key: linear colour and metalness, then roughness
uniform vec4 surf[12];
uniform float rough[12];

varying flat float v_key;

void vertex() {
	int b = int(CUSTOM1.x + 0.5) & 31;
	vec4 r0 = bones[b * 3];
	vec4 r1 = bones[b * 3 + 1];
	vec4 r2 = bones[b * 3 + 2];
	vec4 v = vec4(VERTEX, 1.0);
	VERTEX = vec3(dot(r0, v), dot(r1, v), dot(r2, v));
	vec3 n = NORMAL;
	NORMAL = normalize(vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n)));
	v_key = CUSTOM0.x;
}

void fragment() {
	int k = int(v_key + 0.5);
	ALBEDO = surf[k].rgb;
	METALLIC = surf[k].a;
	ROUGHNESS = rough[k];
}
