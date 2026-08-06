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
	aprops "github.com/RoteRiesenRobbe/aura/pkg/api/props"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	azones "github.com/RoteRiesenRobbe/aura/pkg/api/zones"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// mobPreset is one entry of the explorer's mob dropdown: an authored mob's
// name plus its numbers mapped onto the sim's MobSpec — a prefill
// convenience, not a fidelity promise (the sim models one damage or dot
// aura; a mob whose loadout has neither maps to a harmless no-op — it keeps its
// authored role, which since chunk 2 is stated rather than implied by speed 0).
type mobPreset struct {
	Name string `json:"name"`
	// Level is the level the spec was derived at — the species' own
	// curveLevel unless the roster was asked for a placement (C1.5).
	Level int         `json:"level"`
	Spec  sim.MobSpec `json:"spec"`
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

// contentDirs are the definition filesystems the harness consumes. zones and
// props joined with the C1.5 placement battery (plan-xp-formula.md §13.3) —
// props because a zone does not load without them: world.Zone.resolve binds
// every prop's type against the registry, so reading world.json needs the same
// two sources aurad boots with.
type contentDirs struct {
	skills   fs.FS
	factions fs.FS
	mobs     fs.FS
	zones    fs.FS
	props    fs.FS
}

// contentFS resolves them: the embedded pkg/api copies by default (synced from
// api/ via `make cp-defs`), or a live api/-layout directory when contentDir is
// set — the aurad -content convention, so content edits show up on a harness
// restart without cp-defs.
//
// ⚑ A missing subdirectory is an ERROR, never an empty filesystem. An empty
// zones dir reports a placement table with no rows, which reads as "nothing in
// the world is placed" rather than as a broken -content path (§7.1's
// no-content degrade leg; the C2 world walk's "no plates in view" lesson, one
// level up).
func contentFS(contentDir string) (contentDirs, error) {
	c := contentDirs{
		skills:   askills.Skills,
		factions: afactions.Factions,
		mobs:     amobs.Mobs,
		zones:    azones.Zones,
		props:    aprops.Props,
	}
	if contentDir == "" {
		return c, nil
	}
	root := os.DirFS(contentDir)
	for _, s := range []struct {
		name string
		dst  *fs.FS
	}{
		{"skills", &c.skills}, {"factions", &c.factions}, {"mobs", &c.mobs},
		{"zones", &c.zones}, {"props", &c.props},
	} {
		sub, err := fs.Sub(root, s.name)
		if err != nil {
			return contentDirs{}, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		if _, err := fs.Stat(sub, "."); err != nil {
			return contentDirs{}, fmt.Errorf("content dir %q: %w", contentDir, err)
		}
		*s.dst = sub
	}
	return c, nil
}

// loadRegistries builds the real registries once (tier+baseline numbers derived
// against the working-lock curve — curve.Default = what a conf without the keys
// boots with, so they match what the live game would spawn).
func loadRegistries(c contentDirs) (mobs.Registry, skills.Registry, error) {
	fr, err := factions.RegistryFromFS(c.factions)
	if err != nil {
		return nil, nil, fmt.Errorf("loading factions: %w", err)
	}
	sr, err := skills.RegistryFromFS(c.skills, fr)
	if err != nil {
		return nil, nil, fmt.Errorf("loading skills: %w", err)
	}
	mr, err := mobs.RegistryFromFS(sr, fr, curve.Default(), c.mobs)
	if err != nil {
		return nil, nil, fmt.Errorf("loading mobs: %w", err)
	}
	return mr, sr, nil
}

// loadContent returns the authored mob definitions plus the skill registry.
func loadContent(contentDir string) ([]*mobs.MobDefinition, skills.Registry, error) {
	c, err := contentFS(contentDir)
	if err != nil {
		return nil, nil, err
	}
	mr, sr, err := loadRegistries(c)
	if err != nil {
		return nil, nil, err
	}
	return mr.Mobs(), sr, nil
}

// placement is one authored world spawn a player can fight: the species that
// stands there and the level it stands at (plan-xp-formula.md §13.3).
type placement struct {
	Def *mobs.MobDefinition
	// Level is the RESOLVED level — the spawn's own override, else the
	// species' curveLevel. That is Mob.Level()'s own precedence
	// (spawnLevel ?? curveLevel, plan-mob-levels.md C1), which is the operand
	// the kill-XP formula reads.
	Level int
}

// loadPlacements enumerates one zone's combat spawns.
//
// ⚑ L7 — this does NOT parse world.json. world.LoadZoneFS is the loader aurad
// boots with; it already validates `level` (non-positive hard-fails) and
// resolves every spawn against the mob registry. A convenience re-parse here
// would drift from the game, which is the one thing §7.1's 423-spawn assert
// exists to catch.
//
// Non-combat spawns (NPCs, structures, totems, hazards) are dropped by the
// catalog's own derivation, not by a hand-written filter — see
// mobs.MobDefinition.IsCombatTarget.
func loadPlacements(contentDir, zoneName string) ([]placement, error) {
	c, err := contentFS(contentDir)
	if err != nil {
		return nil, err
	}
	mr, _, err := loadRegistries(c)
	if err != nil {
		return nil, err
	}
	pr, err := world.PropRegistryFromFS(c.props)
	if err != nil {
		return nil, fmt.Errorf("loading props: %w", err)
	}
	zone, err := world.LoadZoneFS(c.zones, zoneName, mr, pr)
	if err != nil {
		return nil, fmt.Errorf("loading zone %q: %w", zoneName, err)
	}

	placements := make([]placement, 0, len(zone.Spawns))
	for i := range zone.Spawns {
		s := &zone.Spawns[i]
		if !s.Def.IsCombatTarget() {
			continue
		}
		level := s.Def.CurveLevel
		if s.Level != nil {
			level = *s.Level
		}
		placements = append(placements, placement{Def: s.Def, Level: level})
	}
	if len(placements) == 0 {
		return nil, fmt.Errorf("zone %q holds no combat spawns — a placement battery over it would report an empty table, which reads as \"nothing is placed\"", zoneName)
	}
	return placements, nil
}

// loadPresets builds both explorer rosters from the real content: every
// authored mob, and every player-authored damage- or dot-aura skill at L1 +
// max level (two entries — the baseline and the specialization ceiling).
//
// mobLevel derives the whole mob roster at one level, so the explorer can ask
// "what is this species like where it is PLACED" (C1.5); 0 = each species at
// its own curveLevel, which is what the roster has always meant.
func loadPresets(contentDir string, mobLevel int) ([]mobPreset, []playerAuraPreset, error) {
	defs, sr, err := loadContent(contentDir)
	if err != nil {
		return nil, nil, err
	}

	var presets []mobPreset
	for _, def := range defs {
		level := mobLevel
		if level < 1 {
			level = def.CurveLevel
		}
		spec, err := mobSpecOf(def, level)
		if err != nil {
			return nil, nil, err
		}
		presets = append(presets, mobPreset{Name: def.Name, Level: level, Spec: spec})
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

	c, err := contentFS(contentDir)
	if err != nil {
		return sim.AuraSpec{}, err
	}
	fr, err := factions.RegistryFromFS(c.factions)
	if err != nil {
		return sim.AuraSpec{}, fmt.Errorf("loading factions: %w", err)
	}
	sr, err := skills.RegistryFromFS(c.skills, fr)
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

// placementsInput is the -placements CLI surface, gathered so main.go stays a
// flag table.
type placementsInput struct {
	contentDir  string
	zone        string
	player      sim.PlayerSpec // the LEVEL-1 baseline build
	curve       sim.Curve
	xp          sim.XPModel
	playerLevel int
	fights      int
	downtime    float64
	seed        int64
	runs        int
	maxSeconds  float64
}

// runPlacementsBattery turns the authored zone into the battery's (species,
// rung) groups and runs it. Grouping happens HERE rather than in the sim so
// the sim package keeps reading no content: what crosses the boundary is
// already-derived numbers.
func runPlacementsBattery(in placementsInput) (*sim.PlacementReport, error) {
	placements, err := loadPlacements(in.contentDir, in.zone)
	if err != nil {
		return nil, err
	}
	economy := in.xp.KillEconomy()

	type key struct {
		species string
		level   int
	}
	index := map[key]int{}
	var specs []sim.PlacementSpec
	for _, p := range placements {
		k := key{p.Def.Name, p.Level}
		if i, ok := index[k]; ok {
			specs[i].Spawns++
			continue
		}
		mob, err := mobSpecOf(p.Def, p.Level)
		if err != nil {
			return nil, fmt.Errorf("placement %s at level %d: %w", p.Def.Name, p.Level, err)
		}
		index[k] = len(specs)
		specs = append(specs, sim.PlacementSpec{
			Species: p.Def.Name,
			Level:   p.Level,
			Spawns:  1,
			Tier:    p.Def.Tier,
			// Both terms come off the definition, never off a table here:
			// KillXPTierMultiplier is where the tier vocabulary lives, and
			// XPFactor is the authored species knob.
			TierMultiplier: p.Def.KillXPTierMultiplier(economy),
			XPFactor:       float64(p.Def.Factors.XPFactor),
			Mob:            mob,
		})
	}

	return sim.RunPlacements(sim.PlacementConfig{
		Zone:               in.zone,
		Specs:              specs,
		Player:             in.player,
		Curve:              in.curve,
		XP:                 in.xp,
		PlayerLevel:        in.playerLevel,
		ChainFights:        in.fights,
		DowntimeSeconds:    in.downtime,
		BaseSeed:           in.seed,
		Runs:               in.runs,
		MaxSecondsPerFight: in.maxSeconds,
	}), nil
}

// mobSpecByName derives one authored species' numbers, standing at a level —
// the CLI's -mob-preset path, mirroring -player-aura. level < 1 = the species'
// own curveLevel.
func mobSpecByName(contentDir, name string, level int) (sim.MobSpec, error) {
	defs, _, err := loadContent(contentDir)
	if err != nil {
		return sim.MobSpec{}, err
	}
	for _, def := range defs {
		if def.Name != name {
			continue
		}
		if level < 1 {
			level = def.CurveLevel
		}
		spec, err := mobSpecOf(def, level)
		if err != nil {
			return sim.MobSpec{}, fmt.Errorf("-mob-preset %q: %w", name, err)
		}
		return spec, nil
	}
	names := make([]string, 0, len(defs))
	for _, def := range defs {
		names = append(names, def.Name)
	}
	sort.Strings(names)
	return sim.MobSpec{}, fmt.Errorf("-mob-preset %q: unknown species (available: %s)", name, strings.Join(names, ", "))
}

// hasDamageEffect reports whether the definition carries any payload the sim
// models — damage_aura or dot_aura.
//
// ⚑ GATED damage does not count. The sim has no notion of `damage.Gated`, so a
// gate skill derives into a preset as if it were a full-power combat aura — and
// Harvest and Pickaxe then top the kills/hour table while being unable to
// scratch anything in the real game (a gated hit only damages targets whose
// resistances explicitly name one of its tags). Reporting the free gathering
// tool as the strongest damage aura in the game is worse than not reporting it,
// especially to a balance pass reading the table for exactly that ordering.
func hasDamageEffect(def *skills.SkillDefinition) bool {
	for _, e := range def.Effects {
		if e.Type == skills.EffectTypeDamageAura && e.Damage != nil && e.Damage.GateKey == "" {
			return true
		}
		if e.Type == skills.EffectTypeDotAura && e.Dot != nil {
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
		// The authored resource cost travels too (D15/L8) — an authored
		// preset that dropped it would report the pacing band held while
		// measuring a game where the aura is free.
		spec.CostFractionOfMax = direct.CostFractionAt(level)
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
		spec.DotCostFractionOfMax = dot.CostFractionAt(level)
		if direct == nil {
			spec.CostFractionOfMax = spec.DotCostFractionOfMax
			spec.DotCostFractionOfMax = 0
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

// mobSpecOf maps an authored definition, STANDING AT level, onto the sim's
// synthetic MobSpec. The aura is the first damage-dealing skill across the
// mob's aura loadout, level-scaled at the declared skill level — the same
// numbers the live SkillSystem would apply.
//
// ⚑ The level parameter is the whole of what makes the harness see a placement
// rather than only a species (C1.5, §13.3). Pass def.CurveLevel for the
// species' home position — every caller that predates C1.5 does, which is what
// makes the refactor byte-identical.
func mobSpecOf(def *mobs.MobDefinition, level int) (sim.MobSpec, error) {
	// f(level) is applied HERE because a definition no longer carries a
	// pre-derived pool or power scale — the live mob evaluates the curve at
	// its current level (plan-entity-model.md chunk 1b), which since
	// plan-mob-levels.md C1 is the SPAWN's level where one is authored. So
	// this is that same number: the sim keeps modelling exactly what the
	// SkillSystem applies to the mob actually standing there.
	powerScale := float32(def.Curve.F(level))
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
