// A normal Godot's lighting can't turn into a black pixel.
//
// On phones whose GPU has 16-bit floats (most of them), the Mobile renderer lights in half
// precision, and its GGX highlight breaks down for a normal turned away from the eye. It floors
// n.v at 1e-4, which half floats can't hold: the visibility term divides by zero and comes out at
// the half maximum. Where the normal also points nearly away from the light's half vector (n close
// to -h, cross(n, h) about 0) the distribution term does the same, and the driver multiplies the
// two (65504 x 65504 = infinity) before the zero n.l: NaN, a pure black pixel. Desktops and the
// container light in 32-bit floats and never show it.
//
// Normals face away wherever they are bent (dents, relief, normal maps), interpolated past a
// silhouette, or on the wrong side of a two-sided card. Lifting such a normal onto a ring just
// this side of the silhouette (n.v = LIT_NV_MIN) keeps every term finite: at n.v >= 0.15 the
// normal stays over 8 degrees off -h, and the two terms multiplied stay under 2200 at any
// roughness. Normals already facing the eye are left exactly as they are.
const float LIT_NV_MIN = 0.15;

vec3 lit_safe(vec3 n, vec3 view) {
	vec3 u = normalize(n);
	float nv = dot(u, view);
	return nv >= LIT_NV_MIN ? n : normalize(u + view * (LIT_NV_MIN - nv));
}
