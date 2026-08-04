package core

// The flight machine — plan-flight-paths.md C2 (§4.4 validation, the takeoff
// one-shots, the lerp, the landing). Real players (real shapes, real skill
// component) against a fake FlightConn, so every §4.4 precondition is
// exercised through the same tryStartFlight the wire drives.

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
)

// --- fixtures ---------------------------------------------------------------

// flightFakeGame is the minimal model.Game player.New needs (the player_test
// fakeGame precedent: the embedded nil interface panics on anything more).
type flightFakeGame struct {
	model.Game
	cfg cfg.GameConfig
	reg skills.Registry
}

func (g *flightFakeGame) Config() *cfg.GameConfig { return &g.cfg }
func (g *flightFakeGame) Skills() skills.Registry { return g.reg }
func (g *flightFakeGame) Quests() quests.Registry { return nil }
func (g *flightFakeGame) Ticks() uint64           { return 0 }

// flightRegistry is a one-aura registry so SetActiveAura/CancelCast have a
// real skill to act on.
type flightRegistry map[skills.SkillID]*skills.SkillDefinition

func (r flightRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	if d, ok := r[id]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("no skill %d", id)
}
func (r flightRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	for _, d := range r {
		if d.Name == name {
			return d, nil
		}
	}
	return nil, fmt.Errorf("no skill %q", name)
}
func (r flightRegistry) All() []*skills.SkillDefinition {
	out := make([]*skills.SkillDefinition, 0, len(r))
	for _, d := range r {
		out = append(out, d)
	}
	return out
}

// flightFakeClient carries just the queues the input system drains.
type flightFakeClient struct {
	model.Client
	id        uuid.UUID
	inputs    []*model.PlayerInput
	utilities []*model.UseUtility
	flights   []*model.StartFlight
}

func newFlightFakeClient() *flightFakeClient { return &flightFakeClient{id: uuid.New()} }

func (c *flightFakeClient) UUID() uuid.UUID { return c.id }

func (c *flightFakeClient) NextInput() *model.PlayerInput {
	if len(c.inputs) == 0 {
		return nil
	}
	m := c.inputs[0]
	c.inputs = c.inputs[1:]
	return m
}

func (c *flightFakeClient) NextUseUtility() *model.UseUtility {
	if len(c.utilities) == 0 {
		return nil
	}
	m := c.utilities[0]
	c.utilities = c.utilities[1:]
	return m
}

func (c *flightFakeClient) NextStartFlight() *model.StartFlight {
	if len(c.flights) == 0 {
		return nil
	}
	m := c.flights[0]
	c.flights = c.flights[1:]
	return m
}

func (c *flightFakeClient) SendUnlock(uint64, string) error { return nil }

// fakeFlightConn is the validation authority: two known fires, a per-client
// discovered set.
type fakeFlightConn struct {
	fires      map[string]phy.Vec2f
	discovered map[uuid.UUID]map[string]bool
}

func newFakeFlightConn() *fakeFlightConn {
	return &fakeFlightConn{
		fires: map[string]phy.Vec2f{
			"spawnpoint-1": {X: 0, Y: 0},
			"spawnpoint-2": {X: 20, Y: 0},
		},
		discovered: map[uuid.UUID]map[string]bool{},
	}
}

func (f *fakeFlightConn) discover(client uuid.UUID, ids ...string) {
	set := f.discovered[client]
	if set == nil {
		set = map[string]bool{}
		f.discovered[client] = set
	}
	for _, id := range ids {
		set[id] = true
	}
}

func (f *fakeFlightConn) CampfireAt(pos phy.Vec2f) (string, bool) {
	for id, p := range f.fires {
		if pos.DistanceToSquared(p) <= 1 {
			return id, true
		}
	}
	return "", false
}

func (f *fakeFlightConn) CampfireDiscovered(client uuid.UUID, id string) bool {
	return f.discovered[client][id]
}

func (f *fakeFlightConn) CampfirePosition(id string) (phy.Vec2f, bool) {
	p, ok := f.fires[id]
	return p, ok
}

// forgetRecorder records the takeoff sweep — the mob-side severing itself is
// §54-pinned in mob_test; the claim here is that takeoff FIRES it.
type forgetRecorder struct{ ids []uint64 }

func (f *forgetRecorder) ForgetDeparted(id uint64) { f.ids = append(f.ids, id) }

