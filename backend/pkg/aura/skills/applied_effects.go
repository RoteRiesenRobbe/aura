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
	//
	// ⚑ That day has arrived and the answer was to WAIT. lifestealPayload (R3,
	// the burst Reaper's rider became) carries AppliedEffectNone — not because a
	// leech is invisible the way a shield is, but because there is no bit left to
	// give it and widening the wire for one buff is §39's job, not a cooldown's.
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

// No bit left in the ubyte — see the ⚑ note above.
func (*lifestealPayload) appliedBit() AppliedEffect { return AppliedEffectNone }

func (*calmPayload) appliedBit() AppliedEffect  { return AppliedEffectCalm }
func (*charmPayload) appliedBit() AppliedEffect { return AppliedEffectCharm }
