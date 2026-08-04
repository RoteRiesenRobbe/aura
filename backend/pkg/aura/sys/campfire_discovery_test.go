package sys

// Campfire discovery — plan-world-map.md C2, absorbing plan-flight-paths.md C1.
//
// Discovery is a FOURTH consequence of the one act the dwell tracker already
// performs (bind the respawn anchor, refill Camp charges, stamp the client's
// "bound" feedback). These tests exist to hold that structure: the set is
// connection state with the same four seams as s.anchors, and every seam that
// is missing loses discoveries SILENTLY — the next save writes the shrunken set
// back and the loss reads as "never discovered it".

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// twoFires is the fixture every case here shares: two authored anchors far
// enough apart that no position is inside both bind radii.
func twoFires() (CampfireAnchor, CampfireAnchor) {
	return CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75},
		CampfireAnchor{ID: "spawnpoint-2", Pos: phy.Vec2f{X: -30, Y: -30}, DwellRadius: 0.75}
}

// dwellAt parks a player in a fire's bind radius for exactly the threshold.
func dwellAt(s *ConnectionStateSystem, p model.PlayerEntity, fire CampfireAnchor) {
	p.SetPosition(fire.Pos)
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
}

func TestDwell_DiscoversTheFireAndAccumulatesAcrossFires(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	assert.Empty(t, s.DiscoveredCampfires(c.UUID()), "a fresh character has discovered nothing")

	dwellAt(s, p, first)
	assert.Equal(t, []string{"spawnpoint-1"}, s.DiscoveredCampfires(c.UUID()),
		"completing a dwell must discover that fire")

	// ⚑ The set ACCUMULATES; binding elsewhere does not move a marker, it adds
	// one. Discovery and the bind share a trigger but not a shape — one is a
	// growing set, the other a single current value.
	dwellAt(s, p, second)
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, s.DiscoveredCampfires(c.UUID()),
		"a second fire joins the set rather than replacing the first")
	assert.Equal(t, "spawnpoint-2", s.anchors[c.UUID()], "the bind, unlike the set, moves")

	// Returning to a known fire re-binds without duplicating it.
	dwellAt(s, p, first)
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, s.DiscoveredCampfires(c.UUID()),
		"re-dwelling at a known fire must not duplicate it")
	assert.Equal(t, "spawnpoint-1", s.anchors[c.UUID()])
}

// The one-shot publication reaches the player, which is the only path the wire
// has: codec reads HomeCampfire()/DiscoveredCampfires() off the player entity.
func TestDwell_PublishesTheSetAndHomeToTheOwningPlayer(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	dwellAt(s, p, first)
	assert.Equal(t, "spawnpoint-1", p.HomeCampfire())
	assert.Equal(t, []string{"spawnpoint-1"}, p.DiscoveredCampfires())

	// ⚑ A ONE-SHOT, like campfire_bound beside it: cleared with the per-tick
	// accumulators, so an unchanged set costs nothing on the wire.
	p.(interface{ ResetTickNumbers() }).ResetTickNumbers()
	s.Update(0)
	assert.Empty(t, p.HomeCampfire(), "standing at a known fire must not republish")
	assert.Empty(t, p.DiscoveredCampfires())
}

// L3 in both directions: only boot-frozen AUTHORED fires can be discovered. A
// player-placed mini-camp (plan-downtime.md R4 C2) is a spawned mob that never
// enters s.campfires, so it can no more become a map marker than it can become
// a spawn point. Standing anywhere that is not an authored anchor discovers
// nothing, however long you stand there.
func TestDwell_OnlyAuthoredFiresAreDiscoverable(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	p.SetPosition(phy.Vec2f{X: 500, Y: 500})
	for i := 0; i < campfireDwellTicks*3; i++ {
		s.Update(0)
	}
	assert.Empty(t, s.DiscoveredCampfires(c.UUID()),
		"dwelling away from every authored anchor must discover nothing")
	assert.Empty(t, s.anchors, "and must bind nothing, which is the same guarantee")
}

