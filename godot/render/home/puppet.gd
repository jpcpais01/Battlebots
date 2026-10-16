## A puppet rig for the home screen scenes (src/render/home/puppet.ts): poses a robot that isn't
## fighting (lying on a sun lounger, sitting up, pushing a door) from authored key poses, where the
## fighting rig only knows how to stand on a canvas.
##
## A pose is the pelvis (in the robot's own frame: x to its right, y up, z ahead), three turns
## (hips, spine over the hips, head over the chest), and where each fist and foot goes. Fists can
## be placed in the chest's frame, the head's (a phone at the ear) or the robot's (a hand on the
## armrest). Elbows and knees bend towards poles. Limbs are solved with two-bone IK at the robot's
## real bone lengths, so the model drawn from the joints never stretches.
##
## Poses are evaluated into flat channel arrays (PackedFloat32Array, as the web's Float32Array),
## so blending two of them, or keying a clip, is a plain per-channel mix. A pose definition is a
## Dictionary shaped like puppet.ts PoseDef: {pelvis, hips?, spine?, head?, hands: [L, R],
## feet: [L, R]}, vectors as 3-element arrays; a hand {at, in?: "chest"|"head"|"root", abs?, pole?,
## roll?}, a foot {at, pole?, air?, flex?, yaw?, heel?, abs?}.
class_name HomePuppet
extends RefCounted

# channel layout of an evaluated pose (puppet.ts C)
const PELVIS := 0
const HIPS := 3
const SPINE := 6
const HEAD := 9
const HAND := 12
const ELBOW := 18
const FOOT := 24
const KNEE := 30
const ROLL := 36
const AIR := 38
const FLEX := 40
const FYAW := 42
const HEEL := 44
const N := 46

# rest-pose offsets of a standard-size robot (src/sim/fighter computeLocalPose)
const SPINE_OFF := Vector3(0, 0.418, 0.042)
const NECK_OFF := Vector3(0, 0.219, 0.022)
const HEAD_OFF := Vector3(0, 0.21, 0.007)
const SHOULDER := Vector3(0.288, 0.099, 0.01)
const HIP := Vector3(0.144, -0.07, 0)
const UPPER := 0.33
const FORE := 0.33
const THIGH := 0.46
const SHIN := 0.46

# joints (sim/body.ts J)
enum { J_PELVIS, J_CHEST, J_NECK, J_HEAD, J_SH_L, J_EL_L, J_HAND_L, J_SH_R, J_EL_R, J_HAND_R, J_HIP_L, J_KNEE_L, J_FOOT_L, J_HIP_R, J_KNEE_R, J_FOOT_R }

var root := Vector3.ZERO
var yaw := 0.0
var size := 1.0
## World joints (J order).
var joints: Array[Vector3] = []
var hand_roll := [0.0, 0.0]
var foot_yaw := [0.0, 0.0]
var foot_heel := [0.0, 0.0]
var foot_air := [0.0, 0.0]
var foot_flex := [0.0, 0.0]
## Where the head looks (world).
var gaze := Vector3.ZERO
## World yaw the hips face.
var face := 0.0
var _l: Array[Vector3] = []


func _init() -> void:
	joints.resize(16)
	_l.resize(16)
	for i in 16:
		joints[i] = Vector3.ZERO
		_l[i] = Vector3.ZERO


## Rotation from [pitch, yaw, roll]: yaw about y, then pitch about x, then roll about z (puppet.ts euler).
static func euler(p: float, y: float, r: float) -> Basis:
	return Basis(Vector3.UP, y) * Basis(Vector3.RIGHT, p) * Basis(Vector3.BACK, r)


static func _v(a) -> Vector3:
	return Vector3(a[0], a[1], a[2])


static func _get3(o: PackedFloat32Array, i: int) -> Vector3:
	return Vector3(o[i], o[i + 1], o[i + 2])


static func _put3(o: PackedFloat32Array, i: int, v: Vector3) -> void:
	o[i] = v.x
	o[i + 1] = v.y
	o[i + 2] = v.z


