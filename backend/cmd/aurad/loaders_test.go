package main

import (
	"io/fs"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// TestDiskContent_RepoApiLoadsEndToEnd pins the -content disk-load path over
// the repo's api/ directory (the source of truth the embedded copies are
// synced from). Loading it through the full registry chain also puts the
// source content itself under load-time validation — the embedded-copy tests
// alone can't catch an api/ edit that was never cp-defs'd.
func TestDiskContent_RepoApiLoadsEndToEnd(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	skillsRegistry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	assert.NotEmpty(t, skillsRegistry.All())

	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	assert.NotEmpty(t, factionsRegistry.All())

	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	assert.NotEmpty(t, mobsRegistry.Mobs())

	// The repo roster must actually exercise mob factions: at least one
	// predator (non-empty mob-faction aggro set) and one passive prey species
	// ship (wildlife_predator / wildlife_prey since zone-editor C3 retired the
	// legacy pair).
	var hasHunter, hasPassive bool
	for _, m := range mobsRegistry.Mobs() {
		if m.AggroMask&^uint64(1<<factions.Aligned) != 0 {
			hasHunter = true
		}
		if m.Faction >= 2 && m.AggroMask == 0 {
			hasPassive = true
		}
	}
	assert.True(t, hasHunter, "repo content ships a mob-hunting faction")
	assert.True(t, hasPassive, "repo content ships a passive faction")

	// Round-7 item 3: after the mob registry resolves, every summoning skill's
	// spawn payload carries the summon's loadout — the tooltip's only way to
	// say what the totem/companion actually does.
	//
	// ⭐ ASSERTED AGAINST THE MOB DEFINITION rather than as a blanket NotEmpty
	// (plan-portal-spells.md C1). PortalHome is the first summon that authors NO
	// skills, and that is structural rather than an oversight twice over: a
	// portal is a doorway, so "Summons Portal for 30s" is already the whole
	// tooltip, AND the D2 recipe could not run an aura even if one were authored
	// (role creature gates its aura on a target, and nothing can reach the
	// portal's collision layer to become one). Satisfying the old form would
	// have meant inventing content to feed a test. The pin still catches exactly
	// what it was written for: an attach that silently stops running leaves a
	// real totem's loadout empty while its definition still lists skills.
	var spawnEffects, withLoadout int
	for _, sk := range skillsRegistry.All() {
		for _, effect := range sk.Effects {
			if effect.Spawn == nil {
				continue
			}
			spawnEffects++
			summoned, err := mobsRegistry.GetByName(effect.Spawn.MobName)
			require.NoError(t, err, "skill %q: spawnMob %q", sk.Name, effect.Spawn.MobName)
			assert.Len(t, effect.Spawn.SummonLoadout, len(summoned.Skills),
				"skill %q: spawn %q must carry the summon's loadout", sk.Name, effect.Spawn.MobName)
			if len(effect.Spawn.SummonLoadout) > 0 {
				withLoadout++
			}
		}
	}
	assert.NotZero(t, spawnEffects, "repo content ships summoning skills")
	// Keeps the check above from going vacuous the day every summon loses its
	// skills: at least one shipped summon must still have something to say.
	assert.NotZero(t, withLoadout, "repo content ships a summon with a loadout")

	recipeRegistry, err := skills.RecipesFromFS(content.recipes, skillsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, recipeRegistry.All())

	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)
	assert.NotEmpty(t, propsRegistry.Props())

	milestoneUnlocks, err := skills.MilestoneUnlocksFromFS(content.milestones, skillsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, milestoneUnlocks)

	// EVERY shipped zone must load by stem — a zone that only breaks when
	// selected would otherwise ship broken. Selecting by stem also proves
	// multi-zone selection against real content.
	stems, err := fs.Glob(content.zones, "*.json")
	require.NoError(t, err)
	require.NotEmpty(t, stems)
	for _, file := range stems {
		stem := strings.TrimSuffix(file, ".json")
		zone, err := world.LoadZoneFS(content.zones, stem, mobsRegistry, propsRegistry)
		require.NoError(t, err, "zone %q must load", stem)
		assert.Equal(t, stem, zone.ID)
		assert.Positive(t, zone.Bounds.Width)
		assert.Positive(t, zone.Bounds.Height)
		// every zone prop resolves against the prop registry at load time
		for _, p := range zone.Props {
			assert.NotNil(t, p.Def)
		}
		// every spawn resolves against the mob registry at load time
		for _, s := range zone.Spawns {
			assert.NotNil(t, s.Def)
		}
	}

	// The live world carries authored terrain and both chunk-5 movement
	// archetypes — keep the terrain + wander/waypoint parsing pipelines pinned
	// against real content. (This pin sat on proving-grounds until zone-editor
	// C3 retired that map.)
	zone, err := world.LoadZoneFS(content.zones, "world", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, zone.Terrain, "the world should carry authored terrain")
	var wanderers, patrollers int
	for _, s := range zone.Spawns {
		if s.EffectiveWanderRadius() > 0 {
			wanderers++
		}
		if len(s.Waypoints) > 0 {
			patrollers++
		}
	}
	assert.NotZero(t, wanderers, "the world should exercise local wander")
	assert.NotZero(t, patrollers, "the world should exercise route patrol")
}

