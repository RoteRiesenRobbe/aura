package sys

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// plan-appearance.md C5: ownership and unlocks.

const testThorns = skills.SkillID(7)

type lookWorld struct{}

func (lookWorld) GetByName(name string) (*skills.SkillDefinition, error) {
	if name == "Thorns" {
		return &skills.SkillDefinition{ID: testThorns, Name: "Thorns", MaxLevel: 30}, nil
	}
	return nil, fmt.Errorf("no skill %q", name)
}
func (lookWorld) ResolveSpecies(string) (mobs.MobID, error) { return 0, fmt.Errorf("no mobs here") }
func (lookWorld) CheckQuestStage(string, string) error      { return fmt.Errorf("no quests here") }

// gatedLooks is testLooks plus one locked item per scope. Flat order:
// portraits crown 0, default 1, green-hood 2; rings ring-claws 3,
// ring-forest 4, ring-leather 5, ring-plain 6.
func gatedLooks(t *testing.T) appearance.Catalog {
	t.Helper()
	file := func(s string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(s)} }
	c, err := appearance.Load(fstest.MapFS{
		"default.json":      file(`{"id": "default", "slot": "portrait", "starter": true, "name": "x"}`),
		"green-hood.json":   file(`{"id": "green-hood", "slot": "portrait", "starter": true, "name": "x"}`),
		"ring-plain.json":   file(`{"id": "ring-plain", "slot": "ring", "family": "grey", "starter": true, "name": "x"}`),
		"ring-leather.json": file(`{"id": "ring-leather", "slot": "ring", "family": "leather", "starter": true, "name": "x"}`),
		"ring-forest.json": file(`{"id": "ring-forest", "slot": "ring", "family": "forest", "scope": "character", "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`),
		"ring-claws.json": file(`{"id": "ring-claws", "slot": "ring", "family": "leatherClaws", "scope": "bloodline", "name": "x",
			"conditions": [{"kind": "bloodline_ascensions", "value": 1}]}`),
		"crown.json": file(`{"id": "crown", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "skill_level", "skill": "Thorns", "value": 2}]}`),
	}, lookWorld{})
	require.NoError(t, err)
	require.Equal(t, uint16(0), c.Flat("crown"))
	require.Equal(t, uint16(3), c.Flat("ring-claws"))
	require.Equal(t, uint16(4), c.Flat("ring-forest"))
	return c
}

const (
	flatCrown  = uint16(0)
	flatClaws  = uint16(3)
	flatForest = uint16(4)
)

func appearanceUnlocks(c *fakeClient) []uint64 {
	var out []uint64
	for _, u := range c.unlocks {
		if u.key == "unlock.appearance" {
			out = append(out, u.skillID)
		}
	}
	return out
}

// The join is the catch-up caller: a ticket that already meets a condition
// earns the item on the join tick.
func TestGrant_JoinCatchesUp(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(gatedLooks(t))
	c := newFakeClient()

	p := joinWithBloodlineCount(t, s, g, c, "Heir", persist.CharacterState{}, nil, 1)

	assert.Equal(t, []uint16{flatClaws}, p.AppearanceOwned())
	assert.Equal(t, []uint64{uint64(flatClaws)}, appearanceUnlocks(c), "the earned item is announced")
}

// A level-up earns a minLevel item once: the grant is idempotent.
func TestGrant_LevelUpGrantsOnce(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(gatedLooks(t))
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	require.Empty(t, p.AppearanceOwned())

	p.AddExperience(100000)
	require.GreaterOrEqual(t, p.Progression().Level, uint32(3))
	s.Update(0)
	s.Update(0)
	p.AddExperience(100000)
	s.Update(0)

	assert.Equal(t, []uint16{flatForest}, p.AppearanceOwned())
	assert.Equal(t, []uint64{uint64(flatForest)}, appearanceUnlocks(c), "one toast, not one per tick")
}

// A skill raise earns a skill_level item, and a respec that lowers the skill
// again revokes nothing (D16).
func TestGrant_SkillRaiseGrants_ARespecRevokesNothing(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(gatedLooks(t))
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	thorns, _ := lookWorld{}.GetByName("Thorns")
	p.SkillComponent().Discover(testThorns)
	s.Update(0)
	require.Empty(t, p.AppearanceOwned(), "level 1 is not level 2")
	require.True(t, p.SkillComponent().RaiseSkillLevel(thorns))
	s.Update(0)
	require.Equal(t, []uint16{flatCrown}, p.AppearanceOwned())

	p.SkillComponent().ResetSkillLevels()
	s.Update(0)
	assert.Equal(t, []uint16{flatCrown}, p.AppearanceOwned(), "a respec revokes nothing")
}

