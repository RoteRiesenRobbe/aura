package constant

// Hardcoded constants
const (
	ViewPortWidth  = 20.0
	ViewPortHeight = 12.0
	TicksPerSecond = 30
	// StepMillis is the fixed dt handed to every ECS system, derived so it
	// cannot drift from the loop's real tick length (time.Second /
	// TicksPerSecond = 33.33 ms; a hand-written 33.0 restated the rounded
	// value, plan-code-health.md C3).
	StepMillis = 1000.0 / TicksPerSecond
	// CombatRegenGraceTicks [PLACEHOLDER] is how long after its last combat
	// action an entity stays in combat (~3.3 s @ 30 TPS; was 5 s, cut by a
	// third because the player's equip lock felt too long). Gates passive
	// regen for players AND mobs, plus the player's loadout editing. One
	// constant by design, the §31 vocabulary convergence: the two combat
	// models leave combat by the same rule (was a name-and-value twin in
	// model/player and model/mob, collapsed here by plan-code-health.md C4).
	// Deliberately NOT the ~3 s signal/leash windows: a regen grace that
	// short would let regen flicker on between hits.
	CombatRegenGraceTicks = 100
)
