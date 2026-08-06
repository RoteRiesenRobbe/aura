package player

// Flight state machine — plan-flight-paths.md C2 (§4.1/§4.2, D13).
//
// The load-bearing claim here is STRUCTURAL non-interaction: takeoff removes
// the body and aura sensor from the physics space, so nothing that
// reaches entities through sensor overlap — damage, debuffs, heals, mob
// acquisition, actor prompts, other players' viewport queries — can reach a
// flyer. These tests pin that with a real phy.Space and a real recording
// sensor, in both directions and through the landing restore (landmine 1:
// a flight that never fully lands is the same bug class as one that never
// fully takes off).

import (
	"os"
	"regexp"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// newFlightPlayer builds a real player (real shapes, real viewport box) with
// walk 0.05 × factor 4 = flight speed 0.2/tick — the §4.1 reference numbers.
func newFlightPlayer(t *testing.T) *player {
	t.Helper()
	g := &fakeGame{reg: newStubRegistry(defDamageAura, defHarvest)}
	g.cfg.PlayerConfig = cfg.PlayerConfig{
		LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100,
		WalkingSpeedPerTick: 0.05, FlightSpeedFactor: 4,
	}
	return New(g, &fakePlayerClient{}, "flyer").(*player)
}

// groundSensor is a stand-in for every space-mediated reader of the player —
// a mob's aggro sensor, an actor's interaction sensor, another player's
// viewport: Mask'd to see the player's body Layer, in a different group.
func groundSensor(pos phy.Vec2f) *phy.Circle {
	s := phy.NewCircle(pos, 5)
	s.Shape().IsSensor = true
	s.Shape().Mask = int(model.LayerPlayerCollision)
	return s
}

// sees reports whether the sensor's collision set currently holds the shape.
func sees(sensor *phy.Circle, c phy.DynamicCollider) bool {
	for other := range sensor.Collisions() {
		if other == c {
			return true
		}
	}
	return false
}

func addAllShapes(space *phy.Space, p *player) {
	for _, b := range p.Bodies() {
		space.AddShape(b)
	}
}

func TestBeginFlight_LeavesTheGroundWorldOnTheSpot(t *testing.T) {
	p := newFlightPlayer(t)
	p.SetPosition(phy.Vec2f{X: 1, Y: 1})
	space := phy.NewSpace()
	addAllShapes(space, p)
	sensor := groundSensor(phy.Vec2f{X: 1, Y: 1})
	space.AddShape(sensor)

	space.Update()
	require.True(t, sees(sensor, p.Body), "fixture: the sensor records the grounded body")

	p.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)

	// ⚑ The purge is IMMEDIATE (the §54 invariant), not next-rebuild: the
	// sensor's set is clean before any space.Update runs, so there is no
	// one-tick window in which a stale read re-latches the flyer.
	assert.False(t, sees(sensor, p.Body), "takeoff must purge the body from every recorded set on the spot")

	space.Update()
	assert.False(t, sees(sensor, p.Body), "a rebuild must not re-record the absent body")
	assert.True(t, p.Flying())
}

func TestBeginFlight_ViewportStaysInTheSpace(t *testing.T) {
	p := newFlightPlayer(t)
	p.SetPosition(phy.Vec2f{X: 1, Y: 1})
	space := phy.NewSpace()
	addAllShapes(space, p)

	// A body the flyer's viewport watches — the fly-over view (§4.2: only
	// the outbound direction is cut; the flyer still sees everything).
	watched := phy.NewCircle(phy.Vec2f{X: 2, Y: 1}, 0.25)
	watched.Shape().Layer = int(model.LayerViewportCollision)
	space.AddShape(watched)

	p.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)
	space.Update()

	found := false
	for c := range p.Viewport().Collisions() {
		if c == phy.DynamicCollider(watched) {
			found = true
		}
	}
	assert.True(t, found, "the flyer's viewport must keep querying the ground world")
}

