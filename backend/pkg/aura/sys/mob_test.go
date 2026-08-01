package sys

import (
	"net/http"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// fakeGame is the minimal model.Game the MobSystem needs: it records add/remove
// and forwards them to the system under test (mirroring how the real game routes
// entities), and exposes a settable tick. Everything else panics — the MobSystem
// touches none of it.
type fakeGame struct {
	ms      *MobSystem
	tick    uint64
	cfg     *cfg.GameConfig
	mobReg  mobs.Registry
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
	if g.ms != nil {
		g.ms.AddEntity(m) // the real game routes mobs to MobSystem.AddEntity
	}
}

func (g *fakeGame) RemoveEntity(e ecs.BasicEntity) {
	g.removed = append(g.removed, e.ID())
	g.ms.Remove(e)
}

func (g *fakeGame) Ticks() uint64                                 { return g.tick }
func (g *fakeGame) Bounds() (float32, float32)                    { return 60, 40 }
func (g *fakeGame) Config() *cfg.GameConfig                       { return g.cfg }
func (g *fakeGame) Handler(func(*http.Request) bool) http.Handler { panic("unused") }
func (g *fakeGame) Loop()                                         { panic("unused") }
func (g *fakeGame) GetEntity(uint64) (model.BasicEntity, error)   { panic("unused") }
func (g *fakeGame) Mobs() mobs.Registry {
	if g.mobReg == nil {
		panic("unused")
	}
	return g.mobReg
}
func (g *fakeGame) Skills() skills.Registry { panic("unused") }
func (g *fakeGame) Quests() quests.Registry { return nil }

// testMobDef is a minimal Dodo-shaped definition — enough for NewMob (a full HP
// pool, a valid aggro radius, no skills).
func testMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:      1,
		Name:    "Dodo",
		Body:    mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Factors: mobs.Factors{BaseMaxHealth: 40},
	}
}

func f32ptr(v float32) *float32 { return &v }

// killMob deals overwhelming damage through the exported hit path so the mob
// reports dead on its next Update.
func killMob(m model.MobEntity) {
	m.(model.Interacter).MobTouches(nil, mobs.Factors{Damage: 1e6})
}

func newMobSystemWith(spawns []world.Spawn) (*MobSystem, *fakeGame) {
	g := newFakeGame()
	ms := NewMobSystem(g, 42, spawns, nil)
	g.ms = ms
	return ms, g
}

// countingMob wraps a real mob to count Update calls and control liveness, so a
// test can prove the update loop visits every survivor exactly once even when a
// sibling mob is removed mid-tick (the synchronous-Remove hazard, backlog §27.1).
type countingMob struct {
	model.MobEntity
	updates int
	alive   bool
}

func (c *countingMob) Update(dt float32) bool {
	c.updates++
	return c.alive
}

func TestMobSystem_RemovingDeadMobDoesNotSkipOrDoubleUpdateSurvivors(t *testing.T) {
	ms, g := newMobSystemWith(nil) // no points: initialized flips, nothing spawns
	ms.Update(0)
	require.Empty(t, g.added)

	// [A, B(dead), C, D]. game.RemoveEntity → MobSystem.Remove shifts n.mobs'
	// backing array synchronously; removing inside `range n.mobs` slides C into
	// B's freed slot (so C is skipped) and re-reads D (so D updates twice).
	mkMob := func(alive bool) *countingMob {
		return &countingMob{MobEntity: mob.NewMob(testMobDef(), 0, nil), alive: alive}
	}
	a, b, c, d := mkMob(true), mkMob(false), mkMob(true), mkMob(true)
	for _, m := range []*countingMob{a, b, c, d} {
		ms.AddEntity(m)
	}

	ms.Update(0)

	assert.Equal(t, 1, a.updates, "A updated exactly once")
	assert.Equal(t, 1, b.updates, "B (dead) updated exactly once")
	assert.Equal(t, 1, c.updates, "C must not be skipped when B is removed")
	assert.Equal(t, 1, d.updates, "D must not be updated twice")
	assert.Equal(t, []uint64{b.Basic().ID()}, g.removed, "only the dead mob is removed")
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

	orphan := mob.NewMob(testMobDef(), 0, nil)
	orphan.SetPosition(phy.Vec2f{X: 1, Y: 1})
	ms.AddEntity(orphan) // routed in without an owning point

	killMob(orphan)
	for g.tick = 0; g.tick < 50; g.tick++ {
		ms.Update(0)
	}
	assert.Empty(t, g.added, "an orphan mob is never respawned")
}

