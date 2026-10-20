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
