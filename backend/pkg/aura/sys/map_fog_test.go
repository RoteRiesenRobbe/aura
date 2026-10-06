package sys

// Map fog persistence — plan-map-fog-persistence.md F1.
//
// The reveal is CONNECTION STATE with the discovered-campfire set's seams:
// seeded from the play ticket at join, carried through the reconnect stash
// (alive and dead), re-added after death's removal fan-out, dropped on
// disconnect. Every seam that is missing loses reveal SILENTLY, because the
// next save simply writes less than it could have.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/mapfog"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// distantSpot is well clear of every spawn the fixture can pick (its world is
// 60 × 40), so a reveal there can only come from walking there.
var distantSpot = phy.Vec2f{X: 201, Y: 151}

// walkTo puts a player somewhere and lets the loop see it.
func walkTo(s *ConnectionStateSystem, p model.PlayerEntity, pos phy.Vec2f) {
	p.SetPosition(pos)
	s.Update(0)
}

func TestMapFog_WalkingRevealsTheAOI(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	require.False(t, s.fog[c.UUID()].RevealedAt(distantSpot))

	walkTo(s, p, distantSpot)

	fog := s.fog[c.UUID()]
	assert.True(t, fog.RevealedAt(distantSpot))
	assert.True(t, fog.RevealedAt(phy.Vec2f{X: distantSpot.X - 9.5, Y: distantSpot.Y + 5.5}), "the AOI's corner")
	assert.False(t, fog.RevealedAt(phy.Vec2f{X: distantSpot.X + 12, Y: distantSpot.Y}), "beyond the AOI")
}

// L4 / D11: a flyer streams a SCALED viewport, but the reveal is the fixed
// walking AOI. Reading the live viewport body here would widen the stored
// reveal past what the client stamps.
func TestMapFog_FlyingRevealsTheWalkingAOIOnly(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", distantSpot, 0)
	require.True(t, p.Flying())
	walkTo(s, p, distantSpot)

	fog := s.fog[c.UUID()]
	halfW := float32(constant.ViewPortWidth / 2)
	assert.True(t, fog.RevealedAt(phy.Vec2f{X: distantSpot.X + halfW - 0.5, Y: distantSpot.Y}))
	assert.False(t, fog.RevealedAt(phy.Vec2f{X: distantSpot.X + halfW + 1.5, Y: distantSpot.Y}),
		"a flight must not reveal a wider band than walking the route would")
}

// D6: fog never forces a save. Exploring would otherwise write constantly.
func TestMapFog_ANewCellNeverForcesASave(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Alice")
	s.Update(0) // baseline
	require.Empty(t, saves.saved)

	for x := float32(0); x < 300; x += 3 {
		walkTo(s, p, phy.Vec2f{X: x, Y: 0})
	}
	assert.Empty(t, saves.saved, "the reveal rides the interval and the other triggers")
}

func TestMapFog_TheSaveCarriesTheReveal(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Alice")
	walkTo(s, p, distantSpot)

	done := make(chan struct{})
	s.FlushLiveCharacters(done)
	s.Update(0)

	restored := mapfog.New()
	restored.Seed(saves.last(t).MapFog)
	assert.True(t, restored.RevealedAt(distantSpot))
}

// The cold load: the ticket's stored chunks seed the connection's reveal, and a
// chunk from another grid is skipped rather than refusing the join (D10).
func TestMapFog_JoinSeedsFromTheTicket(t *testing.T) {
	s, g := newStateFixture(t)
	stored := mapfog.New()
	stored.MarkAt(distantSpot, 0, nil)
	chunks := append(stored.Chunks(), persist.FogChunk{
		X: 9, Y: 9, CellSize: mapfog.CellSize * 2, ChunkCells: mapfog.ChunkCells, Bits: []byte{0xff},
	})

	c := newFakeClient()
	joinWithState(t, s, g, c, "Alice", persist.CharacterState{
		Level: 1, ActiveAuraSlot: persist.NoActiveAura, Spellbook: map[int32]int{}, MapFog: chunks,
	})

	assert.True(t, s.fog[c.UUID()].RevealedAt(distantSpot))
}

// Death does not re-fog the world (D12), and this is the seam where the
// removal fan-out drops the reveal and handleDeath has to put it back.
func TestMapFog_DeathKeepsTheReveal(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	walkTo(s, p, distantSpot)

	kill(t, s, p)
	assert.True(t, s.fog[c.UUID()].RevealedAt(distantSpot), "dying must not re-fog the map")

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2, "respawn must rebuild the player")
	assert.True(t, s.fog[c.UUID()].RevealedAt(distantSpot))
}

// The reload seam, alive: the stash is the only carrier of a session's reveal
// across an F5.
func TestMapFog_ReconnectCarriesTheRevealThroughTheStash(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	walkTo(s, p, distantSpot)
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // net-layer disconnect
	assert.True(t, s.stashByToken[token].fog.RevealedAt(distantSpot), "the stash must carry the reveal")
	assert.Nil(t, s.fog[c.UUID()], "and the dead connection must not keep it")

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	require.Len(t, g.players, 2, "reconnect must rebuild the player")
	assert.True(t, s.fog[c2.UUID()].RevealedAt(distantSpot), "the reveal moves to the new connection")
}

