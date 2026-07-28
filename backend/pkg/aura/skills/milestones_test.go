package skills

import (
	"os"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	defHeal = &SkillDefinition{ID: 2, Name: "Heal", Category: SkillCategoryActiveAura, MaxLevel: 5}
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
	data := []byte(`[{"level":2,"skillName":"Heal"}]`)
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

func TestMilestoneUnlocksFromFS_MissingFile(t *testing.T) {
	_, err := MilestoneUnlocksFromFS(fstest.MapFS{}, stubReg())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "milestone-unlocks")
}

// Pins the authored milestone table in api/milestones/. The C8 milestone settlement
// (plan-content-zones12.md §13 C8, PO 2026-07-19) fixed milestones as the rare
// guaranteed beats and pushed everything else into the world. FirstAid left the
// table on 2026-07-21 (PO): the village Hermit now teaches it at L2 — earlier
// than the L3 milestone granted it — so the milestone was dead weight and Haste
// (first cooldown) is the only guaranteed beat left.
// Resolves against the real content in api/skills so a renamed skill fails
// here, not at boot.
func TestMilestoneUnlocksFromFS_PinnedTable(t *testing.T) {
	r, err := RegistryFromFS(os.DirFS("../../../../api/skills"), realFactions(t))
	require.NoError(t, err)

	unlocks, err := MilestoneUnlocksFromFS(os.DirFS("../../../../api/milestones"), r)
	require.NoError(t, err)

	got := map[string]uint32{}
	for _, u := range unlocks {
		got[u.Skill.Name] = u.Level
	}
	assert.Equal(t, map[string]uint32{
		"Haste": 7,
	}, got)
}

// realFactions loads the repo faction registry. Skills resolve their authored
// targetFactions allowlist against it at load (plan-faction-flips D8), so any
// test that parses REAL api/skills content needs the real names available —
// nil is only safe for fixtures that author no allowlist.
func realFactions(t *testing.T) factions.Registry {
	t.Helper()
	r, err := factions.RegistryFromFS(os.DirFS("../../../../api/factions"))
	require.NoError(t, err)
	return r
}
