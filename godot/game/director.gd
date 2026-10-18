## The broadcast camera director: in a fight it works like a live TV director. It picks a shot
## (wide, medium, low hero angle, over the shoulder, orbit, crane, the odd bot's-eye view), keeps
## both fighters framed inside it, cuts to a fresh angle every few seconds or on a big moment,
## punches in on heavy hits, and goes cinematic for the presentations, knockdowns, KOs and the
## celebration. Port of src/render/director.ts (class Director), same maths and the same draws
## from the same match-seeded Rng, so a fight is filmed with the shots and cuts the web picks.
##
## The fight camera is directed on the match clock: step(m, dt) runs once per sim step (after the
## step, with cue() for that step's events before it), update(dt, m, alpha) once per frame eases
## the lens from the last step's setup to this one's and adds the shake. Only the 'match' mode is
## exercised in the Godot app so far; 'menu', 'garage' and 'scene' are ported but untested.
class_name Director
extends RefCounted

## Zoom levels for fight shots (director.ts ZOOM): zoom only moves the lens along the shot (dist)
## and opens or tightens it (fov); lens_fov() widens just enough to keep both bots framed.
const ZOOM := {
	"close": {"dist": 0.72, "fov": 0.94},
	"normal": {"dist": 1.0, "fov": 1.0},
	"wide": {"dist": 1.38, "fov": 1.12},
}
## How long the camera holds its shot after a part is torn off before it may cut.
const HOLD_TEAR := 0.7
## Radius the camera roams within (the stands' front row is at 10 m along the short side).
const FREE_R := 9.0
## Joints used to frame a fighter (J.Head, Chest, Pelvis, HandL, HandR, KneeL, KneeR, FootL, FootR).
const FRAME_JOINTS := [3, 1, 0, 6, 9, 11, 14, 12, 15]
## How much of the half-frame each joint may use (heads keep headroom, limbs may graze the edge).
const JOINT_ROOM := [0.94, 1.0, 1.0, 1.08, 1.08, 1.0, 1.0, 1.1, 1.1]
const J_PELVIS := 0
const J_CHEST := 1
const J_HEAD := 3
const J_FOOT_L := 12
const J_FOOT_R := 15
## Least time between two bot's-eye shots, so they stay a treat.
const POV_GAP := 16.0
## Chance a cut that may go to a bot's eye does.
const POV_CHANCE := 0.3
## A bot's-eye shot holds at least POV_MIN, whatever happens, and never longer than POV_MAX (s).
const POV_MIN := 3.0
const POV_MAX := 7.0
## How far apart the fighters may be for a bot's-eye shot (m).
const POV_SEP := [0.8, 4.0]
## Titan battles: how far the lens may roam the plain (the stadium's podium wall is at 21), how
## often a cut goes to a fan's view from the stands, and that view's seats: rows of the lower tier
## (titan_build.gd TIERS[0]: front 21.8, 0.06 a row, first tread 1.55, 0.038 a row up).
const TITAN_FREE_R := 19.0
const CROWD_GAP := 9.0
const CROWD_CHANCE := 0.35
const CROWD_TIER := [21.8, 0.06, 1.55, 0.038]
## The fan's eye above their tread (standing, 1.6 m at the titans' 1/15).
const CROWD_EYE := 0.105
## The bowl (src/render/bowl.ts): front row half-extents, upper-tier set-back and height.
const AX := 13.0
const AZ := 10.0
const SUITE_D := 15.0 * 0.9
const UPPER_Y := 9.4
## Shot kind, calm weight, heated weight.
const WEIGHTS := [
	["wide", 2.2, 0.8],
	["medium", 3.0, 3.5],
	["low", 1.4, 2.4],
	["ots", 1.8, 2.6],
	["orbit", 1.8, 1.2],
	["high", 0.6, 0.4],
]


## A camera setup, described relative to the line between the fighters (director.ts Shot).
class Shot extends RefCounted:
	var kind := "wide"
	var t := 0.0
	var dur := 4.0
	## Angle off the perpendicular of the fight line; positive swings round behind fighter 0.
	var az := 0.0
	## Slow swing of az (rad/s).
	var orbit := 0.0
	## Elevation of the lens above the look point (rad).
	var el := 0.15
	## Lens relative to the base fov (<1 longer, >1 wider).
	var fov_k := 1.0
	## Fraction of the half-frame the fighters may fill.
	var fill := 0.84
	## Dutch tilt (rad).
	var roll := 0.0
	## Handheld wobble of the look point (m).
	var wobble := 0.015
	## Fighter the shot favours (-1: both equally).
	var subject := -1
	## How far the framing centre leans toward the subject.
	var bias := 0.0
	## A raised shot: never pushed higher when the stands crowd the lens.
	var high := false


## What step() reads of a match, copied right after one sim step. The game runs its sim steps on
## a worker thread a frame ahead; it captures one View per step there and steps the director on
## the main thread afterwards against exactly the state each step left, so the cuts and shots
## come out as the web's (which steps the director inline). Same field names as TMatch.Match.
class View extends RefCounted:
	var phase := ""
	var phaseTime := 0.0
	var presenting := -1.0
	var seed_ := 0.0
	## null, or {att: {index}} while a finisher plays.
	var fin = null
	## null, or the winner's ViewFighter.
	var winner = null
	var fighters: Array = []
	var _fin := {"att": {"index": 0.0}}

	func _init() -> void:
		fighters = [ViewFighter.new(), ViewFighter.new()]

	func capture(m) -> void:
		# (a tag team match stopped for an elimination is filmed as a knockout)
		phase = "ko" if m.tag != null and m.tag.paused else m.phase
		phaseTime = m.phaseTime
		presenting = m.presenting
		seed_ = m.seed_
		if m.fin == null:
			fin = null
		else:
			_fin.att.index = m.fin.att.index
			fin = _fin
		fighters[0].capture(m.fighters[0])
		fighters[1].capture(m.fighters[1])
		winner = null if m.winner == null else fighters[int(m.winner.index)]


class ViewFighter extends RefCounted:
	var index := 0.0
	var isDown := false
	var state := ""
	## null, or {phase} while a strike is on.
	var strike = null
	var parts := {"off": [0.0]}
	var size_ := 1.0
	var yaw := 0.0
	## Joint positions (only the joints the director reads are copied).
	var body := {"pos": []}
	var _strike := {"phase": ""}

	func _init() -> void:
		for j in 16:
			body.pos.append(V3.new())

	func capture(f) -> void:
		index = f.index
		isDown = f.isDown
		state = f.state
		var s = f.strike
		if s == null:
			strike = null
		else:
			_strike.phase = s.phase
			strike = _strike
		parts.off[0] = f.parts.off[0]
		size_ = f.size_
		yaw = f.yaw
		var src: Array = f.body.pos
		var dst: Array = body.pos
		for j in FRAME_JOINTS:
			var a = src[j]
			var b: V3 = dst[j]
			b.x = a.x
			b.y = a.y
			b.z = a.z


