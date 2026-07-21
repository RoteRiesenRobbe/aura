package main

import (
	"fmt"
	"io/fs"
	"os"
	"sort"
	"strconv"
	"strings"

	afactions "github.com/trichner/berryhunter/pkg/api/factions"
	aitems "github.com/trichner/berryhunter/pkg/api/items"
	amobs "github.com/trichner/berryhunter/pkg/api/mobs"
	askills "github.com/trichner/berryhunter/pkg/api/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/curve"
	"github.com/trichner/berryhunter/pkg/berryhunter/factions"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// mobPreset is one entry of the explorer's mob dropdown: an authored mob's
// name plus its numbers mapped onto the sim's MobSpec — a prefill
// convenience, not a fidelity promise (the sim models one damage or dot
// aura; a mob whose loadout has neither maps to a harmless turret).
type mobPreset struct {
	Name string      `json:"name"`
	Spec sim.MobSpec `json:"spec"`
}

// playerAuraPreset is one entry of the explorer's player-aura dropdown
// (content pass C5, plan §A "never a surprise"): a player-authored skill's
// damage_aura or dot_aura at a specific skill level, mapped onto the sim
// AuraSpec. Same fidelity caveat as mobPreset — only that effect is modeled, so
// a multi-effect skill (Vanguard: + heal + shield) reads BETTER in the sim
// than these numbers alone; the C8 balance pass owns the full picture.
// Values are curve-position-1 baselines: the character-level f(L) is the
// curve battery's axis, never baked into a preset.
type playerAuraPreset struct {
	Name string       `json:"name"`
	Spec sim.AuraSpec `json:"spec"`
}

// firstMobSkillID is the content numbering convention: player skills stay
// below 100, mob skills (api/skills/mobs/) number from 101.
const firstMobSkillID skills.SkillID = 100

// contentFS resolves the four content filesystems: the embedded pkg/api
// copies by default (synced from api/ via `make cp-defs`), or a live
// api/-layout directory when contentDir is set — the berryhunterd -content
// convention, so content edits show up on a harness restart without cp-defs.
func contentFS(contentDir string) (itemsFS, skillsFS, factionsFS, mobsFS fs.FS, err error) {
	itemsFS, skillsFS, factionsFS, mobsFS = fs.FS(aitems.Items), fs.FS(askills.Skills), fs.FS(afactions.Factions), fs.FS(amobs.Mobs)
	if contentDir == "" {
		return itemsFS, skillsFS, factionsFS, mobsFS, nil
	}
	root := os.DirFS(contentDir)
	for _, s := range []struct {
		name string
		dst  *fs.FS
	}{
		{"items", &itemsFS}, {"skills", &skillsFS}, {"factions", &factionsFS}, {"mobs", &mobsFS},
	} {
		sub, err := fs.Sub(root, s.name)
		if err != nil {
			return nil, nil, nil, nil, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		if _, err := fs.Stat(sub, "."); err != nil {
			return nil, nil, nil, nil, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		*s.dst = sub
	}
	return itemsFS, skillsFS, factionsFS, mobsFS, nil
}

// loadContent builds the real registries once and returns the authored mob
// definitions (tier+baseline numbers derived against the working-lock curve —
// curve.Default = what a conf without the keys boots with, so they match what
// the live game would spawn) plus the skill registry.
func loadContent(contentDir string) ([]*mobs.MobDefinition, skills.Registry, error) {
	_, skillsFS, factionsFS, mobsFS, err := contentFS(contentDir)
	if err != nil {
		return nil, nil, err
	}

	sr, err := skills.RegistryFromFS(skillsFS)
	if err != nil {
		return nil, nil, fmt.Errorf("loading skills: %w", err)
	}
	fr, err := factions.RegistryFromFS(factionsFS)
	if err != nil {
		return nil, nil, fmt.Errorf("loading factions: %w", err)
	}
	mr, err := mobs.RegistryFromFS(sr, fr, curve.Default(), mobsFS)
	if err != nil {
		return nil, nil, fmt.Errorf("loading mobs: %w", err)
	}
	return mr.Mobs(), sr, nil
}

// loadPresets builds both explorer rosters from the real content: every
// authored mob, and every player-authored damage- or dot-aura skill at L1 +
// max level (two entries — the baseline and the specialization ceiling).
func loadPresets(contentDir string) ([]mobPreset, []playerAuraPreset, error) {
	defs, sr, err := loadContent(contentDir)
	if err != nil {
		return nil, nil, err
	}

	var presets []mobPreset
	for _, def := range defs {
		presets = append(presets, mobPreset{Name: def.Name, Spec: mobSpecOf(def)})
	}
	sort.Slice(presets, func(i, j int) bool { return presets[i].Name < presets[j].Name })

	var players []playerAuraPreset
	for _, def := range sr.All() {
		if def.ID >= firstMobSkillID || def.Category != skills.SkillCategoryActiveAura {
			continue
		}
		e, ok := firstDamageEffect(def)
		if !ok {
			continue
		}
		players = append(players, playerAuraPreset{
			Name: fmt.Sprintf("%s L1", def.Name),
			Spec: auraSpecAt(e, 1, 1),
		})
		if def.MaxLevel > 1 {
			players = append(players, playerAuraPreset{
				Name: fmt.Sprintf("%s L%d", def.Name, def.MaxLevel),
				Spec: auraSpecAt(e, def.MaxLevel, 1),
			})
		}
	}
	sort.Slice(players, func(i, j int) bool { return players[i].Name < players[j].Name })

	return presets, players, nil
}

// playerAuraSpecByName derives one player skill's damage-aura numbers at an
// arbitrary skill level — the CLI's -player-aura path (the explorer dropdown
// rides loadPresets instead).
func playerAuraSpecByName(contentDir, ref string) (sim.AuraSpec, error) {
	name, level := ref, 1
	if i := strings.LastIndex(ref, ":"); i >= 0 {
		var err error
		name = ref[:i]
		level, err = strconv.Atoi(ref[i+1:])
		if err != nil || level < 1 {
			return sim.AuraSpec{}, fmt.Errorf("-player-aura %q: level must be a positive integer", ref)
		}
	}

	_, skillsFS, _, _, err := contentFS(contentDir)
	if err != nil {
		return sim.AuraSpec{}, err
	}
	sr, err := skills.RegistryFromFS(skillsFS)
	if err != nil {
		return sim.AuraSpec{}, fmt.Errorf("loading skills: %w", err)
	}
	def, err := sr.GetByName(name)
	if err != nil {
		return sim.AuraSpec{}, err
	}
	if level > def.MaxLevel {
		return sim.AuraSpec{}, fmt.Errorf("-player-aura %q: %s caps at level %d", ref, def.Name, def.MaxLevel)
	}
	e, ok := firstDamageEffect(def)
	if !ok {
		return sim.AuraSpec{}, fmt.Errorf("-player-aura %q: %s has no damage_aura or dot_aura effect", ref, def.Name)
	}
	return auraSpecAt(e, level, 1), nil
}

// firstDamageEffect finds the definition's first damage-dealing aura payload
// — damage_aura or dot_aura, the two effect shapes the sim models.
func firstDamageEffect(def *skills.SkillDefinition) (skills.EffectDef, bool) {
	for _, e := range def.Effects {
		if e.Type == skills.EffectTypeDamageAura && e.Damage != nil {
			return e, true
		}
		if e.Type == skills.EffectTypeDotAura && e.Dot != nil {
			return e, true
		}
	}
	return skills.EffectDef{}, false
}

// auraSpecAt maps one damage_aura or dot_aura effect at a skill level onto
// the sim's synthetic AuraSpec — the same numbers the live SkillSystem would
// apply. powerScale is the caster-side HP multiplier: a mob def's derived
// f(curveLevel) (C0), or neutral 1 for player baselines.
func auraSpecAt(e skills.EffectDef, level int, powerScale float32) sim.AuraSpec {
	spec := sim.AuraSpec{
		TickInterval: skills.EffectiveTickInterval(e, level, 1),
		Radius:       skills.Scaled(e.Radius, e.RadiusPerLevel, level),
		MaxTargets:   skills.Scaled(e.MaxTargets, e.MaxTargetsPerLevel, level),
	}
	switch {
	case e.Damage != nil:
		spec.DamageHP = e.Damage.HPAt(level) * powerScale
		spec.Variance = e.Damage.Variance
		spec.CritChance = e.Damage.CritChanceAt(level)
		spec.CritFactor = e.Damage.CritFactor
	case e.Dot != nil:
		spec.DamageHP = e.Dot.HPAt(level) * powerScale
		spec.Variance = e.Dot.Variance
		spec.DotTicks = e.Dot.TickCount
		spec.DotTickInterval = e.Dot.Interval
	}
	return spec
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
		if e, ok := firstDamageEffect(ms.Def); ok {
			// × PowerScale: the live SkillSystem multiplies mob skill HP
			// by the def's derived f(curveLevel) at cast time (C0).
			spec.Aura = auraSpecAt(e, ms.Level, def.PowerScale)
			return spec
		}
	}
	return spec
}
