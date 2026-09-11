package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// loadedContent is every registry a boot builds out of api/, in one value.
type loadedContent struct {
	factions   factions.Registry
	skills     skills.Registry
	mobs       mobs.Registry
	milestones []skills.MilestoneUnlock
	recipes    skills.RecipeRegistry
	quests     quests.Registry
	ascension  ascension.Catalog
	props      world.PropRegistry
	zones      []*world.Zone
}

// loadContent runs every content stage in dependency order and returns the
// registries plus one finding line per problem. It is THE load sequence: both
// the boot (which panics on any finding) and `aurad -validate` (which prints
// them and exits 1) consume this one function, so the dependency order cannot
// exist as two hand copies that drift apart (plan-content-editor.md §B4.9, D9).
//
// ⭐ IT NEVER STOPS AT THE FIRST PROBLEM. Independent stages keep running, so a
// broken prop and a broken skill are reported together rather than one per run.
// A stage whose input registry failed is SKIPPED and says so as its own
// finding, because a stage that silently did not run is indistinguishable from
// a stage that passed - and that is exactly how a clean-looking run would hide
// the second round of errors.
//
// ⚑ It builds registries only. Everything the boot does with them afterwards
// (the ECS world, campfires, the encounter registration) stays in main: those
// need a game, and -validate must not build one.
func loadContent(src contentSources, config *cfg.Config, zoneList []string) (loadedContent, []string) {
	var out loadedContent
	var findings []string

	fail := func(stage string, err error) {
		findings = append(findings, stageFindings(stage, err)...)
	}
	skip := func(stage string, missing ...string) {
		findings = append(findings, fmt.Sprintf("%s: skipped (%s did not load)", stage, strings.Join(missing, " + ")))
	}

	var okFactions, okSkills, okMobs, okQuests, okProps bool
	var err error

	// Factions load FIRST: since plan-faction-flips chunk 2 a skill may author
	// a targetFactions allowlist, resolved to bits at load (D8). Factions
	// themselves depend on nothing, and neither do props, which is why those
	// two are the stages a failure elsewhere can never silence.
	if out.factions, err = loadFactions(src.factions); err != nil {
		fail("factions", err)
	} else {
		okFactions = true
	}

	if !okFactions {
		skip("skills", "factions")
	} else if out.skills, err = loadSkills(src.skills, out.factions); err != nil {
		fail("skills", err)
	} else {
		okSkills = true
	}

	if !okSkills || !okFactions {
		skip("mobs", missing(input{okSkills, "skills"}, input{okFactions, "factions"})...)
	} else if out.mobs, err = loadMobs(out.skills, out.factions, config.LevelCurve(), src.mobs); err != nil {
		fail("mobs", err)
	} else {
		okMobs = true
	}

	if !okSkills {
		skip("milestones", "skills")
	} else if out.milestones, err = loadMilestoneUnlocks(src.milestones, out.skills); err != nil {
		fail("milestones", err)
	}

	if !okSkills {
		skip("recipes", "skills")
	} else if out.recipes, err = loadRecipes(src.recipes, out.skills); err != nil {
		fail("recipes", err)
	}

	if !okMobs {
		skip("quests", "mobs")
	} else if out.quests, err = loadQuests(src.quests, out.mobs); err != nil {
		fail("quests", err)
	} else {
		okQuests = true
	}

	if !okSkills || !okMobs || !okQuests {
		skip("ascension", missing(input{okSkills, "skills"}, input{okMobs, "mobs"}, input{okQuests, "quests"})...)
	} else if out.ascension, err = loadAscensionCatalog(src.ascension, out.skills, out.mobs, out.quests); err != nil {
		fail("ascension", err)
	}

	if out.props, err = loadProps(src.props); err != nil {
		fail("props", err)
	} else {
		okProps = true
	}

	// ⚑ Zones are PLACED here, with each zone's Origin already applied
	// (plan-underworld.md U1), so validating them validates the placement rules
	// too, not only the files.
	if !okMobs || !okProps {
		skip("zones", missing(input{okMobs, "mobs"}, input{okProps, "props"})...)
	} else if out.zones, err = loadZones(src.zones, zoneList, out.mobs, out.props); err != nil {
		fail("zones", err)
	}

	return out, findings
}

// missing names the failed inputs of a skipped stage, so the finding says which
// half to fix rather than only that something upstream broke.
type input struct {
	ok   bool
	name string
}

func missing(in ...input) []string {
	var out []string
	for _, i := range in {
		if !i.ok {
			out = append(out, i.name)
		}
	}
	return out
}

