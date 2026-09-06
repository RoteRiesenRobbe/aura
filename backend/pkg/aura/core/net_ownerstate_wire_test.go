package core

// The wire-level half of chunk 3 (plan-server-performance.md): does the gate
// in net_ownerstate_test.go actually change what goes out over the socket for
// a REAL player (real SkillComponent, real quest Ledger, real Conversation),
// end to end through NetSystem.playerSendState — not just the pure counters.
//
// Reuses the flight_test.go fixture shape (flightFakeGame-style minimal
// model.Game, player.New for a real player) rather than inventing another one.

import (
	"fmt"
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type wireFakeGame struct {
	model.Game
	cfg cfg.GameConfig
	reg skills.Registry
	qr  quests.Registry
}

func (g *wireFakeGame) Config() *cfg.GameConfig  { return &g.cfg }
func (g *wireFakeGame) Skills() skills.Registry  { return g.reg }
func (g *wireFakeGame) Quests() quests.Registry  { return g.qr }
func (g *wireFakeGame) Ticks() uint64            { return 0 }

type wireFakeClient struct {
	model.Client
	id   uuid.UUID
	sent [][]byte
}

func (c *wireFakeClient) UUID() uuid.UUID { return c.id }
func (c *wireFakeClient) SendMessage(msg []byte) error {
	c.sent = append(c.sent, msg)
	return nil
}

// SendJournal absorbs the accept/advance/complete announce quests.Ledger
// fires through the player (ledger.go's enter → player.announceJournal) —
// garnish these tests don't assert on, but a nil Client method panics.
func (c *wireFakeClient) SendJournal(string) error { return nil }

type wireRegistry map[skills.SkillID]*skills.SkillDefinition

func (r wireRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	if d, ok := r[id]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("no skill %d", id)
}
func (r wireRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	for _, d := range r {
		if d.Name == name {
			return d, nil
		}
	}
	return nil, fmt.Errorf("no skill %q", name)
}
func (r wireRegistry) All() []*skills.SkillDefinition {
	out := make([]*skills.SkillDefinition, 0, len(r))
	for _, d := range r {
		out = append(out, d)
	}
	return out
}

type wireQuestRegistry struct{ q *quests.QuestDefinition }

func (r wireQuestRegistry) Get(id string) (*quests.QuestDefinition, error) {
	if r.q == nil || id != r.q.ID {
		return nil, fmt.Errorf("no quest %q", id)
	}
	return r.q, nil
}
func (r wireQuestRegistry) All() []*quests.QuestDefinition {
	if r.q == nil {
		return nil
	}
	return []*quests.QuestDefinition{r.q}
}

// wireAuraDef is the one catalog skill every wire test player's registry
// carries — a package var so a test can equip it without threading it
// through newWirePlayer's return values.
var wireAuraDef = &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

// wireQuestTargetSpecies is the species the kill-quest fixture below counts.
const wireQuestTargetSpecies = mobs.MobID(7)

// newWirePlayerWithKillQuest is newWirePlayer with a quest whose first stage
// COUNTS KILLS — the shape needed to move an objective counter without moving
// the stage, which is the case DisplayRevision exists for. Threshold 8 so one
// credited kill advances the counter and satisfies nothing.
func newWirePlayerWithKillQuest(t *testing.T) (model.PlayerEntity, *wireFakeClient) {
	t.Helper()
	quest := &quests.QuestDefinition{
		ID:    "kill1",
		Title: "Kill Quest",
		Stages: []*quests.Stage{{
			ID:      "hunt",
			Tracker: "{n}/{m} slain",
			Next:    "done",
			Objectives: []quests.Objective{{
				Kind: quests.ObjectiveKill, Target: wireQuestTargetSpecies,
				TargetName: "Wolf", Count: 8,
			}},
		}, {ID: "done"}},
	}

	fg := &wireFakeGame{reg: wireRegistry{1: wireAuraDef}, qr: wireQuestRegistry{q: quest}}
	fg.cfg.PlayerConfig = cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100}

	c := &wireFakeClient{id: uuid.New()}
	return player.New(fg, c, "wire-kill"), c
}

