package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Campfire traits CT1 (docs/plan-campfire-traits.md D2): a trait is a skill of
// the `camp` category carrying a campTrait block and no effects.

func campTraitJSON(trait string) []byte {
	return []byte(`{"id": 900, "name": "CampTest", "category": "camp", "maxLevel": 15,
		"campTrait": ` + trait + `, "effects": []}`)
}

func mapCampJSON(t *testing.T, data []byte) (*SkillDefinition, error) {
	t.Helper()
	raw, err := parseSkillDefinition(data)
	require.NoError(t, err)
	return raw.mapToSkillDefinition(nil)
}

func TestCampTrait_ParsesEachKind(t *testing.T) {
	cases := []struct {
		trait string
		kind  CampTraitKind
		stat  string
	}{
		{`{"kind": "duration", "perLevel": 30}`, CampTraitDuration, ""},
		{`{"kind": "heal", "perLevel": 1}`, CampTraitHeal, ""},
		{`{"kind": "charges", "perLevel": 1}`, CampTraitCharges, ""},
		{`{"kind": "buff", "stat": "maxHealth", "perLevel": 0.0033}`, CampTraitBuff, StatMaxHealth},
		{`{"kind": "buff", "stat": "damageDealt", "perLevel": 0.0033}`, CampTraitBuff, StatDamageDealt},
		{`{"kind": "buff", "stat": "movementSpeed", "perLevel": 0.0033}`, CampTraitBuff, StatMovementSpeed},
	}
	for _, c := range cases {
		def, err := mapCampJSON(t, campTraitJSON(c.trait))
		require.NoError(t, err, c.trait)
		assert.Equal(t, SkillCategoryCamp, def.Category)
		require.NotNil(t, def.CampTrait, c.trait)
		assert.Equal(t, c.kind, def.CampTrait.Kind)
		assert.Equal(t, c.stat, def.CampTrait.Stat)
		assert.True(t, def.IsCampTrait())
	}
}

func TestCampTrait_LoaderRefuses(t *testing.T) {
	cases := map[string][]byte{
		"unknown kind":                campTraitJSON(`{"kind": "radius", "perLevel": 1}`),
		"buff stat outside the three": campTraitJSON(`{"kind": "buff", "stat": "critChance", "perLevel": 0.01}`),
		"buff without a stat":         campTraitJSON(`{"kind": "buff", "perLevel": 0.01}`),
		"stat on a non-buff":          campTraitJSON(`{"kind": "heal", "stat": "maxHealth", "perLevel": 1}`),
		"no perLevel":                 campTraitJSON(`{"kind": "duration"}`),
		"camp without the block":      []byte(`{"id": 900, "name": "CampTest", "category": "camp", "maxLevel": 15, "effects": []}`),
		"block on another category": []byte(`{"id": 900, "name": "CampTest", "category": "passive", "maxLevel": 5,
			"campTrait": {"kind": "heal", "perLevel": 1}, "effects": []}`),
		"an effect on a trait": []byte(`{"id": 900, "name": "CampTest", "category": "camp", "maxLevel": 5,
			"campTrait": {"kind": "heal", "perLevel": 1},
			"effects": [{"type": "stat_multiplier", "stat": "maxHealth", "statBonus": 0.1}]}`),
	}
	for name, data := range cases {
		_, err := mapCampJSON(t, data)
		assert.Error(t, err, name)
	}
}

// The catalog serves the category by name, so the client can tell a trait apart.
func TestCampTrait_CategoryMarshalsByName(t *testing.T) {
	b, err := SkillCategoryCamp.MarshalJSON()
	require.NoError(t, err)
	assert.Equal(t, `"camp"`, string(b))
}

// --- The spellbook side (D3, D5, R21, R22) ---

var (
	campHeal = &SkillDefinition{ID: 901, Name: "CampHeal", Category: SkillCategoryCamp, MaxLevel: 3,
		CampTrait: &CampTraitDef{Kind: CampTraitHeal, PerLevel: 1}}
	campDuration = &SkillDefinition{ID: 902, Name: "CampDuration", Category: SkillCategoryCamp, MaxLevel: 15,
		CampTrait: &CampTraitDef{Kind: CampTraitDuration, PerLevel: 30}}
)

func campDefs() defRegistry {
	return defRegistry{testDef.ID: testDef, campHeal.ID: campHeal, campDuration.ID: campDuration}
}

func noFloor(SkillID) int { return 0 }

