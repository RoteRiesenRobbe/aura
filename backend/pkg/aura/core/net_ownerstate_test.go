package core

import (
	"fmt"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// ownerStatePlayer answers only what ownerStateGate (and Remove, for the
// cleanup leg) ask — the rosterPlayer trick from roster_test.go, embedding
// the interface so anything else panics loudly instead of silently reading a
// zero value.
type ownerStatePlayer struct {
	model.PlayerEntity
	basic          ecs.BasicEntity
	client         *ownerStateClient
	level          uint32
	sc             *skills.SkillComponent
	ledger         *quests.Ledger
	conversingWith uint64
}

func (p *ownerStatePlayer) Basic() ecs.BasicEntity                { return p.basic }
func (p *ownerStatePlayer) Client() model.Client                  { return p.client }
func (p *ownerStatePlayer) Progression() model.PlayerProgression  { return model.PlayerProgression{Level: p.level} }
func (p *ownerStatePlayer) SkillComponent() *skills.SkillComponent { return p.sc }
func (p *ownerStatePlayer) QuestLedger() *quests.Ledger           { return p.ledger }
func (p *ownerStatePlayer) ConversingWith() uint64                { return p.conversingWith }

type ownerStateClient struct {
	model.Client
	id uuid.UUID
}

func (c *ownerStateClient) UUID() uuid.UUID { return c.id }

func newOwnerStatePlayer() *ownerStatePlayer {
	return &ownerStatePlayer{
		basic:  ecs.NewBasic(),
		client: &ownerStateClient{id: uuid.New()},
		level:  1,
		sc:     &skills.SkillComponent{},
		ledger: quests.NewLedger(nil),
	}
}

// A never-seen connection always sends both — chunk 3's L2 (a new viewer must
// start dirty), satisfied here for free by the map simply not having a key
// yet: join, respawn and reconnect all mint a fresh Client/UUID, so every one
// of them lands in this branch with no extra bookkeeping at the join sites.
func TestOwnerStateGate_UnknownConnectionSendsBoth(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()

	sendOwner, sendConvTree := n.ownerStateGate(p)

	assert.True(t, sendOwner, "a first-sight connection must get the full owner block")
	assert.True(t, sendConvTree, "and the conversation tree too")
}

// Nothing moved: the second tick against the same state must skip both, which
// is the entire point of the chunk — steady-state ticks cost nothing.
func TestOwnerStateGate_UnchangedSkipsBoth(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p) // first sight

	n.game.Tick = 101
	sendOwner, sendConvTree := n.ownerStateGate(p)

	assert.False(t, sendOwner, "unchanged skill/level/quest state must not resend the owner block")
	assert.False(t, sendConvTree, "and must not resend the conversation tree either")
}

// One leg per mutation site (the plan's own ask): a level-up forces a resend
// even though SkillComponent.Revision() never moves — AvailableSkillPoints is
// a function of level too, and nothing on SkillComponent sees a level change.
func TestOwnerStateGate_LevelUpForcesOwnerState(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p)

	n.game.Tick = 101
	p.level = 2
	sendOwner, sendConvTree := n.ownerStateGate(p)

	assert.True(t, sendOwner, "a level change must force the owner block")
	assert.True(t, sendConvTree, "the conversation tree rides the same force")
}

// Equip/unlock/level-up all bump SkillComponent.Revision() (see the field's
// own doc comment in skills/component.go) — this leg pins that the gate
// actually reacts to it, without needing to drive equip.go/Discover directly.
func TestOwnerStateGate_SkillRevisionChangeForcesOwnerState(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p)

	n.game.Tick = 101
	p.sc.EquipAura(0, &skills.SkillDefinition{ID: 7}, 1) // any mutator that bumps revision

	sendOwner, _ := n.ownerStateGate(p)
	assert.True(t, sendOwner, "an equip (revision bump) must force the owner block")
}

