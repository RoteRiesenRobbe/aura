package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// Damage is one hit's payload (item 11 Phase 2): absolute HP plus the damage
// tags resistances match against. Tags come from the effect definition and are
// never empty for skill damage (untagged effects parse to ["physical"]); a
// tagless Damage (e.g. from tests) simply matches no resistance.
type Damage struct {
	HP   float32
	Tags []string

	// Source is the entity whose effect dealt the hit when that differs from
	// the crediting player — an owned summon (mob-depth chunk 3): threat
	// credits the source, XP the toucher (gotcha #9 — the stores stay
	// separate). nil = the toucher itself is the source.
	Source Combatant

	// Lifesteal is the fraction of the damage actually DEALT (post-mitigation,
	// overkill excluded) healed back to the hit's recipient — the living
	// Source, else the toucher (plan-skill-vocab chunk 1, F6 §3.1/9). 0 = none.
	Lifesteal float32

	// Crit marks a hit whose crit roll landed (§4.3): the target adds its
	// post-mitigation loss to the crit_taken wire accumulator so the client
	// renders it big. Presentational at the target — the multiplier was
	// applied caster-side.
	Crit bool

	// GateKey makes this a lock-and-key hit (content pass C1, the chore gate;
	// the damage-type/gate-key split is plan-numbers-rewrite D4): the target
	// takes damage only if its authored factors.gateKeys name this key —
	// otherwise the hit is a non-event. Empty on ordinary damage. Filled from
	// the effect's gateKey at cast time, like Tags/Crit/Lifesteal.
	//
	// ⚑ A gated hit carries no Tags, so it never enters resistance math at all.
	GateKey string
}

type Interacter interface {
	MobTouches(m MobEntity, factors mobs.Factors)
	// PlayerTouches applies a player-sourced hit; damage is absolute HP for
	// living targets (item 11 Phase 1). Structures instead read the fractional
	// StructureDamageFraction from their own path.
	PlayerTouches(p PlayerEntity, damage Damage)
}
