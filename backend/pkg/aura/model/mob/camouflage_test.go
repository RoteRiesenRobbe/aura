package mob

// Camouflage (content-zone-7-swamp.md E2): a species that authors
// factors.camouflage wears the Camouflage bit in its applied_effects while it
// sits at its spawn point out of combat, so the client draws it faint. Visual
// only: nothing here touches targeting or damage.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
)

func camouflagedMob() *Mob {
	def := testMobDefinition()
	def.Factors.Camouflage = true
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 10, Y: 10})
	return m
}

func hasCamouflage(m *Mob) bool {
	return m.AppliedEffects()&skills.AppliedEffectCamouflage != 0
}

func TestCamouflage_AtItsSpawnPointOutOfCombat(t *testing.T) {
	assert.True(t, hasCamouflage(camouflagedMob()))
}

func TestCamouflage_OnlyForASpeciesThatAuthorsIt(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 10, Y: 10})
	assert.False(t, hasCamouflage(m))
}

func TestCamouflage_RevealedOnLeavingItsSpawnPoint(t *testing.T) {
	m := camouflagedMob()
	m.SetPosition(phy.Vec2f{X: 10 + camouflageHomeRadius/2, Y: 10})
	assert.True(t, hasCamouflage(m), "a shuffle inside the home radius keeps it")
	m.SetPosition(phy.Vec2f{X: 10 + camouflageHomeRadius*2, Y: 10})
	assert.False(t, hasCamouflage(m), "away from home it is revealed")
	m.SetPosition(phy.Vec2f{X: 10, Y: 10})
	assert.True(t, hasCamouflage(m), "and hides again once home")
}

func TestCamouflage_RevealedInCombat(t *testing.T) {
	m := camouflagedMob()
	m.inCombatTicks = 30
	assert.False(t, hasCamouflage(m), "struck or engaged, it shows itself")
	m.inCombatTicks = 0
	assert.True(t, hasCamouflage(m))
}

func TestCamouflage_KeepsTheBuffBits(t *testing.T) {
	m := camouflagedMob()
	m.ApplySlow(skills.SkillID(65), 0.5, 100)
	mask := m.AppliedEffects()
	assert.NotZero(t, mask&skills.AppliedEffectSlow)
	assert.NotZero(t, mask&skills.AppliedEffectCamouflage)
}
