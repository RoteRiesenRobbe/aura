package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// plan-region-identity.md R2: the arrival check, on a REAL player (the
// area-effects trap: a system whose actor interface matched nothing compiled
// and did nothing).

var reachFarm = map[string][]world.PlacedRegion{
	"farm": {{
		Points: []world.Point{{X: 100, Y: 100}, {X: 110, Y: 100}, {X: 110, Y: 110}, {X: 100, Y: 110}},
		Bounds: world.BoundingBox{MinX: 100, MinY: 100, MaxX: 110, MaxY: 110},
	}},
}

func reachFixture(t *testing.T) (*QuestSystem, model.PlayerEntity) {
	t.Helper()
	s, g := newStateFixture(t)
	q := &quests.QuestDefinition{
		ID: "road", Title: "Road",
		Stages: []*quests.Stage{
			{ID: "road", Journal: "j", Objectives: []quests.Objective{{Kind: quests.ObjectiveReach, Region: "farm", TargetName: "Farm", Count: 1}}, Next: "meet"},
			{ID: "meet", Journal: "j"},
			{ID: "done", Journal: "j"},
		},
	}
	q.NoteDialogueEdgeFrom("meet")
	r, err := quests.NewRegistry(q)
	require.NoError(t, err)
	g.questReg = r
	p := joinPlayer(t, s, g, newFakeClient(), "Alice")

	qs := NewQuestSystem(reachFarm)
	qs.AddPlayer(p)
	return qs, p
}

func stage(p model.PlayerEntity) string {
	path, _, _ := p.QuestLedger().Progress("road")
	return path[len(path)-1]
}

func TestQuestSystem_ReachAdvancesOnArrival(t *testing.T) {
	qs, p := reachFixture(t)
	require.NoError(t, p.QuestLedger().Accept("road"))

	p.SetPosition(phy.Vec2f{X: 50, Y: 50})
	qs.Update(0)
	assert.Equal(t, "road", stage(p), "outside the farm")

	p.SetPosition(phy.Vec2f{X: 105, Y: 105})
	qs.Update(0)
	assert.Equal(t, "meet", stage(p), "standing inside advances the stage")
}

// D5: already standing there when the stage starts counts, on the next tick.
func TestQuestSystem_ReachAlreadyInsideAtAccept(t *testing.T) {
	qs, p := reachFixture(t)
	p.SetPosition(phy.Vec2f{X: 105, Y: 105})
	require.NoError(t, p.QuestLedger().Accept("road"))
	qs.Update(0)
	assert.Equal(t, "meet", stage(p))
}

// D8: a flyer passing over the farm does not arrive.
func TestQuestSystem_ReachIgnoresAFlyer(t *testing.T) {
	qs, p := reachFixture(t)
	require.NoError(t, p.QuestLedger().Accept("road"))
	p.SetPosition(phy.Vec2f{X: 105, Y: 105})
	p.BeginFlight(nil, "a", "b", phy.Vec2f{X: 500, Y: 500}, 0)
	require.True(t, p.Flying())
	qs.Update(0)
	assert.Equal(t, "road", stage(p))
}
