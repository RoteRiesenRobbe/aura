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

// --- CT3: the max-Focus rest buff (R17, L3) ---------------------------------------

const campFocusBuffID skills.SkillID = 182

func TestCampFocusBuff_RaisesTheMaximumOnlyAndExpiryClampsToTheNewMaximum(t *testing.T) {
	p := newCampPlayer(nil)
	p.config.BaseHealth = 1000
	p.isGod = true // keep regen out: the clamp sits above the GOD gate
	p.VitalSigns().Health = 1000
	require.Equal(t, 1000, int(p.MaxHealth()))

	p.ApplyStat(campFocusBuffID, skills.StatMaxHealth, 0.05, 3)

	assert.Equal(t, 1050, int(p.MaxHealth()), "L3: the pool reads the timed buff")
	p.Update(0)
	assert.Equal(t, 1000, int(p.VitalSigns().Health), "R17: gaining raises the maximum only")

	p.VitalSigns().Health = 1050 // rested up into the new room
	for range 3 {
		p.buffs.Tick()
	}
	assert.Equal(t, 1000, int(p.MaxHealth()), "the buff expired")
	p.Update(0)
	assert.Equal(t, 1000, int(p.VitalSigns().Health), "R17: expiry clamps current Focus to the new maximum")
}

func TestCampFocusBuff_ExpiryNeverKills(t *testing.T) {
	p := newCampPlayer(nil)
	p.config.BaseHealth = 1000
	p.isGod = true
	p.ApplyStat(campFocusBuffID, skills.StatMaxHealth, 0.05, 1)
	p.VitalSigns().Health = 1

	p.buffs.Tick()
	p.Update(0)

	assert.Equal(t, 1, int(p.VitalSigns().Health), "R17: never below 1")
}

// The tray reports a rest buff at the level it was GRANTED at (the camp
// owner's), so a stranger's tooltip shows the real strength, not their own.
func TestOwnEffects_ACampTraitCircleCarriesItsGrantedLevel(t *testing.T) {
	p := newCampPlayer(nil)
	damageBuff := &skills.SkillDefinition{ID: 183, Name: "CampDamageBuff", Category: skills.SkillCategoryCamp, MaxLevel: 15,
		CampTrait: &skills.CampTraitDef{Kind: skills.CampTraitBuff, Stat: skills.StatDamageDealt, PerLevel: 0.0033}}
	ability := &skills.SkillDefinition{ID: 77, Name: "Bulwark", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	p.skillDefs = newStubRegistry(damageBuff, ability)

	p.ApplyStat(damageBuff.ID, skills.StatDamageDealt, 0.0033*5, 100) // a level-5 camp
	p.ApplyStat(ability.ID, skills.StatDamageReduction, 0.2, 100)

	got := p.OwnEffects()

	require.Len(t, got, 2)
	assert.Equal(t, 0, got[0].Level, "an ability circle leaves the level to the viewer's spellbook")
	assert.Equal(t, 5, got[1].Level, "the camp trait's granted level, whatever the viewer holds")
}
