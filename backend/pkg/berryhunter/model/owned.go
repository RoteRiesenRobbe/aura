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
