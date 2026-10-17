package sys

// The herd pen check (plan-herding.md D4): a herd animal that stands in its
// pen for 2 s leaves through the death sweep, and its spawn point brings it
// back after respawnTicks.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var herdPen = map[string][]world.PlacedRegion{
	"pen": {{
		Points: []world.Point{{X: 0, Y: 0}, {X: 4, Y: 0}, {X: 4, Y: 4}, {X: 0, Y: 4}},
		Bounds: world.BoundingBox{MinX: 0, MinY: 0, MaxX: 4, MaxY: 4},
	}},
}

func herdDef(pen string) *mobs.MobDefinition {
	def := testMobDef()
	def.Faction = 3 // passive: it acquires nobody
	def.Factors.Speed = 0.6
	def.Herd = &mobs.Herd{Pen: pen}
	return def
}

// penDwell is R3's 2 s, restated from the ruling rather than read from the mob
// package's unexported constant.
const penDwell = 2 * constant.TicksPerSecond

func TestMobSystem_AHerdAnimalInItsPenLeavesAndRespawns(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{{Def: herdDef("pen"), X: 2, Y: 2, RespawnTicks: 100}})
	ms.SetPens(herdPen)

	// The first tick spawns it and already counts: it stands inside.
	for i := 1; i < penDwell; i++ {
		ms.Update(0)
		require.Empty(t, g.removed, "tick %d: not yet penned", i)
	}
	ms.Update(0)
	require.Len(t, g.removed, 1, "penned after 2 s inside")

	g.tick = 99
	ms.Update(0)
	require.Len(t, g.added, 1, "the respawn waits for the timer")
	g.tick = 100
	ms.Update(0)
	assert.Len(t, g.added, 2, "and then the point brings it back")
}

func TestMobSystem_AHerdAnimalOutsideItsPenStays(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{{Def: herdDef("pen"), X: 10, Y: 10}})
	ms.SetPens(herdPen)

	for i := 0; i < 3*penDwell; i++ {
		ms.Update(0)
	}
	assert.Empty(t, g.removed)
}

func TestMobSystem_AHerdAnimalWithoutAPenIsNeverPenned(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{{Def: herdDef(""), X: 2, Y: 2}})
	ms.SetPens(herdPen)

	for i := 0; i < 3*penDwell; i++ {
		ms.Update(0)
	}
	assert.Empty(t, g.removed, "`herd: {}` only runs (R14)")
}
