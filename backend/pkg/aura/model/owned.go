package model

// Owned is implemented by spawned entities (totems, companions — mob-depth
// chunk 1) that act on behalf of a player. The SkillSystem's caster dispatch
// checks it BEFORE the MobEntity case: an owned mob's damage/heals route
// through PlayerTouches(Owner()), so XP participation, kill credit, drop
// rolls, recipe cascade and floating numbers all ride the existing player
// path. The owner ref may go stale (owner died/disconnected) — accepted by
// decision §8.4/2; a nil owner falls through to the plain mob path.
type Owned interface {
	Owner() PlayerEntity

	// SummonPower is the owner-level output multiplier (1 = neutral), applied
	// to damage and heal AMOUNTS only — never to CC parameters like slow
	// fraction or duration (chunk-1 decision: player level buffs a summon's
	// body and output, not its control effects).
	SummonPower() float32
}

// PowerScaled is implemented by casters whose HP-side skill output rides the
// f(character level) inflation curve (GDD §5, C0): players return
// f(character level), mobs f(Level()) — evaluated LIVE, not frozen at load
// (entity-model chunk 1b). For a summon that means the OWNER's current level, so
// a companion's scale tracks its owner as they ding.
// The SkillSystem multiplies damage / heal / dot / hot / shield / self-heal /
// self-cost HP values by it — never radius, tick rate, target count, or the
// relative multiplier vocabulary (crit/execute/berserker/variance/lifesteal).
type PowerScaled interface {
	PowerScale() float32
}