func TestCampTrait_RaiseFromZeroAndLowerToZeroRemovesTheEntry(t *testing.T) {
	sc := NewSkillComponent(true)

	require.True(t, sc.RaiseCampTrait(campHeal), "level 1 is bought, not free (L2)")
	assert.Equal(t, 1, sc.SkillLevel(campHeal.ID))
	require.True(t, sc.RaiseCampTrait(campHeal))
	require.True(t, sc.RaiseCampTrait(campHeal))
	assert.False(t, sc.RaiseCampTrait(campHeal), "capped at maxLevel")

	require.True(t, sc.LowerCampTrait(campHeal, 0))
	require.True(t, sc.LowerCampTrait(campHeal, 0))
	require.True(t, sc.LowerCampTrait(campHeal, 0))
	_, present := sc.Spellbook[campHeal.ID]
	assert.False(t, present, "level 0 is no entry, so nothing ships or persists at 0")
	assert.False(t, sc.LowerCampTrait(campHeal, 0), "nothing below 0")
}

func TestCampTrait_ARaiseOrLowerBumpsTheRevision(t *testing.T) {
	sc := NewSkillComponent(true)
	r0 := sc.Revision()
	require.True(t, sc.RaiseCampTrait(campHeal))
	r1 := sc.Revision()
	assert.NotEqual(t, r0, r1)
	require.True(t, sc.LowerCampTrait(campHeal, 0))
	assert.NotEqual(t, r1, sc.Revision(), "the delete must reach the wire too")
}

func TestCampTrait_TheFreeFloorHoldsAndCostsNothing(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.Discover(campHeal.ID) // a grant (R22): level 1
	floor := func(id SkillID) int {
		if id == campHeal.ID {
			return 1
		}
		return 0
	}

	assert.Equal(t, 0, sc.CampSpentPoints(campDefs(), floor), "the granted level is free")
	assert.False(t, sc.LowerCampTrait(campHeal, 1), "no respec takes a granted trait below 1")
	require.True(t, sc.RaiseCampTrait(campHeal))
	assert.Equal(t, 1, sc.CampSpentPoints(campDefs(), floor), "levels above the floor cost 1 each")
}

func TestCampTrait_ThePoolsNeverMix(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.Discover(testDef.ID)
	require.True(t, sc.RaiseSkillLevel(testDef)) // ability L2 = 1 skill point
	for range 4 {
		require.True(t, sc.RaiseCampTrait(campDuration)) // 4 campfire points
	}

	assert.Equal(t, 1, sc.SpentPoints(campDefs()), "ability points never see a trait")
	assert.Equal(t, 4, sc.CampSpentPoints(campDefs(), noFloor), "campfire points never see an ability")
}

func TestCampTrait_ResetAllLeavesTraitsAlone(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.Discover(testDef.ID)
	require.True(t, sc.RaiseSkillLevel(testDef))
	for range 3 {
		require.True(t, sc.RaiseCampTrait(campDuration))
	}

	sc.ResetSkillLevels(campDefs())

	assert.Equal(t, 1, sc.SkillLevel(testDef.ID))
	assert.Equal(t, 3, sc.SkillLevel(campDuration.ID), "R21: reset all skips the camp category")
}

func TestCampTrait_TheCampResetLowersEveryTraitToItsFloor(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.Discover(testDef.ID)
	require.True(t, sc.RaiseSkillLevel(testDef))
	sc.Discover(campHeal.ID) // granted
	require.True(t, sc.RaiseCampTrait(campHeal))
	for range 3 {
		require.True(t, sc.RaiseCampTrait(campDuration))
	}
	floor := func(id SkillID) int {
		if id == campHeal.ID {
			return 1
		}
		return 0
	}

	sc.ResetCampTraits(campDefs(), floor)

	assert.Equal(t, 1, sc.SkillLevel(campHeal.ID), "a granted trait keeps its free level")
	_, present := sc.Spellbook[campDuration.ID]
	assert.False(t, present, "a bought trait goes back to no entry")
	assert.Equal(t, 2, sc.SkillLevel(testDef.ID), "abilities are untouched")
}

func TestCampTrait_TotalSumsEveryTraitOfAKind(t *testing.T) {
	sc := NewSkillComponent(true)
	for range 4 {
		require.True(t, sc.RaiseCampTrait(campDuration))
	}
	require.True(t, sc.RaiseCampTrait(campHeal))

	assert.InDelta(t, 120, sc.CampTraitTotal(campDefs(), CampTraitDuration), 1e-6)
	assert.InDelta(t, 1, sc.CampTraitTotal(campDefs(), CampTraitHeal), 1e-6)
	assert.Zero(t, sc.CampTraitTotal(campDefs(), CampTraitCharges))
	assert.Zero(t, NewSkillComponent(false).CampTraitTotal(campDefs(), CampTraitHeal), "a mob has none")
}
