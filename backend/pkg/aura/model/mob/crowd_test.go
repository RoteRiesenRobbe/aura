package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Version B's crowd scaling (plan-playtest-versions.md D3 + D4, PV2): a
// hostile mob grows stronger for each extra player recently on its threat
// table. The knobs are package state set once at boot, so every test that
// moves them puts them back. Values are [PLACEHOLDER].

const testCrowdWindow = 150

func withCrowd(t *testing.T, perAttacker, capAt float32, window int) {
	t.Helper()
	SetCrowd(perAttacker, capAt, window)
	t.Cleanup(func() { SetCrowd(0, 0, 0) })
}

// crowdPlayer is a live player standing beside the mob, so an Update neither
// chases it far nor leashes.
func crowdPlayer() *fakeAuraPlayer {
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.4, Y: 0}
	return p
}

// crowdedMob is a hostile test mob with n players on its threat table, all
// written this tick, and the count taken.
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

func TestCrowd_OneAttackerNoBonus(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, _ := crowdedMob(1)

	assert.Zero(t, m.CrowdBonus())
	assert.Equal(t, float32(1), m.EffectiveStats().DamageFactor())
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCrowd)
}

func TestCrowd_ThreeAttackersTwoSteps(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, _ := crowdedMob(3)

	assert.InDelta(t, 0.5, m.CrowdBonus(), 1e-6)
	assert.InDelta(t, 1.5, m.EffectiveStats().DamageFactor(), 1e-6,
		"the bonus feeds damageDealt (D3), so casterDamageFactor picks it up")
}

// The boundary: cap / step = 4 steps, reached at exactly 5 attackers; a sixth
// adds nothing. Both sides of the mirror (Q2) stop there.
func TestCrowd_CapHolds(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)

	four, _ := crowdedMob(4)
	assert.InDelta(t, 0.75, four.CrowdBonus(), 1e-6, "one step below the cap")

	five, _ := crowdedMob(5)
	assert.InDelta(t, 1.0, five.CrowdBonus(), 1e-6, "exactly at the cap")

	six, _ := crowdedMob(6)
	assert.InDelta(t, 1.0, six.CrowdBonus(), 1e-6, "past the cap")
	assert.InDelta(t, 2.0, six.EffectiveStats().DamageFactor(), 1e-6)
	assert.InDelta(t, 0.5, six.crowdTakenFactor(), 1e-6, "taken × 1/(1+cap)")
}

// Q2 (PO 2026-11-28): the crowd also mirrors onto the damage the mob takes,
// taken × 1/(1+bonus): at +100 % it deals 2× and takes ½, never immune.
func TestCrowd_DamageTakenMirrorsTheBonus(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)

	alone, _ := crowdedMob(1)
	before := alone.Health()
	alone.takeDamage(model.Damage{HP: 40}, 0, model.StatusEffectDamagedAmbient)
	assert.Equal(t, before-40, alone.Health(), "one attacker: no mitigation")

	m, _ := crowdedMob(5)
	before = m.Health()
	m.takeDamage(model.Damage{HP: 40}, 0, model.StatusEffectDamagedAmbient)
	assert.Equal(t, before-20, m.Health(), "five attackers: half the hit")
}

func TestCrowd_SummonRowDoesNotCount(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
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

	assert.Zero(t, m.CrowdBonus(), "R2: summons do not count")
}

func TestCrowd_DeadAttackerDropsOut(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, players := crowdedMob(3)
	require.InDelta(t, 0.5, m.CrowdBonus(), 1e-6)

	players[2].vs.Health = 0
	m.Update(0)
	assert.InDelta(t, 0.25, m.CrowdBonus(), 1e-6)
}

// R5: a player whose last threat write is crowdWindow ticks old stops counting
// on that tick; the row itself stays (L7).
func TestCrowd_StaleAttackerDropsOutAtTheWindowTick(t *testing.T) {
	const window = 10
	withCrowd(t, 0.25, 1, window)
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	keeper, passer := crowdPlayer(), crowdPlayer()
	m.NoteThreat(passer, 10) // written once; each Update ages it by one
	for age := 1; age < window; age++ {
		m.NoteThreat(keeper, 10)
		m.Update(0)
		require.InDelta(t, 0.25, m.CrowdBonus(), 1e-6, "age %d is inside the window", age)
	}
	m.NoteThreat(keeper, 10)
	m.Update(0) // the passer's write is now `window` ticks old
	assert.Zero(t, m.CrowdBonus(), "out at the window tick")
	assert.True(t, m.HasThreat(passer.Basic().ID()), "L7: the row stays on the table")
}

func TestCrowd_ResetClears(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, _ := crowdedMob(3)
	require.NotZero(t, m.CrowdBonus())

	m.resetAggro()
	assert.Zero(t, m.CrowdBonus())
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCrowd)
}

// Q4 (PO 2026-11-28): healer threat is a threat write, so a healer counts.
func TestCrowd_HealerCounts(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m := newTestMob()
	m.SetPosition(phy.Vec2f{})
	hitter, healer := crowdPlayer(), crowdPlayer()
	m.NoteThreat(hitter, 10)
	m.NoteThreat(healer, 3) // the healer-threat seam (§6.3)
	m.Update(0)

	assert.InDelta(t, 0.25, m.CrowdBonus(), 1e-6)
}

func TestCrowd_BitFollowsTheBonus(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, players := crowdedMob(2)
	assert.NotZero(t, m.AppliedEffects()&skills.AppliedEffectCrowd)

	players[1].vs.Health = 0
	m.Update(0)
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCrowd)
}

// Version A: the keys absent, nothing counts and nothing changes.
func TestCrowd_AbsentKeysAreNeutral(t *testing.T) {
	SetCrowd(0, 0, 0)
	m, _ := crowdedMob(5)

	assert.Zero(t, m.CrowdBonus())
	assert.Equal(t, float32(1), m.crowdTakenFactor())
	per, capAt, window := Crowd()
	assert.Zero(t, per)
	assert.Zero(t, capAt)
	assert.Equal(t, defaultCrowdWindow, window, "a zero window reads as the default")
}

// Same set as D2: a player's companion and a friendly NPC never scale.
func TestCrowd_OutsideTheHostileSetNeverScales(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	def := testMobDefinition()
	def.FriendlyToPlayers = true
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{})
	for i := 0; i < 3; i++ {
		m.NoteThreat(crowdPlayer(), 10)
	}
	m.Update(0)

	assert.Zero(t, m.CrowdBonus())
}

// The recount runs per mob per tick on the live world (the idle-loop
// discipline, project_idle_alloc_fix): it must not allocate.
func TestCrowd_RecountAllocatesNothing(t *testing.T) {
	withCrowd(t, 0.25, 1, testCrowdWindow)
	m, players := crowdedMob(3)

	allocs := testing.AllocsPerRun(50, func() {
		m.NoteThreat(players[0], 1)
		m.tickCrowd()
	})
	assert.Zero(t, allocs)
}
