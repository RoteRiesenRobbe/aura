package encounter

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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakeGame is the minimal model.Game the encounter System needs: it records
// add/remove and forwards them to the system under test (mirroring the real
// game's addMobEntity routing + World.RemoveEntity fan-out), exposes a
// settable tick and a fake mob registry. Everything else panics.
type fakeGame struct {
	es      *System
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
	if g.es != nil {
		g.es.AddEntity(m) // the real game routes mobs to System.AddEntity
	}
}

func (g *fakeGame) RemoveEntity(e ecs.BasicEntity) {
	g.removed = append(g.removed, e.ID())
	g.es.Remove(e) // World.RemoveEntity fans Remove to every system
}

func (g *fakeGame) Ticks() uint64                               { return g.tick }
func (g *fakeGame) Bounds() (float32, float32)                  { return 60, 40 }
func (g *fakeGame) Config() *cfg.GameConfig                     { return g.cfg }
func (g *fakeGame) Handler() http.Handler                       { panic("unused") }
func (g *fakeGame) Loop()                                       { panic("unused") }
func (g *fakeGame) GetEntity(uint64) (model.BasicEntity, error) { panic("unused") }
func (g *fakeGame) Mobs() mobs.Registry {
	if g.mobReg == nil {
		panic("unused")
	}
	return g.mobReg
}
func (g *fakeGame) Skills() skills.Registry { panic("unused") }

// fakeRegistry is a name-keyed mobs.Registry over hand-built definitions.
type fakeRegistry struct {
	defs map[string]*mobs.MobDefinition
}

func (r *fakeRegistry) Get(i mobs.MobID) (*mobs.MobDefinition, error) { panic("unused") }
func (r *fakeRegistry) GetByName(name string) (*mobs.MobDefinition, error) {
	d, ok := r.defs[name]
	if !ok {
		return nil, assert.AnError
	}
	return d, nil
}
func (r *fakeRegistry) Mobs() []*mobs.MobDefinition { panic("unused") }

// testMobDef is a minimal Dodo-shaped definition (the name must resolve to a
// wire EntityType in NewMob).
func testMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:      1,
		Name:    "Dodo",
		Body:    mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Factors: mobs.Factors{BaseMaxHealth: 40},
	}
}

// fakeEncounter records hook invocations in one shared order log.
type fakeEncounter struct {
	calls  []string
	deaths []uint64
	ticks  int
}

func (f *fakeEncounter) Name() string { return "fake" }

func (f *fakeEncounter) OnTick(s *System) {
	f.ticks++
	f.calls = append(f.calls, "tick")
}

func (f *fakeEncounter) OnMobDeath(s *System, mobID uint64) {
	f.deaths = append(f.deaths, mobID)
	f.calls = append(f.calls, "death")
}

func newSystemWith(enc Encounter) (*System, *fakeGame) {
	g := newFakeGame()
	s := NewSystem(g, nil)
	g.es = s
	if enc != nil {
		s.Register(enc)
	}
	return s, g
}

// killMob deals overwhelming damage through the exported hit path so the mob
// reports dead on its next Update.
func killMob(m model.MobEntity) {
	m.(model.Interacter).MobTouches(nil, mobs.Factors{Damage: 1e6})
}

func TestSystem_OnTickFiresEveryUpdate(t *testing.T) {
	enc := &fakeEncounter{}
	s, g := newSystemWith(enc)

	g.tick = 7
	s.Update(0)
	s.Update(0)
	s.Update(0)

	assert.Equal(t, 3, enc.ticks, "OnTick fires once per system update")
	assert.Equal(t, uint64(7), s.Ticks(), "Ticks reads through to the game clock")
}

func TestSystem_MobDeathDispatchesOnce(t *testing.T) {
	enc := &fakeEncounter{}
	s, g := newSystemWith(enc)

	m := mob.NewMob(testMobDef(), 0, nil)
	g.AddEntity(m)
	g.RemoveEntity(m.Basic()) // mobs are only removed on death

	s.Update(0)
	require.Equal(t, []uint64{m.Basic().ID()}, enc.deaths, "one OnMobDeath for the removed mob")

	s.Update(0)
	assert.Len(t, enc.deaths, 1, "a death is dispatched exactly once")
}

func TestSystem_DeathsDispatchedBeforeTick(t *testing.T) {
	enc := &fakeEncounter{}
	s, g := newSystemWith(enc)

	m := mob.NewMob(testMobDef(), 0, nil)
	g.AddEntity(m)
	g.RemoveEntity(m.Basic())

	s.Update(0)
	require.Equal(t, []string{"death", "tick"}, enc.calls,
		"queued deaths are drained before the tick hook so OnTick sees post-death state")
}

func TestSystem_NonMobRemoveIgnored(t *testing.T) {
	enc := &fakeEncounter{}
	s, _ := newSystemWith(enc)

	stranger := ecs.NewBasic() // e.g. a player or placeable removal fanning through
	s.Remove(stranger)
	s.Update(0)

	assert.Empty(t, enc.deaths, "removals of untracked entities never dispatch OnMobDeath")
}

// --- scripted spawns (9c) ---

func TestSystem_SpawnMob_PlacesAndRegisters(t *testing.T) {
	s, g := newSystemWith(nil)
	g.mobReg = &fakeRegistry{defs: map[string]*mobs.MobDefinition{"Dodo": testMobDef()}}

	pos := phy.Vec2f{X: 12, Y: -5}
	m, err := s.SpawnMob("Dodo", pos)

	require.NoError(t, err)
	require.NotNil(t, m)
	assert.Equal(t, pos, m.Position(), "spawns exactly at the requested position")
	require.Len(t, g.added, 1, "the spawned mob is added to the game")
	assert.Equal(t, m.Basic().ID(), g.added[0].Basic().ID())
}

func TestSystem_SpawnMob_UnknownDefErrors(t *testing.T) {
	s, g := newSystemWith(nil)
	g.mobReg = &fakeRegistry{defs: map[string]*mobs.MobDefinition{}}

	m, err := s.SpawnMob("NoSuchMob", phy.Vec2f{})

	assert.Error(t, err)
	assert.Nil(t, m)
	assert.Empty(t, g.added, "nothing is added on a failed spawn")
}

func TestSystem_SpawnMob_DeathDispatches(t *testing.T) {
	enc := &fakeEncounter{}
	s, g := newSystemWith(enc)
	g.mobReg = &fakeRegistry{defs: map[string]*mobs.MobDefinition{"Dodo": testMobDef()}}

	m, err := s.SpawnMob("Dodo", phy.Vec2f{X: 1, Y: 1})
	require.NoError(t, err)

	// Replicate the MobSystem death loop: overwhelming damage, Update reports
	// dead, the game removes the entity, the system dispatches next Update.
	killMob(m)
	require.False(t, m.Update(0), "the mob reports dead on its next update")
	g.RemoveEntity(m.Basic())
	s.Update(0)

	assert.Equal(t, []uint64{m.Basic().ID()}, enc.deaths,
		"encounter-spawned mobs are auto-tracked and their death dispatches")
}
