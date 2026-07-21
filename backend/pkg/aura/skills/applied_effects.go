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
	// Shields carry AppliedEffectNone: shield_hp is already on the wire and the
	// overhead bar renders the absorb segment — a pip would double-display it.
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
func (*hotPayload) appliedBit() AppliedEffect      { return AppliedEffectHot }
func (*resistPayload) appliedBit() AppliedEffect   { return AppliedEffectResist }
func (*tickRatePayload) appliedBit() AppliedEffect { return AppliedEffectTickRate }
func (*shieldPayload) appliedBit() AppliedEffect   { return AppliedEffectNone }
