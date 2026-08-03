package main

import (
	"io/fs"
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

	// The chunk-6.6 smoke content must actually exercise mob factions: at
	// least one predator (non-empty mob-faction aggro set) and one passive
	// prey species ship in the repo roster.
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

	// The proving-grounds zone (the default debug/test map since 2026-07-11)
	// carries authored terrain and both chunk-5 movement archetypes — keep the
	// terrain + wander/waypoint parsing pipelines pinned against real content.
	zone, err := world.LoadZoneFS(content.zones, "proving-grounds", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, zone.Terrain, "proving-grounds should carry authored terrain")
	var wanderers, patrollers int
	for _, s := range zone.Spawns {
		if s.EffectiveWanderRadius() > 0 {
			wanderers++
		}
		if len(s.Waypoints) > 0 {
			patrollers++
		}
	}
	assert.NotZero(t, wanderers, "proving-grounds should exercise local wander")
	assert.NotZero(t, patrollers, "proving-grounds should exercise route patrol")
}

// TestDiskContent_LegacyTagging pins the step-7 A.5 legacy separation against
// the real repo content: the proving-grounds-only set is tagged (re-traced
// 2026-07-21 — the item-12 audit's "5 player skills / 6 mob skills" was stale;
// all 5 player skills and HealerAura are world-reachable via drops/teachings/
// summons and stay live), and no live content references a legacy def.
func TestDiskContent_LegacyTagging(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	skillsRegistry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)

	var legacySkills, legacyFactions, legacyMobs []string
	for _, s := range skillsRegistry.All() {
		if s.Legacy {
			legacySkills = append(legacySkills, s.Name)
		}
	}
	for _, f := range factionsRegistry.All() {
		if f.Legacy {
			legacyFactions = append(legacyFactions, f.Name)
		}
	}
	for _, m := range mobsRegistry.Mobs() {
		if m.Legacy {
			legacyMobs = append(legacyMobs, m.Name)
		}
		assert.Empty(t, m.LegacyRefs, "live mob %q must not reference legacy content", m.Name)
	}

	assert.ElementsMatch(t, []string{
		"MammothAura", "AngryMammothAura", "AngryMammothStomp", "SaberToothCatAura", "DodoAura",
	}, legacySkills)
	assert.ElementsMatch(t, []string{"predator", "prey", "tusker"}, legacyFactions)
	assert.ElementsMatch(t, []string{
		"Mammoth", "AngryMammoth", "SaberToothCat", "Dodo", "Rabbit",
		"Healer", "Brazier", "ProvingAdd", "ProvingBoss", "ProvingGuard",
	}, legacyMobs)

	// The live world must stay legacy-free; proving-grounds is the tagged
	// legacy home and therefore warns about nothing.
	worldZone, err := world.LoadZoneFS(content.zones, "world", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	assert.False(t, worldZone.Legacy)
	assert.Empty(t, worldZone.LegacyRefs, "the live world must not reference legacy content")

	pgZone, err := world.LoadZoneFS(content.zones, "proving-grounds", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	assert.True(t, pgZone.Legacy)
	assert.Empty(t, pgZone.LegacyRefs)
}

// TestDiskContent_MissingSubdirFails pins the loud-failure contract: a
// -content dir without the api/ layout must error at startup, not surface as
// an empty registry later.
func TestDiskContent_MissingSubdirFails(t *testing.T) {
	_, err := diskContent(t.TempDir())
	assert.Error(t, err)
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
