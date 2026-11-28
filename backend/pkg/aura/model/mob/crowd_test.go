package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Version B's crowd resistance (plan-playtest-versions.md D8, PV2b): a hostile
// mob takes less damage for each extra player on its threat table. The knobs
// are package state set once at boot, so every test that moves them puts them
// back. Values are [PLACEHOLDER].

func withCrowd(t *testing.T, perAttacker, capAt float32) {
	t.Helper()
	SetCrowd(perAttacker, capAt)
	t.Cleanup(func() { SetCrowd(0, 0) })
}

// crowdPlayer is a live player standing beside the mob, so an Update neither
// chases it far nor leashes.
func crowdPlayer() *fakeAuraPlayer {
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.4, Y: 0}
	return p
}

// crowdedMob is a hostile test mob with n players on its threat table and the
// count taken.
func crowdedMob(n int) (*Mob, []*fakeAuraPlayer) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	players := make([]*fakeAuraPlayer, n)
	for i := range players {
		players[i] = crowdPlayer()
		m.NoteThreat(players[i], 10)
	}
	m.Update(0)
	return m, players
}

func TestCrowd_OneAttackerNoResist(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, _ := crowdedMob(1)

	assert.Zero(t, m.CrowdResist())
	assert.Zero(t, m.CrowdPercent())
	assert.Equal(t, float32(1), m.EffectiveStats().DamageFactor())
}

// R6: the crowd makes a mob tougher, never stronger.
func TestCrowd_ThreeAttackersTwoSteps(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, _ := crowdedMob(3)

	assert.InDelta(t, 0.2, m.CrowdResist(), 1e-6)
	assert.Equal(t, float32(1), m.EffectiveStats().DamageFactor(), "R6: the mob's damage is untouched")
}

// The boundary: cap / step = 5 steps, reached at exactly 6 players; a seventh
// adds nothing.
func TestCrowd_CapHolds(t *testing.T) {
	withCrowd(t, 0.1, 0.5)

	five, _ := crowdedMob(5)
	assert.InDelta(t, 0.4, five.CrowdResist(), 1e-6, "one step below the cap")

	six, _ := crowdedMob(6)
	assert.InDelta(t, 0.5, six.CrowdResist(), 1e-6, "exactly at the cap")

	seven, _ := crowdedMob(7)
	assert.InDelta(t, 0.5, seven.CrowdResist(), 1e-6, "past the cap")
	assert.Equal(t, float32(1), seven.EffectiveStats().DamageFactor(), "R6")
}

// D8: taken × (1 - resist), its own factor beside DamageReductionFactor.
func TestCrowd_DamageTakenIsOneMinusResist(t *testing.T) {
	withCrowd(t, 0.125, 0.5)

	alone, _ := crowdedMob(1)
	before := alone.Health()
	alone.takeDamage(model.Damage{HP: 40}, 0, model.StatusEffectDamagedAmbient)
	assert.Equal(t, before-40, alone.Health(), "one player: no mitigation")

	m, _ := crowdedMob(3)
	before = m.Health()
	m.takeDamage(model.Damage{HP: 40}, 0, model.StatusEffectDamagedAmbient)
	assert.Equal(t, before-30, m.Health(), "three players at 0.125 a step: 40 → 30")
}

// The cap is clamped below immune at SetCrowd: a conf cap of 2.0 reads 0.9.
func TestCrowd_CapClampedBelowImmune(t *testing.T) {
	withCrowd(t, 1, 2)
	_, capAt := Crowd()
	assert.InDelta(t, 0.9, capAt, 1e-6)

	m, _ := crowdedMob(5)
	assert.InDelta(t, 0.9, m.CrowdResist(), 1e-6)
	before := m.Health()
	m.takeDamage(model.Damage{HP: 100}, 0, model.StatusEffectDamagedAmbient)
	assert.Less(t, m.Health(), before, "never immune")
}

func TestCrowd_SummonRowDoesNotCount(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	p := crowdPlayer()
	m.NoteThreat(p, 10)
	for i := 0; i < 3; i++ {
		pet := newTestCompanion(newFakeOwner())
		pet.SetPosition(phy.Vec2f{X: 0.4, Y: 0})
		m.NoteThreat(pet, 10)
	}
	require.Len(t, m.threat, 4, "the summons are on the table")
	m.Update(0)

	assert.Zero(t, m.CrowdResist(), "R2: summons do not count")
}