// The owned set at join is what /select read (starter rows are never stored):
// the ticket's ids become flat indices, and owning is no news.
func TestJoin_WearsTheTicketsOwnedSet(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(gatedLooks(t))
	c := newFakeClient()
	sp := spectatorFor(c)
	g.AddEntity(sp)
	nextTestAccountID++
	token, err := s.tickets.(*auth.TicketStore).Mint(auth.Ticket{
		AccountID: nextTestAccountID, CharacterID: nextTestAccountID, Name: "Owner", Avatar: "default",
		Faction: "aligned", AppearanceOwned: []string{"ring-forest", "crown", "retired-item"},
	})
	require.NoError(t, err)
	c.joins = append(c.joins, &model.Join{PlayTicket: token})
	s.Update(0)
	p := g.players[len(g.players)-1]

	assert.Equal(t, []uint16{flatCrown, flatForest}, p.AppearanceOwned(), "sorted; an unknown id is dropped")
	assert.Empty(t, appearanceUnlocks(c), "an item owned before the join is no news")
}

// Both validators read the owned set: an owned locked item is worn, an
// unowned one refused (C4 shipped them against the starter set).
func TestSelectAppearance_ReadsTheOwnedSet(t *testing.T) {
	s, g := newStateFixture(t)
	looks := gatedLooks(t)
	s.SetAppearance(looks)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	def := looks.Wire(appearance.SlotPortrait, "default")
	forest, claws := looks.Wire(appearance.SlotRing, "ring-forest"), looks.Wire(appearance.SlotRing, "ring-claws")
	p.SetAppearanceOwned([]uint16{flatForest})

	c.looks = append(c.looks, &model.SelectAppearance{Portrait: def, Ring: claws})
	s.Update(0)
	_, ring := p.Look()
	assert.NotEqual(t, claws, ring, "a locked ring is refused")

	c.looks = append(c.looks, &model.SelectAppearance{Portrait: def, Ring: forest})
	s.Update(0)
	assertWears(t, p, def, forest)
}

// A grant forces a save, and the snapshot names every earned item with its
// scope: the store writes them there (L1).
func TestGrant_ForcesASaveNamingTheScope(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(gatedLooks(t))
	saves := withSaves(s)
	c := newFakeClient()
	p := joinWithBloodlineCount(t, s, g, c, "Heir", persist.CharacterState{}, nil, 1)
	s.Update(0)
	before := len(saves.saved)

	p.AddExperience(100000)
	s.Update(0)

	require.Greater(t, len(saves.saved), before, "a grant saves at once")
	assert.ElementsMatch(t, []persist.AppearanceGrant{
		{Item: "ring-claws", Scope: "bloodline"},
		{Item: "ring-forest", Scope: "character"},
	}, saves.last(t).AppearanceGrants)
}

// L7: the owned set rides every rebuild of the player struct.
func TestOwnedSet_RidesTheFourDoors(t *testing.T) {
	owned := []uint16{flatCrown, flatForest}
	t.Run("respawn", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := joinPlayer(t, s, g, c, "Alice")
		p.SetAppearanceOwned(owned)
		kill(t, s, p)
		c.respawns = append(c.respawns, &model.Respawn{})
		s.Update(0)
		require.Len(t, g.players, 2)
		assert.Equal(t, owned, g.players[1].AppearanceOwned())
	})
	t.Run("reconnect", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := joinPlayer(t, s, g, c, "Alice")
		p.SetAppearanceOwned(owned)
		token := s.tokenByClient[c.UUID()]
		g.RemoveEntity(p.Basic())
		reconnect(t, s, g, newFakeClient(), "ignored-name", token)
		require.Len(t, g.players, 2)
		assert.Equal(t, owned, g.players[1].AppearanceOwned())
	})
	t.Run("reconnect while dead, then respawn", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := joinPlayer(t, s, g, c, "Alice")
		p.SetAppearanceOwned(owned)
		token := s.tokenByClient[c.UUID()]
		kill(t, s, p)
		g.RemoveEntity(g.livingSpectators()[0].Basic())
		c2 := newFakeClient()
		reconnect(t, s, g, c2, "ignored-name", token)
		c2.respawns = append(c2.respawns, &model.Respawn{})
		s.Update(0)
		require.Len(t, g.players, 2)
		assert.Equal(t, owned, g.players[1].AppearanceOwned())
	})
	t.Run("revive", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := joinPlayer(t, s, g, c, "Alice")
		p.SetAppearanceOwned(owned)
		kill(t, s, p)
		require.True(t, s.ReviveAtCorpse(g.livingCorpses()[0].Basic().ID(), 0.3))
		require.Len(t, g.players, 2)
		assert.Equal(t, owned, g.players[1].AppearanceOwned())
	})
}

