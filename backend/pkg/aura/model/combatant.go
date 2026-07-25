package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/phy"

// Combatant is a living, factioned combat participant as mob aggro sees one
// (mob-depth chunk 3): everything acquisition, threat retention and
// chase/flee need from a target. Players, mobs and summons all satisfy it;
// "living" is HealthRatio() > 0, which players and mobs share since item 11.
type Combatant interface {
	BasicEntity
	Factioned

	Position() phy.Vec2f
	Radius() float32
	HealthRatio() float32

	// InCombat reports whether this combatant is currently engaged (atmosphere
	// & recovery chunk 1). Read by the regen gate and by a healer deciding
	// whether supporting an ally counts as combat. A player runs a time-gated
	// recent-action window; a mob holds an aggro target OR has taken damage
	// recently (playtest round 3 — the aggro-target half alone left a mob that
	// acquires nothing, i.e. a pacifist healer, permanently out of combat and
	// so permanently regenerating).
	InCombat() bool
}

// CombatActor is the player-only capability to be stamped into combat by its
// own harmful/supporting action (atmosphere & recovery chunk 1). Mobs still do
// not implement it — their in-combat window is stamped internally by damage
// TAKEN, and the dealt half is already covered by holding an aggro target — so
// the SkillSystem's caster-side stamp type-asserts this and skips mob casters
// for free.
type CombatActor interface {
	NoteCombatAction()
}

// AttackNotifier receives the "dealt a direct hit" stamp (mob-depth chunk 6):
// Mob.PlayerTouches stamps the toucher on hits whose Damage.Source is nil —
// direct player casts only, never summon-sourced damage replaying through the
// owner. Implemented by the player; optional (asserted at the stamp site).
type AttackNotifier interface {
	NoteAttackDealt(target Combatant)
}

// CombatSignals exposes the owner-centric acquisition signals a companion
// reads off its owner (mob-depth chunk 6, §3.6): the last mob the owner
// directly damaged (assist) and the last mob that damaged the owner (defend).
// Both age out over a short window and read nil when expired or dead.
type CombatSignals interface {
	RecentAttackTarget() Combatant
	RecentAttacker() Combatant
}
