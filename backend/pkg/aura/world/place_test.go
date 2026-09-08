package world

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Tests for zone placement (plan-underworld.md U1).
//
// ⭐ EVERY RULE HERE FAILS SILENTLY IN PRODUCTION. There is no layer bit and no
// runtime check: two zones stay apart purely because their coordinates are far
// apart, so a bad Origin does not crash — it streams an underworld mob into a
// surface player's viewport, or spawns a fresh character underground, or
// resolves a travel destination to the wrong zone. Nothing downstream would go
// red. That is why these are asserted here rather than left to a boot smoke.

func zoneAt(id string, w, h, ox, oy float32) *Zone {
	return &Zone{
		ID:     id,
		Name:   id,
		Bounds: Bounds{Width: w, Height: h},
		Origin: Point{X: ox, Y: oy},
	}
}

func TestPlace_OffsetsGeometryIntoTheSharedSpace(t *testing.T) {
	z := zoneAt("under", 60, 40, 0, -500)
	z.Props = []Prop{{Type: "Rock", X: 1, Y: 2}}
	z.Spawns = []Spawn{{Mob: "Wolf", X: 3, Y: 4, Waypoints: []Waypoint{{X: 5, Y: 6}}}}
	z.Campfires = []Campfire{{ID: "u-1", X: 7, Y: 8}}
	z.Anchors = []Anchor{{Name: "u-entry", X: 9, Y: 10}}
	z.Paths = []Path{{Profile: "Water", Width: 2, Points: []Point{{X: 11, Y: 12}}}}

	surface := zoneAt("world", 144, 72, 0, 0)
	surface.Campfires = []Campfire{{ID: "spawnpoint-1", StartingSpawn: true}}
	require.NoError(t, Place([]*Zone{surface, z}))

	assert.Equal(t, float32(1), z.Props[0].X)
	assert.Equal(t, float32(-498), z.Props[0].Y, "props move with the zone")
	assert.Equal(t, float32(-496), z.Spawns[0].Y, "spawns move with the zone")
	assert.Equal(t, float32(-494), z.Spawns[0].Waypoints[0].Y, "patrol waypoints move too")
	assert.Equal(t, float32(-492), z.Campfires[0].Y, "campfires move with the zone")
	assert.Equal(t, float32(-490), z.Anchors[0].Y, "anchors move with the zone")
	assert.Equal(t, float32(-488), z.Paths[0].Points[0].Y,
		"path points move: PathCorridors turns them into collision bodies")
}

// ⚑ The client reads the zone file itself and applies Origin on its own, so
// offsetting client-visual arrays server-side would be dead work that only
// invites the two sides to disagree about who did it.
func TestPlace_LeavesClientVisualArraysAlone(t *testing.T) {
	z := zoneAt("under", 60, 40, 0, -500)
	z.Terrain = []TerrainTexture{{Type: "Land", X: 1, Y: 2, Size: 1}}
	z.DarkAreas = []DarkArea{{X: 3, Y: 4, Radius: 5}}
	z.Regions = []Region{{Profile: "Cave", Points: []Point{{X: 6, Y: 7}}}}

	require.NoError(t, Place([]*Zone{zoneAt("world", 144, 72, 0, 0), z}))

	assert.Equal(t, float32(2), z.Terrain[0].Y, "terrain is client-visual and stays zone-local")
	assert.Equal(t, float32(4), z.DarkAreas[0].Y, "dark areas are client-visual")
	assert.Equal(t, float32(7), z.Regions[0].Points[0].Y, "regions are client-visual")
}

func TestPlace_ZoneAtTheOriginIsUntouched(t *testing.T) {
	z := zoneAt("world", 144, 72, 0, 0)
	z.Props = []Prop{{Type: "Rock", X: 12, Y: -5}}

	require.NoError(t, Place([]*Zone{z}))

	assert.Equal(t, float32(12), z.Props[0].X, "every zone authored before Origin existed sits at {0,0}")
	assert.Equal(t, float32(-5), z.Props[0].Y)
}

// ⛔ THE FACTOR-OF-TWO RULE. InvAABB.updateBB gives the wall a bounding box 2×
// its half-extents on every side, so a wall of full height H reaches H in each
// direction from its centre — two of them need H_a + H_b between centres, NOT
// max(H_a, H_b). The plan shipped that rule wrong at first, which is exactly
// why it is pinned with the near-miss case and not just an obviously-far one.
func TestPlace_RejectsZonesWhoseWallsWouldShareCells(t *testing.T) {
	// Two 72-tall zones: the boxes reach 72 each way, so anything up to
	// 72+72+10 is too close.
	for _, dy := range []float32{0, 72, 100, 144, 154} {
		t.Run(fmt.Sprintf("dy=%g", dy), func(t *testing.T) {
			err := Place([]*Zone{
				zoneAt("world", 144, 72, 0, 0),
				zoneAt("under", 144, 72, 0, -dy),
			})
			require.Error(t, err, "walls this close share broadphase cells")
			assert.Contains(t, err.Error(), "too close")
		})
	}
	// One unit past the sum plus a cell margin, and it is legal.
	require.NoError(t, Place([]*Zone{
		zoneAt("world", 144, 72, 0, 0),
		zoneAt("under", 144, 72, 0, -155),
	}))
}