// Quest accept/abandon/advance all bump quests.Ledger.Revision() — same shape
// as the skill leg above, driven through the real Ledger via a one-quest
// stub registry rather than reaching into the unexported counter.
func TestOwnerStateGate_QuestRevisionChangeForcesOwnerState(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	p.ledger = quests.NewLedger(oneQuestRegistry{})
	n.ownerStateGate(p)
	before := p.ledger.Revision()

	n.game.Tick = 101
	require.NoError(t, p.ledger.Accept("q1"))
	require.NotEqual(t, before, p.ledger.Revision(), "Accept must bump the ledger's own revision")

	sendOwner, _ := n.ownerStateGate(p)
	assert.True(t, sendOwner, "a quest-ledger revision bump must force the owner block")
}

// oneQuestRegistry is the smallest quests.Registry that lets Accept() succeed:
// one quest, one stage, no objectives (a pure dialogue milestone).
type oneQuestRegistry struct{}

var testQuest = &quests.QuestDefinition{
	ID:     "q1",
	Title:  "Test Quest",
	Stages: []*quests.Stage{{ID: "s1"}},
}

func (oneQuestRegistry) Get(id string) (*quests.QuestDefinition, error) {
	if id != testQuest.ID {
		return nil, fmt.Errorf("quest %q not found", id)
	}
	return testQuest, nil
}
func (oneQuestRegistry) All() []*quests.QuestDefinition { return []*quests.QuestDefinition{testQuest} }

// The heartbeat (D2): even with nothing dirty, the owner block must
// self-heal after ownerStateHeartbeatTicks — the safety net against a missed
// invalidation the plan calls for by name.
func TestOwnerStateGate_HeartbeatForcesResendWithNoMutation(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p) // first sight, arms the heartbeat at 100+ticks

	n.game.Tick = 100 + ownerStateHeartbeatTicks - 1
	sendOwner, _ := n.ownerStateGate(p)
	assert.False(t, sendOwner, "one tick before the heartbeat, nothing changed, so no resend yet")

	n.game.Tick = 100 + ownerStateHeartbeatTicks
	sendOwner, sendConvTree := n.ownerStateGate(p)
	assert.True(t, sendOwner, "the heartbeat must force a resend with zero mutation")
	assert.True(t, sendConvTree, "the conversation tree rides the owner heartbeat too")
}

// A conversation opening (D3) forces the TREE even when nothing on the
// SkillComponent or the ledger moved — the tree needs fresh content for a
// brand-new partner regardless of revision.
func TestOwnerStateGate_ConversationOpenForcesTreeOnly(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p)

	n.game.Tick = 101
	p.conversingWith = 42
	sendOwner, sendConvTree := n.ownerStateGate(p)

	assert.False(t, sendOwner, "opening a conversation alone must not force the unrelated owner block")
	assert.True(t, sendConvTree, "but must force the tree")
}

// A conversation opening on its own must not push the owner-block heartbeat
// back — otherwise a player who keeps opening conversations could starve the
// safety net indefinitely.
func TestOwnerStateGate_ConversationOpenDoesNotDelayOwnerHeartbeat(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.ownerStateGate(p) // arms heartbeat at 100+ticks

	n.game.Tick = 100 + ownerStateHeartbeatTicks - 1
	p.conversingWith = 42
	n.ownerStateGate(p) // conv-only send; must not touch nextForce

	n.game.Tick = 100 + ownerStateHeartbeatTicks
	sendOwner, _ := n.ownerStateGate(p)
	assert.True(t, sendOwner, "the original heartbeat baseline must still fire on schedule")
}

// Remove must drop the watch entry, or a churn of joins/disconnects leaks one
// map entry per connection forever.
func TestOwnerStateGate_RemoveForgetsTheWatch(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 100}}
	p := newOwnerStatePlayer()
	n.players = []model.PlayerEntity{p}
	n.ownerStateGate(p)
	require.Contains(t, n.ownerState, p.client.UUID())

	n.Remove(p.basic)

	assert.NotContains(t, n.ownerState, p.client.UUID())
}

func TestOwnerStateHeartbeat_IsFivishSeconds(t *testing.T) {
	// [PLACEHOLDER] per chunk 3 D2 — pinned against the tick rate so a change
	// to TicksPerSecond cannot silently retune it.
	assert.Equal(t, uint64(5*constant.TicksPerSecond), ownerStateHeartbeatTicks)
}
