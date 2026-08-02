package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Damage types as MITIGATION, over the real api/ content (plan-numbers-rewrite
// D4, C2d).
//
// ⚑ This has to be a test rather than a battery run. The sim harness builds its
// mobs from synthetic inline definitions (sim/world.go) and its CLI chain takes
// `-mob-hp`/`-mob-dmg` numbers, not an authored mob — so no battery scenario can
// observe an authored resistance. The same blind spot L7 records for the mob
// loader generally; here it is total, because before this pass resistances
// existed ONLY as lock-and-key gates and never mitigated anything at all.
func realContent(t *testing.T) (skills.Registry, mobs.Registry) {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	factionsRegistry := mustLoadFactions(t, content)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, factionsRegistry)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	return skillsRegistry, mobsRegistry
}

// damageTypesOf returns the authored damage types of a skill's first damage or
// dot payload — the types a hit from that skill actually carries.
func damageTypesOf(t *testing.T, sr skills.Registry, name string) []string {
	t.Helper()
	def, err := sr.GetByName(name)
	require.NoError(t, err)
	for i := range def.Effects {
		if d := def.Effects[i].Damage; d != nil {
			return d.Tags
		}
		if d := def.Effects[i].Dot; d != nil {
			return d.Tags
		}
	}
	t.Fatalf("%s carries no damage payload", name)
	return nil
}

// TestCuratedResistancesMitigateRealSkills is the end-to-end claim: a player's
// damage TYPE changes how much a specific authored mob takes. It pairs real
// skills with real mobs rather than asserting the JSON back at itself, so it
// fails if either side drifts — retagging Reaper off `bleed` breaks it just as
// surely as deleting the Troll's entry.
func TestCuratedResistancesMitigateRealSkills(t *testing.T) {
	sr, mr := realContent(t)

	for _, tc := range []struct {
		skill, mob string
		want       float32
		why        string
	}{
		{"Reaper", "Troll", 0.5, "the troll shrugs off wounds, so the bleed line is the wrong answer to it"},
		{"Immolate", "Troll", 1.5, "and fire is the right one — the classic trade"},
		{"Immolate", "FireElemental", 0.25, "fire against a thing made of fire"},
		{"Suppression", "FireElemental", 1.5, "frost is its counter"},
		{"Immolate", "BanditPyromancer", 0.5, "works with fire, has the scars"},
		{"Suppression", "Bear", 0.5, "thick winter fur"},

		// The control: an untouched mob mitigates nothing, whatever the type.
		{"Reaper", "Wolf", 1, "a mob outside the curated set takes every type in full"},
		{"Immolate", "Wolf", 1, "a mob outside the curated set takes every type in full"},
		{"Damage", "Troll", 1, "the free floor is physical, and nothing curated resists physical"},
	} {
		def, err := mr.GetByName(tc.mob)
		require.NoError(t, err, tc.mob)
		got := skills.ResistMultiplier(damageTypesOf(t, sr, tc.skill), def.Factors.Resistances)
		assert.InDeltaf(t, tc.want, got, 1e-6, "%s vs %s — %s", tc.skill, tc.mob, tc.why)
	}
}

// TestNoCuratedResistanceTouchesPhysical guards the constraint the curated set
// was chosen under: TestGuardrails_TierThresholdsVsRealRoster drives its bot
// with authored Damage at L1, which is physical, so a physical resistance
// anywhere in the roster silently re-calibrates the tier thresholds — the
// guardrails would move and read as a content regression somewhere else
// entirely. Authoring one is a deliberate act that should re-baseline them.
func TestNoCuratedResistanceTouchesPhysical(t *testing.T) {
	_, mr := realContent(t)

	for _, def := range mr.Mobs() {
		for tag := range def.Factors.Resistances {
			if tag == skills.ResistWildcard {
				continue // a blanket immunity is the gate mobs' whole shape
			}
			assert.NotEqualf(t, "physical", tag,
				"%s authors a physical resistance — re-baseline the C8 tier guardrails deliberately, "+
					"or pick a non-physical type", def.Name)
		}
	}
}