## director.ts makeShot: the draws happen in the same order as the web's object literals.
static func make_shot(kind: String, r: TMath.Rng) -> Shot:
	var sgn := -1.0 if r.next() < 0.5 else 1.0
	var s := Shot.new()
	s.kind = kind
	match kind:
		"wide":
			s.dur = 5.0 + r.next() * 3.0
			s.az = (r.next() - 0.5) * 0.7
			s.orbit = (r.next() - 0.5) * 0.06
			s.el = 0.3 + r.next() * 0.1
			s.fov_k = 0.82
			s.fill = 0.7
			s.wobble = 0.006
			s.high = true
		"medium":
			s.dur = 4.0 + r.next() * 3.0
			s.az = (r.next() - 0.5) * 0.9
			s.orbit = (r.next() - 0.5) * 0.1
			s.el = 0.1 + r.next() * 0.1
			s.fov_k = 1.0
			s.fill = 0.86
			s.roll = (r.next() - 0.5) * 0.04
			s.wobble = 0.02
		"low":
			s.dur = 3.5 + r.next() * 2.5
			s.az = (r.next() - 0.5) * 1.0
			s.orbit = (r.next() - 0.5) * 0.14
			s.el = -0.12 + r.next() * 0.1
			s.fov_k = 1.25
			s.fill = 0.84
			s.roll = sgn * (0.04 + r.next() * 0.04)
			s.wobble = 0.025
		"ots":
			# over one fighter's shoulder, onto the other's face
			var near := 0 if r.next() < 0.5 else 1
			s.dur = 3.5 + r.next() * 2.5
			s.az = (1.0 if near == 0 else -1.0) * (0.5 + r.next() * 0.15)
			s.el = 0.1 + r.next() * 0.08
			s.fov_k = 1.12
			s.fill = 0.86
			s.roll = (r.next() - 0.5) * 0.05
			s.wobble = 0.022
			s.subject = 1 - near
			s.bias = 0.22
		"orbit":
			s.dur = 6.0 + r.next() * 3.0
			s.az = sgn * -(0.3 + r.next() * 0.4)
			s.orbit = sgn * (0.16 + r.next() * 0.08)
			s.el = 0.16 + r.next() * 0.1
			s.fov_k = 0.95
			s.fill = 0.82
			s.wobble = 0.01
		"high":
			s.dur = 3.5 + r.next() * 2.0
			s.az = (r.next() - 0.5) * 0.6
			s.el = 0.75 + r.next() * 0.15
			s.fov_k = 0.9
			s.fill = 0.74
			s.wobble = 0.008
			s.high = true
		"win":
			s.dur = 99.0
			s.el = 0.12
			s.fill = 0.6
			s.wobble = 0.01
		"greet":
			# touching gloves: square side-on, at chest height, so both arms read in profile
			s.dur = 99.0
			s.az = 0.0
			s.orbit = sgn * 0.035
			s.el = 0.07
			s.fov_k = 1.0
			s.fill = 0.78
			s.wobble = 0.012
	return s


var camera: Camera3D
## 'menu' | 'garage' | 'match' | 'scene'
var mode := "menu"
var garage_target := Vector3(0, 1.02, 0)
var garage_yaw := 0.5
var garage_dist := 4.7
var menu_turn := 0.0
var menu_live := false
var scene_pos := Vector3(3, 1.6, 4)
var scene_look := Vector3(0, 1, 0)
var scene_fov := 1.0
var scene_roll := 0.0
var scene_lambda := 3.0
## Near and far clip planes for a scene far bigger than the arena, or empty.
var clip := PackedFloat32Array()
## The far clip plane in the arena.
var far := 120.0
## Horizontal framing offset as a fraction of the view width (menus): an off-centre frustum.
var shift_x := 0.0
## Fight-shot zoom level: 'close' | 'normal' | 'wide'.
var zoom := "normal"
## The fighter this screen belongs to: fight shots keep it on the left of the screen.
var player := 0
## Number of hard cuts so far (the drones hand over on each one).
var cuts := 0
## Filming titans (titan battles, render/titan): the fighters are 30 m tall in a stadium 1.5 km
## across, so the camera roams the whole plain, keeps low and looks up at them, and now and then
## cuts to a fan's view from the stands (the "crowd" shot).
var titan := false
## While the crowd shot is on: where the fan filming it stands (xz) and how wildly the fans round
## them cheer (w, 0..1); the stadium's crowd reads it. Zero otherwise.
var crowd_seat := Vector4.ZERO
## Viewport width / height, read from the camera's viewport (the web reads camera.aspect).
var aspect := 16.0 / 9.0

var _pos := Vector3(0, 3, 9)
var _look := Vector3(0, 1.2, 0)
var _trauma := 0.0
var _jolt_off := Vector3.ZERO
var _jolt_vel := Vector3.ZERO
var _fov_kick := 0.0
var _base_fov := 38.0
var _noise: TMath.Noise1
var _t := 0.0
var _orbit := 0.0
var _ko_focus := -1
var _snap_next := false
var _narrow := false
var _shift := 0.0
var _rng: TMath.Rng
var _ft := 0.0
var _prev_pos := Vector3.ZERO
var _prev_look := Vector3.ZERO
var _prev_fov := 38.0
var _prev_roll := 0.0
var _was_ext := false
var _ext := {}
var _fresh := true
var _shot: Shot
var _side := 1
var _axis_ang := 0.0
var _yaw := PI / 2.0
var _el := 0.3
var _dist := 7.0
var _fov := 38.0
var _roll := 0.0
var _center := Vector3(0, 1, 0)
var _raw_center := Vector3.ZERO
var _kick := Vector3.ZERO
var _cut_in := -1.0
var _hold := 0.0
var _next_shot := ""
var _heat := 0.0
var _aligned_for := 0.0
var _raw_axis := 0.0
var _pov_by := -1
var _pov_gap := 0.0
var _crowd_gap := 0.0
var _crowd_eye := Vector3.ZERO
var _crowd_look := Vector3.ZERO
var _pov_eye := Vector3.ZERO
var _pov_look := Vector3.ZERO
var _pov_roll := 0.0
var _fin_by := 0
var _ko_ang := 0.0
var _ko_snap := false
var _sep := 1.0
var _cramped_for := 0.0
var _was_down := [false, false]
var _down_index := 0
var _beat := ""
# arena and crowd shots while the booth's opening outlasts the presentations (director.ts filler)
var _fl_n := 0
var _fl_kind := 0
var _fl_t := 0.0
var _fl_dur := 0.0
var _fl_a := 0.0
var _fl_dir := 1.0
var _pts := PackedVector3Array()
# (a Float32Array in the web: the same rounding)
var _room := PackedFloat32Array()
var _npts := 0
var _dir := Vector3.ZERO
var _right := Vector3.ZERO
var _up := Vector3.ZERO
# dist: where the lens goes at the current zoom; norm: the same at normal zoom; cap: how far the arena allows
var _fit_dist := 0.0
var _fit_norm := 0.0
var _fit_cap := 0.0


func _init(cam: Camera3D = null) -> void:
	camera = cam
	_noise = TMath.Noise1.new(TMath.Rng.new(7.0))
	_rng = TMath.Rng.new(1.0)
	_shot = make_shot("wide", TMath.Rng.new())
	_pts.resize(18)
	_room.resize(18)


## Current fight shot kind.
var shot_kind: String:
	get:
		return _shot.kind

## Fighter the lens is looking out of in a bot's-eye shot, or -1 (its head is hidden meanwhile).
var pov: int:
	get:
		return _pov_by if mode == "match" and _shot.kind == "pov" else -1

## Fighter the current shot is about (-1: both).
var shot_subject: int:
	get:
		return _ko_focus if _shot.kind == "ko" else _shot.subject


## The base vertical fov (38, or 55 on a narrow screen), as Stage sets it.
func set_base_fov(f: float, narrow: bool) -> void:
	_base_fov = f
	_narrow = narrow


## Jump straight to the next pose instead of easing there.
func snap() -> void:
	_snap_next = true


func shake(amount: float) -> void:
	_trauma = minf(1.0, _trauma + amount)


## Knocks the camera a few centimetres the way a blow travelled (~0.5 a jab, ~3 a crushing hit).
func jolt(dir: Vector3, amount: float) -> void:
	_jolt_vel += dir * (minf(3.5, amount) * 0.9)


func punch(amount: float) -> void:
	_fov_kick = minf(6.0, _fov_kick + amount)


func focus_ko(index: int) -> void:
	_ko_focus = index
	_ko_snap = true


static func _wrap(a: float) -> float:
	return atan2(sin(a), cos(a))


static func _damp(cur: float, target: float, lambda: float, dt: float) -> float:
	return cur + (target - cur) * (1.0 - exp(-lambda * dt))


