package player

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// stubRegistry implements skills.Registry for tests.
type stubRegistry struct {
	byName map[string]*skills.SkillDefinition
}

func newStubRegistry(defs ...*skills.SkillDefinition) *stubRegistry {
	r := &stubRegistry{byName: make(map[string]*skills.SkillDefinition)}
	for _, d := range defs {
		r.byName[d.Name] = d
	}
	return r
}

func (r *stubRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	for _, d := range r.byName {
		if d.ID == id {
			return d, nil
		}
	}
	return nil, fmt.Errorf("skill ID %d not found", id)
}

func (r *stubRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	d, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("skill %q not found", name)
	}
	return d, nil
}

func (r *stubRegistry) All() []*skills.SkillDefinition {
	result := make([]*skills.SkillDefinition, 0, len(r.byName))
	for _, d := range r.byName {
		result = append(result, d)
	}
	return result
}

var (
	defDamageAura = &skills.SkillDefinition{ID: 1, Name: "DamageAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
)

func TestInitializePlayerSkills_SlotsAndSpellbook(t *testing.T) {
	r := newStubRegistry(defDamageAura)
	sc, err := initializePlayerSkills(r)
	require.NoError(t, err)

	require.NotNil(t, sc.AuraSlots[0], "slot 0 must be populated")
	assert.Equal(t, "DamageAura", sc.AuraSlots[0].Def.Name)
	assert.Equal(t, 1, sc.AuraSlots[0].Level)

	assert.Nil(t, sc.AuraSlots[1], "slot 1 must be empty — HealAura not yet unlocked")

	assert.Equal(t, 0, sc.ActiveAuraSlot)

	assert.True(t, sc.HasDiscovered(defDamageAura.ID), "DamageAura must be in spellbook")
}

func TestInitializePlayerSkills_MissingDamageAura(t *testing.T) {
	r := newStubRegistry() // DamageAura absent
	_, err := initializePlayerSkills(r)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DamageAura")
}

// --- milestone unlock tests ---

var defHealAura = &skills.SkillDefinition{ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

// newTestPlayer builds a minimal *player for unit-testing AddExperience.
// LevelUpXPBase=100, LevelUpXPGrowthFactor=2.0 means:
//
//	level 1→2 costs 100 XP, level 2→3 costs 200 XP.
func newTestPlayer(milestones []skills.MilestoneUnlock) *player {
	r := newStubRegistry(defDamageAura, defHealAura)
	sc, _ := initializePlayerSkills(r)
	return &player{
		progression:      model.PlayerProgression{Level: 1},
		config:           &cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0},
		skills:           sc,
		milestoneUnlocks: milestones,
		PlayerVitalSigns: model.PlayerVitalSigns{Health: vitals.Max},
	}
}

func TestAddExperience_Level2_DiscoversHealAura(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(100) // exactly enough for level 2

	assert.Equal(t, uint32(2), p.progression.Level)
	assert.True(t, p.skills.HasDiscovered(defHealAura.ID), "HealAura must be discovered at level 2")
}

func TestAddExperience_Level3_NoMilestoneEntry(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(300) // enough for level 3 (100 + 200)

	assert.Equal(t, uint32(3), p.progression.Level)
	// spellbook: DamageAura (from init) + HealAura (level-2 unlock) — nothing more
	assert.Len(t, p.skills.Discovered(), 2)
}

func TestAddExperience_DiscoverIdempotent(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(100) // reaches level 2, fires unlock
	p.AddExperience(50)  // stays at level 2, no new level-up

	assert.Equal(t, uint32(2), p.progression.Level)
	assert.Len(t, p.skills.Discovered(), 2, "spellbook must not grow on second XP grant at same level")
}

