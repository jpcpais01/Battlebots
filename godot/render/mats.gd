## Setting a shader parameter re-packs and re-uploads that material's whole uniform buffer at the
## end of the frame, even when the value is the one it already has: put() skips those.
class_name Mats


static func put(m: ShaderMaterial, n: StringName, v) -> void:
	if m.get_shader_parameter(n) != v:
		m.set_shader_parameter(n, v)
