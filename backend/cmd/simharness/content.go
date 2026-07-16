package main

import (
	"fmt"
	"io/fs"
	"os"
	"sort"

	afactions "github.com/trichner/berryhunter/pkg/api/factions"
	aitems "github.com/trichner/berryhunter/pkg/api/items"
	amobs "github.com/trichner/berryhunter/pkg/api/mobs"
	askills "github.com/trichner/berryhunter/pkg/api/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/curve"
	"github.com/trichner/berryhunter/pkg/berryhunter/factions"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// mobPreset is one entry of the explorer's mob dropdown: an authored mob's
// name plus its numbers mapped onto the sim's MobSpec — a prefill
// convenience, not a fidelity promise (the sim models one damage aura; a
// mob whose loadout has no damage aura maps to a harmless turret).
type mobPreset struct {
	Name string      `json:"name"`
	Spec sim.MobSpec `json:"spec"`
}

// loadMobPresets builds the roster from the real mob content: the embedded
// pkg/api copies by default (synced from api/ via `make cp-defs`), or a live
// api/-layout directory when contentDir is set — the berryhunterd -content
// convention, so content edits show up on a harness restart without cp-defs.
func loadMobPresets(contentDir string) ([]mobPreset, error) {
	itemsFS, skillsFS, factionsFS, mobsFS := fs.FS(aitems.Items), fs.FS(askills.Skills), fs.FS(afactions.Factions), fs.FS(amobs.Mobs)
	if contentDir != "" {
		root := os.DirFS(contentDir)
		for _, s := range []struct {
			name string
			dst  *fs.FS
		}{
			{"items", &itemsFS}, {"skills", &skillsFS}, {"factions", &factionsFS}, {"mobs", &mobsFS},
		} {
			sub, err := fs.Sub(root, s.name)
			if err != nil {
				return nil, fmt.Errorf("content dir %q: %w", contentDir, err)
			}
			if _, err := fs.Stat(sub, "."); err != nil {
				return nil, fmt.Errorf("content dir %q: %w", contentDir, err)
			}
			*s.dst = sub
		}
	}

	ir, err := items.RegistryFromFS(itemsFS)
	if err != nil {
		return nil, fmt.Errorf("loading items: %w", err)
	}
	sr, err := skills.RegistryFromFS(skillsFS)
	if err != nil {
		return nil, fmt.Errorf("loading skills: %w", err)
	}
	fr, err := factions.RegistryFromFS(factionsFS)
	if err != nil {
		return nil, fmt.Errorf("loading factions: %w", err)
	}
	// Presets derive tier+baseline numbers against the working-lock curve
	// (curve.Default = what a conf without the keys boots with), so a preset
	// carries the same derived numbers the live game would spawn.
	mr, err := mobs.RegistryFromFS(ir, sr, fr, curve.Default(), mobsFS)
	if err != nil {
		return nil, fmt.Errorf("loading mobs: %w", err)
	}

	var presets []mobPreset
	for _, def := range mr.Mobs() {
		presets = append(presets, mobPreset{Name: def.Name, Spec: mobSpecOf(def)})
	}
	sort.Slice(presets, func(i, j int) bool { return presets[i].Name < presets[j].Name })
	return presets, nil
}

// mobSpecOf maps an authored definition onto the sim's synthetic MobSpec.
// The aura is the FIRST damage_aura effect across the mob's aura loadout,
// level-scaled at the declared skill level — the same numbers the live
// SkillSystem would apply.
func mobSpecOf(def *mobs.MobDefinition) sim.MobSpec {
	spec := sim.MobSpec{
		MaxHealth:            float32(def.Factors.MaxHealth),
		MaxHealthVariance:    def.Factors.MaxHealthVariance,
		Speed:                def.Factors.Speed,
		BodyRadius:           def.Body.Radius,
		AggroRadius:          def.Body.AggroRadius,
		FleeBelowHealthRatio: def.Factors.FleeBelowHealthRatio,
	}
	for _, ms := range def.Skills {
		if ms.Def.Category != skills.SkillCategoryActiveAura {
			continue
		}
		for _, e := range ms.Def.Effects {
			if e.Type != skills.EffectTypeDamageAura || e.Damage == nil {
				continue
			}
			spec.Aura = sim.AuraSpec{
				// × PowerScale: the live SkillSystem multiplies mob skill HP
				// by the def's derived f(curveLevel) at cast time (C0).
				DamageHP:     e.Damage.HPAt(ms.Level) * def.PowerScale,
				TickInterval: skills.EffectiveTickInterval(e, ms.Level, 1),
				Radius:       skills.Scaled(e.Radius, e.RadiusPerLevel, ms.Level),
				Variance:     e.Damage.Variance,
				CritChance:   e.Damage.CritChance,
				CritFactor:   e.Damage.CritFactor,
				MaxTargets:   skills.Scaled(e.MaxTargets, e.MaxTargetsPerLevel, ms.Level),
			}
			return spec
		}
	}
	return spec
}
