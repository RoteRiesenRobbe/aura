package codec

// GameState.skill_events (plan-skill-vfx.md C1, §12a.1/6): the per-viewer
// concatenation of every visible entity's recorded hits and casts.
//
// The three things this file pins are the three ways the vector could be
// silently wrong: an entity's events dropped, an INVISIBLE entity's events
// shipped, and the own player's own list forgotten (the viewport sensor shares
// the player's collision Group, so a player is never in their own entity set -
// forgetting them would silence every number for the damage they take).

import (
	"testing"

	"github.com/EngoEngine/ecs"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// eventRecorder is a bare model.Entity that carries a fixed event list: the
// vector builder reads nothing else off an entity, so this is the whole
// surface it needs.
type eventRecorder struct {
	model.Entity
	basic  ecs.BasicEntity
	events []model.SkillEvent
}

func (r *eventRecorder) Basic() ecs.BasicEntity          { return r.basic }
func (r *eventRecorder) SkillEvents() []model.SkillEvent { return r.events }

// silentEntity records nothing at all - a prop or a corpse. It must not make
// the vector builder stumble.
type silentEntity struct {
	model.Entity
	basic ecs.BasicEntity
}

func (s *silentEntity) Basic() ecs.BasicEntity { return s.basic }

func decodeSkillEvents(t *testing.T, entities []model.Entity, own model.PlayerEntity) []AuraApi.SkillEvent {
	t.Helper()
	b := flatbuffers.NewBuilder(256)
	events := SkillEventsMarshalFlatbuf(entities, own, b)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSkillEvents(b, events)
	b.Finish(AuraApi.GameStateEnd(b))

	gs := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	out := make([]AuraApi.SkillEvent, gs.SkillEventsLength())
	for i := range out {
		require.True(t, gs.SkillEvents(&out[i], i))
	}
	return out
}

func TestSkillEventsMarshal_NLandingsAreNEvents(t *testing.T) {
	victim := &eventRecorder{basic: ecs.NewBasic(), events: []model.SkillEvent{
		{Source: 7, Victim: 9, SkillID: 141, Amount: 12, Kind: model.HitKindDamage},
		{Source: 8, Victim: 9, SkillID: 59, Amount: 30, Kind: model.HitKindCrit},
		{Source: 8, Victim: 9, SkillID: 3, Kind: model.HitKindImmune},
	}}

	out := decodeSkillEvents(t, []model.Entity{victim}, nil)

	require.Len(t, out, 3, "one landing is one event - the aggregate was the thing being removed")
	assert.Equal(t, uint64(7), out[0].Source())
	assert.Equal(t, uint64(9), out[0].Victim())
	assert.Equal(t, uint16(141), out[0].SkillId())
	assert.Equal(t, uint32(12), out[0].Amount())
	assert.Equal(t, AuraApi.HitKindDamage, out[0].Kind())
	assert.False(t, out[0].Fired())

	assert.Equal(t, AuraApi.HitKindCrit, out[1].Kind(), "order is preserved, index 0 first")
	assert.Equal(t, AuraApi.HitKindImmune, out[2].Kind())
	assert.Zero(t, out[2].Amount(), "an immune hit carries no amount")
}

func TestSkillEventsMarshal_OnlyEntitiesInTheViewerSetContribute(t *testing.T) {
	seen := &eventRecorder{basic: ecs.NewBasic(), events: []model.SkillEvent{
		{Source: 1, Victim: 2, SkillID: 10, Amount: 5},
	}}
	// Recorded events, but NOT in the viewer's entity list: the viewport set
	// IS the filter, so nothing of theirs may reach this client.
	unseen := &eventRecorder{basic: ecs.NewBasic(), events: []model.SkillEvent{
		{Source: 3, Victim: 4, SkillID: 11, Amount: 5},
	}}

	out := decodeSkillEvents(t, []model.Entity{seen}, nil)

	require.Len(t, out, 1)
	assert.Equal(t, uint16(10), out[0].SkillId())
	require.NotEmpty(t, unseen.SkillEvents(), "the out-of-view entity did record one")
}

func TestSkillEventsMarshal_TheOwnPlayerIsIncluded(t *testing.T) {
	own := &ownEventPlayer{events: []model.SkillEvent{
		{Source: 99, Victim: 1, SkillID: 77, Amount: 8, Kind: model.HitKindDamage},
	}}
	other := &eventRecorder{basic: ecs.NewBasic(), events: []model.SkillEvent{
		{Source: 1, Victim: 2, SkillID: 10, Amount: 5},
	}}

	out := decodeSkillEvents(t, []model.Entity{other}, own)

	require.Len(t, out, 2, "the viewport sensor shares the player's Group: own is never in own set")
	assert.Equal(t, uint16(77), out[0].SkillId(), "own's list goes first")
	assert.Equal(t, uint16(10), out[1].SkillId())
}

func TestSkillEventsMarshal_QuietTickCarriesNothing(t *testing.T) {
	out := decodeSkillEvents(t, []model.Entity{&silentEntity{basic: ecs.NewBasic()}}, nil)
	assert.Empty(t, out, "an entity that records nothing costs nothing")
}

func TestSkillEventsMarshal_FiredCarriesNoVictim(t *testing.T) {
	caster := &eventRecorder{basic: ecs.NewBasic(), events: []model.SkillEvent{
		{Source: 5, SkillID: 45, Fired: true},
	}}

	out := decodeSkillEvents(t, []model.Entity{caster}, nil)

	require.Len(t, out, 1)
	assert.True(t, out[0].Fired())
	assert.Zero(t, out[0].Victim())
	assert.Zero(t, out[0].Amount())
}

// The Go constants and the wire enum are two copies of one decision, so they
// are pinned against each other: a renumber on either side would silently
// redraw a heal as a crit.
func TestHitKind_MirrorsTheWireEnum(t *testing.T) {
	assert.Equal(t, AuraApi.HitKindDamage, AuraApi.HitKind(model.HitKindDamage))
	assert.Equal(t, AuraApi.HitKindCrit, AuraApi.HitKind(model.HitKindCrit))
	assert.Equal(t, AuraApi.HitKindHeal, AuraApi.HitKind(model.HitKindHeal))
	assert.Equal(t, AuraApi.HitKindAbsorb, AuraApi.HitKind(model.HitKindAbsorb))
	assert.Equal(t, AuraApi.HitKindImmune, AuraApi.HitKind(model.HitKindImmune))
	assert.Len(t, AuraApi.EnumNamesHitKind, 5, "a new kind needs a model constant too")
}

// ownEventPlayer is the own-player shape the encoder needs: a PlayerEntity that
// answers SkillEvents(). Everything else stays nil, which is the point - the
// vector builder reads exactly one method off the own player.
type ownEventPlayer struct {
	model.PlayerEntity
	events []model.SkillEvent
}

func (p *ownEventPlayer) SkillEvents() []model.SkillEvent { return p.events }