static func _jp(f, j: int) -> Vector3:
	var p = f.body.pos[j]
	return Vector3(p.x, p.y, p.z)


## Longest distance along (dx,dz) from (mx,mz) that stays within radius r.
static func _reach(mx: float, mz: float, dx: float, dz: float, r: float) -> float:
	var md := mx * dx + mz * dz
	var disc := md * md - (mx * mx + mz * mz) + r * r
	return 0.0 if disc < 0.0 else maxf(0.0, -md + sqrt(disc))


## Which way the KO shot looks at the fallen fighter from: the side away from the winner.
func _ko_base(m) -> float:
	var k := maxi(0, _ko_focus)
	var l = m.fighters[k].body.pos[J_PELVIS]
	var w = m.fighters[1 - k].body.pos[J_PELVIS]
	return atan2(l.z - w.z, l.x - w.x)


func reset() -> void:
	_ko_focus = -1
	_orbit = 0.0
	_fresh = true
	_heat = 0.0
	_cut_in = -1.0
	_hold = 0.0
	_next_shot = ""
	_was_down = [false, false]
	_beat = ""
	_pov_by = -1
	_pov_gap = 0.0
	_crowd_gap = 0.0
	crowd_seat = Vector4.ZERO
	if _shot.kind == "pov" or _shot.kind == "crowd":
		_shot = make_shot("wide", _rng)


## A fight starts: everything the fight camera decides with goes back to one fixed state, seeded
## from the match, and the first step frames it.
func begin(m) -> void:
	_sync_aspect()
	_rng = TMath.Rng.new(JS.ushr(JS.bxor(m.seed_, float(0x5ca1ab1e)), 0.0))
	_ko_focus = -1
	reset()
	_ft = 0.0
	_pos = Vector3(0, 3, 9)
	_look = Vector3(0, 1.2, 0)
	_shot = make_shot("wide", _rng)
	_side = 1
	_axis_ang = 0.0
	_raw_axis = 0.0
	_yaw = PI / 2.0
	_el = 0.3
	_dist = 7.0
	_fov = _base_fov
	_roll = 0.0
	_center = Vector3(0, 1, 0)
	_kick = Vector3.ZERO
	_ko_ang = 0.0
	_ko_snap = false
	_sep = 1.0
	_cramped_for = 0.0
	_aligned_for = 0.0
	_down_index = 0
	_fin_by = 0
	_fl_n = 0
	_fl_kind = 0
	_fl_t = 0.0
	_fl_dur = 0.0
	_fl_a = 0.0
	_fl_dir = 1.0
	_was_ext = false
	step(m, 0.0)


## One sim step of the fight camera: `dt` is the real time it covers (SIM_DT / m.pace).
func step(m, dt: float) -> void:
	if mode != "match":
		return
	_prev_pos = _pos
	_prev_look = _look
	_prev_fov = _fov
	_prev_roll = _roll
	var c := cuts
	_ft += dt
	_fight(dt, m)
	# a cut doesn't ease from the old setup
	if cuts != c:
		_settle()


## Start easing from where the lens is now.
func _settle() -> void:
	_prev_pos = _pos
	_prev_look = _look
	_prev_fov = _fov
	_prev_roll = _roll


## Film this frame from a shot worked out elsewhere (the stretcher's) instead of directing.
## Holds for one update.
func film(pos: Vector3, look: Vector3, fov_k: float, cut: bool) -> void:
	_ext = {"pos": pos, "look": look, "fov_k": fov_k, "cut": cut}


## Match events the camera reacts to (call before the step they came from is stepped).
func cue(type: String, data) -> void:
	if mode != "match":
		return
	# a part tearing off is the shot: stay on it while the piece flies, then cut
	if type == "detach":
		_hold = HOLD_TEAR
	if type != "hit":
		return
	if data.shielded:
		return
	var p = data.point
	var point := Vector3(p.x, p.y, p.z)
	if JS.truthy(data.get("finisher")):
		# the finisher has its own shot: glance at the blow, but never cut away
		_kick = (point - _center) * 0.12
		return
	var blocked: bool = data.blocked
	var damage: float = data.damage
	var big: bool = not blocked and (damage >= 55.0 or JS.truthy(data.crit) or JS.truthy(data.knockdown))
	_heat = minf(3.0, _heat + (0.15 if blocked else 0.3 + damage / 80.0))
	# glance toward the impact
	_kick = (point - _center) * (0.35 if big else 0.08 if blocked else 0.15)
	if _kick.length() > 0.4:
		_kick = _kick.normalized() * 0.4
	# big shots often get a cut to a fresh angle once the impact has landed
	if big and not JS.truthy(data.knockdown) and _shot.t > (POV_MIN if _shot.kind == "pov" else 1.2) and _cut_in < 0.0 and _rng.next() < 0.4:
		_cut_in = 0.35 + _rng.next() * 0.2


func _sync_aspect() -> void:
	if camera != null and camera.is_inside_tree():
		var sz := camera.get_viewport().get_visible_rect().size
		if sz.y > 0.0:
			aspect = sz.x / sz.y


