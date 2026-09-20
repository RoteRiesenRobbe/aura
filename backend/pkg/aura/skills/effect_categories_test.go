package skills

import (
	"fmt"
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The category rule (plan-content-editor.md §B12 C3 rider, PO 2026-09-12).
//
// The finding: a stat_multiplier authored on an ACTIVE AURA loads fine and
// does nothing at runtime - the aura tick dispatcher (sys.applyAuraEffect)
// handles eight types and drops the rest, and recomputeDerived sums stat
// bonuses over PASSIVE slots only. Until effectCategories existed the legality
// of a type per category lived only inside those switch statements, so the
// mistake was invisible everywhere: at boot, in `aurad -validate`, and in the
// editor's flat alphabetical type picker.

// (a) Every authorable effect type must be placed. A new type reddens here
// until its category is decided, which is the whole point: the dispatchers
// that would otherwise answer the question are three files away.
func TestEffectCategories_CoversEveryEffectType(t *testing.T) {
	for name, effectType := range effectTypeMap {
		categories, ok := effectCategories[effectType]
		assert.True(t, ok && len(categories) > 0,
			"effect type %q has no effectCategories entry - decide which skill categories can author it (the dispatcher that reads it says which) before it ships", name)
	}
	assert.NotContains(t, effectCategories, EffectTypeNone, "EffectTypeNone is not authorable and needs no entry")
	assert.Len(t, effectCategories, len(effectTypeMap), "effectCategories and effectTypeMap describe different sets of types - one of them names something the other does not")
}

// (b) The other direction: a typo'd category would silently make a type legal
// nowhere (or everywhere, read wrongly).
func TestEffectCategories_NamesOnlyRealCategories(t *testing.T) {
	live := make([]SkillCategory, 0, len(skillCategoryMap))
	for _, c := range skillCategoryMap {
		live = append(live, c)
	}
	for effectType, categories := range effectCategories {
		for _, c := range categories {
			assert.Contains(t, live, c, "effect type %v is placed on a category that is not in skillCategoryMap", effectType)
		}
		assert.NotEmpty(t, categories, "effect type %v has an empty category list", effectType)
	}
}

// (c) The refusal itself, on the two mistakes that motivated the rule: a
// passive-only effect on an aura (the PO's own), and an aura-only effect on a
// cooldown (the same mistake read the other way).
func TestMap_EffectTypeIllegalForCategoryIsRefused(t *testing.T) {
	cases := []struct {
		name     string
		category string
		effect   string
		names    string
	}{
		{"stat_multiplier on an aura", "active_aura", `{"type":"stat_multiplier","stat":"maxHealth","statBonus":0.1}`, "passive"},
		{"damage_aura on a cooldown", "cooldown", `{"type":"damage_aura","radius":1,"damageHP":5,"targetsEnemies":true}`, "active_aura"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := parseSkillDefinition([]byte(fmt.Sprintf(
				`{"id":1,"name":"X","category":%q,"maxLevel":1,"effects":[%s]}`, tc.category, tc.effect)))
			require.NoError(t, err)
			_, err = raw.mapToSkillDefinition(nil)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "legal on: "+tc.names, "the refusal must name where the effect DOES belong")
			assert.Contains(t, err.Error(), tc.category, "the refusal must name the category authored")
		})
	}
}

// (d) light_aura is the one type two categories share: an aura emits light
// while it is the active one, and an equipped passive (OmniPassive, Torch)
// glows alongside whatever aura holds the single active slot
// (SkillComponent.LightRadius walks both).
func TestMap_LightAuraIsLegalOnAurasAndPassives(t *testing.T) {
	for _, category := range []string{"active_aura", "passive"} {
		raw, err := parseSkillDefinition([]byte(fmt.Sprintf(
			`{"id":1,"name":"X","category":%q,"maxLevel":1,"effects":[{"type":"light_aura","radius":3}]}`, category)))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.NoError(t, err, "light_aura must load on a %s skill", category)
	}
	require.False(t, slices.Contains(effectCategories[EffectTypeLightAura], SkillCategoryCooldown),
		"light_aura on a cooldown would emit nothing: the radius is read per EQUIPPED skill, not per cast")
}
