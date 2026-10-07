package skills

import "sort"

// The buff tray's server half (plan-buff-tray.md C1): what the store tells the
// own player's client about the timed effects on them, change-only through the
// owner-state gate (D15). The store does not change meaning here; it only
// learns to report itself.

// EffectKind is the buff tray's taxonomy of the twelve payload kinds, as BITS:
// an OwnEffect carries the union of the kinds live under one circle. It
// mirrors the wire enum AuraApi.EffectKind one for one (bit_flags); a codec
// test pins the pairing and api/shared-constants.json pins both sides, so a
// renumber goes red before a slow draws as a buff.
//
// ⚑ Which side a circle sits on (D13: Slow, Dot and Stun harmful, the rest
// beneficial) is the CLIENT's rule. The server has no reason to know and
// deliberately does not restate it.
type EffectKind uint32

const (
	EffectKindResist    EffectKind = 1 << 0
	EffectKindSlow      EffectKind = 1 << 1
	EffectKindSpeed     EffectKind = 1 << 2
	EffectKindLifesteal EffectKind = 1 << 3
	EffectKindReflect   EffectKind = 1 << 4
	EffectKindTickRate  EffectKind = 1 << 5
	EffectKindDot       EffectKind = 1 << 6
	EffectKindHot       EffectKind = 1 << 7
	EffectKindShield    EffectKind = 1 << 8
	EffectKindCalm      EffectKind = 1 << 9
	EffectKindStun      EffectKind = 1 << 10
	EffectKindCharm     EffectKind = 1 << 11
	EffectKindStatUp    EffectKind = 1 << 12
	EffectKindStatDown  EffectKind = 1 << 13
)

func (*resistPayload) effectKind() EffectKind    { return EffectKindResist }
func (*slowPayload) effectKind() EffectKind      { return EffectKindSlow }
func (*speedPayload) effectKind() EffectKind     { return EffectKindSpeed }
func (*lifestealPayload) effectKind() EffectKind { return EffectKindLifesteal }
func (*reflectPayload) effectKind() EffectKind   { return EffectKindReflect }
func (*tickRatePayload) effectKind() EffectKind  { return EffectKindTickRate }
func (*dotPayload) effectKind() EffectKind       { return EffectKindDot }
func (*hotPayload) effectKind() EffectKind       { return EffectKindHot }
func (*shieldPayload) effectKind() EffectKind    { return EffectKindShield }
func (*calmPayload) effectKind() EffectKind      { return EffectKindCalm }
func (*stunPayload) effectKind() EffectKind      { return EffectKindStun }
func (*charmPayload) effectKind() EffectKind     { return EffectKindCharm }

// The sign picks the tray side (D12), the appliedBit rule.
func (p *statPayload) effectKind() EffectKind {
	if p.bonus < 0 {
		return EffectKindStatDown
	}
	return EffectKindStatUp
}

// OwnEffect is one circle on the own player's buff tray, the store's
// projection of one (skill, caster) group of streams.
//
// ⭐ The key is (Skill, Caster), PO 2026-10-02, amending D11's "one circle per
// skill": a dot stream is applied and ticks PER CASTER (round-7 item 6), so
// two wolves' Venom Spit are two circles with their own time. Every other
// kind has no caster on the server (a second caster only refreshes the same
// stream), so those streams fold into ONE circle per skill with a nil Caster;
// and while a skill has dot circles, its caster-less kinds ride in each dot
// circle's Kinds instead of forming a third circle. Hots stay per skill too:
// only the strongest heals and a refresh hands the stream to the latest
// caster, so there is nothing per caster to show.
type OwnEffect struct {
	Skill SkillID
	// Caster is the dot stream's applier (an entity, or a placed area effect
	// for lava and the like), typed `any` like DotBuff.Caster because model
	// imports skills. nil for the skill's shared circle. The codec resolves it
	// to a wire id (model.SourceID).
	Caster any
	// Kinds is the union of EffectKind bits live under this circle.
	Kinds EffectKind
	// Total and Left are the longest stream's lifetime and remaining ticks:
	// the wedge. A refresh resets both to the new lifetime (D2).
	Total, Left int
}

// Revision is the tray-visible change counter. See the field.
func (b *Buffs) Revision() uint64 { return b.revision }

// extend renews e's lifetime when a refresh outlasts what is left — the one
// rule every Apply* shares (extend-never-shorten) — and, because the expiry
// then moves, counts it as a change. A refresh that does not outlast the stream
// changes nothing the wire can see and leaves the revision alone.
func (b *Buffs) extend(e *buffEntry, ticks int) {
	if ticks > e.ticks {
		e.ticks = ticks
		e.total = ticks
		b.revision++
	}
}

// OwnEffects is the tray projection: one OwnEffect per (skill, caster) group
// (see OwnEffect), sorted by skill id and, within a skill, by the casters'
// order of first application, so the wire bytes are stable across a map walk.
//
// Allocates. It runs only on a tick that sends the owner block (the gate
// confirmed a change or the heartbeat is due), never on the quiet ticks the
// alloc pins guard, and the store is a few dozen entries at most.
func (b *Buffs) OwnEffects() []OwnEffect {
	if len(b.entries) == 0 {
		return nil
	}
	sources := make([]SkillID, 0, len(b.entries))
	for source := range b.entries {
		sources = append(sources, source)
	}
	sort.Slice(sources, func(i, j int) bool { return sources[i] < sources[j] })

	out := make([]OwnEffect, 0, len(sources))
	for _, source := range sources {
		list := b.entries[source]

		// The skill's shared half: every stream that has no caster.
		shared := OwnEffect{Skill: source}
		// The dot half: one group per caster, in order of first application.
		var dots []OwnEffect
		for _, e := range list {
			p, isDot := e.payload.(*dotPayload)
			if !isDot {
				shared.Kinds |= e.payload.effectKind()
				if e.ticks > shared.Left {
					shared.Left, shared.Total = e.ticks, e.total
				}
				continue
			}
			i := 0
			for ; i < len(dots); i++ {
				if dots[i].Caster == p.dot.Caster {
					break
				}
			}
			if i == len(dots) {
				dots = append(dots, OwnEffect{Skill: source, Caster: p.dot.Caster, Kinds: EffectKindDot})
			}
			if e.ticks > dots[i].Left {
				dots[i].Left, dots[i].Total = e.ticks, e.total
			}
		}

		if len(dots) == 0 {
			out = append(out, shared)
			continue
		}
		for i := range dots {
			dots[i].Kinds |= shared.Kinds
		}
		out = append(out, dots...)
	}
	return out
}