## Move the lens for this frame. In a fight `alpha` is how far the sim is towards its next step.
func update(dt: float, m, alpha: float = 1.0) -> void:
	_sync_aspect()
	_t += dt
	var lens_pos := _pos
	var lens_look := _look
	var lens_fov := _fov
	var lens_roll := _roll
	var want_pos := Vector3.ZERO
	var want_look := Vector3.ZERO
	var pos_lambda := 2.6
	var look_lambda := 5.0
	var ext := _ext
	_ext = {}
	if mode == "match" and m != null and not ext.is_empty():
		# (the director keeps directing underneath, and picks up on the winner afterwards)
		if ext.cut or not _was_ext:
			cuts += 1
		_was_ext = true
		lens_pos = ext.pos
		lens_look = ext.look
		lens_fov = _base_fov * ext.fov_k * ZOOM[zoom].fov
		lens_roll = 0.0
	elif mode == "match" and m != null:
		if _was_ext:
			_was_ext = false
			cuts += 1
			_settle()
		var k := clampf(alpha, 0.0, 1.0)
		lens_pos = _prev_pos.lerp(_pos, k)
		lens_look = _prev_look.lerp(_look, k)
		lens_fov = _prev_fov + (_fov - _prev_fov) * k
		lens_roll = _prev_roll + (_roll - _prev_roll) * k
	else:
		_fresh = true
		if mode == "garage":
			var r := garage_dist * (1.2 if _narrow else 1.0)
			want_pos = Vector3(garage_target.x + sin(garage_yaw) * r, garage_target.y + 0.1 + r * 0.08, garage_target.z + cos(garage_yaw) * r)
			want_look = garage_target
			pos_lambda = 4.0
		elif mode == "scene":
			var a := menu_turn
			var c := cos(a)
			var sn := sin(a)
			var lk := scene_look
			var dx := scene_pos.x - lk.x
			var dz := scene_pos.z - lk.z
			want_pos = Vector3(lk.x + dx * c + dz * sn, scene_pos.y, lk.z - dx * sn + dz * c)
			want_look = lk
			pos_lambda = maxf(14.0, scene_lambda) if menu_live else scene_lambda
		else:
			_orbit += dt * 0.1
			var r := 6.2 if _narrow else 5.0
			var a := 0.5 + sin(_orbit) * 0.9 + menu_turn
			want_pos = Vector3(sin(a) * r, 1.75 + sin(_t * 0.2) * 0.25, cos(a) * r)
			want_look = Vector3(0, 1.05, 0)
			# a swipe moves the lens round the ring with the finger, not on a chord through the bot
			pos_lambda = 14.0 if menu_live else 1.5
		var scene := mode == "scene"
		if _snap_next:
			_pos = want_pos
			_look = want_look
			_fov = _base_fov * scene_fov if scene else _base_fov
			_shift = shift_x
		# a scene's camera moves are authored: follow them as tightly as they ask (100+: exactly)
		var exact := scene and scene_lambda >= 100.0
		var ll := scene_lambda * 1.6 if scene else look_lambda
		if exact:
			_pos = want_pos
			_look = want_look
		else:
			_pos = Vector3(_damp(_pos.x, want_pos.x, pos_lambda, dt), _damp(_pos.y, want_pos.y, pos_lambda, dt), _damp(_pos.z, want_pos.z, pos_lambda, dt))
			_look = Vector3(_damp(_look.x, want_look.x, ll, dt), _damp(_look.y, want_look.y, ll, dt), _damp(_look.z, want_look.z, ll, dt))
		var fov_to := _base_fov * scene_fov if scene else _base_fov
		_fov = fov_to if exact else _damp(_fov, fov_to, scene_lambda if scene else 3.0, dt)
		_roll = scene_roll if exact else _damp(_roll, scene_roll if scene else 0.0, 3.0, dt)
		lens_pos = _pos
		lens_look = _look
		lens_fov = _fov
		lens_roll = _roll

	_snap_next = false
	# trauma shake
	_trauma = maxf(0.0, _trauma - dt * 1.6)
	var sh := _trauma * _trauma
	var nt := _t * 28.0
	# jolt spring (semi-implicit, stable at any frame rate we run at)
	var jdt := minf(dt, 1.0 / 30.0)
	_jolt_vel = (_jolt_vel + _jolt_off * (-260.0 * jdt)) * exp(-15.0 * jdt)
	_jolt_off += _jolt_vel * jdt
	var p := Vector3(
		lens_pos.x + _noise.at(nt) * sh * 0.25 + _jolt_off.x,
		lens_pos.y + _noise.at(nt + 10.0) * sh * 0.2 + _jolt_off.y,
		lens_pos.z + _noise.at(nt + 20.0) * sh * 0.25 + _jolt_off.z)
	_shift = _damp(_shift, shift_x, 4.0, dt)
	_fov_kick = _damp(_fov_kick, 0.0, 5.0, dt)
	if camera == null:
		return
	# three's camera.lookAt(look) then rotateZ(roll)
	var fwd := lens_look - p
	var basis := camera.basis
	if fwd.length_squared() > 1e-10:
		var f := fwd.normalized()
		basis = Basis.looking_at(f, Vector3.BACK if absf(f.y) > 0.9999 else Vector3.UP)
	basis = basis * Basis(Vector3(0, 0, 1), lens_roll + _noise.at(nt + 30.0) * sh * 0.04)
	camera.transform = Transform3D(basis, p)
	# behind a bot's eyes, its own guard comes right up to the lens: clip what is nearer than a visor
	camera.fov = lens_fov - _fov_kick
	camera.near = clip[0] if clip.size() == 2 else 0.2 if pov >= 0 else 0.1
	camera.far = clip[1] if clip.size() == 2 else far
	# the picture slides sideways by shift_x of its width (three's setViewOffset, director.ts): an
	# off-centre frustum of the same lens (the garage frames the robot left of its panel)
	if absf(_shift) > 0.002:
		var h := 2.0 * camera.near * tan(deg_to_rad(camera.fov) * 0.5)
		camera.projection = Camera3D.PROJECTION_FRUSTUM
		camera.size = h
		camera.frustum_offset = Vector2(_shift * h * aspect, 0.0)
	elif camera.projection != Camera3D.PROJECTION_PERSPECTIVE:
		camera.projection = Camera3D.PROJECTION_PERSPECTIVE


# ------------------------------------------------------------------ fight

func _fight(dt: float, m) -> void:
	var pa = m.fighters[0].body.pos[J_PELVIS]
	var pb = m.fighters[1].body.pos[J_PELVIS]
	var sx: float = pb.x - pa.x
	var sz: float = pb.z - pa.z
	var sep := sqrt(sx * sx + sz * sz)
	if _fresh:
		# pick up from wherever the camera is, on the player's side
		_fresh = false
		_axis_ang = atan2(sz, sx) if sep > 0.05 else 0.0
		_center = Vector3((pa.x + pb.x) / 2.0, 1.0, (pa.z + pb.z) / 2.0)
		var rel := _pos - _center
		_yaw = atan2(rel.z, rel.x)
		_side = _home_side()
		_dist = maxf(2.0, rel.length())
		_el = asin(clampf(rel.y / _dist, -0.5, 0.95))
		_shot = make_shot("intro", _rng)
	# the fight line turns slowly so circling fighters don't whip the camera around
	if sep > 0.3:
		var d := _wrap(atan2(sz, sx) - _axis_ang)
		_axis_ang = _wrap(_axis_ang + clampf(d * (1.0 - exp(-2.5 * dt)), -2.0 * dt, 2.0 * dt))
		_raw_axis = atan2(sz, sx)
	_sep = sep
	if _ko_focus >= 0:
		var d := _wrap(_ko_base(m) - _ko_ang)
		_ko_ang = _wrap(_ko_ang + clampf(d * (1.0 - exp(-1.5 * dt)), -0.8 * dt, 0.8 * dt))
	_heat = maxf(0.0, _heat - dt * 0.35)
	_hold = maxf(0.0, _hold - dt)
	var held := _hold > 0.0
	_kick *= exp(-5.0 * dt)

	if _ko_snap:
		_ko_snap = false
		_ko_ang = _ko_base(m)
	var ph: String = m.phase
	var sh := _shot
	sh.t += dt
	# both bots shown and the booth still talking: cut around the arena until the countdown
	var fill: bool = ph == "intro" and m.phaseTime >= TEntrance.PRESENT * 2.0
	if fill:
		_fl_t += dt
		if not _beat.begins_with("f") or _fl_t >= _fl_dur:
			_next_filler()
	else:
		_fl_n = 0
	var beat := ""
	if fill:
		beat = "f%d" % _fl_n
	elif ph == "intro":
		beat = "p%d" % int(m.presenting)
	elif ph == "countdown":
		beat = "count"
	var cut := beat != _beat
	_beat = beat
	# a fresh bot's-eye shot is locked in: no knockdown, KO, finisher or final bell cuts it short
	var locked := sh.kind == "pov" and sh.t < POV_MIN
	if locked:
		pass
	elif fill:
		_filler_shot(cut)
	elif ph == "intro":
		_present_shot(m, cut)
	elif ph == "countdown":
		_intro_shot(dt, m, cut)
	elif ph == "greet":
		if sh.kind != "greet":
			_shot = make_shot("greet", _rng)
	elif ph == "ko":
		if sh.kind != "ko" and _ko_focus >= 0 and (not held or sh.kind == "pov"):
			_cut(m, "ko")
	elif ph == "end" and m.winner != null:
		if sh.kind != "win":
			_end_pov()
			_shot = make_shot("win", _rng)
			_shot.subject = int(m.winner.index)
	elif m.fin != null:
		# a finisher: one low, slow-turning hero shot from in front of the finisher, no cuts
		if sh.kind != "fin" and (not held or sh.kind == "pov"):
			_fin_by = int(m.fin.att.index)
			_cut(m, "fin")
	else:
		if sh.kind == "intro":
			# the intro crane settles into a wide establishing shot without a cut
			_shot = make_shot("wide", _rng)
			_shot.dur = 3.0 + _rng.next() * 2.0
		elif sh.kind == "greet":
			# the touch-gloves shot holds into the first exchange, then the director takes over
			sh.kind = "medium"
			sh.dur = sh.t + 1.2
		_direct(dt, m)
	if sh.kind != "pov":
		_pov_gap += dt
	if sh.kind != "crowd":
		_crowd_gap += dt
	if _shot.kind != "crowd":
		crowd_seat.w = 0.0
	if ph != "intro" and ph != "countdown":
		if _shot.kind == "pov":
			_pov_frame(dt, m)
		elif _shot.kind == "crowd":
			_crowd_frame(dt, m)
		else:
			_frame(dt, m)


