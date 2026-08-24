package mob

// plan-immune-feedback.md: the immune_hit per-tick one-shot. It marks "a hit
// landed this tick and was fully mitigated" - scripted invulnerability or
// resistances multiplied out to zero. A gate-key miss deliberately does NOT
// set it (D1: "not a valid target" and "immune" are different ideas), and a
// hit whose authored damage is already 0 is a no-op, not immunity.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/stretchr/testify/assert"
)

func TestMob_ImmuneHit_InvulnerableSetsFlag(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.True(t, m.ImmuneHit(), "scripted invulnerability is the Warlord case")
	assert.Zero(t, m.DamageTaken())
	assert.Equal(t, m.MaxHealth(), m.Health())
}

func TestMob_ImmuneHit_FullResistSetsFlag(t *testing.T) {
	// The Rockfall shape: resistances {"*": 0}, a normal tagged hit.
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"*": 0}
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.True(t, m.ImmuneHit())
	assert.Zero(t, m.DamageTaken())
}

func TestMob_ImmuneHit_GateMissStaysSilent(t *testing.T) {
	// D1 pin: a gate-keyed hit at a mob without the key was never a valid
	// target - no "Immune" over every bear in a gated aura's crowd.
	m := newTestMob() // no gate keys at all

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, GateKey: "harvest"})

	assert.False(t, m.ImmuneHit())
}

func TestMob_ImmuneHit_NormalHitLeavesFlagUnset(t *testing.T) {
	m := newTestMob()

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.False(t, m.ImmuneHit())
	assert.NotZero(t, m.DamageTaken())
}

func TestMob_ImmuneHit_ChipHitFloorsToOneNotImmune(t *testing.T) {
	// The §2 floor pin: vitals.HP floors any positive amount to at least 1,
	// so weak damage can never be mislabeled as immunity.
	m := newTestMob()

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 0.1, Tags: []string{"physical"}})

	assert.False(t, m.ImmuneHit())
	assert.Equal(t, m.MaxHealth()-1, m.Health(), "0.1 HP floors to a 1 HP hit")
}

func TestMob_ImmuneHit_ZeroAuthoredDamageIsANoOpNotImmunity(t *testing.T) {
	// A 0-HP hit trips the same <= 0 return as a full resist, but nothing was
	// mitigated - it must not stamp the label, on any branch.
	m := newTestMob()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 0, Tags: []string{"physical"}})
	assert.False(t, m.ImmuneHit(), "plain zero-damage hit")

	inv := newTestMob()
	inv.SetInvulnerable(true)
	inv.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 0})
	assert.False(t, inv.ImmuneHit(), "zero-damage hit at an invulnerable mob")
}

func TestMob_ImmuneHit_CoexistsWithDamageTaken(t *testing.T) {
	// D9's premise: both flags are per-tick aggregates, one tick can hold a
	// fully resisted hit and a landing one (Rockfall under harvest while a
	// resisted damage aura ticks). The server sets both; suppression is the
	// client's one-line guard.
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0}
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.True(t, m.ImmuneHit())
	assert.NotZero(t, m.DamageTaken())
}

func TestMob_ImmuneHit_ResetTickNumbersClearsIt(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10})
	assert.True(t, m.ImmuneHit())

	m.ResetTickNumbers()

	assert.False(t, m.ImmuneHit(), "per-tick one-shot like damage_taken")
}
