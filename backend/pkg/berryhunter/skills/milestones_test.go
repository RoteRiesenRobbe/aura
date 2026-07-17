package skills

import (
	"os"
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

// Pins the embedded milestone table — first cut of the content-pass rewrite
// (plan-content-zones12.md §13 C1, all levels [PLACEHOLDER], final in C8):
// only skills the plan keeps as milestones remain. Everything reassigned to
// drops/teachings is out (Recall → Farmer, Swift → Wolf, Light → Kobold,
// NovaBurst → Elite Bandit, SummonCompanion → Dog NPC, Taunt → Horde,
// SummonTotem/Fade → TBD §11), and the fire skills are de-fired (tone rule).
// Resolves against the real content in api/skills so a renamed skill fails
// here, not at boot.
func TestDefaultMilestoneUnlocks_PinnedTable(t *testing.T) {
	r, err := RegistryFromFS(os.DirFS("../../../../api/skills"))
	require.NoError(t, err)

	unlocks, err := DefaultMilestoneUnlocks(r)
	require.NoError(t, err)

	got := map[string]uint32{}
	for _, u := range unlocks {
		got[u.Skill.Name] = u.Level
	}
	assert.Equal(t, map[string]uint32{
		"HealAura": 2,
		"Heal":     2,
		"Recover":  3,
		"Haste":    4,
	}, got)
}