// The reload seam, dead: a disconnect on the death overlay stashes through
// removeFromSpectators, a different path with its own twin to forget.
func TestMapFog_DeadDisconnectCarriesTheReveal(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	walkTo(s, p, distantSpot)
	token := s.tokenByClient[c.UUID()]
	kill(t, s, p)

	sps := g.livingSpectators()
	require.NotEmpty(t, sps)
	g.RemoveEntity(sps[len(sps)-1].Basic())

	require.Contains(t, s.stashByToken, token)
	assert.True(t, s.stashByToken[token].fog.RevealedAt(distantSpot))
	assert.Nil(t, s.fog[c.UUID()])
}

// The session-expiry save snapshots a stash, which has no player to ask.
func TestMapFog_SessionExpirySaveCarriesTheReveal(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	walkTo(s, p, distantSpot)
	g.RemoveEntity(p.Basic())

	saves := withSaves(s) // installed AFTER the disconnect, so only the sweep records
	g.tick += reconnectStashTTLTicks + 1
	s.Update(0)

	restored := mapfog.New()
	restored.Seed(saves.last(t).MapFog)
	assert.True(t, restored.RevealedAt(distantSpot))
}

// --- F2: the one-shot publication (D7) ---

// The cold load publishes the stored reveal to the owning player the tick it
// enters the world, and only then: the next tick carries nothing.
func TestMapFog_JoinPublishesTheStoredRevealOnce(t *testing.T) {
	s, g := newStateFixture(t)
	stored := mapfog.New()
	stored.MarkAt(distantSpot, 0, nil)

	c := newFakeClient()
	p := joinWithState(t, s, g, c, "Alice", persist.CharacterState{
		Level: 1, ActiveAuraSlot: persist.NoActiveAura, Spellbook: map[int32]int{}, MapFog: stored.Chunks(),
	})

	published := mapfog.New()
	published.Seed(p.MapFog())
	assert.True(t, published.RevealedAt(distantSpot), "the join tick publishes the stored reveal")

	resetTick(p) // what the StatusEffectsSystem does at the next tick's start
	s.Update(0)
	assert.Nil(t, p.MapFog(), "a one-shot: nothing on an ordinary tick that marks nothing new")
}

// A respawn, a reconnect and a revive build a brand-new player with empty
// one-shots, so each republishes — including what was walked this session.
func TestMapFog_EveryEntryIntoTheWorldRepublishes(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	walkTo(s, p, distantSpot)

	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2)
	respawned := mapfog.New()
	respawned.Seed(g.players[1].MapFog())
	assert.True(t, respawned.RevealedAt(distantSpot), "respawn republishes")

	token := s.tokenByClient[c.UUID()]
	g.RemoveEntity(g.players[1].Basic())
	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	require.Len(t, g.players, 3)
	reattached := mapfog.New()
	reattached.Seed(g.players[2].MapFog())
	assert.True(t, reattached.RevealedAt(distantSpot), "reconnect republishes")
}

// A dwell republishes the campfire pair but NOT the fog: it is not an entry
// into the world, and the client already has everything it walked.
func TestMapFog_ADwellDoesNotRepublish(t *testing.T) {
	s, g := newStateFixture(t)
	first, _ := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first})
	p := joinPlayer(t, s, g, newFakeClient(), "Alice")
	// Off the fire first: the join tick may already have counted dwell tick 1
	// (joinPlayer's note), which would complete the dwell one tick early.
	walkTo(s, p, distantSpot)
	p.SetPosition(first.Pos)
	for range campfireDwellTicks {
		resetTick(p)
		s.Update(0)
	}
	require.NotNil(t, p.DiscoveredCampfires(), "the dwell completed this tick")
	assert.Nil(t, p.MapFog())
}

// resetTick clears a player's one-shots, as the StatusEffectsSystem does at
// the start of each tick (this fixture drives only the ConnectionStateSystem).
func resetTick(p model.PlayerEntity) {
	p.(interface{ ResetTickNumbers() }).ResetTickNumbers()
}

// --- plan-map-fog-darkness.md C2/C3: the live map comes from the server ---

// D6: a mark that sets new bits publishes ONLY the chunks it touched, and
// walking back over mapped ground publishes nothing.
func TestMapFog_ANewMarkPublishesOnlyTheTouchedChunks(t *testing.T) {
	s, g := newStateFixture(t)
	p := joinPlayer(t, s, g, newFakeClient(), "Alice")

	resetTick(p)
	walkTo(s, p, distantSpot)
	require.NotEmpty(t, p.MapFog(), "the step published its delta")
	live := mapfog.New()
	live.Seed(p.MapFog())
	assert.True(t, live.RevealedAt(distantSpot))
	assert.Len(t, p.MapFog(), 1, "one chunk touched, not the whole reveal")

	spawn := g.players[0].Position()
	resetTick(p)
	walkTo(s, p, spawn)
	resetTick(p)
	walkTo(s, p, distantSpot)
	assert.Nil(t, p.MapFog(), "walking back over mapped ground publishes nothing")
}

// §3 end to end: in complete darkness with no light the step marks nothing
// there (the light cases live in mapfog's dark_test.go).
func TestMapFog_DarknessNeedsLight(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetDarkMask(mapfog.BuildDarkMask(mapfog.DarkWorld{
		Circles: []mapfog.Circle{{X: distantSpot.X, Y: distantSpot.Y, R: 30}},
	}))
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	walkTo(s, p, distantSpot)
	assert.False(t, s.fog[c.UUID()].RevealedAt(distantSpot), "no light, nothing mapped")
}