// D21a: a sacrifice earns the count-based items its new ascension count
// passes, and hands them to the transaction. Character items stay out (they
// would land on the life that ends), and an owned item is not granted twice.
func TestRequestAscensionCarriesTheCountBasedItems(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)
	s.SetAppearance(gatedLooks(t))
	require.Zero(t, p.BloodlineAscensions(), "a first life")

	require.True(t, s.RequestAscension(p, ""))
	require.Len(t, ascensions.requested, 1)
	assert.Equal(t, []persist.AppearanceGrant{{Item: "ring-claws", Scope: "bloodline"}},
		ascensions.requested[0].Appearance, "count 0 + this sacrifice = 1 earns the bloodline ring")
}

func TestRequestAscensionSkipsWhatIsOwned(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)
	s.SetAppearance(gatedLooks(t))
	p.SetAppearanceOwned([]uint16{flatClaws})

	require.True(t, s.RequestAscension(p, ""))
	assert.Empty(t, ascensions.requested[0].Appearance)
}

// Found at C5 (PO 2026-10-21: fold in): the bloodline and the account rode
// only the fresh join, so after a death the stone's rows, every
// bloodline_ascensions gate and the memorial read an empty slot. They ride
// the four doors like the look and the owned set (L7).
func TestBloodlineAndAccount_RideTheFourDoors(t *testing.T) {
	unlocks := []string{"FrostShield"}
	join := func(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient) model.PlayerEntity {
		p := joinWithBloodlineCount(t, s, g, c, "Heir", persist.CharacterState{}, unlocks, 2)
		require.Equal(t, 2, p.BloodlineAscensions())
		require.NotZero(t, p.AccountID())
		return p
	}
	carries := func(t *testing.T, before, after model.PlayerEntity) {
		assert.Equal(t, unlocks, after.BloodlineUnlocks(), "the slot's spent unlocks")
		assert.Equal(t, 2, after.BloodlineAscensions(), "the slot's ascension count")
		assert.Equal(t, before.AccountID(), after.AccountID(), "the account")
	}
	t.Run("respawn", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := join(t, s, g, c)
		kill(t, s, p)
		c.respawns = append(c.respawns, &model.Respawn{})
		s.Update(0)
		require.Len(t, g.players, 2)
		carries(t, p, g.players[1])
	})
	t.Run("reconnect", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := join(t, s, g, c)
		token := s.tokenByClient[c.UUID()]
		g.RemoveEntity(p.Basic())
		reconnect(t, s, g, newFakeClient(), "ignored-name", token)
		require.Len(t, g.players, 2)
		carries(t, p, g.players[1])
	})
	t.Run("reconnect while dead, then respawn", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := join(t, s, g, c)
		token := s.tokenByClient[c.UUID()]
		kill(t, s, p)
		g.RemoveEntity(g.livingSpectators()[0].Basic())
		c2 := newFakeClient()
		reconnect(t, s, g, c2, "ignored-name", token)
		c2.respawns = append(c2.respawns, &model.Respawn{})
		s.Update(0)
		require.Len(t, g.players, 2)
		carries(t, p, g.players[1])
	})
	t.Run("revive", func(t *testing.T) {
		s, g := newStateFixture(t)
		c := newFakeClient()
		p := join(t, s, g, c)
		kill(t, s, p)
		require.True(t, s.ReviveAtCorpse(g.livingCorpses()[0].Basic().ID(), 0.3))
		require.Len(t, g.players, 2)
		carries(t, p, g.players[1])
	})
}