func TestGround_ReEntersAndRestores(t *testing.T) {
	p := newFlightPlayer(t)
	p.SetPosition(phy.Vec2f{X: 1, Y: 1})
	space := phy.NewSpace()
	addAllShapes(space, p)
	sensor := groundSensor(phy.Vec2f{X: 1, Y: 1})
	space.AddShape(sensor)

	p.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)
	p.Ground()

	assert.False(t, p.Flying())
	space.Update()
	assert.True(t, sees(sensor, p.Body),
		"after landing the world must be able to record the player again (a mob can re-acquire)")

	// The wire accessors return to their grounded zero values.
	assert.Equal(t, phy.Vec2f{}, p.FlightDest())
	assert.Equal(t, uint64(0), p.FlightArrivalTick())
}

func TestGround_IsANoopOnTheGround(t *testing.T) {
	p := newFlightPlayer(t)
	space := phy.NewSpace()
	addAllShapes(space, p)

	before := p.viewport.Extent()
	p.Ground() // never flew
	assert.Equal(t, before, p.viewport.Extent())
	assert.False(t, p.Flying())
}

func TestBeginFlight_ViewportGrowsAndLandingRestores(t *testing.T) {
	p := newFlightPlayer(t)
	space := phy.NewSpace()
	addAllShapes(space, p)

	base := phy.Vec2f{X: constant.ViewPortWidth / 2, Y: constant.ViewPortHeight / 2}
	require.Equal(t, base, p.viewport.Extent(), "fixture: default extent")

	p.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 0}, 100)
	assert.Equal(t, base.Mult(flightViewportScale), p.viewport.Extent(),
		"takeoff grows the server AOI to the flight scale (D3)")

	p.Ground()
	assert.Equal(t, base, p.viewport.Extent(), "landing restores the default AOI")
}

func TestFlightPosition_LerpIsExactAtBothEndpoints(t *testing.T) {
	p := newFlightPlayer(t)
	from := phy.Vec2f{X: 0, Y: 0}
	to := phy.Vec2f{X: 20, Y: 0}
	p.SetPosition(from)

	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", to, 100)

	// walk 0.05 × factor 4 = 0.2/tick over 20 units = 100 ticks.
	require.Equal(t, uint64(200), p.FlightArrivalTick(), "arrivalTick = start + distance/speed")

	pos, arrived := p.FlightPosition(100)
	assert.Equal(t, from, pos, "takeoff tick: still at the origin")
	assert.False(t, arrived)

	pos, arrived = p.FlightPosition(150)
	assert.InDelta(t, 10, pos.X, 0.001, "halfway in ticks is halfway in space")
	assert.False(t, arrived)

	pos, arrived = p.FlightPosition(200)
	assert.Equal(t, to, pos, "the arrival position IS the destination, exactly")
	assert.True(t, arrived)

	pos, arrived = p.FlightPosition(250)
	assert.Equal(t, to, pos, "past-arrival ticks stay at the destination")
	assert.True(t, arrived)
}

func TestBeginFlight_WhileFlyingIsRefused(t *testing.T) {
	p := newFlightPlayer(t)
	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 0}, 100)
	first := p.FlightDest()

	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-3", phy.Vec2f{X: -20, Y: 0}, 100)
	assert.Equal(t, first, p.FlightDest(), "a second takeoff mid-flight must not re-target")
}

func TestFlightAccessors_ZeroOnTheGround(t *testing.T) {
	p := newFlightPlayer(t)
	assert.False(t, p.Flying())
	assert.Equal(t, phy.Vec2f{}, p.FlightDest())
	assert.Equal(t, uint64(0), p.FlightArrivalTick())
	pos, arrived := p.FlightPosition(42)
	assert.Equal(t, p.Position(), pos)
	assert.False(t, arrived)
}