func TestSpawnPoint_WanderSpawnRollsWithinBand(t *testing.T) {
	// A wander spawn rolls its (re)spawn position uniformly within the wander
	// radius around the authored point (chunk 5a, roadmap item 7
	// "wander-range respawn").
	def := testMobDef()
	def.Factors.Speed = 1
	authored := phy.Vec2f{X: 10, Y: -3}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: def, X: authored.X, Y: authored.Y, RespawnTicks: 1, WanderRadius: f32ptr(3)},
	})

	positions := map[phy.Vec2f]bool{}
	for round := 0; round < 8; round++ {
		ms.Update(0)
		require.Len(t, g.added, round+1)
		pos := g.added[round].Position()
		d := pos.Sub(authored).Abs()
		assert.LessOrEqual(t, d, float32(3), "spawn position stays within the wander radius")
		positions[pos] = true

		killMob(g.added[round])
		ms.Update(0) // detect death, schedule respawn
		g.tick += 2  // past the 1-tick respawn delay
	}
	assert.Greater(t, len(positions), 1, "8 rolls in a radius-3 band must not all land identical")
}

func TestSpawnPoint_WanderMobStaysAnchoredOnAuthoredPoint(t *testing.T) {
	def := testMobDef()
	def.Factors.Speed = 1
	authored := phy.Vec2f{X: 0, Y: 0}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: def, X: authored.X, Y: authored.Y, RespawnTicks: 10, WanderRadius: f32ptr(2)},
	})

	ms.Update(0)
	require.Len(t, g.added, 1)

	moved := false
	start := g.added[0].Position()
	for i := 0; i < 2000; i++ {
		ms.Update(0)
		if g.added[0].Position() != start {
			moved = true
		}
		d := g.added[0].Position().Sub(authored).Abs()
		require.LessOrEqual(t, d, float32(2+1e-3),
			"wanderer stays inside the disc around the AUTHORED point, not the rolled spawn")
	}
	assert.True(t, moved, "the spawned wanderer actually wanders")
}

func TestSpawnPoint_WaypointSpawnPatrolsRoute(t *testing.T) {
	def := testMobDef()
	def.Factors.Speed = 1
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: def, X: 0, Y: 0, RespawnTicks: 10,
			Waypoints: []world.Waypoint{{X: 2, Y: 0}, {X: 4, Y: 0}}},
	})

	ms.Update(0)
	require.Len(t, g.added, 1)
	// The spawn tick also runs the mob's first Update, so it may already have
	// taken one patrol step off the authored point.
	assert.LessOrEqual(t, g.added[0].Position().Abs(), float32(0.056),
		"a route spawn places the mob at the authored point (± one step)")

	// The march runs at the idle pace (0.4× of 0.055/tick) since the pacing
	// rework, so give it enough ticks to cover a unit.
	for i := 0; i < 100; i++ {
		ms.Update(0)
	}
	assert.Greater(t, g.added[0].Position().X, float32(1),
		"the spawned patroller marches toward its first waypoint")
}

func TestSpawnPoint_TypeDefaultWanderApplies(t *testing.T) {
	// A spawn without its own wanderRadius inherits the mob type's default
	// (chunk-5 pacing rework: Dodos graze by default, no zone edits).
	def := testMobDef()
	def.Factors.Speed = 1
	def.Factors.WanderRadius = 2
	authored := phy.Vec2f{X: 5, Y: 5}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: def, X: authored.X, Y: authored.Y, RespawnTicks: 1},
	})

	positions := map[phy.Vec2f]bool{}
	for round := 0; round < 6; round++ {
		ms.Update(0)
		require.Len(t, g.added, round+1)
		pos := g.added[round].Position()
		assert.LessOrEqual(t, pos.Sub(authored).Abs(), float32(2.1),
			"type-default wander rolls the spawn within the default radius")
		positions[pos] = true
		killMob(g.added[round])
		ms.Update(0)
		g.tick += 2
	}
	assert.Greater(t, len(positions), 1, "respawns must scatter within the default band")
}

