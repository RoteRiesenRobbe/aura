package skills

// AppliedEffect is the received-status taxonomy the client draws buff/debuff
// pips from: which payload kinds are currently applied TO an entity (the Buffs
// store). The mirror-opposite of AuraCategory, which describes the aura an
// entity itself projects — the two directions are separate wire fields on
// purpose.
//
// Serialized as the applied_effects wire ubyte on both Mob and Character.
// Presence only: a bit is set while at least one application of that kind is
// alive, with no per-effect duration on the wire.
type AppliedEffect uint8

const (
	AppliedEffectNone     AppliedEffect = 0
	AppliedEffectDot      AppliedEffect = 1 << 0
	AppliedEffectSlow     AppliedEffect = 1 << 1
	AppliedEffectHot      AppliedEffect = 1 << 2
	AppliedEffectResist   AppliedEffect = 1 << 3
	AppliedEffectTickRate AppliedEffect = 1 << 4
	AppliedEffectCalm     AppliedEffect = 1 << 5
	AppliedEffectCharm    AppliedEffect = 1 << 6
	AppliedEffectSpeed    AppliedEffect = 1 << 7
	// Shields carry AppliedEffectNone: shield_hp is already on the wire and the
	// overhead bar renders the absorb segment — a pip would double-display it.

	// ⚑ Bit 7 is the LAST bit of the ubyte. The next payload kind that wants a
	// pip has to widen the wire field first — a natural part of backlog §39
	// (the entity presentation rework), which replaces presence-only pips with
	// durations anyway.
)

// AppliedEffects is the union of pip bits across every live application — the
// value serialized to the wire. Exhaustiveness is compile-enforced: appliedBit
// is part of the buffPayload interface, so a new payload kind cannot be added
// without deciding its pip here.
func (b *Buffs) AppliedEffects() AppliedEffect {
	var mask AppliedEffect
	for _, list := range b.entries {
		for _, e := range list {
			mask |= e.payload.appliedBit()
		}
	}
	return mask
}

func (*dotPayload) appliedBit() AppliedEffect      { return AppliedEffectDot }
func (*slowPayload) appliedBit() AppliedEffect     { return AppliedEffectSlow }
func (*speedPayload) appliedBit() AppliedEffect    { return AppliedEffectSpeed }
func (*hotPayload) appliedBit() AppliedEffect      { return AppliedEffectHot }
func (*resistPayload) appliedBit() AppliedEffect   { return AppliedEffectResist }
func (*tickRatePayload) appliedBit() AppliedEffect { return AppliedEffectTickRate }
func (*shieldPayload) appliedBit() AppliedEffect   { return AppliedEffectNone }
func (*calmPayload) appliedBit() AppliedEffect     { return AppliedEffectCalm }
func (*charmPayload) appliedBit() AppliedEffect    { return AppliedEffectCharm }