// The C4-shrinking claim (§4.2): other players' snapshots are assembled from
// their viewport's collision set (core/net.go playerSendState), so a flyer
// vanishing from that set IS snapshot invisibility — no send-side filter
// needed. The observer here is a real second player, not a synthetic sensor.
func TestBeginFlight_InvisibleToAnotherPlayersViewport(t *testing.T) {
	flyer := newFlightPlayer(t)
	observer := newFlightPlayer(t)
	flyer.SetPosition(phy.Vec2f{X: 1, Y: 1})
	observer.SetPosition(phy.Vec2f{X: 2, Y: 1})

	space := phy.NewSpace()
	addAllShapes(space, flyer)
	addAllShapes(space, observer)

	inView := func() bool {
		for c := range observer.Viewport().Collisions() {
			if c == phy.DynamicCollider(flyer.Body) {
				return true
			}
		}
		return false
	}

	space.Update()
	require.True(t, inView(), "fixture: the grounded flyer is in the observer's viewport")

	flyer.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)
	assert.False(t, inView(), "takeoff purges the flyer from the observer's set immediately")
	space.Update()
	assert.False(t, inView(), "and the rebuild does not re-record them")

	// The flyer's own snapshot survives: self rides gs.Player explicitly,
	// never the viewport query — nothing here can hide you from yourself.

	flyer.Ground()
	space.Update()
	assert.True(t, inView(), "landing makes the player visible again")
}

// Own aura leaves the space with the body: a flyer's aura ticks on nothing
// (§4.2 "the flyer's own aura touches nothing").
func TestBeginFlight_OwnAuraTouchesNothing(t *testing.T) {
	flyer := newFlightPlayer(t)
	other := newFlightPlayer(t)
	flyer.SetPosition(phy.Vec2f{X: 1, Y: 1})
	other.SetPosition(phy.Vec2f{X: 1.4, Y: 1})

	space := phy.NewSpace()
	addAllShapes(space, flyer)
	addAllShapes(space, other)
	// A live aura sized like an active skill's ring would be.
	flyer.aura.SetRadius(3)

	space.Update()
	require.NotEmpty(t, flyer.aura.Collisions(), "fixture: the grounded aura overlaps the neighbour")

	flyer.BeginFlight(space, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)
	space.Update()

	assert.Empty(t, flyer.aura.Collisions(), "an airborne aura records nothing")
}

// zoomTSPath is the client's zoom module, relative to this package.
const zoomTSPath = "../../../../../frontend/src/features/camera/logic/Zoom.ts"

// flightViewportScaleTS extracts the client's mirror of the AOI scale.
var flightViewportScaleTS = regexp.MustCompile(
	`FLIGHT_VIEWPORT_SCALE\s*=\s*([0-9.]+)`)

// The client's zoom-out and the server's AOI are ONE number in two languages,
// and this is the only thing that can fail when they stop agreeing.
//
// ⚑ The failure it guards is silent by construction: retuning
// flightViewportScale alone leaves the whole Go suite AND the whole vitest
// suite green — Zoom.test.ts pins that both client bounds derive from the
// client's copy, which stays internally consistent while it drifts away from
// what the server actually streams. What you then see in the air is entities
// popping in at the screen edges (landmine 3), which reads as a rendering bug
// rather than as a retune that was only half applied.
//
// It lives on the SERVER side because the server is the authority: the number
// is an area-of-interest, and the client zoom is the mirror. The direction that
// matters most is therefore caught by the suite a backend retune already runs.
func TestFlightViewportScale_MatchesTheClient(t *testing.T) {
	source, err := os.ReadFile(zoomTSPath)
	require.NoError(t, err, "cannot read %s — if the client moved, move this pin with it", zoomTSPath)

	match := flightViewportScaleTS.FindSubmatch(source)
	require.NotNil(t, match,
		"FLIGHT_VIEWPORT_SCALE is gone from %s: either flight's client half was removed "+
			"(then remove flightViewportScale too) or the const was renamed", zoomTSPath)

	// ⚑ Parsed at float64 and compared with a delta, NOT for equality at
	// float32. The claim is about the two written LITERALS agreeing, and an
	// exact float32 comparison answers a different question: it went red the
	// first time the value was retuned to something not exactly representable
	// in binary (2.5 and 1.75 are; 1.2 is not), reporting 1.2 ≠ 1.2000000476837
	// for two files that both said 1.2. The delta is far tighter than any
	// retune could be and far looser than the representation error.
	client, err := strconv.ParseFloat(string(match[1]), 64)
	require.NoError(t, err)
	assert.InDelta(t, float64(flightViewportScale), client, 1e-9,
		"the client zoom cap and the server AOI must be retuned TOGETHER "+
			"(flight.go's flightViewportScale ↔ Zoom.ts's FLIGHT_VIEWPORT_SCALE)")
}
