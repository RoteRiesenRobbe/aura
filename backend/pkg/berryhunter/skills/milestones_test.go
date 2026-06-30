package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	defHeal = &SkillDefinition{ID: 2, Name: "HealAura", Category: SkillCategoryActiveAura, MaxLevel: 5}
)

func stubReg(defs ...*SkillDefinition) Registry {
	r := &registry{
		byID:   make(map[SkillID]*SkillDefinition),
		byName: make(map[string]*SkillDefinition),
	}
	for _, d := range defs {
		r.byID[d.ID] = d
		r.byName[d.Name] = d
	}
	return r
}

func TestMilestoneUnlocksFromJSON_Valid(t *testing.T) {
	data := []byte(`[{"level":2,"skillName":"HealAura"}]`)
	r := stubReg(defHeal)

	unlocks, err := milestoneUnlocksFromJSON(data, r)
	require.NoError(t, err)
	require.Len(t, unlocks, 1)
	assert.Equal(t, uint32(2), unlocks[0].Level)
	assert.Equal(t, defHeal, unlocks[0].Skill)
}

func TestMilestoneUnlocksFromJSON_Empty(t *testing.T) {
	data := []byte(`[]`)
	r := stubReg()

	unlocks, err := milestoneUnlocksFromJSON(data, r)
	require.NoError(t, err)
	assert.Empty(t, unlocks)
}

func TestMilestoneUnlocksFromJSON_UnknownSkill(t *testing.T) {
	data := []byte(`[{"level":2,"skillName":"NoSuchSkill"}]`)
	r := stubReg()

	_, err := milestoneUnlocksFromJSON(data, r)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NoSuchSkill")
}

func TestMilestoneUnlocksFromJSON_InvalidJSON(t *testing.T) {
	_, err := milestoneUnlocksFromJSON([]byte(`not json`), stubReg())
	require.Error(t, err)
}
