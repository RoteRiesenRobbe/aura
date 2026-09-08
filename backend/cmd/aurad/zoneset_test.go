package main

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The placed-zone-set boot path (plan-underworld.md U1).
//
// ⭐ THE POINT OF U1 IS THAT IT CHANGES NOTHING YET. The set loader, the
// per-zone walls and the offset all ship while exactly one zone is configured,
// so the only thing worth proving at this seam is that the real shipped world
// still loads to byte-identical geometry through the new path.

func repoZoneRegistries(t *testing.T) (mobs.Registry, world.PropRegistry) {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, factionsRegistry)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)
	return mobsRegistry, propsRegistry
}

// The inertness pin: the shipped world loaded through the SET loader must be
// indistinguishable from the same file loaded the old way. A regression here is
// the whole world silently shifting.
func TestZoneSet_RepoWorldIsUnmovedByThePlacedPath(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	mr, pr := repoZoneRegistries(t)

	single, err := world.LoadZoneFS(content.zones, "world", mr, pr)
	require.NoError(t, err)

	content2, err := diskContent("../../../api")
	require.NoError(t, err)
	set, err := world.LoadZonesFS(content2.zones, []string{"world"}, mr, pr)
	require.NoError(t, err)
	require.Len(t, set, 1)
	placed := set[0]

	assert.Equal(t, float32(0), placed.Origin.X, "the overworld sits at the origin and always will")
	assert.Equal(t, float32(0), placed.Origin.Y)
	require.Equal(t, len(single.Props), len(placed.Props))
	for i := range single.Props {
		require.Equal(t, single.Props[i].X, placed.Props[i].X, "prop %d moved", i)
		require.Equal(t, single.Props[i].Y, placed.Props[i].Y, "prop %d moved", i)
	}
	require.Equal(t, len(single.Spawns), len(placed.Spawns))
	for i := range single.Spawns {
		require.Equal(t, single.Spawns[i].X, placed.Spawns[i].X, "spawn %d moved", i)
		require.Equal(t, single.Spawns[i].Y, placed.Spawns[i].Y, "spawn %d moved", i)
	}
	for i := range single.Campfires {
		require.Equal(t, single.Campfires[i].X, placed.Campfires[i].X, "campfire %d moved", i)
	}
	for i := range single.Anchors {
		require.Equal(t, single.Anchors[i].X, placed.Anchors[i].X, "anchor %q moved", single.Anchors[i].Name)
	}
}

// An empty list still boots as the sole zone in the directory — the behaviour
// every conf had before this field existed.
// ⛑ THE SOLE-ZONE PATH IS GONE, and its disappearance is the news rather than
// a regression: api/zones/ holds two files since the underworld shipped, so
// "load whatever is in there" no longer has an answer. Every boot path now
// names its zones - the confs do, and -zone/-zones do. This pins the REFUSAL,
// because the alternative a loader could have chosen (pick the first one) would
// silently boot the wrong world.
func TestZoneSet_AnEmptyListNoLongerHasASoleZoneToLoad(t *testing.T) {
	mobsRegistry, propsRegistry := repoZoneRegistries(t)
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	_, err = world.LoadZonesFS(content.zones, nil, mobsRegistry, propsRegistry)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "world")
	assert.Contains(t, err.Error(), "underworld")
}
func TestZoneSet_RejectsAZoneListedTwice(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	mr, pr := repoZoneRegistries(t)

	_, err = world.LoadZonesFS(content.zones, []string{"world", "world"}, mr, pr)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "listed twice")
}

// ⚑ One wall PER ZONE, each at its own centre. A single rectangle spanning
// everything would make the empty space between two zones walkable.
func TestZoneSet_WallsForGivesEachZoneItsOwnRectangle(t *testing.T) {
	walls := wallsFor([]*world.Zone{
		{ID: "world", Bounds: world.Bounds{Width: 144, Height: 72}},
		{ID: "under", Bounds: world.Bounds{Width: 60, Height: 40}, Origin: world.Point{X: 0, Y: -500}},
	})
	require.Len(t, walls, 2)
	assert.Equal(t, cfg.PlacedBounds{
		Bounds: cfg.Bounds{Width: 144, Height: 72}, ZoneID: "world",
	}, walls[0])
	assert.Equal(t, cfg.PlacedBounds{
		Bounds: cfg.Bounds{Width: 60, Height: 40}, OriginX: 0, OriginY: -500, ZoneID: "under",
	}, walls[1])
}

