package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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

	// SkillID is the skill this hit belongs to, carried for the hit event the
	// funnel records (plan-skill-vfx.md D9). 0 = no skill: the cheat damage
	// command and nothing else (no api/skills file authors id 0).
	//
	// ⚑ It is NOT a resolvable-from-Source substitute. A DoT tick lands long
	// after its aura is gone, and a reflect names the passive that bounced it,
	// not whatever the caster happens to be running now.
	SkillID skills.SkillID
}

type Interacter interface {
	MobTouches(m MobEntity, factors mobs.Factors)
	// PlayerTouches applies a player-sourced hit; damage is absolute HP for
	// living targets (item 11 Phase 1). Structures instead read the fractional
	// StructureDamageFraction from their own path.
	PlayerTouches(p PlayerEntity, damage Damage)
}

// AreaSource is a hit that came from a PLACE rather than from an entity — the
// lava pool, the bog, the miasma (plan-area-effects.md E2/D13).
//
// ⭐ THE THIRD KIND OF DAMAGE SOURCE, and until E2 there were only two. Every
// hit in this game was attributed to a player or a mob, which is why Interacter
// has exactly two methods — and why an area effect could not simply borrow the
// dot machinery: DotBuff.Caster is not only the stream key, it is the
// ATTRIBUTION DISPATCH, and sys/skills.go drops anything it cannot type-switch
// (its `default: continue`). A synthetic caster would have applied the buff,
// ticked it, and discarded every event in silence.
//
// ⛔ It carries a NAME and nothing else, and the emptiness is the ruling. An
// area has no level, no power scale, no resistances of its own, no threat table
// and nothing to credit a kill to — so there is no entity here to reach for. The
// name exists so a death can say what killed you and a log can say what hit you.
type AreaSource interface {
	// AreaEffectName is the authored effect the area names — "Blight", not
	// "the bog". It is what an obituary and a debug line quote.
	AreaEffectName() string
}

// AreaHittable is implemented by entities an area effect can act on: players
// and mobs.
//
// ⚑ AN OPTIONAL INTERFACE, asserted at the use site, rather than a third method
// on Interacter — the idiom sys/skills.go already uses for dotBuffable,
// hotBuffable, buffEventCarrier and tickRateBuffed. Widening Interacter itself
// would force a method onto seven test fakes that will never meet an area, for
// no behaviour; this way the two real implementors opt in and nothing else
// changes. The RULING it implements is unchanged: a place is a source, and it
// reaches its victim through its own entry point rather than by pretending to be
// an entity.
type AreaHittable interface {
	// AreaTouches applies a hit from a place. Resistances, shields and GOD all
	// apply exactly as they do to an entity-sourced hit — that is the whole
	// point of routing it here rather than deducting health — but there is no
	// threat, no kill credit, no participation and no lifesteal, because there
	// is nobody to give them to.
	AreaTouches(src AreaSource, damage Damage)
}