// newWirePlayer builds a real, joined-equivalent player: a real
// skills.SkillComponent (one equippable aura) and a real quests.Ledger (one
// acceptable quest), exactly the two data sources the owner-only block reads.
func newWirePlayer(t *testing.T) (model.PlayerEntity, *wireFakeClient) {
	t.Helper()
	quest := &quests.QuestDefinition{ID: "q1", Title: "Test Quest", Stages: []*quests.Stage{{ID: "s1"}}}

	fg := &wireFakeGame{reg: wireRegistry{1: wireAuraDef}, qr: wireQuestRegistry{q: quest}}
	fg.cfg.PlayerConfig = cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100}

	c := &wireFakeClient{id: uuid.New()}
	p := player.New(fg, c, "wire-test")
	return p, c
}

// decodeGameState pulls the GameState body out of a finished ServerMessage.
func decodeGameState(t *testing.T, payload []byte) *AuraApi.GameState {
	t.Helper()
	sm := AuraApi.GetRootAsServerMessage(payload, 0)
	require.Equal(t, AuraApi.ServerMessageBodyGameState, sm.BodyType())
	body := new(flatbuffers.Table)
	require.True(t, sm.Body(body))
	gs := &AuraApi.GameState{}
	gs.Init(body.Bytes, body.Pos)
	return gs
}

func send(n *NetSystem, p model.PlayerEntity) []byte {
	c := p.Client().(*wireFakeClient)
	before := len(c.sent)
	n.playerSendState(p, codec.CharacterGameState{Tick: n.game.Tick})
	return c.sent[before]
}

// The core claim of chunk 3: a steady tick with nothing changed omits the
// whole owner-only block, and a real mutation (equip) brings it straight
// back — on the SAME tick, not delayed to a heartbeat.
func TestNetSystem_OwnerStateBlock_SendOnChangeNotEveryTick(t *testing.T) {
	p, _ := newWirePlayer(t)
	// Discover + equip the one catalog skill, so the spellbook vector has real
	// content to gate (an undiscovered spellbook is empty regardless of the
	// gate, which would make this test pass for the wrong reason).
	sc0 := p.SkillComponent()
	sc0.Discover(1)
	sc0.EquipAura(0, wireAuraDef, 1)

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	first := decodeGameState(t, send(n, p))
	assert.Greater(t, first.SpellbookLength(), 0, "first send must carry the spellbook")

	n.game.Tick = 2
	steady := decodeGameState(t, send(n, p))
	assert.Equal(t, 0, steady.SpellbookLength(), "an unchanged tick must omit the spellbook entirely")
	assert.Equal(t, 0, steady.QuestProgressLength(), "and the quest ledger")

	// Real mutation: spend a skill point (RaiseSkillLevel), the real player
	// action behind equip.go's handleSpendSkillPoint — it bumps
	// SkillComponent.Revision() via setSkillLevel (skills/component.go).
	sc := p.SkillComponent()
	require.True(t, sc.RaiseSkillLevel(wireAuraDef))
	n.game.Tick = 3
	afterMutation := decodeGameState(t, send(n, p))
	assert.Greater(t, afterMutation.SpellbookLength(), 0,
		"a real equip/level change must bring the block back on the SAME tick, not delayed")
}

// L1 (plan-server-performance.md chunk 3 §L1/D3): the conversation's close
// signal must survive independently of the tree's change-only gating —
// open (tree + id), unchanged (id only, tree omitted), close (id=0).
func TestNetSystem_Conversation_CloseSignalSurvivesTreeGating(t *testing.T) {
	p, _ := newWirePlayer(t)
	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	p.SetConversingWith(42)
	p.SetConversation(&model.Conversation{EntityID: 42, ActorName: "Actor", EntryNode: "n1",
		Nodes: []model.ConversationNode{{ID: "n1", Lines: []string{"hi"}}}})
	opened := decodeGameState(t, send(n, p))
	require.Equal(t, uint64(42), opened.ConversationEntityId())
	tree := &AuraApi.Conversation{}
	require.NotNil(t, opened.Conversation(tree), "the fresh tree must ride the open tick")

	n.game.Tick = 2
	unchanged := decodeGameState(t, send(n, p))
	assert.Equal(t, uint64(42), unchanged.ConversationEntityId(),
		"the id must keep riding every tick — it is the ONLY close signal now")
	assert.Nil(t, unchanged.Conversation(&AuraApi.Conversation{}),
		"an unchanged tree must be omitted, unlike the old contract")

	p.SetConversingWith(0)
	n.game.Tick = 3
	closed := decodeGameState(t, send(n, p))
	assert.Equal(t, uint64(0), closed.ConversationEntityId(), "closing must read as id 0 immediately")
}