// R8: a live count, not a latch: a player who dies stops counting at once.
func TestCrowd_DeadAttackerDropsOut(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, players := crowdedMob(3)
	require.InDelta(t, 0.2, m.CrowdResist(), 1e-6)

	players[2].vs.Health = 0
	m.Update(0)
	assert.InDelta(t, 0.1, m.CrowdResist(), 1e-6)
}

// R8: no recency window. A player whose row has had no write for 10 000 ticks
// still counts; only leaving the table (or a reset) ends it. The keeper hits
// every tick so the mob stays in its fight and never leashes.
func TestCrowd_WalkerAwayStillCounts(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	keeper, walker := crowdPlayer(), crowdPlayer()
	m.NoteThreat(walker, 10) // written once
	for range 10_000 {
		m.NoteThreat(keeper, 10)
		m.Update(0)
	}
	require.True(t, m.HasThreat(walker.Basic().ID()), "the fight held: no reset")
	assert.InDelta(t, 0.1, m.CrowdResist(), 1e-6)
}

// D8's table: a disconnect (ForgetEntity) and Fade / detaunt (DropThreat)
// take the row off the table, so the player stops counting on the next count.
func TestCrowd_DisconnectAndFadeLeave(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, players := crowdedMob(3)
	require.InDelta(t, 0.2, m.CrowdResist(), 1e-6)

	m.ForgetEntity(players[2].Basic().ID())
	m.Update(0)
	assert.InDelta(t, 0.1, m.CrowdResist(), 1e-6, "a disconnect leaves")

	m.DropThreat(players[1].Basic().ID())
	m.Update(0)
	assert.Zero(t, m.CrowdResist(), "a Fade leaves")
}

// R7: the wire carries round(resist × 100), the number on screen.
func TestCrowd_PercentRounds(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, _ := crowdedMob(3)
	assert.Equal(t, uint8(20), m.CrowdPercent())

	// 0.07 a step: 2 steps is 0.14 in float32, which must not truncate to 13.
	withCrowd(t, 0.07, 0.5)
	m, _ = crowdedMob(3)
	assert.Equal(t, uint8(14), m.CrowdPercent())

	// 0.125 × 1 = 12.5 rounds half away from zero.
	withCrowd(t, 0.125, 0.5)
	m, _ = crowdedMob(2)
	assert.Equal(t, uint8(13), m.CrowdPercent())
}

func TestCrowd_ResetClears(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, _ := crowdedMob(3)
	require.NotZero(t, m.CrowdResist())

	m.resetAggro()
	assert.Zero(t, m.CrowdResist())
	assert.Zero(t, m.CrowdPercent())
}

// Q4 (PO 2026-11-28): healer threat is a threat write, so a healer counts.
func TestCrowd_HealerCounts(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	hitter, healer := crowdPlayer(), crowdPlayer()
	m.NoteThreat(hitter, 10)
	m.NoteThreat(healer, 3) // the healer-threat seam (§6.3)
	m.Update(0)

	assert.InDelta(t, 0.1, m.CrowdResist(), 1e-6)
}

// Version A: the keys absent, nothing counts and nothing changes.
func TestCrowd_AbsentKeysAreNeutral(t *testing.T) {
	SetCrowd(0, 0)
	m, _ := crowdedMob(5)

	assert.Zero(t, m.CrowdResist())
	assert.Equal(t, float32(1), m.crowdTakenFactor())
	per, capAt := Crowd()
	assert.Zero(t, per)
	assert.Zero(t, capAt)
}

// Same set as D2: a player's companion and a friendly NPC never scale.
func TestCrowd_OutsideTheHostileSetNeverScales(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	def := testMobDefinition()
	def.FriendlyToPlayers = true
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{})
	for i := 0; i < 3; i++ {
		m.NoteThreat(crowdPlayer(), 10)
	}
	m.Update(0)

	assert.Zero(t, m.CrowdResist())
}

// The recount runs per mob per tick on the live world (the idle-loop
// discipline, project_idle_alloc_fix): it must not allocate.
func TestCrowd_RecountAllocatesNothing(t *testing.T) {
	withCrowd(t, 0.1, 0.5)
	m, players := crowdedMob(3)

	allocs := testing.AllocsPerRun(50, func() {
		m.NoteThreat(players[0], 1)
		m.tickCrowd()
	})
	assert.Zero(t, allocs)
}
