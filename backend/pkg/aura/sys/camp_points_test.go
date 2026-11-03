package sys

// Campfire points across the connection seams (plan-campfire-traits D3, R22,
// R23). The pool is the discovered-fire count, which the player keeps from
// NoteCampfireState; every way of rebuilding the player (join, respawn,
// reconnect) must hand it the count again, or the pool reads 0 and every bought
// trait reads as debt.

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var campPointsTestHealJSON = []byte(`{"id": 180, "name": "CampHeal", "category": "camp", "maxLevel": 15,
  "campTrait": {"kind": "heal", "perLevel": 1}, "effects": []}`)

var campPointsTestChargesJSON = []byte(`{"id": 181, "name": "CampCharges", "category": "camp", "maxLevel": 5,
  "campTrait": {"kind": "charges", "perLevel": 1}, "effects": []}`)

func withCampTraits(t *testing.T, g *stateFakeGame) {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"harvest.json":      {Data: stateTestHarvestJSON},
		"camp-heal.json":    {Data: campPointsTestHealJSON},
		"camp-charges.json": {Data: campPointsTestChargesJSON},
	}, nil)
	require.NoError(t, err)
	g.skillReg = r
}

func TestCampPoints_FollowTheDiscoveredSetAcrossJoinDeathAndReconnect(t *testing.T) {
	s, g := newStateFixture(t)
	withCampTraits(t, g)
	first, second := twoFires()
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()

	p := joinPlayerWithState(t, s, g, c, "Alice", persist.CharacterState{
		Level:               3,
		DiscoveredCampfires: []string{"spawnpoint-1", "spawnpoint-2"},
		Spellbook:           map[int32]int{180: 1},
	})
	resetTick(p)
	assert.Equal(t, 1, p.AvailableCampPoints(), "join: 2 fires, 1 bought level")

	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2)
	resetTick(g.players[1])
	assert.Equal(t, 1, g.players[1].AvailableCampPoints(), "respawn keeps the pool")

	// Buy the charges trait and fill to the raised cap, so the reconnect has a
	// base+1 count to carry: the stash restores the skill component BEFORE the
	// clamped charge count, or the clamp would read the base cap and drop one.
	charges, err := g.Skills().GetByName("CampCharges")
	require.NoError(t, err)
	require.True(t, g.players[1].SkillComponent().RaiseCampTrait(charges))
	g.players[1].RefillCampCharges()
	raised := g.players[1].CampChargeCap()
	require.Equal(t, raised, g.players[1].CampCharges())

	token := s.tokenByClient[c.UUID()]
	g.RemoveEntity(g.players[1].Basic())
	reconnect(t, s, g, newFakeClient(), "ignored-name", token)
	require.Len(t, g.players, 3)
	resetTick(g.players[2])
	assert.Equal(t, 0, g.players[2].AvailableCampPoints(), "reconnect keeps the pool (2 fires, 2 bought levels)")
	assert.Equal(t, raised, g.players[2].CampCharges(), "the charges trait's extra charge survives the reload")
}

// R22/R23 end to end: an ascension granting a trait seeds it at level 1 through
// the bloodline keys, and that level costs nothing.
func TestCampPoints_ABloodlineGrantIsFree(t *testing.T) {
	s, g := newStateFixture(t)
	withCampTraits(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Heir", persist.CharacterState{}, []string{"CampHeal"})

	assert.Equal(t, 1, p.SkillComponent().SkillLevel(180), "the bloodline grant is a level-1 trait")
	assert.Equal(t, 1, p.CampTraitFloor(180))
	assert.Equal(t, 0, p.SkillComponent().CampSpentPoints(g.Skills(), p.CampTraitFloor))
}