// ⭐ The regression leg for the review's finding 1: the client's "did this tick
// carry the owner block" signal must be the EXPLICIT owner_state flag, never
// inferred from a field's emptiness. A fresh character's spellbook is
// legitimately empty (initializePlayerSkills starts it bare; the level-1
// milestones fill it only when content is loaded), so an emptiness check reads
// a genuine send as "not sent" and silently discards the whole block —
// leaving a new player's journal and loadout bars blank until their first
// unlock.
func TestNetSystem_OwnerState_FlagIsExplicitNotInferredFromEmptiness(t *testing.T) {
	p, _ := newWirePlayer(t)
	// Deliberately NO Discover/EquipAura: an empty spellbook is exactly the
	// state the old inference got wrong. Give it a quest so the block has real
	// content that would be lost.
	require.NoError(t, p.QuestLedger().Accept("q1"))

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	first := decodeGameState(t, send(n, p))
	require.Equal(t, 0, first.SpellbookLength(),
		"precondition: this character's spellbook really is empty")
	assert.True(t, first.OwnerState(),
		"the block WAS sent, and only the explicit flag can say so")
	assert.Greater(t, first.QuestProgressLength(), 0,
		"...and it carried real quest content an emptiness check would have dropped")

	n.game.Tick = 2
	steady := decodeGameState(t, send(n, p))
	assert.False(t, steady.OwnerState(), "an unchanged tick clears the flag")
	assert.Equal(t, 0, steady.QuestProgressLength(), "and omits the block")
}

// ⭐ The regression leg for the review's finding 3: an objective counter moving
// ("3/8 slain" → "4/8") must resend the journal on the SAME tick. It rides
// DisplayRevision, because the save-side Revision deliberately ignores counter
// progress (a database write per credited kill).
func TestNetSystem_OwnerState_ObjectiveCounterProgressResendsTheJournal(t *testing.T) {
	p, c := newWirePlayerWithKillQuest(t)
	require.NoError(t, p.QuestLedger().Accept("kill1"))

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}
	send(n, p) // first sight drains the initial send

	n.game.Tick = 2
	require.False(t, decodeGameState(t, send(n, p)).OwnerState(), "quiet tick")

	saveRevBefore := p.QuestLedger().Revision()
	p.QuestLedger().NoteKill(wireQuestTargetSpecies)

	n.game.Tick = 3
	after := decodeGameState(t, send(n, p))
	assert.True(t, after.OwnerState(),
		"a credited kill moving the counter must resend the journal at once")
	assert.Equal(t, saveRevBefore, p.QuestLedger().Revision(),
		"...WITHOUT bumping the save-trigger revision — that would write to the DB per kill")
	_ = c
}

// The heartbeat resend leg at the NetSystem level, closing the loop between
// the pure gate test and the real encoder: after ownerStateHeartbeatTicks with
// zero mutation, the block comes back anyway.
func TestNetSystem_OwnerStateBlock_HeartbeatResendsWithNoMutation(t *testing.T) {
	p, _ := newWirePlayer(t)
	sc0 := p.SkillComponent()
	sc0.Discover(1)
	sc0.EquipAura(0, wireAuraDef, 1)

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	send(n, p) // first sight

	n.game.Tick = 1 + ownerStateHeartbeatTicks - 1
	stillSteady := decodeGameState(t, send(n, p))
	assert.Equal(t, 0, stillSteady.SpellbookLength(), "one tick before the heartbeat, still gated")

	n.game.Tick = 1 + ownerStateHeartbeatTicks
	healed := decodeGameState(t, send(n, p))
	assert.Greater(t, healed.SpellbookLength(), 0, "the heartbeat must resend with zero mutation")
}
