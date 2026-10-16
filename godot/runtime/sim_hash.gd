## Port of src/sim/hash.ts: a 32-bit fingerprint of everything that decides a fight, to the
## last bit. Online play compares these; the parity test compares them with the web sim.
class_name SimHash
extends RefCounted

const PHASES := ["intro", "countdown", "greet", "fight", "ko", "end"]
static var _buf := PackedByteArray([0, 0, 0, 0, 0, 0, 0, 0])
static var _h := 0


static func _int(v: float) -> void:
	_h = JS.i32(JS.imul(float(_h ^ JS.i32(v)), 16777619.0))


static func _num(v: float) -> void:
	_buf.encode_double(0, v)
	_int(float(_buf.decode_s32(4)))
	_int(float(_buf.decode_s32(0)))


static func of(m) -> int:
	_h = JS.i32(2166136261.0)
	_int(m.frame)
	_num(m.time)
	_num(m.clock)
	_num(m.hitstop)
	_int(float(PHASES.find(m.phase)))
	_int(m.rng.state)
	for f in m.fighters:
		_int(f.rng.state)
		_num(f.hp)
		_num(f.stamina)
		_num(f.poise)
		_num(f.yaw)
		_num(f.root.x)
		_num(f.root.z)
		_num(f.rootVel.x)
		_num(f.rootVel.z)
		var st: String = f.state
		for i in st.length():
			_int(float(st.unicode_at(i)))
		for p in f.body.pos:
			_num(p.x)
			_num(p.y)
			_num(p.z)
	for b in m.brains:
		_int(b.rng.state)
		var coach = b.coach
		_int(float(coach.unicode_at(0) + coach.length()) if coach != null and coach != "" else 0.0)
		_num(b.coachUntil)
	return _h & 0xFFFFFFFF