// TestDiskContent_MissingSubdirFails pins the loud-failure contract: a
// -content dir without the api/ layout must error at startup, not surface as
// an empty registry later.
func TestDiskContent_MissingSubdirFails(t *testing.T) {
	_, err := diskContent(t.TempDir())
	assert.Error(t, err)
}

// TestContentSources_CoverEveryApiSubdirectory is the standing landmine as a
// test: a new content directory that nobody adds to contentSources loads
// nothing and SAYS NOTHING — every edit in it silently no-ops until someone
// wonders why their JSON has no effect.
//
// ⚑ It enumerates api/ by reading the filesystem rather than listing the
// directories by hand, because a hand-maintained list here would need the same
// edit it exists to catch. contentSources' field names ARE the directory names,
// which is what makes the comparison possible at all — keep it that way.
func TestContentSources_CoverEveryApiSubdirectory(t *testing.T) {
	// schema/ holds the .fbs protocol definitions, which are compiled into
	// bindings at build time and never loaded as content.
	const notContent = "schema"

	dirEntries, err := os.ReadDir("../../../api")
	require.NoError(t, err)
	authored := []string{}
	for _, e := range dirEntries {
		if e.IsDir() && e.Name() != notContent {
			authored = append(authored, e.Name())
		}
	}
	require.NotEmpty(t, authored)

	wired := map[string]bool{}
	sourceType := reflect.TypeOf(contentSources{})
	for i := 0; i < sourceType.NumField(); i++ {
		wired[sourceType.Field(i).Name] = true
	}

	for _, dir := range authored {
		assert.True(t, wired[dir],
			"api/%s/ is not a contentSources field — every edit in it silently no-ops. "+
				"Add it to contentSources, embeddedContent, diskContent and the Makefile's cp-defs", dir)
	}
}

// The embedded milestone table must match the authored one in api/. They drift
// only when cp-defs did not run (or stopped copying the directory), and the
// symptom is nasty: -content boots the correct table while the default
// embedded build serves a stale one.
func TestEmbeddedMilestones_MatchSource(t *testing.T) {
	disk, err := diskContent("../../../api")
	require.NoError(t, err)

	want, err := fs.ReadFile(disk.milestones, "milestone-unlocks.json")
	require.NoError(t, err)
	got, err := fs.ReadFile(embeddedContent().milestones, "milestone-unlocks.json")
	require.NoError(t, err)

	assert.JSONEq(t, string(want), string(got),
		"embedded milestone table is stale — run `make -C backend cp-defs`")
}

