package sys

import (
	"net/http"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
)

// fakeGame is the minimal model.Game the MobSystem needs: it records add/remove
// and forwards them to the system under test (mirroring how the real game routes
// entities), and exposes a settable tick. Everything else panics — the MobSystem
// touches none of it.
type fakeGame struct {
	ms      *MobSystem
	tick    uint64
	cfg     *cfg.GameConfig
	added   []model.MobEntity
	removed []uint64
}

func newFakeGame() *fakeGame {
	return &fakeGame{cfg: &cfg.GameConfig{MobChaseIntoAuraMargin: 0.2}}
}

func (g *fakeGame) AddEntity(e model.BasicEntity) {
	m, ok := e.(model.MobEntity)
	if !ok {
		return
	}
	g.added = append(g.added, m)
	g.ms.AddEntity(m) // the real game routes mobs to MobSystem.AddEntity
}

func (g *fakeGame) RemoveEntity(e ecs.BasicEntity) {
	g.removed = append(g.removed, e.ID())
	g.ms.Remove(e)
}

func (g *fakeGame) Ticks() uint64                               { return g.tick }
func (g *fakeGame) Radius() float32                             { return 20 }
func (g *fakeGame) Bounds() (float32, float32)                  { return 60, 40 }
func (g *fakeGame) Config() *cfg.GameConfig                     { return g.cfg }
func (g *fakeGame) Handler() http.Handler                       { panic("unused") }
func (g *fakeGame) Loop()                                       { panic("unused") }
func (g *fakeGame) GetEntity(uint64) (model.BasicEntity, error) { panic("unused") }
func (g *fakeGame) Items() items.Registry                       { panic("unused") }
func (g *fakeGame) Mobs() mobs.Registry                         { panic("unused") }
func (g *fakeGame) Skills() skills.Registry                     { panic("unused") }

// testMobDef is a minimal Dodo-shaped definition — enough for NewMob (a full HP
// pool, a valid aggro radius, no skills).
func testMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:      1,
		Name:    "Dodo",
		Body:    mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Factors: mobs.Factors{MaxHealth: 40},
	}
}

// killMob deals overwhelming damage through the exported hit path so the mob
// reports dead on its next Update.
func killMob(m model.MobEntity) {
	m.(model.Interacter).MobTouches(nil, mobs.Factors{Damage: 1e6})
}

func newMobSystemWith(spawns []world.Spawn) (*MobSystem, *fakeGame) {
	g := newFakeGame()
	ms := NewMobSystem(g, 42, spawns)
	g.ms = ms
	return ms, g
}

func TestSpawnPoint_SpawnsAtAuthoredPosition(t *testing.T) {
	pos := phy.Vec2f{X: 12, Y: -5}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: testMobDef(), X: pos.X, Y: pos.Y, Angle: 1.5, RespawnTicks: 10},
	})

	ms.Update(0)

	require.Len(t, g.added, 1, "one mob spawned per authored point on the first tick")
	assert.Equal(t, pos, g.added[0].Position(), "mob spawns at the authored position")

	// Idempotent: initial population runs once, not every tick.
	ms.Update(0)
	assert.Len(t, g.added, 1, "initial spawn does not repeat on later ticks")
}

func TestSpawnPoint_RespawnsAtSameSpotAfterTimer(t *testing.T) {
	pos := phy.Vec2f{X: 3, Y: 8}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: testMobDef(), X: pos.X, Y: pos.Y, RespawnTicks: 10}, // no variance → exact
	})

	g.tick = 0
	ms.Update(0) // initial spawn
	require.Len(t, g.added, 1)
	first := g.added[0]

	killMob(first)
	ms.Update(0) // detects death (tick 0), schedules respawn at tick 10, removes
	assert.Len(t, g.added, 1, "no respawn on the death tick")

	g.tick = 9
	ms.Update(0)
	assert.Len(t, g.added, 1, "no respawn before the timer elapses")

	g.tick = 10
	ms.Update(0)
	require.Len(t, g.added, 2, "respawns once the timer elapses")
	second := g.added[1]
	assert.Equal(t, pos, second.Position(), "respawn happens at the same authored spot")
	assert.NotEqual(t, first.Basic().ID(), second.Basic().ID(), "respawn is a fresh mob")
}

func TestSpawnPoint_RespawnVarianceWithinBand(t *testing.T) {
	ms, _ := newMobSystemWith(nil)
	p := &spawnPoint{respawnTicks: 100, variancePct: 0.2}

	for i := 0; i < 1000; i++ {
		d := ms.rollDelay(p)
		assert.GreaterOrEqual(t, d, 80, "delay stays within the lower band")
		assert.LessOrEqual(t, d, 120, "delay stays within the upper band")
	}
}

func TestSpawnPoint_ExactDelayWithoutVariance(t *testing.T) {
	ms, _ := newMobSystemWith(nil)
	p := &spawnPoint{respawnTicks: 42, variancePct: 0}
	assert.Equal(t, 42, ms.rollDelay(p), "zero variance yields the exact tick count")
}

func TestSpawnPoint_NoSpawnPointNoRespawn(t *testing.T) {
	// A mob that belongs to no spawn point (e.g. a future totem / owned entity)
	// dies and stays dead — the respawn loop only touches authored points.
	ms, g := newMobSystemWith(nil) // no points
	ms.Update(0)
	require.Empty(t, g.added, "no points means no initial spawn")

	orphan := mob.NewMob(testMobDef(), false, 0, 0)
	orphan.SetPosition(phy.Vec2f{X: 1, Y: 1})
	ms.AddEntity(orphan) // routed in without an owning point

	killMob(orphan)
	for g.tick = 0; g.tick < 50; g.tick++ {
		ms.Update(0)
	}
	assert.Empty(t, g.added, "an orphan mob is never respawned")
}