static func _busy(f) -> bool:
	var s = f.strike
	return s != null and s.phase != "recovery"


## Decide when to cut, and to what.
func _direct(dt: float, m) -> void:
	var sh := _shot
	# knockdowns get their own low angle on the fighter hitting the canvas
	for f in m.fighters:
		var i := int(f.index)
		var down: bool = f.isDown
		if down and not _was_down[i] and f.state != "ko":
			_next_shot = "down"
			_cut_in = 0.22
			_down_index = i
		if not down and _was_down[i] and sh.kind == "down":
			sh.dur = minf(sh.dur, sh.t + 0.6)
		_was_down[i] = down
	# holding on a tear-off: any cut due waits, and lands the moment the hold ends
	if _hold > 0.0:
		if _cut_in >= 0.0:
			_cut_in = maxf(0.0, _cut_in - dt)
		return
	if _cut_in >= 0.0:
		_cut_in -= dt
		if _cut_in < 0.0:
			var k := _next_shot
			_cut(m, k)
			_next_shot = ""
			return
	if sh.kind == "crowd":
		if sh.t > sh.dur or m.fin != null:
			_cut(m)
		return
	if sh.kind == "pov":
		# past its locked-in first seconds, a bot's-eye shot cuts the moment it stops working, and
		# never outstays POV_MAX
		if _cut_in < 0.0 and (sh.t > minf(sh.dur, POV_MAX) or not _pov_ok(m, _pov_by)):
			_cut(m)
		return
	var lull := not _busy(m.fighters[0]) and not _busy(m.fighters[1])
	var over := sh.t > sh.dur
	var stuck := _cramped_for > 1.2 or _aligned_for > 1.0
	if (over and lull) or sh.t > sh.dur + 2.0 or (sh.t > 0.8 and stuck):
		_cut(m)


## The side of the fight line that puts the player's fighter on the left of the screen.
## Every shot built on the fight line keeps |az| < 90 degrees, so this side holds for the shot.
func _home_side() -> int:
	return -1 if player == 1 else 1


## Hard cut to a new setup, picking the best of a few candidates.
func _cut(m, kind: String = "") -> void:
	var was_pov := _shot.kind == "pov"
	_end_pov()
	if kind == "" and not was_pov and _pov_gap > POV_GAP and _rng.next() < POV_CHANCE and _start_pov(m):
		return
	if titan and _shot.kind == "crowd":
		_crowd_gap = 0.0
	elif titan and kind == "" and _crowd_gap > CROWD_GAP and _rng.next() < CROWD_CHANCE and m.phase == "fight":
		_start_crowd(m)
		return
	var prev_yaw := _yaw
	var prev_dist := _dist
	var prev_kind := _shot.kind
	var prev_side := _side
	var home := _home_side()
	var best: Shot = null
	var best_side := prev_side
	# a cut starts from where the fighters really are
	if _sep > 0.3:
		_axis_ang = _raw_axis
	var best_score := INF
	var tries := 4 if kind != "" else 7
	for i in tries:
		var k := kind
		if k == "":
			var hot := clampf(_heat / 1.5, 0.0, 1.0)
			var sum := 0.0
			for wt in WEIGHTS:
				if wt[0] != prev_kind:
					sum += wt[1] + (wt[2] - wt[1]) * hot
			var x := _rng.next() * sum
			k = "medium"
			for wt in WEIGHTS:
				if wt[0] == prev_kind:
					continue
				x -= wt[1] + (wt[2] - wt[1]) * hot
				if x <= 0.0:
					k = wt[0]
					break
		var s := _special(make_shot(k, _rng))
		if titan:
			_titanize(s)
		# stay on the player's side of the line; every third candidate tries the reverse angle,
		# which only wins when the home side is badly cramped
		var side := -home if i % 3 == 2 else home
		_side = side
		if _narrow and (k == "medium" or k == "low" or k == "orbit"):
			s.az += (-1.0 if _rng.next() < 0.5 else 1.0) * 0.45
		_yaw = _shot_yaw(s)
		_el = s.el
		_measure(m, s)
		var score := 0.0
		# one fighter hiding the other
		var along := absf(cos(_yaw - _raw_axis))
		if k == "ko":
			# the winner should not stand between the lens and the fallen fighter
			var l = m.fighters[s.subject].body.pos[J_PELVIS]
			var w = m.fighters[1 - s.subject].body.pos[J_PELVIS]
			var off := absf(_wrap(_yaw - atan2(w.z - l.z, w.x - l.x)))
			var lx: float = w.x - l.x
			var lz: float = w.z - l.z
			if sqrt(lx * lx + lz * lz) > 0.3 and off < 0.6:
				score += (0.6 - off) * 6.0
		elif _sep > 0.6:
			score += maxf(0.0, along - (0.85 if k == "ots" else 0.7)) * 8.0
		score += maxf(0.0, _fit_norm / maxf(0.1, _fit_cap) - 1.0) * 3.0 # would have to crush the lens
		if side != home:
			score += 2.5
		# avoid jump cuts: the new angle should look clearly different
		var turn := absf(_wrap(_yaw - prev_yaw))
		if turn < 0.45 and absf(minf(_fit_dist, _fit_cap) / prev_dist - 1.0) < 0.3:
			score += 1.5
		score += _rng.next() * 0.4
		if score < best_score:
			best_score = score
			best = s
			best_side = side
	_side = best_side
	_shot = best
	cuts += 1
	# snap everything to the new setup
	_yaw = _shot_yaw(_shot)
	_el = _shot.el
	_roll = _shot.roll
	_measure(m, _shot)
	_center = _raw_center
	_dist = minf(_fit_dist, _fit_cap)
	_fov = _lens_fov(_dist)
	_kick = Vector3.ZERO
	_cramped_for = 0.0
	_aligned_for = 0.0
	_cut_in = -1.0


## Event shots: knockdown, finisher and KO.
func _special(s: Shot) -> Shot:
	var r := _rng
	if s.kind == "down":
		var i := _down_index
		var toward := (1.0 if i == 0 else -1.0) * (1.0 if r.next() < 0.65 else -1.0)
		s.dur = 3.2
		s.az = toward * (0.25 + r.next() * 0.35)
		s.el = -0.02 + r.next() * 0.06
		s.fov_k = 1.2
		s.fill = 0.82
		s.roll = (-1.0 if r.next() < 0.5 else 1.0) * 0.06
		s.wobble = 0.02
		s.subject = i
		s.bias = 0.35
	elif s.kind == "fin":
		var i := _fin_by
		# in front of the finisher, past the victim's shoulder, low and close
		var sg := -1.0 if i == 0 else 1.0
		s.dur = 99.0
		s.az = sg * (0.42 + r.next() * 0.2)
		s.orbit = sg * 0.06
		s.el = 0.02 + r.next() * 0.05
		s.fov_k = 1.18
		s.fill = 0.8
		s.roll = (-1.0 if r.next() < 0.5 else 1.0) * 0.045
		s.wobble = 0.012
		s.subject = i
		s.bias = 0.18
	elif s.kind == "ko":
		var i := maxi(0, _ko_focus)
		# swing to the side that leaves the player on the left: past the winner when they won,
		# with the fallen player on the left when they lost
		var sg := 1.0 if 1 - i == player else -1.0
		s.dur = 99.0
		s.az = sg * (0.45 + r.next() * 0.3)
		s.orbit = sg * 0.06
		s.el = 0.02
		s.fov_k = 1.1
		s.fill = 0.62
		s.roll = 0.05
		s.wobble = 0.01
		s.subject = i
		s.bias = 0.65
	return s


## Whether fighter i can look at the other for a bot's-eye shot right now.
func _pov_ok(m, i: int) -> bool:
	if i < 0 or m.phase != "fight" or m.fin != null:
		return false
	var me = m.fighters[i]
	var opp = m.fighters[1 - i]
	if me.isDown or opp.isDown or JS.truthy(me.parts.off[0]):
		return false
	return _sep > POV_SEP[0] * me.size_ and _sep < POV_SEP[1]


