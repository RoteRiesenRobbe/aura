package skills

import (
	"os"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testSkillRegistry builds a skill registry from the shared fixtures so recipe
// tests can resolve ingredient/result names. Damage (ID 1, maxLevel 5),
// Swift (ID 10, maxLevel 3), Heal (ID 2, maxLevel 5).
func testSkillRegistry(t *testing.T) Registry {
	t.Helper()
	fsys := fstest.MapFS{
		"damage.json":        {Data: damageAuraJSON},
		"heal.json":          {Data: healAuraJSON},
		"swift-passive.json": {Data: swiftPassiveJSON},
	}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)
	return r
}

var frostfireRecipeJSON = []byte(`{
  "id": 100,
  "result": "Heal",
  "ingredients": [
    { "skill": "Damage", "level": 3 },
    { "skill": "Swift", "level": 2 }
  ]
}`)

func TestRecipes_LoadsAndResolves(t *testing.T) {
	sr := testSkillRegistry(t)
	fsys := fstest.MapFS{"frostfire.json": {Data: frostfireRecipeJSON}}

	rr, err := RecipesFromFS(fsys, sr)
	require.NoError(t, err)
	require.Len(t, rr.All(), 1)

	rec := rr.All()[0]
	assert.Equal(t, RecipeID(100), rec.ID)
	assert.Equal(t, "Heal", rec.Result.Name)
	require.Len(t, rec.Ingredients, 2)
	assert.Equal(t, "Damage", rec.Ingredients[0].Skill.Name)
	assert.Equal(t, 3, rec.Ingredients[0].Level)
	assert.Equal(t, "Swift", rec.Ingredients[1].Skill.Name)
	assert.Equal(t, 2, rec.Ingredients[1].Level)
}

func TestRecipes_EmptyDirectory(t *testing.T) {
	rr, err := RecipesFromFS(fstest.MapFS{}, testSkillRegistry(t))
	require.NoError(t, err)
	assert.Empty(t, rr.All())
}

