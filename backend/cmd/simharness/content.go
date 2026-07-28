package main

import (
	"fmt"
	"io/fs"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"

	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// mobPreset is one entry of the explorer's mob dropdown: an authored mob's
// name plus its numbers mapped onto the sim's MobSpec — a prefill
// convenience, not a fidelity promise (the sim models one damage or dot
// aura; a mob whose loadout has neither maps to a harmless no-op — it keeps its
// authored role, which since chunk 2 is stated rather than implied by speed 0).
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

// contentFS resolves the three content filesystems: the embedded pkg/api
// copies by default (synced from api/ via `make cp-defs`), or a live
// api/-layout directory when contentDir is set — the aurad -content
// convention, so content edits show up on a harness restart without cp-defs.
func contentFS(contentDir string) (skillsFS, factionsFS, mobsFS fs.FS, err error) {
	skillsFS, factionsFS, mobsFS = fs.FS(askills.Skills), fs.FS(afactions.Factions), fs.FS(amobs.Mobs)
	if contentDir == "" {
		return skillsFS, factionsFS, mobsFS, nil
	}
	root := os.DirFS(contentDir)
	for _, s := range []struct {
		name string
		dst  *fs.FS
	}{
		{"skills", &skillsFS}, {"factions", &factionsFS}, {"mobs", &mobsFS},
	} {
		sub, err := fs.Sub(root, s.name)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		if _, err := fs.Stat(sub, "."); err != nil {
			return nil, nil, nil, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		*s.dst = sub
	}
	return skillsFS, factionsFS, mobsFS, nil
}

// loadContent builds the real registries once and returns the authored mob
// definitions (tier+baseline numbers derived against the working-lock curve —
// curve.Default = what a conf without the keys boots with, so they match what
// the live game would spawn) plus the skill registry.
func loadContent(contentDir string) ([]*mobs.MobDefinition, skills.Registry, error) {
	skillsFS, factionsFS, mobsFS, err := contentFS(contentDir)
	if err != nil {
		return nil, nil, err
	}

	fr, err := factions.RegistryFromFS(factionsFS)
	if err != nil {
		return nil, nil, fmt.Errorf("loading factions: %w", err)
	}
	sr, err := skills.RegistryFromFS(skillsFS, fr)
	if err != nil {
		return nil, nil, fmt.Errorf("loading skills: %w", err)
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
		spec, err := mobSpecOf(def)
		if err != nil {
			return nil, nil, err
		}
		presets = append(presets, mobPreset{Name: def.Name, Spec: spec})
	}
	sort.Slice(presets, func(i, j int) bool { return presets[i].Name < presets[j].Name })

	var players []playerAuraPreset
	for _, def := range sr.All() {
		if def.ID >= firstMobSkillID || def.Category != skills.SkillCategoryActiveAura {
			continue
		}
		if !hasDamageEffect(def) {
			continue
		}
		levels := []int{1}
		if def.MaxLevel > 1 {
			levels = append(levels, def.MaxLevel)
		}
		for _, level := range levels {
			spec, err := auraSpecOf(def, level, 1)
			if err != nil {
				return nil, nil, err
			}
			players = append(players, playerAuraPreset{
				Name: fmt.Sprintf("%s L%d", def.Name, level),
				Spec: spec,
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

	skillsFS, factionsFS, _, err := contentFS(contentDir)
	if err != nil {
		return sim.AuraSpec{}, err
	}
	fr, err := factions.RegistryFromFS(factionsFS)
	if err != nil {
		return sim.AuraSpec{}, fmt.Errorf("loading factions: %w", err)
	}
	sr, err := skills.RegistryFromFS(skillsFS, fr)
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
	spec, err := auraSpecOf(def, level, 1)
	if err != nil {
		return sim.AuraSpec{}, fmt.Errorf("-player-aura %q: %w", ref, err)
	}
	return spec, nil
}

// hasDamageEffect reports whether the definition carries any payload the sim
// models — damage_aura or dot_aura.
func hasDamageEffect(def *skills.SkillDefinition) bool {
	for _, e := range def.Effects {
		if (e.Type == skills.EffectTypeDamageAura && e.Damage != nil) ||
			(e.Type == skills.EffectTypeDotAura && e.Dot != nil) {
			return true
		}
	}
	return false
}

// auraSpecOf maps a skill's damage-dealing effects at a level onto the sim's
// synthetic AuraSpec — the same numbers the live SkillSystem would apply.
// powerScale is the caster-side HP multiplier: a mob def's derived
// f(curveLevel) (C0), or neutral 1 for player baselines.
//
// A skill may carry a direct hit AND a dot (GiantVenomSpit, 2026-07-22); both
// land, so both are modelled. Anything the single-aura AuraSpec cannot express
// is a hard error rather than a silent under-measurement — the guardrail
// asserts on these numbers, so a spec that quietly drops half a mob's output
// is worse than no spec at all.
func auraSpecOf(def *skills.SkillDefinition, level int, powerScale float32) (sim.AuraSpec, error) {
	var spec sim.AuraSpec
	var direct, dot *skills.EffectDef
	var geometry *skills.EffectDef

	for i := range def.Effects {
		e := &def.Effects[i]
		switch {
		case e.Type == skills.EffectTypeDamageAura && e.Damage != nil:
			if direct != nil {
				return spec, fmt.Errorf("%s: two damage_aura payloads on one skill — not modellable by a single AuraSpec", def.Name)
			}
			direct = e
		case e.Type == skills.EffectTypeDotAura && e.Dot != nil:
			if dot != nil {
				return spec, fmt.Errorf("%s: two dot_aura payloads on one skill — not modellable by a single AuraSpec", def.Name)
			}
			dot = e
		default:
			continue // light/resist/buff riders carry no damage
		}

		// The live entity owns ONE aura sensor, sized to the max radius across
		// effects (skills.EquippedSkill.EffectiveRadius), and target selection
		// filters by that sensor rather than per effect — so a smaller
		// authored radius does not mean what it looks like: that effect still
		// reaches the full distance. Reject it instead of modelling a lie.
		// Cadence and target count DO differ faithfully per effect
		// (WarlordCleave's 35-tick sweep + 50-tick bleed) and are modelled.
		r := skills.Scaled(e.Radius, e.RadiusPerLevel, level)
		if geometry == nil {
			geometry = e
			spec.Radius = r
			continue
		}
		if r != spec.Radius {
			return spec, fmt.Errorf("%s: damaging effects disagree on radius (%.2f vs %.2f) — the shared aura sensor applies BOTH at the larger one", def.Name, spec.Radius, r)
		}
	}

	if direct == nil && dot == nil {
		return spec, fmt.Errorf("%s has no damage_aura or dot_aura effect", def.Name)
	}

	// Cadence/targets come from whichever payload owns them; with only one
	// payload the aura-level fields ARE that payload's.
	if direct != nil {
		spec.TickInterval = skills.EffectiveTickInterval(*direct, level, 1)
		spec.MaxTargets = skills.Scaled(direct.MaxTargets, direct.MaxTargetsPerLevel, level)
		spec.DamageHP = direct.Damage.HPAt(level) * powerScale
		spec.Variance = direct.Damage.Variance
		spec.CritChance = direct.Damage.CritChanceAt(level)
		spec.CritFactor = direct.Damage.CritFactor
	}
	if dot != nil {
		applyInterval := skills.EffectiveTickInterval(*dot, level, 1)
		targets := skills.Scaled(dot.MaxTargets, dot.MaxTargetsPerLevel, level)
		hp := dot.Dot.HPAt(level) * powerScale

		spec.DotTicks = dot.Dot.TickCount
		spec.DotTickInterval = dot.Dot.Interval
		if direct != nil {
			// Both payloads: the dot needs its own HP field, and its cadence
			// and target cap only when they diverge from the direct hit's.
			spec.DotHP = hp
			if applyInterval != spec.TickInterval {
				spec.DotApplyInterval = applyInterval
			}
			if targets != spec.MaxTargets {
				spec.DotMaxTargets = targets
			}
		} else {
			// Dot-only shorthand: DamageHP IS the dot's per-event HP, and the
			// aura-level cadence/targets are the dot's own.
			spec.DamageHP = hp
			spec.Variance = dot.Dot.Variance
			spec.TickInterval = applyInterval
			spec.MaxTargets = targets
		}

		// A dot only sustains its DotTickInterval rate while it stays
		// refreshed; re-applying slower than the dot's own lifetime leaves
		// gaps the steady-state model does not capture.
		if lifetime := dot.Dot.DurationTicks(); applyInterval > lifetime {
			return spec, fmt.Errorf("%s: dot re-applies every %d ticks but lasts only %d — the sustained model assumes continuous uptime",
				def.Name, applyInterval, lifetime)
		}
	}
	return spec, nil
}

// mobSpecOf maps an authored definition onto the sim's synthetic MobSpec.
// The aura is the first damage-dealing skill across the mob's aura loadout,
// level-scaled at the declared skill level — the same numbers the live
// SkillSystem would apply.
func mobSpecOf(def *mobs.MobDefinition) (sim.MobSpec, error) {
	// f(curveLevel) is applied HERE because a definition no longer carries a
	// pre-derived pool or power scale — the live mob evaluates the curve at
	// its current level (plan-entity-model.md chunk 1b). A preset is a world
	// mob, which stands at its authored curveLevel, so this is that same
	// number: the sim keeps modelling exactly what the SkillSystem applies.
	powerScale := float32(def.Curve.F(def.CurveLevel))
	spec := sim.MobSpec{
		// Rounded, because vitals.HP rounds the live pool: a preset that kept
		// the fraction would model a mob the server cannot spawn.
		MaxHealth:         float32(math.Round(float64(def.Factors.BaseMaxHealth) * float64(powerScale))),
		MaxHealthVariance: def.Factors.MaxHealthVariance,
		// The authored role rides along (chunk 2): a preset structure must
		// still be a structure in the sim, or FireTotem — an armed structure
		// the guardrail battery does NOT exempt — quietly stops fighting back.
		Role:                 string(def.Role),
		Speed:                def.Factors.Speed,
		BodyRadius:           def.Body.Radius,
		AggroRadius:          def.Body.AggroRadius,
		FleeBelowHealthRatio: def.Factors.FleeBelowHealthRatio,
	}
	for _, ms := range def.Skills {
		if ms.Def.Category != skills.SkillCategoryActiveAura || !hasDamageEffect(ms.Def) {
			continue
		}
		// × powerScale: the live SkillSystem multiplies mob skill HP
		// by f(the mob's level) at cast time (C0).
		aura, err := auraSpecOf(ms.Def, ms.Level, powerScale)
		if err != nil {
			return spec, fmt.Errorf("mob %s: %w", def.Name, err)
		}
		spec.Aura = aura
		return spec, nil
	}
	return spec, nil
}