// Separation on EITHER axis is enough — two boxes miss if they miss anywhere.
func TestPlace_SeparationOnOneAxisIsEnough(t *testing.T) {
	require.NoError(t, Place([]*Zone{
		zoneAt("world", 144, 72, 0, 0),
		zoneAt("east", 144, 72, 300, 0),
	}))
}

// ⛔ L12 — a huge offset is not "safely far", it is broken: phy.Vec2f is
// float32, so the offset lands in collision resolution and movement
// integration. The ceiling is the guard.
func TestPlace_RejectsAnOffsetPastTheFloat32Ceiling(t *testing.T) {
	err := Place([]*Zone{
		zoneAt("world", 144, 72, 0, 0),
		zoneAt("under", 144, 72, 0, -100000),
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ceiling")
}

// The ceiling is measured to the zone's far EDGE, not its origin: a modest
// offset on a huge zone reaches just as far as a big offset on a small one.
func TestPlace_CeilingCountsTheZonesFarEdge(t *testing.T) {
	err := Place([]*Zone{zoneAt("huge", 4000, 4000, MaxWorldCoordinate-100, 0)})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "far edge")
}

// ⛔ L5 — campfire ids reach the database as bare TEXT
// (game.character_campfires), so a collision corrupts persisted player state,
// not just memory. Zone-wide uniqueness stops being enough with two zones.
func TestPlace_RejectsSpawnPointIDsDuplicatedAcrossZones(t *testing.T) {
	a := zoneAt("world", 144, 72, 0, 0)
	a.Campfires = []Campfire{{ID: "spawnpoint-1", X: 0, Y: 0, StartingSpawn: true}}
	b := zoneAt("under", 144, 72, 0, -500)
	b.Campfires = []Campfire{{ID: "spawnpoint-1", X: 0, Y: 0}}

	err := Place([]*Zone{a, b})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "spawnpoint-1")
}

// ⛔ L5b — a travel destination resolves by bare name across every loaded zone.
func TestPlace_RejectsAnchorNamesDuplicatedAcrossZones(t *testing.T) {
	a := zoneAt("world", 144, 72, 0, 0)
	a.Anchors = []Anchor{{Name: "entry"}}
	b := zoneAt("under", 144, 72, 0, -500)
	b.Anchors = []Anchor{{Name: "entry"}}

	err := Place([]*Zone{a, b})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "entry")
}

// ⛔ L4 — THE ONE THAT REACHES A PLAYER BEFORE IT REACHES A LOG LINE.
// defaultSpawnPosition picks a random startingSpawn fire across everything
// loaded, with no idea which zone it is in, so a flagged fire underground
// spawns fresh characters underground.
func TestPlace_RejectsAStartingSpawnOutsideThePrimaryZone(t *testing.T) {
	a := zoneAt("world", 144, 72, 0, 0)
	a.Campfires = []Campfire{{ID: "spawnpoint-1", StartingSpawn: true}}
	b := zoneAt("under", 144, 72, 0, -500)
	b.Campfires = []Campfire{{ID: "u-1", StartingSpawn: true}}

	err := Place([]*Zone{a, b})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "starting spawn")
}

// A cave nobody binds in is legal: the set needs a starting spawn, the file
// does not. This is the half that moved out of Zone.validate.
func TestPlace_AllowsASecondZoneWithFiresButNoStartingSpawn(t *testing.T) {
	a := zoneAt("world", 144, 72, 0, 0)
	a.Campfires = []Campfire{{ID: "spawnpoint-1", StartingSpawn: true}}
	b := zoneAt("under", 144, 72, 0, -500)
	b.Campfires = []Campfire{{ID: "u-1"}}

	require.NoError(t, Place([]*Zone{a, b}))
}

func TestPlace_RejectsASetWithNoStartingSpawnAtAll(t *testing.T) {
	a := zoneAt("world", 144, 72, 0, 0)
	a.Campfires = []Campfire{{ID: "spawnpoint-1"}}

	err := Place([]*Zone{a})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "startingSpawn")
}

// gridCellMargin restates phy's gridWidth, because the world package is
// deliberately phy-free. If phy ever re-tunes its cell size, this is the pin
// that says so out loud instead of quietly under-separating every zone.
func TestPlace_GridCellMarginMatchesThePhysicsCellSize(t *testing.T) {
	assert.Equal(t, 10, gridCellMargin,
		"phy/space.go's gridWidth; separation clears a whole cell beyond the wall boxes")
}