// mustLoadFactions loads the faction registry a skill's targetFactions
// allowlist resolves against (plan-faction-flips D8) — the reason boot now
// loads factions before skills.
func mustLoadFactions(t *testing.T, c contentSources) factions.Registry {
	t.Helper()
	fr, err := factions.RegistryFromFS(c.factions)
	require.NoError(t, err)
	return fr
}

// The Camp definition is referenced ONLY from Go (sys.applyCamp builds it by
// name), so it is invisible to the loader's spawnMob cross-validation and to
// every zone spawn list — nothing in the boot path would notice if it were
// renamed or deleted. Deleting it would turn the Camp button into a silent
// no-op with a log line nobody reads, so the resolution is pinned here.
func TestDiskContent_CampDefinitionResolves(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)

	// The name is the contract: sys.applyCamp looks it up by this string.
	def, err := mobsRegistry.GetByName("Camp")
	require.NoError(t, err, "api/mobs/camp.json must resolve — the Camp utility builds it by name")
	assert.Equal(t, mobs.RoleStructure, def.Role, "a camp is planted, not a creature")
	require.Len(t, def.Skills, 1, "the camp carries exactly its heal + light aura")
	assert.Equal(t, "CampAura", def.Skills[0].Def.Name)
}

// ⭐ THE REAL CONTENT, THROUGH THE REAL WIRING (plan-ascension.md §13 step 2).
// The unit tests use stub gates; this one proves the boot sequence actually
// hands the catalog the mob and quest registries, which is the half a stub can
// never check. It is deliberately written to pass with today's EMPTY catalog and
// to keep meaning something once C3's step 4 authors the seed: every gate the
// repo ships must resolve, whatever it comes to gate on.
//
// ⛑ Without this the failure mode is exactly finding 2's: a catalog whose
// conditions nothing validated, booting green, with entries no player can pick.
func TestDiskContent_AscensionGatesResolveAgainstTheRealWorld(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	skillsRegistry := loadSkills(content.skills, mustLoadFactions(t, content))
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	questsRegistry := loadQuests(content.quests, mobsRegistry)

	// panics on any unresolvable gate, which IS the assertion (curated content).
	catalog := loadAscensionCatalog(content.ascension, skillsRegistry, mobsRegistry, questsRegistry)

	for _, entry := range catalog.All() {
		for _, cond := range entry.Conditions {
			if cond.Kind == mobs.ConditionKillsThisLife {
				assert.NotZero(t, cond.SpeciesID,
					"entry %q gates on kills of %q and it never resolved", entry.UnlockKey, cond.Species)
			}
		}
	}
}

// ⚑ catalogGates is exercised by nothing else while api/ascension/ is empty
// (C3 step 4 authors the seed), and an adapter nobody runs is the shape that
// shipped as dead code once already in this plan (C2a's P13). This runs both
// halves against the real registries, so the wiring is proven before there is
// content depending on it.
func TestCatalogGates_ResolveAgainstTheRealRegistries(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	skillsRegistry := loadSkills(content.skills, mustLoadFactions(t, content))
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	gates := catalogGates{mobs: mobsRegistry, quests: loadQuests(content.quests, mobsRegistry)}

	// The species half: D27's directed hunt names this one, and it must resolve
	// to the id the kill ledger counts by.
	id, err := gates.ResolveSpecies("DireWolf")
	require.NoError(t, err)
	assert.NotZero(t, id)
	wolf, err := mobsRegistry.GetByName("DireWolf")
	require.NoError(t, err)
	assert.Equal(t, wolf.ID, id, "the gate must count the same species the world spawns")

	_, err = gates.ResolveSpecies("DireWulf")
	assert.Error(t, err, "a typo cannot resolve")

	// The quest half: P8's gate, the SHIPPED vocabulary rather than a new kind.
	assert.NoError(t, gates.CheckQuestStage("the-lost-lamp", "completed"))
	assert.Error(t, gates.CheckQuestStage("the-lost-lantern", "completed"))
	assert.Error(t, gates.CheckQuestStage("the-lost-lamp", "nosuchstage"))
}