// stageFindings turns one stage's error into one finding line per problem.
//
// ⚑ It flattens errors.Join fan-outs ONLY (the `Unwrap() []error` shape the
// skills walker now returns), never the ordinary `%w` wrap chain: unwrapping
// that would strip the `cannot map "x.json":` context that names the file.
// Newlines are folded too, because a finding is one line by contract - the
// editor's seam reads stdout line by line.
func stageFindings(stage string, err error) []string {
	var out []string
	for _, leaf := range flattenJoined(err) {
		msg := strings.ReplaceAll(strings.TrimSpace(leaf.Error()), "\n", "; ")
		out = append(out, fmt.Sprintf("%s: %s", stage, msg))
	}
	return out
}

func flattenJoined(err error) []error {
	if err == nil {
		return nil
	}
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		var out []error
		for _, e := range joined.Unwrap() {
			out = append(out, flattenJoined(e)...)
		}
		return out
	}
	return []error{err}
}

// runValidate is `aurad -validate`: it loads all content, prints one finding
// per line to w, and returns the process exit code. 0 means the content is
// loadable, 1 means it is not. Anything else is the validator itself failing.
//
// ⚑ Findings go to w (stdout) and NOTHING ELSE does: slog writes to stderr in
// both handler branches (pkg/logging), so a caller may read stdout as a clean
// finding list while the loaders' own counts and warnings still reach a human.
// The trailing summary line is the only non-finding line, and it is last.
func runValidate(w io.Writer, src contentSources, config *cfg.Config, zoneList []string) int {
	_, findings := loadContent(src, config, zoneList)
	for _, f := range findings {
		fmt.Fprintln(w, f)
	}
	fmt.Fprintf(w, "%d finding(s)\n", len(findings))
	if len(findings) > 0 {
		return validateExitFindings
	}
	return validateExitClean
}

// Exit codes for -validate. 2 is what `flag` already uses for a bad flag, so
// "the validator could not run" and "you typed it wrong" agree.
const (
	validateExitClean    = 0
	validateExitFindings = 1
	validateExitBroken   = 2
)

// validateMain is the whole -validate path: resolve the content source, the
// config and the zone set exactly as a boot would, then validate. It returns
// before anything a boot does with the world, and in particular before
// openDatabase, so it needs neither AURA_DB_URL nor AURA_JWT_KEY (D9).
func validateMain(w io.Writer, contentDir, zoneNames, zoneName string) int {
	src := embeddedContent()
	if contentDir != "" {
		disk, err := diskContent(contentDir)
		if err != nil {
			// A content directory that is not there, or has no api/ layout, is
			// a finding about the content like any other - not a broken
			// validator. Same exit code an unloadable skill file gets.
			fmt.Fprintf(w, "content: %v\n", err)
			fmt.Fprintln(w, "1 finding(s)")
			return validateExitFindings
		}
		src = disk
	}
	config, err := validateConf()
	if err != nil {
		// The conf is the validator's own input, not the content under test:
		// without it there is no level curve and no zone set, so nothing can be
		// validated at all. That is a different outcome from "the content has
		// problems", and it gets a different exit code.
		slog.Error("cannot read config for -validate", slog.Any("err", err))
		return validateExitBroken
	}
	return runValidate(w, src, config, resolveZoneList(zoneNames, zoneName, config))
}

// validateConf resolves the config a -validate run measures against, the same
// way a boot does MINUS the side effect: AURAD_CONF, else ./conf.json, else the
// embedded conf.default.json parsed IN MEMORY.
//
// ⭐ THE POINT IS THAT IT NEVER WRITES ONE (PO ruling 2026-09-11). loadConf
// falls back to setupDefaultConfig, which writes ./conf.json to disk; a
// validation run is supposed to be a read of the repo, and a read that leaves a
// new file behind in whatever directory it was invoked from is not one.
func validateConf() (*cfg.Config, error) {
	configFile := strings.TrimSpace(os.Getenv("AURAD_CONF"))
	if configFile == "" {
		configFile = "./conf.json"
	}
	config, err := cfg.ReadConfig(configFile)
	if errors.Is(err, os.ErrNotExist) {
		slog.Info("no config file, validating against the embedded default",
			slog.String("looked_for", configFile))
		return cfg.ParseConfig(defaultConfig, "embedded conf.default.json")
	}
	if err != nil {
		return nil, err
	}
	slog.Info("reading config", slog.String("path", configFile))
	return config, nil
}

// resolveZoneList picks the zone set, most specific first: -zones, then -zone,
// then the conf's zones list, then its single zone. An empty result is valid -
// it means "the sole zone in the directory", which is what every conf did
// before the field existed.
//
// ⚑ ONE copy, shared by the boot and -validate, so the two cannot end up
// validating and running different sets of zones.
func resolveZoneList(zoneNames, zoneName string, config *cfg.Config) []string {
	if list := splitZoneList(zoneNames); len(list) > 0 {
		return list
	}
	if zoneName != "" {
		return []string{zoneName}
	}
	if len(config.Game.Zones) > 0 {
		return config.Game.Zones
	}
	if config.Game.Zone != "" {
		return []string{config.Game.Zone}
	}
	return nil
}
