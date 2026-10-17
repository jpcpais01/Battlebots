// The referee drone's rig (render/referee/referee.gd): nine rigid bones, each a 3x4 matrix in
// three rows (the body, the two fan pods, then each arm's upper arm, forearm and glove). Every
// vertex carries its bone in CUSTOM0.x and its surface in CUSTOM0.y.
uniform vec4 bones[27];

vec3 ref_bone_point(int b, vec3 v) {
	vec4 p = vec4(v, 1.0);
	return vec3(dot(bones[b * 3], p), dot(bones[b * 3 + 1], p), dot(bones[b * 3 + 2], p));
}

vec3 ref_bone_dir(int b, vec3 n) {
	return vec3(dot(bones[b * 3].xyz, n), dot(bones[b * 3 + 1].xyz, n), dot(bones[b * 3 + 2].xyz, n));
}
