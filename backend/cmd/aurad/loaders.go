package main

import (
	"bufio"
	_ "embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	aascension "github.com/RoteRiesenRobbe/aura/pkg/api/ascension"
	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amilestones "github.com/RoteRiesenRobbe/aura/pkg/api/milestones"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	aprops "github.com/RoteRiesenRobbe/aura/pkg/api/props"
	aquests "github.com/RoteRiesenRobbe/aura/pkg/api/quests"
	arecipes "github.com/RoteRiesenRobbe/aura/pkg/api/recipes"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	azones "github.com/RoteRiesenRobbe/aura/pkg/api/zones"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// contentSources bundles the definition-file systems the loaders consume.
// The default is the go:embed copies under pkg/api (synced from the repo's
// api/ via `make cp-defs`); the -content flag swaps in a live disk directory
// with the api/ layout, so content edits need neither cp-defs nor a rebuild —
// only a server restart. Every tunable definition file lives under api/ and is
// covered here — keep it that way, or a content edit silently no-ops until
// someone remembers the rebuild.
type contentSources struct {
	mobs       fs.FS
	skills     fs.FS
	recipes    fs.FS
	zones      fs.FS
	props      fs.FS
	factions   fs.FS
	milestones fs.FS
	quests     fs.FS
	ascension  fs.FS
}

func embeddedContent() contentSources {
	return contentSources{
		mobs:       amobs.Mobs,
		skills:     askills.Skills,
		recipes:    arecipes.Recipes,
		zones:      azones.Zones,
		props:      aprops.Props,
		factions:   afactions.Factions,
		milestones: amilestones.Milestones,
		quests:     aquests.Quests,
		ascension:  aascension.Ascension,
	}
}

// diskContent loads content from dir, which must have the repo api/ layout
// (mobs/, skills/, recipes/, zones/, props/, factions/, milestones/, quests/,
// ascension/).
// Missing subdirectories hard-fail here — content errors are loud, matching
// the registry ethos.
func diskContent(dir string) (contentSources, error) {
	root := os.DirFS(dir)
	sub := func(name string) (fs.FS, error) {
		if _, err := fs.Stat(root, name); err != nil {
			return nil, fmt.Errorf("content dir %q: %w", dir, err)
		}
		return fs.Sub(root, name)
	}

	var c contentSources
	var err error
	if c.mobs, err = sub("mobs"); err != nil {
		return contentSources{}, err
	}
	if c.skills, err = sub("skills"); err != nil {
		return contentSources{}, err
	}
	if c.recipes, err = sub("recipes"); err != nil {
		return contentSources{}, err
	}
	if c.zones, err = sub("zones"); err != nil {
		return contentSources{}, err
	}
	if c.props, err = sub("props"); err != nil {
		return contentSources{}, err
	}
	if c.factions, err = sub("factions"); err != nil {
		return contentSources{}, err
	}
	if c.milestones, err = sub("milestones"); err != nil {
		return contentSources{}, err
	}
	if c.quests, err = sub("quests"); err != nil {
		return contentSources{}, err
	}
	if c.ascension, err = sub("ascension"); err != nil {
		return contentSources{}, err
	}
	return c, nil
}

//go:embed conf.default.json
var defaultConfig []byte

// loadFactions parses the faction definitions mob allegiances resolve
// against (mob-depth chunk 6.6). Curated content: any validation failure
// aborts startup.
func loadFactions(fsys fs.FS) factions.Registry {
	registry, err := factions.RegistryFromFS(fsys)
	if err != nil {
		slog.Error("failed to load factions", slog.Any("err", err))
		panic(err)
	}
	// All() includes the two reserved built-ins (aligned, hostile).
	slog.Info("Loaded faction definitions", slog.Int("count", len(registry.All())))
	return registry
}

// loadMobs parses the mob definitions from the definition files, resolving
// skill loadouts against the skill registry and factions against the faction
// registry; tier+baseline numbers derive against c, the conf-driven f(L)
// curve (C0).
func loadMobs(sr skills.Registry, fr factions.Registry, c curve.Curve, fsys fs.FS) mobs.Registry {
	registry, err := mobs.RegistryFromFS(sr, fr, c, fsys)
	if err != nil {
		slog.Error("failed to load mobs", slog.Any("err", err))
		panic(err)
	}

	mobList := registry.Mobs()
	slog.Info("Loaded mob definitions", slog.Int("count", len(mobList)))
	sort.Sort(mobs.ByID(mobList))
	for _, m := range mobList {
		slog.Debug(fmt.Sprintf("%3d: %s (%s)", m.ID, m.Name, m.Type))
		// A live mob referencing legacy-tagged content means the tag went
		// stale — untag the content or retire the reference (step-7 A.5).
		if len(m.LegacyRefs) > 0 {
			slog.Warn("live mob references legacy-tagged content",
				slog.String("mob", m.Name),
				slog.String("refs", strings.Join(m.LegacyRefs, ", ")))
		}
	}
	return registry
}

// loadSkills parses the skill definitions from the definition files, resolving
// any authored targetFactions allowlist against the already-loaded faction
// registry (plan-faction-flips D8).
func loadSkills(fsys fs.FS, fr factions.Registry) skills.Registry {
	registry, err := skills.RegistryFromFS(fsys, fr)
	if err != nil {
		slog.Error("failed to load skills", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded skill definitions", slog.Int("count", len(registry.All())))
	return registry
}

// loadQuests parses the quest definitions, resolving authored species and
// conversant names against the mob registry (plan-quests.md C1, L12).
// Curated content: any validation failure aborts startup.
func loadQuests(fsys fs.FS, mr mobs.Registry) quests.Registry {
	registry, err := quests.RegistryFromFS(fsys, mr)
	if err != nil {
		slog.Error("failed to load quests", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded quest definitions", slog.Int("count", len(registry.All())))

	// Cross-validate the quest references authored on conversation rows, and
	// register the dialogue edges those rows create (plan-quests.md C2).
	//
	// ⚑ It has to happen HERE rather than in either loader: mobs load first (quest
	// objectives resolve species names against them, L12), so mapToInteraction has
	// no quest registry to check against, and a stage's terminality is knowable
	// only once every row in the world has been seen.
	warnings, err := quests.CrossValidate(mr, registry)
	if err != nil {
		slog.Error("failed to cross-validate quest dialogue", slog.Any("err", err))
		panic(err)
	}
	// Content that loads and runs but cannot be reached in play — a warning rather
	// than a boot failure, because the QUEST cheat deliberately drives a quest
	// before its rows exist, which is how quest content is iterated on.
	for _, w := range warnings {
		slog.Warn("unreachable quest content", slog.String("detail", w))
	}
	return registry
}

// loadRecipes parses the combination recipes, resolving result and
// ingredient skill names against the provided registry. Curated content: any
// validation failure aborts startup.
func loadRecipes(fsys fs.FS, r skills.Registry) skills.RecipeRegistry {
	registry, err := skills.RecipesFromFS(fsys, r)
	if err != nil {
		slog.Error("failed to load recipes", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded recipe definitions", slog.Int("count", len(registry.All())))
	return registry
}

// loadProps parses the prop definitions the zone's props resolve against.
// Curated content: any validation failure aborts startup.
func loadProps(fsys fs.FS) world.PropRegistry {
	registry, err := world.PropRegistryFromFS(fsys)
	if err != nil {
		slog.Error("failed to load props", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded prop definitions", slog.Int("count", len(registry.Props())))
	return registry
}

// loadZone parses the server-authoritative zone file, resolving spawn mob
// names against the mob registry and prop types against the prop registry.
// Curated content: any validation failure aborts startup.
func loadZone(fsys fs.FS, name string, mr mobs.Registry, pr world.PropRegistry) *world.Zone {
	zone, err := world.LoadZoneFS(fsys, name, mr, pr)
	if err != nil {
		slog.Error("failed to load zone", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded zone",
		slog.String("id", zone.ID),
		slog.String("name", zone.Name),
		slog.Float64("width", float64(zone.Bounds.Width)),
		slog.Float64("height", float64(zone.Bounds.Height)),
		slog.Int("props", len(zone.Props)),
		slog.Int("spawns", len(zone.Spawns)))
	// A live zone referencing legacy-tagged content means the tag went stale —
	// untag the content or retire the reference (step-7 A.5).
	if len(zone.LegacyRefs) > 0 {
		slog.Warn("live zone references legacy-tagged content",
			slog.String("zone", zone.ID),
			slog.String("refs", strings.Join(zone.LegacyRefs, ", ")))
	}
	return zone
}

// loadMilestoneUnlocks parses the milestone-unlock table and resolves skill
// names against the provided registry. Curated content: any validation failure
// aborts startup.
func loadMilestoneUnlocks(fsys fs.FS, r skills.Registry) []skills.MilestoneUnlock {
	unlocks, err := skills.MilestoneUnlocksFromFS(fsys, r)
	if err != nil {
		slog.Error("failed to load milestone unlocks", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded milestone unlocks", slog.Int("count", len(unlocks)))
	return unlocks
}

// memorialNameLimit is how many names the memorial lists at once, and
// memorialRefreshInterval how often the listing is re-read
// (plan-ascension.md C3 step 5, P23/P27). Both [PLACEHOLDER].
//
// ⚑ The LIMIT is a wire constraint before it is a taste one: a generated
// conversation row carries its position as a ubyte, and the ascension catalog
// has already reserved 254 (the empty pick) and 255 (the no-grant sentinel), so
// a monument listing hundreds of names would alias into both. 25 sits nowhere
// near that ceiling on purpose: the cap exists to keep the panel readable, and
// the wire limit is the backstop nobody should ever reach.
//
// ⚑ The INTERVAL bounds how stale the stone may be, and the number that matters
// is not how fast a new name appears but how long an ERASED one lingers:
// DiscardAnonymousAccount runs off the loop, so this is the window in which a
// name a player asked to have removed is still readable.
const (
	memorialNameLimit       = 25
	memorialRefreshInterval = 60 * time.Second
)

// loadAscensionCatalog parses the ascension reward catalog, resolving every
// unlockKey against the skill registry (plan-ascension.md C1) and every authored
// GATE against the mob and quest registries (§13 step 2). Curated content: any
// validation failure aborts startup.
//
// ⚑ It runs LAST in the boot sequence, and that is what makes the gate half
// cheap: skills → mobs → quests → this, so both registries a gate can reference
// are already standing. No new pass and no reordering, only a wider signature.
//
// ⚑ An EMPTY catalog is not a failure — the directory ships README-only until
// C3 authors the seed, and an exhausted catalog is a designed end state (D14).
func loadAscensionCatalog(fsys fs.FS, r skills.Registry, mr mobs.Registry, qr quests.Registry) ascension.Catalog {
	catalog, err := ascension.CatalogFromFS(fsys, r, catalogGates{mobs: mr, quests: qr})
	if err != nil {
		slog.Error("failed to load the ascension catalog", slog.Any("err", err))
		panic(err)
	}
	slog.Info("Loaded ascension rewards", slog.Int("count", len(catalog.All())))

	// The other direction: what the SITES authored (plan-ascension-sites.md C3).
	// It rides here rather than in its own boot step for the reason above — this
	// is already the point where both registries stand — and it is the only pass
	// that can run it at all, since neither package may import the other.
	warnings, err := ascension.CrossValidate(mr, catalog)
	if err != nil {
		slog.Error("failed to cross-validate the ascension sites", slog.Any("err", err))
		panic(err)
	}
	// Content that loads and runs but that nobody offers — a warning rather than
	// a boot failure (P7), following the unreachable-quest-content precedent
	// twenty lines up: authoring a reward and placing it on a stone are two edits.
	for _, w := range warnings {
		slog.Warn("unreachable ascension reward", slog.String("detail", w))
	}
	return catalog
}

// catalogGates lets a catalog entry's gates reach the rest of the world without
// the ascension package importing the quest one: the species half resolves
// against the mob registry, and the quest half runs the SAME check the dialogue
// rows run (quests.CheckStageRef), which is the reuse §13 step 2 asked for
// rather than a second implementation of the same rule.
type catalogGates struct {
	mobs   mobs.Registry
	quests quests.Registry
}

func (g catalogGates) ResolveSpecies(name string) (mobs.MobID, error) {
	def, err := g.mobs.GetByName(name)
	if err != nil {
		return 0, err
	}
	return def.ID, nil
}

func (g catalogGates) CheckQuestStage(questID, stage string) error {
	return quests.CheckStageRef(g.quests, questID, stage)
}

// loadConf parses the config file
func loadConf() *cfg.Config {
	configFile := strings.TrimSpace(os.Getenv("AURAD_CONF"))
	if configFile == "" {
		configFile = "./conf.json"
	}
	slog.Info("reading config", slog.String("path", configFile))
	config, err := cfg.ReadConfig(configFile)
	if errors.Is(err, os.ErrNotExist) {
		config, err = setupDefaultConfig()
		if err != nil {
			slog.Error("cannot read config", slog.String("file", configFile), slog.Any("err", err))
			panic(err)
		}
	} else if err != nil {
		slog.Error("cannot read config", slog.String("file", configFile), slog.Any("err", err))
		panic(err)
	}
	return config
}

// setupDefaultConfig creates a default config file if non is found
func setupDefaultConfig() (*cfg.Config, error) {
	path := "./conf.json"
	slog.Info("setting up default config", slog.String("path", path))
	err := os.WriteFile(path, defaultConfig, 0o644)
	if err != nil {
		return nil, fmt.Errorf("cannot write default config: %w", err)
	}

	return cfg.ReadConfig(path)
}

func loadOrCreateTokens(tokenFile string) []string {
	f, err := os.Open(tokenFile)
	if os.IsNotExist(err) {
		absPath, _ := filepath.Abs(tokenFile)
		slog.Info("Tokens file not found, creating", slog.String("file", absPath))
		tkns, err := createTokens(tokenFile)
		if err != nil {
			slog.Info("failed to create token file, temporary token created", slog.String("token", tkns[0]))
			return []string{}
		}
		return tkns
	} else if err != nil {
		slog.Info("Cannot read tokens", slog.String("file", tokenFile), slog.Any("error", err))
		return []string{}
	}
	s := bufio.NewScanner(f)

	tokens := make([]string, 0, 8)
	for s.Scan() {
		tokens = append(tokens, s.Text())
	}

	return tokens
}

func createTokens(tokenFile string) ([]string, error) {
	s := uuid.Must(uuid.NewRandom()).String()

	err := os.WriteFile(tokenFile, []byte(s+"\n"), 0o644)
	if err != nil {
		absPath, _ := filepath.Abs(tokenFile)
		return nil, fmt.Errorf("failed to create tokens file %s: %w", absPath, err)
	}
	return []string{s}, err
}
