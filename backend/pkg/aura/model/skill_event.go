package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Skill events (plan-skill-vfx.md C1, D5/D9): the honest, attributed record of
// what skills did this tick, replacing the four per-tick aggregates
// (damageTaken, critTaken, healReceived, immuneHit) the client used to infer
// attribution from.
//
// The events are WRITE-ONLY OUTPUT. Nothing in the simulation reads one, the
// same contract the aggregates held, which is what makes recording them
// byte-identical to not recording them (the sim-determinism pins).
//
// Two properties are structural and worth keeping:
//
//   - **Recorded inside the four funnels** (D9: player and mob takeDamage,
//     player and mob Heal). The eight acting sites all end there, so a future
//     damage path cannot forget the event. The silent-wiring class has struck
//     this project twice; structure over discipline.
//   - **Held per entity, on the VICTIM** (D9 again), not in a game-wide sink.
//     Models hold no game reference, and the encoder already walks exactly the
//     entities a viewer can see, so the per-viewer filter is free.

// HitKind is what a landed hit did to its victim, as far as the client needs
// it to draw one. Values MIRROR AuraApi.HitKind one for one and are pinned by
// a codec test: this is the enum the wire carries, and a renumber on either
// side would silently redraw a heal as a crit.
//
// It is one of TWO axes (plan-skill-vfx.md §12h). HitKind says WHAT a landing
// did; HitPhase below says WHEN in an over-time effect's life it happened. A
// DoT tick is still Damage/Crit/Immune/Absorb and a HoT tick still Heal, and
// an application carries its effect's nature (Damage for a DoT, Heal for a
// HoT), so no value here ever has to double as a timing.
type HitKind uint8

const (
	HitKindDamage HitKind = 0 // ordinary HP loss
	HitKindCrit   HitKind = 1 // HP loss whose crit roll landed
	HitKindHeal   HitKind = 2 // HP restored
	HitKindAbsorb HitKind = 3 // a shield ate the hit whole (loss 0, absorbed > 0)
	HitKindImmune HitKind = 4 // a real hit fully mitigated; Amount is 0
)

// HitPhase is the SECOND axis of a landing (plan-skill-vfx.md §12h): not what
// it did (that is HitKind) but WHEN in an effect's life it happened. A DoT or
// HoT is applied once and then ticks; the client draws the authored look on
// the application (and every refresh) and only the engine's mark on a tick.
// Keeping it apart from HitKind means a tick still says Damage, Crit, Heal,
// Absorb or Immune, so the client never has to guess what a tick did. Values
// MIRROR AuraApi.HitPhase and are pinned by a codec test.
type HitPhase uint8

const (
	HitPhaseDirect  HitPhase = 0 // an ordinary landing, and every FIRED event
	HitPhaseApplied HitPhase = 1 // an over-time effect was applied or refreshed; Amount is 0
	HitPhaseTick    HitPhase = 2 // one tick of an over-time effect landed
)

// SkillEvent is one thing a skill did: a cast that went off (Fired, with no
// Victim), or one landing on one victim.
//
// ⚑ Source is the ACTING entity, which on an owned cast is the summon itself,
// not its owner: the client resolves own-caused through the mob's wire
// owner_id (Credited.CreditTo). C2's VFX wants the summon: that is where the
// fireball comes from.
//
// Phase (§12h) is Direct for an ordinary landing and every Fired event,
// Applied when an over-time effect was applied or refreshed on Victim (Amount
// 0, noted inside ApplyDot / ApplyHot, the funnel again), and Tick for one of
// its ticks. The client draws a skill's `applied` layers on Applied, its `hit`
// layers on Direct, and only the engine's mark on a Tick.
type SkillEvent struct {
	Source  uint64
	Victim  uint64 // 0 on a Fired event
	SkillID skills.SkillID
	Amount  vitals.VitalSign // post-mitigation; 0 on Fired and on Immune
	Kind    HitKind
	Phase   HitPhase // Direct unless an over-time effect is being applied or ticking
	Fired   bool
}

// Healing is one heal's payload, the Damage twin, and it exists for the same
// reason (D9): before C1, Healable.Heal took a bare uint32 and the funnel had
// no idea who was healing or with what, so a heal number could never be
// attributed. Every heal path fills it: heal auras, HoT ticks, lifesteal and
// the self-heal cooldown.
type Healing struct {
	HP uint32

	// Caster is the healing entity (a PlayerEntity or MobEntity). nil for a
	// heal with no caster to name. Nothing in production leaves it nil, but a
	// test fake may, and a nil caster simply records no event.
	Caster Combatant

	// SkillID is the skill that paid for this heal; 0 = no skill (the cheat
	// path, and only that; no api/skills file authors id 0).
	SkillID skills.SkillID

	// Tick marks one tick of a heal-over-time effect (plan-skill-vfx.md
	// §12h). Presentational: set by the SkillSystem's tickHotEvents, it is the
	// phase the funnel notes (HitPhaseTick).
	Tick bool
}

// PhaseOf is the phase a landing is noted with: Tick for an over-time
// effect's tick, Direct for everything else. The four funnels share it.
func PhaseOf(tick bool) HitPhase {
	if tick {
		return HitPhaseTick
	}
	return HitPhaseDirect
}

// AppliedEvent is the event an over-time effect's application (or refresh)
// notes on its victim (plan-skill-vfx.md §12h, PO 2026-09-23): the client
// draws the skill's `applied` look from it, never a number. ok is false when
// the caster yields no entity id (a place: an area effect has no point to
// draw from), and then nothing is noted.
func AppliedEvent(caster any, victim uint64, id skills.SkillID, kind HitKind) (SkillEvent, bool) {
	c, ok := caster.(BasicEntity)
	if !ok {
		return SkillEvent{}, false
	}
	return SkillEvent{Source: c.Basic().ID(), Victim: victim, SkillID: id, Kind: kind, Phase: HitPhaseApplied}, true
}

// SkillFiredNotifier is the narrow door the SkillSystem stamps a FIRED event
// through, kept separate from the funnels for the same reason the recording
// splits in two: the caster knows what it cast, the victim knows what it took,
// and neither knows the other's half.
type SkillFiredNotifier interface {
	NoteSkillFired(id skills.SkillID)
}

// NoteSkillFired stamps a FIRED event on a caster that accepts one. Casters
// that do not (test doubles, structures) simply emit nothing.
func NoteSkillFired(caster any, id skills.SkillID) {
	if n, ok := caster.(SkillFiredNotifier); ok {
		n.NoteSkillFired(id)
	}
}

// ActingSourceID is the entity a hit is ATTRIBUTED to on the wire: the
// payload's Source when one is set (an owned summon or a charmed mob acting on
// a player's behalf; plan-skill-vfx.md §5.1 keeps the summon as the event's
// source, because that is where C2 draws the effect from), else the toucher.
//
// It mirrors the threat rule in Mob.PlayerTouches deliberately, minus its
// liveness fallback: an event names who acted, and a summon that died this tick
// still acted.
func ActingSourceID(source Combatant, toucher BasicEntity) uint64 {
	if source != nil {
		return source.Basic().ID()
	}
	if toucher == nil {
		return 0
	}
	return toucher.Basic().ID()
}