## Hard cut into one fighter's head: the lens looks out of its eyes at the opponent. Favours the
## player's own bot. Returns false when neither fighter can carry the shot.
func _start_pov(m) -> bool:
	var first := player if _rng.next() < 0.6 else 1 - player
	var by := first if _pov_ok(m, first) else (1 - first if _pov_ok(m, 1 - first) else -1)
	if by < 0:
		return false
	var s := make_shot("pov", _rng)
	s.dur = POV_MIN + 0.5 + _rng.next() * (POV_MAX - POV_MIN - 0.5)
	s.subject = 1 - by
	s.wobble = 0.0
	_shot = s
	_pov_by = by
	cuts += 1
	_cut_in = -1.0
	_next_shot = ""
	_kick = Vector3.ZERO
	_cramped_for = 0.0
	_aligned_for = 0.0
	_pov_eye = _eye_target(m, by)
	_pov_look = _gaze_target(m, by)
	_pov_roll = 0.0
	_fov = _pov_fov()
	_pov_frame(0.0, m)
	return true


func _end_pov() -> void:
	if _shot.kind != "pov":
		return
	_pov_by = -1
	_pov_gap = 0.0


func _pov_fov() -> float:
	return minf(78.0, _base_fov * 1.45)


## Just in front of the fighter's face, at eye height.
func _eye_target(m, i: int) -> Vector3:
	var f = m.fighters[i]
	var h = f.body.pos[J_HEAD]
	var o = m.fighters[1 - i].body.pos[J_HEAD]
	var dx: float = o.x - h.x
	var dz: float = o.z - h.z
	var l := sqrt(dx * dx + dz * dz)
	if l == 0.0:
		l = 1.0
	var k: float = 0.07 * f.size_
	return Vector3(h.x + (dx / l) * k, h.y + 0.04 * f.size_, h.z + (dz / l) * k)


## The opponent's upper body, a little below the eyes, so the fists and shoulders read.
func _gaze_target(m, i: int) -> Vector3:
	var o = m.fighters[1 - i]
	return _jp(o, J_CHEST).lerp(_jp(o, J_HEAD), 0.45)


## The bot's-eye lens: rides the head with the bob smoothed out, eyes locked on the opponent.
func _pov_frame(dt: float, m) -> void:
	var i := _pov_by
	# smoothed so a stride or a flinch drifts the view instead of jolting it (height most of all)
	var e := _eye_target(m, i)
	var ox := _pov_eye.x
	var oz := _pov_eye.z
	_pov_eye = Vector3(_damp(_pov_eye.x, e.x, 14.0, dt), _damp(_pov_eye.y, e.y, 6.0, dt), _damp(_pov_eye.z, e.z, 14.0, dt))
	var g := _gaze_target(m, i)
	_pov_look = Vector3(_damp(_pov_look.x, g.x, 6.0, dt), _damp(_pov_look.y, g.y, 3.5, dt), _damp(_pov_look.z, g.z, 6.0, dt))
	# a little bank into sideways footwork, like a head keeping its balance
	var dx := _pov_look.x - _pov_eye.x
	var dz := _pov_look.z - _pov_eye.z
	var l := sqrt(dx * dx + dz * dz)
	if l == 0.0:
		l = 1.0
	var lat := ((_pov_eye.x - ox) * dz - (_pov_eye.z - oz) * dx) / (l * dt) if dt > 0.0 else 0.0
	_pov_roll = _damp(_pov_roll, clampf(-lat * 0.03, -0.05, 0.05), 3.0, dt)
	_pos = _pov_eye
	_look = _pov_look + _kick * 0.5
	_roll = _pov_roll
	_fov = _damp(_fov, _pov_fov(), 4.0, dt)
	# keep the polar state on this side of the fighters, so the next cut judges its jump from here
	var p0 = m.fighters[0].body.pos[J_PELVIS]
	var p1 = m.fighters[1].body.pos[J_PELVIS]
	_center = Vector3((p0.x + p1.x) / 2.0, 1.0, (p0.z + p1.z) / 2.0)
	_yaw = atan2(_pos.z - _center.z, _pos.x - _center.x)
	var cx := _pos.x - _center.x
	var cz := _pos.z - _center.z
	_dist = maxf(0.5, sqrt(cx * cx + cz * cz))


## A titan fight's shots: longer lenses from further off and lower down, looking up at them (a
## giant seen by a cameraman on the ground, with the stadium stacked up behind it).
func _titanize(s: Shot) -> void:
	s.fov_k *= 0.85
	match s.kind:
		"wide":
			s.el *= 0.7
		"medium":
			s.el = s.el * 0.5 - 0.04
		"low":
			s.el -= 0.06
		"orbit", "ots":
			s.el *= 0.6


## Hard cut to a fan's view of the fight: a seat in the lower tier on the player's side of the
## fight line, the fans round them up on their feet, the titans out on the deck past their heads.
func _start_crowd(m) -> void:
	var s := make_shot("crowd", _rng)
	s.dur = 3.2 + _rng.next() * 1.8
	s.wobble = 0.0
	var home := _home_side()
	_side = home
	if _sep > 0.3:
		_axis_ang = _raw_axis
	var a := _wrap(_axis_ang + home * (PI / 2.0 + (_rng.next() - 0.5) * 0.9))
	# not in front of the titans' gates (on the x axis)
	if absf(sin(a)) < 0.2:
		a = _wrap(a + (0.24 if sin(a) >= 0.0 else -0.24) * (1.0 if cos(a) >= 0.0 else -1.0))
	var row := floorf(6.0 + _rng.next() * 30.0)
	var r: float = CROWD_TIER[0] + (row + 0.3) * CROWD_TIER[1]
	var y: float = CROWD_TIER[2] + row * CROWD_TIER[3] + CROWD_EYE
	_crowd_eye = Vector3(cos(a) * r, y, sin(a) * r)
	_shot = s
	cuts += 1
	_cut_in = -1.0
	_next_shot = ""
	_kick = Vector3.ZERO
	_cramped_for = 0.0
	_aligned_for = 0.0
	_crowd_look = _crowd_target(m)
	_roll = (_rng.next() - 0.5) * 0.06
	_crowd_frame(0.0, m)


## Where the fan's lens points: just over the titans, tilted down past them so the heads and arms
## of the rows in front come into the bottom of the picture.
func _crowd_target(m) -> Vector3:
	var c := (_jp(m.fighters[0], J_CHEST) + _jp(m.fighters[1], J_CHEST)) * 0.5
	var to := c - _crowd_eye
	var flat := Vector2(to.x, to.z).length()
	var pitch := atan2(to.y, flat) - 0.15
	return _crowd_eye + Vector3(to.x / flat * cos(pitch), sin(pitch), to.z / flat * cos(pitch)) * to.length()


## The fan's view: a phone held up in the stands, following the titans, a little unsteady.
func _crowd_frame(dt: float, m) -> void:
	var g := _crowd_target(m)
	_crowd_look = Vector3(_damp(_crowd_look.x, g.x, 3.0, dt), _damp(_crowd_look.y, g.y, 2.0, dt), _damp(_crowd_look.z, g.z, 3.0, dt))
	var shake := 0.012 + 0.02 * clampf(_heat, 0.0, 1.0)
	_pos = _crowd_eye + Vector3(_noise.at(_ft * 0.9 + 51.0), _noise.at(_ft * 1.1 + 57.0) * 0.6, _noise.at(_ft * 0.9 + 63.0)) * shake * 0.3
	_look = _crowd_look + Vector3(_noise.at(_ft * 0.7 + 71.0), _noise.at(_ft * 0.8 + 77.0), _noise.at(_ft * 0.7 + 83.0)) * shake + _kick * 0.3
	_fov = 46.0 * ZOOM[zoom].fov
	_roll = _damp(_roll, _noise.at(_ft * 0.3 + 91.0) * 0.03, 2.0, dt)
	crowd_seat = Vector4(_crowd_eye.x, _crowd_eye.z, 1.4, minf(1.0, 0.6 + _heat * 0.4))
	# keep the polar state on this side of the fighters, so the next cut judges its jump from here
	var p0 = m.fighters[0].body.pos[J_PELVIS]
	var p1 = m.fighters[1].body.pos[J_PELVIS]
	_center = Vector3((p0.x + p1.x) / 2.0, 1.0, (p0.z + p1.z) / 2.0)
	_yaw = atan2(_pos.z - _center.z, _pos.x - _center.x)
	_dist = Vector2(_pos.x - _center.x, _pos.z - _center.z).length()


