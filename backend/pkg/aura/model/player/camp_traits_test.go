package player

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Campfire traits CT1 (docs/plan-campfire-traits.md D3, D8, R22, R23).

var (
	defCampCharges = &skills.SkillDefinition{ID: 181, Name: "CampCharges", Category: skills.SkillCategoryCamp, MaxLevel: 5,
		CampTrait: &skills.CampTraitDef{Kind: skills.CampTraitCharges, PerLevel: 1}}
	defCampHeal = &skills.SkillDefinition{ID: 180, Name: "CampHeal", Category: skills.SkillCategoryCamp, MaxLevel: 15,
		CampTrait: &skills.CampTraitDef{Kind: skills.CampTraitHeal, PerLevel: 1}}
)

func newCampPlayer(milestones []skills.MilestoneUnlock) *player {
	p := newTestPlayer(milestones)
	p.skillDefs = newStubRegistry(defDamageAura, defHealAura, defHarvest, defCampCharges, defCampHeal)
	return p
}

func TestCampPoints_ThePoolIsTheDiscoveredCount(t *testing.T) {
	p := newCampPlayer(nil)
	assert.Equal(t, 0, p.AvailableCampPoints())

	p.NoteCampfireState("fire-a", []string{"fire-a", "fire-b", "fire-c"})
	assert.Equal(t, 3, p.AvailableCampPoints())

	p.ResetTickNumbers()
	assert.Equal(t, 3, p.AvailableCampPoints(), "the count outlives the per-tick publish (player.go ResetTickNumbers)")

	require.True(t, p.skills.RaiseCampTrait(defCampHeal))
	require.True(t, p.skills.RaiseCampTrait(defCampHeal))
	assert.Equal(t, 1, p.AvailableCampPoints())
}

func TestCampPoints_AbilityPointsNeverSeeATrait(t *testing.T) {
	p := newCampPlayer(nil)
	p.config.SkillPointsPerLevel = 1
	p.progression.Level = 3
	p.NoteCampfireState("", []string{"fire-a"})
	before := p.AvailableSkillPoints()

	require.True(t, p.skills.RaiseCampTrait(defCampHeal))

	assert.Equal(t, before, p.AvailableSkillPoints())
	assert.Equal(t, 0, p.AvailableCampPoints())
}

func TestCampTraitFloor_ABloodlineGrantIsAFreeLevel(t *testing.T) {
	p := newCampPlayer(nil)
	assert.Equal(t, 0, p.CampTraitFloor(defCampHeal.ID))

	p.SetBloodlineUnlocks([]string{"CampHeal"})
	p.skills.Discover(defCampHeal.ID) // what seedBloodlineUnlocks does at join

	assert.Equal(t, 1, p.CampTraitFloor(defCampHeal.ID))
	assert.Equal(t, 0, p.AvailableCampPoints(), "a granted level 1 costs nothing (no fires, no debt)")
	assert.Equal(t, 0, p.skills.CampSpentPoints(p.skillDefs, p.CampTraitFloor))
	assert.Equal(t, 0, p.CampTraitFloor(defCampCharges.ID), "only the granted trait")
}

func TestCampTraitFloor_AMilestoneGrantCountsFromItsLevel(t *testing.T) {
	p := newCampPlayer([]skills.MilestoneUnlock{{Level: 5, Skill: defCampHeal}})
	p.progression.Level = 4
	assert.Equal(t, 0, p.CampTraitFloor(defCampHeal.ID), "not reached yet")

	p.progression.Level = 5
	assert.Equal(t, 1, p.CampTraitFloor(defCampHeal.ID))
}

func TestCampTraitFloor_AnAbilityHasNone(t *testing.T) {
	p := newCampPlayer([]skills.MilestoneUnlock{{Level: 1, Skill: defDamageAura}})
	p.SetBloodlineUnlocks([]string{"Damage"})
	assert.Equal(t, 0, p.CampTraitFloor(defDamageAura.ID))
}

func TestCampCharges_TheTraitRaisesTheOwnersCap(t *testing.T) {
	p := newCampPlayer(nil)
	base := skills.CampChargeCap(int(p.progression.Level))

	p.RefillCampCharges()
	assert.Equal(t, base, p.CampCharges())

	require.True(t, p.skills.RaiseCampTrait(defCampCharges))
	require.True(t, p.skills.RaiseCampTrait(defCampCharges))
	assert.Equal(t, base+2, p.CampChargeCap())
	p.RefillCampCharges()
	assert.Equal(t, base+2, p.CampCharges(), "the refill fills to the raised cap")

	p.SetCampCharges(99)
	assert.Equal(t, base+2, p.CampCharges(), "the reconnect clamp reads the same cap")
}

var _ model.PlayerEntity = (*player)(nil)