## Two-bone IK (puppet.ts ik): from root towards target, bending towards pole. Returns [mid, end].
static func ik(r: Vector3, target: Vector3, pole: Vector3, la: float, lb: float) -> Array:
	var d := target - r
	var dist := d.length()
	if dist < 1e-6:
		d = Vector3(0, -1, 0)
	else:
		d /= dist
	dist = minf(maxf(dist, absf(la - lb) + 1e-4), la + lb - 1e-4)
	var cos_a := (la * la + dist * dist - lb * lb) / (2.0 * la * dist)
	var sin_a := sqrt(maxf(0.0, 1.0 - cos_a * cos_a))
	var p := pole - d * pole.dot(d)
	if p.length_squared() < 1e-8:
		p = Vector3(0, 0, 1) - d * d.z
	p = p.normalized()
	return [r + d * (la * cos_a) + p * (la * sin_a), r + d * dist]


## Evaluate a pose definition into channels, fists and poles resolved into the robot's frame (puppet.ts pose).
static func pose(d: Dictionary) -> PackedFloat32Array:
	var o := PackedFloat32Array()
	o.resize(N)
	var zero := [0, 0, 0]
	_put3(o, PELVIS, _v(d.pelvis))
	_put3(o, HIPS, _v(d.get("hips", zero)))
	_put3(o, SPINE, _v(d.get("spine", zero)))
	_put3(o, HEAD, _v(d.get("head", zero)))
	var pel := _get3(o, PELVIS)
	var rh := euler(o[HIPS], o[HIPS + 1], o[HIPS + 2])
	var rc := rh * euler(o[SPINE], o[SPINE + 1], o[SPINE + 2])
	var rd := rc * euler(o[HEAD], o[HEAD + 1], o[HEAD + 2])
	var chest := pel + rc * SPINE_OFF
	var neck := chest + rc * NECK_OFF
	var head := neck + rd * HEAD_OFF
	for s in 2:
		var sx := -1.0 if s == 0 else 1.0
		var h: Dictionary = d.hands[s]
		var at := _v(h.at)
		if not h.get("abs", false):
			at.x *= sx
		var where: String = h.get("in", "chest")
		var a: Vector3
		if where == "root":
			a = at
		elif where == "head":
			a = head + rd * at
		else:
			a = chest + rc * at
		_put3(o, HAND + s * 3, a)
		var pl := _v(h.get("pole", [0.5, -1, -0.3]))
		_put3(o, ELBOW + s * 3, (rc * Vector3(pl.x * sx, pl.y, pl.z)).normalized())
		o[ROLL + s] = float(h.get("roll", 0.0))
		var f: Dictionary = d.feet[s]
		var fa := _v(f.at)
		var fabs: bool = f.get("abs", false)
		_put3(o, FOOT + s * 3, Vector3(fa.x if fabs else fa.x * sx, fa.y, fa.z))
		var kp: Vector3
		if f.has("pole"):
			var fp := _v(f.pole)
			kp = Vector3(fp.x if fabs else fp.x * sx, fp.y, fp.z)
		else:
			kp = rh * Vector3(0.12 * sx, 0, 1)
		_put3(o, KNEE + s * 3, kp.normalized())
		o[AIR + s] = float(f.get("air", 0.0))
		o[FLEX + s] = float(f.get("flex", 0.0))
		o[FYAW + s] = float(f.get("yaw", 0.12)) * sx
		o[HEEL + s] = float(f.get("heel", 0.0))
	return o


## o = a + (b - a) * u, channel by channel (puppet.ts mixPose).
static func mix_pose(o: PackedFloat32Array, a: PackedFloat32Array, b: PackedFloat32Array, u: float) -> PackedFloat32Array:
	for i in N:
		o[i] = a[i] + (b[i] - a[i]) * u
	return o


