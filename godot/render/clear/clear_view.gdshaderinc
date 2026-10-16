// Keeps the camera's view of the fight clear (src/render/clearView.ts): ring scenery between the
// lens and the robots dissolves with a screen-door dither, so only the robots themselves stand in
// front of the fight. ClearView (clear_view.gd) drives the globals. Call clear_view(world xz,
// FRAGCOORD.xy) at the top of fragment(); floor-level surfaces don't include it.
global uniform float bb_clear_on;
global uniform float bb_clear_depth;
global uniform vec2 bb_clear_span;
global uniform vec2 bb_clear_cam;
global uniform vec2 bb_clear_fwd;

float clear_bayer(vec2 p) {
	vec2 q = mod(floor(p), 4.0);
	vec2 lo = mod(q, 2.0), hi = floor(q * 0.5);
	float b = 4.0 * mod(2.0 * lo.x + 3.0 * lo.y, 4.0) + mod(2.0 * hi.x + 3.0 * hi.y, 4.0); // 4x4 Bayer
	return (b + 0.5) / 16.0;
}

// Measured in the ground plane along the camera's horizontal forward axis, so an upright post is
// either all there or all gone. Behind the nearest robot stays, well in front goes, in between it
// goes only where it overlaps the robots (bb_clear_span: lateral offset over forward distance).
bool clear_view_gone(vec2 xz, vec2 frag) {
	if (bb_clear_on < 0.5) return false;
	vec2 rel = xz - bb_clear_cam;
	float d = dot(rel, bb_clear_fwd);
	float a = dot(rel, vec2(-bb_clear_fwd.y, bb_clear_fwd.x)) / max(d, 0.05);
	float beside = smoothstep(0.0, 0.25, max(bb_clear_span.x - a, a - bb_clear_span.y) * max(d, 0.0));
	float behind = smoothstep(bb_clear_depth - 0.1, bb_clear_depth + 0.4, d);
	float keep = max(behind, min(beside, smoothstep(bb_clear_depth - 1.4, bb_clear_depth - 0.9, d)));
	return keep < clear_bayer(frag);
}
