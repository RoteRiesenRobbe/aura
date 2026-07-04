package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustSkill(t *testing.T, sr Registry, name string) *SkillDefinition {
	t.Helper()
	def, err := sr.GetByName(name)
	require.NoError(t, err)
	return def
}

// spellbookWith builds a player SkillComponent with the given skills at the
// given levels, writing the spellbook directly (bypassing point checks).
func spellbookWith(t *testing.T, sr Registry, levels map[string]int) *SkillComponent {
	t.Helper()
	sc := NewSkillComponent(true)
	for name, lvl := range levels {
		sc.Spellbook[mustSkill(t, sr, name).ID] = lvl
	}
	return sc
}

func ing(def *SkillDefinition, level int) RecipeIngredient {
	return RecipeIngredient{Skill: def, Level: level}
}

func recipesOf(recs ...*RecipeDefinition) RecipeRegistry {
	return &recipeRegistry{recipes: recs}
}

func TestApplyRecipes_TriggerOnDiscovery(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	swift := mustSkill(t, sr, "SwiftPassive")
	heal := mustSkill(t, sr, "HealAura")

	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 3, "SwiftPassive": 2})
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 3), ing(swift, 2)}})

	unlocked := ApplyRecipes(sc, recs)
	assert.Equal(t, []SkillID{heal.ID}, unlocked)
	assert.True(t, sc.HasDiscovered(heal.ID))
	assert.Equal(t, 1, sc.SkillLevel(heal.ID), "result unlocks at level 1")
}

func TestApplyRecipes_ThresholdNotMet(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	swift := mustSkill(t, sr, "SwiftPassive")
	heal := mustSkill(t, sr, "HealAura")

	// DamageAura only at 2 — below the required 3.
	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 2, "SwiftPassive": 2})
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 3), ing(swift, 2)}})

	assert.Nil(t, ApplyRecipes(sc, recs))
	assert.False(t, sc.HasDiscovered(heal.ID))
}

func TestApplyRecipes_GreaterOrEqual(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")

	// Over-leveled ingredient must still satisfy (>=), never lock out.
	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 5})
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 3)}})

	assert.Equal(t, []SkillID{heal.ID}, ApplyRecipes(sc, recs))
}

// A player can drop below a threshold and re-approach until the recipe fires
// once; simulates the "trigger on level raise" call site (no missed window).
func TestApplyRecipes_TriggerOnRaise(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")

	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 2})
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 3)}})

	assert.Nil(t, ApplyRecipes(sc, recs), "not yet at threshold")

	sc.Spellbook[dmg.ID] = 3 // the raise
	assert.Equal(t, []SkillID{heal.ID}, ApplyRecipes(sc, recs))
}

func TestApplyRecipes_Idempotent(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")

	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 3})
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 3)}})

	assert.Equal(t, []SkillID{heal.ID}, ApplyRecipes(sc, recs))
	assert.Nil(t, ApplyRecipes(sc, recs), "already discovered — no re-fire")
}

// A result unlocking at level 1 satisfies a chain recipe on the next pass.
func TestApplyRecipes_ChainCascade(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")
	swift := mustSkill(t, sr, "SwiftPassive")

	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 2})
	recs := recipesOf(
		&RecipeDefinition{ID: 1, Result: heal, Ingredients: []RecipeIngredient{ing(dmg, 2)}},
		&RecipeDefinition{ID: 2, Result: swift, Ingredients: []RecipeIngredient{ing(heal, 1)}},
	)

	unlocked := ApplyRecipes(sc, recs)
	assert.ElementsMatch(t, []SkillID{heal.ID, swift.ID}, unlocked)
	assert.True(t, sc.HasDiscovered(swift.ID))
}

// Cyclic recipes must terminate and never double-discover.
func TestApplyRecipes_CycleTerminates(t *testing.T) {
	sr := testSkillRegistry(t)
	heal := mustSkill(t, sr, "HealAura")
	swift := mustSkill(t, sr, "SwiftPassive")

	// A: HealAura@1 -> SwiftPassive ; B: SwiftPassive@1 -> HealAura (a cycle).
	recs := recipesOf(
		&RecipeDefinition{ID: 1, Result: swift, Ingredients: []RecipeIngredient{ing(heal, 1)}},
		&RecipeDefinition{ID: 2, Result: heal, Ingredients: []RecipeIngredient{ing(swift, 1)}},
	)

	sc := spellbookWith(t, sr, map[string]int{"HealAura": 1})
	unlocked := ApplyRecipes(sc, recs) // must return, not hang
	assert.Equal(t, []SkillID{swift.ID}, unlocked)
	assert.True(t, sc.HasDiscovered(swift.ID))
}

func TestApplyRecipes_TwoRecipesSameIngredientsBothFire(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")
	swift := mustSkill(t, sr, "SwiftPassive")

	sc := spellbookWith(t, sr, map[string]int{"DamageAura": 2})
	recs := recipesOf(
		&RecipeDefinition{ID: 1, Result: heal, Ingredients: []RecipeIngredient{ing(dmg, 2)}},
		&RecipeDefinition{ID: 2, Result: swift, Ingredients: []RecipeIngredient{ing(dmg, 2)}},
	)

	unlocked := ApplyRecipes(sc, recs)
	assert.ElementsMatch(t, []SkillID{heal.ID, swift.ID}, unlocked)
}

func TestApplyRecipes_NilSpellbookMob(t *testing.T) {
	sr := testSkillRegistry(t)
	dmg := mustSkill(t, sr, "DamageAura")
	heal := mustSkill(t, sr, "HealAura")

	sc := NewSkillComponent(false) // mob: nil spellbook
	recs := recipesOf(&RecipeDefinition{ID: 1, Result: heal,
		Ingredients: []RecipeIngredient{ing(dmg, 1)}})

	assert.Nil(t, ApplyRecipes(sc, recs))
}
