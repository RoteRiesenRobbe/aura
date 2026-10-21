package sys

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

func testLooks(t *testing.T) appearance.Catalog {
	t.Helper()
	item := func(id, slot, family string) *fstest.MapFile {
		fam := ""
		if family != "" {
			fam = fmt.Sprintf(`, "family": %q`, family)
		}
		return &fstest.MapFile{Data: []byte(fmt.Sprintf(`{"id": %q, "slot": %q%s, "starter": true, "name": "x"}`, id, slot, fam))}
	}
	c, err := appearance.Load(fstest.MapFS{
		"default.json":      item("default", "portrait", ""),
		"green-hood.json":   item("green-hood", "portrait", ""),
		"ring-plain.json":   item("ring-plain", "ring", "grey"),
		"ring-leather.json": item("ring-leather", "ring", "leather"),
	})
	require.NoError(t, err)
	return c
}

func joinWearing(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, avatar, ring string) model.PlayerEntity {
	t.Helper()
	c := newFakeClient()
	g.AddEntity(spectatorFor(c))
	nextTestAccountID++
	token, err := s.tickets.(*auth.TicketStore).Mint(auth.Ticket{
		AccountID: nextTestAccountID, CharacterID: nextTestAccountID,
		Name: "Looker", Avatar: avatar, Ring: ring, Faction: "aligned",
	})
	require.NoError(t, err)
	c.joins = append(c.joins, &model.Join{PlayTicket: token})
	s.Update(0)
	require.NotEmpty(t, g.players)
	return g.players[len(g.players)-1]
}

// plan-appearance.md C3: the join wears the look the ticket carries, as wire
// values, so the codec writes them without a catalog lookup per tick.
func TestJoinWearsTheTicketsLook(t *testing.T) {
	s, g := newStateFixture(t)
	looks := testLooks(t)
	s.SetAppearance(looks)

	p := joinWearing(t, s, g, "green-hood", "ring-leather")
	portrait, ring := p.Look()
	assert.Equal(t, looks.Wire(appearance.SlotPortrait, "green-hood"), portrait)
	assert.Equal(t, looks.Wire(appearance.SlotRing, "ring-leather"), ring)
	assert.NotZero(t, portrait)
	assert.NotZero(t, ring)
}

// A row naming an item this build does not hold (a catalog edit) joins
// wearing the defaults, never fails the join.
func TestJoinWithAnUnknownLookWearsTheDefaults(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(testLooks(t))

	p := joinWearing(t, s, g, "retired-bust", "retired-ring")
	portrait, ring := p.Look()
	assert.Zero(t, portrait)
	assert.Zero(t, ring)
}

// plan-appearance.md C4: every rebuild of the player struct keeps the look.
// Before C4 only the join set it, so a death, a reload or a revive drew the
// defaults, and once the look is saved that default would be written over the
// player's choice.
func assertWears(t *testing.T, p model.PlayerEntity, portrait, ring uint16) {
	t.Helper()
	gotPortrait, gotRing := p.Look()
	assert.Equal(t, portrait, gotPortrait, "portrait")
	assert.Equal(t, ring, gotRing, "ring")
}

func TestRespawn_CarriesTheLook(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetLook(2, 1)

	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2)
	assertWears(t, g.players[1], 2, 1)
}

func TestReconnect_CarriesTheLook(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetLook(2, 1)
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // disconnect
	reconnect(t, s, g, newFakeClient(), "ignored-name", token)

	require.Len(t, g.players, 2)
	assertWears(t, g.players[1], 2, 1)
}

// The long way round: deadState → reconnectStash → deadState → respawn.
func TestReconnectWhileDead_CarriesTheLookThroughRespawn(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetLook(2, 1)
	token := s.tokenByClient[c.UUID()]

	kill(t, s, p)
	g.RemoveEntity(g.livingSpectators()[0].Basic()) // disconnect while dead
	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	c2.respawns = append(c2.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2)
	assertWears(t, g.players[1], 2, 1)
}

func TestReviveAtCorpse_CarriesTheLook(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetLook(2, 1)
	kill(t, s, p)

	require.True(t, s.ReviveAtCorpse(g.livingCorpses()[0].Basic().ID(), 0.3))
	require.Len(t, g.players, 2)
	assertWears(t, g.players[1], 2, 1)
}

// plan-appearance.md C4, D11: the in-game picker's pick is worn on the next
// snapshot, free and at any time.
func TestSelectAppearance_WearsAWearableLook(t *testing.T) {
	s, g := newStateFixture(t)
	looks := testLooks(t)
	s.SetAppearance(looks)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	hood, leather := looks.Wire(appearance.SlotPortrait, "green-hood"), looks.Wire(appearance.SlotRing, "ring-leather")

	c.looks = append(c.looks, &model.SelectAppearance{Portrait: hood, Ring: leather})
	s.Update(0)

	assertWears(t, p, hood, leather)
}

// Anything not wearable is refused as a whole, silently: one bad half leaves
// both slots as they were and sends nothing.
func TestSelectAppearance_RefusesSilently(t *testing.T) {
	s, g := newStateFixture(t)
	looks := testLooks(t)
	s.SetAppearance(looks)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	hood, leather := looks.Wire(appearance.SlotPortrait, "green-hood"), looks.Wire(appearance.SlotRing, "ring-leather")
	p.SetLook(hood, leather)
	s.Update(0)
	sent := len(c.sent)

	for _, bad := range []model.SelectAppearance{
		{Portrait: 0, Ring: leather},
		{Portrait: hood, Ring: 0},
		{Portrait: 99, Ring: leather},
		{Portrait: hood, Ring: 99},
	} {
		c.looks = append(c.looks, &bad)
		s.Update(0)
		assertWears(t, p, hood, leather)
	}
	assert.Equal(t, sent, len(c.sent), "a refusal sends nothing")
}

// The choice persists (the save path C3's LOOK cheat lacked): a look change
// forces a save, and the snapshot names the items by id.
func TestLookChangeForcesASaveByID(t *testing.T) {
	s, g := newStateFixture(t)
	looks := testLooks(t)
	s.SetAppearance(looks)
	saves := withSaves(s)
	c := newFakeClient()
	joinPlayer(t, s, g, c, "Alice")
	s.Update(0) // the baseline
	require.Empty(t, saves.saved)

	c.looks = append(c.looks, &model.SelectAppearance{
		Portrait: looks.Wire(appearance.SlotPortrait, "green-hood"),
		Ring:     looks.Wire(appearance.SlotRing, "ring-leather"),
	})
	s.Update(0)
	s.Update(0)

	require.Len(t, saves.saved, 1, "a look change saves immediately, once")
	assert.Equal(t, "green-hood", saves.last(t).Portrait)
	assert.Equal(t, "ring-leather", saves.last(t).Ring)
}

// Wire 0 (a retired id drawn as the default) saves as the default ids, which
// clears the dead id from the row, the home_campfire_id rule.
func TestDefaultLookSavesTheDefaultIDs(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(testLooks(t))
	saves := withSaves(s)
	joinWearing(t, s, g, "retired-bust", "retired-ring")

	s.FlushLiveCharacters(make(chan struct{}))
	s.Update(0)

	require.NotEmpty(t, saves.saved)
	assert.Equal(t, appearance.DefaultPortrait, saves.last(t).Portrait)
	assert.Equal(t, appearance.DefaultRing, saves.last(t).Ring)
}