// flightFixture is a wired input system + one real joined-equivalent player
// standing at spawnpoint-1 with both fires discovered.
type flightFixture struct {
	i      *PlayerInputSystem
	g      *game
	p      model.PlayerEntity
	c      *flightFakeClient
	conn   *fakeFlightConn
	space  *phy.Space
	forget *forgetRecorder
}

func newFlightFixture(t *testing.T) *flightFixture {
	t.Helper()
	def := &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	fg := &flightFakeGame{reg: flightRegistry{1: def}}
	fg.cfg.PlayerConfig = cfg.PlayerConfig{
		LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100,
		WalkingSpeedPerTick: 0.05, FlightSpeedFactor: 4,
	}

	c := newFlightFakeClient()
	p := player.New(fg, c, "flyer")
	p.SetPosition(phy.Vec2f{X: 0, Y: 0}) // standing at spawnpoint-1

	g := &game{}
	i := NewInputSystem(g)
	i.New(&ecs.World{})
	i.AddPlayer(p)

	conn := newFakeFlightConn()
	conn.discover(c.UUID(), "spawnpoint-1", "spawnpoint-2")
	space := phy.NewSpace()
	for _, b := range p.Bodies() {
		space.AddShape(b)
	}
	forget := &forgetRecorder{}
	i.SetFlightSeams(conn, space, forget)

	return &flightFixture{i: i, g: g, p: p, c: c, conn: conn, space: space, forget: forget}
}

func startFlightTo(id string) *model.StartFlight {
	return &model.StartFlight{DestinationCampfireID: id}
}

// --- validation (§4.4): every rejection leaves the player grounded ----------

func TestStartFlight_HappyPathTakesOff(t *testing.T) {
	f := newFlightFixture(t)
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))

	require.True(t, f.p.Flying())
	assert.Equal(t, phy.Vec2f{X: 20, Y: 0}, f.p.FlightDest())
	assert.Equal(t, []uint64{f.p.Basic().ID()}, f.forget.ids,
		"takeoff must fire the mob forget sweep — the second §54 half")
}

func TestStartFlight_RejectionsStayGrounded(t *testing.T) {
	cases := []struct {
		name string
		prep func(f *flightFixture)
		dest string
	}{
		{"dead", func(f *flightFixture) { f.p.VitalSigns().Health = 0 }, "spawnpoint-2"},
		{"not at a fire", func(f *flightFixture) { f.p.SetPosition(phy.Vec2f{X: 50, Y: 50}) }, "spawnpoint-2"},
		{"origin undiscovered", func(f *flightFixture) {
			f.conn.discovered[f.c.UUID()] = map[string]bool{"spawnpoint-2": true}
		}, "spawnpoint-2"},
		{"destination is the origin", func(f *flightFixture) {}, "spawnpoint-1"},
		{"destination undiscovered", func(f *flightFixture) {
			f.conn.discovered[f.c.UUID()] = map[string]bool{"spawnpoint-1": true}
		}, "spawnpoint-2"},
		{"destination id unresolvable", func(f *flightFixture) {
			f.conn.discover(f.c.UUID(), "spawnpoint-99") // discovered once, since deleted in the editor
		}, "spawnpoint-99"},
		{"unknown destination", func(f *flightFixture) {}, "spawnpoint-77"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFlightFixture(t)
			tc.prep(f)
			f.i.tryStartFlight(f.p, startFlightTo(tc.dest))
			assert.False(t, f.p.Flying(), "refusal must be silent and total")
			assert.Empty(t, f.forget.ids, "no sweep without a takeoff")
		})
	}
}

func TestStartFlight_WhileFlyingIsRefused(t *testing.T) {
	f := newFlightFixture(t)
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))
	require.True(t, f.p.Flying())

	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-1"))
	assert.Equal(t, phy.Vec2f{X: 20, Y: 0}, f.p.FlightDest(), "no mid-air re-target")
	assert.Len(t, f.forget.ids, 1, "the sweep fires once per takeoff, not per request")
}

func TestStartFlight_UnwiredSeamsRefuse(t *testing.T) {
	f := newFlightFixture(t)
	f.i.SetFlightSeams(nil, nil, nil)
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))
	assert.False(t, f.p.Flying())
}

// --- the takeoff one-shots (§4.2) -------------------------------------------

