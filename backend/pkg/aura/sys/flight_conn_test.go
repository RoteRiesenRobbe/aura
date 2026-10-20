package sys

// Flight's ConnState half — plan-flight-paths.md C2.
//
// Three seams answer flight validation (CampfireAt / CampfireDiscovered /
// CampfirePosition, §4.4), the dwell tracker skips flyers (§4.2 — a flyer's
// position sweeps the whole world), and a disconnect mid-flight stashes the
// DESTINATION (D12/D14). All against real joined players, because the flying
// flag lives on the player the tracker actually iterates.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func TestCampfireAt_AnswersFromTheAuthoredSetOnly(t *testing.T) {
	s, _ := newStateFixture(t)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})

	id, ok := s.CampfireAt(first.Pos)
	require.True(t, ok)
	assert.Equal(t, "spawnpoint-1", id)

	id, ok = s.CampfireAt(second.Pos.Add(phy.Vec2f{X: 0.5, Y: 0}))
	require.True(t, ok, "anywhere inside the bind radius counts as standing at the fire")
	assert.Equal(t, "spawnpoint-2", id)

	_, ok = s.CampfireAt(phy.Vec2f{X: 100, Y: 100})
	assert.False(t, ok, "open ground is at no fire")
}

func TestCampfireDiscovered_FollowsTheVisit(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	first.StartingSpawn = true
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	assert.True(t, s.CampfireDiscovered(c.UUID(), "spawnpoint-1"),
		"the join lands in the starting fire's circle, which discovers it")
	assert.False(t, s.CampfireDiscovered(c.UUID(), "spawnpoint-2"),
		"discovery is per fire, not per character-has-any")

	visit(s, p, second)
	assert.True(t, s.CampfireDiscovered(c.UUID(), "spawnpoint-2"))
}

func TestCampfirePosition_StaleIdIsSkippedNotAnError(t *testing.T) {
	s, _ := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})

	pos, ok := s.CampfirePosition("spawnpoint-1")
	require.True(t, ok)
	assert.Equal(t, first.Pos, pos)

	_, ok = s.CampfirePosition("spawnpoint-99")
	assert.False(t, ok, "an id that no longer resolves is UNBOUND, not an error (§5)")
}

// The §4.2 flyer skip: a fly-over must not discover the fire below.
func TestDiscovery_SkipsFlyers(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	first.StartingSpawn = true
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	bindAt(t, s, p, first.Pos)
	require.Equal(t, []string{"spawnpoint-1"}, s.DiscoveredCampfires(c.UUID()))
	require.Equal(t, "spawnpoint-1", s.anchors[c.UUID()])

	// Airborne, parked over the second fire — the slow-fly-over scenario (the
	// speed is a PLACEHOLDER; someone WILL tune it down).
	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", second.Pos, 0)
	p.SetPosition(second.Pos)
	for i := 0; i < 2*constant.TicksPerSecond; i++ {
		s.Update(0)
	}

	assert.Equal(t, []string{"spawnpoint-1"}, s.DiscoveredCampfires(c.UUID()),
		"a fly-over must not discover the fire below (discovery = having stood there)")

	// Landing at the fire discovers it exactly like walking up to it would.
	p.Ground()
	visit(s, p, second)
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, s.DiscoveredCampfires(c.UUID()))
	assert.Equal(t, "spawnpoint-1", s.anchors[c.UUID()], "landing binds nothing")
}

// D12/D14: a disconnect mid-flight resolves the flight immediately — the
// stash records the DESTINATION, so reconnect (and the session-expiry save,
// which reads the same field) lands the character where the committed flight
// was going.
func TestDisconnect_MidFlightStashesTheDestination(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	visit(s, p, first)
	token := s.tokenByClient[c.UUID()]

	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", second.Pos, 0)
	// Mid-route: the live position is nowhere near either endpoint.
	p.SetPosition(phy.Vec2f{X: -10, Y: -10})

	g.RemoveEntity(p.Basic()) // net-layer disconnect
	require.Len(t, s.stashByToken, 1)
	assert.Equal(t, second.Pos, s.stashByToken[token].position,
		"the stash must hold the destination, not the mid-air position")

	// And the reconnect lands there.
	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	require.Len(t, g.players, 2)
	landed := g.players[1]
	assert.Equal(t, second.Pos, landed.Position(), "reconnect resolves the flight at the destination")
	assert.False(t, landed.Flying(), "a rebuilt player is on the ground")
}

// A grounded disconnect keeps stashing the live position — the flight rule
// must not leak into the normal path.
func TestDisconnect_GroundedStillStashesTheLivePosition(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	spot := phy.Vec2f{X: 3, Y: 4}
	p.SetPosition(spot)
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic())
	require.Len(t, s.stashByToken, 1)
	assert.Equal(t, spot, s.stashByToken[token].position)
}