## Sample a clip of keys [time, pose, ease?] at time t (puppet.ts sample). The motion into each key
## eases by its Callable, or minimum jerk.
static func sample(o: PackedFloat32Array, keys: Array, t: float) -> PackedFloat32Array:
	if t <= keys[0][0]:
		return _copy(o, keys[0][1])
	for i in keys.size() - 1:
		var b: Array = keys[i + 1]
		if t < b[0]:
			var a: Array = keys[i]
			var u: float = (t - a[0]) / (b[0] - a[0])
			var e: float = (b[2] as Callable).call(u) if b.size() > 2 else TMath.minJerk(u)
			return mix_pose(o, a[1], b[1], e)
	return _copy(o, keys[keys.size() - 1][1])


static func _copy(o: PackedFloat32Array, src: PackedFloat32Array) -> PackedFloat32Array:
	for i in N:
		o[i] = src[i]
	return o


## Robot-frame point to world (Fighter.toWorld's frames: local x mirrored).
func to_world(l: Vector3) -> Vector3:
	var s := sin(yaw)
	var c := cos(yaw)
	var x := l.x * size
	var y := l.y * size
	var z := l.z * size
	return Vector3(root.x - c * x + s * z, root.y + y, root.z + s * x + c * z)


## Solve a pose into the 16 joints of a robot standing at `root` facing `yaw`, plus the per-limb
## details the model reads (foot yaw, heel, airborne hinge, fist roll) and a gaze point.
func solve(o: PackedFloat32Array) -> HomePuppet:
	var L := _l
	var pel := _get3(o, PELVIS)
	L[J_PELVIS] = pel
	var rh := euler(o[HIPS], o[HIPS + 1], o[HIPS + 2])
	var rc := rh * euler(o[SPINE], o[SPINE + 1], o[SPINE + 2])
	var rd := rc * euler(o[HEAD], o[HEAD + 1], o[HEAD + 2])
	var chest := pel + rc * SPINE_OFF
	L[J_CHEST] = chest
	var neck := chest + rc * NECK_OFF
	L[J_NECK] = neck
	L[J_HEAD] = neck + rd * HEAD_OFF
	for s in 2:
		var sx := -1.0 if s == 0 else 1.0
		var sh := chest + rc * Vector3(SHOULDER.x * sx, SHOULDER.y, SHOULDER.z)
		L[J_SH_L if s == 0 else J_SH_R] = sh
		var arm := ik(sh, _get3(o, HAND + s * 3), _get3(o, ELBOW + s * 3), UPPER, FORE)
		L[J_EL_L if s == 0 else J_EL_R] = arm[0]
		L[J_HAND_L if s == 0 else J_HAND_R] = arm[1]
		var hip := pel + rh * Vector3(HIP.x * sx, HIP.y, HIP.z)
		L[J_HIP_L if s == 0 else J_HIP_R] = hip
		var leg := ik(hip, _get3(o, FOOT + s * 3), _get3(o, KNEE + s * 3), THIGH, SHIN)
		L[J_KNEE_L if s == 0 else J_KNEE_R] = leg[0]
		L[J_FOOT_L if s == 0 else J_FOOT_R] = leg[1]
		hand_roll[s] = o[ROLL + s]
		foot_air[s] = clampf(o[AIR + s], 0.0, 1.0)
		foot_flex[s] = o[FLEX + s]
		foot_heel[s] = o[HEEL + s]
		# the robot frame mirrors x: a turn to its right is a turn to the world's left
		foot_yaw[s] = yaw - (o[FYAW + s] + o[HIPS + 1])
	face = yaw - o[HIPS + 1]
	for i in 16:
		joints[i] = to_world(L[i])
	# gaze: well out along the head's facing. The model only turns the head 60% of the way from the
	# chest's facing to the gaze, so aim past it by the remainder.
	var hf := rd * Vector3(0, 0, 1)
	var cf := rc * Vector3(0, 0, 1)
	var g := (hf + (hf - cf) * 0.67).normalized() * 3.0
	gaze = to_world(g + L[J_HEAD])
	return self


## The facing (world yaw) of a heading from one world point towards another (puppet.ts yawTo).
static func yaw_to(from: Vector3, to: Vector3) -> float:
	return atan2(to.x - from.x, to.z - from.z)