func TestTakeoff_ForcesTheAuraOffAndKillsTheCast(t *testing.T) {
	f := newFlightFixture(t)
	sc := f.p.SkillComponent()
	sc.SetActiveAura(0)
	require.Equal(t, 0, sc.ActiveAuraSlot, "fixture: aura on")

	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))

	assert.Equal(t, -1, sc.ActiveAuraSlot,
		"the aura goes out synchronously — a merely skipped aura would keep streaming its ring")
	assert.Equal(t, 0, sc.CastTicksLeft, "no cast survives a takeoff")
}

func TestTakeoff_ClearsSameTickQueuedPresses(t *testing.T) {
	f := newFlightFixture(t)
	sc := f.p.SkillComponent()
	// A UseUtility and a StartFlight in the same tick: the press was queued
	// before the takeoff ran. Without the clear, the SkillSystem would start
	// a Recall cast mid-air — and Recall completing mid-flight is a teleport
	// out of a committed flight (D11).
	sc.RequestUtilityCast(skills.UtilityRecall)
	require.NotEmpty(t, sc.PendingUtilities, "fixture: a press is pending")

	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))

	assert.Empty(t, sc.PendingUtilities, "pending utility presses die at takeoff")
	assert.Empty(t, sc.PendingCooldowns, "pending cooldown activations die at takeoff")
}

func TestTakeoff_ClearsTheHeldCoastInput(t *testing.T) {
	f := newFlightFixture(t)
	id := f.p.Basic().ID()
	// The player was walking right before takeoff — pickInput held a copy.
	f.i.lastMove[id] = &model.PlayerInput{
		Movement:       &phy.Vec2f{X: 1, Y: 0},
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
	}

	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))

	assert.Nil(t, f.i.lastMove[id],
		"landing must not coast on the pre-takeoff walk direction (§4.2)")
}

// --- the flight itself, through the real Update loop ------------------------

func TestUpdate_FliesTheLerpAndDiscardsInput(t *testing.T) {
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))
	require.True(t, f.p.Flying())
	// 20 units at 0.2/tick = 100 ticks.
	require.Equal(t, uint64(200), f.p.FlightArrivalTick())

	// A client that keeps sending movement — the lerp must be the only mover.
	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		Movement:       &phy.Vec2f{X: 0, Y: 1},
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
	})
	f.g.Tick = 150
	f.i.Update(0)

	assert.InDelta(t, 10, f.p.Position().X, 0.001, "halfway in ticks is halfway in space")
	assert.InDelta(t, 0, f.p.Position().Y, 0.001, "the queued movement input was discarded whole")
	assert.True(t, f.p.Flying())
}

func TestUpdate_LandsAtArrival(t *testing.T) {
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))
	dest := f.p.FlightDest()

	f.g.Tick = f.p.FlightArrivalTick()
	f.i.Update(0)

	assert.False(t, f.p.Flying(), "arrival lands")
	assert.LessOrEqual(t, f.p.Position().DistanceTo(dest), float32(landingJitterRadius)+0.001,
		"the landing snap is the destination, jittered like every other arrival")
}

func TestUpdate_UtilityPressesAreRefusedMidFlight(t *testing.T) {
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.i.tryStartFlight(f.p, startFlightTo("spawnpoint-2"))
	sc := f.p.SkillComponent()

	f.c.utilities = append(f.c.utilities, &model.UseUtility{Kind: skills.UtilityRecall})
	f.g.Tick = 150
	f.i.Update(0)

	assert.Empty(t, sc.PendingUtilities,
		"Recall mid-flight is a teleport out of a committed flight; Camp a mini-camp in mid-air")

	// Control: the same press right after landing goes through.
	f.g.Tick = f.p.FlightArrivalTick()
	f.i.Update(0)
	require.False(t, f.p.Flying())
	f.c.utilities = append(f.c.utilities, &model.UseUtility{Kind: skills.UtilityRecall})
	f.g.Tick++
	f.i.Update(0)
	assert.NotEmpty(t, sc.PendingUtilities, "a grounded press must still work")
}

func TestUpdate_StartFlightViaTheClientQueue(t *testing.T) {
	// The wire path: the request arrives through the client queue the Update
	// drain reads, not through a direct method call.
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.c.flights = append(f.c.flights, startFlightTo("spawnpoint-2"))

	f.i.Update(0)

	assert.True(t, f.p.Flying(), "the drain must route StartFlight into the machine")
}