func _shot_yaw(s: Shot) -> float:
	# KO: look past the fallen fighter toward the winner standing over them
	if s.kind == "ko":
		return _wrap(_ko_ang + s.az)
	return _wrap(_axis_ang + _side * (PI / 2.0 + s.az))


## Where the camera should sit for this step of the current shot.
func _frame(dt: float, m) -> void:
	var s := _shot
	var yaw_rate := 1.1
	var want_yaw: float
	var want_el := s.el
	if s.kind == "win" and m.winner != null:
		# swing round (never through) to the winner's front
		var wy: float = m.winner.yaw
		want_yaw = atan2(cos(wy), sin(wy)) + 0.35
		want_el = 0.12
		yaw_rate = 0.7
	else:
		s.az += s.orbit * dt
		# orbits turn back before the fighters line up behind each other
		if s.kind == "orbit" and absf(s.az) > 0.85 and s.az * s.orbit > 0.0:
			s.orbit = -s.orbit
		if (s.kind == "ko" or s.kind == "fin") and absf(s.az) > 1.0 and s.az * s.orbit > 0.0:
			s.orbit = -s.orbit
		if s.kind == "ko":
			want_el = 0.02 + minf(0.26, s.t * 0.06)
		want_yaw = _shot_yaw(s) + _noise.at(_ft * 0.07 + 40.0) * 0.1
		# keep off the fight line so neither fighter hides behind the other
		if _sep > 0.6 and s.kind != "ko":
			var mn := 0.42 if s.kind == "ots" else 0.62
			var q := _wrap(want_yaw - _raw_axis)
			var aq := absf(q)
			if aq < mn or aq > PI - mn:
				want_yaw = _raw_axis + (signf(q) if q != 0.0 else 1.0) * (mn if aq < PI / 2.0 else PI - mn)
		# backed up against the stands: crane up instead of squeezing the lens
		if _fit_norm > _fit_cap * 1.15 and not s.high and s.kind != "ko":
			want_el = maxf(want_el, 0.34)
	var dy := _wrap(want_yaw - _yaw)
	_yaw = _wrap(_yaw + clampf(dy * (1.0 - exp(-2.2 * dt)), -yaw_rate * dt, yaw_rate * dt))
	_el = _damp(_el, want_el, 2.0, dt)
	# a camera left far behind the action is better off cutting
	if absf(dy) > 1.4 and s.kind != "win" and s.kind != "ko" and _cut_in < 0.0:
		_cut_in = 0.0

	_measure(m, s)
	_center.x = _damp(_center.x, _raw_center.x, 3.5, dt)
	_center.z = _damp(_center.z, _raw_center.z, 3.5, dt)
	_center.y = _damp(_center.y, _raw_center.y, 2.5, dt)
	var want := minf(_fit_dist, _fit_cap)
	# pull out quickly to keep everyone in shot, push in gently
	_dist = _damp(_dist, want, 4.0 if want > _dist else 1.1, dt)
	_dist = minf(_dist, _fit_cap)
	var lens := _lens_fov(_dist)
	_fov = _damp(_fov, lens, 9.0 if lens > _fov else 2.0, dt)
	_roll = _damp(_roll, s.roll, 2.0, dt)
	_cramped_for = _cramped_for + dt if _fit_norm > _fit_cap * 1.35 else 0.0

	var ce := cos(_el)
	_dir = Vector3(cos(_yaw) * ce, sin(_el), sin(_yaw) * ce)
	_pos = _center + _dir * _dist
	if titan:
		# a titan is filmed from the ground: down on the plain beyond the deck, on the deck's turf
		_pos.y = maxf(0.25 if Vector2(_pos.x, _pos.z).length() < 5.6 else -0.42, _pos.y)
	else:
		_pos.y = maxf(0.35, _pos.y)
	var wob := s.wobble
	_look = Vector3(
		_center.x + _kick.x + _noise.at(_ft * 0.6 + 3.0) * wob,
		_center.y + _kick.y * 0.5 + _noise.at(_ft * 0.5 + 9.0) * wob,
		_center.z + _kick.z + _noise.at(_ft * 0.6 + 17.0) * wob)
	# looking straight down the fight line, one fighter hides the other
	var along := absf(cos(_yaw - _raw_axis))
	var aligned := _sep > 0.6 and s.kind != "ko" and s.kind != "win" and along > (0.92 if s.kind == "ots" else 0.82)
	_aligned_for = _aligned_for + dt if aligned else 0.0


## Presenting a fighter: a low hero angle in front of it, pushing in and swinging slowly round
## to face it, with the fighter set to one side of the frame so its card has the other. Each
## presentation opens on a hard cut.
func _present_shot(m, cut: bool) -> void:
	var who := int(m.presenting)
	var u := TMath.smoothstep_(0.0, TEntrance.PRESENT, m.phaseTime - who * TEntrance.PRESENT)
	# framed on the hatch, not the robot: an entrance that spins, struts or shuffles about plays
	# out inside a steady shot instead of dragging the camera round with it
	var hxz: Array = TEntrance.hatchXZ(float(who))
	var oxz: Array = TEntrance.hatchXZ(float(1 - who))
	var hx: float = hxz[0]
	var hz: float = hxz[1]
	_center = Vector3(hx, 1.12, hz)
	# in front of it, looking back from the other corner, swinging round from the card's side
	var sw := -1.0 if who == 0 else 1.0
	_yaw = atan2(oxz[1] - hz, oxz[0] - hx) + sw * (0.8 - u * 0.45)
	_el = -0.05 + u * 0.1
	_dist = (3.1 - u * 0.75) * ZOOM[zoom].dist
	_fov = _base_fov * ZOOM[zoom].fov * 0.9
	_roll = sw * 0.03 * (1.0 - u)
	var ce := cos(_el)
	var dx := cos(_yaw) * ce
	var dz := sin(_yaw) * ce
	_pos = Vector3(_center.x + dx * _dist, _center.y + sin(_el) * _dist, _center.z + dz * _dist)
	# aim off to the card's side, which puts the fighter on the other side of the frame
	var off := 0.34 * _dist * tan((_fov * PI) / 360.0) * aspect
	_look = Vector3(_center.x + dz * off * sw, _center.y, _center.z - dx * off * sw)
	# it opens looking down into the corner's hatch, and tilts up with the lift
	_look.y -= 0.45 * (1.0 - TEntrance.liftUp(TEntrance.entryTime(m.phase, m.phaseTime, float(who)))) * TEntrance.LIFT_DEPTH
	if cut:
		cuts += 1


func _next_filler() -> void:
	var kind := int(_rng.next() * 4.0)
	if _fl_n != 0 and kind == _fl_kind:
		kind = (kind + 1) % 4
	_fl_n += 1
	_fl_kind = kind
	_fl_t = 0.0
	_fl_dur = 2.6 + _rng.next() * 1.4
	_fl_a = _rng.next() * PI * 2.0
	_fl_dir = -1.0 if _rng.next() < 0.5 else 1.0


