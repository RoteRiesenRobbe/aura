package skills

// AppliedEffect is the received-status taxonomy the client draws buff/debuff
// pips from: which payload kinds are currently applied TO an entity (the Buffs
// store). The mirror-opposite of AuraCategory, which describes the aura an
// entity itself projects — the two directions are separate wire fields on
// purpose.
//
// Serialized as the applied_effects wire ushort on both Mob and Character.
// Presence only: a bit is set while at least one application of that kind is
// alive, with no per-effect duration on the wire.
type AppliedEffect uint16

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
	// A timed stat buff or debuff on others (plan-effect-types-round-2.md C1,
	// D12): the sign of the bonus picks the bit.
	AppliedEffectStatUp   AppliedEffect = 1 << 8
	AppliedEffectStatDown AppliedEffect = 1 << 9
	// A live reflect, own or granted (plan-effect-types-round-2.md C2): thorns
	// on an ally or a mob has to be readable before anyone hits it.
	AppliedEffectReflect AppliedEffect = 1 << 10
	// Shields carry AppliedEffectNone: shield_hp is already on the wire and the
	// overhead bar renders the absorb segment — a pip would double-display it.

	// ⚑ Bit 7 was the LAST bit of the old ubyte; effect types round 2 C0
	// (plan-effect-types-round-2.md) widened the wire field to a ushort, so
	// bits 8-15 are free. lifestealPayload (R3) and reflectPayload went
	// without a pip while there was no room; reflect got bit 10 in that plan's
	// C2, lifesteal still has none.
	// The burst is not silent in play — every hit floats a heal number off the
	// caster and the cooldown icon runs its own timer — but it is the first buff
	// with NO pip and a real duration, so it is the concrete cost of the missing
	// bit and should be the first thing §39 gives one to.
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

// No pip yet; see the ⚑ note above.
func (*lifestealPayload) appliedBit() AppliedEffect { return AppliedEffectNone }

// The reflect wants a pip more than lifesteal does: a leech announces itself
// through the heal numbers floating off the caster, while a reflect's numbers
// float off the ATTACKER, where they are hard to tell from any other damage.
// It got one with thorns on others (plan-effect-types-round-2.md C2).
func (*reflectPayload) appliedBit() AppliedEffect { return AppliedEffectReflect }

// D6: the stun borrows the SLOW bit rather than widening the wire for one
// buff — the lifestealPayload precedent above, applied where reuse at least
// reads as movement impairment instead of as nothing at all. ⚑ The conflation
// is real: a stunned mob is indistinguishable from a slowed one on the wire,
// and a stun suppresses a weaker slow's pip. §39 owns splitting them.
func (*stunPayload) appliedBit() AppliedEffect { return AppliedEffectSlow }

func (p *statPayload) appliedBit() AppliedEffect {
	if p.bonus < 0 {
		return AppliedEffectStatDown
	}
	return AppliedEffectStatUp
}

func (*calmPayload) appliedBit() AppliedEffect  { return AppliedEffectCalm }
func (*charmPayload) appliedBit() AppliedEffect { return AppliedEffectCharm }