func TestZoneSet_FlattensSpawnsAndCampfiresAcrossZones(t *testing.T) {
	a := &world.Zone{ID: "world", Spawns: []world.Spawn{{Mob: "Wolf"}}, Campfires: []world.Campfire{{ID: "spawnpoint-1"}}}
	b := &world.Zone{ID: "under", Spawns: []world.Spawn{{Mob: "Bat"}, {Mob: "Rat"}}, Campfires: []world.Campfire{{ID: "u-1"}}}

	assert.Len(t, allSpawns([]*world.Zone{a, b}), 3)
	assert.Len(t, allCampfires([]*world.Zone{a, b}), 2)
	// The single-zone path returns the zone's own slice untouched, which is
	// what keeps a one-zone boot allocation-identical to before.
	assert.Len(t, allSpawns([]*world.Zone{a}), 1)
}

// The anchor table an anchor-mode travel_to row resolves against
// (plan-underworld.md U3).
//
// ⭐ ONE FLAT MAP ACROSS THE SET, which is what lets an entrance in one zone
// name a destination in another without knowing that zone exists. It is only
// faithful because names are unique set-wide (world.Place checkSetWide, L5b) -
// without that rule this merge would silently keep whichever zone came last.
func TestZoneSet_FlattensAnchorsAcrossZones(t *testing.T) {
	a := &world.Zone{ID: "world", Anchors: []world.Anchor{{Name: "surface-return", X: 5, Y: 6}}}
	b := &world.Zone{ID: "under", Anchors: []world.Anchor{{Name: "underworld-entry", X: 1, Y: -499}}}

	anchors := allAnchors([]*world.Zone{a, b})
	require.Len(t, anchors, 2)
	assert.Equal(t, world.Point{X: 5, Y: 6}, anchors["surface-return"])
	assert.Equal(t, world.Point{X: 1, Y: -499}, anchors["underworld-entry"],
		"already in world coordinates - Place applied the Origin before this runs")
}

// Nil rather than an empty map, so a world with no anchors leaves the seam
// unwired instead of wired to nothing. Both refuse every anchor row; the
// difference is only that one of them allocates.
func TestZoneSet_AllAnchorsIsNilWhenNothingIsAnchored(t *testing.T) {
	assert.Nil(t, allAnchors([]*world.Zone{{ID: "world"}}))
}

// The shipped set, end to end over the REAL content: two zones, two passages,
// four doors, and every one of them leads somewhere.
//
// ⭐ IT IS ALSO THE COUPLING PIN. The surface places two CaveMouths, so the
// moment a boot leaves the underworld out those doors have no destination and
// world.CrossValidateTravelAnchors refuses - by design, and the reason there is
// no half-on state to ship. Both halves are asserted here so the refusal reads
// as intended behaviour rather than an accident somebody should "fix".
func TestZoneSet_TheShippedPairIsWhole(t *testing.T) {
	mobsRegistry, propsRegistry := repoZoneRegistries(t)
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	zones, err := world.LoadZonesFS(content.zones, []string{"world", "underworld"},
		mobsRegistry, propsRegistry)
	require.NoError(t, err)

	warnings, err := world.CrossValidateTravelAnchors(mobsRegistry, zones)
	require.NoError(t, err, "every placed door must lead somewhere")
	assert.Empty(t, warnings, "and nothing is left unplaced: %v", warnings)
}

// The other half of the coupling: the surface alone is NOT a bootable world any
// more. ⚑ The message has to name the mob, the zone and the missing anchor,
// because the fix could be any of the three.
func TestZoneSet_TheSurfaceAloneRefusesBecauseItsDoorsLeadNowhere(t *testing.T) {
	mobsRegistry, propsRegistry := repoZoneRegistries(t)
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	zones, err := world.LoadZonesFS(content.zones, []string{"world"}, mobsRegistry, propsRegistry)
	require.NoError(t, err, "the zone file itself is still fine on its own")

	_, err = world.CrossValidateTravelAnchors(mobsRegistry, zones)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "CaveMouth")
	assert.Contains(t, err.Error(), "under-")
}
func TestZoneSet_SplitZoneListParsesTheFlag(t *testing.T) {
	assert.Nil(t, splitZoneList(""))
	assert.Nil(t, splitZoneList("   "))
	assert.Equal(t, []string{"world"}, splitZoneList("world"))
	assert.Equal(t, []string{"world", "underworld"}, splitZoneList("world, underworld"))
	assert.Equal(t, []string{"world", "underworld"}, splitZoneList("world,,underworld,"))
}