## A point on the bowl at angle a, pushed out by d from the front row.
static func _bowl(a: float, d: float, y: float) -> Vector3:
	return Vector3(cos(a) * (AX + d), y, sin(a) * (AZ + d))


## Waiting on the booth after the presentations: the house itself. A slow pan along the stands
## from ringside, a high orbit over the bowl, the ring from the upper tier, or a low dolly across
## the canvas to the far seats.
func _filler_shot(cut: bool) -> void:
	var u := _fl_t / _fl_dur
	var base: float = _base_fov * ZOOM[zoom].fov
	_roll = 0.0
	if _fl_kind == 0:
		# ringside, panning along the faces in the lower tier
		var a := _fl_a + _fl_dir * (u - 0.5) * 0.35
		_pos = Vector3(cos(_fl_a + PI) * 8.0, 1.5, sin(_fl_a + PI) * 6.5)
		_look = _bowl(a, 4.0, 2.4)
		_fov = base * 0.7
	elif _fl_kind == 1:
		# high over the bowl, orbiting slowly round the ring
		var a := _fl_a + _fl_dir * u * 0.3
		_pos = Vector3(cos(a) * 22.0, 14.0, sin(a) * 18.0)
		_look = Vector3(0, 0.6, 0)
		_fov = base * 1.1
	elif _fl_kind == 2:
		# from the front of the upper tier, down onto the ring, drifting sideways
		_pos = _bowl(_fl_a + _fl_dir * u * 0.12, SUITE_D - 2.0, UPPER_Y + 1.2)
		_look = Vector3(0, 0.8, 0)
		_fov = base * 0.85
	else:
		# low on the floor, dollying across the canvas towards the far seats
		var a := _fl_a + _fl_dir * (u - 0.5) * 0.25
		_pos = _bowl(a, -2.5, 0.4)
		_look = _bowl(_fl_a + PI, 6.0, 3.2)
		_fov = base
	if cut:
		cuts += 1


## The countdown: a high crane that sweeps down to ring level over both fighters.
func _intro_shot(dt: float, m, cut: bool) -> void:
	var k := TMath.smoothstep_(0.0, TMatch.COUNTDOWN, m.phaseTime)
	var pa = m.fighters[0].body.pos[J_PELVIS]
	var pb = m.fighters[1].body.pos[J_PELVIS]
	_center = Vector3((pa.x + pb.x) / 2.0, 1.05, (pa.z + pb.z) / 2.0)
	# the fighters wait in opposite corners: wide enough for both
	var r: float = (11.5 - k * 3.3) * ZOOM[zoom].dist
	var h := 5.5 - k * 3.2
	var want_yaw := _axis_ang + _side * (PI / 2.0 + 1.6 - k * 1.5)
	# the countdown opens on a cut from the presentations, then sweeps
	var e := 1.0 if cut else 1.0 - exp(-6.0 * dt)
	_yaw = _wrap(_yaw + _wrap(want_yaw - _yaw) * e)
	_el += (atan2(h - 1.05, r) - _el) * e
	_dist += (sqrt(r * r + (h - 1.05) * (h - 1.05)) - _dist) * e
	var fov_to: float = _base_fov * ZOOM[zoom].fov
	_fov = fov_to if cut else _damp(_fov, fov_to, 3.0, dt)
	_roll = 0.0 if cut else _damp(_roll, 0.0, 3.0, dt)
	if cut:
		cuts += 1
	var ce := cos(_el)
	_pos = Vector3(_center.x + cos(_yaw) * ce * _dist, _center.y + sin(_el) * _dist, _center.z + sin(_yaw) * ce * _dist)
	_look = _center


## Field of view that keeps the framed points in shot from distance d (never narrower than the shot's lens).
func _lens_fov(d: float) -> float:
	var s := _shot
	var base: float = _base_fov * s.fov_k * ZOOM[zoom].fov
	var max_fov := minf(80.0, _base_fov * 1.7)
	var need := 0.0
	for i in _npts:
		var mm := _room[i] * s.fill
		if not is_finite(mm):
			continue
		var rel := _pts[i] - _center
		var z := maxf(0.3, d - rel.dot(_dir))
		need = maxf(need, maxf(absf(rel.dot(_up)) / (mm * z), absf(rel.dot(_right)) / (mm * z * aspect)))
	var fov := (2.0 * atan(need) * 180.0) / PI
	return clampf(maxf(base, fov), 10.0, max_fov)


## Gathers the points to frame for shot s, the centre to aim at, and the distance that fits them
## with the shot's lens (plus how far the arena lets the lens go).
func _measure(m, s: Shot) -> void:
	var n := 0
	var min_y := INF
	var max_y := -INF
	var only := s.subject if s.kind == "win" else -1
	for f in m.fighters:
		var fi := int(f.index)
		if only >= 0 and fi != only:
			continue
		# in an over-the-shoulder shot the near fighter is foreground: only head and chest are framed
		var fore := s.kind == "ots" and fi != s.subject
		var loose := s.kind == "ko" and fi != s.subject
		var pos: Array = f.body.pos
		for k in 9:
			var j: int = FRAME_JOINTS[k]
			var q = pos[j]
			var p := Vector3(q.x, q.y, q.z)
			if j == J_HEAD:
				p.y += 0.24
			if j == J_FOOT_L or j == J_FOOT_R:
				p.y = maxf(0.0, p.y - 0.08)
			var room: float = JOINT_ROOM[k]
			if fore:
				room = 1.02 if (j == J_HEAD or j == J_CHEST or j == J_PELVIS) else INF
			if loose:
				room = 1.12 if (j == J_HEAD or j == J_CHEST) else INF
			_pts[n] = p
			_room[n] = room
			if is_finite(room):
				min_y = minf(min_y, p.y)
				max_y = maxf(max_y, p.y)
			n += 1
	_npts = n
	# centre: between the pelvises (leaning to the subject), vertically mid-frame
	var c: Vector3
	if only >= 0:
		c = _jp(m.fighters[only], J_PELVIS)
	else:
		c = (_jp(m.fighters[0], J_PELVIS) + _jp(m.fighters[1], J_PELVIS)) * 0.5
	if s.subject >= 0 and s.bias > 0.0:
		c = c.lerp(_jp(m.fighters[s.subject], J_PELVIS), s.bias)
	c.y = (min_y + max_y) / 2.0
	if s.kind == "ko":
		c.y = minf(c.y, 0.75)
	_raw_center = c

	var ce := cos(_el)
	var d := Vector3(cos(_yaw) * ce, sin(_el), sin(_yaw) * ce)
	_dir = d
	var right := Vector3(-d.z, 0.0, d.x).normalized()
	_right = right
	var up := -d.cross(right)
	if up.y < 0.0:
		up = -up
	_up = up
	var z: Dictionary = ZOOM[zoom]
	var tan_v := tan((_base_fov * s.fov_k * z.fov * PI) / 360.0)
	var tan_h := tan_v * aspect
	# the framing distance scales with zoom; the clearance from the nearest bot never does
	var fit := 2.8 if s.kind == "ko" else 2.2
	var safe := 0.0
	for i in n:
		var rel := _pts[i] - c
		var depth := rel.dot(d)
		safe = maxf(safe, depth + (1.6 if s.kind == "ko" else 0.9))
		var mm := _room[i] * s.fill
		if not is_finite(mm):
			continue
		fit = maxf(fit, maxf(depth + absf(rel.dot(right)) / (tan_h * mm), depth + absf(rel.dot(up)) / (tan_v * mm)))
	var dist: float = maxf(safe, fit * z.dist)
	# how far back the arena lets us go along this direction (the ring itself is no limit)
	var cap := _reach(c.x, c.z, cos(_yaw), sin(_yaw), TITAN_FREE_R if titan else FREE_R) / maxf(0.2, ce)
	_fit_dist = dist
	_fit_norm = maxf(safe, fit)
	_fit_cap = maxf(1.2 if s.kind == "ko" else 1.6, cap)