func TestRecipes_MalformedJSON(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{invalid`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_UnknownResult(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{
      "id": 1, "result": "NoSuchSkill",
      "ingredients": [{ "skill": "Damage", "level": 1 }]
    }`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_UnknownIngredient(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{
      "id": 1, "result": "Heal",
      "ingredients": [{ "skill": "NoSuchSkill", "level": 1 }]
    }`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_IngredientLevelTooHigh(t *testing.T) {
	// Damage maxLevel is 5.
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{
      "id": 1, "result": "Heal",
      "ingredients": [{ "skill": "Damage", "level": 6 }]
    }`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_IngredientLevelZero(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{
      "id": 1, "result": "Heal",
      "ingredients": [{ "skill": "Damage", "level": 0 }]
    }`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_EmptyIngredients(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{
      "id": 1, "result": "Heal", "ingredients": []
    }`)}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

func TestRecipes_DuplicateID(t *testing.T) {
	recA := []byte(`{"id": 5, "result": "Heal",
      "ingredients": [{ "skill": "Damage", "level": 1 }]}`)
	recB := []byte(`{"id": 5, "result": "Damage",
      "ingredients": [{ "skill": "Swift", "level": 1 }]}`)
	fsys := fstest.MapFS{"a.json": {Data: recA}, "b.json": {Data: recB}}
	_, err := RecipesFromFS(fsys, testSkillRegistry(t))
	assert.Error(t, err)
}

// Two recipes with the exact same ingredient set are allowed (both fire) — not
// a validation error, unlike duplicate IDs.
// TestRecipes_LoadsRealContent pins the shipped Phase 9 content: the real
// recipe JSONs resolve against the real skill registry, and the Paladin Aura
// combination (Damage L5 + Heal L5 -> Paladin) both loads and fires.
func TestRecipes_LoadsRealContent(t *testing.T) {
	sr, err := RegistryFromFS(os.DirFS("../../../../api/skills"))
	require.NoError(t, err)
	rr, err := RecipesFromFS(os.DirFS("../../../../api/recipes"), sr)
	require.NoError(t, err)
	require.NotEmpty(t, rr.All())

	paladin, err := sr.GetByName("Paladin")
	require.NoError(t, err)

	// End-to-end: a spellbook with both ingredients maxed unlocks Paladin.
	dmg, _ := sr.GetByName("Damage")
	heal, _ := sr.GetByName("Heal")
	sc := NewSkillComponent(true)
	sc.Spellbook[dmg.ID] = 5
	sc.Spellbook[heal.ID] = 5

	unlocked := ApplyRecipes(sc, rr)
	assert.Contains(t, unlocked, paladin.ID, "Paladin unlocks from Damage+Heal maxed")
	assert.True(t, sc.HasDiscovered(paladin.ID))

	// One ingredient below the threshold must not unlock it.
	sc2 := NewSkillComponent(true)
	sc2.Spellbook[dmg.ID] = 5
	sc2.Spellbook[heal.ID] = 4
	assert.NotContains(t, ApplyRecipes(sc2, rr), paladin.ID)
}

// TestRecipes_C7Net pins the C7 recipe net (plan-content-zones12.md §13 C7):
// 10 recipes total, and every net result unlocks from its maxed ingredients —
// including the Warbanner capstone and Barrier's recipe home (the pre-existing
// skill as a result).
func TestRecipes_C7Net(t *testing.T) {
	sr, err := RegistryFromFS(os.DirFS("../../../../api/skills"))
	require.NoError(t, err)
	rr, err := RecipesFromFS(os.DirFS("../../../../api/recipes"), sr)
	require.NoError(t, err)
	assert.Len(t, rr.All(), 10)

	// ingredient set -> expected results, per the authored net.
	cases := []struct {
		ingredients map[string]int
		results     []string
	}{
		{map[string]int{"Vanguard": 5, "Damage": 5}, []string{"Spearhead"}},
		{map[string]int{"Vanguard": 5, "Heal": 5}, []string{"Lifewarden"}},
		{map[string]int{"Vanguard": 5, "DamageBurst": 3}, []string{"Shockwave"}},
		{map[string]int{"Vanguard": 5, "Spearhead": 5, "CallForAid": 3}, []string{"Warbanner"}},
		{map[string]int{"CallForAid": 3, "Taunt": 3}, []string{"HoldTheLine"}},
		{map[string]int{"CallForAid": 3, "Heal": 5}, []string{"FieldMedics"}},
		{map[string]int{"Ignite": 3, "Immolate": 5}, []string{"Wildfire"}},
		{map[string]int{"Slow": 5, "LongRangeStrike": 5}, []string{"Suppression"}},
		{map[string]int{"Hardy": 3, "Tough": 3}, []string{"Barrier"}},
	}
	for _, c := range cases {
		sc := NewSkillComponent(true)
		for name, level := range c.ingredients {
			def, err := sr.GetByName(name)
			require.NoError(t, err, name)
			sc.Spellbook[def.ID] = level
		}
		unlocked := ApplyRecipes(sc, rr)
		for _, result := range c.results {
			def, err := sr.GetByName(result)
			require.NoError(t, err, result)
			assert.Contains(t, unlocked, def.ID, "%v -> %s", c.ingredients, result)
		}
	}

	// §21 topology fix (Session ③ Step 0): a maxed Vanguard journey (all trio
	// partners + CallForAid) pops the ceiling trio in one ApplyRecipes call,
	// but the Warbanner capstone is tiered behind a maxed Spearhead — the
	// cascade discovers Spearhead at L1, which must NOT satisfy Warbanner.
	sc := NewSkillComponent(true)
	for name, level := range map[string]int{
		"Vanguard": 5, "Damage": 5, "Heal": 5, "DamageBurst": 3, "CallForAid": 3,
	} {
		def, err := sr.GetByName(name)
		require.NoError(t, err, name)
		sc.Spellbook[def.ID] = level
	}
	unlocked := ApplyRecipes(sc, rr)
	for _, result := range []string{"Spearhead", "Lifewarden", "Shockwave", "FieldMedics"} {
		def, err := sr.GetByName(result)
		require.NoError(t, err, result)
		assert.Contains(t, unlocked, def.ID, result)
	}
	warbanner, err := sr.GetByName("Warbanner")
	require.NoError(t, err)
	assert.NotContains(t, unlocked, warbanner.ID,
		"Warbanner must not co-pop with Spearhead off the Vanguard 5 hub")

	// Investing Spearhead to max unlocks the capstone strictly later.
	spearhead, err := sr.GetByName("Spearhead")
	require.NoError(t, err)
	for sc.RaiseSkillLevel(spearhead) {
	}
	assert.Contains(t, ApplyRecipes(sc, rr), warbanner.ID,
		"Warbanner unlocks once Spearhead is maxed")
}

func TestRecipes_DuplicateIngredientSetAllowed(t *testing.T) {
	recA := []byte(`{"id": 1, "result": "Heal",
      "ingredients": [{ "skill": "Damage", "level": 2 }]}`)
	recB := []byte(`{"id": 2, "result": "Swift",
      "ingredients": [{ "skill": "Damage", "level": 2 }]}`)
	fsys := fstest.MapFS{"a.json": {Data: recA}, "b.json": {Data: recB}}
	rr, err := RecipesFromFS(fsys, testSkillRegistry(t))
	require.NoError(t, err)
	assert.Len(t, rr.All(), 2)
}