func TestSpawnPoint_ExplicitZeroWanderOverridesTypeDefault(t *testing.T) {
	// wanderRadius: 0 on the spawn = stationary despite a wandering species
	// (the roadmap's "bridge guard" case).
	def := testMobDef()
	def.Factors.Speed = 1
	def.Factors.WanderRadius = 2
	authored := phy.Vec2f{X: 5, Y: 5}
	ms, g := newMobSystemWith([]world.Spawn{
		{Def: def, X: authored.X, Y: authored.Y, RespawnTicks: 10, WanderRadius: f32ptr(0)},
	})

	ms.Update(0)
	require.Len(t, g.added, 1)
	assert.Equal(t, authored, g.added[0].Position(), "explicit 0 spawns exactly at the point")
	for i := 0; i < 50; i++ {
		ms.Update(0)
	}
	assert.Equal(t, authored, g.added[0].Position(), "explicit 0 keeps the mob standing")
}

func TestSpawnPoint_TTLExpiredOrphanStaysDead(t *testing.T) {
	// The totem's actual death mode (mob-depth chunk 1): TTL expiry reports
	// death through the same Update-returns-false path as an HP death — the
	// respawn loop must ignore it identically.
	ms, g := newMobSystemWith(nil)
	ms.Update(0)

	totem := mob.NewMob(testMobDef(), 0, nil)
	totem.SetPosition(phy.Vec2f{X: 1, Y: 1})
	totem.SetTTLTicks(5)
	ms.AddEntity(totem)

	for g.tick = 0; g.tick < 50; g.tick++ {
		ms.Update(0)
	}
	require.Len(t, g.removed, 1, "the expired summon is removed")
	assert.Equal(t, totem.Basic().ID(), g.removed[0])
	assert.Empty(t, g.added, "a TTL-expired summon is never respawned")
}

// --- charm breaks when the charmer leaves the world (plan-faction-flips
// chunk 3, D10 / L-G) ---

func TestMobSystem_RemovingTheCharmerRevertsItsCharmedMob(t *testing.T) {
	// Death and disconnect BOTH route through game.RemoveEntity(player), which
	// fans out to every system's Remove — so this one hook covers both, and it
	// is the only signal available: a disconnected player's entity is gone from
	// the world but the mob's pointer stays valid and its HealthRatio stays
	// above 0, so polling would leave a pet following a ghost for the rest of a
	// 60-second charm.
	ms, g := newMobSystemWith(nil)
	ms.Update(0)

	charmer := newFakePlayer()
	m := mob.NewMob(hostileMobDef(), 0, nil)
	g.AddEntity(m)
	m.Charm(charmer, 63, 1800)
	require.Equal(t, model.FactionAligned, m.Faction())

	ms.Remove(charmer.Basic())

	assert.NotEqual(t, model.FactionAligned, m.Faction(), "the pet reverts the moment its charmer leaves")
	assert.Nil(t, m.CreditTo(), "and no dangling link is left behind")
}

func TestMobSystem_RemovingAnUnrelatedEntityLeavesCharmsAlone(t *testing.T) {
	// Remove() fires for every entity leaving the world — corpses, props, other
	// mobs. Only the charmer's own id may break a charm.
	ms, g := newMobSystemWith(nil)
	ms.Update(0)

	charmer := newFakePlayer()
	m := mob.NewMob(hostileMobDef(), 0, nil)
	g.AddEntity(m)
	m.Charm(charmer, 63, 1800)

	ms.Remove(newFakePlayer().Basic())
	ms.Remove(ecs.NewBasic())

	assert.Equal(t, model.FactionAligned, m.Faction(), "somebody else's departure is not your charm's business")
	assert.Equal(t, model.PlayerEntity(charmer), m.CreditTo())
}

func TestMobSystem_RemovingACharmedMobItselfIsJustARemoval(t *testing.T) {
	// The mob-removal path must stay the early return it is: a dying pet is
	// dropped from the slice, not walked over looking for charms to break.
	ms, g := newMobSystemWith(nil)
	ms.Update(0)

	charmer := newFakePlayer()
	m := mob.NewMob(hostileMobDef(), 0, nil)
	g.AddEntity(m)
	m.Charm(charmer, 63, 1800)
	require.Len(t, ms.mobs, 1)

	ms.Remove(m.Basic())

	assert.Empty(t, ms.mobs)
}
