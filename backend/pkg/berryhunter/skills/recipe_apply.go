package skills

// ApplyRecipes discovers every recipe result whose ingredients are all
// simultaneously at >= their required spellbook level, cascading until no
// further recipe fires, and returns the newly-discovered result IDs in the
// order they unlocked (for logging).
//
// Call it after any event that can newly satisfy a recipe — a skill discovery
// or a skill level increase (unspending never can). It is a pure threshold: no
// ingredient level is consumed. Idempotent: a result already discovered is
// skipped, so re-running after the same event unlocks nothing.
//
// Cascade & termination: a fired result is itself a discovery, so chain recipes
// requiring it fire on the next pass. Every firing marks one new result
// discovered and discovered results are skipped, so the number of firings is
// bounded by the recipe count — cyclic recipe chains cannot loop.
//
// No-op (returns nil) for entities without a spellbook, i.e. mobs.
func ApplyRecipes(sc *SkillComponent, r RecipeRegistry) []SkillID {
	if sc == nil || sc.Spellbook == nil {
		return nil
	}

	var unlocked []SkillID
	for {
		changed := false
		for _, rec := range r.All() {
			if sc.HasDiscovered(rec.Result.ID) {
				continue
			}
			if recipeSatisfied(sc, rec) {
				sc.Discover(rec.Result.ID)
				unlocked = append(unlocked, rec.Result.ID)
				changed = true
			}
		}
		if !changed {
			return unlocked
		}
	}
}

// recipeSatisfied reports whether every ingredient is at >= its required level
// in the spellbook's current levels. Over-leveling an ingredient never locks a
// recipe out (the >= is deliberate).
func recipeSatisfied(sc *SkillComponent, rec *RecipeDefinition) bool {
	for _, ing := range rec.Ingredients {
		if sc.SkillLevel(ing.Skill.ID) < ing.Level {
			return false
		}
	}
	return true
}
