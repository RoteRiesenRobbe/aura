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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
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
	areas      []string
	regions    []world.RegionName
	// darkness is each atmosphere profile's declared darkness, which the map
	// reveal reads (plan-map-fog-darkness.md C1).
	darkness map[string]float32
	// langEntries is every translatable content string by domain, and
	// langBundle the loaded translations (plan-localization.md C1).
	langEntries map[string][]lang.Entry
	langBundle  *lang.Bundle
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
func loadContent(src contentSources, config *cfg.Config, startZone string) (loadedContent, []string) {
	var out loadedContent
	var findings []string

	fail := func(stage string, err error) {
		findings = append(findings, stageFindings(stage, err)...)
	}
	skip := func(stage string, missing ...string) {
		findings = append(findings, fmt.Sprintf("%s: skipped (%s did not load)", stage, strings.Join(missing, " + ")))
	}

	var okFactions, okSkills, okMobs, okQuests, okProps, okAreas, okRegions, okZones bool
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

	// The art check (plan-skill-vfx.md §12f.4 E). It is a LEAF: nothing else
	// reads the body list, so it sits directly behind its only input rather
	// than at the end, where a reader would have to work out what it needed.
	if !okSkills {
		skip("skill bodies", "skills")
	} else if err = validateSkillBodies(src.skillFx, out.skills); err != nil {
		fail("skill bodies", err)
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

	// The area list depends on nothing, like props (P4b, D15).
	if out.areas, err = world.LoadAreaIDs(src.areas); err != nil {
		fail("areas", err)
	} else {
		okAreas = true
	}

	// So does the place list (plan-region-identity.md D2).
	if out.regions, err = world.LoadRegionList(src.regions); err != nil {
		fail("regions", err)
	} else {
		okRegions = true
	}

	// And the atmosphere darkness table (plan-map-fog-darkness.md C1).
	if out.darkness, err = world.LoadAtmosphereDarkness(src.atmospheres); err != nil {
		fail("atmospheres", err)
	}

	// ⚑ Zones are PLACED here, with each zone's Origin already applied
	// (plan-underworld.md U1), so validating them validates the placement rules
	// too, not only the files.
	if !okMobs || !okProps || !okAreas || !okRegions {
		skip("zones", missing(input{okMobs, "mobs"}, input{okProps, "props"}, input{okAreas, "areas"},
			input{okRegions, "regions"})...)
	} else if out.zones, err = loadZones(src.zones, startZone, out.mobs, out.props, out.skills, out.areas,
		out.regions); err != nil {
		fail("zones", err)
	} else {
		okZones = true
	}

	// A reach objective's region must be listed AND drawn, and takes the
	// listed title (plan-region-identity.md R2). The first point at which the
	// quests, the place list and the placed zones all exist.
	if !okQuests || !okZones {
		skip("quest regions", missing(input{okQuests, "quests"}, input{okZones, "zones"})...)
	} else if err = bindQuestRegions(out.quests, out.regions, out.zones); err != nil {
		fail("quest regions", err)
	}

	// Localization (plan-localization.md C1): the content text as keyed
	// entries, refused where authored English would not survive as ICU (L14),
	// and the translation overlays, refused when not UTF-8 or malformed (L17).
	// A LEAF stage: it reads the registries above and nothing reads it back.
	stock, stockErr := loadStockPhrases(src.lang)
	if stockErr != nil {
		fail("lang", stockErr)
	}
	if zoneNames, err := zoneNamesFrom(src.zones); err != nil {
		fail("lang", err)
	} else {
		var langFindings []string
		out.langEntries, langFindings = langEntries(out, zoneNames, stock)
		findings = append(findings, langFindings...)
	}
	if out.langBundle, err = lang.LoadOverlays(src.lang); err != nil {
		fail("lang", err)
	} else {
		// §8: a dialogue line matching a stock phrase falls back to its German.
		for _, e := range out.langEntries["mobs"] {
			if e.Stock != "" {
				out.langBundle.LinkStock(e.Key, e.Stock)
			}
		}
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
func runValidate(w io.Writer, src contentSources, config *cfg.Config, startZone string) int {
	_, findings := loadContent(src, config, startZone)
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
func validateMain(w io.Writer, contentDir, startZone string, debugZones bool) int {
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
	if debugZones {
		var err error
		if src, err = useDebugZones(src); err != nil {
			// Same posture as a missing content directory above.
			fmt.Fprintf(w, "content: %v\n", err)
			fmt.Fprintln(w, "1 finding(s)")
			return validateExitFindings
		}
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
	// Every zone file in the directory loads; the flag beats the conf on which
	// of them is PRIMARY (plan-zone-naming, the directory is the zone list).
	return runValidate(w, src, config, resolveStartZone(startZone, debugZones, config.Game.StartZone))
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

// bindQuestRegions hands quests.BindRegions the place titles and the ids the
// placed zones draw.
func bindQuestRegions(qr quests.Registry, list []world.RegionName, zones []*world.Zone) error {
	titles := make(map[string]string, len(list))
	for _, r := range list {
		titles[r.ID] = r.Title
	}
	drawn := map[string]bool{}
	for id := range world.CollectRegions(zones) {
		drawn[id] = true
	}
	warnings, err := quests.BindRegions(qr, titles, drawn)
	for _, w := range warnings {
		slog.Warn("unreachable quest region", slog.String("detail", w))
	}
	return err
}
