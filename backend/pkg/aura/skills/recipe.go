package skills

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
)

// RecipeID identifies a combination recipe. Recipe IDs live in their own
// namespace, independent of SkillID.
type RecipeID int

// RecipeIngredient is one required skill-at-level entry of a recipe. Level is
// the minimum: the recipe fires when the spellbook level is >= Level.
type RecipeIngredient struct {
	Skill *SkillDefinition
	Level int
}

// RecipeDefinition is one curated, secret combination. When all ingredients are
// simultaneously discovered at >= their required level, Result is discovered.
// Recipes are never documented in-game; the community discovers and shares them.
type RecipeDefinition struct {
	ID          RecipeID
	Result      *SkillDefinition
	Ingredients []RecipeIngredient
}

// RecipeRegistry is the read-only interface over all loaded recipes. The
// checker always evaluates every recipe (alternate paths and shared ingredient
// sets both fire), so there is no by-result or by-ingredient lookup.
type RecipeRegistry interface {
	All() []*RecipeDefinition
}

type recipeRegistry struct {
	recipes []*RecipeDefinition
}

func (r *recipeRegistry) All() []*RecipeDefinition {
	return r.recipes
}

// --- private JSON parsing types ---

type recipeIngredientRaw struct {
	Skill string `json:"skill"`
	Level int    `json:"level"`
}

type recipeDefinitionRaw struct {
	ID          int                   `json:"id"`
	Result      string                `json:"result"`
	Ingredients []recipeIngredientRaw `json:"ingredients"`
}

// RecipesFromFS walks fileSystem for .json files, parses each as a
// RecipeDefinition and resolves skill names against the skill registry sr.
//
// Recipes are curated content, so validation is strict and any error aborts
// (hard fail at startup): malformed JSON, unknown result/ingredient names,
// ingredient level < 1 or > that skill's maxLevel, empty ingredient list, or a
// duplicate recipe ID. Duplicate ingredient *sets* across recipes are allowed
// (both fire) and are not an error.
func RecipesFromFS(fileSystem fs.FS, sr Registry) (RecipeRegistry, error) {
	reg := &recipeRegistry{}
	seenID := make(map[RecipeID]string) // ID -> result name, for the duplicate error

	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}

		var raw recipeDefinitionRaw
		if err := json.Unmarshal(data, &raw); err != nil {
			return fmt.Errorf("cannot parse %q: %w", path, err)
		}

		def, err := raw.resolve(sr)
		if err != nil {
			return fmt.Errorf("recipe %q: %w", path, err)
		}

		if existing, ok := seenID[def.ID]; ok {
			return fmt.Errorf("duplicate recipe ID %d: %q and %q", def.ID, existing, def.Result.Name)
		}
		seenID[def.ID] = def.Result.Name
		reg.recipes = append(reg.recipes, def)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return reg, nil
}

func (raw *recipeDefinitionRaw) resolve(sr Registry) (*RecipeDefinition, error) {
	result, err := sr.GetByName(raw.Result)
	if err != nil {
		return nil, fmt.Errorf("unknown result skill %q", raw.Result)
	}
	if len(raw.Ingredients) == 0 {
		return nil, fmt.Errorf("empty ingredient list")
	}

	ingredients := make([]RecipeIngredient, 0, len(raw.Ingredients))
	for _, ing := range raw.Ingredients {
		def, err := sr.GetByName(ing.Skill)
		if err != nil {
			return nil, fmt.Errorf("unknown ingredient skill %q", ing.Skill)
		}
		if ing.Level < 1 || ing.Level > def.MaxLevel {
			return nil, fmt.Errorf("ingredient %q level %d out of range [1, %d]", ing.Skill, ing.Level, def.MaxLevel)
		}
		ingredients = append(ingredients, RecipeIngredient{Skill: def, Level: ing.Level})
	}

	return &RecipeDefinition{
		ID:          RecipeID(raw.ID),
		Result:      result,
		Ingredients: ingredients,
	}, nil
}
