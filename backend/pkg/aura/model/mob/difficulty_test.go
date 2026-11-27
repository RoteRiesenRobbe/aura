package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Version B's hidden difficulty factors (plan-playtest-versions.md D2, PV1).
// They are package state set once at boot, so every test that moves them puts
// them back.

func withDifficulty(t *testing.T, damage, health float32) {
	t.Helper()
	SetDifficulty(damage, health)
	t.Cleanup(func() { SetDifficulty(1, 1) })
}

func TestMobDifficulty_AbsentKeysAreNeutral(t *testing.T) {
	SetDifficulty(0, 0) // what an absent conf block hands the setter
	t.Cleanup(func() { SetDifficulty(1, 1) })

	m := newTestMob()
	assert.Equal(t, float32(1), m.DifficultyDamageFactor())
	assert.Equal(t, NewMob(testMobDefinition(), 0, nil).MaxHealth(), m.MaxHealth())
	damage, health := Difficulty()
	assert.Equal(t, float32(1), damage, "the boot log reports the resolved value")
	assert.Equal(t, float32(1), health)
}

func TestMobDifficulty_HealthFactorScalesTheHostilePool(t *testing.T) {
	base := newTestMob().MaxHealth()
	withDifficulty(t, 1, 2)

	m := newTestMob()
	assert.Equal(t, 2*base, m.MaxHealth())
	assert.Equal(t, m.MaxHealth(), m.Health(), "a mob spawns at its full, scaled pool")
}

func TestMobDifficulty_DamageFactorReachesTheHostileMob(t *testing.T) {
	withDifficulty(t, 1.5, 1)
	assert.Equal(t, float32(1.5), newTestMob().DifficultyDamageFactor())
}

func TestMobDifficulty_PlayerSummonIsUntouched(t *testing.T) {
	base := newTestCompanion(newFakeOwner()).MaxHealth()
	withDifficulty(t, 2, 2)

	m := newTestCompanion(newFakeOwner())
	assert.Equal(t, base, m.MaxHealth())
	assert.Equal(t, float32(1), m.DifficultyDamageFactor())
}

func TestMobDifficulty_FriendlyNpcIsUntouched(t *testing.T) {
	def := testMobDefinition()
	def.FriendlyToPlayers = true // townsfolk, the army
	base := NewMob(def, 0, nil).MaxHealth()
	withDifficulty(t, 2, 2)

	m := NewMob(def, 0, nil)
	assert.Equal(t, base, m.MaxHealth())
	assert.Equal(t, float32(1), m.DifficultyDamageFactor())
}

// Q9 (PO 2026-11-27): a gated species (the harvestables) keeps A's values, so
// harvesting is as in A.
func TestMobDifficulty_GatedHarvestableIsUntouched(t *testing.T) {
	def := testMobDefinition()
	def.Factors.GateKeys = []string{"harvest"}
	base := NewMob(def, 0, nil).MaxHealth()
	withDifficulty(t, 2, 2)

	m := NewMob(def, 0, nil)
	assert.Equal(t, base, m.MaxHealth())
	assert.Equal(t, float32(1), m.DifficultyDamageFactor())
}

// Read from the definition, never the live faction: a charm flips the faction
// to aligned, and the pool must not jump mid-fight.
func TestMobDifficulty_CharmedMobKeepsItsSpawnFactor(t *testing.T) {
	withDifficulty(t, 2, 2)
	m, _ := charmedWolf(t, 300)
	wild := NewMob(predatorDefinition(), 0, nil)

	assert.Equal(t, wild.MaxHealth(), m.MaxHealth())
	assert.Equal(t, float32(2), m.DifficultyDamageFactor())
}
