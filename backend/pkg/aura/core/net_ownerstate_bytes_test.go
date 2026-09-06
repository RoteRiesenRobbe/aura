package core

// The profiling proof plan-server-performance.md chunk 3 was built to produce:
// actual encoded bytes on the wire, before vs after, over a realistic
// steady-state run. "Before" is reproduced exactly rather than approximated —
// SkipOwnerState/SkipConversationTree forced false on every tick is
// byte-for-byte the old unconditional MarshalFlatbuf path, because chunk 3
// added conditionals around the existing encode calls without touching what
// they build (see gamestate.go's MarshalFlatbuf). "After" is the real
// NetSystem gate, unmodified.
//
// Run with: go test ./pkg/aura/core/... -run TestOwnerStateBytesProof -v
// to see the numbers this test asserts against.

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// steadyStateTicks is 5 seconds at 30 Hz — long enough to average out the
// join tick's one-time cost, short enough to run instantly in CI.
const steadyStateTicks = 150

// beforeSend reproduces the pre-chunk-3 behaviour: everything built and sent
// every tick, unconditionally.
func beforeSend(p model.PlayerEntity, tick uint64) []byte {
	var entities []model.Entity
	for c := range p.Viewport().Collisions() {
		if ud := c.Shape().UserData; ud != nil {
			entities = append(entities, ud.(model.Entity))
		}
	}
	gs := codec.CharacterGameState{Tick: tick, Player: p, Entities: entities}
	// SkipOwnerState/SkipConversationTree left at their zero value (false) —
	// the documented "safe default", and exactly the old always-send shape.
	builder := flatbuffers.NewBuilder(64)
	msg := codec.CharacterGameStateMessageMarshalFlatbuf(builder, &gs)
	builder.Finish(msg)
	return builder.FinishedBytes()
}

// TestOwnerStateBytesProof_SteadyStateSpellbookAndQuest is the chunk's
// headline number: 784 B/tick/player of owner-only state removed once nothing
// is changing (plan-server-performance.md chunk 3's own measurement target).
func TestOwnerStateBytesProof_SteadyStateSpellbookAndQuest(t *testing.T) {
	p, _ := newWirePlayer(t)
	sc := p.SkillComponent()
	sc.Discover(1)
	sc.EquipAura(0, wireAuraDef, 1)
	require.NoError(t, p.QuestLedger().Accept("q1"))

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	var beforeTotal, afterTotal int
	for tick := uint64(1); tick <= steadyStateTicks; tick++ {
		beforeTotal += len(beforeSend(p, tick))

		n.game.Tick = tick
		afterTotal += len(send(n, p))
	}

	beforeAvg := float64(beforeTotal) / steadyStateTicks
	afterAvg := float64(afterTotal) / steadyStateTicks
	t.Logf("steady state, %d ticks, spellbook+quest, no mutation:", steadyStateTicks)
	t.Logf("  BEFORE (always send): %d bytes total, %.1f B/tick/player", beforeTotal, beforeAvg)
	t.Logf("  AFTER  (send-on-change): %d bytes total, %.1f B/tick/player", afterTotal, afterAvg)
	t.Logf("  saved: %d bytes (%.1f%%), %.1f B/tick/player", beforeTotal-afterTotal,
		100*float64(beforeTotal-afterTotal)/float64(beforeTotal), beforeAvg-afterAvg)

	require.Greater(t, beforeTotal, afterTotal, "the gate must actually reduce steady-state bytes")
	// A generous floor, not a tight pin: the exact byte count is one accepted
	// quest + one discovered skill away from the doc's 784 B measurement, and
	// is not the contract — the DIRECTION and the ORDER OF MAGNITUDE are.
	assert.Greater(t, beforeTotal-afterTotal, 50*steadyStateTicks,
		"the saved total should be a real per-tick reduction, not noise")
}

// TestOwnerStateBytesProof_ConversationHeldOpen is the doc's standout number:
// the conversation tree re-sent 30×/s while a dialogue is open, 4 264 B/tick
// in the doc's own measurement — versus once, on open, under chunk 3.
func TestOwnerStateBytesProof_ConversationHeldOpen(t *testing.T) {
	p, _ := newWirePlayer(t)
	p.SetConversingWith(42)
	p.SetConversation(&model.Conversation{
		EntityID: 42, ActorName: "Actor", EntryNode: "n1",
		Nodes: []model.ConversationNode{{
			ID:    "n1",
			Lines: []string{"A line of dialogue long enough to look like real content."},
			Options: []model.ConversationOption{
				{OptionIndex: 0, GrantIndex: model.ConversationNoGrant, Text: "Tell me more", Next: "n2"},
				{OptionIndex: 1, GrantIndex: model.ConversationNoGrant, Text: "Goodbye"},
			},
		}},
	})

	n := &NetSystem{game: &game{Tick: 1}}
	n.players = []model.PlayerEntity{p}

	var beforeTotal, afterTotal int
	for tick := uint64(1); tick <= steadyStateTicks; tick++ {
		beforeTotal += len(beforeSend(p, tick))

		n.game.Tick = tick
		afterTotal += len(send(n, p))
	}

	t.Logf("steady state, %d ticks, conversation held open, never advanced:", steadyStateTicks)
	t.Logf("  BEFORE (always resend tree): %d bytes total, %.1f B/tick/player", beforeTotal, float64(beforeTotal)/steadyStateTicks)
	t.Logf("  AFTER  (send tree on open only): %d bytes total, %.1f B/tick/player", afterTotal, float64(afterTotal)/steadyStateTicks)
	t.Logf("  saved: %d bytes (%.1f%%)", beforeTotal-afterTotal, 100*float64(beforeTotal-afterTotal)/float64(beforeTotal))

	require.Greater(t, beforeTotal, afterTotal)
	// The tree only rides tick 1 under the gate; every later tick pays only
	// the 8-byte scalar. A generous floor (not the doc's own measured ~97%,
	// since this fixture's baseline GameState — one entity-free character,
	// no spellbook, no quest — has less fixed overhead diluting the tree's
	// share than a real loaded client does).
	assert.Greater(t, float64(beforeTotal-afterTotal)/float64(beforeTotal), 0.4,
		"holding a conversation open should save a substantial share of its steady-state bytes")
}