// The cold-login seam: the set is connection state, so the play ticket is the
// only place a persisted set can arrive from.
func TestJoin_SeedsTheDiscoveredSetFromTheTicket(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()

	p := joinPlayerWithState(t, s, g, c, "Alice", persist.CharacterState{
		Level:               3,
		HomeCampfireID:      "spawnpoint-2",
		DiscoveredCampfires: []string{"spawnpoint-1", "spawnpoint-2"},
	})

	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, s.DiscoveredCampfires(c.UUID()))
	// Published on the JOIN tick, or the map is empty until the next rebind —
	// the client's only source is this one-shot.
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, p.DiscoveredCampfires())
	assert.Equal(t, "spawnpoint-2", p.HomeCampfire())
	// ⚑ And WITHOUT the bind stamp: entering the world republishes the pair
	// without anything having been bound just now, and campfire_bound is what
	// pops "Bound to campfire" over the character.
	assert.False(t, p.CampfireBound(), "a login must not read as a fresh bind")
}

// An id the loaded zone no longer places is skipped SILENTLY — the same rule
// home_campfire_id already follows, and for the same reason: a fire deleted in
// the zone editor must never cost a player their world.
func TestJoin_AnUnplaceableDiscoveredIdIsCarriedNotRejected(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	c := newFakeClient()

	p := joinPlayerWithState(t, s, g, c, "Alice", persist.CharacterState{
		Level:               1,
		DiscoveredCampfires: []string{"spawnpoint-1", "spawnpoint-deleted"},
	})

	require.NotNil(t, p)
	// The server does NOT filter: the client's bundled zone data is what decides
	// whether a marker can be drawn, and it can differ from the server's content
	// across a deploy. Dropping it here would also lose the row on the next save
	// — permanent, for what may be a transient content edit.
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-deleted"}, s.DiscoveredCampfires(c.UUID()))
}

// Death does not un-discover. The bind survives death (pinned next door in
// state_test.go); the fires found on the way to dying survive it for the same
// reason — and this is the seam where the removal fan-out drops the set and
// handleDeath has to put it back.
func TestDeath_KeepsTheDiscoveredSet(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	dwellAt(s, p, first)
	require.Equal(t, []string{"spawnpoint-1"}, s.DiscoveredCampfires(c.UUID()))

	kill(t, s, p)
	assert.Equal(t, []string{"spawnpoint-1"}, s.DiscoveredCampfires(c.UUID()),
		"dying must not un-discover a campfire")

	// And the respawned player is re-published the set, since it is a brand-new
	// entity with empty one-shots.
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2, "respawn must rebuild the player")
	assert.Equal(t, []string{"spawnpoint-1"}, g.players[1].DiscoveredCampfires())
}

// The reload seam. The reconnect stash is the ONLY carrier of a session's
// discoveries across an F5 — without this leg the loss is silent, because the
// next save writes the shrunken set back over the good one.
func TestReconnect_CarriesTheDiscoveredSetThroughTheStash(t *testing.T) {
	s, g := newStateFixture(t)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	dwellAt(s, p, first)
	dwellAt(s, p, second)
	require.Len(t, s.DiscoveredCampfires(c.UUID()), 2)
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // net-layer disconnect
	require.Len(t, s.stashByToken, 1)
	assert.Len(t, s.stashByToken[token].discovered, 2, "the stash must carry the set")
	assert.Empty(t, s.discovered[c.UUID()], "and the dead connection must not keep it")

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)

	require.Len(t, g.players, 2, "reconnect must rebuild the player")
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, s.DiscoveredCampfires(c2.UUID()),
		"the set moves to the new connection")
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-2"}, g.players[1].DiscoveredCampfires(),
		"and is republished, since the rebuilt player has empty one-shots")
}
