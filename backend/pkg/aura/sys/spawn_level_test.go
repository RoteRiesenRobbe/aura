package sys

// plan-mob-levels.md C1, the spawn-site half: an authored per-spawn level
// reaches the mob that stands there, survives its death, and is reproduced on
// every respawn.

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

func intPtr(v int) *int { return &v }

// testMobDef with a real curve, so f(L) is not the neutral 1 a curve-less
// hand-built definition reads as. No maxHealthVariance: the pools below are
// compared as absolute numbers across separately constructed mobs.
func curvedTestMobDef(curveLevel int) *mobs.MobDefinition {
	d := testMobDef()
	d.CurveLevel = curveLevel
	d.Curve = curve.Curve{Growth: 1.12, MaxLevel: 30}
	return d
}

func mobLevel(t *testing.T, e model.MobEntity) int {
	t.Helper()
	m, ok := e.(*mob.Mob)
	require.True(t, ok, "spawned entity is a *mob.Mob")
	return m.Level()
}

func TestSpawnPoint_CarriesTheAuthoredLevelToTheMob(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: curvedTestMobDef(1), X: 0, Y: 0, RespawnTicks: 10, Level: intPtr(15)},
		{Def: curvedTestMobDef(1), X: 5, Y: 0, RespawnTicks: 10}, // no override
	})

	ms.Update(0)

	require.Len(t, g.added, 2)
	assert.Equal(t, 15, mobLevel(t, g.added[0]), "the placement's level")
	assert.Equal(t, 1, mobLevel(t, g.added[1]), "no override: the species curveLevel, unchanged")
	assert.Greater(t, g.added[0].MaxHealth(), g.added[1].MaxHealth(),
		"and the pool follows the level, which is the whole point")

	// Both cases spawn FULL. Asserting it for the un-overridden mob too keeps
	// the L1 pairing honest if a later edit reorders spawnAt: today the pool is
	// already correct at construction when nothing overrides the level, and
	// that is a fact worth failing on rather than assuming.
	for i, m := range g.added {
		assert.Equalf(t, m.MaxHealth(), m.Health(), "mob %d spawns at its full pool", i)
	}
}

// The seam neither half proves alone: authored JSON → world.Spawn →
// spawnPoint → the live mob's level. §9's "valid value survives the round-trip
// into spawnPoint" — the silent-wiring class, pinned end to end.
func TestSpawnPoint_AuthoredZoneLevelReachesTheLiveMob(t *testing.T) {
	def := curvedTestMobDef(1)
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Wolf", "x": 0, "y": 0, "respawnTicks": 10, "level": 18 } ]
	}`

	z, err := world.LoadZoneFS(
		fstest.MapFS{"zone.json": {Data: []byte(doc)}}, "",
		fakeMobRegistry{"Wolf": def}, spawnLevelPropRegistry{},
	)
	require.NoError(t, err)

	ms, g := newMobSystemWith(z.Spawns)
	ms.Update(0)

	require.Len(t, g.added, 1)
	assert.Equal(t, 18, mobLevel(t, g.added[0]),
		"the number the author typed is the number the mob stands at")
}

type spawnLevelPropRegistry struct{}

func (spawnLevelPropRegistry) GetByName(string) (*world.PropDefinition, error) {
	return nil, fmt.Errorf("no props in this fixture")
}
func (spawnLevelPropRegistry) Props() []*world.PropDefinition { return nil }

// L1 — NewMob fills the pool at construction, at the SPECIES level; spawnAt
// owes the mob a RestoreToFullHealth after the override lands. Without it an
// up-levelled mob spawns with its species' small pool inside a big max, and
// out-of-combat regen quietly heals the gap — so it only reproduces on a fresh
// pull, which is why this pin asserts at spawn and not one tick later.
func TestSpawnPoint_OverriddenMobSpawnsAtItsFullOverriddenPool(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: curvedTestMobDef(1), X: 0, Y: 0, RespawnTicks: 10, Level: intPtr(20)},
	})

	ms.Update(0)

	require.Len(t, g.added, 1)
	m := g.added[0]
	assert.Equal(t, m.MaxHealth(), m.Health(),
		"a level-20 wolf must not spawn with a level-1 pool inside a level-20 max")
}

// L5 — the respawn must reproduce the override. Deriving the replacement from
// def alone reproduces today's behaviour and silently drops the level on first
// death; the spawnPoint carry is what stops that.
func TestSpawnPoint_RespawnReproducesTheOverride(t *testing.T) {
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: curvedTestMobDef(1), X: 3, Y: 8, RespawnTicks: 10}, // no variance → exact
	})
	ms.points[0].level = intPtr(12) // as the loader would have carried it

	g.tick = 0
	ms.Update(0)
	require.Len(t, g.added, 1)
	first := g.added[0]
	require.Equal(t, 12, mobLevel(t, first))

	killMob(first)
	ms.Update(0) // death tick: schedules the respawn

	g.tick = 10
	ms.Update(0)

	require.Len(t, g.added, 2, "respawns once the timer elapses")
	second := g.added[1]
	assert.NotEqual(t, first.Basic().ID(), second.Basic().ID(), "respawn is a fresh mob")
	assert.Equal(t, 12, mobLevel(t, second), "and it comes back at the PLACEMENT's level")
	assert.Equal(t, first.MaxHealth(), second.MaxHealth(), "with the same pool")
	assert.Equal(t, second.MaxHealth(), second.Health(), "filled (L1 again, on the respawn path)")
}
