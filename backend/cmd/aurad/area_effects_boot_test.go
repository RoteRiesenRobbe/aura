package main

import (
	"sort"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// ⭐ THE BOOT WIRING FOR AREA EFFECTS (plan-area-effects.md E1).
//
// ⛔ It is a SEPARATE test from the ones in world/ on purpose, and the reason is
// the gap it closes. world/area_effects_test.go proves CrossValidateAreaEffects
// answers correctly; nothing there proves anyone CALLS it. Deleting the call in
// loadZones would leave that whole file green, the vitest suite green and
// verify.sh green, while an unknown effect sailed into a running server — the
// same shape of hole the fourth writer keeps producing, one layer up.
//
// ⚑ It drives loadZones over a SYNTHETIC zone directory rather than the shipped
// one, because the shipped one authors no effect at all (D10): a pass over real
// content cannot tell "checked and clean" from "never ran".

func areaEffectContent(t *testing.T) (mobs.Registry, world.PropRegistry, skills.Registry) {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	factionsRegistry := mustLoadFactions(t, content)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, factionsRegistry)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)
	return mobsRegistry, propsRegistry, skillsRegistry
}

// One zone, one atmosphere, one effect name — the smallest thing that reaches
// the pass. The campfire is what world.Place's set-wide check demands: the world
// must have somewhere to put a fresh character.
func zoneFSWithEffect(effect string) fstest.MapFS {
	doc := `{
		"name": "Hazards",
		"bounds": { "width": 60, "height": 40 },
		"campfires": [{ "id": "spawnpoint-1", "x": 0, "y": 0, "startingSpawn": true }],
		"atmospheres": [{
			"profile": "Miasma",
			"effect": "` + effect + `",
			"points": [{"x":-5,"y":-5},{"x":5,"y":-5},{"x":5,"y":5}]
		}]
	}`
	return fstest.MapFS{"hazards.json": {Data: []byte(doc)}}
}

func TestLoadZones_RunsTheAreaEffectCheck(t *testing.T) {
	mr, pr, sr := areaEffectContent(t)

	// ⚑ Derived from the registry, never typed: a renamed skill must not redden
	// this, and the point is only that SOME real name passes.
	//
	// ⛔ It must be a skill an area can actually APPLY, and the first cut of this
	// test was not — it took All()[0], which landed on RallyDrum and was refused
	// by E2's second boot check the day that check landed. The test was right to
	// go red; the fixture was wrong. ⚑ Sorted by ID as well, because All() walks
	// a MAP: an unsorted pick is a different skill on different runs, which is a
	// flake waiting for the day one of them stops being applicable.
	applicable := sr.All()
	sort.Slice(applicable, func(i, j int) bool { return applicable[i].ID < applicable[j].ID })
	realName := ""
	for _, d := range applicable {
		for _, e := range d.Effects {
			if e.Type == skills.EffectTypeDotAura || e.Type == skills.EffectTypeHotAura {
				realName = d.Name
				break
			}
		}
		if realName != "" {
			break
		}
	}
	require.NotEmpty(t, realName, "the content must author at least one area-applicable skill")

	t.Run("a known effect boots", func(t *testing.T) {
		zones, err := loadZones(zoneFSWithEffect(realName), "hazards", mr, pr, sr)
		require.NoError(t, err)
		require.Len(t, zones, 1)
		assert.Equal(t, realName, zones[0].Atmospheres[0].Effect)
	})

	// ⛔ A FINDING, not a warning — the loader ethos for placed content. An area
	// effect is placed by construction, so a name that resolves to nothing is a
	// hazard that draws, reads as dangerous and does nothing at all. The boot is
	// what panics on it (aurad.go); this pins that the check ran and reported.
	t.Run("an unknown effect refuses the boot", func(t *testing.T) {
		_, err := loadZones(zoneFSWithEffect("NoSuchSkill"), "hazards", mr, pr, sr)
		require.Error(t, err, "loadZones must refuse an unknown effect")
		assert.Contains(t, err.Error(), "NoSuchSkill")
		assert.Contains(t, err.Error(), "api/skills/")
	})
}
